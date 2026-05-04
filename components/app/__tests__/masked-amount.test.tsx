/**
 * Smoke tests for <MaskedAmount> + the underlying formatMaskedCurrency helper.
 *
 * Covers:
 *  1. Renders bullet placeholder when masked=true and the formatted EUR
 *     string when masked=false.
 *  2. Applies the correct accent class per `tone` prop while masked, and no
 *     tone class while visible (so amounts inherit parent ink color).
 *  3. Always wraps in font-mono tabular-nums to keep masked/unmasked widths
 *     interchangeable (no layout shift when toggling).
 *  4. signPrefix renders only when visible — hidden under mask so the
 *     direction of a delta (+/−) does not leak.
 *  5. formatMaskedCurrency unit behavior matches the JSX wrapper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  PRIVACY_MASKED_STORAGE_KEY,
  PrivacyProvider,
} from '@/lib/hooks/use-privacy'
import {
  formatMaskedCurrency,
  MASKED_AMOUNT_PLACEHOLDER,
  formatCurrency,
} from '@/lib/format'
import { MaskedAmount } from '../masked-amount'

function renderInProvider(ui: React.ReactNode, opts?: { masked?: boolean }) {
  if (opts?.masked) {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
  }
  return render(<PrivacyProvider>{ui}</PrivacyProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('formatMaskedCurrency', () => {
  it('returns the bullet placeholder when masked=true', () => {
    expect(formatMaskedCurrency(1234, true)).toBe(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('returns a localized EUR string when masked=false', () => {
    expect(formatMaskedCurrency(1234, false)).toBe(formatCurrency(1234))
  })

  it('handles null/undefined safely (delegates to formatCurrency)', () => {
    expect(formatMaskedCurrency(null, false)).toBe(formatCurrency(0))
    expect(formatMaskedCurrency(undefined, false)).toBe(formatCurrency(0))
  })
})

describe('<MaskedAmount>', () => {
  it('renders the formatted EUR amount when not masked', () => {
    renderInProvider(<MaskedAmount value={1234} />)
    // Intl uses NBSP between € and digits; match by digits only.
    expect(screen.getByText(/1\.234/)).toBeInTheDocument()
  })

  it('renders bullets in the module accent when masked', () => {
    renderInProvider(<MaskedAmount value={1234} tone="module" />, { masked: true })
    const node = screen.getByText(MASKED_AMOUNT_PLACEHOLDER)
    expect(node).toBeInTheDocument()
    expect(node.className).toMatch(/text-\[var\(--module-active-500\)\]/)
  })

  it('applies kern tone when masked', () => {
    renderInProvider(<MaskedAmount value={10} tone="kern" />, { masked: true })
    expect(screen.getByText(MASKED_AMOUNT_PLACEHOLDER).className).toMatch(
      /text-\[var\(--color-kern-500\)\]/,
    )
  })

  it('applies wil tone when masked', () => {
    renderInProvider(<MaskedAmount value={10} tone="wil" />, { masked: true })
    expect(screen.getByText(MASKED_AMOUNT_PLACEHOLDER).className).toMatch(
      /text-\[var\(--color-wil-500\)\]/,
    )
  })

  it('applies horizon tone when masked', () => {
    renderInProvider(<MaskedAmount value={10} tone="horizon" />, { masked: true })
    expect(screen.getByText(MASKED_AMOUNT_PLACEHOLDER).className).toMatch(
      /text-\[var\(--color-horizon-500\)\]/,
    )
  })

  it('always carries font-mono + tabular-nums for layout stability', () => {
    renderInProvider(<MaskedAmount value={9999} />)
    expect(screen.getByText(/9\.999/).className).toMatch(
      /font-mono.*tabular-nums|tabular-nums.*font-mono/,
    )
  })

  it('renders signPrefix when visible', () => {
    renderInProvider(<MaskedAmount value={50} signPrefix="+" />)
    // signPrefix prepends + to the formatted EUR string.
    expect(screen.getByText(/^\+€/)).toBeInTheDocument()
  })

  it('suppresses signPrefix when masked (no direction leak)', () => {
    renderInProvider(<MaskedAmount value={50} signPrefix="+" />, { masked: true })
    expect(screen.getByText(MASKED_AMOUNT_PLACEHOLDER).textContent).toBe(
      MASKED_AMOUNT_PLACEHOLDER,
    )
  })

  it('passes through extra className for size/weight tweaks', () => {
    renderInProvider(<MaskedAmount value={1} className="text-2xl font-semibold" />)
    const node = screen.getByText(/€/)
    expect(node.className).toMatch(/text-2xl/)
    expect(node.className).toMatch(/font-semibold/)
  })

  it('renders decimals format when decimals=true', () => {
    renderInProvider(<MaskedAmount value={1234.56} decimals />)
    // formatCurrencyDecimals → "€ 1.234,56" in nl-NL.
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument()
  })
})
