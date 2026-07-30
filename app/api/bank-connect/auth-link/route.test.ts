import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/bank-connect/auth-link — de start van een koppelpoging, en sinds
 * fase 4 de grens waar de gekozen doelrekening binnenkomt.
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. **Een client-geleverd rekening-id is geen waarheid.** Andermans of een
 *     onbekende `target_bank_account_id` levert 400 en er wordt géén pending-rij
 *     aangemaakt die naar een vreemde rekening verwijst. Dat is de RLS-relevante
 *     rand: de SELECT-policy op `bank_accounts` laat huishoud-gedeelde
 *     partnerrijen door, dus RLS is hier geen vangnet.
 *  2. **Achterwaartse compatibiliteit.** Een body zonder keuze blijft geldig en
 *     levert een pending-rij zonder voorkeur — precies het gedrag van vóór fase 4.
 *  3. **Het state-formaat blijft** `${connectionId}:${userPrefix}-${timestamp}`
 *     (regressie-eis R2). De keuze reist via een kolom, niet via de state.
 *  4. **B2:** het voorgevinkte budget-vinkje zet budgetteren aan via de ENE
 *     schrijver (`setBudgetTracking`), en alleen op een rekening die de budgetten
 *     nog niet volgt.
 *  5. **FR5 (fase 6):** een rekening die al een ACTIEVE koppeling draagt levert
 *     409 — een eigen status mét uitweg, niet dezelfde 400 als "bestaat niet" —
 *     en er ontstaat géén pending-rij. Een ZACHT ontkoppelde rij bezet niets: dat
 *     is precies het reconnect-pad.
 *  6. **Het HERSTELPAD (fase 7, B6):** met `relink_connection_account_id` is de
 *     intentie een gevolg, geen invoer. De server leidt `target_bank_account_id`
 *     af uit de koppelrij en schrijft `link_intent: 'herautoriseren'`; de client
 *     kan geen andere doelrekening naast die intentie zetten. Twee randen die
 *     precies omgekeerd zijn aan het wizardpad: de eigen koppeling bezet haar
 *     eigen rekening níet (anders altijd 409), en een gedeactiveerd cash-bezit is
 *     hier géén afwijzingsgrond (dat is SC-13, de reden dat dit pad bestaat).
 */

const { mockCreateClient, mockBuildAuthLink, mockIsEnabled, mockSetBudgetTracking } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockBuildAuthLink: vi.fn(),
  mockIsEnabled: vi.fn(),
  mockSetBudgetTracking: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/truelayer/client', () => ({ buildAuthLink: mockBuildAuthLink }))
vi.mock('@/lib/truelayer/feature-flag', () => ({ isTrueLayerEnabled: mockIsEnabled }))
vi.mock('@/lib/crypto/field-encryption', () => ({ encryptField: (v: string) => `enc:${v}` }))
vi.mock('@/lib/budget-tracking', () => ({
  setBudgetTracking: (...args: unknown[]) => mockSetBudgetTracking(...args),
}))

import { POST } from './route'

const USER = '550e8400-e29b-41d4-a716-446655440000'
const PARTNER = 'user-2'
const OWN_ACCOUNT = '11111111-1111-4111-8111-111111111111'
const PARTNER_ACCOUNT = '22222222-2222-4222-8222-222222222222'
const UNKNOWN_ACCOUNT = '33333333-3333-4333-8333-333333333333'
const NO_BUDGET_ACCOUNT = '44444444-4444-4444-8444-444444444444'
const DEAD_ASSET_ACCOUNT = '55555555-5555-4555-8555-555555555555'
/** Draagt al een ACTIEVE koppeling (FR5). */
const OCCUPIED_ACCOUNT = '66666666-6666-4666-8666-666666666666'
/** Draagt alleen een ZACHT ontkoppelde rij — die bezet niets. */
const SOFT_RELEASED_ACCOUNT = '77777777-7777-4777-8777-777777777777'
/** De drager van de koppeling die op het herstelpad hersteld wordt. */
const RELINK_ACCOUNT = '88888888-8888-4888-8888-888888888888'

