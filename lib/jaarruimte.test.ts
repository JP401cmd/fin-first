import { describe, it, expect } from 'vitest'
import {
  computeJaarruimte,
  jaarruimteBesparing,
  estimateFactorAFromSalary,
  resolvePensionFactorA,
  JAARRUIMTE_OPBOUW_PCT,
  JAARRUIMTE_FACTOR_A,
  JAARRUIMTE_FACTOR_A_IMPUTATIE,
  JAARRUIMTE_MAX_PREMIE_INKOMEN,
  JAARRUIMTE_FRANCHISE_2025,
  JAARRUIMTE_MAX_2025,
  JAARRUIMTE_FRANCHISE_2026,
  JAARRUIMTE_MAX_2026,
} from './jaarruimte'
import { computeBox1Tax } from './box1-tax'

// ── FISCALE-CORRECTIE REGRESSIECASES (ADR 0023, jun 2026) ──────────────────────
// Pinnen de specifieke getallen die gewijzigd zijn bij de WTP-correctie
// zodat een terugval naar de oude waarden (0.133 / 17545 / 34310) direct faalt.
// Zie ook: opdracht-specificatie stap 4 (a/b/c).
describe('fiscale-correctie — regressiepinnen (ADR 0023)', () => {
  // (a) Constanten moeten de WTP-gecorrigeerde waarden hebben
  it('(a) JAARRUIMTE_OPBOUW_PCT is exact 0.30 (WTP 2023 — NIET het oude 0.133)', () => {
    expect(JAARRUIMTE_OPBOUW_PCT).toBe(0.3)
    // Expliciete wacht-assertion: verkeerde waarde zou hierop kapot gaan
    expect(JAARRUIMTE_OPBOUW_PCT).not.toBe(0.133)
  })

  it('(a) JAARRUIMTE_FRANCHISE_2025 is €18.475 (was €17.545)', () => {
    expect(JAARRUIMTE_FRANCHISE_2025).toBe(18_475)
    expect(JAARRUIMTE_FRANCHISE_2025).not.toBe(17_545)
  })

  it('(a) JAARRUIMTE_MAX_2025 is €35.798 (was €34.310)', () => {
    expect(JAARRUIMTE_MAX_2025).toBe(35_798)
    expect(JAARRUIMTE_MAX_2025).not.toBe(34_310)
  })

  it('(a) JAARRUIMTE_FACTOR_A_IMPUTATIE is 6.27 (imputatiefactor)', () => {
    expect(JAARRUIMTE_FACTOR_A_IMPUTATIE).toBe(6.27)
  })

  // (b) End-to-end formule met factor A > 0 — legt de ×6,27-aftrek vast
  it('(b) €60.000 inkomen 2026, factorA €1.000 → jaarruimte €5.978', () => {
    // grondslag = 60000 − 19172 = 40828
    // basis     = 40828 × 0.30  = 12248.4
    // aftrek    = 6.27 × 1000   = 6270
    // onbenut   = 12248.4 − 6270 = 5978.4 → Math.round = 5978
    const result = computeJaarruimte(60_000, 1_000, 2026)
    expect(result.jaarruimte).toBe(5_978)
    expect(result.factorA).toBe(1_000)
    expect(result.year).toBe(2026)
  })

  // (c) Grondslag-cap bindt bij hoog inkomen (€1.000.000, 2026)
  it('(c) €1.000.000 inkomen 2026, factorA 0 → geclampd via grondslag-cap → €35.588', () => {
    // grondslagCap = 137800 − 19172 = 118628
    // basis        = 118628 × 0.30  = 35588.4 → Math.round = 35588
    // (MAX_2026 = 35589 is de gepubliceerde afgeleide; de grondslag-cap levert
    //  door afronding 35588 — dit is correct en bewust gedocumenteerd)
    const result = computeJaarruimte(1_000_000, 0, 2026)
    expect(result.jaarruimte).toBe(35_588)
    expect(result.jaarruimte).toBeCloseTo(JAARRUIMTE_MAX_2026, -1)
  })
})

