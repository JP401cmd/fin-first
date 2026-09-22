import { describe, it, expect } from 'vitest'
import {
  computeBox3TaxableInput,
  box3TaxStatus,
  box3StatusVerdict,
  BOX3_VRIJSTELLING_SINGLE,
} from './box3-taxable-input'
import { computeLeverScores } from '@/lib/lever-scores'
import { computeFiscaleRuimte, type FiscaleRuimteResult } from '@/lib/fiscale-ruimte'
import type { LeverageStatus } from '@/lib/leverage-status'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

// Canonieke schuldendrempel (alleenstaande) — alleen schulden boven deze drempel
// zijn Box 3-aftrekbaar. computeBox3TaxableInput past 'm toe, identiek aan
// calculateBox3, zodat het status-net gelijkloopt met calculateBox3.grondslagSparen.
const DREMPEL = BOX3_PARAMS[CURRENT_TAX_YEAR].schuldendrempelSingle

// ── computeBox3TaxableInput ────────────────────────────────────────────────────

describe('computeBox3TaxableInput — BOX3_ASSET_TYPES filter', () => {
  it('asset_type null is excluded from box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: null, current_value: 100_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('pension type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'pension', current_value: 500_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('eigen_huis type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'eigen_huis', current_value: 300_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('vehicle type does NOT count toward box3Assets', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'vehicle', current_value: 30_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('savings type counts as box3 asset', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(true)
  })

  it('elk Box 3-belastbaar assettype wordt herkend (canoniek: classifyAsset)', () => {
    // M23: dit was een lus over de losse `BOX3_ASSET_TYPES`-set die naast
    // `classifyAsset` leefde. Die set bevatte óók `deelneming`, terwijl een
    // aanmerkelijk belang in Box 2 valt — de lus legde die tegenspraak groen
    // vast. Nu een expliciete lijst van de typen die de canonieke bron in Box 3
    // plaatst; `deelneming` staat er bewust NIET meer bij.
    for (const type of ['cash', 'savings', 'investment', 'crypto', 'real_estate', 'vordering', 'other']) {
      const result = computeBox3TaxableInput(
        [{ asset_type: type, current_value: 100_000 }],
        [],
      )
      expect(result.hasBox3Assets, `${type} should be hasBox3Assets=true`).toBe(true)
    }
  })

  it('deelneming telt NIET mee — aanmerkelijk belang valt in Box 2', () => {
    // Regressie op de opgeheven tegenspraak: de oude sidebar-set rekende een
    // deelneming als Box 3-bezit, terwijl `classifyAsset` hem al Box 2 noemde.
    const result = computeBox3TaxableInput(
      [{ asset_type: 'deelneming', current_value: 250_000 }],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('physical: sieraden vrijgesteld, kunst wél in Box 3 (subtype-nuance)', () => {
    const sieraden = computeBox3TaxableInput(
      [{ asset_type: 'physical', subtype: 'sieraden', current_value: 100_000 }],
      [],
    )
    expect(sieraden.hasBox3Assets).toBe(false)

    const kunst = computeBox3TaxableInput(
      [{ asset_type: 'physical', subtype: 'kunst', current_value: 100_000 }],
      [],
    )
    expect(kunst.hasBox3Assets).toBe(true)
  })

  it('box3_vrijgesteld-overschrijving wint van de type-afleiding, beide kanten op', () => {
    // true op een belegging → eruit
    const vrijgesteld = computeBox3TaxableInput(
      [{ asset_type: 'investment', current_value: 200_000, box3_vrijgesteld: true }],
      [],
    )
    expect(vrijgesteld.hasBox3Assets).toBe(false)

    // false op een voertuig → er weer in (bv. een auto die als belegging wordt gehouden)
    const nietVrijgesteld = computeBox3TaxableInput(
      [{ asset_type: 'vehicle', current_value: 200_000, box3_vrijgesteld: false }],
      [],
    )
    expect(nietVrijgesteld.hasBox3Assets).toBe(true)
  })

  it('mix: only the non-box3 type → hasBox3Assets false', () => {
    const result = computeBox3TaxableInput(
      [
        { asset_type: 'pension', current_value: 300_000 },
        { asset_type: 'vehicle', current_value: 20_000 },
      ],
      [],
    )
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })
})

describe('computeBox3TaxableInput — net_worth_inclusion_pct weighting', () => {
  it('50% inclusion_pct contributes half the value', () => {
    // 100000 × 0.5 = 50000 → below vrijstelling → above = 0
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000, net_worth_inclusion_pct: 50 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
    expect(result.hasBox3Assets).toBe(true)
  })

  it('200% inclusion_pct doubles the value', () => {
    // 100000 × 2 = 200000 → above = 200000 − vrijstelling
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000, net_worth_inclusion_pct: 200 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(200_000 - BOX3_VRIJSTELLING_SINGLE)
  })

  it('debt with 50% inclusion_pct reduces box3 by half', () => {
    // asset savings 200000, debt 100000 at 50% → effectief 50000, min drempel → aftrekbaar 50000−3800
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [{ current_balance: 100_000, net_worth_inclusion_pct: 50 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(
      200_000 - Math.max(0, 50_000 - DREMPEL) - BOX3_VRIJSTELLING_SINGLE,
    )
  })
})

describe('computeBox3TaxableInput — threshold calculation', () => {
  it('savings 200000, no debts → above = 200000 − vrijstelling', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(200_000 - BOX3_VRIJSTELLING_SINGLE)
  })

  it('cash 50000, no debts → under threshold → above = 0', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'cash', current_value: 50_000 }],
      [],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
    expect(result.hasBox3Assets).toBe(true)
  })

  it('debts reduce box3Net before threshold is applied (na schuldendrempel)', () => {
    // savings 100000 − aftrekbaar (20000 − drempel) → net → above = net − vrijstelling
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000 }],
      [{ current_balance: 20_000 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(
      100_000 - Math.max(0, 20_000 - DREMPEL) - BOX3_VRIJSTELLING_SINGLE,
    )
  })

  it('debts cannot push threshold below 0 (above is always ≥ 0)', () => {
    // savings 100000 − debt 300000 → net would be negative → max(0, …) → above 0
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 100_000 }],
      [{ current_balance: 300_000 }],
    )
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })

  it('empty arrays → no assets, above = 0', () => {
    const result = computeBox3TaxableInput([], [])
    expect(result.hasBox3Assets).toBe(false)
    expect(result.box3TaxableAboveThreshold).toBe(0)
  })
})

