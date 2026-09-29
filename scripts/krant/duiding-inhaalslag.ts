// Handmatige duiding-inhaalslag (zie lib/krant/duiding-inhaalslag.ts en de
// skill .claude/skills/duiding-inhaalslag). Twee stappen, standaard ALLEEN LEZEN:
//
//   npx tsx scripts/krant/duiding-inhaalslag.ts export --env .env.local [--aantal 20] [--week 2026-W39] [--nieuwste-eerst] [--map <dir>]
//     → <map>/batch-<stempel>.json   (systeemprompt, schema, per artikel de prompt + grondslag-hash)
//     → <map>/uitvoer-<stempel>.json (sjabloon: { "<id>": null, … })
//     Standaardmap: <os.tmpdir()>/trifinity-duiding-inhaalslag — BUITEN de repo:
//     de bestanden bevatten brontekst van derden en horen nooit in git.
//
//   npx tsx scripts/krant/duiding-inhaalslag.ts beoordeel --env .env.local --batch <batch.json> --uitvoer <a.json>[,<b.json>…] [--schrijf --ja]
//     → beoordeelt elke duiding tegen de ACTUELE rij met dezelfde controles als de cron
//     → schrijft alleen met --schrijf --ja, en dan alleen de uitkomst 'geduid'
//     → schrijven weigert tenzij: lib/krant schoon, HEAD in origin/master,
//       batch-versies gelijk aan de code, en de AI-noodstop niet uit
//
// De service-sleutel komt uit het opgegeven env-bestand en wordt nooit gelogd.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse, resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DUIDING_MAX_POGINGEN,
  WACHTEND_ARTIKEL_KOLOMMEN,
  WACHTENDE_STATUSSEN,
  schrijfDuidingUitkomst,
  type WachtendArtikel,
} from '../../lib/krant/duiding'
import { DUIDING_VERSIE } from '../../lib/krant/duiding-schema'
import {
  beoordeelHandmatig,
  bouwInhaalslagBatch,
  geduidVelden,
  INHAALSLAG_VERSIE,
  telOordelen,
  type HandmatigOordeel,
  type InhaalslagBatch,
} from '../../lib/krant/duiding-inhaalslag'
import { amsterdamWeekGrenzen } from '../../lib/krant/weekmeting'
import { parsePlatformStatus } from '../../lib/platform-status'