describe('computeJaarruimte — basis', () => {
  it('returnt hasData=false bij grossYearlyIncome ≤ 0', () => {
    const result = computeJaarruimte(0)
    expect(result.hasData).toBe(false)
    expect(result.jaarruimte).toBe(0)
  })

  it('returnt jaarruimte=0 bij inkomen onder franchise (2026 default)', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2026 - 1000)
    expect(result.hasData).toBe(true)
    expect(result.jaarruimte).toBe(0)
  })

  it('default jaar = 2026', () => {
    const result = computeJaarruimte(50_000, 0)
    expect(result.year).toBe(2026)
    expect(result.franchise).toBe(JAARRUIMTE_FRANCHISE_2026)
    expect(result.max).toBe(JAARRUIMTE_MAX_2026)
  })
})

describe('computeJaarruimte — formule (default 2026, 30% opbouw)', () => {
  it('berekent (30% × (income − franchise)) bij modaal inkomen', () => {
    // €50.000 bruto, factor A 0, 2026-franchise €19.172
    const result = computeJaarruimte(50_000, 0)
    // grondslag = 50000 − 19172 = 30828
    // basis = 30828 × 0.30 = 9248.4 → afgerond 9248
    expect(result.jaarruimte).toBe(9248)
  })

  it('cap op max-premiegrondslag bij hoog inkomen (via grondslag-cap)', () => {
    const veryHighIncome = 1_000_000
    const result = computeJaarruimte(veryHighIncome, 0)
    // grondslag-cap: min(1000000 − 19172, 137800 − 19172) = 118628
    // 118628 × 0.30 = 35588.4 → Math.round = 35588. De gepubliceerde
    // MAX_2026-constante (35.589) is een afgeleide verificatie; de grondslag-cap
    // levert hier 1 euro lager door afronding — dat is inherent en correct.
    expect(result.jaarruimte).toBe(35_588)
    expect(result.jaarruimte).toBeCloseTo(JAARRUIMTE_MAX_2026, -1)
  })

  it('factor A × 6,27-aftrek verlaagt jaarruimte', () => {
    // €50.000 bruto, factor A €500 → aftrek 500 × 6,27 = 3135
    const result = computeJaarruimte(50_000, 500)
    // basis 9248.4 − 3135 = 6113.4 → afgerond 6113
    expect(result.jaarruimte).toBe(6113)
  })

  it('factor A clipt netjes op 0 (aftrek > basis)', () => {
    // €50.000 bruto, factor A €1.500 → aftrek 9405 > basis 9248 → 0
    const result = computeJaarruimte(50_000, 1_500)
    expect(result.jaarruimte).toBe(0)
  })

  it('hoog inkomen met factor A blijft positief', () => {
    // €100.000, factor A €1.500: grondslag 80828 × 0.30 = 24248.4
    // aftrek 1500 × 6.27 = 9405 → 24248.4 − 9405 = 14843.4 → 14843
    const result = computeJaarruimte(100_000, 1_500)
    expect(result.jaarruimte).toBe(14843)
  })
})

describe('computeJaarruimte — expliciet jaar 2025 (achterwaarts compatibel)', () => {
  it('2025-franchise + cap toepasbaar via expliciet jaar-argument', () => {
    const result = computeJaarruimte(50_000, 0, 2025)
    // grondslag = 50000 − 18475 = 31525 × 0.30 = 9457.5 → 9458
    expect(result.jaarruimte).toBe(9458)
    expect(result.year).toBe(2025)
    expect(result.franchise).toBe(JAARRUIMTE_FRANCHISE_2025)
    expect(result.max).toBe(JAARRUIMTE_MAX_2025)
  })

  it('cap op MAX_JAARRUIMTE_2025 bij hoog inkomen (2025)', () => {
    const result = computeJaarruimte(1_000_000, 0, 2025)
    // grondslag-cap: min(1000000 − 18475, 137800 − 18475) = 119325
    // 119325 × 0.30 = 35797.5 → 35798 == MAX_2025
    expect(result.jaarruimte).toBe(JAARRUIMTE_MAX_2025)
  })

  it('jaar als options-object', () => {
    const result = computeJaarruimte(50_000, 0, { year: 2025 })
    expect(result.year).toBe(2025)
    expect(result.jaarruimte).toBe(9458)
  })
})