describe('computeBox3TaxableInput — eigen-woning-hypotheek uitsluiting (Box 1)', () => {
  it('eigenwoninghypotheek telt NIET als Box 3-schuld — jpsmit-regressie', () => {
    // Regressie op de gemelde bug: box3-assets 56.201 (cash+savings+investment),
    // een €250k eigenwoninghypotheek (gekoppeld aan eigen_huis, aftrekbaar) + €40.800
    // overige box3-schuld. De hypotheek MAG de grondslag niet wegvagen; net blijft
    // ónder de vrijstelling om de JUISTE reden → status "good" én KPI (calculateBox3) €0.
    const assets = [
      { id: 'huis', asset_type: 'eigen_huis', current_value: 500_000 },
      { asset_type: 'cash', current_value: 15_001 },
      { asset_type: 'savings', current_value: 40_000 },
      { asset_type: 'investment', current_value: 1_200 },
    ]
    const debts = [
      { debt_type: 'mortgage', current_balance: 250_000, linked_asset_id: 'huis', is_tax_deductible: true },
      { debt_type: 'revolving_credit', current_balance: 800 },
      { debt_type: 'student_loan', current_balance: 40_000, is_tax_deductible: false },
    ]
    const result = computeBox3TaxableInput(assets, debts, 'solo')
    // box3-assets 56.201; box3-schuld 40.800 (hypotheek uitgesloten); aftrekbaar
    // 40.800 − drempel = 37.000; net = 19.201 < vrijstelling → above 0.
    expect(result.box3TaxableAboveThreshold).toBe(0)
    expect(result.hasBox3Assets).toBe(true)
    expect(box3TaxStatus(result)).toBe('good')
  })

  it('grote hypotheek maar ruim box3-vermogen → status toont ECHTE exposure (niet "good")', () => {
    // Zonder de uitsluiting zou de €300k hypotheek het net negatief maken → "good".
    // Mét de canonieke classifyDebt telt alleen de echte box3-exposure.
    const assets = [
      { id: 'huis', asset_type: 'eigen_huis', current_value: 400_000 },
      { asset_type: 'savings', current_value: 200_000 },
    ]
    const debts = [
      { debt_type: 'mortgage', current_balance: 300_000, linked_asset_id: 'huis', is_tax_deductible: true },
    ]
    const result = computeBox3TaxableInput(assets, debts, 'solo')
    // hypotheek uitgesloten → geen box3-schuld; net 200.000 > vrijstelling.
    // above = 140.643 → solo in de 100k–500k-band → 'bad' (echte exposure).
    expect(result.box3TaxableAboveThreshold).toBe(200_000 - BOX3_VRIJSTELLING_SINGLE)
    expect(box3TaxStatus(result)).toBe('bad')
  })

  it('een NIET aan eigen_huis gekoppelde hypotheek telt wél als Box 3-schuld', () => {
    const assets = [{ asset_type: 'savings', current_value: 200_000 }]
    const debts = [{ debt_type: 'mortgage', current_balance: 50_000 }] // geen linked_asset_id
    const result = computeBox3TaxableInput(assets, debts, 'solo')
    expect(result.box3TaxableAboveThreshold).toBe(
      200_000 - Math.max(0, 50_000 - DREMPEL) - BOX3_VRIJSTELLING_SINGLE,
    )
  })
})

