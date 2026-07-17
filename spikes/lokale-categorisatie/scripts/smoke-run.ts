// Deterministische harnas-smoke voor de 'kort'-uitvoervariant, zonder GPU.
//
// WebGPU/Transformers.js draait niet headless in Node, dus deze smoke stubt het
// model (runChat geeft gecanned modeltekst) en draait de ECHTE runner + parser +
// metrics. Zo bevestigen we end-to-end (behalve de GPU-inferentie zelf) dat:
//   - de 'kort'-uitvoer (JSON zónder reasoning-veld) correct parseert;
//   - fences + <think>-preambles worden gestrooken;
//   - een AFGEKAPTE array de complete objecten alsnog bergt (salvage);
//   - de diagnose-vlaggen en metrieken kloppen.
// De echte in-browser SMOKE-run met gemma-3-1b doet de coördinator op de
// draaiende dev-sessie.
//
// Run: node scripts/smoke-run.ts

import { runDataset } from '../runner.ts'
import { findEntry } from '../registry.ts'
import { buildDefaultBudgetOptions } from '../budget-list.ts'
import { suggestMaxNewTokens } from '../prompt.ts'
import type { LoadedModel, GenResult } from '../loader.ts'
import type { DevSet } from '../types.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const devSet = JSON.parse(readFileSync(resolve(here, '../dataset/dev-set-v1.json'), 'utf-8')) as DevSet
const options = buildDefaultBudgetOptions()
const entry = findEntry('gemma-4-e2b')

// Eerste 5 transacties zijn alle 'boodschappen' (t001..t005) → makkelijk te scoren.
const first5 = devSet.transactions.slice(0, 5)

function fakeModel(textFor: () => string): LoadedModel {
  return {
    entry,
    runChat: async (): Promise<GenResult> => ({
      text: textFor(),
      ttftMs: 120,
      wallMs: 400,
      inputTokens: 60,
      generatedTokens: 40,
      decodeTokPerSec: 30,
    }),
  }
}

let failures = 0
function check(name: string, cond: boolean, detail = ''): void {
  const ok = cond ? 'PASS' : 'FAIL'
  if (!cond) failures++
  console.log(`  [${ok}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function scenarioClean(): Promise<void> {
  console.log('Scenario 1 — kort, met fence + <think>-preamble + id-echo (moet 100% valid):')
  const text =
    '<think>Even nadenken over de supermarkten.</think>\n' +
    '```json\n' +
    '[{"id":"t1","budget_slug":"boodschappen","confidence":0.95},' +
    '{"id":"t2","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t3","budget_slug":"boodschappen","confidence":0.88},' +
    '{"id":"t4","budget_slug":"boodschappen","confidence":0.85},' +
    '{"id":"t5","budget_slug":"boodschappen","confidence":0.7}]\n' +
    '```'
  const res = await runDataset({
    model: fakeModel(() => text),
    transactions: first5,
    options,
    batchSize: 5,
    variant: 'compact',
    output: 'kort',
    maxNewTokens: suggestMaxNewTokens(5, 'kort'),
    onProgress: () => {},
  })
  const d = res.batches[0].diagnostics
  check('parseOk', res.batches[0].parseOk)
  check('5 items geparsed', d.itemCount === 5, `${d.itemCount}/5`)
  check('fence gedetecteerd', d.hadFence)
  check('think gedetecteerd', d.hadThink)
  check('niet als afgekapt gemarkeerd', !d.truncated)
  check('geen reasoning nodig (kort) — items geldig', res.txResults.every((t) => t.valid))
  check('alle 5 correct (boodschappen)', res.txResults.every((t) => t.correct))
}

async function scenarioTruncated(): Promise<void> {
  console.log('Scenario 2 — kort, AFGEKAPTE array met ids (salvage 4/5):')
  const text =
    '[{"id":"t1","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t2","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t3","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t4","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t5","budget_slug":"boodsch' // afgekapt midden in het 5e object
  const res = await runDataset({
    model: fakeModel(() => text),
    transactions: first5,
    options,
    batchSize: 5,
    variant: 'compact',
    output: 'kort',
    maxNewTokens: suggestMaxNewTokens(5, 'kort'),
    onProgress: () => {},
  })
  const d = res.batches[0].diagnostics
  check('4 items geborgen (salvage, id-mapped)', d.itemCount === 4, `${d.itemCount}/5`)
  check('als afgekapt gemarkeerd', d.truncated)
  check('salvaged-vlag gezet', d.salvaged)
  check('validiteit 80% (4 van 5 geldig)', res.txResults.filter((t) => t.valid).length === 4)
  check('t5 ongedekt → invalid', !res.txResults[4].valid)
}

async function scenarioIdEcho(): Promise<void> {
  console.log('Scenario 3 — kort, GESCHUDDE ids + ontbrekend id + duplicaat + onbekend id:')
  // Volgorde geschud; t2 krijgt bewust een FOUTE (maar geldige) slug 'vakantie'
  // zodat we bewijzen dat op id gemapt wordt (niet op positie). Eén item zonder
  // id (drop), een duplicaat t4 (eerste telt), en een onbekend t9 (drop).
  const text =
    '[{"id":"t3","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t2","budget_slug":"vakantie","confidence":0.6},' +
    '{"budget_slug":"boodschappen","confidence":0.5},' + // ontbrekend id → drop
    '{"id":"t1","budget_slug":"boodschappen","confidence":0.9},' +
    '{"id":"t4","budget_slug":"boodschappen","confidence":0.9},' + // eerste t4 wint
    '{"id":"t4","budget_slug":"vakantie","confidence":0.9},' + // duplicaat → genegeerd
    '{"id":"t9","budget_slug":"boodschappen","confidence":0.9},' + // onbekend → drop
    '{"id":"t5","budget_slug":"boodschappen","confidence":0.9}]'
  const res = await runDataset({
    model: fakeModel(() => text),
    transactions: first5,
    options,
    batchSize: 5,
    variant: 'full',
    output: 'kort',
    maxNewTokens: suggestMaxNewTokens(5, 'kort'),
    onProgress: () => {},
  })
  const byIndex = res.txResults // volgorde = batchvolgorde (t1..t5)
  check('5 transacties gedekt (alle ids gemapt)', res.batches[0].diagnostics.itemCount === 5)
  check('t2 kreeg de foute slug (id-mapping, niet positie)', byIndex[1].validatedSlug === 'vakantie' && !byIndex[1].correct)
  check('t4 = eerste (boodschappen), duplicaat genegeerd', byIndex[3].validatedSlug === 'boodschappen' && byIndex[3].correct)
  check('4 van 5 correct (alleen t2 fout)', byIndex.filter((t) => t.correct).length === 4)
  check('alle 5 items geldig', byIndex.every((t) => t.valid))
}

async function main(): Promise<void> {
  console.log(`suggestMaxNewTokens(20,'kort')=${suggestMaxNewTokens(20, 'kort')} · (20,'reasoning')=${suggestMaxNewTokens(20, 'reasoning')}`)
  await scenarioClean()
  await scenarioTruncated()
  await scenarioIdEcho()
  console.log(failures === 0 ? '\n✓ Kort-variant harnas-smoke geslaagd.' : `\n✗ ${failures} check(s) gefaald.`)
  if (failures) process.exit(1)
}

void main()
