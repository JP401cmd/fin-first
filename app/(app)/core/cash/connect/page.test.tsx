import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { TargetAccountOption } from '@/lib/truelayer/target-account'
import ConnectBankPage from './page'

/**
 * Tests voor de koppelwizard — specifiek de uitkomst `?error=drager_bezet&drager=…`
 * (specs/bank-connect-doelrekening/plan.md, fase 7; het restpunt dat fase 6
 * doorgaf).
 *
 * Wat hier gepind wordt: dat de melding de BEZETTENDE BANK noemt en een echte
 * uitweg-link biedt, dat de tekst uit `occupiedTargetAccountMessage` komt (één
 * bron, gelijk aan de 409 van auth-link/relink en aan de uitgeschakelde
 * wizard-optie), en dat een onvindbare drager netjes terugvalt op de generieke
 * tekst zónder halve melding of dode link.
 */

let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/core/cash/connect',
}))

function makeAccount(overrides: Partial<TargetAccountOption> = {}): TargetAccountOption {
  return {
    id: 'ba-bezet',
    name: 'Betaalrekening',
    bank_name: 'ING',
    iban_tail: '4321',
    transaction_count: 12,
    oldest_transaction_date: '2026-01-05',
    newest_transaction_date: '2026-07-20',
    budget_tracking: true,
    linked_provider_name: 'Rabobank',
    fetch_plan: { mode: 'incremental', start_date: '2026-07-17' },
    ...overrides,
  }
}