describe('computeBox3TaxableInput — string current_value coercion', () => {
  it('current_value as string is coerced via Number()', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: '100000' }],
      [],
    )
    expect(result.hasBox3Assets).toBe(true)
    // 100000 > vrijstelling → above = 100000 − vrijstelling
    expect(result.box3TaxableAboveThreshold).toBe(100_000 - BOX3_VRIJSTELLING_SINGLE)
  })

  it('current_balance as string on debt is coerced via Number()', () => {
    const result = computeBox3TaxableInput(
      [{ asset_type: 'savings', current_value: 200_000 }],
      [{ current_balance: '50000' }],
    )
    // net = 200000 − (50000 − drempel) → above = net − vrijstelling
    expect(result.box3TaxableAboveThreshold).toBe(
      200_000 - Math.max(0, 50_000 - DREMPEL) - BOX3_VRIJSTELLING_SINGLE,
    )
  })
})

describe('computeBox3TaxableInput — householdType passthrough', () => {
  it('passes householdType through to the result', () => {
    const result = computeBox3TaxableInput([], [], 'samen')
    expect(result.householdType).toBe('samen')
  })

  it('householdType undefined when not passed', () => {
    const result = computeBox3TaxableInput([], [])
    expect(result.householdType).toBeUndefined()
  })
})

// ── box3TaxStatus ──────────────────────────────────────────────────────────────

describe('box3TaxStatus — neutral branch', () => {
  it('returns neutral when hasBox3Assets is false', () => {
    expect(box3TaxStatus({ box3TaxableAboveThreshold: 999_999, hasBox3Assets: false })).toBe('neutral')
  })
})

describe('box3TaxStatus — good branch', () => {
  it('returns good when above <= 0 (under threshold)', () => {
    expect(box3TaxStatus({ box3TaxableAboveThreshold: 0, hasBox3Assets: true })).toBe('good')
  })

  it('returns good when above <= 100000 with partner (samen)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 100_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('good')
  })

  it('returns good when above <= 100000 with gezin', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'gezin' }),
    ).toBe('good')
  })
})

describe('box3TaxStatus — warn branch', () => {
  it('returns warn when above <= 100000 without partner (solo)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 50_000, hasBox3Assets: true, householdType: 'solo' }),
    ).toBe('warn')
  })

  it('returns warn when above <= 100000 without householdType (undefined)', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 80_000, hasBox3Assets: true }),
    ).toBe('warn')
  })

  it('returns warn when above <= 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 300_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('warn')
  })

  it('returns warn when above exactly 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 500_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('warn')
  })
})

describe('box3TaxStatus — bad branch', () => {
  it('returns bad when above <= 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 200_000, hasBox3Assets: true, householdType: 'solo' }),
    ).toBe('bad')
  })

  it('returns bad when above exactly 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 500_000, hasBox3Assets: true }),
    ).toBe('bad')
  })

  it('returns bad when above > 500000 with partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 600_000, hasBox3Assets: true, householdType: 'samen' }),
    ).toBe('bad')
  })

  it('returns bad when above > 500000 without partner', () => {
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 600_000, hasBox3Assets: true }),
    ).toBe('bad')
  })
})

