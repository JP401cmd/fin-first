import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ASSET_CLIENT_COLUMNS } from '@/lib/asset-data'

/**
 * Bewijst — via een DOORGEGEVEN query-observatie, niet door de broncode te
 * lezen — dat `VerhuurrendementTab` de `assets`-tabel bevraagt met exact
 * `ASSET_CLIENT_COLUMNS` en nooit met `select('*')`. `public.assets` heeft
 * een huishoud-gedeelde SELECT-policy: een `select('*')` levert bij een
 * gedeelde bezitting ook `account_number_hash`/`account_number_encrypted`/
 * `account_number` van de PARTNER naar de browser. Zie lib/asset-data.ts
 * (ASSET_CLIENT_COLUMNS-doc-comment) en lib/asset-data.test.ts (kolomcontract).
 *
 * Harness gespiegeld op components/app/cash-account-view.test.tsx (31 jul):
 * een chainbare Proxy-mock van de supabase-client die elke query-methode +
 * argumenten per tabel logt in `queryLog`.
 *
 * Component-keuze: `VerhuurrendementTab` (i.p.v. de andere vijf omgezette
 * clientlezers) omdat het bij een LEGE assets/debts-respons meteen naar
 * `NoTrackedItemsState` valt — geen van de zware kind-componenten
 * (RentalROICard, CashflowChart, VacancyTimeline, …) hoeft dus gemount te
 * worden. De enige externe hook (`useIsAppSetupCompleted`, zelf ook een
 * `assets`-lezer met een ANDERE kolomlijst) wordt gestubd zodat de
 * queryLog uitsluitend de aanroep van de tab zelf bevat.
 */

type QueryCall = { table: string; method: string; args: unknown[] }
let queryLog: QueryCall[] = []

function makeSupabase() {
  function builder(table: string): Record<string, unknown> {
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return (...args: unknown[]) => {
          queryLog.push({ table, method: prop, args })
          return builder(table)
        }
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

// Bypass de setup-gate ÉN zijn eigen `assets`-query (count-only, andere
// kolomlijst) zodat de queryLog schoon blijft voor de assertie hieronder.
vi.mock('@/components/app/app-setup/use-is-setup-completed', () => ({
  useIsAppSetupCompleted: () => true,
}))

import { VerhuurrendementTab } from './verhuurrendement-tab'

afterEach(() => {
  cleanup()
})

describe('VerhuurrendementTab — assets-kolomcontract (household-gedeelde SELECT-policy)', () => {
  it('bevraagt assets met exact ASSET_CLIENT_COLUMNS, nooit select(\'*\')', async () => {
    queryLog = []
    render(<VerhuurrendementTab type="real_estate" moduleActive />)

    // Lege assets-respons -> component valt door naar NoTrackedItemsState.
    await screen.findByText('Nog niets getrackt')

    const assetSelects = queryLog.filter((q) => q.table === 'assets' && q.method === 'select')
    expect(assetSelects.length).toBeGreaterThan(0)

    const call = assetSelects.find((q) => q.args[0] === ASSET_CLIENT_COLUMNS)
    expect(call, `geen select-aanroep met ASSET_CLIENT_COLUMNS gevonden; gezien: ${JSON.stringify(assetSelects.map((q) => q.args[0]))}`).toBeTruthy()

    for (const q of assetSelects) {
      expect(q.args[0]).not.toBe('*')
      expect(String(q.args[0])).not.toContain('*')
    }
  })
})