// ── Herstelpad-fixtures (fase 7). Uuid's, want ze reizen door het zod-schema. ──
/** Actieve koppeling op RELINK_ACCOUNT — bezet alleen haar eigen rekening. */
const RELINK_LINK = '99999999-9999-4999-8999-999999999999'
/** Koppeling op een rekening waarvan het cash-bezit is gedeactiveerd (SC-13). */
const RELINK_LINK_DEAD_ASSET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
/** Koppeling zonder drager: de aanmaak van de rekening mislukte destijds. */
const RELINK_LINK_NO_CARRIER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
/** Koppeling van de PARTNER — mag hier niets opleveren. */
const RELINK_LINK_FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
/** Bestaat niet. */
const RELINK_LINK_UNKNOWN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
/**
 * Zacht ontkoppelde koppeling van bank A op OCCUPIED_ACCOUNT, waar bank B
 * (`link-1`, Rabobank) inmiddels actief op zit — het bereikbare fase-6-pad:
 * A op X → verbreken → B op X → A herverbinden.
 */
const RELINK_LINK_BLOCKED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
/**
 * Koppeling waarvan de verbinding geen leesbare bank meer heeft. Draagt bewust een
 * EIGEN rekening: zou ze op RELINK_ACCOUNT staan, dan zou ze in de FR5-lezing als
 * tweede actieve koppeling meekomen en het gezonde herstelpad hierboven een 409
 * geven — een fixture die een ándere test stil sloopt.
 */
const RELINK_LINK_NO_PROVIDER = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const NO_PROVIDER_ACCOUNT = '12121212-1212-4121-8121-121212121212'

type BankAccountRow = {
  id: string
  user_id: string
  name: string
  bank_name: string | null
  iban: string | null
  is_active: boolean
  linked_asset_id: string | null
}
type AssetRow = { id: string; user_id: string; is_active: boolean; has_budget_tracking: boolean | null }
type LinkRow = {
  id: string
  user_id: string
  bank_account_id: string | null
  is_active: boolean
  provider_name: string | null
  /**
   * `bank_connections.provider_id` van de verbinding waar deze koppeling bij
   * hoort. Sinds fase 7 leest `resolveRelinkCarrier` die mee: op het herstelpad
   * komt de bank van de SERVER en niet uit de body, zodat een oppervlak dat alleen
   * de koppeling kent (de rekeningkaart op cashflow) kan herstellen zonder eigen
   * leesronde. `null` = de pathologische rij zonder bank.
   */
  provider_id: string | null
}

const BANK_ACCOUNTS: BankAccountRow[] = [
  { id: OWN_ACCOUNT, user_id: USER, name: 'Betaalrekening', bank_name: 'ING', iban: 'NL91ABNA0417164300', is_active: true, linked_asset_id: 'asset-1' },
  { id: PARTNER_ACCOUNT, user_id: PARTNER, name: 'Gedeelde rekening', bank_name: 'ING', iban: null, is_active: true, linked_asset_id: null },
  // Budgetteren uit: companion gedeactiveerd, bezitting leeft nog (B2-geval).
  { id: NO_BUDGET_ACCOUNT, user_id: USER, name: 'Zonder budgetteren', bank_name: null, iban: null, is_active: false, linked_asset_id: 'asset-2' },
  // Bezitting gedeactiveerd → geen geldige doelrekening.
  { id: DEAD_ASSET_ACCOUNT, user_id: USER, name: 'Verwijderd bezit', bank_name: null, iban: null, is_active: false, linked_asset_id: 'asset-3' },
  { id: OCCUPIED_ACCOUNT, user_id: USER, name: 'Al gekoppeld', bank_name: 'ING', iban: null, is_active: true, linked_asset_id: 'asset-4' },
  { id: SOFT_RELEASED_ACCOUNT, user_id: USER, name: 'Zacht ontkoppeld', bank_name: 'ING', iban: null, is_active: true, linked_asset_id: 'asset-5' },
  { id: RELINK_ACCOUNT, user_id: USER, name: 'Herstelrekening', bank_name: 'ING', iban: null, is_active: true, linked_asset_id: 'asset-6' },
  { id: NO_PROVIDER_ACCOUNT, user_id: USER, name: 'Bank onbekend', bank_name: null, iban: null, is_active: true, linked_asset_id: 'asset-7' },
]