describe('computeJaarruimte — edge-cases', () => {
  it('negatieve factor A wordt gefilterd op 0', () => {
    const result = computeJaarruimte(50_000, -1_000)
    // negatieve wordt 0, dus zelfde als zonder aangroei (2026)
    expect(result.jaarruimte).toBe(9248)
  })

  it('inkomen exact op franchise = 0 jaarruimte (2026)', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2026, 0)
    expect(result.jaarruimte).toBe(0)
  })
})

// ── jaarruimteBesparing — marginaal-correcte Box 1-besparing (ADR 0040/0041) ──
describe('jaarruimteBesparing — marginaal-correcte Box 1-besparing', () => {
  it('= round(computeBox1Tax(bruto) − computeBox1Tax(bruto − inleg))', () => {
    const gross = 50_000
    const inleg = 9_248
    const expected = Math.round(
      computeBox1Tax({ grossYearlyIncome: gross, year: 2026 }).tax -
        computeBox1Tax({ grossYearlyIncome: gross - inleg, year: 2026 }).tax,
    )
    expect(jaarruimteBesparing(gross, inleg, 2026)).toBe(expected)
  })

  it('bruto ≤ 0 → 0 (geen inkomen, geen besparing)', () => {
    expect(jaarruimteBesparing(0, 5_000)).toBe(0)
    expect(jaarruimteBesparing(-1_000, 5_000)).toBe(0)
  })

  it('inleg ≤ 0 → 0', () => {
    expect(jaarruimteBesparing(50_000, 0)).toBe(0)
    expect(jaarruimteBesparing(50_000, -500)).toBe(0)
  })

  it('inleg wordt geclampt op [0, bruto] — inleg > bruto telt als bruto', () => {
    const clampedAtGross = jaarruimteBesparing(50_000, 50_000, 2026)
    const overGross = jaarruimteBesparing(50_000, 60_000, 2026)
    expect(overGross).toBe(clampedAtGross)
  })

  it('besparing is nooit negatief (tax is monotoon in inkomen)', () => {
    const combos: ReadonlyArray<readonly [number, number]> = [
      [30_000, 5_000],
      [50_000, 9_248],
      [160_658, 35_588],
    ]
    for (const [g, i] of combos) {
      expect(jaarruimteBesparing(g, i, 2026)).toBeGreaterThanOrEqual(0)
    }
  })

  it('vangt heffingskorting-afbouw: effectief tarief > vlak schijf-1-tarief in de afbouwzone', () => {
    // €50k inkomen: de inleg valt boven de arbeidskorting-afbouwstart (€45.592) →
    // de marginaal-correcte besparing ligt hoger dan de vlakke schijf-1-benadering
    // (35,75%). Regressiepin (2026-params): €50k / €9.248 → €4.258.
    const b = jaarruimteBesparing(50_000, 9_248, 2026)
    expect(b).toBe(4_258)
    expect(b / 9_248).toBeGreaterThan(0.3575)
  })

  it('kan LAGER liggen dan het vlakke tarief in de arbeidskorting-opbouwzone', () => {
    // €30k: de inleg verlaagt het inkomen naar de opbouwzone → lager marginaal
    // effect dan het vlakke 36,97%. Regressiepin (2026-params): €30k / €5.000 → €1.461.
    expect(jaarruimteBesparing(30_000, 5_000, 2026)).toBe(1_461)
    expect(jaarruimteBesparing(30_000, 5_000, 2026)).toBeLessThan(Math.round(5_000 * 0.3697))
  })

  it('respecteert het jaar-argument (2025 ≠ 2026 door andere schijven/kortingen)', () => {
    expect(jaarruimteBesparing(50_000, 9_248, 2025)).not.toBe(
      jaarruimteBesparing(50_000, 9_248, 2026),
    )
  })

  it('AOW-variant (opts.aow) geeft lagere besparing (geen AOW-premiedeel)', () => {
    const regulier = jaarruimteBesparing(50_000, 9_248, 2026)
    const aow = jaarruimteBesparing(50_000, 9_248, 2026, { aow: true })
    expect(aow).toBeLessThan(regulier)
  })
})

