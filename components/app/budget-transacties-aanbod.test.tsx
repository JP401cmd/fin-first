import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import {
  BudgetTransactiesAanbod,
  BUDGET_KOPPEL_COACHMARK_ID,
} from './budget-transacties-aanbod'

/**
 * Het eenmalige aanbod op /overzicht/budget (ADR 0158).
 *
 * De poort is het hele punt: dit is een popup die ongevraagd verschijnt, dus
 * elke toestand waarin hij NIET hoort te komen is even belangrijk als de
 * toestand waarin hij wél komt — geen transacties om te koppelen, de telling
 * nog onderweg, al eens gezien, of een andere laag die de aandacht heeft.
 */

let quiet = false
vi.mock('@/lib/hooks/use-attention-quiet', () => ({
  useAttentionQuiet: () => quiet,
}))

const fetchMock = vi.fn()

/** Antwoord van GET /api/coachmark. */
function alGezien(gezien: boolean) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
    return Promise.resolve({
      ok: true,
      json: async () => ({
        dismissed: { [BUDGET_KOPPEL_COACHMARK_ID]: gezien },
        outcome: { [BUDGET_KOPPEL_COACHMARK_ID]: null },
      }),
    })
  })
}

beforeEach(() => {
  quiet = false
  fetchMock.mockReset()
  alGezien(false)
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const onKoppelen = vi.fn()

describe('BudgetTransactiesAanbod', () => {
  beforeEach(() => onKoppelen.mockReset())

  it('verschijnt met het aantal als er transacties zonder budget staan', async () => {
    render(<BudgetTransactiesAanbod ongekoppeld={187} onKoppelen={onKoppelen} />)
    expect(await screen.findByText(/187/)).toBeTruthy()
  })

  it('blijft weg als er niets te koppelen valt', async () => {
    render(<BudgetTransactiesAanbod ongekoppeld={0} onKoppelen={onKoppelen} />)
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull()
  })

  it('wacht tot de telling binnen is', async () => {
    render(<BudgetTransactiesAanbod ongekoppeld={null} onKoppelen={onKoppelen} />)
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull()
  })

  it('blijft weg als hij al eens is getoond', async () => {
    alGezien(true)
    render(<BudgetTransactiesAanbod ongekoppeld={12} onKoppelen={onKoppelen} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull()
  })

  it('zwijgt zolang een andere laag de aandacht heeft', async () => {
    quiet = true
    render(<BudgetTransactiesAanbod ongekoppeld={12} onKoppelen={onKoppelen} />)
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull()
  })

  it('"Nu koppelen" opent de bestaande koppelflow en schrijft de keuze weg', async () => {
    render(<BudgetTransactiesAanbod ongekoppeld={187} onKoppelen={onKoppelen} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Nu koppelen' }))

    expect(onKoppelen).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) =>
            init?.method === 'PUT' &&
            String(init.body).includes(BUDGET_KOPPEL_COACHMARK_ID) &&
            String(init.body).includes('voltooid'),
        ),
      ).toBe(true),
    )
  })

  // ── De telling verandert ónder de popup ─────────────────────────────────
  //
  // `ongekoppeld` komt binnen als `null`, wordt een getal, en wordt opnieuw
  // geteld na elke serverronde. Zonder deze gevallen kon het aanbod openen met
  // "Er staan 0 transacties zonder budget" — vlak nadat de gebruiker ze net
  // allemaal had gekoppeld.

  it('opent niet alsnog als het aantal naar nul zakt terwijl het stil werd', async () => {
    quiet = true
    const { rerender } = render(
      <BudgetTransactiesAanbod ongekoppeld={12} onKoppelen={onKoppelen} />,
    )
    // Andere laag klaar, maar intussen is alles gekoppeld.
    quiet = false
    rerender(<BudgetTransactiesAanbod ongekoppeld={0} onKoppelen={onKoppelen} />)

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull()
  })

  it('sluit zichzelf als het aantal naar nul zakt terwijl hij openstaat', async () => {
    const { rerender } = render(
      <BudgetTransactiesAanbod ongekoppeld={12} onKoppelen={onKoppelen} />,
    )
    await screen.findByRole('button', { name: 'Nu koppelen' })

    rerender(<BudgetTransactiesAanbod ongekoppeld={0} onKoppelen={onKoppelen} />)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Nu koppelen' })).toBeNull(),
    )
  })

  it('bevriest het getoonde aantal bij het openen', async () => {
    const { rerender } = render(
      <BudgetTransactiesAanbod ongekoppeld={187} onKoppelen={onKoppelen} />,
    )
    expect(await screen.findByText(/187/)).toBeTruthy()

    // Een hertelling mag de tekst niet onder de gebruiker laten verspringen.
    rerender(<BudgetTransactiesAanbod ongekoppeld={42} onKoppelen={onKoppelen} />)
    expect(screen.getByText(/187/)).toBeTruthy()
    expect(screen.queryByText(/42/)).toBeNull()
  })

  it('"Later" sluit zonder de koppelflow te openen', async () => {
    render(<BudgetTransactiesAanbod ongekoppeld={187} onKoppelen={onKoppelen} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(onKoppelen).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => init?.method === 'PUT' && String(init.body).includes('overgeslagen'),
        ),
      ).toBe(true),
    )
  })
})
