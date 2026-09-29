import { describe, expect, it } from 'vitest'

// Sinds Krant 1E (K1) wist de AI-keuze de tijdlijn niet meer; wisTijdlijn is
// weg (eindreview G8). De struikeldraad is nu: geen enkele delete op
// krant_edities vanuit zetKrantVariant (zie de test hieronder).

import { maakNepClient } from './nep-client.fixture'
import { zetKrantVariant, zetSchaduwBezwaar } from './tijdlijn-keuzes'

const UID = 'user-a'
const PARTNER = 'partner-b'

// ── zetKrantVariant ──────────────────────────────────────────────────────────

describe('zetKrantVariant', () => {
  it("'ai' (1E, K1): upsert krant_variant 'ai' op de eigen rij — en de tijdlijn wordt NIET gewist", async () => {
    // Geen 'profiles'-rij in deze fixture → wisBandenZonderDoel's eigen
    // profiel-lezing vindt niets en geeft fail-safe false terug (geen bezwaar
    // bekend = geen wis) — zie de aparte 'wisBandenZonderDoel'-tests voor die kant.
    const nep = maakNepClient({ nieuwsprofiel: [{ user_id: UID, krant_variant: null }] })
    const uit = await zetKrantVariant(nep.client as never, UID, 'ai')
    expect(uit).toEqual({ variant: 'ai', profielGewist: false })
    expect(nep.rijen('nieuwsprofiel')).toEqual([expect.objectContaining({ user_id: UID, krant_variant: 'ai' })])
    // Geen enkele delete op de tijdlijn.
    expect(nep.queries.some((q) => q.table === 'krant_edities' && q.stappen.some((st) => st.m === 'delete'))).toBe(false)
  })

  it("'tijdlijn': de kolom naar null, en niets gewist", async () => {
    const nep = maakNepClient({ nieuwsprofiel: [{ user_id: UID, krant_variant: 'ai' }] })
    const uit = await zetKrantVariant(nep.client as never, UID, 'tijdlijn')
    expect(uit).toEqual({ variant: null, profielGewist: false })
    expect(nep.rijen('nieuwsprofiel')).toEqual([expect.objectContaining({ user_id: UID, krant_variant: null })])
  })

  it("'ai' gekozen ná een al staand bezwaar: de banden BLIJVEN — de Krant met AI is sinds 1E dezelfde tijdlijn (security Y2 herzien)", async () => {
    // Werkelijke tijdlijnlezer die AI mag kiezen: superadmin (inBeta true zolang
    // TIJDLIJN_BETA_OPEN false is), Geheel-account, ai_enabled + AI-abonnement.
    const nep = maakNepClient({
      profiles: [{ id: UID, role: 'superadmin', active_modules: null, ai_enabled: true, active_subscriptions: ['ai'], krant_schaduw_bezwaar_at: '2026-09-29T08:00:00Z' }],
      nieuwsprofiel: [{ user_id: UID, krant_variant: null }],
    })
    const uit = await zetKrantVariant(nep.client as never, UID, 'ai')
    // bron wordt 'ai' = tijdlijn + laag: het profiel heeft nog een doel (de knop).
    expect(uit.profielGewist).toBe(false)
    const [np] = nep.rijen('nieuwsprofiel')
    expect(np.krant_variant).toBe('ai')
  })

  it("'ai' bij een DICHTE vlag (gewone lezer, bron 'oud') ná een bezwaar: de banden gaan wél weg", async () => {
    const nep = maakNepClient({
      profiles: [{ id: UID, role: 'user', active_modules: null, ai_enabled: true, active_subscriptions: ['ai'], krant_schaduw_bezwaar_at: '2026-09-29T08:00:00Z' }],
      nieuwsprofiel: [{ user_id: UID, krant_variant: null, geboortejaar: 1990, herkomst: { inkomen: 'afgeleid' } }],
    })
    const uit = await zetKrantVariant(nep.client as never, UID, 'ai')
    expect(uit.profielGewist).toBe(true)
    expect(nep.rijen('nieuwsprofiel')[0].geboortejaar).toBeNull()
  })

  it('upsert draagt updated_at en gebeurt op onConflict user_id (geen dubbele rij)', async () => {
    const nep = maakNepClient({ nieuwsprofiel: [] })
    await zetKrantVariant(nep.client as never, UID, 'ai')
    expect(nep.rijen('nieuwsprofiel')).toHaveLength(1)
    const [rij] = nep.rijen('nieuwsprofiel')
    expect(typeof rij.updated_at).toBe('string')
  })

  it('schrijft alleen de eigen rij: de rij van een ander blijft ongemoeid', async () => {
    const nep = maakNepClient({
      nieuwsprofiel: [
        { user_id: UID, krant_variant: null },
        { user_id: PARTNER, krant_variant: 'tijdlijn' },
      ],
    })
    await zetKrantVariant(nep.client as never, UID, 'ai')
    const partnerRij = nep.rijen('nieuwsprofiel').find((r) => r.user_id === PARTNER)
    expect(partnerRij?.krant_variant).toBe('tijdlijn')
  })

  it('een schrijffout gooit een leesbare fout (geen rauwe supabase-error)', async () => {
    const nep = maakNepClient({ nieuwsprofiel: [] }, { fouten: { 'nieuwsprofiel:upsert': 'kapot' } })
    await expect(zetKrantVariant(nep.client as never, UID, 'ai')).rejects.toThrow(/variant schrijven mislukt/)
  })
})