function arg(naam: string): string | undefined {
  const i = process.argv.indexOf(`--${naam}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const vlag = (naam: string) => process.argv.includes(`--${naam}`)

function stop(melding: string): never {
  console.error(`✗ ${melding}`)
  process.exit(1)
}

function laadEnv(pad: string | undefined) {
  if (!pad) stop('Geef --env <pad naar .env.local> (in de hoofdmap van fin-first).')
  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    const m = regel.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) stop('NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken in het env-bestand.')
  console.log(`→ database: ${new URL(url).host}`)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/**
 * Dezelfde poort als productie: de controles en DUIDING_VERSIE komen uit de
 * lokale checkout. Schrijven mag alleen als die checkout niet afwijkt van wat
 * gedeployd is (security-run 29 sep, 🟡-2).
 */
function eisSchoneCheckout(): string {
  const vuil = git('status', '--porcelain', '--', 'lib/krant')
  if (vuil) stop(`lib/krant heeft lokale wijzigingen — schrijf alleen vanaf een schone checkout:\n${vuil}`)
  try {
    git('fetch', '-q', 'origin', 'master')
  } catch {
    stop('git fetch origin master mislukte — kan niet bewijzen dat deze checkout gelijk is aan productie.')
  }
  try {
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/master')
  } catch {
    stop('HEAD zit niet in origin/master: draai vanaf de gedeployde master, niet vanaf een branch.')
  }
  return git('rev-parse', 'HEAD')
}

/** Staat de AI-noodstop van het platform uit, dan wordt er niet geschreven. */
async function eisNoodstopAan(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'platform_status').maybeSingle()
  if (error) stop(`noodstop niet te lezen: ${error.message}`)
  const raw = data?.value == null ? null : typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
  if (!parsePlatformStatus(raw).killSwitches.ai) stop('De AI-noodstop staat uit (platform_status): er wordt niet geschreven.')
}

/** De wachtrij, met hetzelfde filter als `duidWachtendeArtikelen`. */
function wachtrij(supabase: SupabaseClient) {
  return supabase
    .from('news_articles')
    .select(WACHTEND_ARTIKEL_KOLOMMEN)
    .not('bron_soort', 'is', null)
    .in('duiding_status', [...WACHTENDE_STATUSSEN])
    .lt('duiding_pogingen', DUIDING_MAX_POGINGEN)
}

async function exporteer() {
  const supabase = client()
  const gevraagd = Number(arg('aantal') ?? 20)
  const aantal = Number.isFinite(gevraagd) ? Math.min(Math.max(Math.trunc(gevraagd), 1), 200) : 20
  const map = resolve(arg('map') ?? join(tmpdir(), 'trifinity-duiding-inhaalslag'))
  const week = arg('week')
  let q = wachtrij(supabase)
  if (week) {
    const { van, tot } = amsterdamWeekGrenzen(week)
    q = q.gte('fetched_at', van).lt('fetched_at', tot)
  }
  // Oudste eerst: precies het deel dat de cron (nieuwste eerst) als laatste doet.
  const { data, error } = await q.order('fetched_at', { ascending: !vlag('nieuwste-eerst') }).limit(aantal)
  if (error) stop(`lezen mislukt: ${error.message}`)
  const batch = bouwInhaalslagBatch((data ?? []) as unknown as WachtendArtikel[], new Date())
  mkdirSync(map, { recursive: true })
  const stempel = batch.gemaakt.replace(/[:.]/g, '-')
  const batchPad = join(map, `batch-${stempel}.json`)
  const uitvoerPad = join(map, `uitvoer-${stempel}.json`)
  writeFileSync(batchPad, JSON.stringify(batch, null, 2))
  writeFileSync(uitvoerPad, JSON.stringify(Object.fromEntries(batch.artikelen.map((a) => [a.id, null])), null, 2))
  console.log(`✓ ${batch.artikelen.length} artikelen geëxporteerd (${batch.zonderGrondslag.length} zonder grondslag)`)
  console.log(`  batch:   ${batchPad}`)
  console.log(`  uitvoer: ${uitvoerPad}  ← vul per id een duiding (of laat null)`)
}

/** Voeg deelbestanden samen (één per subagent). Een id dat twee keer gevuld is, stopt de run. */
function leesUitvoer(paden: string[]): Record<string, unknown> {
  const samen: Record<string, unknown> = {}
  for (const pad of paden) {
    const deel = JSON.parse(readFileSync(pad, 'utf8')) as Record<string, unknown>
    for (const [id, waarde] of Object.entries(deel)) {
      if (waarde === null || waarde === undefined) continue
      if (id in samen && samen[id] !== null) stop(`id ${id} is in meer dan één uitvoerbestand gevuld.`)
      samen[id] = waarde
    }
  }
  return samen
}

async function beoordeel() {
  const batchPad = arg('batch')
  const uitvoerArg = arg('uitvoer')
  if (!batchPad || !uitvoerArg) stop('Geef --batch <batch.json> en --uitvoer <uitvoer.json>[,<deel2.json>…].')
  const uitvoerPaden = uitvoerArg.split(',').map((p) => p.trim()).filter(Boolean)
  if (uitvoerPaden.some((p) => !p.endsWith('.json'))) stop('Elk --uitvoer-pad moet op .json eindigen.')
  const batch = JSON.parse(readFileSync(batchPad, 'utf8')) as InhaalslagBatch
  if (batch.versie !== INHAALSLAG_VERSIE) stop(`batch-versie ${batch.versie} ≠ ${INHAALSLAG_VERSIE}: exporteer opnieuw.`)
  if (batch.duidingVersie !== DUIDING_VERSIE) {
    stop(`batch is gemaakt onder DUIDING_VERSIE ${batch.duidingVersie}, deze code is ${DUIDING_VERSIE}: exporteer opnieuw.`)
  }
  const uitvoer = leesUitvoer(uitvoerPaden)
  if (vlag('schrijf') && !vlag('ja')) stop('--schrijf vraagt ook --ja (schrijft naar de database).')
  const schrijven = vlag('schrijf') && vlag('ja')
  const commit = schrijven ? eisSchoneCheckout() : (() => { try { return git('rev-parse', 'HEAD') } catch { return 'onbekend' } })()

  const supabase = client()
  if (schrijven) await eisNoodstopAan(supabase)

  // De actuele rijen, in brokken (IN-lijst, ruim onder max_rows).
  const ids = batch.artikelen.map((a) => a.id)
  const actueel = new Map<string, WachtendArtikel>()
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await wachtrij(supabase).in('id', ids.slice(i, i + 40))
    if (error) stop(`lezen mislukt: ${error.message}`)
    for (const r of (data ?? []) as unknown as WachtendArtikel[]) actueel.set(r.id, r)
  }

  // Alleen ids uit de batch: een id in uitvoer dat niet in de batch staat, wordt genegeerd.
  const oordelen: HandmatigOordeel[] = batch.artikelen.map((a) => beoordeelHandmatig(a, actueel.get(a.id) ?? null, uitvoer[a.id]))
  let geschreven = 0
  let alAfgehandeld = 0
  const schrijffouten: string[] = []
  const nu = new Date().toISOString()
  if (schrijven) {
    for (const o of oordelen) {
      if (o.uitkomst !== 'geduid') continue
      try {
        const rij = actueel.get(o.id)!
        const ok = await schrijfDuidingUitkomst(supabase, o.id, geduidVelden(o), rij.duiding_pogingen + 1, nu)
        if (ok) geschreven++
        else alAfgehandeld++
      } catch (err) {
        // Per rij opvangen: een halve run moet toch een volledig rapport opleveren.
        schrijffouten.push(`${o.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const details = (o: HandmatigOordeel) => {
    if (o.uitkomst === 'afgewezen') return { code: o.code }
    if (o.uitkomst === 'overgeslagen') return { reden: o.reden }
    // Poort en thema's na de controles: bleef de samenvatting staan (groen)
    // of ging hij naar bronkop + link (gedegradeerd), en hoeveel thema's
    // haalden hun citaattoets.
    const d = o.duiding as { samenvatting: string | null; themas: unknown[]; mechanisme: { soort: string } | null; meta: { poort?: unknown; themasGeweigerd?: number } }
    return {
      fout: o.fout,
      poort: d.meta.poort,
      samenvatting: d.samenvatting !== null,
      themas: d.themas.length,
      themasGeweigerd: d.meta.themasGeweigerd ?? 0,
      mechanisme: d.mechanisme?.soort ?? null,
    }
  }
  const rapport = {
    gemaakt: nu,
    commit,
    duidingVersie: DUIDING_VERSIE,
    schrijven,
    telling: telOordelen(oordelen),
    geschreven,
    alAfgehandeld,
    schrijffouten,
    oordelen: oordelen.map((o) => ({ id: o.id, uitkomst: o.uitkomst, ...details(o) })),
  }
  // Uniek rapportpad naast het eerste uitvoerbestand; nooit iets overschrijven.
  const p = parse(uitvoerPaden[0])
  const rapportPad = join(p.dir, `${p.name}.rapport-${schrijven ? 'geschreven-' : ''}${nu.replace(/[:.]/g, '-')}.json`)
  writeFileSync(rapportPad, JSON.stringify(rapport, null, 2), { flag: 'wx' })
  console.log(schrijven ? '✓ GESCHREVEN' : '✓ proefrun (niets geschreven)')
  console.log(JSON.stringify(rapport.telling, null, 2))
  if (schrijven) console.log(`  geschreven: ${geschreven} · intussen door een andere run afgehandeld: ${alAfgehandeld} · schrijffouten: ${schrijffouten.length}`)
  console.log(`  rapport: ${rapportPad}`)
  if (schrijffouten.length > 0) process.exitCode = 1
}

async function main() {
  const opdracht = process.argv[2]
  laadEnv(arg('env'))
  if (opdracht === 'export') await exporteer()
  else if (opdracht === 'beoordeel') await beoordeel()
  else stop('Gebruik: export | beoordeel (zie de kop van dit bestand).')
}

main().catch((err) => stop(err instanceof Error ? err.message : String(err)))
