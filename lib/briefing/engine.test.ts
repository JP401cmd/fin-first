import { describe, it, expect } from 'vitest'
import { buildBriefingEntries, type BriefingEngineInput } from './engine'
import type { HealthScore } from '@/lib/financial-health'
import type { LifeEvent } from '@/lib/horizon-data'
import type { Recommendation } from '@/lib/recommendation-data'

/**
 * Tests voor briefing-engine — pure functie die ruwe data omzet in
 * BriefingEntry[]. Geen Next/React-deps, dus puur-functioneel testbaar.
 */

function emptyInput(overrides: Partial<BriefingEngineInput> = {}): BriefingEngineInput {
  return {
    recommendations: [],
    events: [],
    health: null,
    goalNames: [],
    goalProgresses: [],
    now: new Date('2026-05-19T12:00:00Z'),
    ...overrides,
  }
}

function makeRec(id: string, title: string): Recommendation {
  return {
    id,
    title,
    description: '',
    recommendation_type: 'general',
    freedom_days_per_year: 0,
    priority_score: 50,
    status: 'pending',
  } as unknown as Recommendation
}

function makeEvent(id: string, name: string, daysFromNow: number): LifeEvent {
  const date = new Date('2026-05-19T12:00:00Z')
  date.setDate(date.getDate() + daysFromNow)
  return {
    id,
    name,
    event_type: 'misc',
    target_age: null,
    target_date: date.toISOString().slice(0, 10),
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'misc',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
  }
}

function makeHealth(overrides: Partial<HealthScore> = {}): HealthScore {
  return {
    total: 70,
    label: 'Sterk',
    pillars: [],
    previousMonth: 65,
    trend: 5,
    activePillarCount: 3,
    budgetingActive: true,
    ...overrides,
  } as HealthScore
}

describe('buildBriefingEntries — basis', () => {
  it('rendert lege array bij volledig lege input', () => {
    const result = buildBriefingEntries(emptyInput())
    expect(result).toEqual([])
  })

  it('observation komt uit recommendations[0]', () => {
    const result = buildBriefingEntries(
      emptyInput({
        recommendations: [makeRec('r1', 'Vermogen +1.2%')],
      }),
    )
    expect(result.length).toBe(1)
    expect(result[0]?.category).toBe('observation')
    expect(result[0]?.text).toBe('Vermogen +1.2%')
  })

  it('tip komt uit recommendations[1]', () => {
    const result = buildBriefingEntries(
      emptyInput({
        recommendations: [
          makeRec('r1', 'A'),
          makeRec('r2', 'Verschuif €3k'),
        ],
      }),
    )
    expect(result.length).toBe(2)
    expect(result[1]?.category).toBe('tip')
    expect(result[1]?.text).toBe('Verschuif €3k')
  })
})

describe('buildBriefingEntries — heads_up', () => {
  it('rendert laagst-scorende pillar onder 50', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'diversification', name: 'Diversificatie', score: 80, weight: 0.1, explanation: '', improvementTip: '', actionHref: '/x', actionLabel: 'X', rawValue: '' },
            { id: 'savings_rate', name: 'Spaarquote', score: 30, weight: 0.25, explanation: '', improvementTip: 'Verhoog je spaarquote', actionHref: '/cashflow', actionLabel: 'X', rawValue: '' },
            { id: 'debt_ratio', name: 'Schuldratio', score: 40, weight: 0.2, explanation: '', improvementTip: '', actionHref: '/x', actionLabel: 'X', rawValue: '' },
          ],
        }),
      }),
    )
    const headsUp = result.find((e) => e.category === 'heads_up')
    expect(headsUp).toBeDefined()
    expect(headsUp?.text).toContain('Spaarquote')
    expect(headsUp?.text).toContain('Verhoog je spaarquote')
    expect(headsUp?.href).toBe('/cashflow')
  })

  it('geen heads_up wanneer alle pillars >= 50', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'a', name: 'A', score: 60, weight: 0.5, explanation: '', improvementTip: '', actionHref: '', actionLabel: '', rawValue: '' },
            { id: 'b', name: 'B', score: 80, weight: 0.5, explanation: '', improvementTip: '', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')).toBeUndefined()
  })
})

