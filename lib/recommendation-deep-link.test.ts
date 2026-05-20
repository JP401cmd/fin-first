import { describe, it, expect } from 'vitest'
import { deepLinkForRecommendation } from './recommendation-deep-link'
import type { Recommendation } from './recommendation-data'

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Tip',
    description: '',
    recommendation_type: 'savings_boost',
    euro_impact_monthly: null,
    euro_impact_yearly: null,
    freedom_days_per_year: null,
    related_budget_slug: null,
    related_asset_id: null,
    related_debt_id: null,
    current_value: null,
    proposed_value: null,
    status: 'pending',
    rejection_reason: null,
    postponed_until: null,
    postpone_feedback: null,
    ai_generation_id: null,
    priority_score: null,
    suggested_actions: [],
    decided_at: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as Recommendation
}

describe('deepLinkForRecommendation — related fields prioriteit', () => {
  it('related_budget_slug → /overzicht/cashflow?budget=...', () => {
    const link = deepLinkForRecommendation(makeRec({ related_budget_slug: 'streaming' }))
    expect(link?.href).toBe('/overzicht/cashflow?budget=streaming')
    expect(link?.label).toBe('Open budget')
  })

  it('related_asset_id → /overzicht/bezittingen#asset-...', () => {
    const link = deepLinkForRecommendation(makeRec({ related_asset_id: 'a-123' }))
    expect(link?.href).toBe('/overzicht/bezittingen#asset-a-123')
  })

  it('related_debt_id → /overzicht/schulden#debt-...', () => {
    const link = deepLinkForRecommendation(makeRec({ related_debt_id: 'd-456' }))
    expect(link?.href).toBe('/overzicht/schulden#debt-d-456')
  })

  it('budget-slug overstijgt asset-id (voorkeur left-to-right)', () => {
    const link = deepLinkForRecommendation(
      makeRec({
        related_budget_slug: 'streaming',
        related_asset_id: 'a-123',
      }),
    )
    expect(link?.href).toContain('budget=streaming')
  })
})

describe('deepLinkForRecommendation — fallback per type', () => {
  it('budget_optimization → /overzicht/cashflow', () => {
    expect(
      deepLinkForRecommendation(makeRec({ recommendation_type: 'budget_optimization' })),
    ).toMatchObject({ href: '/overzicht/cashflow', label: 'Open cashflow' })
  })

  it('asset_reallocation → /overzicht/bezittingen', () => {
    expect(
      deepLinkForRecommendation(makeRec({ recommendation_type: 'asset_reallocation' })),
    ).toMatchObject({ href: '/overzicht/bezittingen' })
  })

  it('debt_acceleration → /overzicht/schulden', () => {
    expect(
      deepLinkForRecommendation(makeRec({ recommendation_type: 'debt_acceleration' })),
    ).toMatchObject({ href: '/overzicht/schulden' })
  })

  it('income_increase → /overzicht/cashflow', () => {
    expect(
      deepLinkForRecommendation(makeRec({ recommendation_type: 'income_increase' })),
    ).toMatchObject({ href: '/overzicht/cashflow' })
  })

  it('savings_boost (default in mock) → /overzicht/cashflow', () => {
    expect(deepLinkForRecommendation(makeRec())).toMatchObject({
      href: '/overzicht/cashflow',
    })
  })
})

describe('deepLinkForRecommendation — encoding & edge-cases', () => {
  it('encodeert budget-slug met spaties/specials', () => {
    const link = deepLinkForRecommendation(
      makeRec({ related_budget_slug: 'streaming & abonnementen' }),
    )
    expect(link?.href).toContain('streaming%20%26%20abonnementen')
  })

  it('isExternal is altijd false in MVP (interne routes)', () => {
    const link = deepLinkForRecommendation(makeRec())
    expect(link?.isExternal).toBe(false)
  })
})