// ── zetSchaduwBezwaar ────────────────────────────────────────────────────────

const BANDVELD_VOORBEELD = { geboortejaar: 1990, huishouden: 'alleenstaand', inkomen: 3000 }

function profielMetBand(overrides: Partial<Record<string, unknown>> = {}) {
  return { user_id: UID, krant_variant: 'ai', ...BANDVELD_VOORBEELD, herkomst: { inkomen: 'afgeleid' }, afgeleid_at: '2026-09-01T00:00:00Z', ...overrides }
}

describe('zetSchaduwBezwaar(true)', () => {
  it('zet profiles.krant_schaduw_bezwaar_at op de eigen id', async () => {
    const nep = maakNepClient({ profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }], krant_edities: [], nieuwsprofiel: [] })
    const now = new Date('2026-09-29T08:00:00Z')
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true, now)
    expect(uit.bezwaar).toBe(true)
    expect(nep.rijen('profiles')).toEqual([{ id: UID, krant_schaduw_bezwaar_at: now.toISOString() }])
  })

  it('wist de schaduwedities van de eigen id (bron "schaduw"), tijdlijn en partner blijven', async () => {
    const nep = maakNepClient({
      profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      krant_edities: [
        { id: 's1', user_id: UID, bron: 'schaduw' },
        { id: 's2', user_id: UID, bron: 'schaduw' },
        { id: 't1', user_id: UID, bron: 'tijdlijn' },
        { id: 'sp', user_id: PARTNER, bron: 'schaduw' },
      ],
      nieuwsprofiel: [],
    })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(uit.schaduwGewist).toBe(2)
    expect(nep.rijen('krant_edities').map((e) => e.id).sort()).toEqual(['sp', 't1'])
  })

  it("variant 'ai': de bandvelden gaan naar null, herkomst naar {}, afgeleid_at naar null — krant_variant blijft 'ai'", async () => {
    const nep = maakNepClient({
      profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      krant_edities: [],
      nieuwsprofiel: [profielMetBand()],
    })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(uit.profielGewist).toBe(true)
    const [np] = nep.rijen('nieuwsprofiel')
    expect(np.krant_variant).toBe('ai')
    expect(np.geboortejaar).toBeNull()
    expect(np.huishouden).toBeNull()
    expect(np.inkomen).toBeNull()
    expect(np.herkomst).toEqual({})
    expect(np.afgeleid_at).toBeNull()
  })

  it('een WERKELIJKE tijdlijnlezer (bron = tijdlijn) houdt zijn banden — de vernieuwknop gebruikt ze nog', async () => {
    // inBeta true (superadmin, zolang TIJDLIJN_BETA_OPEN false is), Geheel-account,
    // krant_variant 'tijdlijn' → bepaalKrantBron geeft echt 'tijdlijn'.
    const nep = maakNepClient({
      profiles: [{ id: UID, role: 'superadmin', active_modules: null, krant_schaduw_bezwaar_at: null }],
      krant_edities: [],
      nieuwsprofiel: [profielMetBand({ krant_variant: 'tijdlijn' })],
    })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(uit.profielGewist).toBe(false)
    const [np] = nep.rijen('nieuwsprofiel')
    expect(np.geboortejaar).toBe(1990)
  })

  it('klikvolgorde (security Y2, herzien in 1E): eerst bezwaar als tijdlijnlezer → banden blijven; kiest hij dáárna de Krant met AI → banden blijven óók (zelfde tijdlijn)', async () => {
    const profiles = [{ id: UID, role: 'superadmin', active_modules: null, ai_enabled: true, active_subscriptions: ['ai'], krant_schaduw_bezwaar_at: null }]
    const nep = maakNepClient({ profiles, krant_edities: [], nieuwsprofiel: [profielMetBand({ krant_variant: 'tijdlijn' })] })

    const eerst = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(eerst.profielGewist).toBe(false)
    expect(nep.rijen('nieuwsprofiel')[0].geboortejaar).toBe(1990)

    const daarna = await zetKrantVariant(nep.client as never, UID, 'ai')
    expect(daarna.profielGewist).toBe(false)
    const [np] = nep.rijen('nieuwsprofiel')
    expect(np.krant_variant).toBe('ai')
    expect(np.geboortejaar).toBe(1990)
  })

  it('de bèta-vlag dicht (inBeta false) + bezwaar: banden gaan óók weg zonder dat er ooit een AI-variant is gekozen (variant null)', async () => {
    // Gewone user (geen superadmin) → inBeta false zolang TIJDLIJN_BETA_OPEN
    // false is. Geen gekozen variant: het nieuwsprofiel heeft dus geen doel
    // meer zodra de lezer bezwaar maakt, want /nieuws toont voor hem sowieso
    // niet de tijdlijn (bron wordt 'oud', de pre-1C standaard).
    const nep = maakNepClient({
      profiles: [{ id: UID, role: 'user', active_modules: null, krant_schaduw_bezwaar_at: null }],
      krant_edities: [],
      nieuwsprofiel: [profielMetBand({ krant_variant: null })],
    })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(uit.profielGewist).toBe(true)
    const [np] = nep.rijen('nieuwsprofiel')
    expect(np.geboortejaar).toBeNull()
    expect(np.krant_variant).toBeNull() // de keuze zelf blijft staan (hier: geen keuze)
  })

  it('geen nieuwsprofiel-rij: geen profielwis, geen crash', async () => {
    const nep = maakNepClient({ profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }], krant_edities: [], nieuwsprofiel: [] })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, true)
    expect(uit.profielGewist).toBe(false)
  })
})

