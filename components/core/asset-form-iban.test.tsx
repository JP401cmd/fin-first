import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'

/**
 * Bewijst — via de DOORGEGEVEN payloads, niet door de broncode te lezen — dat
 * `AssetForm` het rekeningnummer van een cash-bezitting correct wegschrijft nu
 * dat niet meer client-side gebeurt maar via `POST /api/assets/account-number`.
 *
 * ## Waarom die route er is
 *
 * De browser kan het drieluik `account_number` / `account_number_encrypted` /
 * `account_number_hash` niet compleet schrijven: versleutelen vraagt server-only
 * sleutels. Zolang deze vorm alleen de plaintext-kolom zette, verouderde de
 * ciphertext bij élke IBAN-bewerking — stil, want `resolveAssetAccountNumber`
 * geeft plaintext voorrang en gaf dus het juiste nummer terug. Precies die drift
 * maakte het laten vallen van de plaintext-kolom gevaarlijk: zonder die kolom zou
 * de app het VÓRIGE nummer tonen.
 *
 * ## Het contract dat hier vastligt
 *
 *   1. `account_number` komt NOOIT meer voor in de client-side update-payload;
 *   2. de route wordt alleen aangeroepen als de GEBRUIKER het IBAN-veld heeft
 *      gewijzigd; de getypte waarde gaat er ongewijzigd heen;
 *   3. een onaangeroerd veld roept de route NIET aan. Dat is de anti-wis-garantie,
 *      en die is breder dan alleen "de nalees-fetch is nog niet terug": de route
 *      schrijft álle drie de kolommen, terwijl dit scherm er maar één van kan
 *      lezen. Een lege plaintext-kolom is dus geen bewijs dat er geen
 *      rekeningnummer is — de auto-link-trigger
 *      (`20260802093000_auto_link_cash_asset_encrypted_iban.sql`) maakt een
 *      bankgekoppelde cash-bezitting aan met UITSLUITEND ciphertext + blinde
 *      index. Zonder deze regel wist een naamswijziging op zo'n bezitting het
 *      versleutelde nummer, waarna de companion zonder IBAN valt en interne
 *      overboekingen als échte inkomst én uitgave gaan meetellen;
 *   4. leegmaken wist wél — dát is een bewuste gebruikersactie;
 *   5. de route gaat VÓÓR `toggle-budget`, want die sync leest het nummer vers uit
 *      de database om de `bank_accounts`-companion te vullen.
 *
 * Harness gespiegeld op components/core/deepenings/verhuurrendement-tab.test.tsx:
 * een chainbare Proxy-mock die elke query-methode + argumenten per tabel logt.
 * `embedded` + `onActionsChange` geeft ons een programmatische `save()` zonder
 * de hele overlay/footer te hoeven mounten.
 */

type QueryCall = { table: string; method: string; args: unknown[] }
type FetchCall = { url: string; body: Record<string, unknown> | null }

let queryLog: QueryCall[] = []
let fetchLog: FetchCall[] = []
/** Wat `select('account_number')` op één rij teruggeeft. `pending` = nooit. */
let ibanResponse: { mode: 'resolved'; value: string | null } | { mode: 'pending' } = {
  mode: 'resolved',
  value: null,
}

function makeSupabase() {
  function builder(table: string): Record<string, unknown> {
    const isIbanLookup = () =>
      table === 'assets' &&
      queryLog.some((q) => q.table === 'assets' && q.method === 'select' && q.args[0] === 'account_number')

    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
      single: async () => ({ data: null, error: null }),
      maybeSingle: () => {
        if (isIbanLookup() && ibanResponse.mode === 'pending') return new Promise(() => {})
        return Promise.resolve({
          data: isIbanLookup() ? { account_number: (ibanResponse as { value: string | null }).value } : null,
          error: null,
        })
      },
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return (...args: unknown[]) => {
          queryLog.push({ table, method: prop, args })
          // `update(...)`/`insert(...)` eindigen op `.eq(...)` → die keten moet
          // awaitable blijven; de Proxy-builder is dat via `then`.
          return builder(table)
        }
      },
    })
  }

  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))