const ASSETS: AssetRow[] = [
  { id: 'asset-1', user_id: USER, is_active: true, has_budget_tracking: true },
  { id: 'asset-2', user_id: USER, is_active: true, has_budget_tracking: false },
  { id: 'asset-3', user_id: USER, is_active: false, has_budget_tracking: true },
  { id: 'asset-4', user_id: USER, is_active: true, has_budget_tracking: true },
  { id: 'asset-5', user_id: USER, is_active: true, has_budget_tracking: true },
  { id: 'asset-6', user_id: USER, is_active: true, has_budget_tracking: true },
  { id: 'asset-7', user_id: USER, is_active: true, has_budget_tracking: true },
]

const LINKS: LinkRow[] = [
  { id: 'link-1', user_id: USER, bank_account_id: OCCUPIED_ACCOUNT, is_active: true, provider_name: 'Rabobank', provider_id: 'ob-rabo' },
  { id: 'link-2', user_id: USER, bank_account_id: SOFT_RELEASED_ACCOUNT, is_active: false, provider_name: 'Rabobank', provider_id: 'ob-rabo' },
  // Pathologisch: een koppeling van MIJ op een PARTNERrekening. Sinds de
  // guard-trigger van fase 6 onmogelijk te maken, maar precies de rij die de
  // ordening 400-vóór-409 op de proef stelt (zie de test hieronder).
  { id: 'link-3', user_id: USER, bank_account_id: PARTNER_ACCOUNT, is_active: true, provider_name: 'Rabobank', provider_id: 'ob-rabo' },
  // ── Herstelpad (fase 7) ──
  { id: RELINK_LINK, user_id: USER, bank_account_id: RELINK_ACCOUNT, is_active: true, provider_name: 'ING', provider_id: 'ob-ing' },
  { id: RELINK_LINK_DEAD_ASSET, user_id: USER, bank_account_id: DEAD_ASSET_ACCOUNT, is_active: true, provider_name: 'ING', provider_id: 'ob-ing' },
  { id: RELINK_LINK_NO_CARRIER, user_id: USER, bank_account_id: null, is_active: true, provider_name: 'ING', provider_id: 'ob-ing' },
  { id: RELINK_LINK_FOREIGN, user_id: PARTNER, bank_account_id: PARTNER_ACCOUNT, is_active: true, provider_name: 'ING', provider_id: 'ob-ing' },
  { id: RELINK_LINK_BLOCKED, user_id: USER, bank_account_id: OCCUPIED_ACCOUNT, is_active: false, provider_name: 'ING', provider_id: 'ob-ing' },
  // Verbinding zonder leesbare bank: de val-terug-400 van het herstelpad.
  { id: RELINK_LINK_NO_PROVIDER, user_id: USER, bank_account_id: NO_PROVIDER_ACCOUNT, is_active: true, provider_name: null, provider_id: null },
]

/** Elke rij die naar `bank_connections` is geschreven. */
let insertedConnections: Record<string, unknown>[] = []

