import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VermogenSelectieWidget } from './vermogen-selectie-widget'
import type { DashboardData } from './widget-renderer'
import type { WealthSelectionWidgetData } from '@/lib/types/dashboard'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import {
  formatCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'

// De bewerk-sheet doet een lazy fetch en gebruikt de router; die hoort in zijn
// eigen test. Hier stubben we 'm tot een open/dicht-marker, zodat de render-
// tests over de widget zelf gaan.
vi.mock('./vermogen-selectie-sheet', () => ({
  VermogenSelectieSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="selectie-sheet" /> : null,
}))

// Stuurbaar perspectief — default personal (zelfde als buiten de provider).
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

// Privacy default zichtbaar (bedragen niet gemaskeerd) — spiegelt netto-vermogen-widget.test.
const mockPrivacy = { masked: false }
vi.mock('@/lib/hooks/use-privacy', () => ({
  useMaskedAmounts: () => mockPrivacy,
}))

// Animatie geforceerd "in view" zodat de sparkline zijn paden/labels tekent.
vi.mock('@/lib/hooks/use-in-view-animation', () => ({
  useInViewAnimation: () => ({ ref: { current: null }, hasEntered: true, animationComplete: true }),
}))

// jsdom mist ResizeObserver (WidgetShell full-size scrollcheck),
// IntersectionObserver + matchMedia (useInViewAnimation).
beforeAll(() => {
  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = MockObserver as unknown as typeof ResizeObserver
  global.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }
})

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
  mockPrivacy.masked = false
})

// ── Contract-fixture ─────────────────────────────────────────────────────────
// Spiegelt exact wat de loader levert: server-side gewogen totalen, historie
// oud→nieuw, schuld-waarden positief. De widget mag hier NIETS aan herrekenen.
const ASSETS_TOTAL = 82_400
const DEBTS_TOTAL = 12_400

const SELECTION: WealthSelectionWidgetData = {
  total: ASSETS_TOTAL - DEBTS_TOTAL,
  assetsTotal: ASSETS_TOTAL,
  debtsTotal: DEBTS_TOTAL,
  count: { assets: 4, debts: 1 },
  history: [
    { month: '2025-09', value: 58_000 },
    { month: '2025-10', value: 61_500 },
    { month: '2025-11', value: 64_000 },
    { month: '2025-12', value: 70_000 },
  ],
  topItems: [
    { name: 'Beleggingsrekening', value: 48_000, kind: 'asset' },
    { name: 'Spaarrekening', value: 22_400, kind: 'asset' },
    { name: 'Betaalrekening', value: 12_000, kind: 'asset' },
    { name: 'Studieschuld', value: 12_400, kind: 'debt' },
  ],
}

function makeData(selection: WealthSelectionWidgetData | null): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, wealthSelectionWidget: selection }
}

const DAILY_EXPENSE = MOCK_DASHBOARD_DATA.dailyExpenseRate as number

/**
 * Intl (nl-NL) zet een NBSP tussen het euroteken en het bedrag; testing-library
 * normaliseert alleen de DOM-tekst, niet de matcher-string. Deze helper maakt
 * de verwachting dus vergelijkbaar — zonder het verwachte bedrag met de hand
 * over te typen (dat zou de koppeling met formatCurrency verbreken).
 */
const money = (value: number) => formatCurrency(value).replace(/ /g, ' ')

/** De canonieke vrijheidstijd-regel voor dit totaal — niet handmatig getypt. */
const EXPECTED_FREEDOM = formatFreedomTimeString(
  calculateFreedomTime(SELECTION.total, DAILY_EXPENSE),
  'short',
)

// ── 1. Rendering per formaat ────────────────────────────────────────────────

describe('VermogenSelectieWidget — formaten', () => {
  it('mini toont kicker + gewogen totaal', () => {
    render(<VermogenSelectieWidget size="mini" data={makeData(SELECTION)} href="/overzicht/bezittingen" />)
    expect(screen.getByText('Eigen selectie')).toBeInTheDocument()
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    // Mini heeft géén interactie behalve de tegel-link zelf.
    expect(screen.queryByLabelText('Selectie bewerken')).not.toBeInTheDocument()
  })

  it('quarter toont het totaal en de bewerk-knop', () => {
    render(<VermogenSelectieWidget size="quarter" data={makeData(SELECTION)} href="/overzicht/bezittingen" />)
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    expect(screen.getByLabelText('Selectie bewerken')).toBeInTheDocument()
  })

  it('half toont totaal, vrijheidstijd en de telling bezittingen/schulden', () => {
    render(<VermogenSelectieWidget size="half" data={makeData(SELECTION)} href="/overzicht/bezittingen" />)
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    expect(screen.getByText(`4 bezittingen · 1 schuld`)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(EXPECTED_FREEDOM!))).toBeInTheDocument()
    expect(screen.getByLabelText('Selectie bewerken')).toBeInTheDocument()
  })

  it('full toont de split, de topItems (max 4) en de vrijheidstijd', () => {
    render(<VermogenSelectieWidget size="full" data={makeData(SELECTION)} href="/overzicht/bezittingen" />)
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    expect(screen.getByText('Bezittingen')).toBeInTheDocument()
    expect(screen.getByText('Schulden')).toBeInTheDocument()
    expect(screen.getByText('Beleggingsrekening')).toBeInTheDocument()
    expect(screen.getByText('Studieschuld')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(EXPECTED_FREEDOM!))).toBeInTheDocument()
  })
})

