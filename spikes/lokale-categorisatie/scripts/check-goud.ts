// Valideer een goud-set-bestand tegen dataset/goud-budgets.json (de ECHTE
// toewijsbare budgetlijst van het bron-account, niet de canonieke catalogus —
// dat is het verschil met check-dataset.ts, dat dev-set-v1 tegen de standaard-
// budgetboom valideert).
// Draait op Node 24 (native TS-stripping):
//   npm run check:goud                              → dataset/goud-set.json
//   npm run check:goud -- dataset/goud-set-replay.json  → een ander bestand
//   npm run check:goud:replay                        → kortere variant daarvan
//
// Checks:
//  - het opgegeven bestand en dataset/goud-budgets.json zijn parsebare JSON
//  - unieke ids
//  - geen lege descriptions
//  - elke label_slug bestaat in goud-budgets.json
//  - bron is 'manual' of 'ai'
//  - bedragrichting-sanity: income-label ⇒ positief bedrag; niet-income ⇒ negatief (waarschuwing)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { CategorizeBudgetOption } from '../../../lib/ai/categorize-system-prompt.ts'

const here = dirname(fileURLToPath(import.meta.url))
// CLI-arg 1 (optioneel): pad naar het te valideren goud-set-bestand, relatief
// aan de cwd waarin npm run draait (spikes/lokale-categorisatie). Default:
// dataset/goud-set.json (de "vandaag"-residu-variant).
const setPath = resolve(process.cwd(), process.argv[2] ?? 'dataset/goud-set.json')
const budgetsPath = resolve(here, '../dataset/goud-budgets.json')

type GoudTx = {
  id: string
  description: string
  counterparty_name: string | null
  amount: number
  reference: string | null
  date: string
  label_slug: string
  bron: 'manual' | 'ai'
  edge_case: boolean
}

type GoudSet = { version: string; note: string; transactions: GoudTx[] }

const budgets = JSON.parse(readFileSync(budgetsPath, 'utf-8')) as CategorizeBudgetOption[]
const validSlugs = new Set(budgets.map((o) => o.slug))
const incomeSlugs = new Set(budgets.filter((o) => o.type === 'income').map((o) => o.slug))

const goudSet = JSON.parse(readFileSync(setPath, 'utf-8')) as GoudSet
const txs = goudSet.transactions

const errors: string[] = []
const warnings: string[] = []
const seen = new Set<string>()

for (const tx of txs) {
  if (seen.has(tx.id)) errors.push(`Dubbele id: ${tx.id}`)
  seen.add(tx.id)

  if (!tx.description || tx.description.trim().length === 0) {
    errors.push(`${tx.id}: lege description`)
  }
  if (!tx.label_slug || !validSlugs.has(tx.label_slug)) {
    errors.push(`${tx.id}: onbekende of ontbrekende label_slug "${tx.label_slug}" (niet in goud-budgets.json)`)
  }
  if (tx.bron !== 'manual' && tx.bron !== 'ai') {
    errors.push(`${tx.id}: ongeldige bron "${tx.bron}" (verwacht manual|ai)`)
  }

  if (tx.label_slug && incomeSlugs.has(tx.label_slug) && tx.amount <= 0) {
    warnings.push(`${tx.id}: income-label maar bedrag <= 0 (${tx.amount})`)
  }
  if (tx.label_slug && validSlugs.has(tx.label_slug) && !incomeSlugs.has(tx.label_slug) && tx.amount > 0) {
    warnings.push(`${tx.id}: niet-income-label maar bedrag > 0 (${tx.amount})`)
  }
}

console.log(`Gouden set: ${goudSet.version} — ${txs.length} transacties`)
console.log(`Toewijsbare budgetlijst (goud-budgets.json): ${validSlugs.size} leaf-slugs`)
if (warnings.length) {
  console.log(`\n${warnings.length} waarschuwing(en) (bedragrichting):`)
  for (const w of warnings) console.log('  ⚠ ' + w)
}
if (errors.length) {
  console.error(`\n${errors.length} FOUT(EN):`)
  for (const e of errors) console.error('  ✗ ' + e)
  process.exit(1)
}
console.log('\n✓ Gouden set geldig: alle label_slugs bestaan in goud-budgets.json, ids uniek, geen lege descriptions.')