function makeSupabase(opts: { user?: string | null } = {}) {
  const user = opts.user === undefined ? USER : opts.user

  function builder(table: string) {
    const eqs: Record<string, unknown> = {}
    const neqs: Record<string, unknown> = {}
    let payload: Record<string, unknown> | null = null

    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.neq = (col: string, val: unknown) => { neqs[col] = val; return b }
    b.limit = () => b
    b.insert = (row: Record<string, unknown>) => {
      payload = row
      if (table === 'bank_connections') insertedConnections.push(row)
      return b
    }
    b.maybeSingle = () => Promise.resolve(resolve())
    b.single = () => Promise.resolve(resolve())

    function resolve(): { data: unknown; error: unknown } {
      if (payload) return { data: { id: 'conn-1' }, error: null }

      const source: Record<string, unknown>[] =
        table === 'bank_accounts' ? BANK_ACCOUNTS
        : table === 'assets' ? ASSETS
        : table === 'bank_connection_accounts' ? LINKS
        : []
      const match = source.find((row) =>
        Object.entries(eqs).every(([col, val]) => row[col] === val) &&
        Object.entries(neqs).every(([col, val]) => row[col] !== val),
      )
      if (!match) return { data: null, error: null }
      if (table === 'bank_connection_accounts') {
        return {
          data: {
            id: match.id,
            bank_account_id: match.bank_account_id,
            bank_connections: {
              provider_id: match.provider_id,
              provider_name: match.provider_name,
              provider_logo: null,
            },
          },
          error: null,
        }
      }
      return { data: match, error: null }
    }

    return b
  }

  return {
    auth: { getUser: () => Promise.resolve({ data: { user: user ? { id: user } : null } }) },
    from: (table: string) => builder(table),
  }
}

function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

beforeEach(() => {
  insertedConnections = []
  mockCreateClient.mockReset().mockResolvedValue(makeSupabase())
  mockBuildAuthLink.mockReset().mockResolvedValue('https://auth.truelayer.com/?state=x')
  mockIsEnabled.mockReset().mockResolvedValue(true)
  mockSetBudgetTracking.mockReset().mockResolvedValue({ ok: true, asset: { id: 'asset-2', has_budget_tracking: true, name: 'Zonder budgetteren' }, budgetingActive: true })
})

describe('POST /api/bank-connect/auth-link — guards', () => {
  it('401 zonder sessie, vóór body-validatie', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase({ user: null }))

    const res = await POST(postRequest({}))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Niet ingelogd')
    expect(insertedConnections).toHaveLength(0)
  })

  it('400 zonder provider_id (zod-whitelist), geen pending-rij', async () => {
    const res = await POST(postRequest({}))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('validation_error')
    expect(insertedConnections).toHaveLength(0)
  })

  it('400 bij een niet-uuid doelrekening', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: 'geen-uuid' }))

    expect(res.status).toBe(400)
    expect(insertedConnections).toHaveLength(0)
  })
})

describe('POST /api/bank-connect/auth-link — doelrekening: eigenaarschap is de grens', () => {
  it("400 op andermans rekening, en géén pending-rij met vreemde verwijzing", async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: PARTNER_ACCOUNT }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Deze rekening bestaat niet of is niet van jou')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('400 op een onbekende rekening, met exact dezelfde melding (geen existentie-orakel)', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: UNKNOWN_ACCOUNT }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Deze rekening bestaat niet of is niet van jou')
    expect(insertedConnections).toHaveLength(0)
  })

  it('400 op een rekening waarvan het cash-bezit is gedeactiveerd', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: DEAD_ASSET_ACCOUNT }))

    expect(res.status).toBe(400)
    expect(insertedConnections).toHaveLength(0)
  })

  it('eigen rekening → de keuze staat op de pending-rij, mét link_intent nieuw', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', provider_name: 'ING', target_bank_account_id: OWN_ACCOUNT }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ auth_url: 'https://auth.truelayer.com/?state=x' })
    expect(insertedConnections).toHaveLength(1)
    expect(insertedConnections[0]).toMatchObject({
      user_id: USER,
      provider_id: 'ing',
      provider_name: 'ING',
      status: 'pending',
      target_bank_account_id: OWN_ACCOUNT,
      link_intent: 'nieuw',
    })
  })
})

