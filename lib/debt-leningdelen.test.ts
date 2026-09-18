import { describe, it, expect } from 'vitest'
import {
  groepeerLeningdelen,
  ledenVanEntry,
  leningdelenLabel,
  type LeningdeelRij,
} from './debt-leningdelen'

type Rij = LeningdeelRij & { saldo: number }

const U = 'user-1'
const P = 'user-2'

function rij(id: string, saldo: number, parent: string | null = null, user = U): Rij {
  return { id, user_id: user, parent_debt_id: parent, saldo }
}

const saldoVan = (r: Rij) => r.saldo

describe('groepeerLeningdelen', () => {
  it('hangt delen onder hun hoofdrij en houdt de invoervolgorde', () => {
    const rijen = [
      rij('auto', 12_000),
      rij('hyp-a', 200_000),
      rij('hyp-b', 100_000, 'hyp-a'),
      rij('hyp-c', 50_000, 'hyp-a'),
    ]
    const entries = groepeerLeningdelen(rijen, saldoVan)

    expect(entries.map((e) => e.kind)).toEqual(['enkel', 'groep'])
    const groep = entries[1]
    if (groep.kind !== 'groep') throw new Error('verwacht een groep')
    expect(groep.hoofd.id).toBe('hyp-a')
    expect(groep.delen.map((d) => d.id)).toEqual(['hyp-b', 'hyp-c'])
    expect(groep.leden.map((d) => d.id)).toEqual(['hyp-a', 'hyp-b', 'hyp-c'])
  })

  it('telt de hoofdrij precies één keer mee in het groepstotaal', () => {
    // De hoofdrij is zelf een leningdeel en draagt alleen zijn eigen saldo —
    // zou hij het groepstotaal dragen, dan telde elk bedrag dubbel.
    const rijen = [rij('hyp-a', 200_000), rij('hyp-b', 100_000, 'hyp-a')]
    const entries = groepeerLeningdelen(rijen, saldoVan)
    const groep = entries[0]
    if (groep.kind !== 'groep') throw new Error('verwacht een groep')
    expect(groep.totaal).toBe(300_000)
  })

  it('laat de som over alle entries gelijk aan de som over de invoer', () => {
    const rijen = [
      rij('auto', 12_000),
      rij('hyp-a', 200_000),
      rij('hyp-b', 100_000, 'hyp-a'),
      rij('hyp-c', 50_000, 'hyp-a'),
      rij('studie', 8_000),
    ]
    const invoerSom = rijen.reduce((s, r) => s + r.saldo, 0)
    const entries = groepeerLeningdelen(rijen, saldoVan)
    const entrySom = entries.reduce(
      (s, e) => s + (e.kind === 'groep' ? e.totaal : e.debt.saldo),
      0,
    )
    expect(entrySom).toBe(invoerSom)

    // En elke rij verschijnt precies één keer op het scherm.
    const getoond = entries.flatMap(ledenVanEntry).map((r) => r.id)
    expect(getoond.sort()).toEqual(rijen.map((r) => r.id).sort())
  })

  it('rendert een deel zelfstandig wanneer de hoofdrij niet in de lijst zit', () => {
    // Bv. de hoofdrij is inactief, heeft saldo 0, of valt buiten het filter —
    // het bedrag mag dan niet van het scherm vallen.
    const rijen = [rij('hyp-b', 100_000, 'hyp-weg')]
    const entries = groepeerLeningdelen(rijen, saldoVan)
    expect(entries).toEqual([{ kind: 'enkel', debt: rijen[0] }])
  })

  it('groepeert nooit over eigenaars heen', () => {
    // De samengestelde FK (parent_debt_id, user_id) maakt dit in de database
    // onmogelijk; in een huishoudlijst met partnerrijen mag de code die
    // invariant niet alsnog omzeilen.
    const rijen = [rij('hyp-a', 200_000, null, U), rij('hyp-b', 100_000, 'hyp-a', P)]
    const entries = groepeerLeningdelen(rijen, saldoVan)
    expect(entries.map((e) => e.kind)).toEqual(['enkel', 'enkel'])
  })

  it('weigert een keten van twee niveaus diep', () => {
    // De database houdt de boom één niveau diep (trg_debts_leningdeel_guard);
    // deze controle is de defensieve dubbelganger.
    const rijen = [
      rij('hyp-a', 200_000),
      rij('hyp-b', 100_000, 'hyp-a'),
      rij('hyp-c', 50_000, 'hyp-b'),
    ]
    const entries = groepeerLeningdelen(rijen, saldoVan)
    expect(entries.map((e) => e.kind)).toEqual(['groep', 'enkel'])
    const groep = entries[0]
    if (groep.kind !== 'groep') throw new Error('verwacht een groep')
    expect(groep.delen.map((d) => d.id)).toEqual(['hyp-b'])
    expect(groep.totaal).toBe(300_000)
  })

  it('negeert een zelfverwijzing', () => {
    const rijen = [rij('hyp-a', 200_000, 'hyp-a')]
    const entries = groepeerLeningdelen(rijen, saldoVan)
    expect(entries).toEqual([{ kind: 'enkel', debt: rijen[0] }])
  })

  it('past de waardefunctie van de host toe (perspectief-weging)', () => {
    const rijen = [rij('hyp-a', 200_000), rij('hyp-b', 100_000, 'hyp-a')]
    const entries = groepeerLeningdelen(rijen, (r) => r.saldo * 0.5)
    const groep = entries[0]
    if (groep.kind !== 'groep') throw new Error('verwacht een groep')
    expect(groep.totaal).toBe(150_000)
  })
})

describe('leningdelenLabel', () => {
  it('enkelvoud en meervoud', () => {
    expect(leningdelenLabel(1)).toBe('1 leningdeel')
    expect(leningdelenLabel(3)).toBe('3 leningdelen')
  })
})
