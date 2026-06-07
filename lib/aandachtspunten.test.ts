import { describe, it, expect } from 'vitest'
import {
  aandachtspuntToActionPayload,
  taxOpportunitiesToAandachtspunten,
  budgetBenchmarksToAandachtspunten,
  debtsToAandachtspunten,
  DEBT_INTEREST_THRESHOLD,
  type Aandachtspunt,
  type BudgetBenchmarkLike,
} from './aandachtspunten'
import type { TaxOpportunity } from './tax-overview'
import type { Debt } from './debt-data'

// ── Fixtures ─────────────────────────────────────────────────

/** Minimale Debt-factory — alleen de velden die de adapter leest matteren. */
function makeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'd1',
    user_id: 'u1',
    name: 'Test schuld',
    debt_type: 'personal_loan',
    original_amount: 10_000,
    current_balance: 10_000,
    interest_rate: 8,
    minimum_payment: 100,
    monthly_payment: 100,
    start_date: '2024-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  }
}

// ── taxOpportunitiesToAandachtspunten ────────────────────────

describe('taxOpportunitiesToAandachtspunten', () => {
  it('mapt opportunities 1-op-1 met tax: namespace en domain tax', () => {
    const opps: TaxOpportunity[] = [
      {
        id: 'jaarruimte',
        title: 'Benut je jaarruimte',
        box: 1,
        savings: 1200,
        freedomDays: 12,
        deadline: '31 dec',
        href: '/overzicht/belasting/box1',
      },
      {
        id: 'tegenbewijs',
        title: 'Tegenbewijs werkelijk rendement',
        box: 3,
        savings: 500,
        freedomDays: 5,
        href: '/overzicht/belasting/box3',
      },
    ]

    const result = taxOpportunitiesToAandachtspunten(opps)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'tax:jaarruimte',
      domain: 'tax',
      title: 'Benut je jaarruimte',
      savings: 1200,
      freedomDays: 12,
      deadline: '31 dec',
      href: '/overzicht/belasting/box1',
    })
    expect(result[1].id).toBe('tax:tegenbewijs')
    expect(result[1].deadline).toBeUndefined()
  })

  it('levert lege array bij geen opportunities', () => {
    expect(taxOpportunitiesToAandachtspunten([])).toEqual([])
  })
})

// ── budgetBenchmarksToAandachtspunten ────────────────────────

describe('budgetBenchmarksToAandachtspunten', () => {
  it('filtert delta <= 0 weg en behoudt alleen overschrijdingen', () => {
    const benchmarks: BudgetBenchmarkLike[] = [
      { nibud_category_name: 'Boodschappen', delta: 100, freedom_days_potential: 4, mapped_budget_slug: 'boodschappen' },
      { nibud_category_name: 'Vervoer', delta: 0, freedom_days_potential: 0, mapped_budget_slug: 'brandstof-ov' },
      { nibud_category_name: 'Kleding', delta: -50, freedom_days_potential: 0, mapped_budget_slug: 'kleding-overige' },
    ]
    const result = budgetBenchmarksToAandachtspunten(benchmarks)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'budget:boodschappen',
      domain: 'budget',
      savings: 1200, // 100 × 12
      euroImpactMonthly: 100,
      freedomDays: 4,
      href: '/overzicht/cashflow',
    })
    expect(result[0].title).toContain('Boodschappen')
  })

  it('valt terug op categorienaam wanneer slug ontbreekt', () => {
    const result = budgetBenchmarksToAandachtspunten([
      { nibud_category_name: 'Overig', delta: 25, freedom_days_potential: 1 },
    ])
    expect(result[0].id).toBe('budget:Overig')
  })
})

// ── debtsToAandachtspunten ───────────────────────────────────

