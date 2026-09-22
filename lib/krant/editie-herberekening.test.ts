import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./editie-run', () => ({ runEditieVoor: vi.fn() }))
vi.mock('./editie-loader', () => ({ laadKandidaten: vi.fn(async () => ({ artikelen: [], ongeldig: 0 })) }))
vi.mock('@/lib/reference-cache', () => ({ getAowLeeftijden: vi.fn(async () => []) }))

import { runEditieVoor } from './editie-run'
import { maakNepClient } from './nep-client.fixture'
import { herberekenNaTerugtrekking, vindGeraakteEdities } from './editie-herberekening'

const runMock = vi.mocked(runEditieVoor)
/** Maandag 21 sep 2026 = ISO-week 2026-W39 (Amsterdam). */
const NU = new Date('2026-09-21T10:00:00Z')
const ARTIKEL = 'artikel-x'

function tabellen() {
  return {
    krant_edities: [
      // Geldende editie van deze week → wordt herberekend.
      { id: 'e-nu', user_id: 'user-a', bron: 'schaduw', week_key: '2026-W39', vervangen_door: null },
      // Vorige week → momentopname, ongemoeid.
      { id: 'e-vorige', user_id: 'user-b', bron: 'schaduw', week_key: '2026-W38', vervangen_door: null },
      // Deze week maar al vervangen → niet nog eens.
      { id: 'e-oud', user_id: 'user-c', bron: 'schaduw', week_key: '2026-W39', vervangen_door: 'e-nieuwer' },
      // Deze week, zonder dit artikel → niet geraakt.
      { id: 'e-los', user_id: 'user-d', bron: 'schaduw', week_key: '2026-W39', vervangen_door: null },
    ],
    krant_editie_items: [
      { id: 'i1', editie_id: 'e-nu', user_id: 'user-a', article_id: ARTIKEL, positie: 0 },
      { id: 'i2', editie_id: 'e-nu', user_id: 'user-a', article_id: 'ander', positie: 1 },
      { id: 'i3', editie_id: 'e-vorige', user_id: 'user-b', article_id: ARTIKEL, positie: 0 },
      { id: 'i4', editie_id: 'e-oud', user_id: 'user-c', article_id: ARTIKEL, positie: 0 },
      { id: 'i5', editie_id: 'e-los', user_id: 'user-d', article_id: 'ander', positie: 0 },
    ],
  }
}

beforeEach(() => {
  runMock.mockReset()
  runMock.mockResolvedValue({ editieId: 'e-nieuw', profielType: 'x', leeg: false, items: 1, overlap: null })
})

describe('herberekening na terugtrekken (B4)', () => {
  it('vindt alleen de geldende edities van de lopende week waarin het artikel staat', async () => {
    const nep = maakNepClient(tabellen())
    const geraakt = await vindGeraakteEdities(nep.client as never, ARTIKEL, '2026-W39')
    expect(geraakt.length).toBe(1)
    expect(geraakt[0]).toMatchObject({ id: 'e-nu', user_id: 'user-a', bron: 'schaduw' })
  })

  it('draait de keten opnieuw zonder het artikel en zet vervangen_door op de oude editie', async () => {
    const nep = maakNepClient(tabellen())
    const res = await herberekenNaTerugtrekking(nep.client as never, ARTIKEL, { now: NU })
    expect(res).toEqual({ edities: 1 })
    expect(runMock).toHaveBeenCalledTimes(1)
    expect(runMock.mock.calls[0][1]).toMatchObject({ userId: 'user-a', weekKey: '2026-W39', bron: 'schaduw', uitsluitArtikelId: ARTIKEL })
    const rij = (id: string) => nep.rijen('krant_edities').find((r) => r.id === id)!
    expect(rij('e-nu').vervangen_door).toBe('e-nieuw')
    expect(rij('e-vorige').vervangen_door).toBeNull()
    expect(rij('e-oud').vervangen_door).toBe('e-nieuwer')
    expect(rij('e-los').vervangen_door).toBeNull()
  })

  it('zonder geraakte editie: niets herberekend, niets gelezen buiten de meta-kolommen', async () => {
    const nep = maakNepClient(tabellen())
    const res = await herberekenNaTerugtrekking(nep.client as never, 'onbekend-artikel', { now: NU })
    expect(res).toEqual({ edities: 0 })
    expect(runMock).not.toHaveBeenCalled()
    expect(nep.queries.map((q) => q.table)).toEqual(['krant_editie_items'])
  })
})
