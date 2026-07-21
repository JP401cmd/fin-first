import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BacktestingScoreWidget } from './backtesting-score-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import { WEERBAARHEID_STERK, WEERBAARHEID_MATIG, WEERBAARHEID_SCHILD } from '@/lib/constants'
import type { DashboardData } from './widget-renderer'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, ...overrides }
}

describe('BacktestingScoreWidget — weergave op canoniek backtest-cijfer + gedeelde weerbaarheidsdrempels', () => {
  it('consumeert data.backtestSuccessRate rechtstreeks (geen herberekening)', () => {
    const { container } = render(<BacktestingScoreWidget size="mini" data={makeData({ backtestSuccessRate: 73 })} />)
    expect(container.textContent).toContain('73%')
  })

  it('nette empty-state wanneer succeskans ontbreekt', () => {
    const { container } = render(<BacktestingScoreWidget size="mini" data={makeData({ backtestSuccessRate: null })} />)
    expect(container.textContent).toContain('Onvoldoende data')
  })

  it('stoplicht-tint volgt de gedeelde drempels — semantisch, geen module-accent (geen text-horizon-*)', () => {
    // Sterk → positief
    const strong = render(<BacktestingScoreWidget size="mini" data={makeData({ backtestSuccessRate: WEERBAARHEID_STERK })} />)
    expect(strong.container.querySelector('.text-positive')).not.toBeNull()

    // Aandacht (tussen MATIG en STERK) → het WAARDE-getal krijgt de warning-tint (semantisch),
    // niet het module-accent. (De kicker mag wél module-geaccentueerd zijn — dat is identiteit, geen status.)
    const mid = render(<BacktestingScoreWidget size="mini" data={makeData({ backtestSuccessRate: WEERBAARHEID_MATIG })} />)
    const midValue = mid.container.querySelector('.font-mono')
    expect(midValue?.className).toContain('text-warning')
    expect(midValue?.className).not.toContain('text-horizon')

    // Onder MATIG → negatief
    const weak = render(<BacktestingScoreWidget size="mini" data={makeData({ backtestSuccessRate: WEERBAARHEID_MATIG - 1 })} />)
    expect(weak.container.querySelector('.text-negative')).not.toBeNull()
  })

  it('schild-icoon kantelt op WEERBAARHEID_SCHILD en heeft een toegankelijk label', () => {
    const veilig = render(<BacktestingScoreWidget size="quarter" data={makeData({ backtestSuccessRate: WEERBAARHEID_SCHILD })} />)
    expect(veilig.container.querySelector('[aria-label="Historisch weerbaar"]')).not.toBeNull()

    const kwetsbaar = render(<BacktestingScoreWidget size="quarter" data={makeData({ backtestSuccessRate: WEERBAARHEID_SCHILD - 1 })} />)
    expect(kwetsbaar.container.querySelector('[aria-label="Historisch kwetsbaar"]')).not.toBeNull()
  })

  it('full-size benchmark toont het gegronde doel-niveau (WEERBAARHEID_STERK), niet een verzonnen 85%-literal', () => {
    const { container } = render(<BacktestingScoreWidget size="full" data={makeData({ backtestSuccessRate: 90 })} />)
    // Label is nu eerlijk "Doel", niet "Benchmark"
    expect(container.textContent).toContain('Doel')
    expect(container.textContent).not.toContain('Benchmark')
    // Doel-percentage == de canonieke drempelconstante
    expect(container.textContent).toContain(`${WEERBAARHEID_STERK}%`)
  })

  it('half-size capt het aantal crisis-badges op 4', () => {
    const many = [
      { label: 'Crisis1', success: true },
      { label: 'Crisis2', success: true },
      { label: 'Crisis3', success: false },
      { label: 'Crisis4', success: true },
      { label: 'Crisis5', success: false },
      { label: 'Crisis6', success: true },
    ]
    const { container } = render(
      <BacktestingScoreWidget size="half" data={makeData({ backtestSuccessRate: 80, backtestNamedPaths: many })} />,
    )
    expect(container.textContent).toContain('Crisis4')
    expect(container.textContent).not.toContain('Crisis5')
    expect(container.textContent).not.toContain('Crisis6')
  })
})
