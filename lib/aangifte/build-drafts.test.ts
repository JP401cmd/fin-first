// ── Build-drafts unit tests ─────────────────────────────────────────
//
// Verifies that `aangifteResultToReviewDrafts` correctly maps the
// AI-extraction output to review-step drafts, including:
//   1. Empty input → empty output (no fake rows, no thrown errors).
//   2. Asset-only fixture → assets populated, debts empty, no pairs.
//   3. Debt-only fixture → debts populated, assets empty, no pairs.
//   4. Combined fixture with mortgage-coupling → exactly one
//      asset-debt pair indexed correctly.
//   5. Field3 contract per asset-type / debt-type matches the
//      `buildAssetDraft` / `buildDebtDraft` interpretations.
//   6. Peildatum and tax_year are echoed verbatim.
//
// Test framework matches the rest of the repo: Vitest with
// describe/it/expect (no globals beyond what the project's
// test/setup.ts provides).

import { describe, it, expect } from 'vitest'
import { aangifteResultToReviewDrafts } from './build-drafts'
import type { AangifteExtractionResult } from './extraction-schema'

// ── Fixtures ────────────────────────────────────────────────────────

/**
 * Empty extraction — the shape returned when the AI sees an unrelated
 * PDF (jaaropgaaf, bankafschrift) or fails entirely. Verifies the
 * builder does not crash on empty arrays.
 */
const EMPTY_RESULT: AangifteExtractionResult = {
  assets: [],
  debts: [],
  box1_components: [],
  peildatum: '2024-01-01',
  tax_year: 2024,
}

/**
 * Asset-only fixture — typical "alleen Box 3 bezittingen" aangifte
 * (renter without a mortgage). Spans cash, savings, investment, crypto
 * and vordering to exercise different field3-mappings in one fixture.
 */
const ASSETS_ONLY: AangifteExtractionResult = {
  assets: [
    {
      name: 'ING betaalrekening',
      asset_type: 'cash',
      current_value: 3450,
      subtype: null,
      woz_value: null,
    },
    {
      name: 'ASN spaarrekening',
      asset_type: 'savings',
      current_value: 18200,
      subtype: 'savings_account',
      woz_value: null,
    },
    {
      name: 'DEGIRO portefeuille',
      asset_type: 'investment',
      current_value: 42000,
      subtype: null,
      woz_value: null,
    },
    {
      name: 'Cryptovaluta',
      asset_type: 'crypto',
      current_value: 5000,
      subtype: null,
      woz_value: null,
    },
    {
      name: 'Lening aan familie',
      asset_type: 'vordering',
      current_value: 12000,
      subtype: null,
      woz_value: null,
    },
  ],
  debts: [],
  box1_components: [
    {
      kind: 'loon',
      annual_amount: 65000,
      label: 'Bruto loon werkgever',
    },
  ],
  peildatum: '2024-01-01',
  tax_year: 2024,
}

/**
 * Debt-only fixture — multiple Box 3 debts without an eigen_huis.
 * Verifies that without a paired asset, no `linked_mortgage_pairs`
 * are produced and the rows still come through correctly.
 */
const DEBTS_ONLY: AangifteExtractionResult = {
  assets: [],
  debts: [
    {
      name: 'Studieschuld DUO',
      debt_type: 'student_loan',
      current_balance: 8300,
      interest_rate: 0.46,
      repayment_type: null,
      subtype: 'nieuw_stelsel',
      is_tax_deductible: false,
    },
    {
      name: 'Persoonlijke lening Santander',
      debt_type: 'personal_loan',
      current_balance: 4500,
      interest_rate: 6.5,
      repayment_type: null,
      subtype: null,
      is_tax_deductible: false,
    },
  ],
  box1_components: [],
  peildatum: '2024-01-01',
  tax_year: 2024,
}

/**
 * Combined fixture with mortgage-coupling. Eigen woning + matching
 * mortgage are the canonical pair the builder should detect; an
 * additional Box 3 asset and an unrelated student loan verify the
 * pair-detection only matches eigen_huis with mortgage and not other
 * combinations.
 */
const COMBINED_WITH_MORTGAGE: AangifteExtractionResult = {
  assets: [
    {
      name: 'Eigen woning',
      asset_type: 'eigen_huis',
      current_value: 425000,
      subtype: null,
      woz_value: 425000,
    },
    {
      name: 'ASN spaarrekening',
      asset_type: 'savings',
      current_value: 18200,
      subtype: null,
      woz_value: null,
    },
  ],
  debts: [
    {
      name: 'Hypotheek ABN AMRO',
      debt_type: 'mortgage',
      current_balance: 245000,
      interest_rate: 3.8,
      repayment_type: 'annuiteit',
      subtype: 'annuiteit',
      is_tax_deductible: true,
    },
    {
      name: 'Studieschuld DUO',
      debt_type: 'student_loan',
      current_balance: 8300,
      interest_rate: 0.46,
      repayment_type: null,
      subtype: 'nieuw_stelsel',
      is_tax_deductible: false,
    },
  ],
  box1_components: [
    {
      kind: 'loon',
      annual_amount: 65000,
      label: 'Bruto loon werkgever',
    },
    {
      kind: 'aow',
      annual_amount: 16450,
      label: 'AOW-uitkering',
    },
  ],
  peildatum: '2024-01-01',
  tax_year: 2024,
}

