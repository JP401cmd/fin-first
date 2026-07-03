import { describe, it, expect } from 'vitest'
import {
  berekenSchenkbelasting,
  berekenErfbelasting,
  resolveSchenkErfParams,
  SCHENK_ERF_PARAMS,
  LIFE_EVENT_CATALOG,
  formatErfenisTipTekst,
  formatErfenisRelatieOpties,
  formatErfenisRelatieTip,
} from './horizon-data'
import { analyzeSchenkingPlan } from './phase-analysis'

/**
 * Narekentests voor de jaargelaagde schenk- & erfbelasting (SCHENK_ERF_PARAMS).
 *
 * De verwachte bedragen zijn per jaar met de hand nagerekend tegen de officiële
 * Belastingdienst-tariefbladen (vrijstelling → belastbaar → twee schijven met de
 * jaargebonden schijfgrens). Rounding is identiek aan de productiecode:
 *  - schenking: Math.round(laag*tarief + hoog*tarief) over de som
 *  - erfbelasting: Math.round per schijf, daarna optellen
 *
 * Dekt tevens de drift-bug: tip-tekst en select-optielabels worden programmatisch
 * tegen SCHENK_ERF_PARAMS geverifieerd (voorheen toonde één modal 2024- én 2025-
 * cijfers naast elkaar).
 */

// ── Schenkbelasting — narekening per jaar ────────────────────────────────────

describe('berekenSchenkbelasting — narekening per jaar', () => {
  describe('2026 (schijfgrens €158.669)', () => {
    it('kind onder de schijfgrens', () => {
      expect(berekenSchenkbelasting(100_000, 'kind', 2026).belasting).toBe(9_309)
    })
    it('kind boven de schijfgrens (twee schijven)', () => {
      expect(berekenSchenkbelasting(300_000, 'kind', 2026).belasting).toBe(42_752)
    })
    it('kleinkind boven de schijfgrens (18/36%)', () => {
      expect(berekenSchenkbelasting(300_000, 'kleinkind', 2026).belasting).toBe(78_443)
    })
    it('overig boven de schijfgrens (30/40%)', () => {
      expect(berekenSchenkbelasting(300_000, 'overig', 2026).belasting).toBe(103_026)
    })
    it('bedrag gelijk aan de vrijstelling is onbelast', () => {
      expect(berekenSchenkbelasting(6_908, 'kind', 2026).belasting).toBe(0)
    })
  })

  describe('2025 (schijfgrens €154.197)', () => {
    it('kind onder de schijfgrens', () => {
      expect(berekenSchenkbelasting(100_000, 'kind', 2025).belasting).toBe(9_329)
    })
    it('kind boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'kind', 2025).belasting).toBe(43_238)
    })
    it('kleinkind boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'kleinkind', 2025).belasting).toBe(79_276)
    })
    it('overig boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'overig', 2025).belasting).toBe(103_504)
    })
  })

  describe('2024 (schijfgrens €152.368)', () => {
    it('kind onder de schijfgrens', () => {
      expect(berekenSchenkbelasting(100_000, 'kind', 2024).belasting).toBe(9_337)
    })
    it('kind boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'kind', 2024).belasting).toBe(43_437)
    })
    it('kleinkind boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'kleinkind', 2024).belasting).toBe(79_617)
    })
    it('overig boven de schijfgrens', () => {
      expect(berekenSchenkbelasting(300_000, 'overig', 2024).belasting).toBe(103_700)
    })
  })
})

// ── Erfbelasting — narekening per jaar ───────────────────────────────────────