// ── De banden zijn GEEN hefboomstatus meer (ADR 0177) ─────────────────────────
//
// Hier stond tot 22 sep 2026 een SSoT-equivalentiesuite: `box3TaxStatus` ==
// `computeLeverScores().tax.status` (gemapt). Die gelijkheid geldt NIET meer.
// De hefboom Belasting oordeelt sinds ADR 0177 op ONBENUTTE FISCALE RUIMTE
// (`computeFiscaleRuimte`, lib/fiscale-ruimte.ts + lib/fiscale-ruimte.test.ts);
// `box3TaxStatus` is nog uitsluitend het Box 3-GRONDSLAGSIGNAAL voor het
// kaartlabel, de subpaginakop en de Box 3-dot (ADR 0177 D6).
//
// Wat hieronder overblijft is de toets dat die twee oordelen inderdaad
// LOSGEKOPPELD zijn: dezelfde box 3-grondslag die `box3TaxStatus` rood kleurt,
// mag de hefboom groen laten zolang er niets onbenut blijft. Dát is precies de
// gedragswijziging die ADR 0177 beoogt — een alleenstaande met € 2M belegd en
// niets te optimaliseren ging van rood naar groen.

function leverStatusToLeverageStatus(
  s: 'green' | 'amber' | 'red' | 'neutral',
): LeverageStatus {
  if (s === 'green') return 'good'
  if (s === 'amber') return 'warn'
  if (s === 'red') return 'bad'
  return 'neutral'
}

/** Minimale, verder neutrale `computeLeverScores`-invoer. */
function leverInput(fiscaleRuimte: FiscaleRuimteResult) {
  return {
    totalAssets: 500_000,
    totalDebts: 0,
    assetTypeCount: 3,
    savingsRate: 20,
    fiscaleRuimte,
  }
}

describe('ADR 0177 — box3TaxStatus draagt het hefboomoordeel niet meer', () => {
  it('box 3 ruim boven de vrijstelling ("bad") terwijl de hefboom GROEN staat', () => {
    // De oude regel: above = € 1,94M > € 500k → rood, zonder weg terug.
    const grondslag = box3TaxStatus({
      box3TaxableAboveThreshold: 1_940_000,
      hasBox3Assets: true,
      householdType: 'solo',
    })
    expect(grondslag).toBe('bad')
    expect(box3StatusVerdict(grondslag)).toBe('Ruim boven de vrijstelling')

    // De nieuwe regel: niets onbenut → groen, bij elk vermogensniveau.
    const scores = computeLeverScores(
      leverInput(
        computeFiscaleRuimte({
          partnerverdelingBesparing: null,
          jaarruimteBesparing: 0,
          samenstellingNetEffect: -11_400,
          box1Tax: 30_000,
          box3Tax: 41_918,
        }),
      ),
    )
    expect(leverStatusToLeverageStatus(scores.tax.status)).toBe('good')
    expect(scores.tax.detail).toBe('Geen onbenutte ruimte')
  })

  it('box 3 binnen de vrijstelling ("good") terwijl de hefboom ROOD staat', () => {
    // De omkering: bescheiden vermogen, maar er ligt echt geld (ratio ≈ 20%).
    expect(
      box3TaxStatus({ box3TaxableAboveThreshold: 0, hasBox3Assets: true, householdType: 'solo' }),
    ).toBe('good')

    const scores = computeLeverScores(
      leverInput(
        computeFiscaleRuimte({
          partnerverdelingBesparing: null,
          jaarruimteBesparing: 2_960,
          samenstellingNetEffect: null,
          box1Tax: 12_000,
          box3Tax: 2_606,
        }),
      ),
    )
    expect(leverStatusToLeverageStatus(scores.tax.status)).toBe('bad')
    // De grootste post bij naam, mét bedrag (ADR 0177 D4).
    expect(scores.tax.detail).toContain('Onbenutte jaarruimte')
    expect(scores.tax.detail).toContain('2.960')
  })

  it('geen enkele fiscale bron → de hefboom is grijs, niet groen', () => {
    const scores = computeLeverScores(
      leverInput(
        computeFiscaleRuimte({
          partnerverdelingBesparing: null,
          jaarruimteBesparing: null,
          samenstellingNetEffect: null,
          box1Tax: null,
          box3Tax: null,
        }),
      ),
    )
    expect(scores.tax.status).toBe('neutral')
    expect(scores.tax.score).toBeNull()
    // De sentinel waar lib/page-status/resolve.ts op leunt.
    expect(scores.tax.detail).toContain('— Start')
  })
})
