import { describe, expect, it, vi } from 'vitest'
import type { SimResult } from '@/lib/fire-simulation'
import type { FirePlan } from '@/lib/fire-strategy'
import type { RegelProjection, RegelSimOverride } from '@/lib/future/regel-sim'
import { buildPlanReviewStap, type PlanReviewBronnen, type PlanReviewStapOverzicht } from './overzicht'
import { PLAN_REVIEW_STAPPEN, type PlanReviewFacts } from './types'

/**
 * De inhoud van de review-stappen (TPR-01). Wat hier vastligt:
 *  - A3: elke toepasselijke stap opent met "De app rekent nu …";
 *  - A4: het effect komt uit de kernel-run (`sim`) en uit de vergelijkingsrun (`run`),
 *    niet uit een eigen som — de bijt-proef hieronder laat een andere run-uitkomst
 *    letterlijk in de tekst terugkomen;
 *  - A5: bevestigen schrijft alleen via de vier bestaande routes;
 *  - A8: geen aansporende of adviserende woorden.
 */

const PLAN_SOLVED: FirePlan = { anchor: { kind: 'solved' }, endForm: 'deplete', endAge: 90, legacyAmount: 0 }

function sim(fireAgeFractional: number | null, extra: Partial<SimResult> = {}): SimResult {
  return {
    rows: [{ age: 40 }],
    fireAge: fireAgeFractional == null ? null : Math.ceil(fireAgeFractional),
    fireAgeFractional,
    kernelDepletionMonth: null,
    displayEndAge: 90,
    ...extra,
  } as unknown as SimResult
}

const FACTS_ALLES: PlanReviewFacts = {
  hasAowEvent: true,
  hasEigenHuis: true,
  hasNietLiquideBezit: true,
  housingConfigured: true,
}

function bronnen(overrides: Partial<PlanReviewBronnen> = {}): PlanReviewBronnen {
  return {
    sim: sim(55.4),
    firePlan: PLAN_SOLVED,
    aowAge: 67.25,
    profile: {
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      withdrawal_profile_config: { profiel: 'afnemend', gogo_pct: 100 },
      pot_rules: { surplus_group: 'spaargeld' },
      housing_strategy_config: { mode: 'exclude_from_fire' },
    },
    events: [
      { event_type: 'aow', is_active: true, metadata: { leefsituatie: 'samenwonend', jarenBuitenNL: 2 } },
      { event_type: 'pension', is_active: true, metadata: {} },
    ],
    assets: [
      { asset_type: 'eigen_huis', is_active: true, sale_config: null },
      { asset_type: 'vehicle', is_active: true, sale_config: null },
    ],
    uitgaveNaPensioenPerJaar: 30000,
    facts: FACTS_ALLES,
    run: () => ({ rows: [], fireAgeFractional: 58.2, reach: { kind: 'onbekend' } }),
    ...overrides,
  }
}

function alles(b: PlanReviewBronnen): PlanReviewStapOverzicht[] {
  return PLAN_REVIEW_STAPPEN.map((s) => buildPlanReviewStap(s, b))
}

