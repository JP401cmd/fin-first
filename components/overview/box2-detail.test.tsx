import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Box2Detail } from './box2-detail'
import type { Box2Result } from '@/lib/box2-data'

const realFetch = global.fetch

function mockResult(overrides: Partial<Box2Result> = {}): Box2Result {
  return {
    year: 2026,
    hasPartner: false,
    params: { tariefLaag: 0.245, tariefHoog: 0.33, grens: 67804, grensPartner: 135608 } as Box2Result['params'],
    perDeelneming: [{ name: 'Holding BV', dividend: 20000, disposalGain: 0, totalIncome: 20000, shareOfTotal: 1 }],
    totalDividend: 20000,
    totalDisposalGain: 0,
    totalIncome: 20000,
    taxLow: 4900,
    taxHigh: 0,
    totalTax: 4900,
    effectiveRate: 0.245,
    dgaLeningenTotal: 0,
    dgaLeningenDrempel: 500000,
    dgaLeningenExcess: 0,
    dgaExcessTax: 0,
    totalTaxInclDga: 4900,
    freedomDays: 49,
    dailyExpenses: 100,
    ...overrides,
  } as Box2Result
}

function mockFetch(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) }) as unknown as typeof fetch
}

afterEach(() => {
  global.fetch = realFetch
  vi.restoreAllMocks()
})

describe('Box2Detail', () => {
  it('toont privé Box 2-belasting (single-modus)', async () => {
    mockFetch({ personal: mockResult() })
    render(<Box2Detail year={2026} />)
    await waitFor(() => expect(screen.getByText(/aanmerkelijk belang 2026 · privé/i)).toBeTruthy())
    expect(screen.getByText(/4\.900/)).toBeTruthy()
    expect(screen.getByText(/49 vrijheidsdagen/)).toBeTruthy()
  })

  it('pakt eigen partner-resultaat in household-modus (geen personal-key)', async () => {
    mockFetch({
      hasHousehold: true,
      partners: [
        { isCurrentUser: true, result: mockResult({ totalTaxInclDga: 1234 }) },
        { isCurrentUser: false, result: mockResult({ totalTaxInclDga: 9999 }) },
      ],
    })
    render(<Box2Detail year={2026} />)
    await waitFor(() => expect(screen.getByText(/1\.234/)).toBeTruthy())
    // Partner-bedrag mag NIET getoond worden (privé-only)
    expect(screen.queryByText(/9\.999/)).toBeNull()
  })

  it('toont DGA-waarschuwing bij excessief lenen', async () => {
    mockFetch({ personal: mockResult({ dgaLeningenExcess: 50000, dgaExcessTax: 12250 }) })
    render(<Box2Detail year={2026} />)
    await waitFor(() => expect(screen.getByText(/meer dan/i)).toBeTruthy())
    expect(screen.getByText(/excessief|bovenmatige/i)).toBeTruthy()
  })

  it('berekeningsstappen klappen uit', async () => {
    mockFetch({ personal: mockResult() })
    render(<Box2Detail year={2026} />)
    await waitFor(() => screen.getByText('Berekeningsstappen'))
    expect(screen.queryByText('Vervreemdingswinst')).toBeNull()
    fireEvent.click(screen.getByText('Berekeningsstappen'))
    expect(screen.getByText('Vervreemdingswinst')).toBeTruthy()
  })

  it('rendert niets zonder resultaat', async () => {
    mockFetch({})
    const { container } = render(<Box2Detail year={2026} />)
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull())
    expect(screen.queryByText(/aanmerkelijk belang/i)).toBeNull()
  })
})
