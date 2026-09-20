import { describe, it, expect } from 'vitest'
import { computeGoalProgress, type GoalProgressInput } from '@/lib/goal-data'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import { deriveDoelenStatus, doelenVerdict, type GoalProgress } from './doelen-verdict'

/**
 * Het doelen-oordeel in de titel van /toekomst/doelen (en op de navkaart) is een
 * BEREKEND kerngetal — "3 van 4 op koers". Deze suite pint de getoonde uitspraak
 * daarom tegen de CANONIEKE engine-uitvoer voor dezelfde invoer: de voortgang
 * komt niet uit handgeschreven fixtures maar uit `computeGoalProgress`
 * (lib/goal-data.ts), precies zoals `loadFinData` hem aan beide oppervlakken
 * levert. Zo valt weergave-drift (verkeerd veld, verkeerde teller, ongemeten
 * doelen die stil als "op koers" meetellen) hier om, en niet pas bij een
 * gebruiker.
 */

function goal(overrides: Partial<GoalWithBudget> = {}): GoalWithBudget {
  return {
    id: 'g1',
    name: 'Spaargeld voor woning',
    description: '',
    goal_type: 'savings',
    target_value: 50000,
    current_value: 20000,
    target_date: '2027-12-31',
    color: 'teal',
    icon: 'Target',
    is_completed: false,
    sort_order: 0,
    user_id: 'u1',
    created_at: '2026-01-01',
    custom_unit: null,
    budgets: null,
    ...overrides,
  } as unknown as GoalWithBudget
}

/** Voortgang zoals de loader hem maakt: door de echte engine, niet met de hand. */
function progressVan(g: GoalWithBudget): GoalProgress {
  return computeGoalProgress(g as unknown as GoalProgressInput)
}

describe('doelenVerdict — de titel pint op de engine-uitvoer', () => {
  it('telt alleen BEOORDEELDE doelen; een doel zonder streefdatum telt niet als "op koers"', () => {
    const goals = [
      // Op koers: net gestart, ruim de tijd tot 2030.
      goal({ id: 'a', current_value: 45000, target_value: 50000, target_date: '2030-12-31' }),
      // Loopt achter: nagenoeg niets binnen en de datum is aanstaande.
      goal({ id: 'b', current_value: 1000, target_value: 50000, target_date: '2026-10-01' }),
      // Geen streefdatum → geen tempo-oordeel (paceSkipped) → buiten de noemer.
      goal({ id: 'c', current_value: 10000, target_value: 50000, target_date: null }),
    ]
    const progresses = goals.map(progressVan)

    // Voorwaarde van de test zelf: de engine markeert het datumloze doel als
    // ongemeten. Zou dat veranderen, dan is de assertie hieronder betekenisloos.
    expect(progresses[2].paceSkipped).toBe(true)

    const afgeleid = deriveDoelenStatus(goals, progresses)
    const verdict = doelenVerdict(goals, progresses)

    // De getoonde zin is exact de engine-telling, geen tweede som.
    expect(verdict.label).toBe(
      `${afgeleid.judgedCount - afgeleid.attentionCount} van ${afgeleid.judgedCount} op koers`,
    )
    expect(afgeleid.judgedCount).toBe(2)
    expect(verdict.label).toBe('1 van 2 op koers')
    // Tone volgt het slechtste doel — hier eentje die ver achterloopt.
    expect(verdict.status).toBe(afgeleid.status)
    expect(verdict.status).not.toBe('good')
  })

  it('alle beoordeelde doelen op koers → groen en een volle teller', () => {
    const goals = [
      goal({ id: 'a', current_value: 45000, target_value: 50000, target_date: '2030-12-31' }),
      goal({ id: 'b', current_value: 40000, target_value: 50000, target_date: '2030-12-31' }),
    ]
    const verdict = doelenVerdict(goals, goals.map(progressVan))
    expect(verdict.label).toBe('2 van 2 op koers')
    expect(verdict.status).toBe('good')
  })

  it('geen actief doel → geen oordeel (titel blijft de kale paginanaam)', () => {
    expect(doelenVerdict([], [])).toEqual({ label: null, status: 'neutral' })
  })

  it('wel doelen, niets te meten → neutrale stand, nooit groen', () => {
    const goals = [goal({ id: 'a', target_date: null }), goal({ id: 'b', target_date: null })]
    const verdict = doelenVerdict(goals, goals.map(progressVan))
    expect(verdict.label).toBe('Nog niets te meten')
    expect(verdict.status).toBe('neutral')
  })
})
