import { beforeEach, describe, expect, it, vi } from 'vitest'

// Het profiel komt uit de fixture (de afleiding heeft eigen tests); de
// lezerscontext krijgt bewust een NIET-lege news_read-set, om te bewijzen dat
// de tijdlijn die leesstatus van de AI-Krant negeert.
vi.mock('./profiel-afleiding', () => ({ afleidNieuwsprofiel: vi.fn() }))
vi.mock('./editie-loader', () => ({
  // news_read bevat ÁLLE fixture-artikelen: zou de tijdlijn die leesstatus gebruiken, dan bleef hij leeg.
  laadLezerContext: vi.fn(async () => {
    const { ARTIKELEN } = await import('./editie.fixture')
    return { gezienArtikelIds: new Set(ARTIKELEN.map((a) => a.id)), gedemptRubrieken: new Set<string>() }
  }),
}))

import { readSourceLF } from '@/lib/test-utils/read-source'
import { afleidNieuwsprofiel } from './profiel-afleiding'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_TESSA } from './editie.fixture'
import { EDITIE_MAX } from './matcher'
import { maakNepClient } from './nep-client.fixture'
import { GEZIEN_PORTIE, TIJDLIJN_BEWAAR_DAGEN, hertoetsLezer, nogTijdlijnlezer, ruimAlleTijdlijnenOp, ruimTijdlijnOp, tijdlijnArtikelIds, ververs, ietsNieuwsSindsVorige } from './tijdlijn-run'
import { AI_LAAG_MAX_KANDIDATEN, legeTellers } from './ai-laag'
import type { AiStap, AiStapInvoer } from './tijdlijn-ai'

const UID = 'user-a'
const afleidMock = vi.mocked(afleidNieuwsprofiel)

beforeEach(() => {
  afleidMock.mockReset()
  afleidMock.mockResolvedValue({ profiel: PROFIEL_TESSA } as never)
})

const invoer = () => ({ userId: UID, now: NU, aowRows: AOW_RIJEN, kandidaten: ARTIKELEN })
/** De artikelbak zoals de hertoets (alleenNogGeduid) hem leest. */
const artikelRijen = (teruggetrokken: string[] = []) =>
  ARTIKELEN.map((a) => ({ id: a.id, duiding_status: teruggetrokken.includes(a.id) ? 'teruggetrokken' : a.duiding_status }))

