import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  PortfolioValueChart,
  type PortfolioValueHistoryPoint,
  type PortfolioValueHistoryResponse,
} from './portfolio-value-chart'
import {
  calculateFreedomTime,
  dailyExpenseRate,
  formatFreedomTimeString,
} from '@/lib/format'

/**
 * De historische waardegrafiek van de effectenportefeuille.
 *
 * Wat deze suite bewaakt is niet "er staat een lijn", maar de eerlijkheid van
 * wat eromheen staat: zolang niet élke euro op een échte slotkoers rust, moet
 * de grondslagregel eronder dat zeggen — en zodra dat wél zo is, moet die regel
 * juist wegblijven (anders leest hij als een permanent voorbehoud). Daarnaast:
 * zonder transactiehistorie geen lege as maar een uitleg met een uitweg.
 *
 * De route `/api/holdings/value-history` wordt hier gemockt; hij wordt parallel
 * gebouwd. Het contract dat we mocken is het contract dat het component leest.
 */

function point(
  date: string,
  marketValue: number,
  costBasis: number,
  pricedFromMarket = 1,
): PortfolioValueHistoryPoint {
  return { date, marketValue, costBasis, openPositions: 4, pricedFromMarket }
}

const POINTS: PortfolioValueHistoryPoint[] = [
  point('2025-09-01', 10_000, 9_500),
  point('2025-10-01', 10_800, 9_900),
  point('2025-11-01', 10_400, 10_200),
  point('2025-12-01', 11_600, 10_500),
  point('2026-01-01', 12_100, 10_800),
  point('2026-02-01', 12_900, 11_000),
]

function response(
  overrides: Partial<PortfolioValueHistoryResponse> = {},
): PortfolioValueHistoryResponse {
  return {
    points: POINTS,
    averagePricedFromMarket: 1,
    holdingsWithoutMarketPriceCount: 0,
    totalHoldings: 4,
    ...overrides,
  }
}

/** Vervangt global.fetch door één vaste JSON-respons. */
function mockHistory(body: PortfolioValueHistoryResponse) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PortfolioValueChart — met data', () => {
  it('tekent beide lijnen en toont de stand van vandaag', async () => {
    mockHistory(response())
    render(<PortfolioValueChart />)

    expect(await screen.findByTestId('portfolio-value-chart')).toBeInTheDocument()
    expect(screen.getByTestId('portfolio-value-market-line')).toBeInTheDocument()
    expect(screen.getByTestId('portfolio-value-cost-line')).toBeInTheDocument()

    // Marktwaarde (12.900) en inleg (11.000) van het laatste punt staan in de
    // legenda. Regex met \s omdat formatCurrency een nbsp tussen € en bedrag
    // zet, die de whitespace-normalizer van testing-library niet opruimt.
    expect(screen.getByText(/€\s*12\.900/)).toBeInTheDocument()
    expect(screen.getByText(/€\s*11\.000/)).toBeInTheDocument()
    // Verschil = marktwaarde − inleg, met teken en positieve semantiek.
    expect(screen.getByTestId('portfolio-value-diff')).toHaveTextContent(/\+€\s*1\.900/)
  })

  it('vraagt het opgegeven aantal maanden op bij de route', async () => {
    const fetchMock = mockHistory(response())
    render(<PortfolioValueChart months={36} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/holdings/value-history?months=36',
      expect.anything(),
    )
  })

  it('vat de trend samen in het aria-label van de SVG', async () => {
    mockHistory(response())
    render(<PortfolioValueChart />)

    const svg = await screen.findByTestId('portfolio-value-chart-svg')
    expect(svg).toHaveAttribute('role', 'img')
    const label = svg.getAttribute('aria-label') ?? ''
    expect(label).toContain('gestegen')
    expect(label).toContain('1 sep 2025')
    expect(label).toContain('1 feb 2026')
  })

  it('vertaalt de eindwaarde naar vrijheidstijd wanneer de uitgaven bekend zijn', async () => {
    mockHistory(response())
    const yearlyEssentialExpenses = 18_250
    render(<PortfolioValueChart yearlyEssentialExpenses={yearlyEssentialExpenses} />)

    // Pin de gerénderde tekst tegen de canonieke motor voor dezelfde input:
    // dagtarief via dailyExpenseRate (×12/365), tijd via calculateFreedomTime.
    // Zo valt weergave-drift (verkeerde grondslag, eigen som) direct om.
    const expected = formatFreedomTimeString(
      calculateFreedomTime(
        POINTS[POINTS.length - 1].marketValue,
        dailyExpenseRate(yearlyEssentialExpenses / 12),
      ),
      'long',
    )
    const freedom = await screen.findByTestId('portfolio-value-freedom')
    expect(expected).toBe('8 maanden') // sanity: €50/dag, €12.900 ⇒ 258 dagen
    expect(freedom).toHaveTextContent(expected)
    expect(freedom).toHaveTextContent('vrijheid')
  })

  it('laat de vrijheidsregel weg zonder bekende uitgaven', async () => {
    mockHistory(response())
    render(<PortfolioValueChart />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByTestId('portfolio-value-freedom')).toBeNull()
  })
})

