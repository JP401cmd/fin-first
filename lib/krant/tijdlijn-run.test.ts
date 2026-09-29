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
import { GEZIEN_PORTIE, TIJDLIJN_BEWAAR_DAGEN, nogTijdlijnlezer, ruimAlleTijdlijnenOp, ruimTijdlijnOp, tijdlijnArtikelIds, ververs, wisTijdlijn } from './tijdlijn-run'

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

  it('wisTijdlijn (de bèta uit): de hele eigen tijdlijn weg, schaduw en partner blijven', async () => {
    const nep = maakNepClient({
      krant_edities: [
        { id: 't1', user_id: UID, bron: 'tijdlijn' },
        { id: 't2', user_id: UID, bron: 'tijdlijn' },
        { id: 's1', user_id: UID, bron: 'schaduw' },
        { id: 'p1', user_id: 'partner', bron: 'tijdlijn' },
      ],
    })
    expect(await wisTijdlijn(nep.client as never, UID)).toBe(2)
    expect(nep.rijen('krant_edities').map((e) => e.id).sort()).toEqual(['p1', 's1'])
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

    it('false: intussen bewust de AI-Krant gekozen (krant_variant "ai")', async () => {
      const nep = maakNepClient({
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'ai' }],
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
      })
      expect(await nogTijdlijnlezer(nep.client as never, UID)).toBe(false)
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
        nieuwsprofiel: [{ user_id: UID, krant_variant: 'ai' }], // intussen de AI-Krant gekozen
        profiles: [{ id: UID, krant_schaduw_bezwaar_at: null }],
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
})
