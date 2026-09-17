import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { seedPersonaData } from './seed-persona'
import { PERSONAS } from './test-personas'
import { AI_CONSENT_VERSION } from './ai/privacy-facts'

/**
 * De AI-toestemmingsstempel is opt-in (ADR 0155, security-gate 17 sep 2026).
 *
 * `seedPersonaData` vult niet alleen testaccounts: `/api/check/activate` seedt het
 * account van een échte gebruiker die vanuit de Vrijheidscheck converteert, en
 * `/api/onboarding/seed` staat open voor elke ingelogde gebruiker zonder afgeronde
 * onboarding. Een ongevraagde stempel legt daar een toestemming vast die niemand
 * gaf (append-only bewijs) én onderdrukt de keuze-overlay die haar alsnog vraagt.
 */

type Schrijf = { table: string; op: string; payload: unknown }

function makeRecordingClient() {
  const writes: Schrijf[] = []
  let seq = 0
  const withIds = (payload: unknown) =>
    (Array.isArray(payload) ? payload : [payload]).map((r) => ({
      id: `id-${++seq}`,
      ...(r as Record<string, unknown>),
    }))

  const client = {
    from(table: string) {
      let data: unknown[] = []
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      for (const m of ['select', 'eq', 'in', 'like', 'order', 'limit', 'is', 'neq', 'match', 'delete']) {
        builder[m] = chain
      }
      for (const op of ['insert', 'upsert', 'update']) {
        builder[op] = (payload: unknown) => {
          writes.push({ table, op, payload })
          data = withIds(payload)
          return builder
        }
      }
      builder.single = () => Promise.resolve({ data: data[0] ?? null, error: null })
      builder.maybeSingle = builder.single
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, writes }
}

const profielSchrijf = (writes: Schrijf[]) =>
  writes.find((w) => w.table === 'profiles' && w.op === 'upsert')?.payload as Record<string, unknown>

describe('seedPersonaData — AI-toestemming alleen op verzoek', () => {
  it('standaard: geen ai_*-velden op het profiel en geen consent_events-rij', async () => {
    const { client, writes } = makeRecordingClient()
    const summary = await seedPersonaData(client, 'user-echt', PERSONAS.compleet, () => {})

    const profiel = profielSchrijf(writes)
    expect(profiel).toBeDefined()
    expect(profiel).not.toHaveProperty('ai_enabled')
    expect(profiel).not.toHaveProperty('ai_consent_at')
    expect(profiel).not.toHaveProperty('ai_consent_version')
    expect(writes.some((w) => w.table === 'consent_events')).toBe(false)
    expect(summary).not.toHaveProperty('consent_events')
  })

  it('stampAiConsent: stempel op het profiel én één granted-event met bron seed', async () => {
    const { client, writes } = makeRecordingClient()
    const summary = await seedPersonaData(client, 'user-test', PERSONAS.compleet, () => {}, {
      stampAiConsent: true,
    })

    const profiel = profielSchrijf(writes)
    expect(profiel.ai_enabled).toBe(true)
    expect(typeof profiel.ai_consent_at).toBe('string')
    expect(profiel.ai_consent_version).toBe(AI_CONSENT_VERSION)

    const events = writes.filter((w) => w.table === 'consent_events')
    expect(events).toHaveLength(1)
    expect(events[0].payload).toMatchObject({
      user_id: 'user-test',
      kind: 'ai_cloud',
      decision: 'granted',
      version: AI_CONSENT_VERSION,
      source: 'seed',
    })
    expect(summary.consent_events).toBe(1)
  })
})
