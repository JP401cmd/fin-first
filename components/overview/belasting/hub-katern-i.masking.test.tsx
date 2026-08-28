import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

/**
 * PRIVACY-REGRESSIE op katern I van de Belasting-hub (ADR 0091, S14).
 *
 * Katern I was het laatste blok op deze hub dat de privacymodus negeerde: het
 * hero-bedrag van `HubTotaleDruk` en de euro-legenda van `VerdelingStaaf`
 * stonden onder het oog-icoon gewoon in beeld, terwijl `HubKansen` ernaast al
 * maskeerde. Oorzaak was structureel — beide waren server-components en konden
 * `useMaskedAmounts()` niet lezen.
 *
 * Deze suite bewaakt beide kanten: zichtbaar zonder maskering, bullets met.
 * De PERCENTAGES blijven bewust zichtbaar — een tarief of een aandeel verraadt
 * geen bedrag, en ze zijn zonder de euro's ook niet terug te rekenen.
 */

const { maskedRef } = vi.hoisted(() => ({ maskedRef: { current: false } }))

vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => ({
    masked: maskedRef.current,
    setMasked: () => {},
    toggle: () => {},
  }),
}))

const { HubTotaleDruk } = await import('./hub-totale-druk')
const { VerdelingStaaf } = await import('./verdeling-staaf')
const { buildTaxOverview } = await import('@/lib/tax-overview')
const { computeBox1Tax } = await import('@/lib/box1-tax')

const GROSS = 93_369
const BOX3_TAX = 599
const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

const overview = buildTaxOverview({
  box1Tax: Math.round(motor.tax),
  box2Tax: null,
  box3Tax: BOX3_TAX,
  effectiveRate: motor.effectiveRate,
  marginalRate: motor.marginalRate,
  dailyExpenses: 100,
})

function renderDruk() {
  return render(
    <DisplayModeProvider initialMode="full">
      <HubTotaleDruk
        overview={overview}
        dailyExpenses={100}
        dailyIncome={GROSS / 365}
        incomeKnown
      />
    </DisplayModeProvider>,
  )
}

describe('Katern I — hero-bedrag onder privacymodus', () => {
  it('toont het bedrag wanneer niet gemaskeerd', () => {
    maskedRef.current = false
    const { container } = renderDruk()
    expect(container.textContent).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(screen.getByText(/32\.|33\.|\d\.\d{3}/)).toBeTruthy()
  })

  it('vervangt het bedrag door bullets wanneer gemaskeerd', () => {
    maskedRef.current = true
    const { container } = renderDruk()
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // De tarieven blijven staan: een percentage is geen bedrag.
    expect(screen.getByText('Effectief')).toBeTruthy()
    expect(screen.getByText('Marginaal')).toBeTruthy()
  })
})

describe('Katern I — verdeling-legenda onder privacymodus', () => {
  const segments = [
    { label: 'Box 1 — werk + woning', value: 32_000, colorVar: 'var(--color-box1-700)' },
    { label: 'Box 3 — sparen + beleggen', value: BOX3_TAX, colorVar: 'var(--color-box3-700)' },
  ]

  it('toont de bedragen wanneer niet gemaskeerd', () => {
    maskedRef.current = false
    const { container } = render(<VerdelingStaaf segments={segments} />)
    expect(container.textContent).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).toContain('599')
  })

  it('maskeert legenda én segment-tooltip, maar houdt de percentages', () => {
    maskedRef.current = true
    const { container } = render(<VerdelingStaaf segments={segments} />)
    expect(container.textContent).not.toContain('599')
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // De tooltip mag het bedrag ook niet alsnog prijsgeven.
    const titels = Array.from(container.querySelectorAll('[title]')).map((n) =>
      n.getAttribute('title'),
    )
    expect(titels.length).toBeGreaterThan(0)
    expect(titels.every((t) => !/599/.test(t ?? ''))).toBe(true)
    // Aandelen blijven zichtbaar.
    expect(container.textContent).toMatch(/\d+%/)
  })
})
