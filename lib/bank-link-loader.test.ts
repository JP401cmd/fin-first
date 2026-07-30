import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCashBankLinksUncached } from './bank-link-loader'

/**
 * DE SERVER-LOADER voor de koppelstatus per cash-rekening (fase 7).
 *
 * Wat hier gepind wordt is de *afleiding zoals de loader haar samenstelt* — niet
 * de regels van `deriveBankLinkState` (die hebben hun eigen suite). Deze suite
 * bewaakt de drie dingen die alleen hier kunnen misgaan:
 *
 *  1. de **query-scope**: alleen eigen rijen, alleen ACTIEVE koppelingen. Die
 *     laatste is regel 1+2 van de afleiding samengevouwen in de query — dus als
 *     iemand `.eq('is_active', true)` weghaalt moet een zacht ontkoppelde
 *     rekening onmiddellijk verkeerd uitkomen;
 *  2. de **volledigheid**: rekeningen ZONDER koppeling komen óók terug, als
 *     `manual`. `cash-account-view` moet "handmatig" kunnen onderscheiden van
 *     "nog niet geladen";
 *  3. de **val-terug bij falen**: een lege lijst, en dus nooit een onterecht
 *     "verbinding kwijt" op een rekening die het prima doet.
 *
 * Getest wordt de UNCACHED variant: `loadCashBankLinks` is dezelfde functie met
 * een React `cache()`-wrapper eromheen, en die dedupt op client-identiteit —
 * irrelevant voor de afleiding en verwarrend in een test.
 */

type AccountRow = { id: string; user_id: string; linked_asset_id: string | null }

type ConnectionEmbed = {
  provider_name: string | null
  status: string | null
  token_expires_at: string | null
}

type LinkRow = {
  id: string
  user_id: string
  bank_account_id: string | null
  is_active: boolean
  last_synced_at: string | null
  connection: ConnectionEmbed | null
}

/**
 * Piepkleine Supabase-stub die de filters écht toepast (zelfde aanpak als
 * `lib/truelayer/target-account.test.ts`): alleen zo bewijst een test
 * scope-gedrag in plaats van aanroepvolgorde.
 *
 * `embedAsArray` bootst na dat PostgREST een to-one-embed soms als array levert
 * (afhankelijk van de relatie-inferentie) — de `one()`-helper in de loader bestaat
 * precies daarvoor en moet ook die vorm aankunnen.
 */
function makeSupabase(fixture: {
  userId?: string | null
  accounts?: AccountRow[]
  links?: LinkRow[]
  accountsError?: boolean
  linksError?: boolean
  embedAsArray?: boolean
}) {
  function builder(table: string) {
    const eqs: Record<string, unknown> = {}
    const notNull: string[] = []

    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.order = () => b
    b.limit = () => b
    b.not = (col: string, op: string, val: unknown) => {
      if (op !== 'is' || val !== null) throw new Error(`stub kent .not(${col}, ${op}, ...) niet`)
      notNull.push(col)
      return b
    }

    function result() {
      if (table === 'bank_accounts') {
        if (fixture.accountsError) {
          return { data: null, error: { message: 'bank_accounts down' } }
        }
        const rows = (fixture.accounts ?? [])
          .filter((r) => Object.entries(eqs).every(([col, val]) => (r as unknown as Record<string, unknown>)[col] === val))
          .map((r) => ({ id: r.id, linked_asset_id: r.linked_asset_id }))
        return { data: rows, error: null }
      }
      if (table === 'bank_connection_accounts') {
        if (fixture.linksError) {
          return { data: null, error: { message: 'links down' } }
        }
        const rows = (fixture.links ?? [])
          .filter((r) => Object.entries(eqs).every(([col, val]) => (r as unknown as Record<string, unknown>)[col] === val))
          .filter((r) => notNull.every((col) => (r as unknown as Record<string, unknown>)[col] != null))
          .map((r) => ({
            id: r.id,
            bank_account_id: r.bank_account_id,
            last_synced_at: r.last_synced_at,
            bank_connections: fixture.embedAsArray
              ? (r.connection ? [r.connection] : [])
              : r.connection,
          }))
        return { data: rows, error: null }
      }
      throw new Error(`stub kent tabel ${table} niet`)
    }

    b.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled)
    return b
  }

  return {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: fixture.userId === null ? null : { id: fixture.userId ?? USER } },
        }),
    },
    from: (table: string) => builder(table),
  } as unknown as SupabaseClient
}

const USER = 'user-1'
const PARTNER = 'user-2'

const HEALTHY: ConnectionEmbed = {
  provider_name: 'ING',
  status: 'active',
  // Ruim in de toekomst: buiten elke expiratie-tak.
  token_expires_at: '2099-01-01T00:00:00.000Z',
}

function account(id: string, assetId: string | null = `asset-${id}`, userId = USER): AccountRow {
  return { id, user_id: userId, linked_asset_id: assetId }
}