describe('plan-review overzicht — keuze · effect · waarom', () => {
  it('A3 — elke stap opent met wat de app nu rekent en draagt effect én waarom', () => {
    for (const o of alles(bronnen())) {
      expect(o.rekentNu, o.stap).toMatch(/De app rekent nu/)
      expect(o.effect.length, `${o.stap}: effect ontbreekt`).toBeGreaterThan(0)
      expect(o.waarom.length, `${o.stap}: waarom ontbreekt`).toBeGreaterThan(40)
    }
  })

  it('A4 — het effect leest de kernel-run; een andere run-uitkomst staat letterlijk in de vergelijking (bijt-proef)', () => {
    const run = vi.fn((_: RegelSimOverride): RegelProjection => ({ rows: [], fireAgeFractional: 61.7, reach: { kind: 'onbekend' } }))
    const plan = buildPlanReviewStap('plan', bronnen({ run }))
    expect(plan.effect[0]).toContain('vrijheidsleeftijd 55')
    expect(plan.vergelijking.map((r) => r.waarde)).toEqual([
      'vrijheidsleeftijd 55',
      'vrijheidsleeftijd 62',
      'vrijheidsleeftijd 62',
    ])
    // De vergelijking rekent met vijf jaar langer reiken, via de plan-override.
    expect(run).toHaveBeenCalledWith({ firePlan: expect.objectContaining({ endAge: 95 }) })
  })

  it('ADR 0149 — "Geen tekort-lening in mijn plan": detailregel, effect en een vergelijking met de andere stand', () => {
    const run = vi.fn((_: RegelSimOverride): RegelProjection => ({ rows: [], fireAgeFractional: 58.2, reach: { kind: 'onbekend' } }))
    const uit = buildPlanReviewStap('plan', bronnen({ run }))
    expect(uit.details).toContainEqual({ label: 'Tekort-lening in je plan', waarde: 'toegestaan' })
    expect(uit.effect.join(' ')).toContain('Tekort-lening toegestaan')
    expect(run).toHaveBeenCalledWith({ geenTekortLening: true })
    expect(uit.vergelijking.at(-1)).toEqual({ label: 'Tekort-lening niet toegestaan', waarde: 'vrijheidsleeftijd 58' })

    run.mockClear()
    const aan = buildPlanReviewStap('plan', bronnen({ run, profile: { fire_no_deficit_loan: true } }))
    expect(aan.details).toContainEqual({ label: 'Tekort-lening in je plan', waarde: 'niet toegestaan' })
    expect(run).toHaveBeenCalledWith({ geenTekortLening: false })
  })

  it('onder een vast stopmoment telt tot waar het liquide vermogen reikt, niet de vrijheidsleeftijd', () => {
    const vast: FirePlan = { ...PLAN_SOLVED, anchor: { kind: 'age', age: 60 } }
    const o = buildPlanReviewStap(
      'plan',
      bronnen({ firePlan: vast, sim: sim(60, { kernelDepletionMonth: 12 * 45 }), run: null }),
    )
    expect(o.effect[0]).toContain('liquide vermogen reikt tot je 85e')
    expect(o.effect[0]).not.toContain('vrijheidsleeftijd')
  })

  it('zonder run (geen snapshot) valt de vergelijking weg in plaats van te gokken', () => {
    const o = buildPlanReviewStap('uitgaven', bronnen({ run: null }))
    expect(o.vergelijking).toEqual([])
  })

  it('A5 — bevestigen schrijft uitsluitend via de bestaande domeinroutes', () => {
    const toegestaan = ['/api/fire-settings', '/api/withdrawal-strategy', '/api/pot-rules', '/api/housing-strategy']
    for (const o of alles(bronnen())) {
      for (const a of [...o.schrijf, ...o.keuzes.flatMap((k) => k.schrijf)]) {
        expect(toegestaan, `${o.stap}: ${a.url}`).toContain(a.url)
      }
    }
  })

  it('A8 — geen aansporende of adviserende taal in welke stap dan ook', () => {
    const tekst = JSON.stringify([
      ...alles(bronnen()),
      ...alles(bronnen({ facts: { ...FACTS_ALLES, hasAowEvent: false, housingConfigured: false } })),
    ]).toLowerCase()
    for (const verboden of ['aanbevol', 'past bij', 'advies', 'je moet', 'raden we', 'verstandig', 'beste keuze', 'onrealistisch']) {
      expect(tekst, verboden).not.toContain(verboden)
    }
  })
})

