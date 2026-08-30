import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import {
  PortfolioValueChart,
  type PortfolioValueHistoryPoint,
  type PortfolioValueHistoryResponse,
  type PortfolioValueHoldingSlice,
} from './portfolio-value-chart'
import {
  calculateFreedomTime,
  dailyExpenseRate,
  formatFreedomTimeString,
} from '@/lib/format'

/** Vereiste prop sinds de pane-url-history-koppeling; deze suite toetst de grafiek, niet het open-gedrag. */
const noopOpenHolding = () => {}

/**
 * De historische waardegrafiek van de effectenportefeuille.
 *
 * Wat deze suite bewaakt is niet "er staat een lijn", maar de eerlijkheid van
 * wat eromheen staat: zolang niet élke euro op een échte slotkoers rust, moet
 * de grondslagregel eronder dat zeggen — en zodra dat wél zo is, moet die regel
 * juist wegblijven (anders leest hij als een permanent voorbehoud). Daarnaast:
 * zonder transactiehistorie geen lege as maar een uitleg met een uitweg.
 *
 * Sinds de balkweergave bewaakt de suite ook twee dingen die stil konden
 * wegdrijven: (1) de INLEG-/VERSCHIL-laag is écht weg — `costBasis` telde
 * alleen nog-open posities en loog dus zodra er ooit verkocht was; (2) de
 * balken tonen precies zoveel segmenten als de reeks posities levert, en de
 * kassabon achter een maand hoort bij díé maand.
 *
 * De route `/api/holdings/value-history` wordt hier gemockt. Het contract dat we
 * mocken is het contract dat het component leest.
 */

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/core/assets/holdings',
  useSearchParams: () => new URLSearchParams(),
}))

// ── Fixtures ─────────────────────────────────────────────────────

function slice(
  id: string,
  name: string,
  ticker: string | null,
  value: number,
  tier: PortfolioValueHoldingSlice['tier'] = 'market',
): PortfolioValueHoldingSlice {
  return { id, name, ticker, value, tier }
}

/** Drie posities die samen de marktwaarde van een maand dragen. */
function breakdown(total: number): PortfolioValueHoldingSlice[] {
  return [
    slice('h-1', 'Vanguard All-World', 'VWRL', Math.round(total * 0.5)),
    slice('h-2', 'ASML Holding', 'ASML', Math.round(total * 0.3)),
    slice('h-3', 'Onbekende positie', null, total - Math.round(total * 0.5) - Math.round(total * 0.3), 'cost'),
  ]
}