vi.mock('@/components/app/ownership-toggle', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useHouseholdStatus: () => ({ hasHousehold: false, householdId: null }) }
})

import { AssetForm, type AssetEditActionsState } from './assets-client'

/**
 * Een cash-bezitting zoals een LIJST hem levert: `ASSET_CLIENT_COLUMNS`, dus
 * ZONDER de sleutel `account_number`. Bewust via een cast opgebouwd zodat de
 * afwezigheid van die sleutel echt is en niet als `undefined` wordt gezet.
 */
const cashAssetUitLijst = {
  id: 'a1',
  user_id: 'u1',
  name: 'Betaalrekening',
  asset_type: 'cash',
  current_value: 2500,
  purchase_value: 2500,
  institution: 'ING',
  subtype: 'checking',
  is_active: true,
  ownership: 'personal',
  net_worth_inclusion_pct: 100,
  has_budget_tracking: false,
} as unknown as Asset

function renderForm() {
  let actions: AssetEditActionsState | null = null
  render(
    <AssetForm
      embedded
      asset={cashAssetUitLijst}
      linkedBankAccounts={new Map()}
      onClose={() => {}}
      onSaved={() => {}}
      onActionsChange={(s) => {
        actions = s
      }}
    />,
  )
  return () => actions as AssetEditActionsState | null
}

/** De laatste `update(...)`-payload op `assets`. */
function laatsteAssetUpdate(): Record<string, unknown> | undefined {
  const updates = queryLog.filter((q) => q.table === 'assets' && q.method === 'update')
  return updates.at(-1)?.args[0] as Record<string, unknown> | undefined
}

/** Alle aanroepen van de rekeningnummer-route. */
function rekeningnummerAanroepen(): FetchCall[] {
  return fetchLog.filter((f) => f.url.includes('/api/assets/account-number'))
}

/** Wacht tot het formulier klaar is met opslaan (de update is weggeschreven). */
async function saveEnWacht(getActions: () => AssetEditActionsState | null) {
  await waitFor(() => expect(getActions()).toBeTruthy())
  getActions()!.save()
  await waitFor(() => expect(laatsteAssetUpdate()).toBeTruthy())
}

/** Wacht tot de nalees-fetch van het rekeningnummer is gedaan. */
async function wachtOpNalezen() {
  await waitFor(() => {
    expect(
      queryLog.some(
        (q) => q.table === 'assets' && q.method === 'select' && q.args[0] === 'account_number',
      ),
    ).toBe(true)
  })
}

/** Typt in het zichtbare IBAN-veld — de enige manier om "gewijzigd" te worden. */
async function typIban(waarde: string) {
  const veld = await screen.findByPlaceholderText('NL12 INGB 0001 2345 67')
  fireEvent.change(veld, { target: { value: waarde } })
}

/**
 * Ankerpunt voor de negatieve assertions: de companion-sync komt in `handleSave`
 * ná de rekeningnummer-aanroep. Is die er, dan is het moment waarop de route
 * aangeroepen had kúnnen worden aantoonbaar voorbij.
 */
async function wachtOpCompanionSync() {
  await waitFor(() => {
    expect(fetchLog.some((f) => f.url.includes('/api/assets/toggle-budget'))).toBe(true)
  })
}

beforeEach(() => {
  fetchLog = []
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    let body: Record<string, unknown> | null = null
    try {
      body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    } catch {
      body = null
    }
    fetchLog.push({ url, body })
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as unknown as Response
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  queryLog = []
  fetchLog = []
  ibanResponse = { mode: 'resolved', value: null }
})

