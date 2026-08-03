import { describe, it, expect } from 'vitest'
import {
  tipTypeForSource,
  resolveTipFreedomDays,
  tipPriorityForRank,
  tipGenerationId,
  filterDuplicateCandidates,
  type LocalTipCandidate,
} from './local-tips-context'

/**
 * Tests voor de deterministische afleidingen van het lokale tips-pad.
 *
 * Alles wat het cloudmodel mocht kiezen of uitrekenen — het type, de
 * vrijheidsdagen, de prioriteit, het weren van duplicaten — is hier code
 * geworden. Deze suite pint dat gedrag vast.
 */

const kandidaat = (overrides: Partial<LocalTipCandidate> = {}): LocalTipCandidate => ({
  id: 'budget:boodschappen',
  bron: 'budget',
  titel: 'Bespaar op Boodschappen',
  toelichting: null,
  besparingPerJaar: 1080,
  euroImpactMonthly: 90,
  vrijheidsdagen: 11,
  vrijheidsdagenToegestaan: true,
  budgetSlug: 'boodschappen',
  type: 'budget_optimization',
  priority: 5,
  ...overrides,
})

const bestaand = (o: Partial<Parameters<typeof filterDuplicateCandidates>[1][number]>) => ({
  ai_generation_id: null,
  related_budget_slug: null,
  title: 'iets',
  status: 'pending',
  created_at: new Date().toISOString(),
  ...o,
})

describe('tipTypeForSource — deterministische type-afleiding', () => {
  it('leidt elk type af uit de bron, zonder het model te raadplegen', () => {
    expect(tipTypeForSource('budget')).toBe('budget_optimization')
    expect(tipTypeForSource('abonnement')).toBe('budget_optimization')
    expect(tipTypeForSource('debt')).toBe('debt_acceleration')
    expect(tipTypeForSource('jaarruimte')).toBe('asset_reallocation')
    expect(tipTypeForSource('tax')).toBe('asset_reallocation')
    expect(tipTypeForSource('asset')).toBe('asset_reallocation')
  })

  it('levert altijd een geldig DB-enum op', () => {
    const toegestaan = new Set([
      'budget_optimization',
      'asset_reallocation',
      'debt_acceleration',
      'income_increase',
      'savings_boost',
    ])
    for (const bron of ['budget', 'abonnement', 'debt', 'jaarruimte', 'tax', 'asset'] as const) {
      expect(toegestaan.has(tipTypeForSource(bron))).toBe(true)
    }
  })
})

describe('resolveTipFreedomDays — de compliance-regel', () => {
  const essentieel = new Set(['boodschappen'])

  it('geeft de dagen alleen bij een essentieel budget én de essential_budgets-methode', () => {
    expect(
      resolveTipFreedomDays({
        budgetSlug: 'boodschappen',
        rawFreedomDays: 11.4,
        essentialBudgetSlugs: essentieel,
        usesEssentialBudgets: true,
      }),
    ).toBe(11)
  })

  it('geeft 0 bij een niet-essentieel budget', () => {
    expect(
      resolveTipFreedomDays({
        budgetSlug: 'uit-eten',
        rawFreedomDays: 40,
        essentialBudgetSlugs: essentieel,
        usesEssentialBudgets: true,
      }),
    ).toBe(0)
  })

  it('geeft 0 bij een andere retirement-methode', () => {
    expect(
      resolveTipFreedomDays({
        budgetSlug: 'boodschappen',
        rawFreedomDays: 40,
        essentialBudgetSlugs: essentieel,
        usesEssentialBudgets: false,
      }),
    ).toBe(0)
  })

  it('geeft 0 zonder budget-slug — precies zoals de cloudroute', () => {
    // Fiscale lever, schuld, bezit en abonnement hebben geen budget en dus nooit
    // een vrijheidsdagen-claim. De lokale tips beloven zo nooit méér dan de cloud.
    expect(
      resolveTipFreedomDays({
        budgetSlug: null,
        rawFreedomDays: 99,
        essentialBudgetSlugs: essentieel,
        usesEssentialBudgets: true,
      }),
    ).toBe(0)
  })

  it('geeft 0 bij een onbruikbaar ruw getal', () => {
    for (const raw of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveTipFreedomDays({
          budgetSlug: 'boodschappen',
          rawFreedomDays: raw,
          essentialBudgetSlugs: essentieel,
          usesEssentialBudgets: true,
        }),
      ).toBe(0)
    }
  })
})

describe('tipPriorityForRank', () => {
  it('geeft de grootste kans de hoogste prioriteit en klemt op 1-5', () => {
    expect(tipPriorityForRank(0)).toBe(5)
    expect(tipPriorityForRank(1)).toBe(4)
    expect(tipPriorityForRank(4)).toBe(1)
    // Ook buiten het verwachte bereik blijft de DB-CHECK (1-5) gerespecteerd.
    expect(tipPriorityForRank(9)).toBe(1)
    expect(tipPriorityForRank(-3)).toBe(5)
  })
})

describe('tipGenerationId', () => {
  it('geeft een stabiele, namespaced sleutel per kans', () => {
    expect(tipGenerationId('budget:boodschappen')).toBe('lokaal:budget:boodschappen')
  })
})

describe('filterDuplicateCandidates — dedupe, deterministisch', () => {
  it('weert een kans die al als openstaande aanbeveling bestaat (generatie-sleutel)', () => {
    const out = filterDuplicateCandidates(
      [kandidaat()],
      [bestaand({ ai_generation_id: 'lokaal:budget:boodschappen', status: 'pending' })],
    )
    expect(out).toHaveLength(0)
  })

  it('weert een kans wanneer dezelfde budgetcategorie al een voorstel heeft', () => {
    const out = filterDuplicateCandidates(
      [kandidaat()],
      [bestaand({ related_budget_slug: 'boodschappen', status: 'accepted' })],
    )
    expect(out).toHaveLength(0)
  })

  it('weert een kans met dezelfde canonieke titel (case-/witruimte-ongevoelig)', () => {
    const out = filterDuplicateCandidates(
      [kandidaat({ budgetSlug: null })],
      [bestaand({ title: '  bespaar op   BOODSCHAPPEN ', status: 'postponed' })],
    )
    expect(out).toHaveLength(0)
  })

  it('laat een kans staan waarvan de afwijzing lang geleden is', () => {
    const lang = new Date('2026-01-01T00:00:00.000Z').toISOString()
    const out = filterDuplicateCandidates(
      [kandidaat()],
      [bestaand({ ai_generation_id: 'lokaal:budget:boodschappen', status: 'rejected', created_at: lang })],
      new Date('2026-08-01T00:00:00.000Z'),
    )
    expect(out).toHaveLength(1)
  })

  it('weert een kans die kort geleden is afgewezen', () => {
    const kort = new Date('2026-07-20T00:00:00.000Z').toISOString()
    const out = filterDuplicateCandidates(
      [kandidaat()],
      [bestaand({ ai_generation_id: 'lokaal:budget:boodschappen', status: 'rejected', created_at: kort })],
      new Date('2026-08-01T00:00:00.000Z'),
    )
    expect(out).toHaveLength(0)
  })

  it('laat een onbekende kans gewoon door', () => {
    const out = filterDuplicateCandidates(
      [kandidaat({ id: 'debt:x', titel: 'Los je creditcard af', budgetSlug: null })],
      [bestaand({ ai_generation_id: 'lokaal:budget:boodschappen', title: 'Bespaar op Boodschappen' })],
    )
    expect(out).toHaveLength(1)
  })
})
