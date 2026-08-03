// ── De beslissende laag, direct getest ──────────────────────────────────────
//
// `assertCloudAllowed` is de enige plek die bepaalt of de gegevens van een
// gebruiker een AI-leverancier mogen bereiken. De route-tests bewijzen dat hij
// wordt aangeroepen; deze tests bewijzen dat hij het juiste antwoord geeft —
// inclusief de randgevallen die je niet ziet aankomen in een happy-path-test.

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertCloudAllowed, isCloudAllowed, PRIVACY_GATE_CODE } from './privacy-gate'

/**
 * Minimale supabase-dubbelganger: `from().select().eq().maybeSingle()`.
 * `results` wordt per aanroep afgepeld, zodat we ook het terugval-pad kunnen
 * spelen waarin de eerste select faalt en de tweede slaagt.
 */
function clientWith(...results: Array<{ data?: unknown; error?: unknown }>): SupabaseClient {
  const queue = [...results]
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => queue.shift() ?? { data: null, error: null }),
      })),
    })),
  }))
  return { from } as unknown as SupabaseClient
}

const ok = (data: unknown) => ({ data, error: null })

describe('assertCloudAllowed', () => {
  it('laat door wanneer de groep op cloud staat', async () => {
    const client = clientWith(ok({ privacy_mode: false, ai_execution_prefs: {} }))
    expect(await assertCloudAllowed(client, 'u1', 'briefing')).toBeNull()
  })

  it('blokkeert met 403 en de stabiele code wanneer de groep lokaal draait', async () => {
    const client = clientWith(ok({ privacy_mode: true, ai_execution_prefs: {} }))
    const res = await assertCloudAllowed(client, 'u1', 'briefing')

    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = (await res!.json()) as { error: string; code?: string }
    expect(body.code).toBe(PRIVACY_GATE_CODE)
    // De melding noemt de groep waar het om gaat — anders weet een gebruiker
    // niet wélke instelling hij moet aanpassen.
    expect(body.error.toLowerCase()).toContain('briefing')
  })

  it('respecteert een per-groep override boven de hoofdschakelaar', async () => {
    const lokaalBehalveNieuws = ok({
      privacy_mode: true,
      ai_execution_prefs: { nieuws: 'cloud' },
    })
    expect(await assertCloudAllowed(clientWith(lokaalBehalveNieuws), 'u1', 'nieuws')).toBeNull()
    expect(await assertCloudAllowed(clientWith(lokaalBehalveNieuws), 'u1', 'gesprek')).not.toBeNull()
  })

  it('een profiel zonder rij valt terug op cloud — het bestaande gedrag', async () => {
    expect(await assertCloudAllowed(clientWith(ok(null)), 'u1', 'tips')).toBeNull()
  })
})

describe('robuustheid bij databasefouten', () => {
  // De migratie kan in een omgeving nog niet zijn toegepast. Een kolom die niet
  // bestaat kan per definitie ook niemands voorkeur bevatten, dus terugvallen op
  // het oude gedrag negeert geen bestaande keuze.
  it('ontbrekende nieuwe kolom → val terug op alleen de hoofdschakelaar', async () => {
    const client = clientWith(
      { data: null, error: { code: '42703', message: 'column ai_execution_prefs does not exist' } },
      ok({ privacy_mode: true }),
    )
    const res = await assertCloudAllowed(client, 'u1', 'transacties')
    expect(res, 'privacy_mode uit de oude kolom moet nog steeds blokkeren').not.toBeNull()
  })

  it('ontbreken beide kolommen → cloud, zoals vóór de privé-modus bestond', async () => {
    const client = clientWith(
      { data: null, error: { code: '42703', message: 'column ai_execution_prefs does not exist' } },
      { data: null, error: { code: '42703', message: 'column privacy_mode does not exist' } },
    )
    expect(await assertCloudAllowed(client, 'u1', 'transacties')).toBeNull()
  })

  // Dit is de belangrijkste: een tijdelijke DB-storing mag NOOIT stilzwijgend een
  // privé-modus openbreken. De fout hoort door te slaan naar de catch van de
  // route (500), niet te eindigen in "dan maar cloud".
  it('een andere leesfout wordt doorgegooid, niet weggeslikt', async () => {
    const client = clientWith({
      data: null,
      error: { code: '57014', message: 'statement timeout' },
    })
    await expect(assertCloudAllowed(client, 'u1', 'gesprek')).rejects.toBeTruthy()
  })
})

describe('isCloudAllowed', () => {
  // De variant voor routes die de blokkade zelf vormgeven — /api/report laat het
  // deterministische rapport gewoon door en slaat alleen de AI-inleiding over.
  it('geeft dezelfde beslissing terug als een kale boolean', async () => {
    expect(await isCloudAllowed(clientWith(ok({ privacy_mode: false })), 'u1', 'rapporten')).toBe(true)
    expect(await isCloudAllowed(clientWith(ok({ privacy_mode: true })), 'u1', 'rapporten')).toBe(false)
  })
})
