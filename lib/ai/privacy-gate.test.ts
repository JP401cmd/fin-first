// ── De beslissende laag, direct getest ──────────────────────────────────────
//
// `assertCloudAllowed` is de enige plek die bepaalt of de gegevens van een
// gebruiker een AI-leverancier mogen bereiken. De route-tests bewijzen dat hij
// wordt aangeroepen; deze tests bewijzen dat hij het juiste antwoord geeft —
// inclusief de randgevallen die je niet ziet aankomen in een happy-path-test.

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertAiEnabled,
  assertCloudAllowed,
  isCloudAllowed,
  AI_DISABLED_CODE,
  PRIVACY_GATE_CODE,
} from './privacy-gate'

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

/**
 * M26 — DE KILL-SWITCH (`profiles.ai_enabled`, "AI uit" op /mijn/privacy).
 *
 * Die knop werd uitsluitend op het lokale pad gehandhaafd. Op het cloudpad — de
 * default voor vrijwel elk account — checkte geen enkele laag hem: de chat gaf
 * gewoon een AI-antwoord, transacties werden alsnog door de cloud
 * gecategoriseerd, en er vertrok financiële tekst naar een externe leverancier
 * ondanks een expliciete keuze van de gebruiker.
 *
 * De gate is nu de plek waar dat één keer dicht gaat, vóór de plaatsingsvraag.
 */
describe('kill-switch: ai_enabled', () => {
  it('AI UIT + groep op cloud → 403 met de eigen code, niet de privé-code', async () => {
    const client = clientWith(ok({ privacy_mode: false, ai_execution_prefs: {}, ai_enabled: false }))
    const res = await assertCloudAllowed(client, 'u1', 'gesprek')

    expect(res, 'dit was null — het gat waar M26 over ging').not.toBeNull()
    expect(res!.status).toBe(403)
    const body = (await res!.json()) as { error: string; code?: string }
    // Een eigen code: andere oorzaak, andere weg terug dan privé-modus.
    expect(body.code).toBe(AI_DISABLED_CODE)
    expect(body.code).not.toBe(PRIVACY_GATE_CODE)
    // De melding wijst de knop aan die de gebruiker zelf heeft omgezet.
    expect(body.error).toMatch(/Privacy/)
  })

  it('de kill-switch gaat VÓÓR de plaatsingsvraag', async () => {
    // Beide "nee": AI uit én groep op lokaal. De gebruiker hoort de reden te zien
    // die hij zelf heeft gezet, niet een melding over privé-modus.
    const client = clientWith(ok({ privacy_mode: true, ai_execution_prefs: {}, ai_enabled: false }))
    const res = await assertCloudAllowed(client, 'u1', 'gesprek')

    const body = (await res!.json()) as { code?: string }
    expect(body.code).toBe(AI_DISABLED_CODE)
  })

  it('geen uitspraak (NULL of kolom afwezig) is GEEN "uit"', async () => {
    // De kolom is nullable met default true; een omgeving zonder de kolom levert
    // undefined. Allebei "geen uitspraak" — anders zet één lege rij de hele app op
    // zwart.
    expect(
      await assertCloudAllowed(clientWith(ok({ privacy_mode: false, ai_enabled: null })), 'u1', 'tips'),
    ).toBeNull()
    expect(await assertCloudAllowed(clientWith(ok({ privacy_mode: false })), 'u1', 'tips')).toBeNull()
  })

  it('isCloudAllowed volgt de kill-switch — geen cloud-AI bij AI uit', async () => {
    const client = clientWith(ok({ privacy_mode: false, ai_enabled: false }))
    expect(await isCloudAllowed(client, 'u1', 'rapporten')).toBe(false)
  })

  it('assertAiEnabled: alleen de kill-switch, zonder groep', async () => {
    expect(await assertAiEnabled(clientWith(ok({ privacy_mode: true, ai_enabled: true })), 'u1')).toBeNull()

    const res = await assertAiEnabled(clientWith(ok({ privacy_mode: true, ai_enabled: false })), 'u1')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    expect(((await res!.json()) as { code?: string }).code).toBe(AI_DISABLED_CODE)
  })

  it('ontbrekende ai_execution_prefs-kolom → kill-switch blijft gelden', async () => {
    // Terugval per as: de brede select faalt, daarna wordt de plaatsing apart
    // gelezen (privacy_mode — de prefs-kolom faalt óók) en de kill-switch apart.
    const client = clientWith(
      { data: null, error: { code: '42703', message: 'column ai_execution_prefs does not exist' } },
      { data: null, error: { code: '42703', message: 'column ai_execution_prefs does not exist' } },
      ok({ privacy_mode: false }),
      ok({ ai_enabled: false }),
    )
    const res = await assertCloudAllowed(client, 'u1', 'transacties')
    expect(res).not.toBeNull()
    expect(((await res!.json()) as { code?: string }).code).toBe(AI_DISABLED_CODE)
  })

  it('ontbrekende ai_enabled-kolom mag de PER-GROEP-KEUZE niet weggooien', async () => {
    // Het faalpad waar de gesplitste cascade voor bestaat: `ai_enabled` ontbreekt
    // (brede select 42703), maar `ai_execution_prefs` bestaat wél. Zou de terugval
    // die map laten vallen, dan las een gebruiker met {gesprek: 'lokaal'} als
    // 'cloud' — fail-OPEN op precies de as die nog leesbaar was.
    const client = clientWith(
      { data: null, error: { code: '42703', message: 'column ai_enabled does not exist' } },
      ok({ privacy_mode: false, ai_execution_prefs: { gesprek: 'lokaal' } }),
      { data: null, error: { code: '42703', message: 'column ai_enabled does not exist' } },
    )
    const res = await assertCloudAllowed(client, 'u1', 'gesprek')
    expect(res, 'de lokaal-override moet de terugval overleven').not.toBeNull()
    expect(((await res!.json()) as { code?: string }).code).toBe(PRIVACY_GATE_CODE)
  })

  it('ontbreken alle nieuwe kolommen → hoofdschakelaar telt nog steeds', async () => {
    // Alleen privacy_mode is leesbaar. Hem defaulten omdat een ándere kolom
    // ontbrak zou iemands privé-modus stil openbreken.
    const client = clientWith(
      { data: null, error: { code: '42703', message: 'column ai_enabled does not exist' } },
      { data: null, error: { code: '42703', message: 'column ai_execution_prefs does not exist' } },
      ok({ privacy_mode: true }),
      { data: null, error: { code: '42703', message: 'column ai_enabled does not exist' } },
    )
    const res = await assertCloudAllowed(client, 'u1', 'transacties')
    expect(res).not.toBeNull()
    expect(((await res!.json()) as { code?: string }).code).toBe(PRIVACY_GATE_CODE)
  })
})
