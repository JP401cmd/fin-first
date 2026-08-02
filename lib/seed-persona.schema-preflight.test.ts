/**
 * Regressie voor de seed fail-safe (infra-S1 uit de UAT-run 17 jul): de seed wist
 * eerst álle data en faalde daarna op een ontbrekende kolom (schema-drift),
 * waardoor het account leeg-maar-niet-hersteld achterbleef. `assertSeedSchema`
 * valideert het schema VÓÓR de wipe en gooit `SeedSchemaError` bij drift, zodat de
 * route de destructieve wipe kan overslaan.
 */

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertSeedSchema, SeedSchemaError } from './seed-persona'
import { PERSONAS } from './test-personas'

type ProbeError = { code?: string; message?: string } | null

/** Minimale fake die `.from(t).select(cols).limit(0)` ondersteunt en de geprobede kolommen vastlegt. */
function makeClient(
  errorByTable: Record<string, ProbeError>,
  captured?: Record<string, string>,
): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (captured) captured[table] = cols
          return {
            limit() {
              return Promise.resolve({ error: errorByTable[table] ?? null, data: [] })
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

const persona = PERSONAS.compleet

describe('assertSeedSchema · fail-safe vóór de destructieve wipe', () => {
  it('resolveert wanneer alle geschreven kolommen bestaan', async () => {
    const client = makeClient({}) // geen fouten op enige tabel
    await expect(assertSeedSchema(client, 'user-1', persona)).resolves.toBeUndefined()
  })

  it('gooit SeedSchemaError (met kolomnaam) bij een 42703 "does not exist"-melding', async () => {
    const client = makeClient({
      assets: { code: '42703', message: 'column assets.annual_dividend does not exist' },
    })
    await expect(assertSeedSchema(client, 'user-1', persona)).rejects.toMatchObject({
      name: 'SeedSchemaError',
      table: 'assets',
      column: 'annual_dividend',
    })
  })

  it('herkent ook de PostgREST schema-cache-melding ("Could not find the \'x\' column")', async () => {
    const client = makeClient({
      assets: { message: "Could not find the 'annual_dividend' column of 'assets' in the schema cache" },
    })
    await expect(assertSeedSchema(client, 'user-1', persona)).rejects.toBeInstanceOf(SeedSchemaError)
  })

  it('dekt BEIDE assets-producers: de assets-probe bevat óók de cash-asset-only kolommen (review-H1)', async () => {
    const captured: Record<string, string> = {}
    await assertSeedSchema(makeClient({}, captured), 'user-1', persona)
    // Kolommen die alleen de cash-asset-producer (buildSeedCashAssetRow) schrijft,
    // niet buildSeedAssetRow — de eerste post-wipe insert. Deze MOETEN geprobed zijn.
    //
    // `account_number` stond hier tot de kolom-drop-voorbereiding bij; die schrijft
    // de cash-producer niet meer (zie de test hieronder).
    for (const col of ['ownership', 'net_worth_inclusion_pct', 'has_budget_tracking']) {
      expect(captured.assets).toContain(col)
    }
    // En de tweede debts-writer (linked_asset_id-update).
    expect(captured.debts).toContain('linked_asset_id')
  })

  it('probet de PLAINTEXT account_number niet meer — de seed schrijft die kolom niet', async () => {
    const captured: Record<string, string> = {}
    await assertSeedSchema(makeClient({}, captured), 'user-1', persona)

    // De probe is per constructie de kolomset die de seed gaat SCHRIJVEN (hij komt
    // uit dezelfde builders). Staat `account_number` er niet in, dan schrijft de
    // seed 'm ook niet — en dat is precies wat het droppen van die kolom vrijgeeft.
    //
    // Op losse namen toetsen en niet met `toContain`: `account_number_encrypted`
    // draagt `account_number` als substring, dus een substring-assertie zou in een
    // omgeving mét encryptiesleutels stil altijd slagen en nooit meer bijten —
    // precies de val waar deze test eerder in zat.
    const probed = captured.assets.split(',').map((c) => c.trim())
    expect(probed).not.toContain('account_number')
  })
})
