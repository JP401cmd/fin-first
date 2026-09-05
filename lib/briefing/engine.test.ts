import { describe, it, expect } from 'vitest'
import {
  buildBriefingEntries,
  type BriefingEngineInput,
} from './engine'
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
    expect(milestone?.href).toBe('/toekomst/doelen')
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

  it('mapt asset_concentration → bezittingen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'asset_concentration', name: 'Vermogensspreiding', score: 30, weight: 0.1, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
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

  it('mapt debt_service_ratio → schulden', () => {
    const result = buildBriefingEntries(
      emptyInput({
        health: makeHealth({
          pillars: [
            { id: 'debt_service_ratio', name: 'Schuldenlast', score: 30, weight: 0.12, explanation: '', improvementTip: 't', actionHref: '', actionLabel: '', rawValue: '' },
          ],
        }),
      }),
    )
    expect(result.find((e) => e.category === 'heads_up')?.hefboom).toBe('schulden')
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

describe('buildBriefingEntries — goal heads_up (3b)', () => {
  it('voegt heads_up toe voor meest off-track-doel', () => {
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Noodfonds'],
        goalProgresses: [
          { current: 1000, target: 10000, pct: 10, onTrack: false, eta: null },
        ],
      }),
    )
    const headsUp = entries.find((e) => e.id.startsWith('heads_up:goal'))
    expect(headsUp).toBeTruthy()
    expect(headsUp?.text).toMatch(/Noodfonds/)
    expect(headsUp?.text).toMatch(/10%/)
  })

  it('voegt geen heads_up toe als doel ≥ 50% bij is', () => {
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Noodfonds'],
        goalProgresses: [
          { current: 6000, target: 10000, pct: 60, onTrack: false, eta: null },
        ],
      }),
    )
    expect(entries.find((e) => e.id.startsWith('heads_up:goal'))).toBeUndefined()
  })

  it('voegt geen heads_up toe als doel op koers is', () => {
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Noodfonds'],
        goalProgresses: [
          { current: 1000, target: 10000, pct: 10, onTrack: true, eta: null },
        ],
      }),
    )
    expect(entries.find((e) => e.id.startsWith('heads_up:goal'))).toBeUndefined()
  })

  it('kiest het slechtst-presterende doel bij meerdere off-track', () => {
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Doel A', 'Doel B'],
        goalProgresses: [
          { current: 4000, target: 10000, pct: 40, onTrack: false, eta: null },
          { current: 1000, target: 10000, pct: 10, onTrack: false, eta: null },
        ],
      }),
    )
    const headsUp = entries.find((e) => e.id.startsWith('heads_up:goal'))
    expect(headsUp?.text).toMatch(/Doel B/)
  })

  it('sluit een fire_age-doel uit de goal-heads-up (marge-status is live-only in het lab)', () => {
    // CR-M1: fire_age is een parameter-/marge-doel; ook al "lijkt" het off-track
    // (pct < 50, !onTrack) verschijnt het niet als briefing-heads-up.
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Vrijheidsleeftijd'],
        goalTypes: ['fire_age'],
        goalProgresses: [
          { current: 60, target: 55, pct: 30, onTrack: false, eta: null },
        ],
      }),
    )
    expect(entries.find((e) => e.id.startsWith('heads_up:goal'))).toBeUndefined()
  })

  it('formatteert een parameter-savings_rate-doel met %-eenheid (niet als €)', () => {
    // CR-m1: parameter-doelen zijn %/jaar — formatGoalValue i.p.v. formatCurrency.
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Spaarquote'],
        goalTypes: ['savings_rate'],
        goalProgresses: [
          { current: 28, target: 35, pct: 40, onTrack: false, eta: null },
        ],
      }),
    )
    const headsUp = entries.find((e) => e.id.startsWith('heads_up:goal'))
    expect(headsUp).toBeTruthy()
    expect(headsUp?.text).toContain('28,0%')
    expect(headsUp?.text).toContain('van 35,0%')
    expect(headsUp?.text).not.toContain('€')
  })

  it('gebruikt de EUR-fallback wanneer goalTypes ontbreekt (backward-compatible)', () => {
    const entries = buildBriefingEntries(
      emptyInput({
        goalNames: ['Noodfonds'],
        goalProgresses: [
          { current: 1000, target: 10000, pct: 10, onTrack: false, eta: null },
        ],
      }),
    )
    const headsUp = entries.find((e) => e.id.startsWith('heads_up:goal'))
    expect(headsUp?.text).toContain('€')
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

describe('buildBriefingEntries — finance-verrijking', () => {
  // 1 oktober: geen seizoens-rule én ruim buiten de salaris-countdown (24 dagen
  // tot de 25e), zodat finance-generators geïsoleerd getest kunnen worden.
  const financeNow = new Date('2026-10-01T12:00:00Z')

  it('zonder finance blijft de output ongewijzigd (geen finance-entries)', () => {
    const result = buildBriefingEntries(
      emptyInput({ recommendations: [makeRec('r1', 'A'), makeRec('r2', 'B')] }),
    )
    expect(result.every((e) => !e.id.startsWith('finance:'))).toBe(true)
    expect(result.map((e) => e.category)).toEqual(['observation', 'tip'])
  })

  it('vermogensgroei → observation met bezittingen-hefboom en vrijheidsdagen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 103000 },
          ],
          monthlyExpenses: 3000, // dagbasis €100 → €3000 = 30 dagen vrijheid
        },
      }),
    )
    const nw = result.find((e) => e.id === 'finance:networth')
    expect(nw?.category).toBe('observation')
    expect(nw?.hefboom).toBe('bezittingen')
    expect(nw?.text).toMatch(/groeide/)
    expect(nw?.text).toMatch(/30 dagen vrijheid/)
  })

  // WF-CANON-06: het dagtarief is een canoniek registergetal (nr 6) dat de
  // briefing moet CONSUMEREN uit de bundel, niet zelf mag herrekenen. De
  // widgets lezen `data.dailyExpenseRate` (12-maands rolling, KRUIS-20); de
  // briefing rekende het lokaal op de LOSSE huidige maand, waardoor hetzelfde
  // bedrag op één pagina twee verschillende vrijheidsdagen opleverde.
  it('canoniek dailyExpenseRate wint van de lokale maand-herberekening', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 103000 },
          ],
          // Losse maand zou €3000×12/365 = €98,63/dag geven → 30 dagen.
          monthlyExpenses: 3000,
          // Canonieke rolling dagbasis wijkt bewust af → €3000/€150 = 20 dagen.
          dailyExpenseRate: 150,
        },
      }),
    )
    const nw = result.find((e) => e.id === 'finance:networth')
    expect(nw?.text).toMatch(/20 dagen vrijheid/)
    expect(nw?.text).not.toMatch(/30 dagen vrijheid/)
  })

  it('zonder dailyExpenseRate blijft de maand-fallback gelden', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 103000 },
          ],
          monthlyExpenses: 3000,
        },
      }),
    )
    expect(result.find((e) => e.id === 'finance:networth')?.text).toMatch(
      /30 dagen vrijheid/,
    )
  })

  it('vermogensdaling → heads_up', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 103000 },
            { month: '2026-09', value: 100000 },
          ],
        },
      }),
    )
    const nw = result.find((e) => e.id === 'finance:networth')
    expect(nw?.category).toBe('heads_up')
    expect(nw?.text).toMatch(/daalde/)
  })

  it('vermogensdelta onder de drempel levert geen briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 100100 }, // €100 < €250-drempel
          ],
        },
      }),
    )
    expect(result.find((e) => e.id === 'finance:networth')).toBeUndefined()
  })

  it('budgetdruk >90% → heads_up cashflow en onderdrukt spaarquote', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          budgetExpense: { spent: 950, limit: 1000 },
          monthlyIncome: 4000,
          monthlyExpenses: 3000,
        },
      }),
    )
    const budget = result.find((e) => e.id === 'finance:budget')
    expect(budget?.category).toBe('heads_up')
    expect(budget?.hefboom).toBe('cashflow')
    expect(result.find((e) => e.id === 'finance:savings')).toBeUndefined()
  })

  it('spaarquote → observation cashflow wanneer geen budgetdruk', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 4000, monthlyExpenses: 3000 }, // 25%
      }),
    )
    const sav = result.find((e) => e.id === 'finance:savings')
    expect(sav?.category).toBe('observation')
    expect(sav?.hefboom).toBe('cashflow')
    expect(sav?.text).toMatch(/25%/)
  })

  it('negatieve spaarquote → heads_up', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 3000, monthlyExpenses: 3500 },
      }),
    )
    const sav = result.find((e) => e.id === 'finance:savings')
    expect(sav?.category).toBe('heads_up')
    expect(sav?.text).toMatch(/meer uit/)
  })

  it('spaarquote gebruikt de effectieve quote wanneer aanwezig (≠ maandcijfer)', () => {
    // 1-maands cijfer zou 25% zijn; de canonieke 6m-spaarquote is 32%.
    // Het briefje MOET het 6m-getal noemen, niet het maandsurplus.
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 4000, monthlyExpenses: 3000, savingsRatePct: 32 },
      }),
    )
    const sav = result.find((e) => e.id === 'finance:savings')
    expect(sav?.category).toBe('observation')
    expect(sav?.text).toMatch(/32%/)
    expect(sav?.text).not.toMatch(/25%/)
  })

  it('lage effectieve quote → spaarquote-framing met dat getal', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 4000, monthlyExpenses: 3000, savingsRatePct: 4 },
      }),
    )
    const sav = result.find((e) => e.id === 'finance:savings')
    expect(sav?.category).toBe('observation')
    expect(sav?.text).toMatch(/spaarquote is 4%/)
  })

  it('dagbasis = jaar/365 (×12/365), niet maand/30', () => {
    // monthlyExpenses 3000: oude maand/30-basis = €100/dag, canonieke
    // ×12/365-basis = €98,63/dag. Groei €1449 kantelt de afronding:
    //   /30:      1449/100   = 14,49 → 14 dagen
    //   ×12/365:  1449/98,63 = 14,69 → 15 dagen
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 101449 },
          ],
          monthlyExpenses: 3000,
        },
      }),
    )
    const nw = result.find((e) => e.id === 'finance:networth')
    // Canonieke dagbasis (98,63) → 15 dagen; de oude /30-basis gaf 14.
    expect(nw?.text).toMatch(/15 dagen/)
  })

  it('FIRE-voortgang → observation met percentage en leeftijd', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { freedomPct: 42, fireAge: 58 },
      }),
    )
    const fire = result.find((e) => e.id === 'finance:fire')
    expect(fire?.category).toBe('observation')
    expect(fire?.text).toMatch(/42%/)
    expect(fire?.text).toMatch(/58e/)
  })

  it('cash-drag boven drempel → tip bezittingen', () => {
    const result = buildBriefingEntries(
      emptyInput({ now: financeNow, finance: { liquidCash: 25000 } }),
    )
    const cd = result.find((e) => e.id === 'finance:cashdrag')
    expect(cd?.category).toBe('tip')
    expect(cd?.hefboom).toBe('bezittingen')
  })

  it('cash-drag onder drempel → geen briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({ now: financeNow, finance: { liquidCash: 5000 } }),
    )
    expect(result.find((e) => e.id === 'finance:cashdrag')).toBeUndefined()
  })

  it('salaris-countdown binnen 10 dagen → upcoming', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: new Date('2026-10-20T12:00:00Z'), // 5 dagen tot de 25e
        finance: { monthlyIncome: 4000 },
      }),
    )
    const sal = result.find((e) => e.id === 'finance:salary')
    expect(sal?.category).toBe('upcoming')
    expect(sal?.text).toMatch(/5 dagen/)
  })

  it('geen salaris-countdown zonder bekend inkomen', () => {
    const result = buildBriefingEntries(
      emptyInput({ now: new Date('2026-10-20T12:00:00Z'), finance: {} }),
    )
    expect(result.find((e) => e.id === 'finance:salary')).toBeUndefined()
  })

  // ── Geloofwaardigheidsvloer op de maandbasis (UR2-03) ───────────────
  //
  // Gemelde bevinding: "Je spaart 34% van je inkomen — 2677 dagen vrijheid per
  // maand" op een account zonder ingevuld inkomen. 2677 dagen = ruim 7 jaar
  // vrijheid opgebouwd in één maand, en het spreekt de 34% in dezelfde zin
  // tegen (34% sparen koopt hooguit ±16 dagen per maand). Oorzaak: de zin mengt
  // twee grondslagen — het percentage komt uit de effectieve spaarquote, de
  // dagen uit het 12-maands rollende dagtarief. Bij (bijna) lege data zakt dat
  // dagtarief naar centen per dag terwijl elke guard alleen `> 0` toetst.

  it('sub-vloer maandinkomen → géén spaarquote-briefje (geen verzonnen percentage)', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 12, monthlyExpenses: 8, savingsRatePct: 34 },
      }),
    )
    expect(result.find((e) => e.id === 'finance:savings')).toBeUndefined()
  })

  it('sub-vloer uitgavenbasis → géén spaarquote-briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { monthlyIncome: 2400, monthlyExpenses: 1, savingsRatePct: 34 },
      }),
    )
    expect(result.find((e) => e.id === 'finance:savings')).toBeUndefined()
  })

  it('sub-vloer dagtarief → briefje zonder vrijheidsdagen-claim (geen 2677 dagen)', () => {
    // Reële effectieve maandbasis (€2.400 in / €1.600 uit) naast een dagtarief
    // van €0,03/dag uit één losse transactie. Het briefje mag verschijnen, maar
    // de dagen-omrekening moet op DEZELFDE grondslag als het bedrag gebeuren —
    // nooit €800 ÷ €0,03 = 24.333 dagen.
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          monthlyIncome: 2400,
          monthlyExpenses: 1600,
          dailyExpenseRate: 0.033,
          savingsRatePct: 34,
        },
      }),
    )
    const sav = result.find((e) => e.id === 'finance:savings')
    expect(sav?.text).toMatch(/34%/)
    // €800 ÷ (€1.600×12/365 = €52,60/dag) ≈ 15 dagen — consistent met 34%.
    expect(sav?.text).toMatch(/15 dagen vrijheid/)
    expect(sav?.text).not.toMatch(/\d{3,} dagen/)
  })

  it('sub-vloer dagtarief → vermogensgroei zonder absurde dagen-claim', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 101449 },
          ],
          // Geen geloofwaardige uitgavenbasis: dagtarief én maandbasis zakken
          // door de vloer → het briefje verschijnt zónder dagen-suffix.
          dailyExpenseRate: 0.033,
          monthlyExpenses: 1,
        },
      }),
    )
    const nw = result.find((e) => e.id === 'finance:networth')
    expect(nw?.text).toMatch(/groeide met/)
    expect(nw?.text).not.toMatch(/dagen vrijheid/)
  })

  it('sub-vloer maandinkomen → géén salaris-countdown en géén vaste-lasten-%', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: new Date('2026-10-20T12:00:00Z'),
        finance: { monthlyIncome: 12, totalRecurringAmount: 40 },
      }),
    )
    expect(result.find((e) => e.id === 'finance:salary')).toBeUndefined()
    expect(result.find((e) => e.id === 'finance:recurring')).toBeUndefined()
  })

  it('open acties → tip met vrijheidsdagen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { openActions: 3, totalFreedomDaysOpen: 21 },
      }),
    )
    const act = result.find((e) => e.id === 'finance:actions')
    expect(act?.category).toBe('tip')
    expect(act?.text).toMatch(/3 openstaande acties/)
    expect(act?.text).toMatch(/21 vrijheidsdagen/)
  })

  it('Time Machine: alle crashes doorstaan → milestone met crash + percentage', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          backtestSuccessRate: 92,
          backtestNamedPaths: [
            { label: 'de Oliecrisis (1973)', success: true },
            { label: 'de Dotcom-top (2000)', success: true },
          ],
        },
      }),
    )
    const res = result.find((e) => e.id === 'finance:resilience')
    expect(res?.category).toBe('milestone')
    expect(res?.hefboom).toBe('bezittingen')
    expect(res?.text).toMatch(/Oliecrisis \(1973\)/)
    expect(res?.text).toMatch(/92%/)
  })

  it('Time Machine: een gefaalde crash → heads_up die de crash eerlijk benoemt', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          backtestSuccessRate: 64,
          backtestNamedPaths: [
            { label: 'de Oliecrisis (1973)', success: true },
            { label: 'de Dotcom-top (2000)', success: false },
          ],
        },
      }),
    )
    const res = result.find((e) => e.id === 'finance:resilience')
    expect(res?.category).toBe('heads_up')
    expect(res?.text).toMatch(/Dotcom-top \(2000\)/)
    expect(res?.text).toMatch(/64%/)
  })

  it('Time Machine: geen briefje zonder backtest-data', () => {
    const result = buildBriefingEntries(
      emptyInput({ now: financeNow, finance: { backtestSuccessRate: null, backtestNamedPaths: null } }),
    )
    expect(result.find((e) => e.id === 'finance:resilience')).toBeUndefined()
  })

  it('marketEntry wordt getoond, ook zonder finance-context', () => {
    const market = { id: 'market:n1', category: 'market' as const, text: 'Markt-nieuws' }
    const result = buildBriefingEntries(emptyInput({ now: financeNow, marketEntry: market }))
    expect(result.find((e) => e.id === 'market:n1')).toBeTruthy()
  })

  it('marketEntry wordt op rang (65) tussen de andere entries geweven', () => {
    const market = { id: 'market:n1', category: 'market' as const, text: 'Markt-nieuws' }
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        recommendations: [makeRec('r1', 'Obs')],
        marketEntry: market,
        finance: { freedomPct: 40, fireAge: 58 }, // finance:fire rank 78 > market 65
      }),
    )
    const ids = result.map((e) => e.id)
    expect(ids).toContain('market:n1')
    expect(ids.indexOf('observation:r1')).toBeLessThan(ids.indexOf('market:n1'))
    expect(ids.indexOf('finance:fire')).toBeLessThan(ids.indexOf('market:n1'))
  })

  it('weeft finance-entries op prioriteit tussen kern-entries', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        recommendations: [makeRec('r1', 'Observatie'), makeRec('r2', 'Tip')],
        finance: {
          netWorthHistory: [
            { month: '2026-08', value: 100000 },
            { month: '2026-09', value: 105000 },
          ],
          monthlyIncome: 4000,
          monthlyExpenses: 3000,
        },
      }),
    )
    const ids = result.map((e) => e.id)
    // observation(rec)=100 > finance:networth=95 > tip(rec)=90 > finance:savings=80
    expect(ids.indexOf('observation:r1')).toBeLessThan(ids.indexOf('finance:networth'))
    expect(ids.indexOf('finance:networth')).toBeLessThan(ids.indexOf('tip:r2'))
    expect(ids.indexOf('tip:r2')).toBeLessThan(ids.indexOf('finance:savings'))
  })
})

