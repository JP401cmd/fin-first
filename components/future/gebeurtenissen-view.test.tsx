import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { GebeurtenissenView, type EventPaneData, type KernelSimData } from './gebeurtenissen-view'
import { computeEventImpact } from '@/lib/event-impact'
import type { LifeEvent, FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { StrategieEditorsData } from './strategie/strategie-editors'
import type { HorizonFireSimResult } from '@/lib/hooks/use-horizon-fire-sim'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { SimResult } from '@/lib/fire-simulation'

// GebeurtenissenView mount de EventPane (dynamisch, ssr:false → rendert niets in
// jsdom) + de strategie-launcher die next/navigation + supabase client gebruiken.
// Mock beide zodat de view zelf in isolatie test-baar blijft. (Kaarten zijn
// altijd interactieve buttons — geen Kijken/Plannen-modus meer.)
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
// Feature #876 — de kernel-run (useHorizonFireSim) wordt gemockt: params null
// (geen kernelSim/baseline, of pre-hydration) → loading-shape; anders het per
// test gezette `mockSimResult`. Zo testen we de weergave-afleiding zonder een
// echte kernel-run in jsdom.
const LOADING_SIM: HorizonFireSimResult = {
  result: null,
  cashflows: [],
  isLoading: true,
  error: null,
  unifiedRows: null,
  effectiveLifeEvents: [],
  kernelStatus: null,
  kernelMaandHint: null,
  kernelHousingSale: null,
  kernelPensionPots: null,
}
let mockSimResult: HorizonFireSimResult = LOADING_SIM
vi.mock('@/lib/hooks/use-horizon-fire-sim', () => ({
  useHorizonFireSim: (params: unknown) => (params ? mockSimResult : LOADING_SIM),
}))
// StrategieEditors gestubd: registreert alleen welke strategie open is, zodat
// klik-routering van kernel-rijen (huis/pensioen) asserteerbaar is.
vi.mock('./strategie/strategie-editors', () => ({
  StrategieEditors: ({ open }: { open: string | null }) => (
    <div data-testid="strategie-editors-open">{open ?? 'none'}</div>
  ),
}))

beforeEach(() => {
  mockSimResult = LOADING_SIM
})

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
  pensioenFactorA: 0,
  currentAge: null,
  inflationRate: 0,
  currentNetMonthly: 0,
  housingPreview: null,
}

// EventPane wordt dynamisch (ssr:false) geladen en rendert daardoor niets in de
// jsdom-test; de baseline-velden worden dus nooit echt uitgelezen. Minimale
// type-correcte stubs volstaan.
const mockEventPaneData: EventPaneData = {
  baselineInput: {} as FinancialInput,
  baselineFire: null,
  fireParams: {} as FireParams,
  fireStrategy: {} as FireStrategyConfig,
  withdrawalStrategy: {} as WithdrawalStrategyConfig,
  endAge: 90,
  householdMode: false,
  // EventPane is dynamisch (ssr:false) en rendert niets in deze test; null →
  // legacy fallback-pad, geen v2-engine-aanroep nodig in de mock.
  previewBaseline: null,
}