describe('POST /api/bank-connect/auth-link — FR5: één actieve koppeling per rekening', () => {
  it('409 mét uitweg op een rekening die al een actieve koppeling draagt, géén pending-rij', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: OCCUPIED_ACCOUNT }))
    const body = await res.json()

    // Een eigen status, want dit is géén "bestaat niet": de gebruiker kan deze
    // toestand zelf opheffen, dus de melding noemt de bank én de uitweg.
    expect(res.status).toBe(409)
    expect(body.error).toContain('Rabobank')
    expect(body.error).toContain('Verbreek')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('een BEZETTE PARTNERrekening levert 400, nooit de 409 met banknaam (ordening is de control)', async () => {
    // Het kruispunt van de twee afwijzingen: de bezet-toets draait ná de
    // eigenaarschapstoets, dus de 409 beschrijft altijd een eigen rekening. Zou
    // iemand de bezet-query ooit "voor de snelheid" parallel aan de
    // eigenaarschapslezing zetten, dan wordt de 409 een existentie-orakel op
    // andermans id's — en breekt deze test.
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: PARTNER_ACCOUNT }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Deze rekening bestaat niet of is niet van jou')
    expect(body.error).not.toContain('Rabobank')
    expect(insertedConnections).toHaveLength(0)
  })

  it('een ZACHT ontkoppelde rij bezet niets — dat is het reconnect-pad', async () => {
    const res = await POST(postRequest({ provider_id: 'ing', target_bank_account_id: SOFT_RELEASED_ACCOUNT }))

    expect(res.status).toBe(200)
    expect(insertedConnections[0]).toMatchObject({ target_bank_account_id: SOFT_RELEASED_ACCOUNT })
  })
})