describe('debtsToAandachtspunten', () => {
  it('berekent jaarlijkse rentelast als savings en vrijheidsdagen', () => {
    const debts = [makeDebt({ id: 'd1', name: 'Creditcard', current_balance: 5000, interest_rate: 14 })]
    const result = debtsToAandachtspunten(debts, 100)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'debt:d1',
      domain: 'debt',
      title: 'Versneld aflossen: Creditcard',
      savings: 700, // 5000 × 0.14
      freedomDays: 7, // 700 / 100
      href: '/overzicht/schulden',
    })
  })

  it('slaat inactieve schulden, nul-saldo en lage rente over', () => {
    const debts = [
      makeDebt({ id: 'inactive', is_active: false, interest_rate: 10 }),
      makeDebt({ id: 'zero', current_balance: 0, interest_rate: 10 }),
      makeDebt({ id: 'lowrate', interest_rate: DEBT_INTEREST_THRESHOLD - 0.5 }),
      makeDebt({ id: 'mortgage', debt_type: 'mortgage', interest_rate: 3.8, current_balance: 200_000 }),
    ]
    const result = debtsToAandachtspunten(debts, 100)
    expect(result).toEqual([])
  })

  it('neemt schulden op de drempel mee', () => {
    const debts = [makeDebt({ id: 'atthreshold', interest_rate: DEBT_INTEREST_THRESHOLD, current_balance: 1000 })]
    const result = debtsToAandachtspunten(debts, 100)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('debt:atthreshold')
  })

  it('zet freedomDays op 0 bij dailyExpenses <= 0 (geen deel-door-nul)', () => {
    const debts = [makeDebt({ current_balance: 5000, interest_rate: 14 })]
    const result = debtsToAandachtspunten(debts, 0)
    expect(result[0].freedomDays).toBe(0)
    expect(result[0].savings).toBe(700)
  })
})

// ── aandachtspuntToActionPayload ─────────────────────────────

describe('aandachtspuntToActionPayload', () => {
  it('mapt alle velden + metadata correct', () => {
    const a: Aandachtspunt = {
      id: 'tax:jaarruimte',
      domain: 'tax',
      title: 'Benut je jaarruimte',
      savings: 1200,
      freedomDays: 12.4,
      deadline: '31 dec',
      href: '/overzicht/belasting/box1',
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.title).toBe('Benut je jaarruimte')
    expect(payload.freedom_days_impact).toBe(12) // afgerond
    expect(payload.euro_impact_monthly).toBe(100) // savings / 12
    expect(payload.metadata).toEqual({
      kind: 'aandachtspunt',
      domain: 'tax',
      aandachtspunt_id: 'tax:jaarruimte',
    })
    expect(payload.description).toContain('1.200')
    expect(payload.description).toContain('vrijheidsdagen')
    expect(payload.description).toContain('31 dec')
    expect(payload.description).toContain('/overzicht/belasting/box1')
  })

  it('laat due_date weg bij niet-parsebare deadline-tekst', () => {
    const a: Aandachtspunt = {
      id: 'tax:x',
      domain: 'tax',
      title: 'X',
      savings: 0,
      freedomDays: 0,
      deadline: '31 dec',
      href: '/x',
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.due_date).toBeUndefined()
  })

  it('zet due_date wanneer deadline een ISO-datum is', () => {
    const a: Aandachtspunt = {
      id: 'tax:x',
      domain: 'tax',
      title: 'X',
      savings: 100,
      freedomDays: 1,
      deadline: '2026-12-31',
      href: '/x',
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.due_date).toBe('2026-12-31')
  })

  it('gebruikt expliciete euroImpactMonthly boven savings/12', () => {
    const a: Aandachtspunt = {
      id: 'budget:boodschappen',
      domain: 'budget',
      title: 'Bespaar op Boodschappen',
      savings: 1200,
      euroImpactMonthly: 100,
      freedomDays: 4,
      href: '/overzicht/cashflow',
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.euro_impact_monthly).toBe(100)
  })

  it('laat euro_impact_monthly weg bij savings 0 en geen expliciete waarde', () => {
    const a: Aandachtspunt = {
      id: 'tax:dga',
      domain: 'tax',
      title: 'Lening boven leengrens',
      savings: 0,
      freedomDays: 0,
      href: '/overzicht/belasting/box2',
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.euro_impact_monthly).toBeUndefined()
    // description valt terug op alleen de bron-link.
    expect(payload.description).toBe('Meer: /overzicht/belasting/box2')
  })

  it('neemt priority over als priority_score', () => {
    const a: Aandachtspunt = {
      id: 'debt:d1',
      domain: 'debt',
      title: 'Versneld aflossen: Creditcard',
      savings: 700,
      freedomDays: 7,
      href: '/overzicht/schulden',
      priority: 5,
    }
    const payload = aandachtspuntToActionPayload(a)
    expect(payload.priority_score).toBe(5)
  })
})
