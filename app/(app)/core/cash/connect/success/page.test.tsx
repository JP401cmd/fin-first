import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ConnectSuccessPage from './page'

/**
 * Tests voor de success-pagina — specifiek de band bij `?geblokkeerd=<n>`
 * (specs/bank-connect-doelrekening/plan.md, fase 7; het tweede restpunt uit
 * fase 6).
 *
 * Een gedeeltelijk geslaagde consent was tot nu toe ALLEEN in de serverlog te
 * zien: de gebruiker zag een succespagina met minder rekeningen dan hij bij zijn
 * bank had aangevinkt, zonder uitleg. Wat hier gepind wordt is dat de band er is,
 * dat hij een uitweg biedt, en dat hij níet verschijnt op een waarde die geen
 * geldig aantal is — een querystring is gebruikersinvoer.
 */

let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/core/cash/connect/success',
}))

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
  // Geen gekoppelde rekeningen: deze tests gaan over de band, niet over de lijst.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accounts: [] }) }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const BAND = /kon niet worden gekoppeld|konden niet worden gekoppeld/i

describe('Success-pagina — geblokkeerde rekeningen', () => {
  it('meldt één geblokkeerde rekening in enkelvoud, mét uitweg', async () => {
    mockSearchParams = new URLSearchParams('geblokkeerd=1')

    render(<ConnectSuccessPage />)

    const band = await screen.findByRole('status')
    expect(band.textContent).toMatch(/Eén rekening uit deze koppeling kon niet worden gekoppeld/i)
    expect(band.textContent).toMatch(/draagt al een andere bankkoppeling/i)

    const exit = screen.getByRole('link', { name: /koppeling te verbreken/i }) as HTMLAnchorElement
    expect(exit.getAttribute('href')).toBe('/overzicht/cashflow')
    // Raakteldoel (het was een kale tekstlink); en dezelfde link die de wizard
    // gebruikt zodra hij de bezette rekening niet kan aanwijzen.
    expect(exit.className).toContain('min-h-[44px]')
  })

  it('zet de bandtekst op inkt, niet op text-warning (AA op --warning-bg)', async () => {
    mockSearchParams = new URLSearchParams('geblokkeerd=2')

    const { container } = render(<ConnectSuccessPage />)

    const band = await screen.findByRole('status')
    // `text-warning` op `--warning-bg` haalt 4,48:1 en blijft onder AA voor
    // 12px-tekst; de tint hoort in rand, vlak en icoon.
    const tekstDragers = [band, ...Array.from(band.querySelectorAll('*'))]
      .filter((el) => /(?:^|\s)text-warning(?:$|\s)/.test(el.getAttribute('class') ?? ''))
      .filter((el) => (el.textContent ?? '').trim().length > 0)
    expect(tekstDragers).toEqual([])
    expect(container.innerHTML).toContain('bg-warning-bg')
    // De tint zit wél op het icoon.
    expect(band.querySelector('svg')?.getAttribute('class')).toContain('text-warning')
  })

  it('meldt meerdere geblokkeerde rekeningen in meervoud', async () => {
    mockSearchParams = new URLSearchParams('geblokkeerd=3')

    render(<ConnectSuccessPage />)

    const band = await screen.findByRole('status')
    expect(band.textContent).toMatch(/3 rekeningen uit deze koppeling konden niet worden gekoppeld/i)
  })

  it('zwijgt zonder parameter', async () => {
    render(<ConnectSuccessPage />)

    await waitFor(() => expect(screen.getByText(/Bank/)).toBeTruthy())
    expect(screen.queryByText(BAND)).toBeNull()
  })

  it('zwijgt bij een niet-numerieke of niet-positieve waarde', async () => {
    for (const raw of ['abc', '0', '-2', '2.5', '', ' 3']) {
      mockSearchParams = new URLSearchParams(`geblokkeerd=${raw}`)
      const { unmount } = render(<ConnectSuccessPage />)

      expect(screen.queryByText(BAND)).toBeNull()
      unmount()
    }
  })
})

/**
 * Fase 8 — de saldomelding. Besluit 3: geen blokkerende dialoog vóór het
 * overschrijven, maar een melding erna die zegt wat er is gebeurd. Het bedrag is
 * een SERVER-feit uit `linked-accounts` (de callback schrijft het saldo vóórdat
 * deze pagina laadt en heeft dus geen respons om op mee te liften).
 */
function linkedAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    account_name: 'Betaalrekening',
    iban_tail: '4300',
    provider_name: 'ING',
    provider_logo: null,
    provider_id: 'ob-ing',
    health: { state: 'linked', daysUntilExpiry: 80, expiringSoon: false, lastSyncedAt: null },
    bank_account_id: 'ba-1',
    carrier_name: 'Hoofdrekening',
    carrier_iban_tail: '6789',
    last_synced_at: null,
    balance_change: null,
    ...overrides,
  }
}

function stubLinkedAccounts(account: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accounts: [account] }) }),
  )
}

describe('Success-pagina — saldo overgenomen (fase 8)', () => {
  it('meldt de overname met de van- en naar-waarde', async () => {
    stubLinkedAccounts(linkedAccount({ balance_change: { previous: 1000, current: 2543.67 } }))

    render(<ConnectSuccessPage />)

    const melding = await screen.findByText(/Saldo overgenomen van de bank/i)
    expect(melding.textContent).toContain('1.000,00')
    expect(melding.textContent).toContain('2.543,67')
    // Waarom het getal niet uit de lucht komt vallen: het staat vanaf nu in de
    // herwaarderingshistorie en beweegt mee in het verloop van het vermogen.
    expect(melding.textContent).toMatch(/vermogenshistorie/i)
  })

  it('zwijgt wanneer er niets is overgenomen', async () => {
    stubLinkedAccounts(linkedAccount())

    render(<ConnectSuccessPage />)

    await screen.findByText(/Hoofdrekening/)
    expect(screen.queryByText(/Saldo overgenomen van de bank/i)).toBeNull()
  })

  it('gebruikt geen stoplichtkleur — een geslaagde overname is geen aandacht en geen fout', async () => {
    stubLinkedAccounts(linkedAccount({ balance_change: { previous: 1000, current: 2543.67 } }))

    render(<ConnectSuccessPage />)

    const melding = await screen.findByText(/Saldo overgenomen van de bank/i)
    const regel = melding.closest('p')
    const klassen = [regel, ...Array.from(regel?.querySelectorAll('*') ?? [])]
      .map((el) => el?.getAttribute('class') ?? '')
      .join(' ')
    expect(klassen).not.toMatch(/text-warning|text-negative|text-positive/)
  })
})
