// Handmatige categorisatie-inhaalslag (zie lib/krant/categorisatie-inhaalslag.ts
// en de skill .claude/skills/categorisatie-inhaalslag). Standaard ALLEEN LEZEN:
//
//   npx tsx scripts/krant/categorisatie-inhaalslag.ts export --env .env.local [--aantal 40] [--dagen 14] [--map <dir>]
//     → <map>/cat-batch-<stempel>.json   (systeemprompt, schema, per artikel de cron-prompt + invoer-hash)
//     → <map>/cat-uitvoer-<stempel>.json (sjabloon: { "<id>": null, … })
//     Standaardmap: <os.tmpdir()>/trifinity-krant-ochtend — BUITEN de repo.
//
//   npx tsx scripts/krant/categorisatie-inhaalslag.ts beoordeel --env .env.local --batch <b.json> --uitvoer <a.json>[,<b.json>…] [--schrijf --ja]
//     → schema-toets tegen de ACTUELE rij; schrijft alleen met --schrijf --ja,
//       alleen 'gecategoriseerd', en alleen zolang category nog null is.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse, resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CATEGORISATIE_INHAALSLAG_VERSIE,
  CATEGORISATIE_KOLOMMEN,
  beoordeelCategorisatie,
  bouwCategorisatieBatch,
  categorisatieVelden,
  telCategorisatieOordelen,
  type CategorisatieBatch,
  type CategorisatieOordeel,
  type CategorisatieRij,
} from '../../lib/krant/categorisatie-inhaalslag'
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
import { geheimenUitEnv } from '../../lib/krant/geheim-toets'

/** Wat de schrijfactie bepaalt: prompt, schema, invoer en de module zelf. */
const SCHRIJF_BRONNEN = ['lib/news-enrich.ts', 'lib/news-ingest.ts', 'lib/news-html.ts', 'lib/krant', 'scripts/krant']

/** Ongecategoriseerde rijen van de laatste `dagen` dagen. */
function openRijen(supabase: SupabaseClient, dagen: number) {
  const sinds = new Date(Date.now() - dagen * 24 * 60 * 60 * 1000).toISOString()
  return supabase
    .from('news_articles')
    .select(CATEGORISATIE_KOLOMMEN)
    .not('bron_soort', 'is', null)
    .is('category', null)
    .gte('fetched_at', sinds)
}

function getal(naam: string, standaard: number, max: number): number {
  const n = Number(arg(naam) ?? standaard)
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), max) : standaard
}

async function exporteer() {
  const supabase = client()
  const aantal = getal('aantal', 40, 200)
  const dagen = getal('dagen', 14, 60)
  const map = resolve(arg('map') ?? join(tmpdir(), 'trifinity-krant-ochtend'))
  const { data, error } = await openRijen(supabase, dagen).order('fetched_at', { ascending: true }).limit(aantal)
  if (error) stop(`lezen mislukt: ${error.message}`)
  const batch = bouwCategorisatieBatch((data ?? []) as unknown as CategorisatieRij[], new Date())
  mkdirSync(map, { recursive: true })
  const stempel = batch.gemaakt.replace(/[:.]/g, '-')
  const batchPad = join(map, `cat-batch-${stempel}.json`)
  const uitvoerPad = join(map, `cat-uitvoer-${stempel}.json`)
  writeFileSync(batchPad, JSON.stringify(batch, null, 2))
  writeFileSync(uitvoerPad, JSON.stringify(Object.fromEntries(batch.artikelen.map((a) => [a.id, null])), null, 2))
  console.log(`✓ ${batch.artikelen.length} ongecategoriseerde artikelen geëxporteerd (laatste ${dagen} dagen)`)
  console.log(`  batch:   ${batchPad}`)
  console.log(`  uitvoer: ${uitvoerPad}  ← vul per id { category, summary, potentialImpact } (of laat null)`)
}

async function beoordeel() {
  const batchPad = arg('batch')
  const uitvoerArg = arg('uitvoer')
  if (!batchPad || !uitvoerArg) stop('Geef --batch <batch.json> en --uitvoer <uitvoer.json>[,<deel2.json>…].')
  const paden = leesUitvoerPaden(uitvoerArg)
  const batch = JSON.parse(readFileSync(batchPad, 'utf8')) as CategorisatieBatch
  if (batch.soort !== 'categorisatie') stop('Dit is geen categorisatie-batch.')
  if (batch.versie !== CATEGORISATIE_INHAALSLAG_VERSIE) stop(`batch-versie ${batch.versie} ≠ ${CATEGORISATIE_INHAALSLAG_VERSIE}: exporteer opnieuw.`)
  const uitvoer = leesUitvoer(paden)
  if (vlag('schrijf') && !vlag('ja')) stop('--schrijf vraagt ook --ja (schrijft naar de database).')
  const schrijven = vlag('schrijf') && vlag('ja')
  const commit = schrijven ? eisSchoneCheckout(SCHRIJF_BRONNEN) : huidigeCommit()

  const supabase = client()
  if (schrijven) await eisNoodstopAan(supabase)

  const ids = batch.artikelen.map((a) => a.id)
  const actueel = new Map<string, CategorisatieRij>()
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await supabase.from('news_articles').select(CATEGORISATIE_KOLOMMEN).in('id', ids.slice(i, i + 40))
    if (error) stop(`lezen mislukt: ${error.message}`)
    for (const r of (data ?? []) as unknown as CategorisatieRij[]) actueel.set(r.id, r)
  }

  const oordelen: CategorisatieOordeel[] = batch.artikelen.map((a) => beoordeelCategorisatie(a, actueel.get(a.id) ?? null, uitvoer[a.id], geheimenUitEnv(process.env)))
  let geschreven = 0
  let alAfgehandeld = 0
  const schrijffouten: string[] = []
  if (schrijven) {
    for (const o of oordelen) {
      if (o.uitkomst !== 'gecategoriseerd') continue
      try {
        // Geconditioneerd: kreeg de rij intussen een categorie, dan blijft die staan.
        const { data, error } = await supabase
          .from('news_articles')
          .update(categorisatieVelden(o.item))
          .eq('id', o.id)
          .is('category', null)
          .select('id')
        if (error) throw new Error(error.message)
        if ((data?.length ?? 0) > 0) geschreven++
        else alAfgehandeld++
      } catch (err) {
        schrijffouten.push(`${o.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const nu = new Date().toISOString()
  const rapport = {
    gemaakt: nu,
    commit,
    schrijven,
    telling: telCategorisatieOordelen(oordelen),
    geschreven,
    alAfgehandeld,
    schrijffouten,
    oordelen: oordelen.map((o) => ({
      id: o.id,
      uitkomst: o.uitkomst,
      ...(o.uitkomst === 'gecategoriseerd' ? { category: o.item.category } : o.uitkomst === 'afgewezen' ? { code: o.code } : { reden: o.reden }),
    })),
  }
  const p = parse(paden[0])
  const rapportPad = join(p.dir, `${p.name}.rapport-${schrijven ? 'geschreven-' : ''}${nu.replace(/[:.]/g, '-')}.json`)
  writeFileSync(rapportPad, JSON.stringify(rapport, null, 2), { flag: 'wx' })
  console.log(schrijven ? '✓ GESCHREVEN' : '✓ proefrun (niets geschreven)')
  console.log(JSON.stringify(rapport.telling, null, 2))
  if (schrijven) console.log(`  geschreven: ${geschreven} · intussen al gecategoriseerd: ${alAfgehandeld} · schrijffouten: ${schrijffouten.length}`)
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