// ── 2. Runtime-assertie: getoonde getallen = contractwaarden ────────────────

describe('VermogenSelectieWidget — consume-don\'t-recompute', () => {
  it('het kopgetal is het gewogen totaal uit de bundel (assets − debts)', () => {
    // Invariant van de loader: total == assetsTotal − debtsTotal.
    expect(SELECTION.total).toBe(SELECTION.assetsTotal - SELECTION.debtsTotal)
    render(<VermogenSelectieWidget size="full" data={makeData(SELECTION)} />)
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    // De split toont exact de bundel-totalen — niet een eigen hersommatie
    // over de (afgekapte) topItems-lijst.
    expect(screen.getByText(money(SELECTION.assetsTotal))).toBeInTheDocument()
    expect(screen.getByText(money(SELECTION.debtsTotal))).toBeInTheDocument()
  })

  it('de vrijheidstijd volgt calculateFreedomTime op het bundel-dagtarief', () => {
    render(<VermogenSelectieWidget size="half" data={makeData(SELECTION)} />)
    expect(screen.getByText(`≈ ${EXPECTED_FREEDOM} vrijheid`)).toBeInTheDocument()
  })

  it('zonder dagtarief in de bundel verschijnt géén verzonnen vrijheidsregel', () => {
    const data = { ...makeData(SELECTION), dailyExpenseRate: undefined }
    render(<VermogenSelectieWidget size="half" data={data as DashboardData} />)
    expect(screen.queryByText(/vrijheid/)).not.toBeInTheDocument()
  })
})

// ── 3. Empty states ─────────────────────────────────────────────────────────

describe('VermogenSelectieWidget — empty states', () => {
  it('(a) geen selectie → uitleg + knop "Kies bezittingen"', () => {
    render(<VermogenSelectieWidget size="half" data={makeData(null)} href="/overzicht/bezittingen" />)
    expect(screen.getByRole('button', { name: 'Kies bezittingen' })).toBeInTheDocument()
    expect(screen.getByText(/Kies zelf welke bezittingen/)).toBeInTheDocument()
    // De sheet is nog dicht tot de gebruiker klikt.
    expect(screen.queryByTestId('selectie-sheet')).not.toBeInTheDocument()
  })

  it('(a) geen selectie op full → WidgetEmpty met dezelfde CTA', () => {
    render(<VermogenSelectieWidget size="full" data={makeData(null)} href="/overzicht/bezittingen" />)
    expect(screen.getByRole('button', { name: 'Kies bezittingen' })).toBeInTheDocument()
    expect(screen.getByText(/Kies zelf welke bezittingen/)).toBeInTheDocument()
  })

  it('(a) geen selectie op mini → korte tekst, geen doodlopende lege tegel', () => {
    render(<VermogenSelectieWidget size="mini" data={makeData(null)} href="/overzicht/bezittingen" />)
    expect(screen.getByText('Nog niets gekozen')).toBeInTheDocument()
  })

  it('(b) selectie zonder historie → totaal + "nog geen verloop"-regel', () => {
    const withoutHistory: WealthSelectionWidgetData = { ...SELECTION, history: [] }
    render(<VermogenSelectieWidget size="half" data={makeData(withoutHistory)} href="/overzicht/bezittingen" />)
    expect(screen.getByText(money(SELECTION.total))).toBeInTheDocument()
    expect(
      screen.getByText('Nog geen verloop — historie groeit vanaf je volgende maandsnapshot'),
    ).toBeInTheDocument()
  })
})

// ── 4. Perspectief-label (ADR 0120 punt 4) ──────────────────────────────────

describe('VermogenSelectieWidget — perspectief', () => {
  it('labelt "Persoonlijk" zodra een ander perspectief actief is', () => {
    mockPerspective.perspective = 'household'
    render(<VermogenSelectieWidget size="half" data={makeData(SELECTION)} />)
    expect(screen.getByText('Persoonlijk')).toBeInTheDocument()
  })

  it('geen label in het persoonlijke perspectief', () => {
    render(<VermogenSelectieWidget size="half" data={makeData(SELECTION)} />)
    expect(screen.queryByText('Persoonlijk')).not.toBeInTheDocument()
  })
})
