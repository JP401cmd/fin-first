import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import type { LifeEvent, FinancialInput } from '@/lib/horizon-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { StrategieEditorsData } from './strategie/strategie-editors'
import type { HorizonFireSimResult } from '@/lib/hooks/use-horizon-fire-sim'

/**
 * Review 27 sep, punt 2: binnen de /toekomst-provider (katern Plan) opent een klik op een
 * strategie-beheerde gebeurtenis de editor ter plekke (`LEVENSSTRATEGIE_OPEN_EVENT`) —
 * geen `router.push` naar dezelfde pagina (server-ronde, extra kernel-run, history-regel)
 * en dus ook geen factor-A-uitvraag, die alleen bij een echte deeplink hoort.
 */

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/toekomst',
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
const LOADING_SIM = {
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
} as HorizonFireSimResult
vi.mock('@/lib/hooks/use-horizon-fire-sim', () => ({ useHorizonFireSim: () => LOADING_SIM }))
// Binnen de provider: een overlay-context bestaat (de sim-context mag ontbreken).
vi.mock('@/components/toekomst/state/toekomst-state-provider', () => ({
  useToekomstOverlayContextOptioneel: () => ({ openEventPane: vi.fn() }),
  useToekomstSimContextOptioneel: () => null,
  useToekomstBron: () => ({ initialData: {}, gebeurtenissen: null }),
}))

import { GebeurtenissenView, type EventPaneData } from './gebeurtenissen-view'
import { LEVENSSTRATEGIE_OPEN_EVENT, type LevensstrategieOpenDetail } from '@/components/toekomst/plan/levensstrategieen-blok'

const strategieData = { baseline: null, dailyExpenses: 0 } as unknown as StrategieEditorsData
const eventPaneData: EventPaneData = {
  baselineInput: {} as FinancialInput,
  baselineFire: null,
  fireParams: {} as FireParams,
  fireStrategy: {} as FireStrategyConfig,
  withdrawalStrategy: {} as WithdrawalStrategyConfig,
  endAge: 90,
  householdMode: false,
  previewBaseline: null,
}
const aow = {
  id: 'aow1',
  name: 'AOW',
  event_type: 'aow',
  target_age: 67,
  target_date: null,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 1558,
  duration_months: null,
  icon: 'aow',
  is_active: true,
  sort_order: 0,
  is_indexed: false,
} as unknown as LifeEvent

afterEach(() => {
  cleanup()
  mockPush.mockClear()
})

describe.each([false, true])('GebeurtenissenView op Plan (compact=%s)', (compact) => {
  it('een strategie-beheerde gebeurtenis opent de editor ter plekke, zonder navigatie', () => {
    const gevraagd: string[] = []
    const luister = (e: Event) => gevraagd.push((e as CustomEvent<LevensstrategieOpenDetail>).detail.rij)
    window.addEventListener(LEVENSSTRATEGIE_OPEN_EVENT, luister)
    render(
      <DisplayModeProvider initialMode="full">
        <GebeurtenissenView events={[aow]} strategieData={strategieData} eventPaneData={eventPaneData} compact={compact} />
      </DisplayModeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Beheerd via AOW-strategie' }))
    window.removeEventListener(LEVENSSTRATEGIE_OPEN_EVENT, luister)
    expect(gevraagd).toEqual(['aow'])
    expect(mockPush).not.toHaveBeenCalled()
  })
})
