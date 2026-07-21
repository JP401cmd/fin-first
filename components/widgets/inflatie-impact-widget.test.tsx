import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InflatieImpactWidget } from './inflatie-impact-widget'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'
import { INFLATION } from '@/lib/constants'

// WidgetShell trekt bij full-size ResizeObserver; jsdom kent 'm niet.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ perspective: 'personal', partnerName: null }),
}))

// De widget leest alleen data.inflationRate (en niets meer van fireTarget).
function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return { inflationRate: INFLATION, ...overrides } as unknown as DashboardData
}

/** Canonieke koopkracht-discontering — spiegel van de widget-implementatie. */
const purchasingPower = (rate: number, year: number) => 1000 / Math.pow(1 + rate, year)

// nl-NL currency zet een smalle no-break-space (U+202F) tussen € en getal;
// getByText normaliseert die in de DOM maar niet in de matcher-string. Vergelijk
// daarom whitespace-insensitief zodat de assertie op de echte waarde pint.
const strip = (s: string) => s.replace(/\s/g, '')
const isMoney = (n: number) => (content: string) => strip(content) === strip(formatCurrency(n))

describe('InflatieImpactWidget — koopkracht-discontering', () => {
  it('half-size: toont reële waarde 1000/(1+i)^j, niet de (1−i)^j-benadering', () => {
    const data = makeData({ inflationRate: 0.02 })
    const correct = formatCurrency(purchasingPower(0.02, 30)) // ≈ €552
    const wrong = formatCurrency(1000 * Math.pow(1 - 0.02, 30)) // ≈ €545 (oud)
    expect(strip(correct)).not.toBe(strip(wrong)) // guard: grondslagen divergeren echt

    render(<InflatieImpactWidget size="half" data={data} />)
    expect(screen.getAllByText(isMoney(purchasingPower(0.02, 30))).length).toBeGreaterThan(0)
    expect(screen.queryByText(isMoney(1000 * Math.pow(1 - 0.02, 30)))).not.toBeInTheDocument()
  })

  it('full-size: tabel toont canonieke koopkracht per jaar', () => {
    const data = makeData({ inflationRate: 0.02 })
    render(<InflatieImpactWidget size="full" data={data} />)
    // Jaar 30-rij: reële waarde ≈ €552 (niet €545).
    expect(screen.getByText(isMoney(purchasingPower(0.02, 30)))).toBeInTheDocument()
    expect(screen.queryByText(isMoney(1000 * Math.pow(1 - 0.02, 30)))).not.toBeInTheDocument()
  })

  it('0%-inflatie is een geldige waarde: geen stille terugval op 2%', () => {
    const data = makeData({ inflationRate: 0 })
    render(<InflatieImpactWidget size="quarter" data={data} />)
    expect(screen.getByText('0.0%')).toBeInTheDocument()
    // Bij 0% erodeert €1.000 niet.
    expect(screen.getByText(/€\s?1\.000 waard/)).toBeInTheDocument()
  })

  it('valt terug op INFLATION-constante wanneer inflationRate ontbreekt', () => {
    const data = makeData({ inflationRate: undefined as unknown as number })
    render(<InflatieImpactWidget size="mini" data={data} />)
    expect(screen.getByText(`${(INFLATION * 100).toFixed(1)}%`)).toBeInTheDocument()
  })

  it('FIRE-kolom is geschrapt: geen "extra FIRE-vermogen"-legenda, ook niet met fireTarget', () => {
    const data = makeData({ inflationRate: 0.02, fireTarget: 500_000 } as Partial<DashboardData>)
    render(<InflatieImpactWidget size="full" data={data} />)
    expect(screen.queryByText(/extra FIRE-vermogen nodig door inflatie/)).not.toBeInTheDocument()
  })
})
