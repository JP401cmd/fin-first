/**
 * Het meting-paneel van de duiding (Krant 1F fase 2, ronde 2): de zeven
 * poortmaten moeten AFLEESBAAR zijn, niet alleen in de JSON zitten — en de
 * G7-invoer moet echt naar de beheerroute schrijven.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { NewsDuidingMetingPanel } from './news-duiding-meting-panel'
import type { WeekMeting } from '@/lib/krant/duiding-beheer'

function week(over: Partial<WeekMeting> = {}): WeekMeting {
  return {
    week: '2026-W38',
    binnen: 12,
    geduid: 9,
    metMechanisme: 4,
    dekking: 4 / 9,
    rekenend: 2,
    mechanismeVervallen: 1,
    perCategorie: { fiscaal: { geduid: 9, metMechanisme: 4, dekking: 4 / 9 } },
    perGrondslag: { fragment: 7, kop: 2 },
    poort: { groen: 6, gedegradeerd: 3, perReden: { 'g1:ongegrond-getal': 2, 'g2:datum': 1 } },
    kopNietVanBron: 0,
    metModeltekst: 0,
    teruggetrokken: { 'fout-getal': 0, 'verkeerde-doelgroep': 0, 'verkeerd-mechanisme': 0, anders: 0 },
    teruggetrokkenTotaal: 0,
    foutGetalRekenend: 0,
    afgewezenPerCode: { 'doelgroep:ongegrond:wonen': 2, schema: 1 },
    afgewezenTotaal: 3,
    wacht: 0,
    mislukt: 0,
    zonderMechanismeTotaal: 0,
    zonderMechanisme: [],
    ...over,
  }
}

let meting: Record<string, unknown>
let steekproefAntwoord: { status: number; body: Record<string, unknown> }
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  meting = { weken: [week(), week({ week: '2026-W37' })], afgekapt: false, steekproef: {}, g7Gehaald: false }
  steekproefAntwoord = {
    status: 200,
    body: { steekproef: { '2026-W38': { gecontroleerd: 20, fouten: 1, op: '2026-09-21T10:00:00Z' } } },
  }
  fetchSpy = vi.fn((url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.startsWith('/api/admin/news-duiding/steekproef')) {
      return Promise.resolve(
        new Response(JSON.stringify(steekproefAntwoord.body), { status: steekproefAntwoord.status }),
      )
    }
    void init
    return Promise.resolve(new Response(JSON.stringify(meting), { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

/** De hele poortstand-regel: `findByText` raakt het label-span, het oordeel staat ernaast. */
async function stand(re: RegExp): Promise<HTMLElement> {
  const label = await screen.findByText(re)
  return label.closest('p') as HTMLElement
}

async function toonDetail(weekKey = '2026-W38') {
  render(<NewsDuidingMetingPanel ververs={0} />)
  fireEvent.click(await screen.findByRole('button', { name: `Details week ${weekKey}` }))
}

describe('NewsDuidingMetingPanel — de poortmaten zijn afleesbaar', () => {
  it('toont de tekstpoort per reden in beheertaal, inclusief de hard afgewezen G6-helft', async () => {
    await toonDetail()
    expect(await screen.findByText(/G1 · een getal dat niet in de bron staat/)).toBeInTheDocument()
    expect(screen.getByText(/G2 · een datum die niet uit de bron komt/)).toBeInTheDocument()
    // De G6-helft die hard afwijst staat twee keer: als rauwe foutcode in de
    // lijst afwijzingen, en met een label onder de tekstpoort.
    expect(screen.getByText(/G6 · doelgroep niet in de bron/)).toBeInTheDocument()
    expect(screen.getAllByText(/doelgroep:ongegrond:wonen/)).toHaveLength(2)
  })

  it('toont G5 (herkomst van de grondslag) en G4 (kop van de bron)', async () => {
    await toonDetail()
    expect(await screen.findByText('Eigen bronfragment')).toBeInTheDocument()
    expect(screen.getByText('Alleen de bronkop (geen fragment)')).toBeInTheDocument()
    expect(screen.getByText(/Kop niet van de bron \(G4\)/)).toBeInTheDocument()
    expect(screen.getByText(/Modeltekst als grondslag \(G5\)/)).toBeInTheDocument()
  })

  it('G4/G5-drift staat op gehaald zolang kop en grondslag van de bron komen', async () => {
    render(<NewsDuidingMetingPanel ververs={0} />)
    expect(within(await stand(/kop en grondslag komen van de bron/)).getByText('gehaald')).toBeInTheDocument()
  })

  it('G4/G5-drift slaat om zodra één rij een modelkop of modeltekst draagt', async () => {
    meting = { ...meting, weken: [week({ kopNietVanBron: 1 })] }
    render(<NewsDuidingMetingPanel ververs={0} />)
    const regel = await stand(/kop en grondslag komen van de bron/)
    expect(within(regel).getByText('nog niet gehaald')).toBeInTheDocument()
    expect(regel).toHaveTextContent(/1 rij\(en\) wijken af/)
  })

  it('G7: toont de stand en de vastgelegde steekproef per week', async () => {
    meting = {
      ...meting,
      steekproef: { '2026-W38': { gecontroleerd: 20, fouten: 0, op: '2026-09-21T10:00:00Z' } },
      g7Gehaald: true,
    }
    render(<NewsDuidingMetingPanel ververs={0} />)
    expect(within(await stand(/handmatige steekproef/)).getByText('gehaald')).toBeInTheDocument()
    expect(screen.getByText('0 / 20')).toBeInTheDocument()
  })
})

describe('NewsDuidingMetingPanel — het G7-formulier', () => {
  it('schrijft naar de beheerroute en werkt de stand bij zonder herladen', async () => {
    render(<NewsDuidingMetingPanel ververs={0} />)
    const knop = await screen.findByRole('button', { name: 'Steekproef vastleggen' })
    fireEvent.change(screen.getByLabelText('Fout'), { target: { value: '1' } })
    fireEvent.click(knop)

    await waitFor(() => expect(screen.getByText(/Steekproef van 2026-W38 vastgelegd/)).toBeInTheDocument())
    const [url, init] = fetchSpy.mock.calls.at(-1)!
    expect(url).toBe('/api/admin/news-duiding/steekproef')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ week: '2026-W38', gecontroleerd: 20, fouten: 1 })
    // Eén week gehaald is niet genoeg: de stand blijft "nog niet gehaald".
    expect(within(await stand(/handmatige steekproef/)).getByText('nog niet gehaald')).toBeInTheDocument()
    expect(screen.getByText(/Al vastgelegd voor 2026-W38/)).toBeInTheDocument()
  })

  it('leest een fout als platte string uit de ADR 0044-envelope', async () => {
    steekproefAntwoord = { status: 400, body: { error: 'De steekproef telt pas mee vanaf 20 gecontroleerde samenvattingen' } }
    render(<NewsDuidingMetingPanel ververs={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Steekproef vastleggen' }))
    expect(await screen.findByText(/telt pas mee vanaf 20/)).toBeInTheDocument()
  })

  it('draagt bij elk veld een effect en een waarom (de formulier-uitlegnorm)', async () => {
    render(<NewsDuidingMetingPanel ververs={0} />)
    expect(await screen.findByText(/Een tweede invoer voor dezelfde week vervangt de eerste/)).toBeInTheDocument()
    expect(screen.getByText(/Onder de 20 telt de week niet mee voor de poort/)).toBeInTheDocument()
    expect(screen.getByText(/G1 tot en met G6 draait de app zelf, G7 is jouw oordeel/)).toBeInTheDocument()
  })
})
