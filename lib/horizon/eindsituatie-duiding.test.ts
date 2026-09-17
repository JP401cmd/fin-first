/**
 * Detector "waarom blijft er aan het eind zoveel over?" — per oorzaak één scenario op
 * synthetische jaarrijen, plus de trigger en de eenduidigheid.
 */

import { describe, it, expect } from 'vitest'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { detectEindsituatie, type EindsituatieDuidingInput } from './eindsituatie-duiding'

interface RowOpts {
  j: number
  i?: number
  need?: number
  uitgaveTerm?: number
  income?: number
  oneTime?: number
  plafond?: boolean
  opeet?: number
}

function row(age: number, o: RowOpts): UnifiedProjectionRow {
  return {
    year: age - 50,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: o.opeet != null ? { opeethypotheek: { startBalance: o.opeet, interestPaid: 0, principalPaid: 0, endBalance: o.opeet } } : {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: o.i ?? o.j,
    startNetWorth: 0,
    nettoLiquide: o.j,
    grossIncome: o.income ?? 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: o.oneTime ?? 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
    ...(o.need != null ? { withdrawalNeed: { uitgaveTerm: o.uitgaveTerm ?? o.need, huurNaVerkoop: 0, vervallenHypotheeklast: 0, box3: 0, partnerBijdrage: 0, totaalNeed: o.need, restMaandClamp: 0, nietGedekt: 0 } } : {}),
    ...(o.plafond != null ? { opeetPlafondBereikt: o.plafond } : {}),
  } as UnifiedProjectionRow
}

const U = 40_000 // jaaruitgaven

const BASE: Omit<EindsituatieDuidingInput, 'rows'> = {
  endForm: 'deplete',
  endAge: 90,
  legacyAmount: 0,
  legacyIncludeIlliquid: false,
  vastStopmoment: false,
  fireAgeFractional: 55,
  currentAge: 50,
  geenTekortLeningAan: true,
  jaarUitgavenNu: U,
}

/** Stop op 55, dieptepunt ≈ 0 op 67, AOW vanaf 68 dekt de behoefte, eind 90 met €900k. */
function dipDanInkomen(): UnifiedProjectionRow[] {
  return [
    row(55, { j: 500_000, need: U }),
    row(60, { j: 300_000, need: U }),
    row(67, { j: 5_000, need: U }),
    row(68, { j: 20_000, need: U, income: 45_000 }),
    row(80, { j: 500_000, need: U, income: 45_000 }),
    row(89, { j: 900_000, need: U, income: 45_000 }),
  ]
}

describe('detectEindsituatie — trigger', () => {
  it('geen duiding bij een vast stopmoment', () => {
    expect(detectEindsituatie({ ...BASE, vastStopmoment: true, rows: dipDanInkomen() })).toBeNull()
  })

  it('geen duiding wanneer het overschot ≤ één jaar uitgaven is', () => {
    const rows = [row(55, { j: 500_000, need: U }), row(89, { j: U - 1, need: U })]
    expect(detectEindsituatie({ ...BASE, rows })).toBeNull()
  })

  it('legacy: overschot is model − doel (geïndexeerd)', () => {
    const rows = [row(55, { j: 500_000 }), row(89, { j: 230_000 })]
    expect(detectEindsituatie({ ...BASE, endForm: 'legacy', legacyAmount: 200_000, rows })).toBeNull()
    const d = detectEindsituatie({ ...BASE, endForm: 'legacy', legacyAmount: 100_000, rows })
    expect(d?.overschot.bedrag).toBe(130_000)
  })

  it('leest het eindbedrag op de eindleeftijd, niet op de laatste rij (100)', () => {
    const rows = [...dipDanInkomen(), row(99, { j: 2_000_000 })]
    expect(detectEindsituatie({ ...BASE, rows })?.eindAge).toBe(90)
  })
})

describe('detectEindsituatie — oorzaken', () => {
  it('a1 + b: geen-tekort-lening bindt op het dieptepunt, daarna dekt later inkomen → eenduidig', () => {
    const d = detectEindsituatie({ ...BASE, rows: dipDanInkomen() })!
    expect(d.oorzaken.map((o) => o.id)).toEqual(['geen-tekort-lening', 'later-inkomen'])
    expect(d.dieptepunt?.age).toBe(68) // stand aan het eind van rij 67
    expect(d.oorzaken[1].age).toBe(68)
    expect(d.eenduidig).toBe(true)
  })

  it('b telt de partnerbijdrage niet dubbel (totaalNeed heeft haar al afgetrokken)', () => {
    const r = (age: number, j: number) => {
      const x = row(age, { j, need: 10_000, income: 30_000 })
      x.withdrawalNeed!.partnerBijdrage = 30_000 // bruto behoefte 40k, partner 30k → need 10k
      return x
    }
    const rows = [row(55, { j: 500_000, need: U }), row(67, { j: 5_000, need: U }), r(70, 200_000), r(89, 900_000)]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken.map((o) => o.id)).not.toContain('later-inkomen')
  })

  it('a1 alleen met de instelling aan; uit ⇒ geen bindende oorzaak ⇒ niet eenduidig', () => {
    const d = detectEindsituatie({ ...BASE, geenTekortLeningAan: false, rows: dipDanInkomen() })!
    expect(d.oorzaken.map((o) => o.id)).not.toContain('geen-tekort-lening')
    expect(d.eenduidig).toBe(false)
  })

  it('a3: nu al stoppen is de enige bindende oorzaak', () => {
    const rows = [row(50, { j: 3_000_000, need: U }), row(89, { j: 4_000_000, need: U })]
    const d = detectEindsituatie({ ...BASE, fireAgeFractional: 50, rows })!
    expect(d.oorzaken[0].id).toBe('nu-stoppen')
    expect(d.eenduidig).toBe(true)
  })

  it('a2: het opeet-plafond is bereikt', () => {
    const rows = [
      row(55, { j: 400_000, need: U }),
      row(75, { j: 300_000, need: U, plafond: true, opeet: 800_000 }),
      row(89, { j: 600_000, need: U, i: 1_400_000, opeet: 1_200_000 }),
    ]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken.map((o) => o.id)).toEqual(['opeet-plafond'])
    expect(d.oorzaken[0].age).toBe(76)
    expect(d.eenduidig).toBe(true)
  })

  it('a1 én a2 samen ⇒ meerdere bindende oorzaken ⇒ niet eenduidig', () => {
    const rows = [
      row(55, { j: 400_000, need: U }),
      row(70, { j: 1_000, need: U, plafond: true }),
      row(89, { j: 600_000, need: U }),
    ]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken.map((o) => o.id)).toEqual(['geen-tekort-lening', 'opeet-plafond'])
    expect(d.eenduidig).toBe(false)
  })

  it('g: late eenmalige baten na het stopmoment', () => {
    const rows = [row(55, { j: 400_000, need: U }), row(80, { j: 700_000, need: U, oneTime: 500_000 }), row(89, { j: 600_000, need: U })]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken.map((o) => o.id)).toContain('late-baten')
    expect(d.oorzaken.find((o) => o.id === 'late-baten')?.bedrag?.bedrag).toBe(500_000)
    expect(d.eenduidig).toBe(false)
  })

  it('d: het uitgavenprofiel daalt reëel', () => {
    const rows = [
      row(55, { j: 400_000, need: U, uitgaveTerm: U }),
      row(75, { j: 350_000, need: 0.7 * U, uitgaveTerm: 0.7 * U }),
      row(89, { j: 300_000, need: 0.7 * U, uitgaveTerm: 0.7 * U }),
    ]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken.map((o) => o.id)).toContain('dalend-profiel')
    expect(d.oorzaken.find((o) => o.id === 'dalend-profiel')?.age).toBe(75)
  })

  it('c + h: huis en opeetschuld worden apart als context benoemd', () => {
    const rows = [
      row(55, { j: 500_000, need: U }),
      row(67, { j: 5_000, need: U }),
      row(89, { j: 900_000, need: U, i: 1_700_000, opeet: 1_200_000 }),
    ]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.context.opeetschuld?.bedrag).toBe(1_200_000)
    // netWorth − J = huis − opeetschuld ⇒ huis = 800k + 1,2 mln
    expect(d.context.huis?.bedrag).toBe(2_000_000)
  })

  it('geen enkele oorzaak ⇒ niet eenduidig', () => {
    const rows = [row(55, { j: 400_000 }), row(89, { j: 500_000 })]
    const d = detectEindsituatie({ ...BASE, rows })!
    expect(d.oorzaken).toEqual([])
    expect(d.eenduidig).toBe(false)
  })
})
