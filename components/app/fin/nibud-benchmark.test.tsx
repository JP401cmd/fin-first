/**
 * Regressietest bij WF-BUDGET-02-bug3.
 *
 * Repro (16 aug 2026): met "Bedragen verbergen" aan toonde de NIBUD-sectie —
 * als enige blok op /overzicht/cashflow/budget — gewoon de echte bedragen,
 * zowel in de preview-regel (MiniBar) als in de detail-modal (DetailRow:
 * delta, "Budget: €X/mnd", "NIBUD: €Y/mnd"). Oorzaak: kale `€{...}`-
 * template-literals i.p.v. het gedeelde masking-bewuste `MaskedAmount`.
 *
 * De test legt de repro vast op de gerenderde tekst (géén €-teken bij masking
 * aan) i.p.v. op implementatiedetails, zodat een toekomstige herschrijving van
 * het component de bug niet opnieuw kan introduceren.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { NibudBenchmarkSection } from './nibud-benchmark'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

const RESPONSE = {
  household_type: 'gezin_jong',
  household_label: 'Gezin met jonge kinderen',
  year: 2026,
  source: 'NIBUD',
  total_freedom_days_potential: 20,
  benchmarks: [
    {
      nibud_category_key: 'wonen',
      nibud_category_name: 'Huur/Hypotheek',
      basis_amount: 1150,
      voorbeeld_amount: null,
      mapped_budget_slug: 'wonen',
      mapped_budget_id: null,
      user_spending: 1280,
      delta: 130,
      freedom_days_potential: 8,
    },
    {
      // delta <= 0 → landt in de "op of onder NIBUD"-tak van de modal.
      nibud_category_key: 'boodschappen',
      nibud_category_name: 'Boodschappen',
      basis_amount: 640,
      voorbeeld_amount: null,
      mapped_budget_slug: 'boodschappen',
      mapped_budget_id: null,
      user_spending: 590,
      delta: -50,
      freedom_days_potential: 0,
    },
  ],
}

function renderSection() {
  return render(
    <PrivacyProvider>
      <NibudBenchmarkSection />
    </PrivacyProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => RESPONSE }) as unknown as Response),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('NibudBenchmarkSection — privacy-masking (WF-BUDGET-02-bug3)', () => {
  it('maskeert alle bedragen in preview én detail-modal zodra masking aanstaat', async () => {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    renderSection()

    // Preview-regel (MiniBar) — was: "+€130".
    await screen.findByText('Budget Gezondheidscheck')
    await waitFor(() => {
      expect(document.body.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    })
    expect(document.body.textContent).not.toContain('€')
    expect(document.body.textContent).not.toContain('130')

    // Detail-modal (DetailRow) — was: "+€130/mnd", "Budget: €1280/mnd",
    // "NIBUD: €1150/mnd".
    fireEvent.click(screen.getByRole('button', { name: /Budget Gezondheidscheck/i }))
    await screen.findByText(/Optimalisatiekansen/i)
    fireEvent.click(screen.getByRole('button', { name: /op of onder NIBUD-niveau/i }))
    await screen.findByText('Boodschappen')

    expect(document.body.textContent).not.toContain('€')
    for (const leaked of ['130', '1280', '1150', '590', '640']) {
      expect(document.body.textContent).not.toContain(leaked)
    }
  })

  it('toont de bedragen ongewijzigd wanneer masking uitstaat', async () => {
    renderSection()

    await screen.findByText('Budget Gezondheidscheck')
    fireEvent.click(screen.getByRole('button', { name: /Budget Gezondheidscheck/i }))
    await screen.findByText(/Optimalisatiekansen/i)

    // nl-NL currency-format gebruikt een NO-BREAK SPACE na het euroteken.
    const text = (document.body.textContent ?? '').replace(/ /g, ' ')
    expect(text).toContain('+€ 130')
    expect(text).toContain('Budget: € 1.280/mnd')
    expect(text).toContain('NIBUD: € 1.150/mnd')
    expect(text).not.toContain(MASKED_AMOUNT_PLACEHOLDER)
  })
})