describe('buildBriefingEntries — verbrede vulling (jun 2026)', () => {
  const financeNow = new Date('2026-10-01T12:00:00Z')

  it('onvolledig noodfonds → heads_up met maanden-dekking', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { emergencyFund: { monthsCovered: 1.5, targetMonths: 3, isComplete: false } },
      }),
    )
    const ef = result.find((e) => e.id === 'finance:emergency')
    expect(ef?.category).toBe('heads_up')
    expect(ef?.hefboom).toBe('cashflow')
    expect(ef?.text).toContain('1,5 van de 3 maanden')
  })

  it('volledig noodfonds → geen briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { emergencyFund: { monthsCovered: 4, targetMonths: 3, isComplete: true } },
      }),
    )
    expect(result.find((e) => e.id === 'finance:emergency')).toBeUndefined()
  })

  it('vaste lasten → observation met percentage en grootste post', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: {
          monthlyIncome: 4000,
          totalRecurringAmount: 1200, // 30%
          recurring: [{ name: 'Huur', amount: 900 }],
        },
      }),
    )
    const rec = result.find((e) => e.id === 'finance:recurring')
    expect(rec?.category).toBe('observation')
    expect(rec?.text).toContain('30%')
    expect(rec?.text).toContain('Huur')
  })

  it('vaste lasten zonder inkomen → geen briefje (percentage betekenisloos)', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { totalRecurringAmount: 1200, recurring: [{ name: 'Huur', amount: 900 }] },
      }),
    )
    expect(result.find((e) => e.id === 'finance:recurring')).toBeUndefined()
  })

  it('Box 3-heffing → tip met vrijheidsdagen en tegenbewijs-route', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { box3Tax: 1500, monthlyExpenses: 3000 }, // dagbasis €100 → 15 dagen
      }),
    )
    const box3 = result.find((e) => e.id === 'finance:box3')
    expect(box3?.category).toBe('tip')
    expect(box3?.hefboom).toBe('belasting')
    expect(box3?.href).toBe('/overzicht/belasting/box3')
    expect(box3?.text).toMatch(/15 dagen vrijheid/)
    expect(box3?.text).toMatch(/tegenbewijs/i)
  })

  it('fondskosten ≥ drempel → tip met TER in NL-notatie', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { feeAnalysis: { totalAnnualFee: 450, weightedTER: 0.0035 } },
      }),
    )
    const fees = result.find((e) => e.id === 'finance:fees')
    expect(fees?.category).toBe('tip')
    expect(fees?.text).toContain('0,35% TER')
  })

  it('fondskosten onder drempel → geen briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { feeAnalysis: { totalAnnualFee: 60, weightedTER: 0.001 } },
      }),
    )
    expect(result.find((e) => e.id === 'finance:fees')).toBeUndefined()
  })

  it('hypotheek-vs-beleggen met duidelijke winnaar → tip; "gelijk" → niets', () => {
    const winnaar = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { hvbSummary: { rente: 4.2, aanbeveling: 'aflossen' } },
      }),
    )
    const hvb = winnaar.find((e) => e.id === 'finance:hvb')
    expect(hvb?.text).toContain('4,2%')
    expect(hvb?.text).toContain('extra aflossen')
    expect(hvb?.hefboom).toBe('schulden')

    const gelijk = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        finance: { hvbSummary: { rente: 3.5, aanbeveling: 'gelijk' } },
      }),
    )
    expect(gelijk.find((e) => e.id === 'finance:hvb')).toBeUndefined()
  })

  it('goal heads_up bevat de concrete bedragen', () => {
    const result = buildBriefingEntries(
      emptyInput({
        goalNames: ['Bufferdoel'],
        goalProgresses: [{ current: 3000, target: 10000, pct: 30, onTrack: false, eta: null }],
      }),
    )
    const goal = result.find((e) => e.id.startsWith('heads_up:goal'))
    expect(goal?.text).toContain('Bufferdoel')
    expect(goal?.text).toMatch(/3\.000/)
    expect(goal?.text).toMatch(/10\.000/)
  })
})

