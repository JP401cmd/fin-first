import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DoelenWidget } from '../doelen-widget'
import type { DashboardData, TopGoal } from '../widget-renderer'

/**
 * Test voor de DoelenWidget-empty-state (H-07b). De full-size lege staat
 * MOET een CTA naar /toekomst/doelen tonen ("Geen CTA = doodlopend").
 */

// WidgetShell full-size wikkelt content in ScrollableContent, dat ResizeObserver
// gebruikt — niet aanwezig in jsdom. Minimale mock.
beforeAll(() => {
  if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver
  }
})

const emptyData = { topGoals: [], goals: 0 } as unknown as DashboardData

describe('DoelenWidget — lege staat (H-07b)', () => {
  it('full-size zonder doelen toont een CTA-link naar /toekomst/doelen', () => {
    const { container } = render(<DoelenWidget size="full" data={emptyData} />)
    // Kop + CTA-label aanwezig.
    expect(screen.getByText('Nog geen doelen ingesteld')).toBeTruthy()
    const cta = screen.getByText('Stel je eerste doel')
    expect(cta).toBeTruthy()
    // De CTA is een link naar /toekomst/doelen.
    const link = container.querySelector('a[href="/toekomst/doelen"]')
    expect(link).toBeTruthy()
    expect(link?.textContent).toContain('Stel je eerste doel')
  })

  it('CTA voldoet aan de tap-target-eis (min-h-11)', () => {
    const { container } = render(<DoelenWidget size="full" data={emptyData} />)
    const link = container.querySelector('a[href="/toekomst/doelen"]')
    expect(link?.className).toContain('min-h-11')
  })
})

/**
 * Regressie voor Bevinding 1 (consume-don't-recompute): de widget MOET de
 * richting-bewuste `computeGoalProgress` consumeren i.p.v. lokaal
 * `current/target` te rekenen. Voor `direction:'down'`-types (fire_age:
 * lager-is-beter) klemde de oude lokale som structureel op 100% ("behaald")
 * terwijl het doel nog niet bereikt was — en week zo af van het doel-scherm.
 */
function makeData(goal: Partial<TopGoal> & Pick<TopGoal, 'goal_type' | 'current_value' | 'target_value'>): DashboardData {
  return {
    goals: 1,
    topGoals: [
      {
        id: 'g1',
        name: 'Vrijheidsleeftijd',
        target_date: null,
        color: 'teal',
        icon: 'Hourglass',
        ...goal,
      },
    ],
  } as unknown as DashboardData
}

describe('DoelenWidget — doelvoortgang (Bevinding 1, richting-bewust)', () => {
  it('fire_age (down) dat NIET behaald is toont target/current, niet 100%', () => {
    // current 62 > target 58 → canoniek pct = round(58/62*100) = 94%.
    const data = makeData({ goal_type: 'fire_age', current_value: 62, target_value: 58 })
    render(<DoelenWidget size="full" data={data} />)
    // Zowel de rij als "GEM. VOORTGANG" tonen 94% (de oude, foute som gaf 100%).
    expect(screen.getAllByText('94%').length).toBeGreaterThan(0)
    expect(screen.queryByText('100%')).toBeNull()
    // "BEHAALD"-teller staat op 0 (het doel is niet af).
    const behaald = screen.getByText('BEHAALD').closest('div')
    expect(behaald?.textContent).toContain('0')
  })

  it('gewone up-doel (savings) behoudt current/target-voortgang', () => {
    const data = makeData({ goal_type: 'savings', current_value: 50, target_value: 100 })
    render(<DoelenWidget size="full" data={data} />)
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0)
  })
})
