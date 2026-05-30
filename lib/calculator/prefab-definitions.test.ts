import { describe, it, expect } from 'vitest'
import { PREFAB_CALCULATORS } from './prefab-definitions'
import { CalculatorDefinitionSchema } from './types'
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
