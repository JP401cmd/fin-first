import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { Box2Detail } from './box2-detail'
import type { Box2Result } from '@/lib/box2-data'

const realFetch = global.fetch

function mockResult(overrides: Partial<Box2Result> = {}): Box2Result {
  return {
    year: 2026,
    hasPartner: false,
    params: { tariefLaag: 0.245, tariefHoog: 0.31, grens: 68843, grensPartner: 137686 } as Box2Result['params'],
    perDeelneming: [{ name: 'Holding BV', dividend: 20000, disposalGain: 0, totalIncome: 20000, shareOfTotal: 1, dividendOnbekend: false }],
    totalDividend: 20000,
    totalDisposalGain: 0,
    totalIncome: 20000,
    dividendOnbekend: false,
    dividendOnbekendCount: 0,
    incomeLow: 20000,
    incomeHigh: 0,
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
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => expect(screen.getByText(/aanmerkelijk belang 2026 · privé/i)).toBeTruthy())
    // Sinds H26 start de simulator op het WERKELIJKE inkomen, dus het bedrag
    // staat bewust twee keer op de pagina: in de kop én in de simulator eronder.
    // Dat is de fix, niet een fout — vroeger stond er onder een kop van €0 een
    // hypothetische €16.867.
    expect(screen.getAllByText(/4\.900/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/49 vrijheidsdagen/).length).toBeGreaterThanOrEqual(1)
  })

  it('H26 — kop en simulator tonen bij eerste render hetzelfde bedrag', async () => {
    // De bevinding was dat de kop €0 zei en de simulator eronder €16.867. De
    // simulator draait nu op result.totalIncome, dus die twee kunnen per
    // constructie niet meer uiteenlopen zonder interactie.
    mockFetch({ personal: mockResult() })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => screen.getByText(/aanmerkelijk belang 2026 · privé/i))
    const slider = screen.getByLabelText('Dividend dit jaar') as HTMLInputElement
    expect(slider.value).toBe('20000')
    // Niet de oude default (de schijfgrens) en geen bedrag dat daarbij hoort.
    expect(slider.value).not.toBe('68843')
    expect(screen.queryByText(/16\.867/)).toBeNull()
  })

  it('H26 — NULL ≠ 0: onbekend dividend toont "Nog niet ingevuld", geen €0', async () => {
    mockFetch({
      personal: mockResult({
        perDeelneming: [{ name: 'Holding BV', dividend: 0, disposalGain: 0, totalIncome: 0, shareOfTotal: 0, dividendOnbekend: true }],
        totalDividend: 0,
        totalIncome: 0,
        dividendOnbekend: true,
        dividendOnbekendCount: 1,
        incomeLow: 0,
        taxLow: 0,
        totalTax: 0,
        effectiveRate: 0,
        totalTaxInclDga: 0,
        freedomDays: 0,
      }),
    })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => expect(screen.getByText('Nog niet ingevuld')).toBeTruthy())
    expect(screen.getByText(/We weten je jaarlijks dividend nog niet/i)).toBeTruthy()
    // Wél een weg vooruit, geen doodlopende nul.
    expect(screen.getByText(/Vul het dividend aan bij je deelneming/i)).toBeTruthy()
    // En zeker geen hypothetische heffing eronder.
    expect(screen.queryByText(/16\.867/)).toBeNull()
  })

  it('H26 — bij een deels gevulde set blijft het bedrag staan, als expliciete ondergrens', async () => {
    mockFetch({
      personal: mockResult({
        perDeelneming: [
          { name: 'Gevuld BV', dividend: 20000, disposalGain: 0, totalIncome: 20000, shareOfTotal: 1, dividendOnbekend: false },
          { name: 'Leeg BV', dividend: 0, disposalGain: 0, totalIncome: 0, shareOfTotal: 0, dividendOnbekend: true },
        ],
        dividendOnbekend: true,
        dividendOnbekendCount: 1,
      }),
    })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => screen.getByText(/aanmerkelijk belang 2026 · privé/i))
    expect(screen.queryByText('Nog niet ingevuld')).toBeNull()
    expect(screen.getByText(/Dit bedrag is een ondergrens/i)).toBeTruthy()
    expect(screen.getAllByText(/4\.900/).length).toBeGreaterThanOrEqual(1)
  })

  it('pakt eigen partner-resultaat in household-modus (geen personal-key)', async () => {
    mockFetch({
      hasHousehold: true,
      partners: [
        { isCurrentUser: true, result: mockResult({ totalTaxInclDga: 1234 }) },
        { isCurrentUser: false, result: mockResult({ totalTaxInclDga: 9999 }) },
      ],
    })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => expect(screen.getByText(/1\.234/)).toBeTruthy())
    // Partner-bedrag mag NIET getoond worden (privé-only)
    expect(screen.queryByText(/9\.999/)).toBeNull()
  })

  it('toont DGA-waarschuwing bij excessief lenen', async () => {
    mockFetch({ personal: mockResult({ dgaLeningenExcess: 50000, dgaExcessTax: 12250 }) })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => expect(screen.getByText(/meer dan/i)).toBeTruthy())
    expect(screen.getByText(/excessief|bovenmatige/i)).toBeTruthy()
  })

  it('berekeningsstappen klappen uit', async () => {
    mockFetch({ personal: mockResult() })
    render(<DisplayModeProvider initialMode="full"><Box2Detail year={2026} /></DisplayModeProvider>)
    await waitFor(() => screen.getByText('Berekeningsstappen'))
    // S17: "vervreemdingswinst" in de intro draagt nu een <GlossaryTerm>, en de
    // popover daarvan is ALTIJD gemount (hij verschijnt via opacity, niet via
    // conditional render). De kop daarvan is de weergavenaam "Vervreemdingswinst".
    // Dit criterium gaat over de berekeningsREGEL, dus filteren we de tooltip weg.
    const rekenRegels = () =>
      screen.queryAllByText('Vervreemdingswinst').filter((el) => !el.closest('[role="tooltip"]'))
    expect(rekenRegels()).toHaveLength(0)
    fireEvent.click(screen.getByText('Berekeningsstappen'))
    expect(rekenRegels()).toHaveLength(1)
  })

  it('rendert niets zonder resultaat', async () => {
    mockFetch({})
    const { container } = render(<Box2Detail year={2026} />)
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull())
    expect(screen.queryByText(/aanmerkelijk belang/i)).toBeNull()
  })
})
