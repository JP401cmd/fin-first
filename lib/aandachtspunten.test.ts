import { describe, it, expect } from 'vitest'
import {
  aandachtspuntToActionPayload,
  taxOpportunitiesToAandachtspunten,
  budgetBenchmarksToAandachtspunten,
  debtsToAandachtspunten,
  assetsToAandachtspunten,
  filterActionedAandachtspunten,
  collectActionedIds,
  ACTIONED_COMPLETED_WINDOW_MONTHS,
  type ActionSuppressionRow,
  DEBT_INTEREST_THRESHOLD,
  CASH_BUFFER_MONTHS,
  MIN_CASH_EXCESS,
  type Aandachtspunt,
  type BudgetBenchmarkLike,
} from './aandachtspunten'
import type { TaxOpportunity } from './tax-optimizer'
import type { Debt } from './debt-data'
import type { Asset } from './asset-data'

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

/** Minimale Asset-factory — de adapter leest alleen is_active/asset_type/current_value. */
function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a1',
    user_id: 'u1',
    name: 'Spaarrekening',
    asset_type: 'savings',
    current_value: 0,
    is_active: true,
    ...overrides,
  } as unknown as Asset
}

// ── taxOpportunitiesToAandachtspunten ────────────────────────

describe('taxOpportunitiesToAandachtspunten', () => {
  it('mapt opportunities met tax: namespace, domain tax en de NETTO velden', () => {
    const opps: TaxOpportunity[] = [
      {
        id: 'jaarruimte',
        title: 'Benut je jaarruimte',
        box: 1,
        savings: 1200,
        netEffect: 1200,
        netFreedomDays: 12,
        deadline: '31 dec',
        href: '/overzicht/belasting/box1',
      },
      {
        id: 'samenstelling-shift',
        title: 'Meer spaargeld, minder beleggingen',
        box: 3,
        savings: 500,
        netEffect: 120,
        netFreedomDays: 1,
        href: '/overzicht/belasting/optimizer',
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
    expect(result[1].id).toBe('tax:samenstelling-shift')
    expect(result[1].deadline).toBeUndefined()
    // Grondslag: `savings`/`freedomDays` van een aandachtspunt zijn de NETTO
    // velden van de kans — een scenario dat rendement kost mag zijn bruto
    // besparing niet als opbrengst opvoeren.
    expect(result[1].savings).toBe(120)
    expect(result[1].freedomDays).toBe(1)
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
      href: '/overzicht/budget',
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

// ── assetsToAandachtspunten ──────────────────────────────────

describe('assetsToAandachtspunten', () => {
  // dailyExpenses 100 → maanduitgaven 3000 → buffer = 6 × 3000 = €18.000.
  const DAILY = 100
  const INFLATION = 0.02

  it('produceert cash-drag bij overtollig spaargeld boven de buffer', () => {
    const assets = [makeAsset({ asset_type: 'savings', current_value: 50_000 })]
    const result = assetsToAandachtspunten(assets, DAILY, INFLATION)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'asset:cash-drag',
      domain: 'asset',
      title: 'Zet overtollig spaargeld aan het werk',
      savings: 640, // (50.000 − 18.000) × 0,02
      freedomDays: 6, // 640 / 100
      href: '/overzicht/bezittingen',
    })
  })

  it('telt cash + savings samen en negeert beleggingen/overig', () => {
    const assets = [
      makeAsset({ id: 'c', asset_type: 'cash', current_value: 10_000 }),
      makeAsset({ id: 's', asset_type: 'savings', current_value: 40_000 }),
      makeAsset({ id: 'i', asset_type: 'investment', current_value: 100_000 }),
    ]
    const result = assetsToAandachtspunten(assets, DAILY, INFLATION)
    expect(result).toHaveLength(1)
    expect(result[0].savings).toBe(640) // alleen 50.000 spaargeld telt mee
  })

  it('geeft niets bij spaargeld onder de noodbuffer', () => {
    const assets = [makeAsset({ current_value: 10_000 })] // < €18.000 buffer
    expect(assetsToAandachtspunten(assets, DAILY, INFLATION)).toEqual([])
  })

  it('geeft niets wanneer het overschot onder MIN_CASH_EXCESS ligt', () => {
    const assets = [makeAsset({ current_value: 21_000 })] // excess 3.000 < 5.000
    expect(assetsToAandachtspunten(assets, DAILY, INFLATION)).toEqual([])
  })

  it('negeert inactieve assets', () => {
    const assets = [makeAsset({ current_value: 50_000, is_active: false })]
    expect(assetsToAandachtspunten(assets, DAILY, INFLATION)).toEqual([])
  })

  it('geeft niets bij ontbrekende dag-uitgaven (geen verzonnen buffer)', () => {
    const assets = [makeAsset({ current_value: 50_000 })]
    expect(assetsToAandachtspunten(assets, 0, INFLATION)).toEqual([])
  })

  it('geeft niets bij inflatie <= 0', () => {
    const assets = [makeAsset({ current_value: 50_000 })]
    expect(assetsToAandachtspunten(assets, DAILY, 0)).toEqual([])
  })

  it('exporteert tunebare drempels', () => {
    expect(CASH_BUFFER_MONTHS).toBe(6)
    expect(MIN_CASH_EXCESS).toBe(5_000)
  })
})

// ── filterActionedAandachtspunten ────────────────────────────

describe('filterActionedAandachtspunten', () => {
  const punten: Aandachtspunt[] = [
    { id: 'tax:jaarruimte', domain: 'tax', title: 'Benut je jaarruimte', savings: 1200, freedomDays: 12, href: '/x' },
    { id: 'debt:d1', domain: 'debt', title: 'Versneld aflossen', savings: 700, freedomDays: 7, href: '/y' },
    { id: 'budget:boodschappen', domain: 'budget', title: 'Bespaar op Boodschappen', savings: 600, freedomDays: 6, href: '/z' },
  ]

  it('verwijdert punten met een gematchte id en behoudt de rest', () => {
    const result = filterActionedAandachtspunten(punten, new Set(['tax:jaarruimte']))
    expect(result.map((a) => a.id)).toEqual(['debt:d1', 'budget:boodschappen'])
  })

  it('verwijdert meerdere gematchte ids', () => {
    const result = filterActionedAandachtspunten(punten, new Set(['tax:jaarruimte', 'budget:boodschappen']))
    expect(result.map((a) => a.id)).toEqual(['debt:d1'])
  })

  it('geeft de volledige lijst terug bij een lege set', () => {
    const result = filterActionedAandachtspunten(punten, new Set())
    expect(result).toEqual(punten)
  })

  it('negeert ids die niet in de lijst voorkomen', () => {
    const result = filterActionedAandachtspunten(punten, new Set(['asset:cash-drag']))
    expect(result).toEqual(punten)
  })
})

// ── collectActionedIds (open + recent-afgerond binnen venster) ─

describe('collectActionedIds', () => {
  // Vaste 'now' zodat de venster-grenzen deterministisch zijn.
  const now = new Date('2026-07-06T12:00:00.000Z')
  const row = (over: Partial<ActionSuppressionRow>): ActionSuppressionRow => ({
    metadata: { aandachtspunt_id: 'tax:jaarruimte' },
    status: 'open',
    completed_at: null,
    ...over,
  })

  it('neemt elke OPEN actie mee, ongeacht completed_at', () => {
    const ids = collectActionedIds([row({ status: 'open' })], now)
    expect(ids.has('tax:jaarruimte')).toBe(true)
  })

  it('neemt een AFGERONDE actie binnen het venster mee', () => {
    // ~1 maand geleden → ruim binnen 9 mnd.
    const ids = collectActionedIds(
      [row({ status: 'completed', completed_at: '2026-06-01T00:00:00.000Z' })],
      now,
    )
    expect(ids.has('tax:jaarruimte')).toBe(true)
  })

  it('negeert een AFGERONDE actie ouder dan het venster', () => {
    // > 9 maanden vóór now (cutoff = 2025-10-06) → buiten het venster.
    const ids = collectActionedIds(
      [row({ status: 'completed', completed_at: '2025-01-01T00:00:00.000Z' })],
      now,
    )
    expect(ids.has('tax:jaarruimte')).toBe(false)
  })

  it('behandelt de venster-grens inclusief (completed_at == cutoff telt mee)', () => {
    const cutoff = new Date(now)
    cutoff.setMonth(cutoff.getMonth() - ACTIONED_COMPLETED_WINDOW_MONTHS)
    const ids = collectActionedIds(
      [row({ status: 'completed', completed_at: cutoff.toISOString() })],
      now,
    )
    expect(ids.has('tax:jaarruimte')).toBe(true)
  })

  it('negeert een AFGERONDE actie zonder completed_at', () => {
    const ids = collectActionedIds([row({ status: 'completed', completed_at: null })], now)
    expect(ids.has('tax:jaarruimte')).toBe(false)
  })

  it('onderdrukt NIET bij postponed of rejected', () => {
    const ids = collectActionedIds(
      [
        row({ metadata: { aandachtspunt_id: 'a' }, status: 'postponed' }),
        row({ metadata: { aandachtspunt_id: 'b' }, status: 'rejected' }),
      ],
      now,
    )
    expect(ids.size).toBe(0)
  })

  it('negeert rijen zonder geldig aandachtspunt_id', () => {
    const ids = collectActionedIds(
      [
        row({ metadata: {}, status: 'open' }),
        row({ metadata: null, status: 'open' }),
        row({ metadata: { aandachtspunt_id: '' }, status: 'open' }),
      ],
      now,
    )
    expect(ids.size).toBe(0)
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
      href: '/overzicht/budget',
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
