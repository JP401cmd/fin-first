import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BelastingBox3Widget } from './belasting-box3-widget'
import type { DashboardData } from './widget-renderer'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'

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

describe('BelastingBox3Widget', () => {
  it('toont de kassabon met de canonieke Box 3-belasting bij vermogen boven de vrijstelling', () => {
    render(<BelastingBox3Widget size="full" data={makeData()} />)
    expect(screen.getByText('Box 3 belasting')).toBeInTheDocument()
    expect(screen.getByText('Box 3-vermogen')).toBeInTheDocument()
    // Geen lege staat wanneer er wél te belasten vermogen is.
    expect(screen.queryByText('Geen Box 3-belasting')).not.toBeInTheDocument()
  })

  it('kassabon-invariant: grondslagSparen × effectiefForfait × tarief == getoonde belasting', () => {
    const bd = MOCK_DASHBOARD_DATA.box3Breakdown!
    const reconstructed = bd.grondslagSparen * bd.effectiefForfait * bd.tarief
    expect(Math.abs(reconstructed - bd.tax)).toBeLessThan(1)
    expect(Math.abs(bd.box3Income * bd.tarief - bd.tax)).toBeLessThan(1)
  })

  it('rendert een lege staat wanneer het vermogen onder de vrijstelling blijft', () => {
    render(
      <BelastingBox3Widget
        size="full"
        data={makeData({ totalAssets: 20_000, box3Tax: 0, box3Breakdown: null })}
      />,
    )
    expect(screen.getByText('Geen Box 3-belasting')).toBeInTheDocument()
    expect(screen.queryByText('Box 3-vermogen')).not.toBeInTheDocument()
  })

  it('mini-size toont "Geen Box 3" zonder vermogen boven de vrijstelling', () => {
    render(
      <BelastingBox3Widget
        size="mini"
        data={makeData({ totalAssets: 0, box3Tax: null, box3Breakdown: null })}
      />,
    )
    expect(screen.getByText('Geen Box 3')).toBeInTheDocument()
  })
})
