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

/**
 * REGRESSIE (review-bevinding B1, 20 sep 2026): een doel ZÓNDER meting mag op /overzicht
 * geen "0%" met een lege balk tonen.
 *
 * Het gat zat niet in de weergave maar in de PROJECTIE: `syncActiveGoalValues` zet
 * `notApplicableReason` in-memory (er is geen kolom), en de `TopGoal`-projectie in
 * dashboard-data-loader liet dat veld weg. `computeGoalProgress` viel dan terug op de
 * omhoog-tak — die ként geen "current <= 0 ⇒ niet gemeten"-guard — en de widget
 * beweerde dat de gebruiker niets extra inlegt. Compile- én test-onzichtbaar, want de
 * widget krijgt het doel als prop.
 *
 * Given een doel zonder meting (extra inleg, of een uitkomstdoel buiten zijn anker)
 * When  de doelen-widget het rendert
 * Then  staat er "—" in plaats van een percentage, en is er geen voortgangsbalk.
 */
function doel(over: Partial<TopGoal> = {}): TopGoal {
  return {
    id: 'g1',
    name: 'Extra inleg naar € 500/mnd',
    goal_type: 'extra_deposit',
    current_value: 0,
    target_value: 500,
    target_date: null,
    color: 'teal',
    icon: 'Target',
    ...over,
  } as TopGoal
}

const metDoelen = (goals: TopGoal[]) => ({ topGoals: goals, goals: goals.length }) as unknown as DashboardData

describe('DoelenWidget — een doel zonder meting (B1)', () => {
  it('toont een streepje in plaats van 0% en tekent geen balk', () => {
    const { container } = render(
      <DoelenWidget size="full" data={metDoelen([doel({ notApplicableReason: 'Hier meet de app niets.' })])} />,
    )
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-label="Voortgang Extra inleg naar € 500/mnd"]')).toBeNull()
  })

  it('een doel MÉT meting houdt zijn percentage en balk', () => {
    const { container } = render(
      <DoelenWidget
        size="full"
        data={metDoelen([doel({ goal_type: 'savings_rate', name: 'Spaarquote naar 72%', current_value: 36, target_value: 72 })])}
      />,
    )
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-label="Voortgang Spaarquote naar 72%"]')).toBeTruthy()
  })

  it('quarter-size doet hetzelfde — het gat zat in élke variant', () => {
    render(<DoelenWidget size="quarter" data={metDoelen([doel({ notApplicableReason: 'Hier meet de app niets.' })])} />)
    expect(screen.queryByText('0%')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