describe('effectmaat in drie treden (TPR-15, besluit eigenaar 13 sep 2026)', () => {
  // "Tessa": kan nu al stoppen (vrijheidsleeftijd = huidige leeftijd 42), geld raakt nooit op.
  // formatCurrency zet een harde spatie tussen € en het bedrag.
  const norm = (t: string) => t.replace(/\u00a0/g, ' ')
  const nuVrij = () => sim(42, { rows: [{ age: 42 }] as unknown as SimResult['rows'], kernelDepletionMonth: null })

  function projectie(p: Partial<RegelProjection>): RegelProjection {
    return { rows: [], fireAgeFractional: 42, reach: { kind: 'gedekt', endAge: 90 }, eindeLiquide: null, ...p }
  }

  it('trede 3 — kan al stoppen en reikt tot het einde: het liquide eindbedrag, één keer gedeflateerd', () => {
    const run = vi.fn((o: RegelSimOverride): RegelProjection =>
      Object.keys(o).length === 0
        ? projectie({ eindeLiquide: { leeftijd: 89, nominaal: 2_000_000, inflationFactor: 2 } })
        : projectie({ eindeLiquide: { leeftijd: 89, nominaal: 1_500_000, inflationFactor: 2 } }),
    )
    const o = buildPlanReviewStap('uitgaven', bronnen({ sim: nuVrij(), run }))
    // Basis: de snapshot-run zónder override levert het eindbedrag (de SimResult draagt het niet).
    expect(run).toHaveBeenCalledWith({})
    expect(norm(o.effect[0])).toContain("€ 1.000.000 liquide vermogen over in het laatste jaar van je plan (je 89e), in euro's van vandaag")
    expect(o.vergelijking.map((r) => norm(r.waarde))).toEqual([
      "€ 1.000.000 liquide vermogen over in het laatste jaar van je plan (je 89e), in euro's van vandaag",
      "€ 750.000 liquide vermogen over in het laatste jaar van je plan (je 89e), in euro's van vandaag",
    ])
    expect(JSON.stringify(o)).not.toContain('vrijheidsleeftijd 42')
  })

  it('trede 3 — een keuze die níét meer tot het einde reikt, zegt tot waar hij reikt', () => {
    const run = vi.fn((o: RegelSimOverride): RegelProjection =>
      Object.keys(o).length === 0
        ? projectie({ eindeLiquide: { leeftijd: 89, nominaal: 800_000, inflationFactor: 1 } })
        : projectie({ reach: { kind: 'reikt-tot', age: 81, endAge: 90 } }),
    )
    const o = buildPlanReviewStap('potten', bronnen({ sim: nuVrij(), run }))
    expect(o.vergelijking[1].waarde).toBe('liquide vermogen reikt tot je 81e')
  })

  it('een keuze die stoppen-nu onmogelijk maakt, noemt het latere stopmoment', () => {
    const run = vi.fn((o: RegelSimOverride): RegelProjection =>
      Object.keys(o).length === 0
        ? projectie({ eindeLiquide: { leeftijd: 89, nominaal: 500_000, inflationFactor: 1 } })
        : projectie({ fireAgeFractional: 47.3, eindeLiquide: { leeftijd: 89, nominaal: 20_000, inflationFactor: 1 } }),
    )
    const o = buildPlanReviewStap('uitgaven', bronnen({ sim: nuVrij(), run }))
    expect(o.vergelijking[1].waarde).toContain('stoppen kan dan pas op je 47e')
  })

  it('trede 2 — kan al stoppen maar zonder snapshot-run: tot waar het liquide vermogen reikt', () => {
    const o = buildPlanReviewStap('uitgaven', bronnen({ sim: nuVrij(), run: null }))
    expect(o.effect[0]).toContain('liquide vermogen reikt tot het einde van je plan (90)')
    expect(o.effect[0]).not.toContain('vrijheidsleeftijd')
  })

  it('trede 1 blijft staan zolang je nog niet kunt stoppen (geen extra basisrun)', () => {
    const run = vi.fn((_: RegelSimOverride): RegelProjection => projectie({ fireAgeFractional: 58 }))
    buildPlanReviewStap('uitgaven', bronnen({ run }))
    expect(run).not.toHaveBeenCalledWith({})
  })

  it('stap 4 — het bereik over de woonkeuzes staat in euro\'s bij trede 3', () => {
    let n = 0
    const run = vi.fn((o: RegelSimOverride): RegelProjection =>
      Object.keys(o).length === 0
        ? projectie({ eindeLiquide: { leeftijd: 89, nominaal: 400_000, inflationFactor: 1 } })
        : projectie({ eindeLiquide: { leeftijd: 89, nominaal: 400_000 + 100_000 * ++n, inflationFactor: 1 } }),
    )
    const o = buildPlanReviewStap('woning', bronnen({ sim: nuVrij(), run }))
    expect(norm(o.effect[0])).toBe(
      "Afhankelijk van wat je met je huis doet blijft er in het laatste jaar van je plan tussen € 400.000 en € 700.000 aan liquide vermogen over, in euro's van vandaag.",
    )
  })
})

