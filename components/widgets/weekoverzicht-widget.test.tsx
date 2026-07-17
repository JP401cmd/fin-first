import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekoverzichtWidget } from './weekoverzicht-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData } from './widget-renderer'

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// Repliceer de canonieke lokale-datumstring (lib/budget-period#localDateStr).
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function makeData(overrides: Partial<DashboardData['weekOverview']>, dailyExpenseRate = 70): DashboardData {
  return {
    ...MOCK_DASHBOARD_DATA,
    dailyExpenseRate,
    weekOverview: {
      ...MOCK_DASHBOARD_DATA.weekOverview,
      ...overrides,
    },
  }
}

const ORIGINAL_TZ = process.env.TZ
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = ORIGINAL_TZ
})

describe('WeekoverzichtWidget', () => {
  // H1-regressie: "vandaag" moet in het LOKALE datumframe worden bepaald.
  // In een timezone achter UTC, laat op de dag, verschilt de lokale datum van
  // de UTC-datum. Een reverted toISOString()-pad zou dan de verkeerde (of geen)
  // staaf oplichten.
  it('markeert de juiste dag als "vandaag" in het lokale datumframe (niet UTC)', () => {
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers()
    // 01:00 UTC = 21:00 (vorige dag) in New York (UTC-4 in de zomer).
    vi.setSystemTime(new Date('2026-07-07T01:00:00Z'))

    const todayStr = localDay(new Date()) // '2026-07-06' in NY, '2026-07-07' in UTC
    expect(todayStr).toBe('2026-07-06')

    const days = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
    // Zet "vandaag" op index 2 (labels zijn hier niet aan de echte weekdag gekoppeld).
    const todayIdx = 2
    const dailyExpenses = days.map((label, i) => ({
      day: i === todayIdx ? todayStr : `2026-07-1${i}`,
      label,
      amount: 20 + i,
    }))

    const { container } = render(
      <WeekoverzichtWidget size="full" data={makeData({ weekExpenses: 350, weekBudget: 0, dailyExpenses })} />,
    )

    const rects = Array.from(container.querySelectorAll('rect'))
    expect(rects).toHaveLength(7)
    // Precies één staaf is volledig ondoorzichtig: die van vandaag (index 2).
    const fullyOpaque = rects.filter((r) => r.getAttribute('opacity') === '1')
    expect(fullyOpaque).toHaveLength(1)
    expect(rects[todayIdx].getAttribute('opacity')).toBe('1')
  })

  // M2-filosofie: euro's worden ook als vrijheidsdagen getoond.
  it('toont weekuitgaven ook als vrijheidsdagen (Geld is opgeslagen tijd)', () => {
    const dailyExpenses = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((label, i) => ({
      day: `2026-07-0${i + 1}`,
      label,
      amount: 50,
    }))
    // 350 / dagtarief 70 = 5,0 vrijheidsdagen.
    render(<WeekoverzichtWidget size="full" data={makeData({ weekExpenses: 350, weekBudget: 0, dailyExpenses }, 70)} />)
    expect(screen.getByText(/vrijheidsdagen/i)).toBeInTheDocument()
    expect(screen.getByText(/5,0/)).toBeInTheDocument()
  })

  // L2: zonder weekbudget-basislijn krijgt geen enkele staaf de "over budget"-kleur.
  it('gebruikt geen "over budget"-kleur als er geen weekbudget is', () => {
    const dailyExpenses = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((label, i) => ({
      day: `2026-07-0${i + 1}`,
      label,
      amount: 40,
    }))
    const { container } = render(
      <WeekoverzichtWidget size="full" data={makeData({ weekExpenses: 280, weekBudget: 0, dailyExpenses })} />,
    )
    const overColored = Array.from(container.querySelectorAll('rect')).filter(
      (r) => r.getAttribute('fill') === 'var(--kern-500)',
    )
    expect(overColored).toHaveLength(0)
  })
})
