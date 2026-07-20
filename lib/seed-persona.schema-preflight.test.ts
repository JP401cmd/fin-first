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

/** Minimale fake die alleen `.from(t).select(...).limit(0)` ondersteunt. */
function makeClient(errorByTable: Record<string, ProbeError>): SupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
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
})
