import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TabVergelijk from './tab-vergelijk'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

const PAYLOAD = {
  ok: true,
  eindLeeftijd: 90,
  v2: {
    fireLeeftijd: 58.4,
    requiredFirePortfolio: 900000,
    firePortfolioAtFire: 900000,
    eindNettoVermogen: 1200000,
    eindNettoLiquide: 1100000,
  },
  kernel: {
    fireLeeftijd: 60.1,
    requiredFirePortfolio: 950000,
    firePortfolioAtFire: 950000,
    eindNettoVermogen: 1000000,
    eindNettoLiquide: 950000,
    solverStatus: 'reached_at' as const,
    tekortLeningPiek: 0,
  },
  reeks: [
    { age: 40, v2Vermogen: 100000, v2Liquide: 90000, kernelVermogen: 98000, kernelLiquide: 88000 },
    { age: 90, v2Vermogen: 1200000, v2Liquide: 1100000, kernelVermogen: 1000000, kernelLiquide: 950000 },
  ],
  kentalDeltas: [
    { key: 'fireLeeftijd', label: 'FIRE-leeftijd', kind: 'age' as const, v2: 58.4, kernel: 60.1, absDelta: 1.7, pctDelta: null },
    { key: 'requiredFirePortfolio', label: 'Benodigde FIRE-portefeuille', kind: 'eur' as const, v2: 900000, kernel: 950000, absDelta: 50000, pctDelta: 5.6 },
    { key: 'firePortfolioAtFire', label: 'Portefeuille bij FIRE', kind: 'eur' as const, v2: 900000, kernel: 950000, absDelta: 50000, pctDelta: 5.6 },
    { key: 'eindNettoVermogen', label: 'Eindvermogen netto (leeftijd 90)', kind: 'eur' as const, v2: 1200000, kernel: 1000000, absDelta: -200000, pctDelta: -16.7 },
    { key: 'eindNettoLiquide', label: 'Eindvermogen netto-liquide (leeftijd 90)', kind: 'eur' as const, v2: 1100000, kernel: 950000, absDelta: -150000, pctDelta: -13.6 },
  ],
  reeksDeltas: [
    { key: 'vermogen' as const, label: 'Netto vermogen', maxAbsDelta: 200000, meanAbsDelta: 101000, ageAtMax: 90 },
    { key: 'liquide' as const, label: 'Netto-liquide', maxAbsDelta: 150000, meanAbsDelta: 76000, ageAtMax: 90 },
  ],
  badge: { fireLeeftijdDeltaJaar: 1.7, eindVermogenAbs: -200000, eindVermogenPct: -16.7 },
  flags: { convergentie: true, whatif: false, household: false, scalar: false },
  meta: { v2EndAge: 90, kernelEndAge: 100, v2Strategy: 'perpetual', kernelStatus: 'reached_at' as const },
}

afterEach(() => vi.restoreAllMocks())

describe('TabVergelijk', () => {
  it('rendert de badge, kerngetallen en vlag-stand uit de payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(PAYLOAD)))
    render(<TabVergelijk />)

    // Badge (FIRE-leeftijd-verschil)
    await waitFor(() => expect(screen.getByText(/FIRE-leeftijd verschilt/i)).toBeInTheDocument())
    expect(screen.getByText(/1,7 jaar/)).toBeInTheDocument()

    // Kerngetallen-labels
    expect(screen.getByText('Benodigde FIRE-portefeuille')).toBeInTheDocument()
    expect(screen.getByText('Portefeuille bij FIRE')).toBeInTheDocument()

    // Vlag-stand: convergentie AAN → 'kernel', overige 'v2'
    expect(screen.getAllByText('v2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('kernel').length).toBeGreaterThan(0)
  })

  it('toont een foutmelding bij een niet-ok respons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, reason: 'Onvoldoende data.' })))
    render(<TabVergelijk />)
    await waitFor(() => expect(screen.getByText(/Onvoldoende data\./)).toBeInTheDocument())
  })
})
