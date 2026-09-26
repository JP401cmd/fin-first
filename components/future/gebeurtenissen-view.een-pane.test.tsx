/**
 * GebeurtenissenView — één EventPane op /toekomst (ADR 0179, fase 6; spec §4.2 regel 8).
 * Binnen de provider opent de lijst de pane van de overlay-host via `openEventPane`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { GebeurtenissenView, type EventPaneData, type KernelSimData } from './gebeurtenissen-view'
import type { LifeEvent, FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { StrategieEditorsData } from './strategie/strategie-editors'
import type { HorizonFireSimResult } from '@/lib/hooks/use-horizon-fire-sim'

// GebeurtenissenView mount de EventPane (dynamisch, ssr:false → rendert niets in
// jsdom) + de strategie-launcher die next/navigation + supabase client gebruiken.
// Mock beide zodat de view zelf in isolatie test-baar blijft. (Kaarten zijn
// altijd interactieve buttons — geen Kijken/Plannen-modus meer.)
// Gedeelde push-mock: strategie-klikken navigeren naar /toekomst/instellingen?rij=…
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/toekomst/instellingen',
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}))
// Eén EventPane (spec §4.2 regel 8): de overlay-context van de /toekomst-provider is
// gemockt; `metProvider` schakelt tussen binnen en buiten de provider. De dynamische
// EventPane is een verklikker, zodat zichtbaar is of de view er zelf één mount.
const openEventPane = vi.fn()
let metProvider = true
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstOverlayContextOptioneel: () => (metProvider ? { openEventPane } : null),
}))
vi.mock('next/dynamic', () => ({
  default: () => (props: { open?: boolean }) => (
    <div data-testid="eigen-event-pane" data-open={String(!!props.open)} />
  ),
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
/** De params waarmee de eigen kernel-hook van de view is aangeroepen (besluit Q8). */
const hookAanroepen: unknown[] = []
vi.mock('@/lib/hooks/use-horizon-fire-sim', () => ({
  useHorizonFireSim: (params: unknown) => {
    hookAanroepen.push(params)
    return params ? mockSimResult : LOADING_SIM
  },
}))
beforeEach(() => {
  openEventPane.mockClear()
  metProvider = true
  mockSimResult = LOADING_SIM
  hookAanroepen.length = 0
  mockPush.mockClear()
})

/**
 * Tests voor GebeurtenissenView — Gebeurtenissen-tab op /toekomst.
 * Eén tijdlijn met levensgebeurtenissen + berekende momenten. De vier
 * levensstrategieën wonen sinds 17 sep 2026 op Voorkeuren (zie
 * voorkeuren-view.test.tsx); hier alleen de klik-routering daarheen.
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
  mode?: 'simple' | 'full'
}) {
  const { strategieData, kernelSim, eventPaneData, mode, ...rest } = props
  return render(
    <DisplayModeProvider initialMode={mode ?? 'full'}>
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

describe('GebeurtenissenView — één EventPane op /toekomst (spec §4.2 regel 8)', () => {
  it('binnen de provider mount de lijst geen eigen EventPane', () => {
    renderView({ events: [mockEvent()] })
    expect(screen.queryByTestId('eigen-event-pane')).toBeNull()
  })

  it('"Levensgebeurtenis toevoegen" opent de catalogus van de overlay-host (zelfde opener als ?event=new)', () => {
    renderView({ events: [mockEvent()] })
    fireEvent.click(screen.getByText('Levensgebeurtenis toevoegen'))
    expect(openEventPane).toHaveBeenCalledWith('new')
  })

  it('de lege staat opent eveneens de catalogus van de overlay-host', () => {
    renderView({ events: [] })
    fireEvent.click(screen.getByText('Eerste gebeurtenis toevoegen'))
    expect(openEventPane).toHaveBeenCalledWith('new')
  })

  it('een vrije gebeurtenis opent in de overlay-host in view-modus (zelfde opener als ?event=<id>)', () => {
    renderView({ events: [mockEvent({ id: 'e42', name: 'Sabbatical' })] })
    fireEvent.click(screen.getByText('Sabbatical'))
    expect(openEventPane).toHaveBeenCalledWith('e42', 'view')
  })

  it('buiten de provider houdt de view zijn eigen EventPane (los gebruik)', () => {
    metProvider = false
    renderView({ events: [mockEvent()] })
    expect(screen.getByTestId('eigen-event-pane').getAttribute('data-open')).toBe('false')
    fireEvent.click(screen.getByText('Levensgebeurtenis toevoegen'))
    expect(screen.getByTestId('eigen-event-pane').getAttribute('data-open')).toBe('true')
    expect(openEventPane).not.toHaveBeenCalled()
  })
})