describe('berekenErfbelasting — narekening per jaar', () => {
  describe('2026', () => {
    it('kind onder+boven de schijfgrens', () => {
      expect(berekenErfbelasting(300_000, 'kind', 2026).totaalBelasting).toBe(38_887)
      expect(berekenErfbelasting(1_000_000, 'kind', 2026).totaalBelasting).toBe(178_887)
    })
    it('kleinkind boven de schijfgrens (18/36%)', () => {
      expect(berekenErfbelasting(300_000, 'kleinkind', 2026).totaalBelasting).toBe(69_996)
    })
    it('overig boven de schijfgrens (30/40%)', () => {
      expect(berekenErfbelasting(300_000, 'overig', 2026).totaalBelasting).toBe(103_026)
    })
    it('partner volledig vrijgesteld onder de partnervrijstelling', () => {
      const r = berekenErfbelasting(500_000, 'partner', 2026)
      expect(r.totaalBelasting).toBe(0)
      expect(r.netto).toBe(500_000)
    })
    it('partner boven de partnervrijstelling', () => {
      expect(berekenErfbelasting(1_000_000, 'partner', 2026).totaalBelasting).toBe(18_526)
    })
  })

  describe('2025', () => {
    it('kind boven de schijfgrens', () => {
      expect(berekenErfbelasting(300_000, 'kind', 2025).totaalBelasting).toBe(39_483)
    })
    it('partner boven de partnervrijstelling', () => {
      expect(berekenErfbelasting(1_000_000, 'partner', 2025).totaalBelasting).toBe(23_641)
    })
  })

  describe('2024', () => {
    it('kind boven de schijfgrens', () => {
      expect(berekenErfbelasting(300_000, 'kind', 2024).totaalBelasting).toBe(39_726)
    })
    it('partner boven de partnervrijstelling', () => {
      expect(berekenErfbelasting(1_000_000, 'partner', 2024).totaalBelasting).toBe(25_732)
    })
    it('overig onder de schijfgrens', () => {
      expect(berekenErfbelasting(50_000, 'overig', 2024).totaalBelasting).toBe(14_203)
    })
  })
})

// ── Regressie: fix verlaagt de heffing t.o.v. de oude (foute) constanten ──────

describe('regressie — 2026-actualisatie verlaagt de overschatte heffing', () => {
  it('erf kind €300.000: nieuw €38.887, ~€595 lager dan de oude fout (€39.483)', () => {
    const nu = berekenErfbelasting(300_000, 'kind', 2026).totaalBelasting
    expect(nu).toBe(38_887)
    // Oude constanten (kind €25.490 / grens €154.197) gaven €39.483.
    const oud = 39_483
    expect(oud - nu).toBeGreaterThanOrEqual(590)
    expect(oud - nu).toBeLessThanOrEqual(600)
  })
  it('schenking kind €200.000: nieuw €22.752, exact €502 lager dan de oude fout (€23.254)', () => {
    const nu = berekenSchenkbelasting(200_000, 'kind', 2026).belasting
    expect(nu).toBe(22_752)
    expect(23_254 - nu).toBe(502)
  })
})

// ── Lookup & fallback ────────────────────────────────────────────────────────

describe('resolveSchenkErfParams — lookup & fallback', () => {
  it('geeft de exacte jaarlaag voor bekende jaren', () => {
    expect(resolveSchenkErfParams(2024)).toBe(SCHENK_ERF_PARAMS[2024])
    expect(resolveSchenkErfParams(2025)).toBe(SCHENK_ERF_PARAMS[2025])
    expect(resolveSchenkErfParams(2026)).toBe(SCHENK_ERF_PARAMS[2026])
  })
  it('valt bij een toekomstig jaar terug op het hoogste bekende jaar', () => {
    expect(resolveSchenkErfParams(2027)).toBe(SCHENK_ERF_PARAMS[2026])
    expect(resolveSchenkErfParams(2999)).toBe(SCHENK_ERF_PARAMS[2026])
  })
  it('valt vóór alle lagen terug op het vroegst bekende jaar', () => {
    expect(resolveSchenkErfParams(2000)).toBe(SCHENK_ERF_PARAMS[2024])
  })
  it('default (geen jaar) levert een geldige jaarlaag met positieve schijfgrens', () => {
    const p = resolveSchenkErfParams()
    expect(p).toBeDefined()
    expect(p.grens).toBeGreaterThan(0)
    expect(p.schenking.vrijstelling.kind).toBeGreaterThan(0)
    expect(p.erfbelasting.vrijstelling.partner).toBeGreaterThan(0)
  })
})