describe('POST /api/bank-connect/auth-link — herstelpad (fase 7, B6)', () => {
  it('de doelrekening komt van de SERVER: uit de koppelrij, met link_intent herautoriseren', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      provider_name: 'ING',
      relink_connection_account_id: RELINK_LINK,
    }))

    expect(res.status).toBe(200)
    expect(insertedConnections).toHaveLength(1)
    expect(insertedConnections[0]).toMatchObject({
      user_id: USER,
      status: 'pending',
      link_intent: 'herautoriseren',
      // De body noemde RELINK_ACCOUNT nooit — hij is afgeleid uit
      // `bank_connection_accounts.bank_account_id` van de genoemde koppeling.
      target_bank_account_id: RELINK_ACCOUNT,
    })
  })

  it('géén 409 doordat de eigen koppeling haar eigen rekening niet bezet', async () => {
    // Zonder `exceptConnectionAccountId` zou dit pad ALTIJD een 409 geven: de
    // rekening is per definitie bezet door precies de koppeling die we
    // herautoriseren. Dit is de assertie die dat mechanisme pint.
    const res = await POST(postRequest({ provider_id: 'ing', relink_connection_account_id: RELINK_LINK }))

    expect(res.status).toBe(200)
    expect(insertedConnections).toHaveLength(1)
  })

  it('een ÁNDERE actieve koppeling op de drager → 409 met de gedeelde uitweg-tekst', async () => {
    // Het bereikbare fase-6-pad: bank A op X → verbreken → bank B op X → A
    // herverbinden. Op de callback botst schakel 1 daar op de partiële unieke
    // index; deze 409 voorspelt die botsing vóórdat de gebruiker naar zijn bank
    // vertrekt en met een lege koppeling terugkomt.
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK_BLOCKED,
    }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('Rabobank')
    expect(body.error).toContain('Verbreek')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('SC-13: een gedeactiveerd cash-bezit is hier GÉÉN afwijzingsgrond', async () => {
    // Op het wizardpad weigert `isEligibleTargetAccount` deze rekening (zie de test
    // hierboven met DEAD_ASSET_ACCOUNT als `target_bank_account_id`). Op het
    // herstelpad moet ze juist door: de backfill in de callback reactiveert het
    // bezit, en zonder dat pad blijft de rekening voor altijd onzichtbaar. Deze
    // asymmetrie is bewust — verdwijnt ze, dan is SC-13 onherstelbaar.
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK_DEAD_ASSET,
    }))

    expect(res.status).toBe(200)
    expect(insertedConnections[0]).toMatchObject({
      link_intent: 'herautoriseren',
      target_bank_account_id: DEAD_ASSET_ACCOUNT,
    })
  })

  it('andermans koppeling → 400 met de vaste tekst, geen pending-rij', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK_FOREIGN,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Deze koppeling bestaat niet of is niet van jou')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('onbekende koppeling → 400 met exact dezelfde tekst (geen existentie-orakel)', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK_UNKNOWN,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Deze koppeling bestaat niet of is niet van jou')
    expect(insertedConnections).toHaveLength(0)
  })

  it('koppeling zonder drager → 400, want er is niets te herstellen', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK_NO_CARRIER,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('geen rekening om te herstellen')
    expect(insertedConnections).toHaveLength(0)
  })

  it('beide velden samen → 400: twee bronnen voor één beslissing', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK,
      target_bank_account_id: OWN_ACCOUNT,
    }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('validation_error')
    expect(insertedConnections).toHaveLength(0)
  })

  it('werkt ZONDER provider_id in de body — de bank komt uit de koppeling', async () => {
    // Dit is wat de rekeningkaart op cashflow kan sturen: die kent alleen de
    // koppeling, niet de bank. Eist deze route ooit weer een `provider_id`, dan
    // heeft dat oppervlak een eigen leesronde nodig op een provider-kolom die de
    // server al heeft — precies het pad dat fase 7 dichtzet.
    const res = await POST(postRequest({ relink_connection_account_id: RELINK_LINK }))

    expect(res.status).toBe(200)
    expect(insertedConnections[0]).toMatchObject({
      provider_id: 'ob-ing',
      provider_name: 'ING',
      link_intent: 'herautoriseren',
      target_bank_account_id: RELINK_ACCOUNT,
    })
    expect(mockBuildAuthLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      'ob-ing',
    )
  })

  it('een provider_id in de body wordt OVERRULED door die van de koppeling', async () => {
    // Anders kon een client een herautorisatie van koppeling X naar een ándere
    // bank richten: de pending-rij zou die bank dragen, terwijl schakel 1 van de
    // callback de rekening op `external_account_id` terugclaimt voor de
    // oorspronkelijke bank.
    const res = await POST(postRequest({
      provider_id: 'ob-een-andere-bank',
      provider_name: 'Een andere bank',
      relink_connection_account_id: RELINK_LINK,
    }))

    expect(res.status).toBe(200)
    expect(insertedConnections[0]).toMatchObject({ provider_id: 'ob-ing', provider_name: 'ING' })
    expect(mockBuildAuthLink.mock.calls[0][3]).toBe('ob-ing')
  })

  it('een koppeling zonder leesbare bank → 400, geen halve autorisatie-URL', async () => {
    const res = await POST(postRequest({ relink_connection_account_id: RELINK_LINK_NO_PROVIDER }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('niet meer te zien bij welke bank')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('op het WIZARDpad blijft provider_id verplicht (daar is de body de enige bron)', async () => {
    const res = await POST(postRequest({ target_bank_account_id: OWN_ACCOUNT }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('validation_error')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })

  it('het budget-vinkje doet hier niets (geen wizardstap, besluit B2)', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      relink_connection_account_id: RELINK_LINK,
      enable_budget_tracking: true,
    }))

    expect(res.status).toBe(200)
    expect(mockSetBudgetTracking).not.toHaveBeenCalled()
  })

  it('het state-formaat blijft ongewijzigd, ook op dit pad (R2)', async () => {
    await POST(postRequest({ provider_id: 'ing', relink_connection_account_id: RELINK_LINK }))

    const [, , fullState] = mockBuildAuthLink.mock.calls[0] as [unknown, string, string, string]
    expect(fullState.split(':')[0]).toBe('conn-1')
    expect(fullState.split(':')[1]).toMatch(/^550e8400-\d+$/)
    expect(fullState).not.toContain(RELINK_LINK)
    expect(fullState).not.toContain(RELINK_ACCOUNT)
  })
})