describe('buildBriefingEntries — aandachtspunten-bus', () => {
  const financeNow = new Date('2026-10-01T12:00:00Z')

  it('zwaarste punt → tip met besparing, vrijheidsdagen en domein-hefboom', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        aandachtspunten: [
          { id: 'tax:jaarruimte', domain: 'tax', title: 'Benut je jaarruimte', savings: 1200, freedomDays: 12, href: '/overzicht/belasting/box1' },
          { id: 'debt:duur', domain: 'debt', title: 'Dure lening', savings: 300, freedomDays: 3, href: '/overzicht/schulden' },
        ],
      }),
    )
    const punt = result.find((e) => e.id === 'aandachtspunt:tax:jaarruimte')
    expect(punt?.category).toBe('tip')
    expect(punt?.hefboom).toBe('belasting')
    expect(punt?.href).toBe('/overzicht/belasting/box1')
    expect(punt?.text).toContain('Benut je jaarruimte')
    expect(punt?.text).toMatch(/1\.200/)
    expect(punt?.text).toContain('12 dagen vrijheid')
    // Alleen het zwaarste punt wordt een briefje.
    expect(result.find((e) => e.id === 'aandachtspunt:debt:duur')).toBeUndefined()
  })

  it('punt met deadline → heads_up met deadline in de tekst', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: financeNow,
        aandachtspunten: [
          { id: 'tax:aangifte', domain: 'tax', title: 'Aangifte indienen', savings: 0, freedomDays: 0, deadline: '1 mei', href: '/overzicht/belasting' },
        ],
      }),
    )
    const punt = result.find((e) => e.id === 'aandachtspunt:tax:aangifte')
    expect(punt?.category).toBe('heads_up')
    expect(punt?.text).toContain('vóór 1 mei')
  })
})