describe('zetSchaduwBezwaar(false)', () => {
  it('zet de kolom terug op null; niets gewist, geen profielwis', async () => {
    const nep = maakNepClient({
      profiles: [{ id: UID, krant_schaduw_bezwaar_at: '2026-09-01T00:00:00Z' }],
      krant_edities: [{ id: 's1', user_id: UID, bron: 'schaduw' }],
      nieuwsprofiel: [profielMetBand()],
    })
    const uit = await zetSchaduwBezwaar(nep.client as never, UID, false)
    expect(uit).toEqual({ bezwaar: false, schaduwGewist: 0, profielGewist: false })
    expect(nep.rijen('profiles')[0].krant_schaduw_bezwaar_at).toBeNull()
    expect(nep.rijen('krant_edities')).toHaveLength(1)
    expect(nep.rijen('nieuwsprofiel')[0].geboortejaar).toBe(1990)
  })
})

describe('foutafhandeling geeft leesbare fouten', () => {
  it('een schrijffout op profiles gooit', async () => {
    const nep = maakNepClient({ profiles: [] }, { fouten: { 'profiles:update': 'kapot' } })
    await expect(zetSchaduwBezwaar(nep.client as never, UID, true)).rejects.toThrow(/bezwaar schrijven mislukt/)
  })

  it('een fout bij het wissen van schaduwedities gooit', async () => {
    const nep = maakNepClient({ profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }] }, { fouten: { 'krant_edities:delete': 'kapot' } })
    await expect(zetSchaduwBezwaar(nep.client as never, UID, true)).rejects.toThrow(/schaduwedities wissen mislukt/)
  })
})
