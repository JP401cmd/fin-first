/**
 * Unit tests voor de Zod-schemas in `lib/quick-add/validation.ts`.
 *
 * Dekt de boundary-checks die zowel client (blur/submit) als server action
 * delen: naam niet leeg, bedrag ≥ 0, asset_type in enum, en de discriminated
 * union op `kind`.
 */

import { describe, it, expect } from 'vitest'
import {
  AssetQuickInputSchema,
  DGA_LINKED_ASSET_REQUIRED_ERROR,
  DebtQuickInputSchema,
  QuickAddInputSchema,
} from '../validation'

const DEELNEMING_ID = '11111111-1111-4111-8111-111111111111'

/** Minimale, verder geldige DGA-schuld-invoer. */
function dgaDebt(extra: Record<string, unknown> = {}) {
  return {
    debt_type: 'dga_schuld',
    name: 'RC-schuld aan BV',
    current_balance: 5000,
    field3: 5,
    ...extra,
  }
}

describe('AssetQuickInputSchema', () => {
  it('parst een geldige input succesvol', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: 'Spaarrekening',
      current_value: 1000,
      field3: 'ING',
    })
    expect(result.success).toBe(true)
  })

  it('weigert een lege naam', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: '',
      current_value: 1000,
    })
    expect(result.success).toBe(false)
  })

  it('weigert een negatieve current_value', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'savings',
      name: 'Spaar',
      current_value: -10,
    })
    expect(result.success).toBe(false)
  })

  it('weigert een onbekend asset_type', () => {
    const result = AssetQuickInputSchema.safeParse({
      asset_type: 'unknown_type',
      name: 'X',
      current_value: 100,
    })
    expect(result.success).toBe(false)
  })
})

describe('QuickAddInputSchema', () => {
  it('weigert een ongeldige kind-waarde (discriminated union)', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'nonsense',
      asset: { asset_type: 'savings', name: 'X', current_value: 100 },
    })
    expect(result.success).toBe(false)
  })
})

/**
 * Regressie WF-SCHULD-20 sub c (bug3) — een DGA-schuld zonder deelneming.
 *
 * De quick-add-wizard maakte een `dga_schuld` aan zónder `linked_asset_id`: het
 * veld bestond alleen in het volledige bewerkformulier, en het Zod-schema liet
 * de koppeling optioneel. De invariant hangt bewust aan het zelfstandige
 * `kind:'debt'`-pad — de twee paden hieronder waar de server de koppeling zélf
 * legt, moeten juist blijven werken.
 */
describe('DGA-schuld moet aan een deelneming hangen', () => {
  it('weigert kind:debt met dga_schuld zonder linked_asset_id', () => {
    const result = QuickAddInputSchema.safeParse({ kind: 'debt', debt: dgaDebt() })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.message).toBe(DGA_LINKED_ASSET_REQUIRED_ERROR)
  })

  it('weigert ook een expliciete null-koppeling', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'debt',
      debt: dgaDebt({ linked_asset_id: null }),
    })
    expect(result.success).toBe(false)
  })

  it('accepteert kind:debt met een gekoppelde deelneming', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'debt',
      debt: dgaDebt({ linked_asset_id: DEELNEMING_ID }),
    })
    expect(result.success).toBe(true)
  })

  it('laat andere schuldtypes ongemoeid', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'debt',
      debt: { debt_type: 'personal_loan', name: 'Lening', current_balance: 5000 },
    })
    expect(result.success).toBe(true)
  })

  it('accepteert asset_with_debt: de server zet linked_asset_id ná de asset-insert', () => {
    const result = QuickAddInputSchema.safeParse({
      kind: 'asset_with_debt',
      asset: { asset_type: 'deelneming', name: 'Holding BV', current_value: 50000 },
      debt: dgaDebt(),
    })
    expect(result.success).toBe(true)
  })

  it('laat de onboarding-batch ongemoeid: DebtQuickInputSchema blijft format-only', () => {
    // `/api/onboarding/save-own-data` valideert quickDebts met dit schema en
    // koppelt pas ná de batch-insert (linked_client_ref). Een refine hierop zou
    // de hele onboarding-submit afkeuren.
    const result = DebtQuickInputSchema.safeParse(dgaDebt({ linked_client_ref: 'bv-1' }))
    expect(result.success).toBe(true)
  })
})
