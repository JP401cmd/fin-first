import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashflowKalender, type CashflowDetection } from './cashflow-kalender'
import type { RecurringTransaction } from '@/lib/recurring-data'

/**
 * Tests voor CashflowKalender — visualiseert recurring transactions
 * over de komende 5 weken. Date-handling getest via deterministische
 * fixtures (geen mock-date — buckets gebruiken `new Date()` intern,
 * dus tests verifiëren render-vorm + structuur, niet exacte dagen).
 *
 * M21 — de kalender toont sinds deze bevinding ook NIET-BEVESTIGDE detecties,
 * visueel onderscheiden van bevestigde posten. De datum-arithmetiek zelf is
 * gedekt in lib/recurring-data.test.ts (met injecteerbare `now`); hier gaat het
 * om de weergave: verschijnt het, is het te onderscheiden, en klopt de tekst.
 */

function makeRecurring(
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    account_id: 'a1',
    budget_id: null,
    name: 'Netflix',
    amount: -15,
    description: null,
    counterparty_name: null,
    frequency: 'monthly',
    day_of_month: 15,
    day_of_week: null,
    start_date: '2024-01-01',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2024-01-01',
    category_override: null,
    ...overrides,
  }
}

/**
 * Detectie met een rooster dat gegarandeerd in het 5-weken-venster valt:
 * maandelijks, dus welke dag-van-de-maand je ook kiest, hij komt binnen 31
 * dagen langs.
 */
function makeDetection(
  overrides: Partial<CashflowDetection> = {},
): CashflowDetection {
  return {
    id: 'd1',
    name: 'Spotify',
    amount: 11.99,
    schedule: {
      frequency: 'monthly',
      dayOfMonth: 12,
      dayOfWeek: null,
      startDate: '2026-01-12',
    },
    ...overrides,
  }
}

describe('CashflowKalender — render', () => {
  it('rendert empty-state bij geen recurrings en geen detecties', () => {
    render(<CashflowKalender recurrings={[]} />)
    expect(screen.getByText(/Nog niets gepland voor de komende vijf weken/i)).toBeTruthy()
  })

  it('gebruikt geen Engels jargon of routepad in de lege staat (M21)', () => {
    const { container } = render(<CashflowKalender recurrings={[]} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/recurring transactions/i)
    expect(text).not.toContain('/overzicht/cashflow')
  })

  it('rendert weekday-header (Ma t/m Zo)', () => {
    render(<CashflowKalender recurrings={[makeRecurring()]} />)
    expect(screen.getByText('Ma')).toBeTruthy()
    expect(screen.getByText('Vr')).toBeTruthy()
    expect(screen.getByText('Zo')).toBeTruthy()
  })

  it('rendert 35-cellen-grid (5 weken × 7 dagen)', () => {
    const { container } = render(<CashflowKalender recurrings={[makeRecurring()]} />)
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells.length).toBe(35)
  })

  it('rendert "Komende 5 weken" header', () => {
    render(<CashflowKalender recurrings={[makeRecurring()]} />)
    expect(screen.getByText('Komende 5 weken')).toBeTruthy()
  })

  it('toont "Verwacht uit" + "Verwacht in" labels bij data', () => {
    render(
      <CashflowKalender
        recurrings={[
          makeRecurring({ amount: -50, day_of_month: 1 }),
          makeRecurring({ id: 'r2', amount: 2500, day_of_month: 25, name: 'Salaris' }),
        ]}
      />,
    )
    expect(screen.getByText('Verwacht uit')).toBeTruthy()
    expect(screen.getByText('Verwacht in')).toBeTruthy()
  })

  it('rendert grid met aria-label "Cashflow-kalender komende 5 weken"', () => {
    const { container } = render(
      <CashflowKalender recurrings={[makeRecurring()]} />,
    )
    const grid = container.querySelector('[role="grid"]')
    expect(grid?.getAttribute('aria-label')).toBe('Cashflow-kalender komende 5 weken')
  })

  it('skipt is_active=false recurrings', () => {
    // Inactive recurring genereert geen marker — empty-state pad
    render(
      <CashflowKalender
        recurrings={[makeRecurring({ is_active: false })]}
      />,
    )
    expect(screen.getByText(/Nog niets gepland voor de komende vijf weken/i)).toBeTruthy()
  })
})

