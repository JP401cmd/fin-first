#!/usr/bin/env node
/**
 * Leest de meldingen van testgebruikers die nog niet in Notion staan en drukt
 * ze af als JSON — inclusief een kortlevende link naar een eventuele
 * schermafbeelding.
 *
 * Waarom dit script bestaat: de app duwt meldingen zelf naar Notion zodra
 * `notion_api_token` in `app_settings` staat. Zolang dat token er niet is,
 * blijven meldingen keurig in Supabase liggen met status `pending`. Dit script
 * is de handmatige route: Claude Code leest de openstaande meldingen hiermee en
 * maakt de kaartjes via de Notion-MCP aan (zie `.claude/commands/meldingen-
 * doorzetten.md`). De MCP is gereedschap van de agent, niet van de app — de
 * app kan er dus niet bij, en dit script overbrugt dat verschil.
 *
 * De signed URL is de ENIGE reden dat dit een script is en geen SQL-query: de
 * Storage-API kan niet vanuit SQL worden aangeroepen, en de bucket is privé.
 * De TTL is bewust kort (48 uur) — zo'n link is een bearer-credential: wie 'm
 * kopieert haalt het beeld op zonder in te loggen.
 *
 * Gebruik (vanuit de repo-root):
 *   node --env-file=.env.local scripts/meldingen-openstaand.mjs
 *
 * Optioneel:
 *   --limit=25        maximaal aantal meldingen (default 25)
 *   --all             ook meldingen die al een Notion-kaartje hebben
 *   --incl-leeg       ook meldingen zonder inhoud (standaard overgeslagen)
 *
 * Vereist `NEXT_PUBLIC_SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` in de
 * omgeving. Die staan in `.env.local`; commit ze nooit.
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'user-report-screenshots'

// 48 uur — spiegelt SIGNED_URL_TTL_SECONDS in lib/user-reports/notion.ts.
// Verander je er één, verander dan allebei: de link belandt in hetzelfde
// Notion-kaartje, ongeacht welke route hem daar bracht.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 48

// Ondergrens voor "hier staat iets in" — spiegelt MIN_DESCRIPTION_CHARS in
// lib/user-reports/notion.ts. Verander je er één, verander dan allebei: anders
// zet de handmatige route kaartjes door die de app zelf zou overslaan.
// (Dit script is .mjs en kan de TS-module niet importeren; vandaar de kopie —
// zelfde afspraak als bij SIGNED_URL_TTL_SECONDS hierboven.)
const MIN_DESCRIPTION_CHARS = 10
const MIN_DESCRIPTION_LIKE = `${'_'.repeat(MIN_DESCRIPTION_CHARS)}%`

// Letter vóór het volgnummer, per soort — spiegelt SEQUENCE_PREFIX_BY_REPORT.
const SEQUENCE_PREFIX = { bug: 'B', vraag: 'V', aanbeveling: 'W' }

/** Heeft deze melding inhoud? Eén regel, gelijk aan hasMeaningfulDescription. */
function heeftInhoud(description) {
  return (description ?? '').trim().length >= MIN_DESCRIPTION_CHARS
}

/** `B-001` — leeg bij een onbekend volgnummer (dan géén nummer in de titel). */
function volgnummerLabel(type, sequence) {
  if (!Number.isFinite(sequence) || sequence < 1) return ''
  return `${SEQUENCE_PREFIX[type] ?? '?'}-${String(Math.trunc(sequence)).padStart(3, '0')}`
}

// Expliciete kolomlijst — nooit `select('*')` op een tabel met persoonsgegevens.
const COLUMNS =
  'id, user_id, email, report_type, screen_label, description, expected, ' +
  'consent_inzage, route, page_title, user_agent, viewport, app_version, ' +
  'screenshot_path, notion_page_id, notion_sync_status, notion_sync_attempts, created_at'

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'Ontbrekende omgeving: NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Start met: node --env-file=.env.local scripts/meldingen-openstaand.mjs',
    )
    process.exit(1)
  }

  const limit = Number(arg('limit', '25'))
  const alles = process.argv.includes('--all')
  const inclusiefLeeg = process.argv.includes('--incl-leeg')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let query = supabase
    .from('user_reports')
    .select(COLUMNS)
    .order('created_at', { ascending: true })
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 25)

  // Standaard alleen wat nog niet in Notion staat. `notion_page_id IS NULL` is
  // de harde waarheid: de syncstatus kan op 'error' staan terwijl het kaartje
  // wél is aangemaakt (de statusupdate erna kan zijn mislukt).
  if (!alles) query = query.is('notion_page_id', null)

  const { data, error } = await query
  if (error) {
    console.error(`Lezen mislukt: ${error.message} (${error.code ?? 'geen code'})`)
    process.exit(1)
  }

  const rows = data ?? []
  const verrijkt = []
  let leegOvergeslagen = 0

  for (const row of rows) {
    // Meldingen zonder inhoud ("test", "asdf") krijgen geen kaartje: ze kosten
    // triage-tijd zonder ooit iets op te leveren. Ze blijven in Supabase staan —
    // met `--incl-leeg` zie je ze alsnog, mocht je er toch iets mee willen.
    if (!inclusiefLeeg && !heeftInhoud(row.description)) {
      leegOvergeslagen += 1
      continue
    }

    // Volgnummer binnen de eigen soort: het aantal éérdere meldingen mét inhoud,
    // plus één. Bewust afgeleid en niet opgeslagen (dat zou een migratie kosten
    // voor een getal dat al in de rijen zit). `head: true` haalt geen enkele
    // omschrijving op — alleen een telling. Spiegelt reportSequenceNumber().
    const { count, error: countError } = await supabase
      .from('user_reports')
      .select('id', { count: 'exact', head: true })
      .eq('report_type', row.report_type)
      .lt('created_at', row.created_at)
      .like('description', MIN_DESCRIPTION_LIKE)

    if (countError) {
      console.error(`[waarschuwing] volgnummer tellen mislukt voor ${row.id}: ${countError.message}`)
    }
    // Mislukte telling → geen nummer in de titel. Beter een kaartje zonder
    // volgnummer dan een verkeerd nummer of een blijven liggende melding.
    const volgnummer =
      countError || count === null || count === undefined
        ? null
        : volgnummerLabel(row.report_type, count + 1)

    let screenshotUrl = null
    if (row.screenshot_path) {
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL_SECONDS)
      if (signError) {
        console.error(`[waarschuwing] signed URL mislukt voor ${row.id}: ${signError.message}`)
      }
      screenshotUrl = signed?.signedUrl ?? null
    }
    verrijkt.push({ ...row, volgnummer, screenshot_url: screenshotUrl })
  }

  process.stdout.write(`${JSON.stringify(verrijkt, null, 2)}\n`)
  console.error(`\n${verrijkt.length} melding(en) gevonden${alles ? '' : ' zonder Notion-kaartje'}.`)
  if (leegOvergeslagen > 0) {
    console.error(
      `${leegOvergeslagen} melding(en) overgeslagen (geen inhoud, < ${MIN_DESCRIPTION_CHARS} tekens) — zie --incl-leeg.`,
    )
  }
}

main().catch((err) => {
  console.error(`Onverwachte fout: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