// ── Drift-guard: UI-teksten worden generatief uit SCHENK_ERF_PARAMS opgebouwd ─

describe('erfenis-prefab UI-teksten — generatief uit SCHENK_ERF_PARAMS', () => {
  it('tip + select-opties + select-tip zijn 1:1 de generator-output (geen losse literals)', () => {
    const inh = LIFE_EVENT_CATALOG.inheritance
    expect(inh.tip).toBe(formatErfenisTipTekst())
    const relatieField = inh.fields?.find((f) => f.key === 'erfbelastingSchijf')
    expect(relatieField?.options).toEqual(formatErfenisRelatieOpties())
    expect(relatieField?.tip).toBe(formatErfenisRelatieTip())
  })

  it('elke jaarlaag toont exact zijn eigen vrijstellingen (geen kruisbesmetting tussen jaren)', () => {
    for (const jaar of [2024, 2025, 2026]) {
      const p = SCHENK_ERF_PARAMS[jaar].erfbelasting.vrijstelling
      const kindEuro = '€' + p.kind.toLocaleString('nl-NL')
      const partnerEuro = '€' + p.partner.toLocaleString('nl-NL')
      const opties = formatErfenisRelatieOpties(jaar)
      expect(opties.find((o) => o.value === 'kind')!.label).toContain(kindEuro)
      expect(opties.find((o) => o.value === 'partner')!.label).toContain(partnerEuro)
      const tip = formatErfenisTipTekst(jaar)
      expect(tip).toContain(kindEuro)
      expect(tip).toContain(partnerEuro)
      expect(tip).toContain(String(jaar))
    }
  })

  it('2026-labels tonen de geactualiseerde bedragen (€26.230 kind, €828.035 partner)', () => {
    const opties = formatErfenisRelatieOpties(2026)
    expect(opties.find((o) => o.value === 'kind')!.label).toBe('Kind (vrijstelling €26.230)')
    expect(opties.find((o) => o.value === 'partner')!.label).toBe('Partner (vrijstelling €828.035)')
  })
})

// ── Eenmalig verhoogde schenkvrijstelling (phase-analysis berekenpad) ─────────

describe('analyzeSchenkingPlan — eenmalig verhoogde vrijstelling', () => {
  const ctx = {
    currentPortfolio: 500_000,
    yearlyExpenses: 30_000,
    annualSavings: 20_000,
    expectedReturn: 0.06,
    inflationRate: 0.02,
    currentAge: 40,
    fireAge: 55,
  }

  it('eenmalig verhoogd verlaagt de schenkbelasting t.o.v. alleen de jaarlijkse vrijstelling', () => {
    const base = { relatieOntvanger: 'kind' as const, bedragPerJaar: 50_000, aantalOntvangers: 1, aantalJaren: 1, startAge: 40 }
    const zonder = analyzeSchenkingPlan({ ...base, gebruikEenmaligVerhoogd: false }, ctx)
    const met = analyzeSchenkingPlan({ ...base, gebruikEenmaligVerhoogd: true }, ctx)
    expect(met.totaalSchenkbelasting).toBeLessThan(zonder.totaalSchenkbelasting)
  })

  it('een schenking binnen (jaarlijkse + eenmalig verhoogde) vrijstelling is onbelast', () => {
    const p = resolveSchenkErfParams().schenking
    const binnenGrens = p.vrijstelling.kind + p.eenmaligVerhoogdKind
    const res = analyzeSchenkingPlan(
      { relatieOntvanger: 'kind', bedragPerJaar: binnenGrens, aantalOntvangers: 1, aantalJaren: 1, startAge: 40, gebruikEenmaligVerhoogd: true },
      ctx,
    )
    expect(res.totaalSchenkbelasting).toBe(0)
  })
})
