import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Box3DragWidget } from './box3-drag-widget'
import { BelastingBox3Widget } from './belasting-box3-widget'
import type { DashboardData } from './widget-renderer'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import { formatCurrency } from '@/lib/format'
import { NL_FICTIEF_BELEGGINGEN } from '@/lib/constants'

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

describe('Box3DragWidget — consume-don\'t-recompute', () => {
  it('H2: vrijheidsdagen op HETZELFDE canonieke dagtarief als belasting_box3 (KRUIS-20)', () => {
    const data = makeData()
    // Canonieke noemer = data.dailyExpenseRate (100). box3Tax 1842 → 18 dagen.
    const expectedDays = Math.round((data.box3Tax as number) / (data.dailyExpenseRate as number))
    // De oude, foutieve noemer (yearlyMustExpenses/365 ≈ 78,9) gaf een ander getal (23).
    const oldNoemerDays = Math.round((data.box3Tax as number) / ((data.yearlyMustExpenses as number) / 365))
    // Sanity: de mock differentieert de twee noemers, anders test de assertie niets.
    expect(oldNoemerDays).not.toBe(expectedDays)

    const dragText = render(<Box3DragWidget size="half" data={data} />).container.textContent ?? ''
    const zusterText = render(<BelastingBox3Widget size="half" data={data} />).container.textContent ?? ''

    // Beide widgets tonen exact hetzelfde aantal vrijheidsdagen voor dezelfde heffing.
    expect(dragText).toContain(`${expectedDays} vrijheidsdagen per jaar`)
    expect(zusterText).toContain(`${expectedDays} dagen/jaar`)
    // En niet meer het afwijkende getal van de oude must-expenses/365-noemer.
    expect(dragText).not.toContain(`${oldNoemerDays} vrijheidsdagen`)
  })

  it('M1: "Fictief rendement (Box 3)" consumeert box3Income i.p.v. lokale forfait-recompute', () => {
    const data = makeData()
    const bd = data.box3Breakdown!
    const { container } = render(<Box3DragWidget size="full" data={data} />)
    const text = container.textContent ?? ''

    // Geconsumeerd: het canonieke forfaitaire Box 3-inkomen dat sluit op box3Tax.
    expect(text).toContain(formatCurrency(bd.box3Income))
    // NIET meer de overschatte lokale recompute (totalAssets × 6% forfait, zonder
    // heffingsvrij/schulden/spaar-forfait) die niet op box3Tax sloot.
    const overstatedRecompute = (data.totalAssets as number) * NL_FICTIEF_BELEGGINGEN
    expect(overstatedRecompute).toBeGreaterThan(bd.box3Income) // documenteert de overschatting
    expect(text).not.toContain(formatCurrency(overstatedRecompute))
  })

  it('M2: vermogensgroei eerlijk gelabeld (geen "rendement"-frame, geen advies-hint)', () => {
    const { container } = render(<Box3DragWidget size="full" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Vermogensgroei (geschat)')
    expect(text).not.toContain('Werkelijk rendement')
    expect(text).not.toContain('asset-mix')
  })

  it('M3: lege staat onder de heffingsvrije drempel (box3Tax 0/null → geen drag)', () => {
    render(
      <Box3DragWidget
        size="full"
        data={makeData({ totalAssets: 20_000, box3Tax: 0, box3Breakdown: null })}
      />,
    )
    expect(screen.getByText('Geen Box 3-drag')).toBeInTheDocument()
    expect(screen.queryByText('5-jaar projectie')).not.toBeInTheDocument()
  })

  it('M3: mini-size toont "Geen drag" zonder Box 3-heffing', () => {
    render(
      <Box3DragWidget
        size="mini"
        data={makeData({ totalAssets: 0, box3Tax: null, box3Breakdown: null })}
      />,
    )
    expect(screen.getByText('Geen drag')).toBeInTheDocument()
  })

  it('toont de canonieke Box 3-heffing als headline bij vermogen boven de vrijstelling', () => {
    const data = makeData()
    const { container } = render(<Box3DragWidget size="full" data={data} />)
    const text = container.textContent ?? ''
    // Headline == bundel-box3Tax (identiek aan /overzicht/belasting/box3).
    expect(text).toContain(formatCurrency(data.box3Tax as number))
    expect(screen.getByText('5-jaar projectie')).toBeInTheDocument()
  })
})