function link(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    id: 'link-1',
    user_id: USER,
    bank_account_id: 'acc-1',
    is_active: true,
    last_synced_at: null,
    connection: HEALTHY,
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadCashBankLinks — een gezonde koppeling', () => {
  it('levert linked mét de sleutel die de herstelactie nodig heeft', async () => {
    const supabase = makeSupabase({ accounts: [account('acc-1')], links: [link()] })

    const result = await loadCashBankLinksUncached(supabase)

    expect(result).toEqual([
      {
        bankAccountId: 'acc-1',
        assetId: 'asset-acc-1',
        state: 'linked',
        // `auth-link` leidt de doelrekening hieruit af in plaats van 'm van de
        // client aan te nemen — zonder dit id is de herstelactie onmogelijk.
        connectionAccountId: 'link-1',
        providerName: 'ING',
      },
    ])
  })

  it('leest de bank ook wanneer PostgREST de embed als array levert', async () => {
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link()],
      embedAsArray: true,
    })

    const [row] = await loadCashBankLinksUncached(supabase)

    expect(row.state).toBe('linked')
    expect(row.providerName).toBe('ING')
  })
})

describe('loadCashBankLinks — verbinding kwijt', () => {
  it('een actieve koppeling op een EXPIRED verbinding is linked-broken', async () => {
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link({ connection: { ...HEALTHY, status: 'expired' } })],
    })

    const [row] = await loadCashBankLinksUncached(supabase)

    expect(row.state).toBe('linked-broken')
    // De sleutel blijft mee reizen: juist híer is de herstelactie nodig.
    expect(row.connectionAccountId).toBe('link-1')
    expect(row.providerName).toBe('ING')
  })

  it('een VERSTREKEN autorisatie is linked-broken, ook als de status nog active zegt', async () => {
    // Nodig náást de statuscontrole: `status` wordt pas op `expired` gezet door
    // een mislukte token-refresh, en die draait alleen als er iemand
    // synchroniseert. Tot dat moment is de datum het enige eerlijke signaal.
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [
        link({
          connection: { ...HEALTHY, status: 'active', token_expires_at: '2020-01-01T00:00:00.000Z' },
        }),
      ],
    })

    const [row] = await loadCashBankLinksUncached(supabase)

    expect(row.state).toBe('linked-broken')
  })
})

describe('loadCashBankLinks — handmatig', () => {
  it('een rekening zonder koppelrij komt terug als manual, zonder sleutel', async () => {
    const supabase = makeSupabase({ accounts: [account('acc-1')], links: [] })

    expect(await loadCashBankLinksUncached(supabase)).toEqual([
      {
        bankAccountId: 'acc-1',
        assetId: 'asset-acc-1',
        state: 'manual',
        connectionAccountId: null,
        providerName: null,
      },
    ])
  })

  it('een ZACHT ontkoppelde rekening is manual, niet linked-broken', async () => {
    // `is_active = false` is gebruikersintentie, geen storing: de gebruiker
    // verbrak de koppeling zelf en hoeft niets te herstellen. De rij blijft
    // staan zodat een latere reconnect haar hergebruikt.
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link({ is_active: false, connection: { ...HEALTHY, status: 'expired' } })],
    })

    const [row] = await loadCashBankLinksUncached(supabase)

    expect(row.state).toBe('manual')
    expect(row.connectionAccountId).toBeNull()
    expect(row.providerName).toBeNull()
  })

  it('de koppeling van een ander huishoudlid maakt mijn rekening niet gekoppeld', async () => {
    // `bank_accounts` en `bank_connection_accounts` zijn own-row; het expliciete
    // `user_id`-filter houdt die eis leesbaar naast de tabellen waar RLS bréder is.
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link({ user_id: PARTNER })],
    })

    expect((await loadCashBankLinksUncached(supabase))[0].state).toBe('manual')
  })
})

describe('loadCashBankLinks — randen', () => {
  it('een rekening zonder cash-bezit levert assetId null (maar blijft in het antwoord)', async () => {
    const supabase = makeSupabase({ accounts: [account('acc-1', null)], links: [link()] })

    const [row] = await loadCashBankLinksUncached(supabase)

    // De kaarten op cashflow itereren op bezittingen en vinden deze rij dus niet;
    // `cash-account-view` zoekt op bankAccountId en vindt haar wél.
    expect(row.assetId).toBeNull()
    expect(row.bankAccountId).toBe('acc-1')
    expect(row.state).toBe('linked')
  })

  it('een gefaalde leesronde levert een LEGE lijst — geen onterecht "verbinding kwijt"', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link()],
      linksError: true,
    })

    // Bewust geen throw: de koppelstatus is een verrijking op de kaarten, geen
    // voorwaarde om de cashflow-pagina te kunnen tonen. Het symbool verdwijnt,
    // en de rekening wordt niet kapot verklaard op grond van onze eigen storing.
    expect(await loadCashBankLinksUncached(supabase)).toEqual([])
    expect(logged).toHaveBeenCalled()
  })

  it('ook een gefaalde rekening-query levert een lege lijst', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ accounts: [account('acc-1')], accountsError: true })

    expect(await loadCashBankLinksUncached(supabase)).toEqual([])
  })

  it('zonder ingelogde gebruiker wordt er niets gelezen', async () => {
    const supabase = makeSupabase({ userId: null, accounts: [account('acc-1')], links: [link()] })

    expect(await loadCashBankLinksUncached(supabase)).toEqual([])
  })

  it('een koppelrij zonder drager hoort bij geen enkele rekening', async () => {
    const supabase = makeSupabase({
      accounts: [account('acc-1')],
      links: [link({ bank_account_id: null })],
    })

    expect((await loadCashBankLinksUncached(supabase))[0].state).toBe('manual')
  })
})