describe('buildBriefingEntries — milestone', () => {
  it('triggert op behaald doel (pct >= 100)', () => {
    const result = buildBriefingEntries(
      emptyInput({
        goalNames: ['Spaargeld', 'Hypotheek aflossen'],
        goalProgresses: [
          { current: 50000, target: 50000, pct: 100, onTrack: true, eta: null },
          { current: 30000, target: 100000, pct: 30, onTrack: false, eta: null },
        ],
      }),
    )
    const milestone = result.find((e) => e.category === 'milestone')
    expect(milestone?.text).toContain('Spaargeld')
    expect(milestone?.text).toContain('behaald')
    expect(milestone?.href).toBe('/toekomst?tab=doelen')
  })

  it('valt terug op score-trend >= 5 wanneer geen behaald doel', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({ trend: 6 }),
        goalProgresses: [{ current: 10, target: 100, pct: 10, onTrack: false, eta: null }],
        goalNames: ['onafgeleid'],
      }),
    )
    const milestone = result.find((e) => e.category === 'milestone')
    expect(milestone).toBeDefined()
    expect(milestone?.text).toContain('6 punten')
  })

  it('geen milestone bij trend < 5 en geen behaald doel', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({ trend: 2 }),
      }),
    )
    expect(result.find((e) => e.category === 'milestone')).toBeUndefined()
  })

  it('behaald doel wint van score-trend', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({ trend: 10 }),
        goalNames: ['Doel A'],
        goalProgresses: [{ current: 100, target: 100, pct: 100, onTrack: true, eta: null }],
      }),
    )
    const milestone = result.find((e) => e.category === 'milestone')
    expect(milestone?.text).toContain('Doel A')
    expect(milestone?.text).not.toContain('punten')
  })
})

describe('buildBriefingEntries — upcoming', () => {
  it('rendert eerstvolgend event binnen 90 dagen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        events: [
          makeEvent('e1', 'Vakantie', 60),
          makeEvent('e2', 'Kind', 30),
          makeEvent('e3', 'Verhuizing', 400),
        ],
      }),
    )
    const upcoming = result.find((e) => e.category === 'upcoming')
    // Vroegste binnen 90d = "Kind" (30d)
    expect(upcoming?.text).toContain('Kind')
  })

  it('skipt events > 90 dagen weg', () => {
    const result = buildBriefingEntries(
      emptyInput({
        events: [makeEvent('e1', 'Ver weg', 120)],
      }),
    )
    expect(result.find((e) => e.category === 'upcoming')).toBeUndefined()
  })

  it('skipt events in het verleden', () => {
    const result = buildBriefingEntries(
      emptyInput({
        events: [makeEvent('e1', 'Voorbij', -30)],
      }),
    )
    expect(result.find((e) => e.category === 'upcoming')).toBeUndefined()
  })
})

describe('buildBriefingEntries — hefboom-tagging (plan T-3)', () => {
  it('mapt pillar-id naar hefboom op heads_up', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'savings_rate', name: 'Spaarquote', score: 20, weight: 0.25, explanation: '', improvementTip: 't', actionHref: '/x', actionLabel: 'X', rawValue: '' },
          ],
        }),
      }),
    )
    const headsUp = result.find((e) => e.category === 'heads_up')
    expect(headsUp?.hefboom).toBe('cashflow')
  })

  it('mapt diversification → bezittingen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'diversification', name: 'Diversificatie', score: 30, weight: 0.1, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')?.hefboom).toBe('bezittingen')
  })

  it('mapt debt_ratio → schulden', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'debt_ratio', name: 'Schuld', score: 30, weight: 0.2, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')?.hefboom).toBe('schulden')
  })

  it('mapt tax_optimization → belasting', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'tax_optimization', name: 'Belasting', score: 30, weight: 0.1, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')?.hefboom).toBe('belasting')
  })

  it('fire_progress blijft ongetagd (cross-hefboom)', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'fire_progress', name: 'FIRE', score: 30, weight: 0.1, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')?.hefboom).toBeUndefined()
  })

  it('mapt recommendation_type "debt_acceleration" → schulden', () => {
    const rec = { ...makeRec('r1', 'Aflossen tip'), recommendation_type: 'debt_acceleration' } as Recommendation
    const result = buildBriefingEntries(emptyInput({ recommendations: [rec] }))
    expect(result.find((e) => e.category === 'observation')?.hefboom).toBe('schulden')
  })

  it('mapt event_type "housing" → schulden op upcoming', () => {
    const event = { ...makeEvent('e1', 'Huis kopen', 30), event_type: 'housing_purchase' }
    const result = buildBriefingEntries(emptyInput({ events: [event] }))
    expect(result.find((e) => e.category === 'upcoming')?.hefboom).toBe('schulden')
  })
})

describe('buildBriefingEntries — volgorde', () => {
  it('volgt prioriteit: observation → tip → heads_up → milestone → upcoming', () => {
    const result = buildBriefingEntries(
      emptyInput({
        recommendations: [makeRec('r1', 'A'), makeRec('r2', 'B')],
        events: [makeEvent('e1', 'Event', 30)],
        health: makeHealth({
          trend: 10,
          pillars: [
            { id: 'p1', name: 'P1', score: 20, weight: 0.5, explanation: '', improvementTip: 'tip', actionHref: '/x', actionLabel: 'X', rawValue: '' },
          ],
        }),
        goalNames: ['Doel'],
        goalProgresses: [{ current: 100, target: 100, pct: 100, onTrack: true, eta: null }],
      }),
    )
    const categories = result.map((e) => e.category)
    expect(categories).toEqual([
      'observation',
      'tip',
      'heads_up',
      'milestone',
      'upcoming',
    ])
  })
})