describe('POST /api/bank-connect/auth-link — zonder keuze blijft geldig (achterwaarts compatibel)', () => {
  it('body met alleen provider_id → pending-rij zonder voorkeur', async () => {
    const res = await POST(postRequest({ provider_id: 'ing' }))

    expect(res.status).toBe(200)
    expect(insertedConnections[0]).toMatchObject({
      target_bank_account_id: null,
      link_intent: 'nieuw',
      provider_name: 'ing',
    })
  })

  it('onbekende velden worden gestript, niet doorgegeven aan de insert', async () => {
    await POST(postRequest({ provider_id: 'ing', status: 'active', user_id: PARTNER, access_token_encrypted: 'nope' }))

    expect(insertedConnections[0].status).toBe('pending')
    expect(insertedConnections[0].user_id).toBe(USER)
    expect(insertedConnections[0].access_token_encrypted).toBe('enc:')
  })
})

describe('POST /api/bank-connect/auth-link — state-formaat (R2)', () => {
  it('state blijft ${connectionId}:${userPrefix}-${timestamp}', async () => {
    await POST(postRequest({ provider_id: 'ing', target_bank_account_id: OWN_ACCOUNT }))

    const [, redirectUri, fullState, providerId] = mockBuildAuthLink.mock.calls[0] as [unknown, string, string, string]
    expect(providerId).toBe('ing')
    expect(redirectUri.endsWith('/api/bank-connect/callback')).toBe(true)
    expect(fullState.split(':')[0]).toBe('conn-1')
    expect(fullState.split(':')[1]).toMatch(/^550e8400-\d+$/)
    // De doelrekening reist NIET mee in de state.
    expect(fullState).not.toContain(OWN_ACCOUNT)
  })
})

describe('POST /api/bank-connect/auth-link — B2: budgetteren meenemen', () => {
  it('zet budgetteren aan via de ene schrijver, op het cash-bezit achter de rekening', async () => {
    const res = await POST(postRequest({
      provider_id: 'ing',
      target_bank_account_id: NO_BUDGET_ACCOUNT,
      enable_budget_tracking: true,
    }))

    expect(res.status).toBe(200)
    expect(mockSetBudgetTracking).toHaveBeenCalledTimes(1)
    const [, userId, assetId, enabled] = mockSetBudgetTracking.mock.calls[0] as [unknown, string, string, boolean]
    expect(userId).toBe(USER)
    expect(assetId).toBe('asset-2')
    expect(enabled).toBe(true)
  })

  it('vinkje uit → niets aan de budgetteringsas', async () => {
    await POST(postRequest({
      provider_id: 'ing',
      target_bank_account_id: NO_BUDGET_ACCOUNT,
      enable_budget_tracking: false,
    }))

    expect(mockSetBudgetTracking).not.toHaveBeenCalled()
    expect(insertedConnections).toHaveLength(1)
  })

  it('rekening die de budgetten al volgt blijft ongemoeid, ook mét vinkje', async () => {
    await POST(postRequest({
      provider_id: 'ing',
      target_bank_account_id: OWN_ACCOUNT,
      enable_budget_tracking: true,
    }))

    expect(mockSetBudgetTracking).not.toHaveBeenCalled()
  })

  it('mislukt de budget-write, dan ontstaat er géén halve koppelpoging', async () => {
    mockSetBudgetTracking.mockResolvedValue({ ok: false, error: { message: 'db down' } })

    const res = await POST(postRequest({
      provider_id: 'ing',
      target_bank_account_id: NO_BUDGET_ACCOUNT,
      enable_budget_tracking: true,
    }))

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('db down')
    expect(insertedConnections).toHaveLength(0)
    expect(mockBuildAuthLink).not.toHaveBeenCalled()
  })
})