describe('computeJaarruimte — constants', () => {
  it('OPBOUW_PCT is 30% (WTP per 2023)', () => {
    expect(JAARRUIMTE_OPBOUW_PCT).toBe(0.3)
  })
  it('gedeprecate alias JAARRUIMTE_FACTOR_A wijst naar opbouwpercentage', () => {
    expect(JAARRUIMTE_FACTOR_A).toBe(JAARRUIMTE_OPBOUW_PCT)
  })
  it('FACTOR_A_IMPUTATIE is 6,27', () => {
    expect(JAARRUIMTE_FACTOR_A_IMPUTATIE).toBe(6.27)
  })
  it('MAX_PREMIE_INKOMEN = €137.800', () => {
    expect(JAARRUIMTE_MAX_PREMIE_INKOMEN).toBe(137_800)
  })
  it('FRANCHISE_2025 = €18.475', () => {
    expect(JAARRUIMTE_FRANCHISE_2025).toBe(18_475)
  })
  it('MAX_JAARRUIMTE_2025 = €35.798', () => {
    expect(JAARRUIMTE_MAX_2025).toBe(35_798)
  })
  it('FRANCHISE_2026 = €19.172', () => {
    expect(JAARRUIMTE_FRANCHISE_2026).toBe(19_172)
  })
  it('MAX_JAARRUIMTE_2026 = €35.589', () => {
    expect(JAARRUIMTE_MAX_2026).toBe(35_589)
  })
  it('MAX-constante komt overeen met 30% × (max premie-inkomen − franchise)', () => {
    // Self-consistent: de losse max-constante is een afgeronde afgeleide.
    const derived2026 = Math.round(
      JAARRUIMTE_OPBOUW_PCT * (JAARRUIMTE_MAX_PREMIE_INKOMEN - JAARRUIMTE_FRANCHISE_2026),
    )
    expect(derived2026).toBeCloseTo(JAARRUIMTE_MAX_2026, -1) // binnen ~10 (afronding)
    const derived2025 = Math.round(
      JAARRUIMTE_OPBOUW_PCT * (JAARRUIMTE_MAX_PREMIE_INKOMEN - JAARRUIMTE_FRANCHISE_2025),
    )
    expect(derived2025).toBeCloseTo(JAARRUIMTE_MAX_2025, -1)
  })
})

describe('estimateFactorAFromSalary — salaris-gebaseerde schatter', () => {
  it('schat factor A = opbouw% × (salaris − franchise) — bekende case 2026', () => {
    // pensioengevend salaris €50.000, franchise 2026 €19.172, opbouw 1,875%
    // pensioengrondslag = 50000 − 19172 = 30828
    // factor A = 30828 × 0.01875 = 578.025 → afgerond op cent 578.03
    const factorA = estimateFactorAFromSalary(50_000, { year: 2026 })
    expect(factorA).toBeCloseTo(578.03, 2)
  })

  it('salaris onder franchise → factor A 0 (geen negatief)', () => {
    const factorA = estimateFactorAFromSalary(JAARRUIMTE_FRANCHISE_2026 - 500, {
      year: 2026,
    })
    expect(factorA).toBe(0)
  })

  it('respecteert expliciet opbouwpercentage', () => {
    // salaris €60.000, franchise 2026, opbouw 1,701%
    // grondslag 40828 × 0.01701 = 694.48...
    const factorA = estimateFactorAFromSalary(60_000, {
      year: 2026,
      opbouwPct: 0.01701,
    })
    expect(factorA).toBeCloseTo((60_000 - 19_172) * 0.01701, 2)
  })

  it('respecteert expliciete franchise-override', () => {
    const factorA = estimateFactorAFromSalary(50_000, {
      franchise: 18_475,
      opbouwPct: 0.01875,
    })
    expect(factorA).toBeCloseTo((50_000 - 18_475) * 0.01875, 2)
  })

  it('feedt direct in computeJaarruimte: end-to-end indicatie', () => {
    // €50.000 salaris → factor A 578,03 → aftrek 578,03 × 6,27 = 3624,2481
    // basis 9248,4 − 3624,2481 = 5624,15 → Math.round = 5624
    const factorA = estimateFactorAFromSalary(50_000, { year: 2026 })
    const jr = computeJaarruimte(50_000, factorA, 2026)
    expect(jr.jaarruimte).toBe(5624)
  })
})

