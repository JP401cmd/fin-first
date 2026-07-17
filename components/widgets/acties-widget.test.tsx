import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ActiesWidget } from './acties-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData, TopAction, CompletedAction } from './widget-renderer'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(
  topOpenActions: TopAction[],
  recentCompletedActions: CompletedAction[] = [],
): DashboardData {
  return {
    ...MOCK_DASHBOARD_DATA,
    openActions: topOpenActions.length,
    topOpenActions,
    recentCompletedActions,
  }
}

const ACTIONS_1_TO_5: TopAction[] = [
  { id: 'a5', title: 'Actie prio 5', freedom_days_impact: 40, priority_score: 5, due_date: null, source: 'manual' },
  { id: 'a4', title: 'Actie prio 4', freedom_days_impact: 30, priority_score: 4, due_date: null, source: 'manual' },
  { id: 'a3', title: 'Actie prio 3', freedom_days_impact: 20, priority_score: 3, due_date: null, source: 'manual' },
  { id: 'a2', title: 'Actie prio 2', freedom_days_impact: 10, priority_score: 2, due_date: null, source: 'manual' },
  { id: 'a1', title: 'Actie prio 1', freedom_days_impact: 5, priority_score: 1, due_date: null, source: 'manual' },
]

describe('ActiesWidget — prioriteit-indicator (F1: mojibake-regressie)', () => {
  it('rendert de ster ★, nooit de corrupte ˜…-string', () => {
    const { container } = render(<ActiesWidget size="full" data={makeData(ACTIONS_1_TO_5)} />)
    expect(container.textContent).not.toContain('˜…')
    expect(container.textContent).toContain('★')
  })
})

describe('ActiesWidget — a11y op de prioriteit-indicator (F5)', () => {
  it('elke prioriteitswaarde heeft een tekstalternatief (niet cijfer-only)', () => {
    const { container } = render(<ActiesWidget size="full" data={makeData(ACTIONS_1_TO_5)} />)
    const labelled = container.querySelectorAll('[aria-label^="Prioriteit"]')
    expect(labelled.length).toBeGreaterThan(0)
  })
})

describe('ActiesWidget — RECENT AFGEROND (F2: hersteld databron-pad)', () => {
  it('toont afgeronde acties in full-size wanneer de loader ze levert', () => {
    const completed: CompletedAction[] = [
      { id: 'c1', title: 'Spotify opgezegd', freedomDaysImpact: 3, completedAt: '2026-07-10' },
    ]
    const { container } = render(<ActiesWidget size="full" data={makeData(ACTIONS_1_TO_5, completed)} />)
    expect(container.textContent).toContain('RECENT AFGEROND')
    expect(container.textContent).toContain('Spotify opgezegd')
  })

  it('verbergt de sectie wanneer er geen recent afgeronde acties zijn', () => {
    const { container } = render(<ActiesWidget size="full" data={makeData(ACTIONS_1_TO_5, [])} />)
    expect(container.textContent).not.toContain('RECENT AFGEROND')
  })
})

describe('ActiesWidget — jaar-framing (F3)', () => {
  it('badges en KPI dragen een /jr-suffix', () => {
    const { container } = render(<ActiesWidget size="full" data={makeData(ACTIONS_1_TO_5)} />)
    expect(container.textContent).toContain('/jr')
    expect(container.textContent).toContain('DAGEN/JAAR TE WINNEN')
  })
})