/** Routeert de twee fetches die deze pagina doet; alles anders is een fout. */
function stubFetch(accounts: TargetAccountOption[] | 'error') {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/bank-connect/providers')) {
      return { ok: true, json: async () => [] } as unknown as Response
    }
    if (url.includes('/api/bank-connect/accounts')) {
      return accounts === 'error'
        ? ({ ok: false, status: 500, json: async () => ({ error: 'x' }) } as unknown as Response)
        : ({ ok: true, json: async () => ({ accounts }) } as unknown as Response)
    }
    throw new Error(`onverwachte fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Koppelwizard — drager bezet', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('error=drager_bezet&drager=ba-bezet')
  })

  it('noemt de bezettende bank en biedt de uitweg naar die rekening', async () => {
    stubFetch([makeAccount()])

    render(<ConnectBankPage />)

    // Verbijzonderde melding, exact de tekst van `occupiedTargetAccountMessage`.
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Deze rekening is al gekoppeld aan Rabobank.'),
    )
    expect(screen.getByRole('alert').textContent).toContain('Verbreek die koppeling eerst bij de rekening')

    // Echte uitweg, niet alleen een instructie: dezelfde bestemming die de
    // uitgeschakelde optie in de keuzelijst al aanbood.
    const exit = screen.getByRole('link', {
      name: /deze rekening om de koppeling te verbreken/i,
    }) as HTMLAnchorElement
    expect(exit.getAttribute('href')).toBe('/core/assets/cash/ba-bezet')
    expect(exit.getAttribute('target')).toBe('_blank')
    // Raakteldoel: dit was een kale tekstlink.
    expect(exit.className).toContain('min-h-[44px]')
    // Wél de aanwijsbare uitweg, niet ook nog de generieke ernaast.
    expect(
      screen.queryByRole('link', { name: /Ga naar je rekeningen om die koppeling te verbreken/i }),
    ).toBeNull()
  })

  it('valt terug op de generieke tekst én de generieke uitweg als de drager niet in de lijst staat', async () => {
    // De kandidatenlijst filtert op `isEligibleTargetAccount`: een drager wiens
    // cash-bezit gedeactiveerd is (SC-13) valt eruit. Tot fase 7 stond hier
    // "verbreek die eerst bij de rekening" zónder pad — over een rekening die
    // nergens te vinden was.
    stubFetch([makeAccount({ id: 'ba-andere' })])

    render(<ConnectBankPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/kon aan geen enkele rekening gekoppeld worden/i),
    )
    // Geen halve melding met een lege plek waar de banknaam hoort…
    expect(screen.getByRole('alert').textContent).not.toMatch(/al gekoppeld aan/i)
    // …geen link naar een id dat we niet als eigen rekening hebben herkend…
    expect(screen.queryByRole('link', { name: /deze rekening om de koppeling te verbreken/i })).toBeNull()
    // …maar wél de generieke uitweg, met exact de tekst en bestemming van de
    // success-pagina. Eén tekst per uitweg.
    const exit = (await screen.findByRole('link', {
      name: /Ga naar je rekeningen om die koppeling te verbreken/i,
    })) as HTMLAnchorElement
    expect(exit.getAttribute('href')).toBe('/overzicht/bezittingen/cash')
  })

  it('vertrouwt ?drager= alleen als die rekening ook echt bezet is', async () => {
    // `?drager=` is gebruikersinvoer. Een gedeelde link naar een eigen VRIJE
    // rekening leverde anders "Deze rekening is al gekoppeld aan …. Verbreek die
    // koppeling eerst" — een onware melding die naar het verbreken van een
    // werkende koppeling duwt. `linked_provider_name === null` = vrij.
    stubFetch([makeAccount({ linked_provider_name: null })])

    render(<ConnectBankPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/kon aan geen enkele rekening gekoppeld worden/i),
    )
    // En dus ook geen pad naar díe rekening: alleen de generieke uitweg.
    expect(screen.queryByRole('link', { name: /deze rekening om de koppeling te verbreken/i })).toBeNull()
    expect(
      await screen.findByRole('link', { name: /Ga naar je rekeningen om die koppeling te verbreken/i }),
    ).toBeTruthy()

    // Ná het verwerken van de lijst: geen van beide verbijzonderde teksten uit
    // `occupiedTargetAccountMessage` — niet de variant mét banknaam en niet de
    // val-terug-variant zonder. Die zouden hier over een VRIJE rekening gaan.
    const melding = screen.getByRole('alert').textContent ?? ''
    expect(melding).not.toMatch(/al gekoppeld aan/i)
    expect(melding).not.toMatch(/Deze rekening draagt al een bankkoppeling/i)
  })

  it('valt terug op de generieke tekst als de lijst niet laadt', async () => {
    stubFetch('error')

    render(<ConnectBankPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/kon aan geen enkele rekening gekoppeld worden/i),
    )
    expect(screen.queryByRole('link', { name: /deze rekening om de koppeling te verbreken/i })).toBeNull()
    // Een mislukte leesronde is óók "klaar met zoeken": dan hoort de generieke
    // uitweg er te staan, niet niets.
    expect(
      await screen.findByRole('link', { name: /Ga naar je rekeningen om die koppeling te verbreken/i }),
    ).toBeTruthy()
  })

  it('houdt de drie stappen met hun bestaande labels (R3 — geen stap erbij of eraf)', async () => {
    stubFetch([makeAccount()])

    render(<ConnectBankPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Kies bank')).toBeTruthy()
    expect(screen.getByText('Rekening & bevestigen')).toBeTruthy()
    expect(screen.getByText('Autoriseer')).toBeTruthy()
  })
})

describe('Koppelwizard — overige URL-fouten', () => {
  it('toont bij geen_koppeling de generieke tekst mét de generieke uitweg', async () => {
    mockSearchParams = new URLSearchParams('error=geen_koppeling')
    stubFetch([makeAccount()])

    render(<ConnectBankPage />)

    expect(screen.getByRole('alert').textContent).toMatch(/kon aan geen enkele rekening gekoppeld worden/i)
    // Welke rekening het was, weet de callback hier per definitie niet — dus geen
    // pad naar één rekening, maar wél een pad naar de lijst.
    expect(screen.queryByRole('link', { name: /deze rekening om de koppeling te verbreken/i })).toBeNull()
    expect(
      screen.getByRole('link', { name: /Ga naar je rekeningen om die koppeling te verbreken/i }),
    ).toBeTruthy()
    // En géén onnodige leesronde: zonder `drager` blijft de lijst ongelezen tot
    // de gebruiker een bank kiest.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('/api/bank-connect/accounts')),
      ).toBe(false),
    )
  })

  it('toont bij drager_bezet ZONDER drager-parameter ook de generieke uitweg', async () => {
    // Er is dan niets te resolven: geen id om in de kandidatenlijst te zoeken. Dat
    // mag geen melding zonder uitweg opleveren — de callback kan deze vorm sturen.
    mockSearchParams = new URLSearchParams('error=drager_bezet')
    stubFetch([makeAccount()])

    render(<ConnectBankPage />)

    expect(screen.getByRole('alert').textContent).toMatch(/kon aan geen enkele rekening gekoppeld worden/i)
    expect(
      screen.getByRole('link', { name: /Ga naar je rekeningen om die koppeling te verbreken/i }),
    ).toBeTruthy()
    // En géén onnodige leesronde: zonder `drager` is er niets op te zoeken.
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c: unknown[]) => String(c[0]).includes('/api/bank-connect/accounts')),
      ).toBe(false),
    )
  })

  it('toont geen melding zonder error-parameter', () => {
    stubFetch([makeAccount()])

    render(<ConnectBankPage />)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