describe('buildBriefingEntries — domein-spreiding', () => {
  it('max 2 briefjes per hefboom: derde cashflow-kaart valt af', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: new Date('2026-10-01T12:00:00Z'),
        finance: {
          // Drie cashflow-kandidaten: budgetdruk (88), noodfonds (84),
          // vaste lasten (62) → de laagst gerangschikte valt af.
          monthlyIncome: 4000,
          budgetExpense: { spent: 1900, limit: 2000 },
          emergencyFund: { monthsCovered: 1, targetMonths: 3, isComplete: false },
          totalRecurringAmount: 1200,
          recurring: [{ name: 'Huur', amount: 900 }],
        },
      }),
    )
    const cashflow = result.filter((e) => e.hefboom === 'cashflow')
    expect(cashflow.map((e) => e.id)).toEqual(['finance:budget', 'finance:emergency'])
    expect(result.find((e) => e.id === 'finance:recurring')).toBeUndefined()
  })

  it('entries zonder hefboom-tag worden niet gecapt', () => {
    const result = buildBriefingEntries(
      emptyInput({
        now: new Date('2026-10-01T12:00:00Z'),
        recommendations: [makeRec('r1', 'A'), makeRec('r2', 'B')],
        finance: { freedomPct: 40, openActions: 2, totalFreedomDaysOpen: 10 },
      }),
    )
    // fire + actions + beide recommendations zijn allemaal zonder hefboom → alle 4 aanwezig.
    expect(result.find((e) => e.id === 'finance:fire')).toBeDefined()
    expect(result.find((e) => e.id === 'finance:actions')).toBeDefined()
    expect(result.find((e) => e.id === 'observation:r1')).toBeDefined()
    expect(result.find((e) => e.id === 'tip:r2')).toBeDefined()
  })
})