function renderView(props: {
  events: LifeEvent[]
  currentAge?: number | null
  annualSavings?: number
  strategieData?: StrategieEditorsData
  kernelSim?: KernelSimData | null
  eventPaneData?: EventPaneData
}) {
  const { strategieData, kernelSim, eventPaneData, ...rest } = props
  return render(
    <DisplayModeProvider initialMode="full">
      <GebeurtenissenView
        {...rest}
        strategieData={strategieData ?? mockStrategieData}
        eventPaneData={eventPaneData ?? mockEventPaneData}
        kernelSim={kernelSim ?? null}
      />
    </DisplayModeProvider>,
  )
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
    // 12000 / 12000 = 1.0 jaar kost → "→ 1.0 jaar later vrij"
    expect(
      screen.getByText(
        computeEventImpact({ ...flatEvent({ one_time_cost: 12000 }) }, 12000).displayLabel,
      ),
    ).toBeTruthy()
    expect(screen.getByText(/1\.0 jaar later vrij/)).toBeTruthy()
  })

  it('tekst de badge als richting, niet als saldo (bug C2)', () => {
    // Een event dat geld oplevert mag geen "−" vóór "vrijheid" krijgen:
    // het schuift de vrijheidsdatum naar voren.
    renderView({ events: [flatEvent({ one_time_cost: -50000 })], annualSavings: 12000 })
    expect(screen.getByText(/4\.2 jaar eerder vrij/)).toBeTruthy()
    expect(screen.queryByText(/jaar vrijheid|mnd vrijheid/i)).toBeNull()
  })

  it('verbergt impact-badge wanneer annualSavings ontbreekt', () => {
    renderView({ events: [flatEvent({ one_time_cost: 12000 })] })
    expect(screen.queryByText(/later vrij|eerder vrij/i)).toBeNull()
  })

  it('toont gain-tone (positief) bij erfenis (negatieve one_time_cost)', () => {
    const { container } = renderView({
      events: [flatEvent({ one_time_cost: -50000 })],
      annualSavings: 12000,
    })
    expect(container.querySelector('.bg-positive\\/10')).toBeTruthy()
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
  it('rendert vier levensstrategieën altijd', () => {
    renderView({ events: [] })
    expect(screen.getByText('AOW-strategie')).toBeTruthy()
    expect(screen.getByText('Pensioen-strategie')).toBeTruthy()
    expect(screen.getByText('Huis-strategie')).toBeTruthy()
    expect(screen.getByText('Werk-strategie')).toBeTruthy()
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

// ── Feature #876 — kernel-afgeleide strategiemomenten ────────────────────────

/** strategieData mét rawContext-baseline zodat de kernel-run (hook) actief is. */
const kernelStrategieData: StrategieEditorsData = {
  ...mockStrategieData,
  dailyExpenses: 100,
  baseline: {
    rawContext: {
      profile: {} as never,
      assets: [],
      debts: [],
      aowRows: [],
      yearlyExpenses: 36_500,
    },
  },
}

const mockKernelSim: KernelSimData = {
  aowAgeFractional: 67,
  box3Method: 'forfaitair' as KernelSimData['box3Method'],
  bankAccountCash: 0,
  monthlySavingsOverride: null,
  baseAnnualSavingsFromCashflow: null,
  housingStrategy: undefined,
  deficitLoanRate: 0.05,
}

/** Minimale jaar-rij; alleen de door de afleidingen gelezen velden tellen. */
function makeRow(age: number, over: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: age - 55,
    age,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
    nettoLiquide: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
    ...over,
  }
}

/**
 * Geladen sim-resultaat met per test aangeleverde velden. `result` draagt een
 * minimaal-geldige `displayEndAge: 90` (de kernel-eindleeftijd die de detector
 * consumeert voor de tekort-lening-cutoff, besluit 4 juli 2026) — spiegelt
 * productie waar een geladen run altijd een displayEndAge heeft. Individuele
 * tests kunnen `result` overriden.
 */
function loadedSim(over: Partial<HorizonFireSimResult>): HorizonFireSimResult {
  return {
    ...LOADING_SIM,
    isLoading: false,
    result: { displayEndAge: 90 } as SimResult,
    unifiedRows: [],
    kernelPensionPots: [],
    ...over,
  }
}

/** Kernel-afgeleid verkoop-event zoals `applyKernelHousingSaleToEvents` het bouwt. */
function kernelSaleEvent(age: number, proceeds: number): LifeEvent {
  return mockEvent({
    id: 'housing-strategy:downsize',
    name: 'Verkoop eigen woning',
    event_type: 'verkoop_eigen_woning',
    target_date: null,
    target_age: age,
    one_time_cost: 0,
    monthly_cost_change: 0,
    icon: 'Home',
    metadata: {
      source: 'housing-strategy',
      strategy: 'downsize',
      saleProceeds: proceeds,
      mortgageBalanceAtTrigger: 80_000,
      kernelDerived: true,
    },
  })
}

// Stale server-virtueel verkoop-event (v2-meetrun) — mag op de kernel-tak
// NIET meer zichtbaar zijn (anti-drift).
const staleServerSale = mockEvent({
  id: 'housing-strategy:downsize',
  name: 'Verkoop eigen woning',
  event_type: 'verkoop_eigen_woning',
  target_date: null,
  target_age: 89,
  metadata: { source: 'housing-strategy', strategy: 'downsize' },
})

function renderKernelView(events: LifeEvent[]) {
  return renderView({ events, strategieData: kernelStrategieData, kernelSim: mockKernelSim })
}

describe('GebeurtenissenView — kernel-afgeleide strategiemomenten (feature #876)', () => {
  it('anti-drift: tab toont de verkoopleeftijd uit dezelfde kernel-run, niet het stale server-event', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [kernelSaleEvent(71.25, 250_000)],
      kernelHousingSale: { month: 195, age: 71.25, proceeds: 250_000 },
    })
    renderKernelView([staleServerSale])
    // Kernel-waarheid (71, gevloerd) zichtbaar; stale v2-leeftijd (89) weg.
    expect(screen.getByText('Leeftijd 71')).toBeTruthy()
    expect(screen.queryByText(/Leeftijd 89/)).toBeNull()
    expect(screen.getByText('Berekend door je plan')).toBeTruthy()
  })

  it('kernel-verkooprij is niet bewerkbaar (aria "Berekend:", geen edit-affordance) en toont netto-opbrengst + aflos-subtekst', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [kernelSaleEvent(71.25, 250_000)],
      kernelHousingSale: { month: 195, age: 71.25, proceeds: 250_000 },
    })
    renderKernelView([staleServerSale])
    const row = screen.getByRole('button', { name: 'Berekend: Verkoop eigen woning' })
    expect(row).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Bewerk Verkoop eigen woning/ })).toBeNull()
    expect(screen.getByText(/Netto-opbrengst/)).toBeTruthy()
    expect(screen.getByText(/Restschuld hypotheek/)).toBeTruthy()
    // Klik → bestaand huis-strategie-open-mechanisme.
    fireEvent.click(row)
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('huis')
  })

  it('opeet-rijen (start + uitputting) renderen uit de rijen en openen de Huis-strategie', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [
        makeRow(70, { opeetOpname: 12_000, opeetCap: 40_000 }),
        makeRow(71, { opeetOpname: 0, opeetCap: 41_000 }),
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    expect(screen.getByText('Opname opeethypotheek start')).toBeTruthy()
    expect(screen.getByText('Leenruimte opeethypotheek uitgeput')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Berekend: Opname opeethypotheek start' }),
    )
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('huis')
  })

  it('pensioenpot-einde rendert bij eindige duur en opent de Pensioen-strategie', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [makeRow(55), makeRow(90)],
      kernelPensionPots: [
        { naam: 'Lijfrente', ingangsLeeftijd: 70, eindLeeftijd: 80, maandbedrag: 400, levenslang: false },
        { naam: 'Bedrijfspensioen', ingangsLeeftijd: 67, eindLeeftijd: 100, maandbedrag: 900, levenslang: true },
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    expect(screen.getByText('Lijfrente stopt')).toBeTruthy()
    // Levenslange pot → geen einde-rij.
    expect(screen.queryByText('Bedrijfspensioen stopt')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Berekend: Lijfrente stopt' }))
    expect(screen.getByTestId('strategie-editors-open').textContent).toBe('pensioen')
  })

  it('tekort-lening-rij opent de read-only uitleg-sheet met rente + voorkeuren-link', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [
        makeRow(82, {
          debtBalances: {
            'tekort-lening': { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance: 25_000 },
          },
        }),
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    fireEvent.click(screen.getByRole('button', { name: 'Berekend: Tekort-lening ontstaat' }))
    expect(screen.getByText('Gehanteerde rente')).toBeTruthy()
    expect(screen.getByText(/5%\/jr/)).toBeTruthy()
    expect(screen.getByText('Ontstaat op leeftijd')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Rente tekort-lening aanpassen/ })
    expect(link.getAttribute('href')).toBe('/toekomst/voorkeuren?regel=eindstrategie')
  })

  // ── Besluit 4 juli 2026: tekort-lening telt alleen mee t/m endAge − 1 ──────
  // BRON (doorgevoerd): de detector krijgt de KERNEL-eindleeftijd
  // `sim.result.displayEndAge` uit dezelfde run als de rijen — identiek aan
  // horizon-client.tsx, zodat beide Toekomst-oppervlakken op exact dezelfde
  // eindleeftijd clippen (perpetual/pensioen → 100, deplete/legacy → fire_end_age).
  // NIET de rauwe `eventPaneData.endAge` (= profiles.fire_end_age): die is
  // strategie-onafhankelijk en zou bij doorlopende strategieën divergeren.
  // loadedSim() zet `result.displayEndAge = 90` (zie boven) → venster-cutoff = 89.
  it('tekort-lening-rij verschijnt NIET wanneer de lening pas op de eindleeftijd zelf ontstaat (modelmarge, endAge-cutoff)', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [
        makeRow(90, {
          debtBalances: {
            'tekort-lening': { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance: 30_000 },
          },
        }),
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    expect(screen.queryByText('Tekort-lening ontstaat')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Berekend: Tekort-lening ontstaat' })).toBeNull()
  })

  it('tekort-lening-rij verschijnt NIET wanneer de lening pas ná de eindleeftijd ontstaat (staart, endAge-cutoff)', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [
        makeRow(90, { debtBalances: {} }),
        makeRow(95, {
          debtBalances: {
            'tekort-lening': { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance: 80_000 },
          },
        }),
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    expect(screen.queryByText('Tekort-lening ontstaat')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Berekend: Tekort-lening ontstaat' })).toBeNull()
  })

  it('tekort-lening-rij blijft WEL verschijnen wanneer de lening al vóór endAge − 1 aangesproken is (boundary)', () => {
    mockSimResult = loadedSim({
      effectiveLifeEvents: [mockEvent({ target_date: null, target_age: 60 })],
      unifiedRows: [
        makeRow(89, {
          // = eventPaneData.endAge (90) − 1: laatste rij die nog mee mag tellen.
          debtBalances: {
            'tekort-lening': { startBalance: 0, interestPaid: 0, principalPaid: 0, endBalance: 15_000 },
          },
        }),
      ],
    })
    renderKernelView([mockEvent({ target_date: null, target_age: 60 })])
    expect(screen.getByText('Tekort-lening ontstaat')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Berekend: Tekort-lening ontstaat' })).toBeTruthy()
  })

  it('regressie: geladen run zónder kernel-momenten → DB-event-rijen en edit-flow ongewijzigd', () => {
    const userEvent = mockEvent({ target_date: null, target_age: 60, name: 'Wereldreis' })
    mockSimResult = loadedSim({
      effectiveLifeEvents: [userEvent],
      unifiedRows: [makeRow(55), makeRow(90)],
    })
    renderKernelView([userEvent])
    expect(screen.queryByText('Berekend door je plan')).toBeNull()
    expect(screen.getByRole('button', { name: 'Bewerk Wereldreis' })).toBeTruthy()
  })

  it('verkoop-wanneer-nodig zonder trigger: kernel stript het virtuele event → geen verkooprij', () => {
    const userEvent = mockEvent({ target_date: null, target_age: 60, name: 'Wereldreis' })
    // Hook-uitkomst: kernelHousingSale null → applyKernelHousingSaleToEvents
    // heeft het server-virtuele verkoop-event gestript.
    mockSimResult = loadedSim({
      effectiveLifeEvents: [userEvent],
      kernelHousingSale: null,
    })
    renderKernelView([userEvent, staleServerSale])
    expect(screen.queryByText('Verkoop eigen woning')).toBeNull()
  })

  it('zonder kernelSim (geen rauwe context) → geen kernel-rijen en geen skeleton', () => {
    const { container } = renderView({
      events: [mockEvent({ target_date: null, target_age: 60 })],
    })
    expect(screen.queryByText('Berekend door je plan')).toBeNull()
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })
})
