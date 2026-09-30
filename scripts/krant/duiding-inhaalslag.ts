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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse, resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
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
import { geheimenUitEnv } from '../../lib/krant/geheim-toets'
import { amsterdamWeekGrenzen } from '../../lib/krant/weekmeting'
import {
  arg,
  client,
  eisNoodstopAan,
  eisSchoneCheckout,
  huidigeCommit,
  laadEnv,
  leesUitvoer,
  stop,
  uitvoerPaden as leesUitvoerPaden,
  vlag,
} from './cli-gedeeld'

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

async function beoordeel() {
  const batchPad = arg('batch')
  const uitvoerArg = arg('uitvoer')
  if (!batchPad || !uitvoerArg) stop('Geef --batch <batch.json> en --uitvoer <uitvoer.json>[,<deel2.json>…].')
  const uitvoerPaden = leesUitvoerPaden(uitvoerArg)
  const batch = JSON.parse(readFileSync(batchPad, 'utf8')) as InhaalslagBatch
  if (batch.versie !== INHAALSLAG_VERSIE) stop(`batch-versie ${batch.versie} ≠ ${INHAALSLAG_VERSIE}: exporteer opnieuw.`)
  if (batch.duidingVersie !== DUIDING_VERSIE) {
    stop(`batch is gemaakt onder DUIDING_VERSIE ${batch.duidingVersie}, deze code is ${DUIDING_VERSIE}: exporteer opnieuw.`)
  }
  const uitvoer = leesUitvoer(uitvoerPaden)
  if (vlag('schrijf') && !vlag('ja')) stop('--schrijf vraagt ook --ja (schrijft naar de database).')
  const schrijven = vlag('schrijf') && vlag('ja')
  const commit = schrijven ? eisSchoneCheckout() : huidigeCommit()

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
  // Env-waarden als geheim: staat er één letterlijk in een duiding, dan wordt hij afgewezen.
  const geheimen = geheimenUitEnv(process.env)
  const oordelen: HandmatigOordeel[] = batch.artikelen.map((a) => beoordeelHandmatig(a, actueel.get(a.id) ?? null, uitvoer[a.id], geheimen))
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