describe('buildBriefingEntries — check-in-reflectie', () => {
  it('recente check-in met reflectie → observation met citaat en maand', () => {
    const result = buildBriefingEntries(
      emptyInput({
        checkin: { monthKey: '2026-06', reflection: 'Deze maand bewust minder uit eten gegaan.' },
      }),
    )
    const c = result.find((e) => e.id === 'checkin:2026-06')
    expect(c?.category).toBe('observation')
    expect(c?.href).toBe('/mijn/checkins')
    expect(c?.text).toContain('check-in van juni')
    expect(c?.text).toContain('minder uit eten')
  })

  it('lange reflectie wordt afgekapt met ellipsis', () => {
    const long = 'a'.repeat(200)
    const result = buildBriefingEntries(
      emptyInput({ checkin: { monthKey: '2026-06', reflection: long } }),
    )
    const c = result.find((e) => e.id === 'checkin:2026-06')
    expect(c?.text).toContain('…')
    expect((c?.text ?? '').length).toBeLessThan(170)
  })

  it('lege reflectie → geen briefje', () => {
    const result = buildBriefingEntries(
      emptyInput({ checkin: { monthKey: '2026-06', reflection: '   ' } }),
    )
    expect(result.find((e) => e.id.startsWith('checkin:'))).toBeUndefined()
  })
})

