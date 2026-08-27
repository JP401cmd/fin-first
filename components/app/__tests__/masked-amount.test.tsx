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
import { render, screen, fireEvent } from '@testing-library/react'
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

/**
 * Regressietests voor de masking-bypass-sweep (werkqueue-kaart "Privacy-modus
 * dekt álle bedragen"): componenten die eerder plain formatCurrency naast
 * gemaskeerde bedragen renderden. Grote data-gedreven surfaces (budgets-client,
 * cash-overview, household-fire-section, horizon fase-modals) zijn hier
 * onpraktisch — die staan op de handmatige checklist in de werkqueue-kaart.
 */
describe('masking-bypass regressies', () => {
  it('CompoundInsightCard toont géén euro-cijfers wanneer masked (incl. slider-label)', async () => {
    const { CompoundInsightCard } = await import(
      '@/components/overview/compound-insight-card'
    )
    const { container } = renderInProvider(
      <CompoundInsightCard liquidCash={10000} monthlyContribution={100} />,
      { masked: true },
    )
    const text = container.textContent ?? ''
    // Alle saldo-gevoelige bedragen (hoofdvraag, slider-label A6, balken,
    // verschil) → bullets.
    expect(text).toContain(MASKED_AMOUNT_PLACEHOLDER)
    // liquidCash mag nergens meer als cijfer opduiken.
    expect(text).not.toMatch(/10\.000/)
    // De enige zichtbare euro-cijfers zijn de statische slider-schaallabels
    // (€ 0 / € 500 / € 1.000 — vaste referentiewaarden, geen gebruikersdata).
    const euroDigits = (text.match(/€\s?[\d.,]+/g) ?? []).map((s) =>
      s.replace(/ /g, ' '),
    )
    expect(euroDigits).toEqual(['€ 0', '€ 500', '€ 1.000'])
  })

  it('EnvelopeTransferSheet-foutmelding maskeert het budgetlimiet (A7)', async () => {
    const { EnvelopeTransferSheet } = await import(
      '@/components/app/envelope-transfer-sheet'
    )
    const budgets = [
      {
        id: 'parent-1',
        name: 'Vaste lasten',
        budget_type: 'expense',
        default_limit: 700,
        children: [
          { id: 'child-a', name: 'Boodschappen', budget_type: 'expense', default_limit: 500 },
          { id: 'child-b', name: 'Vervoer', budget_type: 'expense', default_limit: 200 },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any
    renderInProvider(
      <EnvelopeTransferSheet
        budgets={budgets}
        budgetAmounts={[]}
        monthDate={new Date(2026, 5, 1)}
        onClose={() => {}}
        onSaved={() => {}}
      />,
      { masked: true },
    )
    const [fromSelect, toSelect] = screen.getAllByRole('combobox')
    fireEvent.change(fromSelect, { target: { value: 'child-a' } })
    fireEvent.change(toSelect, { target: { value: 'child-b' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: /Verplaatsen/ }))

    const errorNode = screen.getByText(/overschrijdt het limiet/)
    // Het limiet (500) is saldo-gevoelig → bullets; het zélf ingetypte bedrag
    // (600) mag zichtbaar blijven (eigen invoer, geen lek).
    expect(errorNode.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(errorNode.textContent).not.toMatch(/500/)
  })
})

// ── M5: prognose-weergave (approx) ────────────────────────────────────────
describe('<MaskedAmount approx> — prognose-kopgetal', () => {
  it('rondt af op significante cijfers en zet "ca." ervoor', () => {
    const { container } = renderInProvider(<MaskedAmount value={676_698} approx />)
    // Het kopgetal toont de benadering, niet de euro-exacte uitkomst.
    expect(container.textContent).toContain(formatCurrency(680_000))
    expect(container.textContent).not.toContain(formatCurrency(676_698))
    expect(container.textContent).toContain('ca.')
  })

  it('zet "ca." in een eigen, lichtere span — niet in de cijferstring', () => {
    // Waarom dit gepind is: het voorbehoud mag niet meegroeien met een
    // Playfair-black kopgetal van 28px; dan loopt de KPI-cel over en leest het
    // voorbehoud even luid als het antwoord.
    const { container } = renderInProvider(<MaskedAmount value={676_698} approx />)
    const prefix = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === 'ca.',
    )
    expect(prefix).toBeTruthy()
    expect(prefix!.className).toContain('text-[var(--ink-3)]')
  })

  it('toont gemaskeerd alleen bullets — géén "ca."', () => {
    const { container } = renderInProvider(<MaskedAmount value={676_698} approx />, { masked: true })
    expect(container.textContent).toBe(MASKED_AMOUNT_PLACEHOLDER)
  })

  it('wint van decimals — een benadering met centen is een tegenspraak', () => {
    const { container } = renderInProvider(<MaskedAmount value={676_698.49} approx decimals />)
    expect(container.textContent).toContain(formatCurrency(680_000))
    expect(container.textContent).not.toContain(',49')
  })

  it('laat de standaardweergave ongemoeid (geen approx = exact, geen prefix)', () => {
    const { container } = renderInProvider(<MaskedAmount value={676_698} />)
    expect(container.textContent).toBe(formatCurrency(676_698))
  })
})