describe('PortfolioValueChart — eerlijke grondslag', () => {
  it('zegt hoeveel van de waarde op marktkoersen rust', async () => {
    mockHistory(
      response({
        averagePricedFromMarket: 0.78,
        holdingsWithoutMarketPriceCount: 1,
        totalHoldings: 4,
      }),
    )
    render(<PortfolioValueChart />)

    const note = await screen.findByTestId('portfolio-value-basis-note')
    expect(note).toHaveTextContent(
      '78% van de waarde is gewaardeerd op opgehaalde slotkoersen; de rest op de laatst bekende prijs van die positie.',
    )
    // "geen actuele koers" zou onwaar zijn: zo'n positie heeft wél een prijs
    // (handmatig of uit de import), alleen geen opgehaalde koersreeks.
    expect(note).toHaveTextContent('1 van de 4 posities heeft geen koershistorie.')
  })

  // Given een reeks waarin posities koershistorie missen — de constatering die
  // de grondslagregel doet;
  // When de gebruiker die regel leest;
  // Then hoort daar een uitweg bij: een melding zonder handeling is een
  // doodlopende mededeling, en zonder deze knop heeft de backfill-route geen
  // enkele aanroeper.
  it('biedt een uitweg wanneer koershistorie ontbreekt', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('backfill-history')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ backfilled: 2, skippedUnresolvable: 0, nextOffset: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          response({ averagePricedFromMarket: 0.4, holdingsWithoutMarketPriceCount: 2 }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PortfolioValueChart />)
    await screen.findByTestId('portfolio-value-basis-note')

    const knop = screen.getByRole('button', { name: /koershistorie ophalen/i })
    fireEvent.click(knop)

    // Contract: de klik roept de backfill aan én herlaadt daarna de reeks —
    // anders zie je de zojuist opgehaalde koersen pas na een pagina-refresh.
    await screen.findByTestId('portfolio-value-chart-loading')
    const calls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(calls.filter((u) => u.includes('/api/holdings/backfill-history'))).toHaveLength(1)
    expect(
      calls.filter((u) => u.includes('/api/holdings/value-history')).length,
    ).toBeGreaterThan(1)
  })

  it('meldt het eerlijk wanneer er niets op te halen valt', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('backfill-history')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          // Alle posities onoplosbaar: turbo's, sprinters, delistings.
          json: async () => ({ backfilled: 0, skippedUnresolvable: 3, nextOffset: null }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          response({ averagePricedFromMarket: 0.4, holdingsWithoutMarketPriceCount: 3 }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<PortfolioValueChart />)
    await screen.findByTestId('portfolio-value-basis-note')
    fireEvent.click(screen.getByRole('button', { name: /koershistorie ophalen/i }))

    // Geen herlaadflits en geen valse belofte: de grafiek blijft staan en de
    // gebruiker leest waaróm er niets kwam.
    expect(await screen.findByText(/niet als beursfonds genoteerd/i)).toBeInTheDocument()
  })

  it('laat de uitweg weg wanneer er niets op te halen valt', async () => {
    mockHistory(response({ averagePricedFromMarket: 1, holdingsWithoutMarketPriceCount: 0 }))
    render(<PortfolioValueChart />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByRole('button', { name: /koershistorie ophalen/i })).toBeNull()
  })

  it('verzint geen 100% bij een net-niet-volledige dekking', async () => {
    mockHistory(response({ averagePricedFromMarket: 0.998 }))
    render(<PortfolioValueChart />)

    // 0,998 rondt naar 100 af; dat zou "alles op marktkoersen" beweren terwijl
    // de regel juist zegt dat er een rest is. Knijp naar 99.
    const note = await screen.findByTestId('portfolio-value-basis-note')
    expect(note).toHaveTextContent('99% van de waarde')
  })

  it('laat de regel weg wanneer alles op marktkoersen staat', async () => {
    mockHistory(response({ averagePricedFromMarket: 1 }))
    render(<PortfolioValueChart />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByTestId('portfolio-value-basis-note')).toBeNull()
  })
})

describe('PortfolioValueChart — lege staat', () => {
  it('legt uit dat er nog geen historie is en biedt een uitweg', async () => {
    mockHistory(
      response({ points: [], averagePricedFromMarket: 0, totalHoldings: 0 }),
    )
    render(<PortfolioValueChart />)

    const empty = await screen.findByTestId('portfolio-value-chart-empty')
    expect(empty).toHaveTextContent('Er is nog geen transactiehistorie')
    // Geen kale as zonder data.
    expect(screen.queryByTestId('portfolio-value-chart-svg')).toBeNull()
    expect(screen.getByRole('link', { name: /Importeer je transacties/i })).toHaveAttribute(
      'href',
      '/core/assets/holdings/import',
    )
  })

  it('behandelt één datapunt óók als "nog geen verloop"', async () => {
    mockHistory(response({ points: [point('2026-02-01', 12_900, 11_000)] }))
    render(<PortfolioValueChart />)

    expect(await screen.findByTestId('portfolio-value-chart-empty')).toBeInTheDocument()
  })
})

describe('PortfolioValueChart — fout', () => {
  it('degradeert stil, zonder rode banner, mét herstelpad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<PortfolioValueChart />)

    const failed = await screen.findByTestId('portfolio-value-chart-error')
    expect(failed).toHaveTextContent('Het waardeverloop is nu niet op te halen')
    expect(screen.getByRole('button', { name: /Opnieuw proberen/i })).toBeInTheDocument()
  })
})