function point(
  date: string,
  marketValue: number,
  costBasis: number,
  pricedFromMarket = 1,
): PortfolioValueHistoryPoint {
  return {
    date,
    marketValue,
    costBasis,
    openPositions: 4,
    pricedFromMarket,
    byHolding: breakdown(marketValue),
    rest: null,
  }
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

/** Zelfde reeks, maar zónder verdeling per positie — de gecachete-respons-situatie. */
function pointsWithoutBreakdown(): PortfolioValueHistoryPoint[] {
  return POINTS.map(p => {
    const { byHolding: _byHolding, rest: _rest, ...bare } = p
    return bare as PortfolioValueHistoryPoint
  })
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
  replaceMock.mockClear()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('PortfolioValueChart — met data', () => {
  it('tekent de marktwaarde-lijn en toont de stand van vandaag', async () => {
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    expect(await screen.findByTestId('portfolio-value-chart')).toBeInTheDocument()
    expect(screen.getByTestId('portfolio-value-market-line')).toBeInTheDocument()

    // Marktwaarde (12.900) van het laatste punt staat in de legenda. Regex met
    // \s omdat formatCurrency een nbsp tussen € en bedrag zet, die de
    // whitespace-normalizer van testing-library niet opruimt.
    expect(screen.getByText(/€\s*12\.900/)).toBeInTheDocument()
  })

  // Given `costBasis` alleen de posities telt die de gebruiker NU nog heeft;
  // When de grafiek daaruit een inleg-lijn en een "verschil" zou afleiden;
  // Then staat er een getal op het scherm dat het rendement van elke verkochte
  // positie stilzwijgend weglaat. De hele laag is daarom weg — niet gedimd,
  // niet achter een toggle: weg.
  it('toont geen inleg-lijn, geen INLEG/VERSCHIL-legenda en geen verschil-getal', async () => {
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByTestId('portfolio-value-cost-line')).toBeNull()
    expect(screen.queryByTestId('portfolio-value-diff')).toBeNull()
    expect(screen.queryByText(/^Inleg$/i)).toBeNull()
    expect(screen.queryByText(/^Verschil$/i)).toBeNull()
    // De kostbasis van het laatste punt (11.000) hoort nergens meer te staan.
    expect(screen.queryByText(/€\s*11\.000/)).toBeNull()
  })

  it('vraagt het opgegeven aantal maanden op bij de route', async () => {
    const fetchMock = mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={36} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/holdings/value-history?months=36',
      expect.anything(),
    )
  })

  // Given de aanroeper de hele historie wil;
  // When hij `months={null}` doorgeeft;
  // Then gaat de queryparam wég — een `months=null` in de URL zou de route een
  // lege of foute reeks laten teruggeven.
  it('laat de months-param weg bij months={null}', async () => {
    const fetchMock = mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={null} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/holdings/value-history',
      expect.anything(),
    )
  })

  it('vat de trend samen in het aria-label van de SVG', async () => {
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

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
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} yearlyEssentialExpenses={yearlyEssentialExpenses} />)

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
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByTestId('portfolio-value-freedom')).toBeNull()
  })
})

