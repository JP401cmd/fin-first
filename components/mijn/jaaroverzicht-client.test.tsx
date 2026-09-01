import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { YearInReviewData } from '@/app/api/year-in-review/route'
import { JaaroverzichtClient } from './jaaroverzicht-client'

/**
 * Deze suite pint de GERENDERDE waarden aan de velden die `/api/year-in-review`
 * levert. Dat is bewust meer dan "er staat een getal": weergave-drift (verkeerd
 * veld, verkeerde grondslag, stale mapping) is anders pas zichtbaar als een
 * gebruiker het meldt. Het scherm rekent zelf niets uit — als een assertie hier
 * ooit een ander getal ziet dan de fixture, is de mapping stuk.
 *
 * jsdom-randen (IntersectionObserver, matchMedia) komen uit `test/setup.ts`;
 * die mock laat `useInViewAnimation` meteen "in view" gaan.
 */

const MAANDLABELS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MAANDNAMEN = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
]

/**
 * `formatCurrency` (nl-NL) zet een NO-BREAK SPACE tussen € en het getal. Zonder
 * normalisatie zoekt een assertie met een gewone spatie naar iets dat er niet
 * staat — en zou groen blijven bij een verkeerd bedrag.
 */
function tekstVan(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ')
}

function leegJaar(year: number): YearInReviewData {
  return {
    year,
    displayName: null,
    freedomDaysWon: 0,
    freedomDaysByMonth: MAANDLABELS.map((label, i) => ({
      month: `${year}-${String(i + 1).padStart(2, '0')}`,
      label,
      days: 0,
    })),
    bestFreedomMonth: null,
    netWorthStart: null,
    netWorthEnd: null,
    netWorthGrowth: null,
    netWorthGrowthPct: null,
    netWorthByMonth: [],
    bestMonth: null,
    worstMonth: null,
    monthlyOverview: MAANDNAMEN.map((label, i) => ({
      month: `${year}-${String(i + 1).padStart(2, '0')}`,
      label,
      income: 0,
      expenses: 0,
      savings: 0,
    })),
    fireStart: null,
    fireEnd: null,
    fireProgressDelta: null,
    totalIncome: 0,
    totalExpenses: 0,
    totalSaved: 0,
    savingsRate: null,
    actionsCompleted: 0,
    generatedAt: '2026-01-05T10:00:00.000Z',
  }
}

function volJaar(year = 2025): YearInReviewData {
  const basis = leegJaar(year)
  return {
    ...basis,
    displayName: 'Jan',
    freedomDaysWon: 42.5,
    freedomDaysByMonth: basis.freedomDaysByMonth.map((m, i) =>
      i === 4 ? { ...m, days: 18.5 } : i === 1 ? { ...m, days: 6 } : m,
    ),
    bestFreedomMonth: { month: `${year}-05`, label: 'mei', days: 18.5 },
    netWorthStart: 120000,
    netWorthEnd: 168400,
    netWorthGrowth: 48400,
    netWorthGrowthPct: 40.3,
    netWorthByMonth: [
      { month: `${year}-01-31`, value: 120000 },
      { month: `${year}-06-30`, value: 141000 },
      { month: `${year}-12-31`, value: 168400 },
    ],
    bestMonth: { month: `${year}-05`, label: 'Mei', savings: 3100 },
    worstMonth: { month: `${year}-11`, label: 'November', savings: -1200 },
    // `bestMonth`/`worstMonth` dragen geen in-/uitgaven; die staan in dezelfde
    // rij van `monthlyOverview`. De fixture houdt beide bronnen consistent —
    // precies de mapping die het scherm opzoekt.
    // Alle 12 maanden dragen gegevens (realistisch voor een vol jaar): het
    // dagtarief deelt door de maanden mét gegevens, dus een fixture waarin
    // alleen mei en november "bestaan" zou een heel andere grondslag toetsen.
    // Mei blijft de beste (3100), november de zwakste (−1200).
    monthlyOverview: basis.monthlyOverview.map((m, i) =>
      i === 4
        ? { ...m, income: 5200, expenses: 2100, savings: 3100 }
        : i === 10
          ? { ...m, income: 4100, expenses: 5300, savings: -1200 }
          : { ...m, income: 5000, expenses: 3800, savings: 1200 },
    ),
    fireStart: { percentage: 18.4, netWorth: 120000, fireTarget: 650000 },
    fireEnd: { percentage: 25.9, netWorth: 168400, fireTarget: 650000 },
    fireProgressDelta: 7.5,
    totalIncome: 62400,
    totalExpenses: 41800,
    totalSaved: 20600,
    savingsRate: 33.0,
    actionsCompleted: 9,
  }
}

