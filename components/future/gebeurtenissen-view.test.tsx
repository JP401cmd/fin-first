import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GebeurtenissenView } from './gebeurtenissen-view'
import type { LifeEvent } from '@/lib/horizon-data'
import type { StrategieEditorsData } from './strategie/strategie-editors'

// GebeurtenissenView mount ScenarioBibliotheek (plan F-3) + de strategie-launcher
// die next/navigation + supabase client gebruiken. Mock beide zodat de view zelf
// in isolatie test-baar blijft. (Zonder ViewModeProvider is isPlannen = false,
// dus de kaarten renderen als niet-interactieve divs.)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/toekomst/gebeurtenissen',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}))

/**
 * Tests voor GebeurtenissenView — Gebeurtenissen-tab op /toekomst.
 * Twee secties: levensgebeurtenissen + drie levensstrategieën.
 */

const mockStrategieData: StrategieEditorsData = {
  baseline: null,
  dailyExpenses: 0,
  aowRows: [],
  dateOfBirth: null,
  grossYearlyIncome: 0,
}

function renderView(props: {
  events: LifeEvent[]
  currentAge?: number | null
  annualSavings?: number
}) {
  return render(<GebeurtenissenView {...props} strategieData={mockStrategieData} />)
}

function mockEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'e1',
    name: 'Tweede kind',
    event_type: 'child',
    target_age: null,
    target_date: '2027-06-15',
    one_time_cost: 5000,
    monthly_cost_change: 350,
    monthly_income_change: 0,
    duration_months: 240,
    icon: 'child',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    ...overrides,
  }
}

describe('GebeurtenissenView — gebeurtenissen-sectie', () => {
  it('rendert empty-state CTA bij geen events', () => {
    renderView({ events: [] })
    expect(screen.getByText('Geen gebeurtenissen')).toBeTruthy()
    expect(screen.getByText('Eerste gebeurtenis toevoegen')).toBeTruthy()
  })

  it('rendert event-cards met naam', () => {
    renderView({ events: [mockEvent()] })
    expect(screen.getByText('Tweede kind')).toBeTruthy()
  })

  it('rendert verticale tijdlijn als <ol> met Nu-startnode', () => {
    const { container } = renderView({ events: [mockEvent()] })
    // Timeline = <ol> met list-items; eerste item is de "Nu"-startnode.
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    expect(screen.getByText(/^Nu/)).toBeTruthy()
    // 1 startnode + 1 event = 2 <li>
    expect(ol!.querySelectorAll(':scope > li').length).toBe(2)
  })

  it('toont leeftijd in Nu-startnode wanneer currentAge bekend', () => {
    renderView({ events: [mockEvent()], currentAge: 42 })
    expect(screen.getByText(/Nu · 42 jaar/)).toBeTruthy()
  })

  it('toont aantal gebeurtenissen in header', () => {
    renderView({ events: [mockEvent({ id: 'a' }), mockEvent({ id: 'b' })] })
    expect(screen.getByText('2 gebeurtenissen')).toBeTruthy()
  })

  it('toont singular "1 gebeurtenis" bij precies één event', () => {
    renderView({ events: [mockEvent()] })
    expect(screen.getByText('1 gebeurtenis')).toBeTruthy()
  })

  it('rendert eenmalige kosten in event-impact', () => {
    renderView({ events: [mockEvent({ one_time_cost: 5000, monthly_cost_change: 0 })] })
    expect(screen.getAllByText(/Eenmalig/).length).toBeGreaterThan(0)
  })

  it('toont leeftijd-marker bij target_age zonder target_date', () => {
    renderView({ events: [mockEvent({ target_date: null, target_age: 67, name: 'AOW' })] })
    expect(screen.getByText(/Leeftijd 67/)).toBeTruthy()
  })

  it('sorteert events chronologisch op target_date', () => {
    const events: LifeEvent[] = [
      mockEvent({ id: 'late', name: 'Late event', target_date: '2030-01-01' }),
      mockEvent({ id: 'early', name: 'Vroeg event', target_date: '2026-01-01' }),
    ]
    renderView({ events })
    const headings = screen.getAllByRole('heading', { level: 3 })
    // Eerste event-heading moet "Vroeg event" zijn (na de section-headings)
    const eventHeadings = headings.filter(
      (h) => h.textContent === 'Vroeg event' || h.textContent === 'Late event',
    )
    expect(eventHeadings[0]?.textContent).toBe('Vroeg event')
    expect(eventHeadings[1]?.textContent).toBe('Late event')
  })
})

describe('GebeurtenissenView — event-impact-badge (plan F-5)', () => {
  // Helper voor minimal event zonder maandelijkse delta's (alleen
  // one_time_cost telt voor de impact-berekening).
  function flatEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
    return mockEvent({
      monthly_cost_change: 0,
      monthly_income_change: 0,
      duration_months: 0,
      ...overrides,
    })
  }

  it('toont impact-badge per event wanneer annualSavings > 0', () => {
    renderView({ events: [flatEvent({ one_time_cost: 12000 })], annualSavings: 12000 })
    // 12000 / 12000 = 1.0 jaar → "+1.0 jaar vrijheid"
    expect(screen.getByText(/\+1\.0 jaar/)).toBeTruthy()
  })

  it('verbergt impact-badge wanneer annualSavings ontbreekt', () => {
    renderView({ events: [flatEvent({ one_time_cost: 12000 })] })
    expect(screen.queryByText(/jaar vrijheid|mnd vrijheid/i)).toBeNull()
  })

  it('toont gain-tone (emerald) bij erfenis (negatieve one_time_cost)', () => {
    const { container } = renderView({
      events: [flatEvent({ one_time_cost: -50000 })],
      annualSavings: 12000,
    })
    expect(container.querySelector('.bg-emerald-50')).toBeTruthy()
  })

  it('toont cost-tone (amber) bij positieve cost', () => {
    const { container } = renderView({
      events: [flatEvent({ one_time_cost: 5000 })],
      annualSavings: 12000,
    })
    expect(container.querySelector('.bg-amber-50')).toBeTruthy()
  })
})

describe('GebeurtenissenView — strategieën-sectie', () => {
  it('rendert drie levensstrategieën altijd', () => {
    renderView({ events: [] })
    expect(screen.getByText('AOW-strategie')).toBeTruthy()
    expect(screen.getByText('Pensioen-strategie')).toBeTruthy()
    expect(screen.getByText('Huis-strategie')).toBeTruthy()
  })

  it('strategie-kaarten zijn geen dode focus-deeplinks meer', () => {
    // Voorheen <Link href="/toekomst/strategie?focus=...">; nu in-page modals.
    const { container } = renderView({ events: [] })
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs.some((h) => h?.includes('focus='))).toBe(false)
  })

  it('markeert een strategie-beheerd event (pension) met een badge', () => {
    renderView({
      events: [mockEvent({ event_type: 'pension', name: 'Bedrijfspensioen', target_age: 67 })],
    })
    expect(screen.getByText('Beheerd via Pensioen-strategie')).toBeTruthy()
  })
})
