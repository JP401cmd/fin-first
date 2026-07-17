// Valideer dataset/dev-set-v1.json tegen de afgeleide budgetlijst.
// Draait op Node 24 (native TS-stripping): `npm run check:dataset`.
//
// Checks:
//  - elke label_slug is null OF bestaat in de afgeleide (leaf-only) budgetlijst
//  - unieke ids
//  - bedragrichting-sanity: income-label ⇒ positief bedrag; niet-income ⇒ negatief
//    (waarschuwing, geen harde fout — bewuste randgevallen mogen afwijken)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildDefaultBudgetOptions } from '../budget-list.ts'
import type { DevSet } from '../types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const datasetPath = resolve(here, '../dataset/dev-set-v1.json')

const options = buildDefaultBudgetOptions()
const validSlugs = new Set(options.map((o) => o.slug))
const incomeSlugs = new Set(options.filter((o) => o.type === 'income').map((o) => o.slug))

const devSet = JSON.parse(readFileSync(datasetPath, 'utf-8')) as DevSet
const txs = devSet.transactions

const errors: string[] = []
const warnings: string[] = []
const seen = new Set<string>()
let edgeCount = 0

for (const tx of txs) {
  if (seen.has(tx.id)) errors.push(`Dubbele id: ${tx.id}`)
  seen.add(tx.id)

  if (tx.label_slug !== null && !validSlugs.has(tx.label_slug)) {
    errors.push(`Onbekende label_slug "${tx.label_slug}" op ${tx.id} (niet in afgeleide budgetlijst)`)
  }
  if (tx.edge_case) edgeCount++

  if (tx.label_slug && incomeSlugs.has(tx.label_slug) && tx.amount <= 0) {
    warnings.push(`${tx.id}: income-label maar bedrag <= 0 (${tx.amount})${tx.edge_case ? ' [edge]' : ''}`)
  }
  if (tx.label_slug && !incomeSlugs.has(tx.label_slug) && tx.amount > 0) {
    warnings.push(`${tx.id}: niet-income-label maar bedrag > 0 (${tx.amount})${tx.edge_case ? ' [edge]' : ''}`)
  }
}

console.log(`Dataset: ${devSet.version} — ${txs.length} transacties, ${edgeCount} randgevallen`)
console.log(`Afgeleide budgetlijst: ${validSlugs.size} toewijsbare leaf-slugs`)
if (warnings.length) {
  console.log(`\n${warnings.length} waarschuwing(en) (bedragrichting — verwacht bij randgevallen):`)
  for (const w of warnings) console.log('  ⚠ ' + w)
}
if (errors.length) {
  console.error(`\n${errors.length} FOUT(EN):`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log('\n✓ Dataset geldig: alle label_slugs bestaan in de afgeleide budgetlijst.')