function mockFetch(handler: (url: string) => { status?: number; body?: unknown }) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const { status = 200, body = {} } = handler(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('JaaroverzichtClient — volle fixture', () => {
  it('rendert de kernsecties met exact de cijfers uit de API', async () => {
    mockFetch(() => ({ body: volJaar(2025) }))

    const { container } = render(<JaaroverzichtClient />)

    // De kop draagt het jaar dat de API TERUGGAF, niet een lokaal geraden jaar.
    await screen.findByText(/Jouw 2025 in/i)
    const tekst = tekstVan(container)

    // I — vrijheidsdagen: totaal + beste maand.
    expect(tekst).toContain('42,5')
    expect(tekst).toContain('mei — 18,5 dagen')

    // II — vermogen: begin, eind, delta én percentage.
    expect(tekst).toContain('€ 120.000')
    expect(tekst).toContain('€ 168.400')
    expect(tekst).toContain('+€ 48.400')
    expect(tekst).toContain('+40,3%')

    // III — beste en slechtste spaarmaand met hun bedragen.
    expect(tekst).toContain('Mei')
    expect(tekst).toContain('+€ 3.100')
    expect(tekst).toContain('November')
    expect(tekst).toContain('€ -1.200')

    // IV — vrijheidspercentage begin → eind + delta in procentpunten.
    expect(tekst).toContain('25,9%')
    expect(tekst).toContain('begin 18,4%')
    expect(tekst).toContain('+7,5 procentpunt')
    expect(tekst).toContain('€ 650.000')

    // V — de kassabon.
    expect(tekst).toContain('€ 62.400')
    expect(tekst).toContain('€ -41.800')
    expect(tekst).toContain('+€ 20.600')
    expect(tekst).toContain('33%')
    expect(tekst).toContain('Afgeronde acties')

    expect(tekst).not.toContain('NaN')
  })

  it('drukt het overgehouden bedrag ook in vrijheidstijd uit, op de uitgaven van dat jaar', async () => {
    mockFetch(() => ({ body: volJaar(2025) }))
    const { container } = render(<JaaroverzichtClient />)
    await screen.findByText(/Jouw 2025 in/i)

    // Grondslag = het jaar zelf: €41.800 / 12 maanden-met-gegevens ⇒ dagtarief
    // (×12/365) = €114,52.
    // €20.600 / €114,52 = 179,9 dagen ⇒ 5 maanden (de resterende dagen tonen
    // pas als jaren én maanden nul zijn — zie formatFreedomTimeString).
    expect(tekstVan(container)).toContain('Wat je overhield staat voor')
    expect(tekstVan(container)).toContain('5 maanden')
  })

  it('presenteert het lopende jaar als tussenstand, niet als afgesloten jaar', async () => {
    const ditJaar = new Date().getFullYear()
    mockFetch(() => ({ body: volJaar(ditJaar) }))
    const { container } = render(<JaaroverzichtClient />)
    await screen.findByText(new RegExp(`Jouw ${ditJaar} in`, 'i'))

    const tekst = tekstVan(container)
    // Review-🟡 31 aug 2026: afgeronde-jaar-taal over een half jaar presenteerde
    // de tussenstand als eindstand.
    expect(tekst).toContain(`de tussenstand van ${ditJaar}`)
    expect(tekst).not.toContain(`de rekening van ${ditJaar}`)
    expect(tekst).toContain('Tot nu toe staat je vermogen')
    expect(tekst).not.toContain(`Aan het eind van ${ditJaar}`)
  })

  it('haalt zonder keuze het API-defaultjaar op — zonder ?year in de URL', async () => {
    const fn = mockFetch(() => ({ body: volJaar(2025) }))
    render(<JaaroverzichtClient />)
    await screen.findByText(/Jouw 2025 in/i)
    expect(String(fn.mock.calls[0]?.[0])).toBe('/api/year-in-review')
  })
})

describe('JaaroverzichtClient — jaarwissel', () => {
  it('fetcht het gekozen jaar en toont dat jaar in de kop', async () => {
    const gevraagd: string[] = []
    const fn = mockFetch((url) => {
      gevraagd.push(url)
      const match = url.match(/year=(\d{4})/)
      return { body: volJaar(match ? Number(match[1]) : 2025) }
    })

    render(<JaaroverzichtClient />)
    await screen.findByText(/Jouw 2025 in/i)

    const doel = new Date().getFullYear() - 2
    fireEvent.click(screen.getByRole('button', { name: String(doel) }))

    await waitFor(() => {
      expect(gevraagd).toContain(`/api/year-in-review?year=${doel}`)
    })
    await screen.findByText(new RegExp(`Jouw ${doel} in`, 'i'))
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('JaaroverzichtClient — lege en onvolledige staten', () => {
  it('toont een eerlijke lege staat bij een jaar zonder gegevens — geen NaN, geen €0 als prestatie', async () => {
    mockFetch(() => ({ body: leegJaar(2024) }))
    const { container } = render(<JaaroverzichtClient />)

    await screen.findByText(/Nog geen gegevens over 2024/i)

    const tekst = tekstVan(container)
    expect(tekst).not.toContain('NaN')
    expect(tekst).not.toContain('€ 0')
    // De katernen zelf worden niet gerenderd — geen kassabon vol nullen.
    expect(screen.queryByText('Afgeronde acties')).toBeNull()
    expect(screen.queryByText(/Spaarquote/i)).toBeNull()
    // Wél een voorwaartse uitgang.
    expect(screen.getByRole('link', { name: /Vul je gegevens aan/i })).toBeTruthy()
  })

  it('verbergt de cijfers van een katern zonder gegevens en zegt waaróm', async () => {
    // Wél transacties en acties, maar geen waarderingen ⇒ geen vermogen, geen FIRE.
    const data: YearInReviewData = {
      ...volJaar(2025),
      netWorthStart: null,
      netWorthEnd: null,
      netWorthGrowth: null,
      netWorthGrowthPct: null,
      netWorthByMonth: [],
      fireStart: null,
      fireEnd: null,
      fireProgressDelta: null,
    }
    mockFetch(() => ({ body: data }))
    const { container } = render(<JaaroverzichtClient />)
    await screen.findByText(/Jouw 2025 in/i)

    const tekst = tekstVan(container)
    expect(tekst).toContain('geen vermogenswaarderingen vastgelegd')
    expect(tekst).toContain('essentiële budgetten')
    // Geen enkel vermogens- of FIRE-cijfer meer op het scherm.
    expect(tekst).not.toContain('€ 120.000')
    expect(tekst).not.toContain('€ 168.400')
    expect(tekst).not.toContain('€ 650.000')
    expect(tekst).not.toContain('25,9%')
    expect(tekst).not.toContain('NaN')
    // De katernen die WÉL gegevens hebben staan er onverminderd.
    expect(tekst).toContain('42,5')
    expect(tekst).toContain('+€ 20.600')
  })
})

describe('JaaroverzichtClient — foutstaten', () => {
  it('toont bij 401 een nette melding met een weg terug, geen leeg scherm', async () => {
    mockFetch(() => ({ status: 401, body: { error: 'Niet ingelogd' } }))
    const { container } = render(<JaaroverzichtClient />)

    await screen.findByText(/Je bent niet meer ingelogd/i)
    expect(screen.getByRole('link', { name: /Opnieuw inloggen/i })).toBeTruthy()
    expect(tekstVan(container)).not.toContain('NaN')
  })

  it('biedt bij een serverfout een herkansing aan', async () => {
    const fn = mockFetch(() => ({ status: 500, body: { error: 'Mislukt' } }))
    render(<JaaroverzichtClient />)

    await screen.findByText(/kwam niet binnen/i)
    fireEvent.click(screen.getByRole('button', { name: /Opnieuw proberen/i }))
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
  })
})
