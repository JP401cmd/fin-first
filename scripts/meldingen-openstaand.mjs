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

  for (const row of rows) {
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
    verrijkt.push({ ...row, screenshot_url: screenshotUrl })
  }

  process.stdout.write(`${JSON.stringify(verrijkt, null, 2)}\n`)
  console.error(`\n${verrijkt.length} melding(en) gevonden${alles ? '' : ' zonder Notion-kaartje'}.`)
}

main().catch((err) => {
  console.error(`Onverwachte fout: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
