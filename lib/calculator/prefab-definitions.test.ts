import { describe, it, expect } from 'vitest'
import { PREFAB_CALCULATORS } from './prefab-definitions'
import { CalculatorDefinitionSchema } from './types'
import type { CalculatorDefinition } from './types'
import {
  validateFormulas,
  evaluateCalculator,
  resolveInitialInputs,
} from './evaluate'
import { PREFILL_KEY_SET } from './user-data-keys'

describe('prefab-definitions', () => {
  it('heeft 12 unieke slugs', () => {
    const slugs = PREFAB_CALCULATORS.map((p) => p.slug)
    expect(slugs).toHaveLength(12)
    expect(new Set(slugs).size).toBe(12)
  })

  for (const prefab of PREFAB_CALCULATORS) {
    describe(prefab.slug, () => {
      it('voldoet aan CalculatorDefinitionSchema', () => {
        const parsed = CalculatorDefinitionSchema.safeParse(prefab.definition)
        if (!parsed.success) {
          throw new Error(JSON.stringify(parsed.error.issues, null, 2))
        }
      })

      it('verwijst alleen naar bekende namen (validateFormulas leeg)', () => {
        const unknown = validateFormulas(prefab.definition, PREFILL_KEY_SET)
        expect(unknown).toEqual([])
      })

      it('evalueert zonder fouten op de default-inputs', () => {
        const def = prefab.definition
        const inputs = resolveInitialInputs(def, {})
        const result = evaluateCalculator(def, inputs, {})
        expect(result.errors).toEqual([])
      })

      it('compare-outputKey bestaat (indien gezet) + winnaar bepaald', () => {
        const def = prefab.definition
        if (!def.compare) return
        const keys = def.outputs.map((o) => o.key)
        expect(keys).toContain(def.compare.outputKey)
        const inputs = resolveInitialInputs(def, {})
        const result = evaluateCalculator(def, inputs, {})
        expect(result.winner).not.toBeNull()
      })

      it('narrative-placeholders verwijzen naar bestaande keys', () => {
        const def = prefab.definition
        if (!def.narrative) return
        const inputs = resolveInitialInputs(def, {})
        const result = evaluateCalculator(def, inputs, {})
        // Na interpolatie mogen geen {output:..} / {derived:..}-placeholders
        // meer overblijven (onbekende refs blijven letterlijk staan).
        expect(result.narrative).not.toMatch(/\{output:|\{derived:/)
      })
    })
  }
})

// Regressie-slot voor de UAT-bonusfinding "prefab-formule gebruikt functie
// buiten de evaluator-whitelist" (Notion 394f9e8d). De melding vermoedde dat
// `log` in de eerder-met-pensioen-prefab níet zou evalueren omdat het niet in
// WHITELIST_FNS staat. Het resolvet echter via de BUILTINS-tabel in
// safe-eval.ts. Dit slot houdt vast dat (1) de log-gebaseerde prefab-output
// een geldig getal geeft, en (2) de sandbox onbekende/kwaadaardige functies
// blijft weigeren — zodat BUILTINS bewust begrensd blijft en niet ongemerkt
// verbreedt.
describe('prefab-definitions — log-builtin regressie (Notion 394f9e8d)', () => {
  const eerder = PREFAB_CALCULATORS.find((p) => p.slug === 'eerder-met-pensioen')

  it('de log-gebruikende prefab bestaat en gebruikt log in jaren_tot_fire', () => {
    expect(eerder).toBeDefined()
    const output = eerder!.definition.outputs.find((o) => o.key === 'jaren_tot_fire')
    expect(output?.formula).toContain('log(')
  })

  it('log() resolvet via BUILTINS → geldige eindige uitkomst, geen fouten', () => {
    const def = eerder!.definition
    const inputs = resolveInitialInputs(def, {})
    const result = evaluateCalculator(def, inputs, {})
    expect(result.errors).toEqual([])
    for (const scenario of def.scenarios) {
      const v = result.values[scenario.key].jaren_tot_fire
      expect(v).not.toBeNull()
      expect(Number.isFinite(v!)).toBe(true)
      expect(v!).toBeGreaterThanOrEqual(0)
    }
  })

  it('validateFormulas ziet log NIET als onbekende naam (BUILTINS-laag)', () => {
    expect(validateFormulas(eerder!.definition, PREFILL_KEY_SET)).toEqual([])
  })

  it('log evalueert numeriek correct in een kale formule', () => {
    // log(e) = 1 (natuurlijke logaritme, verbatim uit expr-eval).
    const d: CalculatorDefinition = {
      name: 'log-check',
      inputs: [{ key: 'x', label: 'X', kind: 'number', default: Math.E }],
      scenarios: [{ key: 'a', label: 'A' }],
      outputs: [{ key: 'y', label: 'Y', formula: 'log(x)', format: 'number' }],
      assumptions: [],
    }
    const r = evaluateCalculator(d, { x: Math.E }, {})
    expect(r.values.a.y).toBeCloseTo(1)
    expect(r.errors).toEqual([])
  })

  it('sandbox weigert een echt onbekende functie (grens blijft dicht)', () => {
    const d: CalculatorDefinition = {
      name: 'unknown-fn',
      inputs: [{ key: 'x', label: 'X', kind: 'number', default: 1 }],
      scenarios: [{ key: 'a', label: 'A' }],
      outputs: [{ key: 'y', label: 'Y', formula: 'verzonnenFn(x)', format: 'number' }],
      assumptions: [],
    }
    const r = evaluateCalculator(d, { x: 1 }, {})
    expect(r.values.a.y).toBeNull()
    expect(r.errors.length).toBeGreaterThan(0)
  })
})
