import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HypotheekVsBeleggenWidget } from './hypotheek-vs-beleggen-widget'
import type { DashboardData, HvbSummary } from './widget-renderer'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import { compareMortgageVsInvest } from '@/lib/hypotheek-vs-beleggen'

// Stuurbaar perspectief — default personal (zelfde als buiten de provider).
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
})

// jsdom kent geen ResizeObserver; de WidgetShell-scrollcheck gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(hvb: HvbSummary | null): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, hvbSummary: hvb }
}

/**
 * Runtime-assertie (non-negotiable): bouw de summary EXACT zoals de dashboard-loader
 * (engine-outputs consumeren) en pin dat de widget die waarden toont zonder ze te
 * herberekenen — de header-aanbeveling en het getoonde scenario mogen elkaar niet
 * tegenspreken.
 */
describe('HypotheekVsBeleggenWidget — consume-don\'t-recompute', () => {
  // Realistische params: 7% rendement → beleggen wint (aanbeveling 'beleggen', verschil > 0).
  const result = compareMortgageVsInvest({
    extraBedrag: 200,
    hypotheekBalance: 300_000,
    rente: 3.5,
    repaymentType: 'annuity',
    restLooptijd: 300,
    isTaxDeductible: true,
    marginaalTarief: 0.3697,
    verwachtRendement: 0.07,
    inflatie: 0.02,
    hasPartner: false,
    horizonJaren: 10,
  })

  const summary: HvbSummary = {
    restschuld: 300_000,
    rente: 3.5,
    breakevenRendement: result.breakevenRendement,
    aanbeveling: result.aanbeveling,
    isTaxDeductible: true,
    beleggenVoordeel: result.beleggen.nettoVoordeel,
    aflossenVoordeel: result.aflossing.nettoVoordeel,
    verschil: result.verschil,
    extraBedragMaand: 200,
    horizonJaren: 10,
    fireImpactMaanden: null,
  }

  it('toont de premisse zodat het scenario interpreteerbaar is', () => {
    render(<HypotheekVsBeleggenWidget size="full" data={makeData(summary)} />)
    expect(screen.getByText('o.b.v. €200/mnd extra · 10 jaar')).toBeInTheDocument()
  })

  it('het scenario-label spreekt de engine-aanbeveling niet tegen (teken verschil)', () => {
    render(<HypotheekVsBeleggenWidget size="full" data={makeData(summary)} />)

    // Engine-invariant: aanbeveling 'beleggen' ⇒ verschil > 0 ⇒ "Beleggen voordeliger".
    expect(result.aanbeveling).toBe('beleggen')
    expect(result.verschil).toBeGreaterThan(0)
    expect(screen.getByText('Beleggen voordeliger')).toBeInTheDocument()
    expect(screen.queryByText('Aflossen voordeliger')).not.toBeInTheDocument()

    // Het teken van het getoonde verschil moet de aanbeveling volgen (geen fabricatie).
    const impliesBeleggen = summary.verschil >= 0
    expect(impliesBeleggen).toBe(summary.aanbeveling === 'beleggen')
  })

  it('null-state bij ontbrekende hypotheek', () => {
    render(<HypotheekVsBeleggenWidget size="full" data={makeData(null)} />)
    expect(screen.getByText(/Voeg een hypotheek toe/)).toBeInTheDocument()
  })
})

describe('HypotheekVsBeleggenWidget — vrijheidstijd-framing', () => {
  const base: HvbSummary = {
    restschuld: 250_000,
    rente: 3.2,
    breakevenRendement: 0.031,
    aanbeveling: 'beleggen',
    isTaxDeductible: true,
    beleggenVoordeel: 9000,
    aflossenVoordeel: 5000,
    verschil: 4000,
    extraBedragMaand: 200,
    horizonJaren: 10,
    fireImpactMaanden: 15,
  }

  it('framet fireImpactMaanden als vrijheidstijd (jaar + maanden)', () => {
    render(<HypotheekVsBeleggenWidget size="full" data={makeData(base)} />)
    // 15 maanden → "1 jaar en 3 maanden", beleggen → "eerder vrij".
    expect(screen.getByText(/Beleggen brengt je ± 1 jaar en 3 maanden eerder vrij\./)).toBeInTheDocument()
  })

  it('geen vrijheidstijd-zin als de impact niet bekend is (null)', () => {
    render(<HypotheekVsBeleggenWidget size="full" data={makeData({ ...base, fireImpactMaanden: null })} />)
    expect(screen.queryByText(/eerder vrij/)).not.toBeInTheDocument()
  })
})