/**
 * ADR 0129 F3b (bevinding 1) — onder een VAST stopmoment noemt de FIRE-observatie
 * het stopmoment en het bereik, nooit "naar vrijheid rond je Xe".
 */
describe('buildBriefingEntries — FIRE-observatie onder een vast anker', () => {
  it('age 58,5 met bereik 83: "Je rekent met stoppen op 58,5; je liquide vermogen reikt tot je 83e."', () => {
    const out = buildBriefingEntries(
      emptyInput({
        finance: {
          netWorthHistory: [],
          monthlyExpenses: 2000,
          monthlyIncome: 3000,
          freedomPct: 62,
          currentAge: 45,
          fireAge: 59,
          stopAnchorFixed: true,
          stopAge: 58.5,
          reachesAge: 83.4,
        },
      }),
    )
    const fire = out.find((e) => e.id === 'finance:fire')
    expect(fire?.text).toBe('Je rekent met stoppen op 58,5; je liquide vermogen reikt tot je 83e.')
    expect(fire?.text).not.toMatch(/vrijheid rond je/)
  })

  it('nu-anker zonder bereik: alleen het stopmoment', () => {
    const out = buildBriefingEntries(
      emptyInput({
        finance: {
          netWorthHistory: [],
          monthlyExpenses: 2000,
          monthlyIncome: 3000,
          freedomPct: 40,
          currentAge: 47,
          fireAge: 47,
          stopAnchorFixed: true,
          stopAge: null,
          reachesAge: null,
        },
      }),
    )
    expect(out.find((e) => e.id === 'finance:fire')?.text).toBe('Je rekent alsof je nu stopt.')
  })

  it('solved: de bestaande zin blijft', () => {
    const out = buildBriefingEntries(
      emptyInput({
        finance: { netWorthHistory: [], monthlyExpenses: 2000, monthlyIncome: 3000, freedomPct: 62, currentAge: 45, fireAge: 58 },
      }),
    )
    expect(out.find((e) => e.id === 'finance:fire')?.text).toContain('naar vrijheid rond je 58e')
  })
})
