import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Box3Detail } from './box3-detail'
import type { Box3Result } from '@/lib/box3-data'

/**
 * Tests voor Box3Detail — compacte Box 3-sectie die /api/household/box3
 * fetcht en een uitklapbare berekening toont.
 */

const realFetch = global.fetch

function mockResult(overrides: Partial<Box3Result> = {}): Box3Result {
  return {
    year: 2026,
    hasPartner: false,
    params: { tarief: 0.36 } as Box3Result['params'],
    assetClassifications: [],
    debtClassifications: [],
    totaalSpaargeld: 30000,
    totaalBeleggingen: 70000,
    totaalUitgesloten: 0,
    totaalBox3Schulden: 0,
    totaalUitgeslotenSchulden: 0,
    schuldendrempel: 3800,
    aftrekbareSchulden: 0,
    forfaitairSpaargeld: 360,
    forfaitairBeleggingen: 4200,
    forfaitairSchulden: 0,
    voordeelUitSparen: 4560,
    rendementsgrondslag: 100000,
    heffingsvrijVermogen: 57000,
    grondslagSparen: 43000,
    effectiefRendement: 0.0456,
    box3Income: 1960,
    tax: 705,
    freedomDays: 7,
    dailyExpenses: 100,
    ...overrides,
  } as Box3Result
}

function mockFetch(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(payload),
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  global.fetch = realFetch
})

describe('Box3Detail', () => {
  it('toont de Box 3-belasting na laden', async () => {
    mockFetch({ personal: mockResult() })
    render(<Box3Detail year={2026} />)
    await waitFor(() => {
      expect(screen.getByText(/Box 3 — vermogensbelasting 2026/i)).toBeTruthy()
    })
    // €705 belasting ergens zichtbaar (kan op meerdere plekken voorkomen sinds
    // de tegenbewijs-simulator óók de forfaitaire heffing toont).
    expect(screen.getAllByText(/705/).length).toBeGreaterThan(0)
    expect(screen.getByText(/7 vrijheidsdagen/)).toBeTruthy()
  })

  it('berekeningsstappen zijn standaard ingeklapt en klappen uit', async () => {
    mockFetch({ personal: mockResult() })
    render(<Box3Detail year={2026} />)
    await waitFor(() => screen.getByText('Berekeningsstappen'))
    // Ingeklapt: "Rendementsgrondslag" nog niet zichtbaar
    expect(screen.queryByText('Rendementsgrondslag')).toBeNull()
    fireEvent.click(screen.getByText('Berekeningsstappen'))
    expect(screen.getByText('Rendementsgrondslag')).toBeTruthy()
    // "Voordeel uit sparen en beleggen" staat zowel in de berekeningsstappen
    // als in de altijd-zichtbare forfaitaire-opbouw-sectie (3.1).
    expect(screen.getAllByText(/Voordeel uit sparen en beleggen/).length).toBeGreaterThan(0)
  })

  it('pakt eigen partner-resultaat in household-modus (geen personal-key)', async () => {
    mockFetch({
      hasHousehold: true,
      dailyExpenses: 100,
      partners: [
        { isCurrentUser: true, result: mockResult({ tax: 321 }) },
        { isCurrentUser: false, result: mockResult({ tax: 8888 }) },
      ],
    })
    render(<Box3Detail year={2026} />)
    await waitFor(() => expect(screen.getAllByText(/321/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/8\.888/)).toBeNull()
  })

  it('toont partner-optimalisatie bij besparing > 0', async () => {
    mockFetch({
      hasHousehold: true,
      dailyExpenses: 100,
      partners: [{ isCurrentUser: true, result: mockResult() }],
      optimalAllocation: { totalTax: 500, savingsVsEqual: 250 },
    })
    render(<Box3Detail year={2026} />)
    await waitFor(() => expect(screen.getByText(/Partner-optimalisatie/i)).toBeTruthy())
    expect(screen.getByText(/250/)).toBeTruthy()
  })

  it('toont classificatie-sectie uitklapbaar', async () => {
    mockFetch({
      personal: mockResult({
        assetClassifications: [
          { asset: { name: 'Spaarrekening', current_value: 30000 }, category: 'spaargeld', exclusionReason: null, note: null },
          { asset: { name: 'Eigen huis', current_value: 400000 }, category: null, exclusionReason: 'Box 1', note: null },
        ] as never,
      }),
    })
    render(<Box3Detail year={2026} />)
    await waitFor(() => screen.getByText('Hoe is je vermogen ingedeeld?'))
    expect(screen.queryByText('Spaarrekening')).toBeNull()
    fireEvent.click(screen.getByText('Hoe is je vermogen ingedeeld?'))
    expect(screen.getByText('Spaarrekening')).toBeTruthy()
    expect(screen.getByText('Eigen huis')).toBeTruthy()
  })

  it('rendert niets wanneer de API geen personal-resultaat geeft', async () => {
    mockFetch({ personal: null })
    const { container } = render(<Box3Detail year={2026} />)
    await waitFor(() => {
      // loading-skeleton verdwenen, geen content
      expect(container.querySelector('.animate-pulse')).toBeNull()
    })
    expect(screen.queryByText(/vermogensbelasting/i)).toBeNull()
  })
})