describe('AssetForm — rekeningnummer gaat via de route, niet via de client-payload', () => {
  it('zet account_number NOOIT meer in de client-side update-payload', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await saveEnWacht(getActions)

    // De browser kan het drieluik niet compleet schrijven; deze kolom hoort dus
    // helemaal niet meer in een client-write voor te komen.
    expect(laatsteAssetUpdate()).not.toHaveProperty('account_number')
    expect(laatsteAssetUpdate()).not.toHaveProperty('account_number_encrypted')
    expect(laatsteAssetUpdate()).not.toHaveProperty('account_number_hash')
  })

  it('stuurt een gewijzigd IBAN ongewijzigd naar de route', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await typIban('NL02BANK0000000002')
    await saveEnWacht(getActions)

    await waitFor(() => expect(rekeningnummerAanroepen()).toHaveLength(1))
    expect(rekeningnummerAanroepen()[0].body).toEqual({ id: 'a1', iban: 'NL02BANK0000000002' })
  })

  it('roept de route NIET aan zolang het nummer onbekend is', async () => {
    ibanResponse = { mode: 'pending' }
    queryLog = []
    const getActions = renderForm()
    await saveEnWacht(getActions)
    await wachtOpCompanionSync()

    // De anti-wis-garantie. Wél aanroepen met `null` zou het bestaande nummer in
    // de database wissen, terwijl de gebruiker niets heeft aangeraakt.
    expect(rekeningnummerAanroepen()).toHaveLength(0)
  })

  it('roept de route NIET aan wanneer de gebruiker het bekende veld ongemoeid laat', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await saveEnWacht(getActions)
    await wachtOpCompanionSync()

    // Niets veranderd = niets te schrijven. Een aanroep zou hier alleen maar de
    // ciphertext opnieuw kunnen laten uiteenlopen met de plaintext.
    expect(rekeningnummerAanroepen()).toHaveLength(0)
  })

  it('wist de ciphertext NIET wanneer de plaintext-kolom leeg is en de gebruiker niets typt', async () => {
    // Dit is de bankgekoppelde cash-bezitting: de auto-link-trigger vult
    // uitsluitend `account_number_encrypted`/`_hash`, dus de nalees-fetch van de
    // PLAINTEXT-kolom komt leeg terug terwijl er wel degelijk een rekeningnummer
    // is. Zou het formulier hier `iban: null` sturen, dan wist de route alle drie
    // de kolommen — inclusief het versleutelde nummer dat dit scherm nooit heeft
    // kunnen tonen, en dat de companion-sync nodig heeft voor de
    // eigen-rekeningherkenning.
    ibanResponse = { mode: 'resolved', value: null }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await saveEnWacht(getActions)
    await wachtOpCompanionSync()

    expect(rekeningnummerAanroepen()).toHaveLength(0)
  })

  it('wist wél wanneer de gebruiker een bestaand nummer leegmaakt', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await typIban('')
    await saveEnWacht(getActions)

    await waitFor(() => expect(rekeningnummerAanroepen()).toHaveLength(1))
    expect(rekeningnummerAanroepen()[0].body).toEqual({ id: 'a1', iban: null })
  })

  it('roept de route aan VÓÓR toggle-budget — de companion leest het nummer vers', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()
    await wachtOpNalezen()
    await typIban('NL02BANK0000000002')
    await saveEnWacht(getActions)

    await waitFor(() => {
      expect(fetchLog.some((f) => f.url.includes('/api/assets/toggle-budget'))).toBe(true)
    })
    const iRekeningnummer = fetchLog.findIndex((f) => f.url.includes('/api/assets/account-number'))
    const iCompanion = fetchLog.findIndex((f) => f.url.includes('/api/assets/toggle-budget'))
    // Omgekeerd zou de companion het VORIGE rekeningnummer meekrijgen.
    expect(iRekeningnummer).toBeGreaterThanOrEqual(0)
    expect(iRekeningnummer).toBeLessThan(iCompanion)
  })
})