// ── resolvePensionFactorA — single-source resolver (NULL ≠ 0) ──────────────────
describe('resolvePensionFactorA', () => {
  it('NULL → onbekend: { factorA 0, source null, isKnown false }', () => {
    expect(resolvePensionFactorA({ pension_factor_a: null })).toEqual({
      factorA: 0,
      source: null,
      isKnown: false,
    })
  })

  it('undefined waarde → onbekend (NULL ≠ 0)', () => {
    expect(resolvePensionFactorA({ pension_factor_a: undefined })).toEqual({
      factorA: 0,
      source: null,
      isKnown: false,
    })
    // Veld volledig afwezig
    expect(resolvePensionFactorA({})).toEqual({ factorA: 0, source: null, isKnown: false })
  })

  it('null/undefined profiel → defensieve onbekend-tak', () => {
    expect(resolvePensionFactorA(null)).toEqual({ factorA: 0, source: null, isKnown: false })
    expect(resolvePensionFactorA(undefined)).toEqual({
      factorA: 0,
      source: null,
      isKnown: false,
    })
  })

  it('expliciete 0 → bekend (geen werkgeverspensioen, NIET "onbekend")', () => {
    expect(
      resolvePensionFactorA({ pension_factor_a: 0, pension_factor_a_source: 'upo' }),
    ).toEqual({ factorA: 0, source: 'upo', isKnown: true })
  })

  it('positieve waarde → bekend, geclampt teruggegeven', () => {
    expect(
      resolvePensionFactorA({ pension_factor_a: 1234.56, pension_factor_a_source: 'estimated' }),
    ).toEqual({ factorA: 1234.56, source: 'estimated', isKnown: true })
  })

  it('bron-narrowing: upo en estimated blijven, onbekende string → null', () => {
    expect(
      resolvePensionFactorA({ pension_factor_a: 500, pension_factor_a_source: 'upo' }).source,
    ).toBe('upo')
    expect(
      resolvePensionFactorA({ pension_factor_a: 500, pension_factor_a_source: 'estimated' })
        .source,
    ).toBe('estimated')
    // Onbekende bron-string → source null, maar isKnown volgt de waarde (true)
    const r = resolvePensionFactorA({
      pension_factor_a: 500,
      pension_factor_a_source: 'manual-import',
    })
    expect(r).toEqual({ factorA: 500, source: null, isKnown: true })
    // Ontbrekende bron bij geldige waarde → source null, isKnown true
    expect(resolvePensionFactorA({ pension_factor_a: 500 })).toEqual({
      factorA: 500,
      source: null,
      isKnown: true,
    })
  })

  it('negatieve waarde clampt naar 0 maar blijft bekend (isKnown true)', () => {
    expect(
      resolvePensionFactorA({ pension_factor_a: -250, pension_factor_a_source: 'upo' }),
    ).toEqual({ factorA: 0, source: 'upo', isKnown: true })
  })

  it('NaN → behandeld als niet-bekend', () => {
    expect(resolvePensionFactorA({ pension_factor_a: NaN })).toEqual({
      factorA: 0,
      source: null,
      isKnown: false,
    })
  })

  it('feedt direct in computeJaarruimte: bekende factor A trekt af, onbekende niet', () => {
    const known = resolvePensionFactorA({ pension_factor_a: 1000, pension_factor_a_source: 'upo' })
    const unknown = resolvePensionFactorA({ pension_factor_a: null })
    const jrKnown = computeJaarruimte(60_000, known.factorA, 2026)
    const jrUnknown = computeJaarruimte(60_000, unknown.factorA, 2026)
    // Factor A 1000 trekt 1000 × 6,27 = 6270 van de basis af → minder jaarruimte.
    expect(jrKnown.jaarruimte).toBeLessThan(jrUnknown.jaarruimte)
    expect(jrUnknown.factorA).toBe(0)
  })
})