describe('PortfolioValueChart — weergave lijn ⇄ balken', () => {
  it('wisselt naar balken en onthoudt die keuze', async () => {
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    // Start op de lijn.
    expect(screen.getByTestId('portfolio-value-market-line')).toBeInTheDocument()
    expect(screen.getByTestId('value-chart-toggle-line')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('value-chart-toggle-bars'))

    expect(screen.getByTestId('value-chart-toggle-bars')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('portfolio-value-market-line')).toBeNull()
    expect(screen.getAllByTestId(/^portfolio-value-bar-hit-/)).toHaveLength(POINTS.length)
    expect(localStorage.getItem('holdings-value-chart-mode')).toBe('bars')
  })

  it('herstelt de opgeslagen weergave bij een volgend bezoek', async () => {
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.getByTestId('value-chart-toggle-bars')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('portfolio-value-market-line')).toBeNull()
  })

  // Given een maand met drie posities plus een staart;
  // When de balkweergave aanstaat;
  // Then staat er één segment per positie én één voor de staart — niet één
  // blok dat de verdeling wegmiddelt.
  it('stapelt één segment per positie, plus de staart', async () => {
    const withRest = POINTS.map((p, i) =>
      i === POINTS.length - 1
        ? { ...p, rest: { count: 7, value: 900 } }
        : p,
    )
    mockHistory(response({ points: withRest }))
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    // Eerste maand: drie posities, geen staart.
    expect(screen.getAllByTestId('portfolio-value-bar-segment-0')).toHaveLength(3)
    // Laatste maand: drie posities + de staart-regel.
    expect(
      screen.getAllByTestId(`portfolio-value-bar-segment-${POINTS.length - 1}`),
    ).toHaveLength(4)
  })

  // Given een oudere/gecachete respons zónder `byHolding`;
  // When de gebruiker de balkweergave kiest;
  // Then valt de grafiek terug op de lijn mét melding — geen lege as, geen crash.
  it('valt terug op de lijn wanneer de reeks geen verdeling per positie draagt', async () => {
    mockHistory(response({ points: pointsWithoutBreakdown() }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    fireEvent.click(screen.getByTestId('value-chart-toggle-bars'))

    expect(screen.getByTestId('portfolio-value-bars-unavailable')).toHaveTextContent(
      'De verdeling per positie zit nog niet in deze reeks',
    )
    expect(screen.getByTestId('portfolio-value-market-line')).toBeInTheDocument()
    expect(screen.queryByTestId('portfolio-value-bar-hit-0')).toBeNull()
  })
})

describe('PortfolioValueChart — kassabon achter een maand', () => {
  it('opent bij een kolom-klik de posities van díé maand', async () => {
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    fireEvent.click(screen.getByTestId('portfolio-value-bar-hit-5'))

    const sheet = await screen.findByTestId('portfolio-month-details')
    // De maand zelf (laatste punt = feb 2026) en haar totaal.
    expect(screen.getByText('Februari 2026')).toBeInTheDocument()
    expect(screen.getByTestId('portfolio-month-total')).toHaveTextContent(/€\s*12\.900/)
    // Elke positie uit die maand staat er, met haar waarderingsgrondslag —
    // dat laatste is het eerlijkheidscontract van deze grafiek.
    expect(sheet).toHaveTextContent('Vanguard All-World')
    expect(sheet).toHaveTextContent('ASML Holding')
    expect(sheet).toHaveTextContent('gewaardeerd op slotkoers')
    expect(sheet).toHaveTextContent('gewaardeerd op aankoopprijs')
  })

  it('toont de posities van de aangeklikte maand, niet die van de laatste', async () => {
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    fireEvent.click(screen.getByTestId('portfolio-value-bar-hit-0'))

    await screen.findByTestId('portfolio-month-details')
    expect(screen.getByText('September 2025')).toBeInTheDocument()
    // Marktwaarde van het EERSTE punt (10.000), niet die van het laatste.
    expect(screen.getByTestId('portfolio-month-total')).toHaveTextContent(/€\s*10\.000/)
  })

  it('vat de staart samen als één regel', async () => {
    const withRest = POINTS.map((p, i) =>
      i === POINTS.length - 1 ? { ...p, rest: { count: 7, value: 900 } } : p,
    )
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response({ points: withRest }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    fireEvent.click(screen.getByTestId('portfolio-value-bar-hit-5'))

    expect(await screen.findByTestId('portfolio-month-rest')).toHaveTextContent('nog 7 posities')
  })

  it('opent bij een rij-klik de detail-pane via de controller (onOpenHolding), niet via een eigen replace', async () => {
    // Sinds de terugknop-audit deelt de kassabon de pane-url-history van
    // holdings-client: de rij levert alleen de intentie (onOpenHolding) aan en
    // schrijft zélf geen URL meer — een eigen router.replace was het tweede
    // open-pad zonder terugknop-sluitgedrag.
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response())
    const openHolding = vi.fn()
    render(<PortfolioValueChart onOpenHolding={openHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    fireEvent.click(screen.getByTestId('portfolio-value-bar-hit-5'))
    await screen.findByTestId('portfolio-month-details')

    fireEvent.click(screen.getByTestId('portfolio-month-row-h-2'))

    expect(openHolding).toHaveBeenCalledWith('h-2')
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

describe('PortfolioValueChart — kleur per positie', () => {
  /** Eén reeks met 31 posities per maandpunt — voorbij de kleurcirkel. */
  function manyHoldings(count: number): PortfolioValueHistoryPoint[] {
    const slices = Array.from({ length: count }, (_, i) =>
      slice(`m-${i}`, `Positie ${i}`, null, 1_000 - i * 10),
    )
    return ['2025-12-01', '2026-01-01', '2026-02-01'].map(date => ({
      date,
      marketValue: slices.reduce((s, x) => s + x.value, 0),
      costBasis: 10_000,
      openPositions: count,
      pricedFromMarket: 1,
      byHolding: slices,
      rest: null,
    }))
  }

  // Given een reeks met 31 posities (het referentie-account heeft er 109, en de
  // grafiek bouwt de kleurvolgorde over de UNIE van álle maandpunten);
  // When de balken kleuren krijgen;
  // Then krijgt positie 31 NIET dezelfde kleur als positie 1. De oude vaste stap
  // van 12° maakte de cirkel bij index 30 exact rond — twee identieke segmenten
  // in dezelfde balk, precies wat stabiele kleuren moesten voorkomen.
  it('kleurt hoogstens twaalf posities eigen en laat de staart samenvallen met de rest-kleur', async () => {
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response({ points: manyHoldings(31) }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    const fills = screen
      .getAllByTestId('portfolio-value-bar-segment-0')
      .map(el => el.getAttribute('fill'))

    expect(fills).toHaveLength(31)
    const named = fills.filter(f => f !== 'var(--ink-4)')
    expect(named).toHaveLength(12)
    // Twaalf slots, twaalf verschillende kleuren — geen enkele botsing.
    expect(new Set(named).size).toBe(12)
    // De 31e positie deelt de neutrale staart-tint, niet de accentkleur van de 1e.
    expect(fills[30]).toBe('var(--ink-4)')
    expect(fills[30]).not.toBe(fills[0])
  })
})

describe('PortfolioValueChart — toetsenbord (roving tabindex)', () => {
  async function renderBars() {
    localStorage.setItem('holdings-value-chart-mode', 'bars')
    mockHistory(response())
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)
    await screen.findByTestId('portfolio-value-chart')
  }

  // Given 121 maandkolommen bij "Alles" (hier zes, hetzelfde mechanisme);
  // When iemand met Tab langs de grafiek loopt;
  // Then is de grafiek ÉÉN stop — niet één stop per maand van ~5px breed.
  it('levert precies één tab-stop, op de meest recente maand', async () => {
    await renderBars()

    const hits = screen.getAllByTestId(/^portfolio-value-bar-hit-/)
    expect(hits).toHaveLength(POINTS.length)
    const tabbable = hits.filter(h => h.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toBe(screen.getByTestId(`portfolio-value-bar-hit-${POINTS.length - 1}`))
  })

  it('verplaatst de selectie met pijltjes en springt met Home/End', async () => {
    await renderBars()
    const last = POINTS.length - 1

    fireEvent.keyDown(screen.getByTestId(`portfolio-value-bar-hit-${last}`), { key: 'ArrowLeft' })
    expect(screen.getByTestId(`portfolio-value-bar-hit-${last - 1}`)).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId(`portfolio-value-bar-hit-${last}`)).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(screen.getByTestId(`portfolio-value-bar-hit-${last - 1}`), { key: 'Home' })
    expect(screen.getByTestId('portfolio-value-bar-hit-0')).toHaveAttribute('tabindex', '0')

    // Aan de rand blijft de selectie staan — geen wrap naar de andere kant.
    fireEvent.keyDown(screen.getByTestId('portfolio-value-bar-hit-0'), { key: 'ArrowLeft' })
    expect(screen.getByTestId('portfolio-value-bar-hit-0')).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(screen.getByTestId('portfolio-value-bar-hit-0'), { key: 'End' })
    expect(screen.getByTestId(`portfolio-value-bar-hit-${last}`)).toHaveAttribute('tabindex', '0')
  })

  it('opent met Enter de kassabon van de geselecteerde maand', async () => {
    await renderBars()
    const last = POINTS.length - 1

    fireEvent.keyDown(screen.getByTestId(`portfolio-value-bar-hit-${last}`), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByTestId(`portfolio-value-bar-hit-${last - 1}`), { key: 'Enter' })

    await screen.findByTestId('portfolio-month-details')
    // Index 4 = januari 2026, niet de laatste maand.
    expect(screen.getByText('Januari 2026')).toBeInTheDocument()
  })

  // WCAG 2.4.7: een hover-fill van 0.35 opacity over een strook van ~5px is
  // geen zichtbare focus-indicatie. De ring is een echte stroke — geen
  // `outline` op SVG, dat rendert onbetrouwbaar.
  it('tekent een zichtbare focusring om de gefocuste kolom', async () => {
    await renderBars()
    const last = POINTS.length - 1

    expect(screen.queryByTestId(`portfolio-value-bar-focus-${last}`)).toBeNull()

    fireEvent.focus(screen.getByTestId(`portfolio-value-bar-hit-${last}`))
    const ring = screen.getByTestId(`portfolio-value-bar-focus-${last}`)
    expect(ring).toHaveAttribute('stroke', 'var(--ink)')

    // Ring volgt de selectie mee.
    fireEvent.keyDown(screen.getByTestId(`portfolio-value-bar-hit-${last}`), { key: 'ArrowLeft' })
    expect(screen.getByTestId(`portfolio-value-bar-focus-${last - 1}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`portfolio-value-bar-focus-${last}`)).toBeNull()

    fireEvent.blur(screen.getByTestId(`portfolio-value-bar-hit-${last - 1}`))
    expect(screen.queryByTestId(`portfolio-value-bar-focus-${last - 1}`)).toBeNull()
  })

  // Een `role="img"` maakt de subtree presentational: de gefocuste maand zou
  // dan niet worden aangekondigd. In balkweergave is de SVG daarom een group.
  it('houdt de kolommen bereikbaar voor de schermlezer in balkweergave', async () => {
    await renderBars()

    const svg = screen.getByTestId('portfolio-value-chart-svg')
    expect(svg).toHaveAttribute('role', 'group')
    expect(svg.getAttribute('aria-label')).toContain('pijltjestoetsen')
    expect(
      screen.getByTestId(`portfolio-value-bar-hit-${POINTS.length - 1}`).getAttribute('aria-label'),
    ).toContain('feb 26')
  })
})

describe('PortfolioValueChart — venster-cache', () => {
  // Given langs de periode-rail klikken (1M→3M→6M→1J→YTD→Alles);
  // When de gebruiker terugklikt naar een venster dat hij al zag;
  // Then gaat er geen enkel verzoek uit. Het venster bepaalt alleen wélke
  // maanden de route uitrekent; de query's lezen sowieso de hele transactie- en
  // koershistorie, en bij "Alles" is de payload ~1400 verrijkte regels.
  it('haalt een eerder bekeken venster niet opnieuw op', async () => {
    const fetchMock = mockHistory(response())
    const { rerender } = render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={12} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={36} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    rerender(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={12} />)
    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    rerender(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={36} />)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('dimt de staande reeks tijdens het ophalen van een nieuwe periode', async () => {
    let resolveSecond: (v: unknown) => void = () => {}
    const pending = new Promise(res => {
      resolveSecond = res
    })
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('months=36')) return pending
      return Promise.resolve({ ok: true, status: 200, json: async () => response() })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={12} />)
    await screen.findByTestId('portfolio-value-chart')
    expect(screen.getByTestId('portfolio-value-chart')).not.toHaveAttribute('aria-busy')

    rerender(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={36} />)

    // De vorige reeks blijft staan (geen skeleton-flits) maar zegt eerlijk dat
    // hij nog niet bij de zojuist gekozen periode hoort.
    expect(screen.getByTestId('portfolio-value-chart')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('portfolio-value-chart-plot')).toHaveStyle({ opacity: '0.45' })
    expect(screen.getByRole('status')).toHaveTextContent('Nieuwe periode wordt geladen')

    resolveSecond({ ok: true, status: 200, json: async () => response() })
    await waitFor(() =>
      expect(screen.getByTestId('portfolio-value-chart')).not.toHaveAttribute('aria-busy'),
    )
  })

  // Given een venster dat mislukte of waarvan de koershistorie zojuist is
  // bijgevuld;
  // When de gebruiker op "Opnieuw proberen" (of de backfill-uitgang) drukt;
  // Then mag de cache dat venster niet terugserveren — anders blijft de fout
  // (of de oude reeks) eraan kleven.
  it('leegt de cache bij een retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => response() })
    vi.stubGlobal('fetch', fetchMock)

    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={12} />)
    await screen.findByTestId('portfolio-value-chart-error')

    fireEvent.click(screen.getByRole('button', { name: /Opnieuw proberen/i }))

    await screen.findByTestId('portfolio-value-chart')
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

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

    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)
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

    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)
    await screen.findByTestId('portfolio-value-basis-note')
    fireEvent.click(screen.getByRole('button', { name: /koershistorie ophalen/i }))

    // Geen herlaadflits en geen valse belofte: de grafiek blijft staan en de
    // gebruiker leest waaróm er niets kwam.
    expect(await screen.findByText(/niet als beursfonds genoteerd/i)).toBeInTheDocument()
  })

  it('laat de uitweg weg wanneer er niets op te halen valt', async () => {
    mockHistory(response({ averagePricedFromMarket: 1, holdingsWithoutMarketPriceCount: 0 }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByRole('button', { name: /koershistorie ophalen/i })).toBeNull()
  })

  it('verzint geen 100% bij een net-niet-volledige dekking', async () => {
    mockHistory(response({ averagePricedFromMarket: 0.998 }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    // 0,998 rondt naar 100 af; dat zou "alles op marktkoersen" beweren terwijl
    // de regel juist zegt dat er een rest is. Knijp naar 99.
    const note = await screen.findByTestId('portfolio-value-basis-note')
    expect(note).toHaveTextContent('99% van de waarde')
  })

  it('laat de regel weg wanneer alles op marktkoersen staat', async () => {
    mockHistory(response({ averagePricedFromMarket: 1 }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    await screen.findByTestId('portfolio-value-chart')
    expect(screen.queryByTestId('portfolio-value-basis-note')).toBeNull()
  })
})

describe('PortfolioValueChart — lege staat', () => {
  it('legt uit dat er nog geen historie is en biedt een uitweg', async () => {
    mockHistory(
      response({ points: [], averagePricedFromMarket: 0, totalHoldings: 0 }),
    )
    // `months={null}` = de volledige historie. Alleen dán kan het venster niets
    // hebben afgesneden en is "er is geen historie" de juiste verklaring.
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={null} />)

    const empty = await screen.findByTestId('portfolio-value-chart-empty')
    expect(empty).toHaveTextContent('Er is nog geen transactiehistorie')
    // Geen kale as zonder data.
    expect(screen.queryByTestId('portfolio-value-chart-svg')).toBeNull()
    expect(screen.getByRole('link', { name: /Importeer je transacties/i })).toHaveAttribute(
      'href',
      '/core/assets/holdings/import',
    )
  })

  it('wijt een leeg BEPERKT venster aan de periode, niet aan ontbrekende historie', async () => {
    // De reeks is op maandgrenzen geankerd: op de 1e van de maand levert "1M"
    // precies één anker. Iemand met jaren historie mag dan niet te horen krijgen
    // dat hij niets heeft — en al helemaal niet naar het importscherm worden
    // gestuurd voor transacties die hij allang heeft.
    mockHistory(
      response({ points: [], averagePricedFromMarket: 0, totalHoldings: 12 }),
    )
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} months={1} />)

    const empty = await screen.findByTestId('portfolio-value-chart-empty')
    expect(empty).toHaveTextContent('te weinig maandpunten')
    expect(empty).not.toHaveTextContent('nog geen transactiehistorie')
    expect(screen.queryByRole('link', { name: /Importeer je transacties/i })).toBeNull()
  })

  it('behandelt één datapunt óók als "nog geen verloop"', async () => {
    mockHistory(response({ points: [point('2026-02-01', 12_900, 11_000)] }))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    expect(await screen.findByTestId('portfolio-value-chart-empty')).toBeInTheDocument()
  })
})

describe('PortfolioValueChart — fout', () => {
  it('degradeert stil, zonder rode banner, mét herstelpad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<PortfolioValueChart onOpenHolding={noopOpenHolding} />)

    const failed = await screen.findByTestId('portfolio-value-chart-error')
    expect(failed).toHaveTextContent('Het waardeverloop is nu niet op te halen')
    expect(screen.getByRole('button', { name: /Opnieuw proberen/i })).toBeInTheDocument()
  })
})

// `cleanup` expliciet zodat de BottomSheet-portal (document.body) tussen tests
// verdwijnt — anders vinden latere queries de sheet van een vorige test terug.
afterEach(cleanup)
