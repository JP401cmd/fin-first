import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteAllUserData, buildSeedAssetRow, buildSeedDebtRow } from './seed-persona'
import { PERSONAS } from './test-personas'

/**
 * Borgt dat de wipe-laag NIET stilzwijgend doorgaat wanneer een tabel-delete
 * faalt (bug 13 jul 2026): op het echte jpsmit-account bleven persona-
 * bankrekeningen en -transacties staan doordat delete-fouten alleen als
 * console.warn werden gelogd, waarna de seed er vrolijk bovenop inserte.
 * Elke consumer van deleteAllUserData (onboarding-reset, persona-seeds,
 * account-delete) rekent erop dat "gewist" ook écht gewist betekent —
 * een gefaalde delete moet de hele operatie hard laten stoppen.
 */

type MockResult = { count: number | null; error: { message: string } | null; data?: unknown[] }

function makeSupabaseMock(failTables: string[] = []) {
  const deletedTables: string[] = []
  const client = {
    from(table: string) {
      const result: MockResult = failTables.includes(table)
        ? { count: null, error: { message: `mock-fout op ${table}` }, data: [] }
        : { count: 2, error: null, data: [] }
      const terminal = () => {
        deletedTables.push(table)
        return Promise.resolve(result)
      }
      const builder = {
        delete: () => builder,
        select: () => builder,
        eq: terminal,
        in: terminal,
        like: terminal,
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, deletedTables }
}

describe('deleteAllUserData — fail-fast bij delete-fouten', () => {
  it('gooit wanneer een tabel-delete een error teruggeeft (geen stil doorgaan)', async () => {
    const { client } = makeSupabaseMock(['bank_accounts'])
    await expect(deleteAllUserData(client, 'user-123')).rejects.toThrow(/bank_accounts/)
  })

  it('gooit óók wanneer een vroege leaf-tabel faalt (batch vóór de hoofdtabellen)', async () => {
    const { client } = makeSupabaseMock(['transactions'])
    await expect(deleteAllUserData(client, 'user-123')).rejects.toThrow(/transactions/)
  })

  it('gooit óók wanneer de budgets-lookup voor budget_amounts faalt (geen stil "0")', async () => {
    // budget_amounts heeft geen user_id-kolom; de wipe zoekt eerst de
    // budget-ids op. Een gefaalde lookup mag niet als "niets te wissen"
    // gelezen worden — dat zou budget_amounts stil laten staan.
    const { client } = makeSupabaseMock(['budgets'])
    await expect(deleteAllUserData(client, 'user-123')).rejects.toThrow(/budget_amounts/)
  })

  it('resolvet met een summary wanneer alle deletes slagen', async () => {
    const { client, deletedTables } = makeSupabaseMock()
    const summary = await deleteAllUserData(client, 'user-123')
    // Kern-tabellen uit de bug zitten in de wipe én in de summary
    expect(summary).toMatchObject({ bank_accounts: 2, transactions: 2, assets: 2 })
    expect(deletedTables).toContain('bank_accounts')
    expect(deletedTables).toContain('app_settings')
  })

  it('stopt vóór de parent-batch wanneer een eerdere batch faalt (geen halve wipe verder)', async () => {
    const { client, deletedTables } = makeSupabaseMock(['transactions'])
    await deleteAllUserData(client, 'user-123').catch(() => {})
    // transactions zit in batch 2; de parent-batch (batch 3) mag niet meer draaien
    expect(deletedTables).not.toContain('bank_accounts')
    expect(deletedTables).not.toContain('assets')
  })
})

/**
 * Regressie voor het seed-mapping-gat: de tracking-vlaggen voor de
 * Hypotheekplanner-app (`has_woonbalans_tracking` op de eigen_huis-asset en
 * `has_hypotheekplanner_tracking` op de mortgage-schuld) werden bij het seeden
 * niet weggeschreven, ondanks dat de persona ze op `true` zet. Gevolg: de
 * equity-/woonbalans-band rendert leeg tot handmatige DB-activatie
 * (hypotheekplanner-tab.tsx filtert op `... === true`).
 *
 * Borgt het datapad via de ECHTE seed-transforms (`buildSeedAssetRow` /
 * `buildSeedDebtRow`) — geen her-implementatie die kan wegdriften. Spiegelt de
 * Box2-deelneming-regressietest (WF-BELAST-13) in box2-data.test.ts.
 */
describe('Seed: has_woonbalans_tracking wordt naar de assets-rij geseed', () => {
  const woning = PERSONAS.compleet.assets.find(
    (a) => a.asset_type === 'eigen_huis' && a.has_woonbalans_tracking === true,
  )

  it('de compleet-persona (Tessa) heeft een eigen_huis-asset met woonbalans-tracking aan', () => {
    expect(woning).toBeDefined()
    expect(woning!.has_woonbalans_tracking).toBe(true)
  })

  it('buildSeedAssetRow mapt has_woonbalans_tracking naar de insert-rij (was NULL/leeg)', () => {
    const row = buildSeedAssetRow(woning!, 'user-test', 0) as {
      has_woonbalans_tracking: boolean
    }
    expect(row.has_woonbalans_tracking).toBe(true)
  })

  it('een asset zonder de vlag seedt expliciet false (kolom blijft aanwezig)', () => {
    const zonder = PERSONAS.compleet.assets.find(
      (a) => a.has_woonbalans_tracking === undefined,
    )
    expect(zonder).toBeDefined()
    const row = buildSeedAssetRow(zonder!, 'user-test', 1) as {
      has_woonbalans_tracking: boolean
    }
    expect(row.has_woonbalans_tracking).toBe(false)
  })
})

describe('Seed: has_hypotheekplanner_tracking wordt naar de debts-rij geseed', () => {
  const hypotheek = PERSONAS.compleet.debts.find(
    (d) => d.debt_type === 'mortgage' && d.has_hypotheekplanner_tracking === true,
  )

  it('de compleet-persona (Tessa) heeft een mortgage-schuld met planner-tracking aan', () => {
    expect(hypotheek).toBeDefined()
    expect(hypotheek!.has_hypotheekplanner_tracking).toBe(true)
  })

  it('buildSeedDebtRow mapt has_hypotheekplanner_tracking naar de insert-rij (was NULL/leeg)', () => {
    const row = buildSeedDebtRow(hypotheek!, 'user-test', 0) as {
      has_hypotheekplanner_tracking: boolean
    }
    expect(row.has_hypotheekplanner_tracking).toBe(true)
  })

  it('een schuld zonder de vlag seedt expliciet false (kolom blijft aanwezig)', () => {
    const zonder = PERSONAS.compleet.debts.find(
      (d) => d.has_hypotheekplanner_tracking === undefined,
    )
    expect(zonder).toBeDefined()
    const row = buildSeedDebtRow(zonder!, 'user-test', 1) as {
      has_hypotheekplanner_tracking: boolean
    }
    expect(row.has_hypotheekplanner_tracking).toBe(false)
  })
})
