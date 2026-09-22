import { describe, expect, it } from 'vitest'
import { standaardImpactContext } from './impact'
import { matchEditie } from './matcher'
import { AOW_RIJEN, ARTIKELEN, NU, PROFIEL_TESSA, PROFIEL_DAAN } from './editie.fixture'
import { maakNepClient } from './nep-client.fixture'
import { schrijfEditie, markeerVervangen } from './editie-schrijver'
import { laadTesteditie, TESTEDITIE_ITEM_KOLOMMEN, TESTEDITIE_KOLOMMEN } from './testeditie'

/**
 * De testsectie leest terug wat de cron schreef. De keten wordt hier écht
 * gedraaid (matcher → schrijver → lezer), zodat de test niet op een
 * handgeschreven rij leunt die van de echte kan afwijken.
 */

const UID = 'user-a'
const PARTNER = 'user-b'
const ctx = () => ({
  now: NU,
  gezienArtikelIds: new Set<string>(),
  gedemptRubrieken: new Set<string>(),
  impact: standaardImpactContext(AOW_RIJEN, NU.getUTCFullYear()),
})

async function schrijf(nep: ReturnType<typeof maakNepClient>, userId: string, weekKey: string, profiel = PROFIEL_TESSA) {
  const uitkomst = matchEditie(profiel, ARTIKELEN, ctx())
  expect(uitkomst.leeg).toBe(false)
  const geschreven = await schrijfEditie(nep.client as never, { userId, weekKey, bron: 'schaduw', profiel, uitkomst, now: NU })
  return { uitkomst, geschreven }
}

describe('laadTesteditie', () => {
  it('geeft de geldende schaduweditie terug met haar regels op positie', async () => {
    const nep = maakNepClient({})
    const { uitkomst, geschreven } = await schrijf(nep, UID, '2026-W39')

    const editie = await laadTesteditie(nep.client as never, UID)
    expect(editie).not.toBeNull()
    expect(editie!.id).toBe(geschreven.id)
    expect(editie!.weekKey).toBe('2026-W39')
    expect(editie!.bron).toBe('schaduw')
    expect(editie!.metAi).toBe(false)
    expect(editie!.leeg).toBe(false)
    expect(editie!.profielType).toBe(uitkomst.profielType)
    expect(editie!.profielSnapshot).toEqual(PROFIEL_TESSA)
    expect(editie!.items.map((i) => i.positie)).toEqual(uitkomst.items.map((_, i) => i))
  })

  it('elke regel draagt precies wat de matcher schreef — geen som onderweg', async () => {
    const nep = maakNepClient({})
    const { uitkomst } = await schrijf(nep, UID, '2026-W39')
    const editie = await laadTesteditie(nep.client as never, UID)

    uitkomst.items.forEach((bron, i) => {
      const gelezen = editie!.items[i]
      expect(gelezen.tekst).toBe(bron.tekst)
      expect(gelezen.vorm).toBe(bron.vorm)
      expect(gelezen.score).toBe(bron.score)
      expect(gelezen.mechanisme).toBe(bron.mechanisme)
      expect(gelezen.sjabloonId).toBe(bron.sjabloonId)
      expect(gelezen.variant).toBe(bron.variant)
      expect(gelezen.impact).toEqual(bron.impact ?? null)
      expect(gelezen.slots).toEqual(bron.slots)
      expect(gelezen.waarom).toEqual(bron.waarom)
      expect(gelezen.watMist).toEqual(bron.watMist)
      expect(gelezen.titel).toBe(bron.titel)
      expect(gelezen.url).toBe(bron.url)
      expect(gelezen.samenvatting).toBe(bron.samenvatting)
      expect(gelezen.artikelId).toBe(bron.artikelId)
    })
  })

  it('de editie van een ander account komt er niet in mee (scoping staat in de keten)', async () => {
    const nep = maakNepClient({})
    await schrijf(nep, PARTNER, '2026-W39', PROFIEL_DAAN)
    expect(await laadTesteditie(nep.client as never, UID)).toBeNull()

    await schrijf(nep, UID, '2026-W39')
    const editie = await laadTesteditie(nep.client as never, UID)
    expect(editie!.items.length).toBeGreaterThan(0)
    // De nep-client past de filters daadwerkelijk toe: zou de user_id-scope
    // ontbreken, dan zaten de regels van de ander hier gewoon tussen.
    const scope = nep.queriesOp('krant_editie_items').at(-1)!.stappen.filter((s) => s.m === 'eq')
    expect(scope.map((s) => s.args[0])).toContain('user_id')
  })

  it('een vervangen editie (B4) wint niet van haar opvolger', async () => {
    const nep = maakNepClient({})
    const eerste = await schrijf(nep, UID, '2026-W39')
    const tweede = await schrijf(nep, UID, '2026-W39')
    await markeerVervangen(nep.client as never, eerste.geschreven.id, UID, tweede.geschreven.id)

    const editie = await laadTesteditie(nep.client as never, UID)
    expect(editie!.id).toBe(tweede.geschreven.id)
  })

  it('geen editie → null, geen fout', async () => {
    const nep = maakNepClient({})
    expect(await laadTesteditie(nep.client as never, UID)).toBeNull()
  })

  it('een lege editie komt terug met haar tekst en zonder regels', async () => {
    const nep = maakNepClient({})
    const uitkomst = matchEditie(PROFIEL_TESSA, [], ctx())
    expect(uitkomst.leeg).toBe(true)
    await schrijfEditie(nep.client as never, {
      userId: UID,
      weekKey: '2026-W40',
      bron: 'schaduw',
      profiel: PROFIEL_TESSA,
      uitkomst,
      now: NU,
    })
    const editie = await laadTesteditie(nep.client as never, UID)
    expect(editie!.leeg).toBe(true)
    expect(editie!.items).toEqual([])
    expect(editie!.legeTekst).toBe(uitkomst.legeTekst)
  })

  it('een leesfout wordt luid, niet stil leeg', async () => {
    const nep = maakNepClient({}, { fouten: { 'krant_edities:select': 'kapot' } })
    await expect(laadTesteditie(nep.client as never, UID)).rejects.toThrow(/editie lezen mislukt/)
  })

  it('de kolomlijsten vragen expliciet op wat de sectie toont — geen select(*)', () => {
    for (const lijst of [TESTEDITIE_KOLOMMEN, TESTEDITIE_ITEM_KOLOMMEN]) {
      expect(lijst).not.toContain('*')
      expect(lijst.split(',').length).toBeGreaterThan(5)
    }
    expect(TESTEDITIE_KOLOMMEN).toContain('profiel_snapshot')
    expect(TESTEDITIE_ITEM_KOLOMMEN).toContain('impact')
  })
})