// ── M21: de kalender ontkent de vaste lasten erboven niet meer ────────────

describe('CashflowKalender — niet-bevestigde detecties (M21)', () => {
  it('vult de kalender óók zonder één bevestigde recurring', () => {
    const { container } = render(
      <CashflowKalender recurrings={[]} detections={[makeDetection()]} />,
    )
    // Kern van de bevinding: GEEN lege staat meer terwijl er posten gevonden zijn.
    expect(screen.queryByText(/Nog niets gepland/i)).toBeNull()
    expect(container.querySelectorAll('[role="gridcell"]').length).toBe(35)
    expect(screen.getByText('Nog te bevestigen')).toBeTruthy()
  })

  it('houdt bevestigd en nog-te-bevestigen in gescheiden totalen', () => {
    render(
      <CashflowKalender
        recurrings={[makeRecurring({ amount: -50, day_of_month: 3 })]}
        detections={[makeDetection()]}
      />,
    )
    expect(screen.getByText('Verwacht uit')).toBeTruthy()
    expect(screen.getByText('Nog te bevestigen')).toBeTruthy()
  })

  it('markeert een detectie visueel anders dan een bevestigde post', () => {
    const { container } = render(
      <CashflowKalender recurrings={[]} detections={[makeDetection()]} />,
    )
    const marker = container.querySelector('[title*="nog te bevestigen"]')
    expect(marker).toBeTruthy()
    // Gestippelde rand + `~`-voorvoegsel — niet alleen een kleurverschil.
    expect(marker?.className).toContain('border-dashed')
    expect(marker?.textContent?.startsWith('~')).toBe(true)
    // En géén rood/groen: dit is geen vastgelegd bedrag.
    expect(marker?.className).not.toContain('text-negative')
  })

  it('toont een legenda zodra beide soorten door elkaar staan', () => {
    render(<CashflowKalender recurrings={[]} detections={[makeDetection()]} />)
    expect(screen.getByText('Bevestigd')).toBeTruthy()
    expect(
      screen.getByText(/Gevonden, nog te bevestigen — datum geschat/i),
    ).toBeTruthy()
  })

  it('toont géén legenda zonder detecties', () => {
    render(<CashflowKalender recurrings={[makeRecurring()]} />)
    expect(screen.queryByText('Bevestigd')).toBeNull()
  })

  it('legt in de lege staat uit dat een gevonden post nog geen afschrijfdag heeft', () => {
    // Rooster onbekend (weekly zonder weekdag) → niet plaatsbaar, maar de
    // analyse erboven telt hem wél. De lege staat mag dan niet "we vonden
    // niets" beweren.
    render(
      <CashflowKalender
        recurrings={[]}
        detections={[
          makeDetection({
            schedule: {
              frequency: 'weekly',
              dayOfMonth: null,
              dayOfWeek: null,
              startDate: '2026-01-12',
            },
          }),
        ]}
      />,
    )
    expect(
      screen.getByText(/één terugkerende post gevonden, maar konden er nog geen vaste afschrijfdag/i),
    ).toBeTruthy()
  })

  it('telt meerdere niet-plaatsbare posten in het meervoud', () => {
    const unplaceable = {
      frequency: 'weekly' as const,
      dayOfMonth: null,
      dayOfWeek: null,
      startDate: '2026-01-12',
    }
    render(
      <CashflowKalender
        recurrings={[]}
        detections={[
          makeDetection({ id: 'a', schedule: unplaceable }),
          makeDetection({ id: 'b', schedule: unplaceable }),
        ]}
      />,
    )
    expect(screen.getByText(/2 terugkerende posten gevonden/i)).toBeTruthy()
  })

  it('negeert een detectie zonder rooster in plaats van een dag te verzinnen', () => {
    render(
      <CashflowKalender
        recurrings={[]}
        detections={[makeDetection({ schedule: null })]}
      />,
    )
    expect(screen.queryByText('Nog te bevestigen')).toBeNull()
  })
})