describe('stap 1 — Je plan', () => {
  it('schrijft het volledige huidige plan naar /api/fire-settings', () => {
    const o = buildPlanReviewStap('plan', bronnen())
    expect(o.schrijf).toEqual([
      {
        url: '/api/fire-settings',
        body: { fire_end_strategy: 'deplete', fire_end_age: 90, fire_legacy_amount: null, fire_stop_anchor: 'solved', fire_stop_age: null },
      },
    ])
  })

  it('"niet slinken" heeft geen eindleeftijd en dus geen langer-reiken-vergelijking', () => {
    const o = buildPlanReviewStap('plan', bronnen({ firePlan: { ...PLAN_SOLVED, endForm: 'perpetual' } }))
    // Alleen de tekort-lening-vergelijking (ADR 0149), geen "geld reikt tot"-regels.
    expect(o.vergelijking.map((r) => r.label)).toEqual(['Tekort-lening toegestaan (nu)', 'Tekort-lening niet toegestaan'])
    expect(o.rekentNu).toContain('niet mag slinken')
  })

  it('houdt AOW in hoofdletters bij het aow-anker', () => {
    const o = buildPlanReviewStap('plan', bronnen({ firePlan: { ...PLAN_SOLVED, anchor: { kind: 'aow' } } }))
    expect(o.rekentNu).toContain('op mijn AOW-leeftijd')
  })
})

describe('stap 2 — Leven na stoppen', () => {
  it('toont het bedrag uit de kernel-invoer en vergelijkt met 10% lager via de uitgaven-override', () => {
    const run = vi.fn((_: RegelSimOverride): RegelProjection => ({ rows: [], fireAgeFractional: 52.1, reach: { kind: 'onbekend' } }))
    const o = buildPlanReviewStap('uitgaven', bronnen({ run }))
    expect(o.rekentNu).toContain('30.000')
    expect(run).toHaveBeenCalledWith({ retirementExpense: { method: 'custom_amount', customAmount: 27000 } })
    expect(o.schrijf[0]).toEqual({
      url: '/api/fire-settings',
      body: { retirement_expense_method: 'custom_amount', retirement_expense_custom_amount: 30000 },
    })
  })

  it('zonder opgeslagen methode bevestigt hij de effectieve grondslag (essentiële budgetten)', () => {
    const o = buildPlanReviewStap('uitgaven', bronnen({ profile: {} }))
    expect(o.schrijf[0].body).toEqual({ retirement_expense_method: 'essential_budgets', retirement_expense_custom_amount: null })
  })

  it('bevestigen wist een sluimerend eigen bedrag onder een andere methode niet', () => {
    const o = buildPlanReviewStap(
      'uitgaven',
      bronnen({ profile: { retirement_expense_method: 'current_income', retirement_expense_custom_amount: 25000 } }),
    )
    expect(o.schrijf[0].body).toEqual({ retirement_expense_method: 'current_income', retirement_expense_custom_amount: 25000 })
    expect(o.details.some((d) => d.label === 'Eigen bedrag')).toBe(false)
  })
})

describe('stap 3 — Wat er binnenkomt', () => {
  it('A10 — zonder AOW-gegevens: €0 benoemd en bevestigen geblokkeerd', () => {
    const o = buildPlanReviewStap('inkomsten', bronnen({ facts: { ...FACTS_ALLES, hasAowEvent: false }, events: [] }))
    expect(o.rekentNu).toContain('€ 0 AOW')
    expect(o.blokkade).not.toBeNull()
  })

  it('met AOW: leeftijd, leefsituatie en pensioenen; alleen de markering wordt gezet', () => {
    const o = buildPlanReviewStap('inkomsten', bronnen())
    expect(o.rekentNu).toContain('67 jaar en 3 maanden')
    expect(o.details).toContainEqual({ label: 'Leefsituatie', waarde: 'Samenwonend' })
    expect(o.schrijf).toEqual([])
    expect(o.blokkade).toBeNull()
  })

  it('TPR-15 — vergelijking uit dezelfde snapshot: zonder AOW en zonder pensioen (bijt-proef)', () => {
    let n = 60
    const overrides: RegelSimOverride[] = []
    const run = vi.fn((o: RegelSimOverride): RegelProjection => {
      overrides.push(o)
      return { rows: [], fireAgeFractional: ++n + 0.2, reach: { kind: 'onbekend' } }
    })
    const o = buildPlanReviewStap('inkomsten', bronnen({ run }))
    expect(overrides).toEqual([
      { lifeEvent: { vervang: { eventType: 'aow' }, event: null } },
      { lifeEvent: { vervang: { eventType: 'pension' }, event: null } },
    ])
    expect(o.vergelijking).toEqual([
      { label: 'Met je AOW-gegevens (nu)', waarde: 'vrijheidsleeftijd 55' },
      { label: 'Zonder AOW', waarde: 'vrijheidsleeftijd 61' },
      { label: 'Zonder je pensioenregeling', waarde: 'vrijheidsleeftijd 62' },
    ])
  })

  it('TPR-15 — zonder AOW-gegevens rekent de vergelijking de AOW die opslaan zou aanmaken (alleenstaand, 0 jaar)', () => {
    const overrides: RegelSimOverride[] = []
    const run = vi.fn((o: RegelSimOverride): RegelProjection => {
      overrides.push(o)
      return { rows: [], fireAgeFractional: 52.4, reach: { kind: 'onbekend' } }
    })
    const o = buildPlanReviewStap('inkomsten', bronnen({ run, facts: { ...FACTS_ALLES, hasAowEvent: false }, events: [] }))
    const event = overrides[0]?.lifeEvent?.event
    expect(overrides[0]?.lifeEvent?.vervang).toEqual({ eventType: 'aow' })
    expect(event).toMatchObject({
      event_type: 'aow',
      target_age: 68,
      metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 },
    })
    expect(o.vergelijking.at(-1)).toEqual({ label: 'Met AOW als alleenstaande', waarde: 'vrijheidsleeftijd 52' })
  })
})

