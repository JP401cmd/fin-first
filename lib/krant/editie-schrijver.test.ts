import { describe, expect, it } from 'vitest'
import { standaardImpactContext } from './impact'
import { matchEditie } from './matcher'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_TESSA, PROFIEL_DAAN } from './editie.fixture'
import { maakNepClient } from './nep-client.fixture'
import { SCHADUW_CAP_WEKEN, geldendeEditieId, itemNaarRij, markeerVervangen, ruimSchaduwOp, schrijfEditie } from './editie-schrijver'

const UID = 'user-a'
const ctx = () => ({ now: NU, gezienArtikelIds: new Set<string>(), gedemptRubrieken: new Set<string>(), impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()) })

describe('editie-schrijver', () => {
  it('schrijft de editie en haar items; elk item draagt de eigen user_id en het artikel-id', async () => {
    const uitkomst = matchEditie(PROFIEL_TESSA, ARTIKELEN, ctx())
    expect(uitkomst.leeg).toBe(false)
    const nep = maakNepClient({})
    const geschreven = await schrijfEditie(nep.client as never, { userId: UID, weekKey: '2026-W39', bron: 'schaduw', profiel: PROFIEL_TESSA, uitkomst, now: NU })

    const edities = nep.rijen('krant_edities')
    expect(edities.length).toBe(1)
    expect(edities[0]).toMatchObject({
      id: geschreven.id,
      user_id: UID,
      week_key: '2026-W39',
      bron: 'schaduw',
      met_ai: false,
      matcher_versie: uitkomst.matcherVersie,
      sjabloon_versie: uitkomst.sjabloonVersie,
      profiel_type: uitkomst.profielType,
      leeg: false,
      item_count: uitkomst.items.length,
    })
    expect(edities[0].profiel_snapshot).toEqual(PROFIEL_TESSA)

    const items = nep.rijen('krant_editie_items')
    expect(items.length).toBe(uitkomst.items.length)
    expect(geschreven.items).toBe(uitkomst.items.length)
    items.forEach((rij, i) => {
      expect(rij.user_id).toBe(UID)
      expect(rij.editie_id).toBe(geschreven.id)
      expect(rij.positie).toBe(i)
      expect(rij.article_id).toBe(uitkomst.items[i].artikelId)
      expect(rij.tekst).toBe(uitkomst.items[i].tekst)
      expect(rij.slots).toEqual(uitkomst.items[i].slots)
    })
  })

  it('een lege editie is een geldige rij zonder items', async () => {
    const uitkomst = matchEditie(PROFIEL_DAAN, [], ctx())
    expect(uitkomst.leeg).toBe(true)
    const nep = maakNepClient({})
    const geschreven = await schrijfEditie(nep.client as never, { userId: UID, weekKey: '2026-W39', bron: 'schaduw', profiel: PROFIEL_DAAN, uitkomst, now: NU })
    expect(geschreven.items).toBe(0)
    expect(nep.rijen('krant_edities')[0]).toMatchObject({ leeg: true, item_count: 0, lege_tekst: uitkomst.legeTekst })
    expect(nep.queriesOp('krant_editie_items').length).toBe(0)
  })

  it('faalt de items-insert, dan wordt de editie weer verwijderd en gooit de schrijver', async () => {
    const uitkomst = matchEditie(PROFIEL_TESSA, ARTIKELEN, ctx())
    const nep = maakNepClient({}, { fouten: { 'krant_editie_items:insert': 'kapot' } })
    await expect(
      schrijfEditie(nep.client as never, { userId: UID, weekKey: '2026-W39', bron: 'schaduw', profiel: PROFIEL_TESSA, uitkomst, now: NU }),
    ).rejects.toThrow(/items schrijven mislukt/)
    expect(nep.rijen('krant_edities').length).toBe(0)
    const del = nep.queriesOp('krant_edities').find((q) => q.stappen.some((s) => s.m === 'delete'))!
    expect(del.stappen.some((s) => s.m === 'eq' && s.args[0] === 'user_id' && s.args[1] === UID)).toBe(true)
  })

  it('itemNaarRij bewaart de kop, bron, url en samenvatting in het snapshot (leesbaar na opruimen van het artikel)', () => {
    const item = matchEditie(PROFIEL_TESSA, ARTIKELEN, ctx()).items[0]
    const rij = itemNaarRij(item, 'e1', UID, 0)
    expect(rij.snapshot).toEqual({ titel: item.titel, rubriek: item.rubriek, bron: item.bron, url: item.url, gepubliceerd: item.gepubliceerd, samenvatting: item.samenvatting })
    expect(rij.wat_mist).toEqual(item.watMist)
    expect(rij.waarom).toEqual(item.waarom)
  })

  it('geldendeEditieId: alleen de niet-vervangen editie van die week en bron, op de eigen user_id', async () => {
    const nep = maakNepClient({
      krant_edities: [
        { id: 'oud', user_id: UID, bron: 'schaduw', week_key: '2026-W39', vervangen_door: 'nieuw', created_at: '2026-09-21T06:00:00Z' },
        { id: 'nieuw', user_id: UID, bron: 'schaduw', week_key: '2026-W39', vervangen_door: null, created_at: '2026-09-22T06:00:00Z' },
        { id: 'ander', user_id: 'user-b', bron: 'schaduw', week_key: '2026-W39', vervangen_door: null, created_at: '2026-09-22T06:00:00Z' },
        { id: 'live', user_id: UID, bron: 'live', week_key: '2026-W39', vervangen_door: null, created_at: '2026-09-22T06:00:00Z' },
      ],
    })
    expect(await geldendeEditieId(nep.client as never, UID, '2026-W39', 'schaduw')).toBe('nieuw')
    expect(await geldendeEditieId(nep.client as never, UID, '2026-W38', 'schaduw')).toBeNull()
    expect(await geldendeEditieId(nep.client as never, 'user-c', '2026-W39', 'schaduw')).toBeNull()
  })

  it('markeerVervangen zet vervangen_door op de oude rij van dezelfde gebruiker', async () => {
    const nep = maakNepClient({ krant_edities: [{ id: 'oud', user_id: UID, vervangen_door: null }] })
    await markeerVervangen(nep.client as never, 'oud', UID, 'nieuw')
    expect(nep.rijen('krant_edities')[0].vervangen_door).toBe('nieuw')
    const upd = nep.queriesOp('krant_edities')[0]
    expect(upd.stappen.some((s) => s.m === 'eq' && s.args[0] === 'user_id' && s.args[1] === UID)).toBe(true)
  })

  it('ruimSchaduwOp wist alleen eigen schaduwedities ouder dan de cap', async () => {
    const oud = new Date(NU.getTime() - (SCHADUW_CAP_WEKEN + 1) * 7 * 24 * 3600 * 1000).toISOString()
    const netBinnen = new Date(NU.getTime() - (SCHADUW_CAP_WEKEN - 1) * 7 * 24 * 3600 * 1000).toISOString()
    const nep = maakNepClient({
      krant_edities: [
        { id: 'e-oud', user_id: UID, bron: 'schaduw', created_at: oud },
        { id: 'e-binnen', user_id: UID, bron: 'schaduw', created_at: netBinnen },
        { id: 'e-live-oud', user_id: UID, bron: 'live', created_at: oud },
        { id: 'e-ander-oud', user_id: 'user-b', bron: 'schaduw', created_at: oud },
      ],
    })
    expect(await ruimSchaduwOp(nep.client as never, UID, NU)).toBe(1)
    expect(nep.rijen('krant_edities').map((r) => r.id).sort()).toEqual(['e-ander-oud', 'e-binnen', 'e-live-oud'])
  })
})
