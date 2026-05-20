import { describe, it, expect } from 'vitest'
import {
  buildBriefingEntries,
  buildBriefingNarrative,
  MAX_NARRATIVE_FRAGMENTS,
  type BriefingEngineInput,
} from './engine'
import type { HealthScore } from '@/lib/financial-health'
import type { LifeEvent } from '@/lib/horizon-data'
import type { Recommendation } from '@/lib/recommendation-data'
import type { BriefingEntry } from '@/components/overview/briefing-panel'

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
    // Oktober 15 — bewust gekozen omdat er geen seizoens-rule actief is
    // in deze maand. Tests die specifiek seasonal-entries valideren
    // overschrijven 'now' expliciet.
    now: new Date('2026-10-15T12:00:00Z'),
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
  // Match emptyInput.now zodat upcoming-events relatief blijven kloppen.
  const date = new Date('2026-10-15T12:00:00Z')
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

function makeEntry(
  category: BriefingEntry['category'],
  text: string,
): BriefingEntry {
  return { id: category + ':' + text.slice(0, 5), category, text }
}

describe('buildBriefingNarrative — natural-language samenvatting (plan T-1)', () => {
  it('returnt null bij lege entries', () => {
    expect(buildBriefingNarrative([])).toBeNull()
  })

  it('rendert één-zin samenvatting bij één entry', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Je vermogen groeide 1.2% sneller dan gemiddeld'),
    ])
    expect(result).toBe('Je vermogen groeide 1.2% sneller dan gemiddeld.')
  })

  it('voegt connectoren toe na het eerste fragment', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Je vermogen groeit gestaag'),
      makeEntry('tip', 'Verschuif €3k naar beleggen'),
    ])
    // Eerste zonder connector, tweede met "Tegelijkertijd" of vergelijkbaar
    expect(result?.startsWith('Je vermogen groeit gestaag.')).toBe(true)
    expect(result?.toLowerCase()).toMatch(
      /tegelijkertijd|daarnaast|verder/i,
    )
  })

  it('lowercase de eerste letter van entry na connector voor grammaticale vlotheid', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Eerste zin'),
      makeEntry('tip', 'Verschuif vermogen'),
    ])
    // Connector + lowercased body: bv. "Daarnaast verschuif vermogen"
    expect(result).toMatch(/(Tegelijkertijd|Daarnaast|Verder) verschuif/)
  })

  it('cap op MAX_NARRATIVE_FRAGMENTS (= 4)', () => {
    const entries: BriefingEntry[] = [
      makeEntry('observation', 'A'),
      makeEntry('tip', 'B'),
      makeEntry('heads_up', 'C'),
      makeEntry('milestone', 'D'),
      makeEntry('upcoming', 'E'),
    ]
    const result = buildBriefingNarrative(entries)
    expect(MAX_NARRATIVE_FRAGMENTS).toBe(4)
    // 5e entry "E" mag niet voorkomen in de samenvatting. A..D zijn aanwezig
    // (D wordt lowercased na connector → "d.").
    expect(result).not.toContain(' E.')
    expect(result).toContain('A.')
    expect(result).toMatch(/[Dd]\.$/)
  })

  it('elk fragment eindigt met een eindpunt', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Eerste'),
      makeEntry('tip', 'Tweede'),
    ])
    // Twee zinnen → twee punten
    expect(result?.match(/\./g)?.length).toBe(2)
  })

  it('strip bestaand eindpunt voordat punt wordt toegevoegd (geen ".." artifact)', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Zin met eindpunt.'),
    ])
    expect(result).toBe('Zin met eindpunt.')
    expect(result).not.toContain('..')
  })

  it('heads_up krijgt eigen connector-pool ("Let op" / "Aandacht")', () => {
    const result = buildBriefingNarrative([
      makeEntry('observation', 'Iets goeds'),
      makeEntry('heads_up', 'Spaarquote te laag'),
    ])
    expect(result?.toLowerCase()).toMatch(/let op|aandacht|wel/i)
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

describe('buildBriefingEntries — seasonal entries (T-1)', () => {
  it('voegt Box 3-peildatum-heads_up toe in januari', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-01-15T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:box3-peildatum')
    expect(seasonal).toBeTruthy()
    expect(seasonal?.category).toBe('heads_up')
    expect(seasonal?.hefboom).toBe('belasting')
  })

  it('voegt aangifte-deadline-heads_up toe in april', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-04-20T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:aangifte-deadline')
    expect(seasonal).toBeTruthy()
    expect(seasonal?.text).toMatch(/deadline|aangifte/i)
  })

  it('aangifte-text wordt urgent binnen 7 dagen', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-04-28T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:aangifte-deadline')
    expect(seasonal?.text).toMatch(/over \d dagen|morgen/i)
  })

  it('voegt vakantiegeld-tip toe rond eind mei', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-05-20T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:vakantiegeld')
    expect(seasonal).toBeTruthy()
    expect(seasonal?.hefboom).toBe('cashflow')
  })

  it('voegt zomer-uitgaven-heads_up toe in juli/augustus', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-07-10T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:zomer-uitgaven')
    expect(seasonal).toBeTruthy()
  })

  it('voegt jaarruimte-upcoming toe in november', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-11-10T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:jaarruimte')
    expect(seasonal?.category).toBe('upcoming')
  })

  it('voegt jaarruimte-heads_up toe in december (urgenter)', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-12-15T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id === 'seasonal:jaarruimte')
    expect(seasonal?.category).toBe('heads_up')
    expect(seasonal?.text).toMatch(/31 december|vervalt/i)
  })

  it('geen seasonal-entry in oktober (geen rule match)', () => {
    const entries = buildBriefingEntries(
      emptyInput({ now: new Date('2026-10-15T12:00:00Z') }),
    )
    const seasonal = entries.find((e) => e.id.startsWith('seasonal:'))
    expect(seasonal).toBeUndefined()
  })
})