// ── Tests ───────────────────────────────────────────────────────────

describe('aangifteResultToReviewDrafts — empty input', () => {
  it('returns empty arrays and echoes peildatum + tax_year', () => {
    const drafts = aangifteResultToReviewDrafts(EMPTY_RESULT)
    expect(drafts.assets).toEqual([])
    expect(drafts.debts).toEqual([])
    expect(drafts.box1_components).toEqual([])
    expect(drafts.linked_mortgage_pairs).toEqual([])
    expect(drafts.peildatum).toBe('2024-01-01')
    expect(drafts.tax_year).toBe(2024)
  })
})

describe('aangifteResultToReviewDrafts — assets-only fixture', () => {
  const drafts = aangifteResultToReviewDrafts(ASSETS_ONLY)

  it('returns one review-row per extracted asset', () => {
    expect(drafts.assets).toHaveLength(5)
    expect(drafts.debts).toEqual([])
  })

  it('preserves name, asset_type and current_value verbatim', () => {
    expect(drafts.assets[0].name).toBe('ING betaalrekening')
    expect(drafts.assets[0].asset_type).toBe('cash')
    expect(drafts.assets[0].current_value).toBe(3450)
  })

  it('cash assets receive the first name-token as institution via field3', () => {
    expect(drafts.assets[0].field3).toBe('ING')
  })

  it('savings assets receive the first name-token as institution via field3', () => {
    expect(drafts.assets[1].field3).toBe('ASN')
  })

  it('investment assets get null field3 (we have no monthly inleg from aangifte)', () => {
    expect(drafts.assets[2].field3).toBeNull()
  })

  it('crypto / vordering also get null field3', () => {
    expect(drafts.assets[3].field3).toBeNull()
    expect(drafts.assets[4].field3).toBeNull()
  })

  it('echoes box1_components verbatim', () => {
    expect(drafts.box1_components).toHaveLength(1)
    expect(drafts.box1_components[0]).toEqual({
      kind: 'loon',
      annual_amount: 65000,
      label: 'Bruto loon werkgever',
    })
  })

  it('produces no mortgage-pairs when there are no eigen_huis assets', () => {
    expect(drafts.linked_mortgage_pairs).toEqual([])
  })
})

describe('aangifteResultToReviewDrafts — debts-only fixture', () => {
  const drafts = aangifteResultToReviewDrafts(DEBTS_ONLY)

  it('returns one review-row per extracted debt', () => {
    expect(drafts.debts).toHaveLength(2)
    expect(drafts.assets).toEqual([])
  })

  it('preserves name, debt_type and current_balance verbatim', () => {
    expect(drafts.debts[0].name).toBe('Studieschuld DUO')
    expect(drafts.debts[0].debt_type).toBe('student_loan')
    expect(drafts.debts[0].current_balance).toBe(8300)
  })

  it('forwards interest_rate via field3 for student_loan and personal_loan', () => {
    expect(drafts.debts[0].field3).toBe(0.46)
    expect(drafts.debts[1].field3).toBe(6.5)
  })

  it('initializes linked_asset_id to null on every debt', () => {
    expect(drafts.debts[0].linked_asset_id).toBeNull()
    expect(drafts.debts[1].linked_asset_id).toBeNull()
  })

  it('produces no mortgage-pairs when there is no mortgage debt', () => {
    expect(drafts.linked_mortgage_pairs).toEqual([])
  })
})

describe('aangifteResultToReviewDrafts — combined fixture with mortgage-coupling', () => {
  const drafts = aangifteResultToReviewDrafts(COMBINED_WITH_MORTGAGE)

  it('returns all assets and debts intact', () => {
    expect(drafts.assets).toHaveLength(2)
    expect(drafts.debts).toHaveLength(2)
  })

  it('detects exactly one mortgage-pair (eigen_huis + mortgage)', () => {
    expect(drafts.linked_mortgage_pairs).toHaveLength(1)
    expect(drafts.linked_mortgage_pairs[0]).toEqual({ asset_idx: 0, debt_idx: 0 })
  })

  it('eigen_huis asset receives WOZ-value as field3', () => {
    expect(drafts.assets[0].asset_type).toBe('eigen_huis')
    expect(drafts.assets[0].field3).toBe(425000)
  })

  it('falls back to current_value when woz_value is null', () => {
    const noWoz: AangifteExtractionResult = {
      ...COMBINED_WITH_MORTGAGE,
      assets: [
        {
          name: 'Eigen woning',
          asset_type: 'eigen_huis',
          current_value: 380000,
          subtype: null,
          woz_value: null,
        },
      ],
      debts: [],
    }
    const d = aangifteResultToReviewDrafts(noWoz)
    expect(d.assets[0].field3).toBe(380000)
  })

  it('mortgage debt forwards rate via field3 and is_tax_deductible flag is on extraction (not a draft field)', () => {
    expect(drafts.debts[0].debt_type).toBe('mortgage')
    expect(drafts.debts[0].field3).toBe(3.8)
  })

  it('does not pair the savings asset or the student loan', () => {
    // savings is at index 1, student_loan is at index 1 — neither must
    // appear in pairs.
    const pairAssets = drafts.linked_mortgage_pairs.map((p) => p.asset_idx)
    const pairDebts = drafts.linked_mortgage_pairs.map((p) => p.debt_idx)
    expect(pairAssets).not.toContain(1)
    expect(pairDebts).not.toContain(1)
  })

  it('passes through both Box 1 components in stable order', () => {
    expect(drafts.box1_components).toHaveLength(2)
    expect(drafts.box1_components[0].kind).toBe('loon')
    expect(drafts.box1_components[1].kind).toBe('aow')
  })

  it('echoes peildatum + tax_year', () => {
    expect(drafts.peildatum).toBe('2024-01-01')
    expect(drafts.tax_year).toBe(2024)
  })
})

