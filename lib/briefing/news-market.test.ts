import { describe, it, expect } from 'vitest'
import { loadTopMarketBriefing } from './news-market'

/**
 * Tests voor de read-only nieuws-cache-lezer. De supabase-call wordt gemockt;
 * we testen de TTL-check, de direct-impact-voorkeur en de category→hefboom-mapping.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(value: unknown): any {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: value == null ? null : { value },
                  error: null,
                }),
              }
            },
          }
        },
      }
    },
  }
}

const now = new Date('2026-05-31T12:00:00Z')
function cache(items: unknown[], generatedAt: string = now.toISOString()) {
  return { items, generatedAt }
}

describe('loadTopMarketBriefing', () => {
  it('kiest het top direct-impact item en maakt een market-entry', async () => {
    const supabase = makeSupabase(
      cache([
        { id: 'n1', headline: 'ECB verhoogt rente', personalImpact: '+€47/mnd hypotheek', impactType: 'direct', category: 'rente' },
        { id: 'n2', headline: 'Iets relevants', personalImpact: '', impactType: 'relevant', category: 'macro' },
      ]),
    )
    const entry = await loadTopMarketBriefing(supabase, 'u', now)
    expect(entry?.category).toBe('market')
    expect(entry?.id).toBe('market:n1')
    expect(entry?.text).toMatch(/ECB verhoogt rente/)
    expect(entry?.text).toMatch(/€47/)
    expect(entry?.hefboom).toBe('schulden') // rente → schulden
    expect(entry?.href).toBe('/berichten')
  })

  it('valt terug op het eerste item als er geen direct-impact is', async () => {
    const supabase = makeSupabase(
      cache([{ id: 'n1', headline: 'Alleen relevant', impactType: 'relevant', category: 'macro' }]),
    )
    const entry = await loadTopMarketBriefing(supabase, 'u', now)
    expect(entry?.id).toBe('market:n1')
    expect(entry?.hefboom).toBeUndefined() // macro → geen hefboom
  })

  it('returnt null bij een verlopen cache (> 7 dagen)', async () => {
    const old = new Date('2026-05-20T12:00:00Z').toISOString() // 11 dagen oud
    const supabase = makeSupabase(
      cache([{ id: 'n1', headline: 'Oud', impactType: 'direct', category: 'macro' }], old),
    )
    expect(await loadTopMarketBriefing(supabase, 'u', now)).toBeNull()
  })

  it('returnt null zonder cache', async () => {
    expect(await loadTopMarketBriefing(makeSupabase(null), 'u', now)).toBeNull()
  })

  it('parst ook een string-value (jsonb opgeslagen als tekst)', async () => {
    const supabase = makeSupabase(
      JSON.stringify(cache([{ id: 'n1', headline: 'String-cache', impactType: 'direct', category: 'beleggingen' }])),
    )
    const entry = await loadTopMarketBriefing(supabase, 'u', now)
    expect(entry?.id).toBe('market:n1')
    expect(entry?.hefboom).toBe('bezittingen') // beleggingen → bezittingen
  })
})
