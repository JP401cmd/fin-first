import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SurplusGapWidget } from './surplus-gap-widget'
import type { DashboardData } from './widget-renderer'

// Privacy default zichtbaar — spiegelt spend-limit-widget.test.
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({ masked: false }),
}))

const SIM_ROWS = Array.from({ length: 51 }, (_, i) => ({
  age: 40 + i,
  flowIn: 40 + i < 47 ? 10000 : 0,
  flowOut: 40 + i < 47 ? 2000 : 5000,
  oneTimeNet: 0,
  phase: 40 + i < 47 ? 'accumulation' : 'retirement',
}))

function makeData(): DashboardData {
  return {
    simRows: SIM_ROWS,
    fireAgeFractional: 46.583333333333336,
    fireEndStrategy: null,
  } as unknown as DashboardData
}

describe('SurplusGapWidget — half past binnen de kaart', () => {
  it('geeft de grafiek een hoogte die samen met de samenvatting in de 140px-kaart past', () => {
    // De half-kaart heeft op mobiel ~113px binnenhoogte; grafiek (vaste
    // viewBox-hoogte) + samenvatting (~33px) moeten daar sámen in — anders
    // schuiven de bedragen over de grafiek heen (bug /overzicht 31 aug).
    const { container } = render(<SurplusGapWidget size="half" data={makeData()} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    const viewBox = svg?.getAttribute('viewBox') ?? ''
    const height = Number(viewBox.split(' ')[3])
    // Gemeten hoogte; zonder ResizeObserver-meting (jsdom) de terugval 48.
    // De shell laat op mobiel maar ~70px over (kicker + pijl-rij), dus een
    // vaste 72 was nog steeds te hoog.
    expect(height).toBeLessThanOrEqual(48)
  })

  it('de half-samenvatting is een regel met een eigen wrap-slot, geen 3-koloms grid', () => {
    // Het inline-grid (labels boven bedragen) kost ~33px; op de resterende
    // ~70px verdringt dat de grafiek. Een regel van ~14px laat de grafiek
    // ademen.
    const { container } = render(<SurplusGapWidget size="half" data={makeData()} />)
    expect(container.querySelector('[data-testid="surplus-half-summary-line"]')).not.toBeNull()
  })

  it('toont in half óók de drie samenvattingscellen', () => {
    const { container } = render(<SurplusGapWidget size="half" data={makeData()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Opgebouwd')
    expect(text).toContain('Ingeteerd')
    expect(text).toContain('Saldo')
  })
})
