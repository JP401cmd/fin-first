import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BeslissingspatronenWidget } from './beslissingspatronen-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import { RECOMMENDATION_TYPE_LABELS, OVERIG_TYPE_LABEL } from '@/lib/recommendation-data'
import type { DashboardData } from './widget-renderer'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(patterns: DashboardData['decisionPatterns']): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, decisionPatterns: patterns }
}

const PATTERNS: DashboardData['decisionPatterns'] = [
  { type: 'debt_acceleration', days: 22, count: 3 },
  { type: 'budget_optimization', days: 12, count: 5 },
  { type: 'overig', days: 5, count: 4 },
]

describe('BeslissingspatronenWidget — canonieke labels (één bron van waarheid)', () => {
  it('gebruikt de canonieke RECOMMENDATION_TYPE_LABELS, niet een eigen bewoording', () => {
    const { container } = render(<BeslissingspatronenWidget size="full" data={makeData(PATTERNS)} />)
    expect(container.textContent).toContain(RECOMMENDATION_TYPE_LABELS.debt_acceleration) // 'Schuld versnellen'
    expect(container.textContent).toContain(RECOMMENDATION_TYPE_LABELS.budget_optimization) // 'Budget optimalisatie'
    // Nooit de oude, afwijkende widget-bewoording
    expect(container.textContent).not.toContain('Schuldversnelling')
    expect(container.textContent).not.toContain('Budgetoptimalisatie')
  })

  it('labelt de overig-bucket netjes i.p.v. de rauwe string "overig"', () => {
    const { container } = render(<BeslissingspatronenWidget size="full" data={makeData(PATTERNS)} />)
    expect(container.textContent).toContain(OVERIG_TYPE_LABEL)
    expect(container.textContent).not.toMatch(/(^|\s)overig(\s|$)/)
  })
})

describe('BeslissingspatronenWidget — full biedt meer dan half (aantal acties)', () => {
  it('full toont het aantal afgeronde acties per patroon', () => {
    const { container } = render(<BeslissingspatronenWidget size="full" data={makeData(PATTERNS)} />)
    expect(container.textContent).toContain('3 acties')
    expect(container.textContent).toContain('5 acties')
  })

  it('half toont het aantal niet (progressive disclosure)', () => {
    const { container } = render(<BeslissingspatronenWidget size="half" data={makeData(PATTERNS)} />)
    expect(container.textContent).not.toContain('3 acties')
    expect(container.textContent).not.toContain('5 acties')
  })
})

describe('BeslissingspatronenWidget — lege staat', () => {
  it('toont "Nog geen patronen" bij een lege lijst', () => {
    const { container } = render(<BeslissingspatronenWidget size="full" data={makeData([])} />)
    expect(container.textContent).toContain('Nog geen patronen')
  })
})