describe('tijdlijn-run (Krant 1C, B31)', () => {
  it('tijdlijnArtikelIds: alleen de eigen tijdlijn — geen schaduwitems, geen partner, geen opgeruimd artikel', async () => {
    const nep = maakNepClient({
      krant_editie_items: [
        { id: 'i1', user_id: UID, article_id: 'a1', tijdlijn: true },
        { id: 'i2', user_id: UID, article_id: 'a2', tijdlijn: false },
        { id: 'i3', user_id: 'partner', article_id: 'a3', tijdlijn: true },
        { id: 'i4', user_id: UID, article_id: null, tijdlijn: true },
      ],
    })
    expect([...(await tijdlijnArtikelIds(nep.client as never, UID, ['a1', 'a2', 'a3', 'a4']))]).toEqual(['a1'])
  })

  it('tijdlijnArtikelIds vraagt per portie kandidaten — nooit de hele tijdlijn (max_rows), en vindt ook de laatste portie', async () => {
    const ids = Array.from({ length: GEZIEN_PORTIE * 2 + 5 }, (_, i) => `k${i}`)
    const nep = maakNepClient({
      krant_editie_items: [
        { id: 'x1', user_id: UID, article_id: 'k0', tijdlijn: true },
        { id: 'x2', user_id: UID, article_id: `k${GEZIEN_PORTIE * 2 + 4}`, tijdlijn: true },
        { id: 'x3', user_id: UID, article_id: 'buiten-de-kandidaten', tijdlijn: true },
      ],
    })
    const gezien = await tijdlijnArtikelIds(nep.client as never, UID, ids)
    expect([...gezien].sort()).toEqual(['k0', `k${GEZIEN_PORTIE * 2 + 4}`].sort())
    const vragen = nep.queries.filter((q) => q.table === 'krant_editie_items')
    expect(vragen).toHaveLength(3)
    for (const q of vragen) {
      const inStap = q.stappen.find((s) => s.m === 'in')
      expect((inStap!.args[1] as unknown[]).length).toBeLessThanOrEqual(GEZIEN_PORTIE)
    }
  })

  it('een verversing schrijft bron tijdlijn, items met tijdlijn = true, hoogstens EDITIE_MAX — en negeert news_read', async () => {
    const nep = maakNepClient({ news_articles: artikelRijen() })
    const uit = await ververs(nep.client as never, invoer())
    expect(uit.leeg).toBe(false)
    expect(uit.items).toBeGreaterThan(0)
    expect(uit.items).toBeLessThanOrEqual(EDITIE_MAX)
    const [editie] = nep.rijen('krant_edities')
    expect(editie).toMatchObject({ user_id: UID, bron: 'tijdlijn', week_key: '2026-W39', item_count: uit.items })
    const items = nep.rijen('krant_editie_items')
    expect(items.every((i) => i.tijdlijn === true && i.user_id === UID)).toBe(true)
  })

  it('een artikel staat hoogstens één keer in de tijdlijn; een tweede verversing zonder nieuws is leeg en wordt vastgelegd', async () => {
    const nep = maakNepClient({ news_articles: artikelRijen() })
    const eerste = await ververs(nep.client as never, invoer())
    const tweede = await ververs(nep.client as never, invoer())
    const artikelen = nep.rijen('krant_editie_items').map((i) => i.article_id)
    expect(new Set(artikelen).size).toBe(artikelen.length)
    // Tessa heeft meer kandidaten dan EDITIE_MAX: de tweede verversing brengt de rest, nooit iets dubbel.
    if (eerste.items < EDITIE_MAX) {
      expect(tweede.leeg).toBe(true)
      expect(nep.rijen('krant_edities').filter((e) => e.leeg === true && e.item_count === 0)).toHaveLength(1)
    }
    const derde = await ververs(nep.client as never, invoer())
    const vierde = await ververs(nep.client as never, invoer())
    expect(derde.items + vierde.items).toBeLessThanOrEqual(ARTIKELEN.length)
    expect(vierde.leeg).toBe(true)
  })

  it('M1: een artikel dat tijdens de run is teruggetrokken, komt niet in de tijdlijn — ook niet in katern of Achtergrond', async () => {
    const schoon = maakNepClient({ news_articles: artikelRijen() })
    await ververs(schoon.client as never, invoer())
    const gekozen = schoon.rijen('krant_editie_items').map((i) => i.article_id as string)
    expect(gekozen.length).toBeGreaterThan(0)
    const weg = gekozen[0]

    const nep = maakNepClient({ news_articles: artikelRijen([weg]) })
    const uit = await ververs(nep.client as never, invoer())
    expect(nep.rijen('krant_editie_items').map((i) => i.article_id)).not.toContain(weg)
    const [editie] = nep.rijen('krant_edities')
    expect(editie.item_count).toBe(uit.items)
    const algemeen = editie.algemeen as { items: { artikelId: string }[]; achtergrond?: { items: { artikelId: string }[] } }
    expect(algemeen.items.map((i) => i.artikelId)).not.toContain(weg)
    expect((algemeen.achtergrond?.items ?? []).map((i) => i.artikelId)).not.toContain(weg)
  })

  it('ruimTijdlijnOp: alleen de eigen tijdlijn, alleen ouder dan TIJDLIJN_BEWAAR_DAGEN; de schaduw blijft', async () => {
    const oud = new Date(NU.getTime() - (TIJDLIJN_BEWAAR_DAGEN + 1) * 86_400_000).toISOString()
    const vers = new Date(NU.getTime() - (TIJDLIJN_BEWAAR_DAGEN - 1) * 86_400_000).toISOString()
    const nep = maakNepClient({
      krant_edities: [
        { id: 't-oud', user_id: UID, bron: 'tijdlijn', created_at: oud },
        { id: 't-vers', user_id: UID, bron: 'tijdlijn', created_at: vers },
        { id: 's-oud', user_id: UID, bron: 'schaduw', created_at: oud },
        { id: 'p-oud', user_id: 'partner', bron: 'tijdlijn', created_at: oud },
      ],
    })
    expect(await ruimTijdlijnOp(nep.client as never, UID, NU)).toBe(1)
    expect(nep.rijen('krant_edities').map((e) => e.id).sort()).toEqual(['p-oud', 's-oud', 't-vers'])
  })

  it('ruimAlleTijdlijnenOp: de 120 dagen voor iedereen (ook wie de cron overslaat); vers en schaduw blijven', async () => {
    const oud = new Date(NU.getTime() - (TIJDLIJN_BEWAAR_DAGEN + 1) * 86_400_000).toISOString()
    const vers = new Date(NU.getTime() - (TIJDLIJN_BEWAAR_DAGEN - 1) * 86_400_000).toISOString()
    const nep = maakNepClient({
      krant_edities: [
        { id: 't-oud', user_id: UID, bron: 'tijdlijn', created_at: oud },
        { id: 'p-oud', user_id: 'bezwaarmaker', bron: 'tijdlijn', created_at: oud },
        { id: 't-vers', user_id: UID, bron: 'tijdlijn', created_at: vers },
        { id: 's-oud', user_id: UID, bron: 'schaduw', created_at: oud },
      ],
    })
    expect(await ruimAlleTijdlijnenOp(nep.client as never, NU)).toBe(2)
    expect(nep.rijen('krant_edities').map((e) => e.id).sort()).toEqual(['s-oud', 't-vers'])
  })

  it('de bewaartermijn is gelijk aan die van de artikelen (ARTICLE_RETENTION_DAYS, ADR 0171)', () => {
    const m = readSourceLF('lib/news-ingest.ts').match(/export const ARTICLE_RETENTION_DAYS = (\d+)/)
    expect(m, 'ARTICLE_RETENTION_DAYS niet gevonden in lib/news-ingest.ts').not.toBeNull()
    expect(TIJDLIJN_BEWAAR_DAGEN).toBe(Number(m![1]))
  })

  describe('nogTijdlijnlezer (security G1, 29-09): is deze lezer nog een lezer van de automatische verversing?', () => {
    it('true: geen "ai"-keuze, geen bezwaar', async () => {
      const nep = maakNepClient({
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'tijdlijn' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      })
      expect(await nogTijdlijnlezer(nep.client as never, UID)).toBe(true)
    })

    it('true (sinds 1E): de Krant MET AI gekozen — dezelfde tijdlijn, dus nog steeds een lezer; hertoetsLezer meldt aiGekozen', async () => {
      const nep = maakNepClient({
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'ai' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      })
      expect(await nogTijdlijnlezer(nep.client as never, UID)).toBe(true)
      expect(await hertoetsLezer(nep.client as never, UID)).toEqual({ lezer: true, aiGekozen: true })
    })

    it('hertoetsLezer: zonder variant of met "tijdlijn" is aiGekozen false', async () => {
      const zonder = maakNepClient({ nieuwsprofiel: [], profiles: [] })
      expect(await hertoetsLezer(zonder.client as never, UID)).toEqual({ lezer: true, aiGekozen: false })
      const tijdlijn = maakNepClient({ nieuwsprofiel: [{ user_id: UID, krant_variant: 'tijdlijn' }], profiles: [] })
      expect((await hertoetsLezer(tijdlijn.client as never, UID)).aiGekozen).toBe(false)
    })

    it('false: bezwaar tegen verwerking op de achtergrond', async () => {
      const nep = maakNepClient({
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'tijdlijn' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: '2026-09-29T08:00:00Z' }],
      })
      expect(await nogTijdlijnlezer(nep.client as never, UID)).toBe(false)
    })

    it('true bij een ontbrekende rij (nieuwe lezer, geen keuze en geen bezwaar bekend)', async () => {
      const nep = maakNepClient({ nieuwsprofiel: [], profiles: [] })
      expect(await nogTijdlijnlezer(nep.client as never, UID)).toBe(true)
    })

    it('een leesfout op nieuwsprofiel of profiles gooit (fail-loud — de cron telt de lezer dan als fout)', async () => {
      const nepNp = maakNepClient({ nieuwsprofiel: [], profiles: [] }, { fouten: { 'nieuwsprofiel:select': 'kapot' } })
      await expect(nogTijdlijnlezer(nepNp.client as never, UID)).rejects.toThrow(/variant hertoetsen mislukt/)
      const nepPr = maakNepClient({ nieuwsprofiel: [], profiles: [] }, { fouten: { 'profiles:select': 'kapot' } })
      await expect(nogTijdlijnlezer(nepPr.client as never, UID)).rejects.toThrow(/bezwaar hertoetsen mislukt/)
    })
  })

  describe('ververs met hertoetsVoorSchrijven (de cron; security G1)', () => {
    it('nogTijdlijnlezer=false vlak vóór het schrijven: niets geschreven, overgeslagen=true', async () => {
      const nep = maakNepClient({
        news_articles: artikelRijen(),
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'tijdlijn' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: '2026-09-29T08:00:00Z' }], // intussen bezwaar gemaakt
      })
      const uit = await ververs(nep.client as never, { ...invoer(), hertoetsVoorSchrijven: true })
      expect(uit).toEqual({ editieId: '', profielType: expect.any(String), leeg: true, items: 0, overgeslagen: true })
      expect(nep.rijen('krant_edities')).toHaveLength(0)
      expect(nep.rijen('krant_editie_items')).toHaveLength(0)
    })

    it('nogTijdlijnlezer=true: schrijft gewoon, geen overgeslagen-vlag', async () => {
      const nep = maakNepClient({
        news_articles: artikelRijen(),
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'tijdlijn' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      })
      const uit = await ververs(nep.client as never, { ...invoer(), hertoetsVoorSchrijven: true })
      expect(uit.overgeslagen).toBeUndefined()
      expect(nep.rijen('krant_edities')).toHaveLength(1)
    })

    it('zonder hertoetsVoorSchrijven (de knop): geen hertoets, schrijft altijd — ook al zouden nieuwsprofiel/profiles "ai"/bezwaar bevatten', async () => {
      const nep = maakNepClient({
        news_articles: artikelRijen(),
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'ai' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: '2026-09-29T08:00:00Z' }],
      })
      const uit = await ververs(nep.client as never, invoer())
      expect(uit.overgeslagen).toBeUndefined()
      expect(nep.rijen('krant_edities')).toHaveLength(1)
      // De hertoets is nooit geraadpleegd: geen enkele query op nieuwsprofiel/profiles.
      expect(nep.queriesOp('nieuwsprofiel')).toHaveLength(0)
      expect(nep.queriesOp('profiles')).toHaveLength(0)
    })
  })

  describe('de AI-laag in de verversing (Krant 1E, ADR 0190)', () => {
    /**
     * Extra artikelen die de matcher níet kiest (doelgroep past niet bij Tessa,
     * geen mechanisme): zonder deze had de fixture 0 AI-kandidaten en waren de
     * toevoegingstests leeg.
     */
    const basisAchtergrond = ARTIKELEN.find((a) => a.duiding?.soort === 'achtergrond')!
    const EXTRA = Array.from({ length: 4 }, (_, i) => ({
      ...basisAchtergrond,
      id: `x-extra-${i}`,
      title: `Extra achtergrond ${i}`,
      category: 'macro',
      duiding: {
        ...basisAchtergrond.duiding!,
        doelgroep: [{ veld: 'kinderen' as const, op: 'is' as const, waarden: ['jongste-0-3'] }],
        mechanisme: null,
        themas: [],
      },
    }))
    const invoerAi = () => ({ ...invoer(), kandidaten: [...ARTIKELEN, ...EXTRA] })
    const rijenAi = () => [...artikelRijen(), ...EXTRA.map((a) => ({ id: a.id, duiding_status: 'geduid' }))]

    /** Een nep-stap: legt de invoer vast en geeft een toelichting op het eerste bericht + één toevoeging. */
    function nepStap(gedrag: 'toelichten' | 'gooien' | 'niets' = 'toelichten') {
      const invoeren: AiStapInvoer[] = []
      const naSchrijven = vi.fn(async () => {})
      const stap: AiStap = async (_service, inv) => {
        invoeren.push(inv)
        if (gedrag === 'gooien') throw new Error('onverwacht')
        if (gedrag === 'niets') return { items: [...inv.items], uitkomst: 'quotum', reden: 'quotum', tellers: legeTellers(), naSchrijven: null }
        const [eerste, ...rest] = inv.items
        const extra = inv.kandidaten[0]
        const items = [
          { ...eerste, aiTekst: 'Toelichting van het model.' },
          ...rest,
          ...(extra
            ? [{ ...eerste, artikelId: extra.id, titel: extra.title, vorm: 'ai' as const, tekst: '', sjabloonId: 'ai-toegevoegd', aiTekst: 'Toegevoegd.', aiToegevoegd: true }]
            : []),
        ]
        const tellers = legeTellers()
        tellers.toelichtingen = 1
        tellers.toevoegingen = extra ? 1 : 0
        return { items, uitkomst: 'met-ai', reden: null, tellers, naSchrijven }
      }
      return { stap, invoeren, naSchrijven }
    }

    it('de stap krijgt de matcherberichten en hoogstens 12 kandidaten die de matcher NIET koos; met_ai + ai_uitkomst + ai_tekst worden geschreven', async () => {
      const nep = maakNepClient({ news_articles: rijenAi() })
      const { stap, invoeren, naSchrijven } = nepStap()
      const uit = await ververs(nep.client as never, { ...invoerAi(), aiStap: stap })
      expect(invoeren).toHaveLength(1)
      const inv = invoeren[0]
      const gekozen = new Set(inv.items.map((i) => i.artikelId))
      expect(inv.kandidaten.length).toBeLessThanOrEqual(AI_LAAG_MAX_KANDIDATEN)
      for (const k of inv.kandidaten) expect(gekozen.has(k.id)).toBe(false)
      const [editie] = nep.rijen('krant_edities')
      expect(editie).toMatchObject({ met_ai: true, ai_uitkomst: 'met-ai', bron: 'tijdlijn' })
      const items = nep.rijen('krant_editie_items')
      expect(items.filter((i) => i.ai_tekst === 'Toelichting van het model.')).toHaveLength(1)
      // Het matcherbericht houdt zijn eigen regel (de terugval blijft staan).
      const toegelicht = items.find((i) => i.ai_tekst === 'Toelichting van het model.')!
      expect(typeof toegelicht.tekst).toBe('string')
      expect((toegelicht.tekst as string).length).toBeGreaterThan(0)
      expect(inv.kandidaten.length).toBeGreaterThan(0)
      const toegevoegd = items.find((i) => i.ai_toegevoegd === true)!
      expect(toegevoegd).toMatchObject({ vorm: 'ai', tekst: '', tijdlijn: true, article_id: inv.kandidaten[0].id })
      expect(uit.ai?.uitkomst).toBe('met-ai')
      expect(naSchrijven).toHaveBeenCalledTimes(1)
    })

    it('een stap die GOOIT: dezelfde verversing zonder AI — matcherberichten intact, nooit leeg door de fout', async () => {
      const zonder = maakNepClient({ news_articles: rijenAi() })
      const basis = await ververs(zonder.client as never, invoerAi())
      const nep = maakNepClient({ news_articles: rijenAi() })
      const uit = await ververs(nep.client as never, { ...invoerAi(), aiStap: nepStap('gooien').stap })
      expect(uit.items).toBe(basis.items)
      expect(uit.leeg).toBe(false)
      const [editie] = nep.rijen('krant_edities')
      expect(editie).toMatchObject({ met_ai: false, ai_uitkomst: 'geweigerd' })
      expect(nep.rijen('krant_editie_items').every((i) => !('ai_tekst' in i))).toBe(true)
    })

    it('quotum/weigering: ai_uitkomst gezet, met_ai false', async () => {
      const nep = maakNepClient({ news_articles: rijenAi() })
      const uit = await ververs(nep.client as never, { ...invoerAi(), aiStap: nepStap('niets').stap })
      expect(uit.ai?.uitkomst).toBe('quotum')
      expect(nep.rijen('krant_edities')[0]).toMatchObject({ met_ai: false, ai_uitkomst: 'quotum' })
    })

    it('cron-hertoets: koos de lezer intussen weer zonder AI, dan draait de laag niet (en schrijft geen ai_uitkomst)', async () => {
      const nep = maakNepClient({
        news_articles: rijenAi(),
        nieuwsprofiel: [{ user_id: UID, krant_variant: null }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      })
      const { stap, invoeren } = nepStap()
      const uit = await ververs(nep.client as never, { ...invoerAi(), hertoetsVoorSchrijven: true, aiStap: stap })
      expect(invoeren).toHaveLength(0)
      expect(uit.ai).toBeUndefined()
      expect(nep.rijen('krant_edities')[0]).toMatchObject({ met_ai: false })
      expect('ai_uitkomst' in nep.rijen('krant_edities')[0]).toBe(false)
    })

    it('zonder aiStap: de rij is exact die van vóór 1E (geen ai_uitkomst, geen ai_tekst-kolom)', async () => {
      const nep = maakNepClient({ news_articles: rijenAi() })
      await ververs(nep.client as never, invoer())
      expect('ai_uitkomst' in nep.rijen('krant_edities')[0]).toBe(false)
      expect(nep.rijen('krant_editie_items').every((i) => !('ai_tekst' in i) && !('ai_toegevoegd' in i))).toBe(true)
    })

    it('Y6: een schrijffout na een BETAALDE call: de fout gaat door, maar naSchrijven (credit-metering) draait toch', async () => {
      const nep = maakNepClient({ news_articles: rijenAi() }, { fouten: { 'krant_editie_items:insert': 'duplicate key 23505' } })
      const { stap, naSchrijven } = nepStap()
      await expect(ververs(nep.client as never, { ...invoerAi(), aiStap: stap })).rejects.toThrow(/items schrijven mislukt/)
      expect(naSchrijven).toHaveBeenCalledTimes(1)
    })

    it('Y6: een toegevoegd artikel dat intussen al in de tijdlijn staat, valt eruit — de rest van de verversing wordt gewoon geschreven', async () => {
      const nep = maakNepClient({ news_articles: rijenAi() })
      const { stap, invoeren } = nepStap()
      // Eerst de stap laten kiezen, dan het gekozen artikel "door de cron" in de tijdlijn zetten.
      const verpakt: AiStap = async (service, inv) => {
        const uit = await stap(service, inv)
        const extra = uit.items.find((i) => i.aiToegevoegd)
        if (extra) nep.rijen('krant_editie_items').push({ id: 'race', user_id: UID, article_id: extra.artikelId, tijdlijn: true })
        return uit
      }
      const uit = await ververs(nep.client as never, { ...invoerAi(), aiStap: verpakt })
      expect(invoeren[0].kandidaten.length, 'de fixture moet kandidaten hebben, anders is deze test leeg').toBeGreaterThan(0)
      const geschreven = nep.rijen('krant_editie_items').filter((i) => i.id !== 'race')
      expect(geschreven.some((i) => i.ai_toegevoegd === true)).toBe(false)
      expect(uit.items).toBe(invoeren[0].items.length)
      expect(uit.ai?.tellers.toevoegingen).toBe(0)
    })
  })

  describe('ietsNieuwsSindsVorige (eindreview Y4 — de dagcron verbruikt geen call op ongewijzigde invoer)', () => {
    const VORIGE = '2026-09-20T06:30:00Z'
    it('geen vorige verversing: ja', async () => {
      const nep = maakNepClient({ krant_edities: [], news_articles: [] })
      expect(await ietsNieuwsSindsVorige(nep.client as never, UID)).toBe(true)
    })
    it('wel een vorige, niets geduid sinds: nee; één artikel geduid ná de vorige: ja — alleen de eigen tijdlijn telt', async () => {
      const basis = {
        krant_edities: [
          { id: 'e1', user_id: UID, bron: 'tijdlijn', created_at: VORIGE },
          { id: 'p1', user_id: 'partner', bron: 'tijdlijn', created_at: '2026-09-21T06:30:00Z' },
          { id: 's1', user_id: UID, bron: 'schaduw', created_at: '2026-09-21T06:30:00Z' },
        ],
      }
      const niets = maakNepClient({ ...basis, news_articles: [{ id: 'a', duiding_status: 'geduid', geduid_at: '2026-09-20T05:00:00Z' }] })
      expect(await ietsNieuwsSindsVorige(niets.client as never, UID)).toBe(false)
      const wel = maakNepClient({ ...basis, news_articles: [{ id: 'a', duiding_status: 'geduid', geduid_at: '2026-09-20T06:30:01Z' }] })
      expect(await ietsNieuwsSindsVorige(wel.client as never, UID)).toBe(true)
      const nietGeduid = maakNepClient({ ...basis, news_articles: [{ id: 'a', duiding_status: 'wacht', geduid_at: '2026-09-21T00:00:00Z' }] })
      expect(await ietsNieuwsSindsVorige(nietGeduid.client as never, UID)).toBe(false)
    })
    it('een leesfout gooit (de cron behandelt dat als "nee": geen call)', async () => {
      const nep = maakNepClient({ krant_edities: [] }, { fouten: { 'krant_edities:select': 'kapot' } })
      await expect(ietsNieuwsSindsVorige(nep.client as never, UID)).rejects.toThrow(/laatste verversing lezen mislukt/)
    })
  })
})