describe('stap 4 — Je huis en ander vast bezit', () => {
  it('zet de vier woonstrategieën in vaste volgorde naast elkaar met een bereik (A4)', () => {
    let n = 50
    const run = vi.fn((): RegelProjection => ({ rows: [], fireAgeFractional: ++n, reach: { kind: 'onbekend' } }))
    const o = buildPlanReviewStap('woning', bronnen({ run }))
    expect(o.keuzes.map((k) => k.id)).toEqual(['include_full', 'exclude_from_fire', 'downsize', 'reverse_mortgage'])
    // De huidige keuze (exclude) leest de basisrun; de andere drie draaien apart.
    expect(run).toHaveBeenCalledTimes(3)
    expect(o.keuzes.find((k) => k.huidig)?.id).toBe('exclude_from_fire')
    expect(o.effect[0]).toMatch(/tussen \d+ en \d+/)
    expect(o.keuzeVerplicht).toBe(false)
  })

  it('zonder opgeslagen woonstrategie moet er eerst gekozen worden; de beginnerskeuzes gaan via `choice`', () => {
    const o = buildPlanReviewStap(
      'woning',
      bronnen({ facts: { ...FACTS_ALLES, housingConfigured: false }, profile: {} }),
    )
    expect(o.keuzeVerplicht).toBe(true)
    expect(o.schrijf).toEqual([])
    expect(o.keuzes.some((k) => k.huidig)).toBe(false)
    expect(o.keuzes.find((k) => k.id === 'downsize')?.schrijf[0].body).toEqual({ choice: 'sell' })
    expect(o.keuzes.find((k) => k.id === 'exclude_from_fire')?.schrijf[0].body).toEqual({ choice: 'exclude' })
  })

  it('ander vast bezit: telt per verkoopinstelling, zonder instelling = wanneer nodig', () => {
    const o = buildPlanReviewStap('woning', bronnen())
    expect(o.details).toContainEqual({ label: 'Verkoopinstelling: verkopen wanneer het nodig is', waarde: '1' })
  })
})

describe('stap 5 — Hoe je potten werken', () => {
  it('bevestigt het huidige profiel en de volledige pot-regels expliciet (TPR-05: default ≠ keuze)', () => {
    const o = buildPlanReviewStap('potten', bronnen())
    expect(o.schrijf).toEqual([
      { url: '/api/withdrawal-strategy', body: { withdrawal_profile_config: { profiel: 'afnemend', gogo_pct: 100 } } },
      {
        url: '/api/pot-rules',
        body: expect.objectContaining({ surplusGroup: 'spaargeld', withdrawalOrderGroups: expect.any(Array) }),
      },
    ])
  })

  it('vergelijkt met "vast" wanneer het profiel iets anders is', () => {
    const run = vi.fn((_: RegelSimOverride): RegelProjection => ({ rows: [], fireAgeFractional: 57, reach: { kind: 'onbekend' } }))
    buildPlanReviewStap('potten', bronnen({ run }))
    expect(run).toHaveBeenCalledWith({ withdrawalProfileConfig: { profiel: 'vast', gogo_pct: 100 } })
  })
})
