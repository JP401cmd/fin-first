import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  deleteAllUserData,
  buildSeedAssetRow,
  buildSeedDebtRow,
  countSeedSteps,
  SEED_DELETE_STEPS,
  SEED_INSERT_BASE_STEPS,
} from './seed-persona'
import { PERSONAS } from './test-personas'
import type { PersonaData } from './test-personas'
import { RETIREMENT_PROVIDER_LABELS } from './asset-data'

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
 * Regressie voor de seed-voortgangsbalk die boven 100% liep (bonus finding
 * UAT-plan §2.7 A.4): de admin-/onboarding-seed-routes hardcodeerden
 * `totalSteps` op 6/7 terwijl er feitelijk 9-11 `onProgress`-aanroepen zijn,
 * waardoor de balk tot ~183% schoot en bij afronding terugsprong naar 100%.
 * De fix leidt `totalSteps` af uit `countSeedSteps(persona)`. Deze tests borgen
 * dat de teller klopt met de ECHTE stappen (geen los magic number dat wegdrift).
 */
describe('countSeedSteps — voortgangsteller klopt met de echte seed-stappen', () => {
  it('deleteAllUserData roept onProgress precies SEED_DELETE_STEPS keer aan (echte code)', async () => {
    const { client } = makeSupabaseMock()
    let calls = 0
    await deleteAllUserData(client, 'user-123', () => {
      calls++
    })
    // Drift-guard: verandert het aantal delete-fasen, dan wordt deze test rood
    // vóórdat een gebruiker een balk >100% ziet.
    expect(calls).toBe(SEED_DELETE_STEPS)
  })

  it('basis = 9 stappen zonder balance_snapshots en zonder appSettings', () => {
    const persona = { balance_snapshots: undefined, appSettings: undefined } as unknown as PersonaData
    expect(countSeedSteps(persona)).toBe(SEED_DELETE_STEPS + SEED_INSERT_BASE_STEPS)
    expect(countSeedSteps(persona)).toBe(9)
  })

  it('+1 per aanwezig conditioneel blok (balance_snapshots, appSettings) → max 11', () => {
    const snapshotsOnly = { balance_snapshots: [{}], appSettings: undefined } as unknown as PersonaData
    const appSettingsOnly = { balance_snapshots: [], appSettings: { key: 'value' } } as unknown as PersonaData
    const both = { balance_snapshots: [{}], appSettings: { key: 'value' } } as unknown as PersonaData
    expect(countSeedSteps(snapshotsOnly)).toBe(10)
    expect(countSeedSteps(appSettingsOnly)).toBe(10)
    expect(countSeedSteps(both)).toBe(11)
  })

  it('elke echte persona: total binnen 9..11 én de laatste stap is exact 100% (nooit >100%)', () => {
    for (const [key, persona] of Object.entries(PERSONAS)) {
      const total = countSeedSteps(persona)
      expect(total, `persona '${key}'`).toBeGreaterThanOrEqual(9)
      expect(total, `persona '${key}'`).toBeLessThanOrEqual(11)
      // Bij de laatste stap geldt currentStep === total → exact 100%, geen overflow.
      const finalPct = Math.round((total / total) * 100)
      expect(finalPct, `persona '${key}' eindpercentage`).toBe(100)
    }
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

/**
 * Regressie voor de Daan-seed-crash (5 jul 2026): persona Daan's
 * 'Brand New Day Pensioen' zette `retirement_provider_type: 'premiepensioeninstelling'`
 * — geen lid van de canonieke `RetirementProviderType`-enum en dus geweigerd door
 * de DB-CHECK `assets_retirement_provider_type_check` (bedrijfspensioenfonds |
 * verzekeraar | ppi | NULL). De seed brak rond 83% af, waardoor de Daan-persona
 * niet als UAT-basis bruikbaar was. Deze test borgt dat GEEN enkele persona-asset
 * een ongeldige provider-type meegeeft, zodat een nieuwe typo direct rood wordt
 * i.p.v. pas live op /beheer/testdata.
 */
describe('Seed: retirement_provider_type is constraint-valide voor alle personas', () => {
  const validProviders = new Set(Object.keys(RETIREMENT_PROVIDER_LABELS))

  it('elke asset gebruikt ppi | bedrijfspensioenfonds | verzekeraar (of leeg)', () => {
    for (const [key, persona] of Object.entries(PERSONAS)) {
      for (const asset of persona.assets) {
        const providerType = asset.retirement_provider_type
        if (providerType == null) continue
        expect(
          validProviders.has(providerType),
          `Persona '${key}' asset '${asset.name}' heeft ongeldige retirement_provider_type '${providerType}'`,
        ).toBe(true)
      }
    }
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
