import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  SurplusGapChart,
  SurplusGapSummary,
  computeLifetimeTotals,
  type SurplusGapRow,
} from './surplus-gap-chart'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

// opgebouwd = 8000, ingeteerd = 5000, saldo = +3000, kantelpunt op leeftijd 41
const ROWS: SurplusGapRow[] = [
  { age: 40, flowIn: 10000, flowOut: 2000, oneTimeNet: 0, phase: 'accumulation' },
  { age: 41, flowIn: 0, flowOut: 5000, oneTimeNet: 0, phase: 'retirement' },
]

beforeEach(() => {
  window.localStorage.clear()
})

describe('computeLifetimeTotals', () => {
  it('sommeert opbouw/inteer en vindt het kantelpunt', () => {
    const t = computeLifetimeTotals(ROWS)
    expect(t.opgebouwd).toBe(8000)
    expect(t.ingeteerd).toBe(5000)
    expect(t.saldo).toBe(3000)
    expect(t.kantelpuntAge).toBe(41)
  })
})

describe('SurplusGapSummary privacy-masking', () => {
  for (const variant of ['inline', 'strip'] as const) {
    it(`toont euro-bedragen wanneer niet gemaskeerd (${variant})`, () => {
      render(
        <PrivacyProvider>
          <SurplusGapSummary rows={ROWS} variant={variant} />
        </PrivacyProvider>,
      )
      // Bedragen zichtbaar, geen bullets.
      expect(screen.getByText(/8\.000/)).toBeInTheDocument()
      expect(screen.queryByText(MASKED_AMOUNT_PLACEHOLDER)).not.toBeInTheDocument()
    })

    it(`maskeert alle bedragen wanneer masking aan staat (${variant})`, async () => {
      window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
      render(
        <PrivacyProvider>
          <SurplusGapSummary rows={ROWS} variant={variant} />
        </PrivacyProvider>,
      )
      // Drie cellen (opgebouwd/ingeteerd/saldo) → drie placeholders, geen euro's.
      await waitFor(() => {
        expect(screen.getAllByText(MASKED_AMOUNT_PLACEHOLDER)).toHaveLength(3)
      })
      expect(screen.queryByText(/8\.000/)).not.toBeInTheDocument()
      expect(screen.queryByText(/5\.000/)).not.toBeInTheDocument()
    })
  }
})

// ── FIRE-marker & compacte modus ─────────────────────────────────────────────

// Lange horizon zodat de FIRE-lijn (46,58…) binnen het zichtbare bereik valt.
const LONG_ROWS: SurplusGapRow[] = Array.from({ length: 51 }, (_, i) => ({
  age: 40 + i,
  flowIn: 40 + i < 47 ? 10000 : 0,
  flowOut: 40 + i < 47 ? 2000 : 5000,
  oneTimeNet: 0,
  phase: 40 + i < 47 ? 'accumulation' : 'retirement',
}))

describe('SurplusGapChart — FIRE-marker', () => {
  it('toont de FIRE-leeftijd op één decimaal, nooit de rauwe fractional', () => {
    const { container } = render(
      <SurplusGapChart
        rows={LONG_ROWS}
        currentAge={40}
        endAge={90}
        fireAge={46.583333333333336}
        planningMode="fire"
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('FIRE 46.6')
    expect(text).not.toContain('46.58333')
  })
})

describe('SurplusGapChart — compacte hoogte (kaart-inbedding)', () => {
  it('respecteert een kleine height in de viewBox en dunt de y-ticks uit', () => {
    // De half-widget mag maar ~72px grafiek kwijt; vijf y-labels op zo'n
    // binnenhoogte lopen door elkaar, dus compact = alleen +max / €0 / −max.
    const { container } = render(
      <SurplusGapChart
        rows={LONG_ROWS}
        currentAge={40}
        endAge={90}
        fireAge={null}
        height={72}
        showLegend={false}
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 \d+ 72$/)
    const yLabels = (container.textContent ?? '').match(/[+−]€/g) ?? []
    expect(yLabels.length).toBeLessThanOrEqual(2)
  })
})
