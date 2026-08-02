import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import type { Asset } from '@/lib/asset-data'

/**
 * Bewijst — via de DOORGEGEVEN update-payload, niet door de broncode te lezen —
 * dat `AssetForm` het rekeningnummer van een cash-bezitting niet stil wist nu
 * de lijst-lezingen `account_number` niet meer meesturen.
 *
 * Waarom dit het echte regressierisico van de kolom-versmalling is: elke lijst
 * die deze vorm voedt (perspectief-loader, core-/assets-/horizon-loader,
 * categoriepagina) vraagt sinds die wijziging `ASSET_CLIENT_COLUMNS` op, en
 * daar staat `account_number` bewust NIET in — `public.assets` heeft een
 * huishoud-gedeelde SELECT-policy, dus een brede lezing zou het plaintext IBAN
 * van de PARTNER meesturen. De `asset`-prop mist die sleutel dus. Zou de vorm
 * `undefined` als "leeg" lezen, dan schreef de eerstvolgende save
 * `account_number: null` en was het nummer weg.
 *
 * Het contract dat hier vastligt:
 *   1. de vorm haalt het nummer zelf op (één rij, één kolom) en schrijft het
 *      ongewijzigd terug;
 *   2. zolang die fetch niet terug is, LAAT de payload de kolom weg — geen
 *      sleutel, dus de database houdt zijn waarde;
 *   3. wat de gebruiker zelf typt wint altijd.
 *
 * Harness gespiegeld op components/core/deepenings/verhuurrendement-tab.test.tsx:
 * een chainbare Proxy-mock die elke query-methode + argumenten per tabel logt.
 * `embedded` + `onActionsChange` geeft ons een programmatische `save()` zonder
 * de hele overlay/footer te hoeven mounten.
 */

type QueryCall = { table: string; method: string; args: unknown[] }

let queryLog: QueryCall[] = []
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

afterEach(() => {
  cleanup()
  queryLog = []
  ibanResponse = { mode: 'resolved', value: null }
})

describe('AssetForm — rekeningnummer overleeft een lijstrij zonder account_number', () => {
  it('schrijft het bestaande IBAN ongewijzigd terug nadat het is nageladen', async () => {
    ibanResponse = { mode: 'resolved', value: 'NL01BANK0000000001' }
    queryLog = []
    const getActions = renderForm()

    // De vorm haalt het nummer zelf op — één rij, één kolom.
    await waitFor(() => {
      expect(
        queryLog.some(
          (q) => q.table === 'assets' && q.method === 'select' && q.args[0] === 'account_number',
        ),
      ).toBe(true)
    })
    await waitFor(() => expect(getActions()).toBeTruthy())

    getActions()!.save()

    await waitFor(() => expect(laatsteAssetUpdate()).toBeTruthy())
    expect(laatsteAssetUpdate()).toHaveProperty('account_number', 'NL01BANK0000000001')
  })

  it('laat account_number VOLLEDIG uit de payload zolang het nummer onbekend is', async () => {
    ibanResponse = { mode: 'pending' }
    queryLog = []
    const getActions = renderForm()

    await waitFor(() => expect(getActions()).toBeTruthy())
    getActions()!.save()

    await waitFor(() => expect(laatsteAssetUpdate()).toBeTruthy())
    // Niet "is null" maar "sleutel ontbreekt": een `account_number: null` in de
    // payload zou de kolom in de database leegschrijven.
    expect(laatsteAssetUpdate()).not.toHaveProperty('account_number')
  })

  it('respecteert een leeggemaakt veld: bekend-en-leeg schrijft wél null', async () => {
    ibanResponse = { mode: 'resolved', value: null }
    queryLog = []
    const getActions = renderForm()

    await waitFor(() =>
      expect(
        queryLog.some(
          (q) => q.table === 'assets' && q.method === 'select' && q.args[0] === 'account_number',
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(getActions()).toBeTruthy())
    getActions()!.save()

    await waitFor(() => expect(laatsteAssetUpdate()).toBeTruthy())
    expect(laatsteAssetUpdate()).toHaveProperty('account_number', null)
  })
})