describe('aangifteResultToReviewDrafts — multiple eigen_huis or mortgages', () => {
  it('greedy-pairs the first eigen_huis with the first mortgage and leaves leftovers unpaired', () => {
    const fixture: AangifteExtractionResult = {
      assets: [
        {
          name: 'Eigen woning',
          asset_type: 'eigen_huis',
          current_value: 425000,
          subtype: null,
          woz_value: 425000,
        },
        {
          // Defensive: a second eigen_huis is unusual but possible in
          // partner-aangiftes. The builder should pair only one.
          name: 'Eigen woning 2',
          asset_type: 'eigen_huis',
          current_value: 300000,
          subtype: null,
          woz_value: 300000,
        },
      ],
      debts: [
        {
          name: 'Hypotheek ABN',
          debt_type: 'mortgage',
          current_balance: 245000,
          interest_rate: 3.8,
          repayment_type: 'annuiteit',
          subtype: 'annuiteit',
          is_tax_deductible: true,
        },
      ],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    }
    const drafts = aangifteResultToReviewDrafts(fixture)
    expect(drafts.linked_mortgage_pairs).toHaveLength(1)
    expect(drafts.linked_mortgage_pairs[0]).toEqual({ asset_idx: 0, debt_idx: 0 })
  })

  it('does not double-pair a single mortgage to two eigen_huis assets', () => {
    const fixture: AangifteExtractionResult = {
      assets: [
        {
          name: 'Eigen woning A',
          asset_type: 'eigen_huis',
          current_value: 425000,
          subtype: null,
          woz_value: 425000,
        },
        {
          name: 'Eigen woning B',
          asset_type: 'eigen_huis',
          current_value: 300000,
          subtype: null,
          woz_value: 300000,
        },
      ],
      debts: [
        {
          name: 'Hypotheek',
          debt_type: 'mortgage',
          current_balance: 245000,
          interest_rate: 3.8,
          repayment_type: 'annuiteit',
          subtype: null,
          is_tax_deductible: true,
        },
      ],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    }
    const drafts = aangifteResultToReviewDrafts(fixture)
    // Only one pair total — debt_idx 0 is consumed after first match.
    expect(drafts.linked_mortgage_pairs).toHaveLength(1)
    expect(drafts.linked_mortgage_pairs[0].asset_idx).toBe(0)
  })
})

describe('aangifteResultToReviewDrafts — field3 edge cases', () => {
  it('cash with single-word name returns the full name as institution', () => {
    const fixture: AangifteExtractionResult = {
      assets: [
        {
          name: 'Knab',
          asset_type: 'cash',
          current_value: 1500,
          subtype: null,
          woz_value: null,
        },
      ],
      debts: [],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    }
    const drafts = aangifteResultToReviewDrafts(fixture)
    expect(drafts.assets[0].field3).toBe('Knab')
  })

  it('belastingschuld debt produces null field3 (tax_year cannot be derived from aangifte)', () => {
    const fixture: AangifteExtractionResult = {
      assets: [],
      debts: [
        {
          name: 'Belastingschuld 2022',
          debt_type: 'belastingschuld',
          current_balance: 4500,
          interest_rate: null,
          repayment_type: null,
          subtype: null,
          is_tax_deductible: false,
        },
      ],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    }
    const drafts = aangifteResultToReviewDrafts(fixture)
    expect(drafts.debts[0].field3).toBeNull()
  })

  it('mortgage with null interest_rate forwards null field3', () => {
    const fixture: AangifteExtractionResult = {
      assets: [],
      debts: [
        {
          name: 'Hypotheek',
          debt_type: 'mortgage',
          current_balance: 200000,
          interest_rate: null,
          repayment_type: 'annuiteit',
          subtype: null,
          is_tax_deductible: true,
        },
      ],
      box1_components: [],
      peildatum: '2024-01-01',
      tax_year: 2024,
    }
    const drafts = aangifteResultToReviewDrafts(fixture)
    expect(drafts.debts[0].field3).toBeNull()
  })
})
