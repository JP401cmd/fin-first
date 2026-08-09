import { describe, it, expect } from 'vitest'
import { buildBelastingBoxCards, type BelastingBoxCardsInput } from './box-cards'

/**
 * BEL-1 — de Box 2-kaart verschijnt alleen bij aanmerkelijk belang, in ÁLLE
 * weergavemodi. Deze suite pint die regel op de bron: dezelfde pure functie die
 * de hub-pagina gebruikt om haar kaartenrij samen te stellen.
 *
 * Waarom hier en niet in een pagina-test: /overzicht/belasting is een async
 * server-component die vier loaders parallel trekt (horizon-bundel, fiscale
 * kansen, auth, profiel). De kaart-samenstelling is daar de enige regel die kan
 * driften; die staat daarom apart en toetsbaar in ./box-cards.ts.
 */
function input(overrides: Partial<BelastingBoxCardsInput> = {}): BelastingBoxCardsInput {
  return {
    box1Tax: 12_000,
    box1Status: 'warn',
    box1StatusText: 'Onbenutte jaarruimte',
    box3Tax: 3_500,
    box3Status: 'good',
    box3StatusText: 'Geen actie nodig',
    hasAanmerkelijkBelang: false,
    ...overrides,
  }
}

describe('buildBelastingBoxCards — BEL-1: Box 2 alleen bij aanmerkelijk belang', () => {
  it('laat de Box 2-kaart weg zonder aanmerkelijk belang (twee kaarten)', () => {
    const cards = buildBelastingBoxCards(input({ hasAanmerkelijkBelang: false }))

    expect(cards.map((c) => c.number)).toEqual(['1', '3'])
    // Geen lege kaart meer: de "—"-KPI met "Geen aanmerkelijk belang" bestaat
    // niet langer als kaart-inhoud.
    expect(cards.some((c) => c.href === '/overzicht/belasting/box2')).toBe(false)
    expect(cards.map((c) => c.statusText)).not.toContain('Geen aanmerkelijk belang')
  })

  it('toont de Box 2-kaart mét aanmerkelijk belang, op de tweede plek', () => {
    const cards = buildBelastingBoxCards(input({ hasAanmerkelijkBelang: true }))

    expect(cards.map((c) => c.number)).toEqual(['1', '2', '3'])
    const box2 = cards[1]
    expect(box2.href).toBe('/overzicht/belasting/box2')
    // Geen substatus meer: de aanwezigheid van de kaart ís het signaal, en een
    // tekst zou alleen het label "Aanmerkelijk belang" erboven herhalen.
    expect(box2.statusText).toBeNull()
    // De hub rekent Box 2 bewust niet door — de KPI blijft leeg, het bedrag
    // staat op de box2-subpagina.
    expect(box2.tax).toBeNull()
    expect(box2.status).toBe('neutral')
  })

  it('geeft de Box 1- en Box 3-cijfers ONGEWIJZIGD door (geen herberekening)', () => {
    const src = input({ box1Tax: 9_876, box3Tax: 1_234, hasAanmerkelijkBelang: true })
    const cards = buildBelastingBoxCards(src)

    const box1 = cards.find((c) => c.number === '1')!
    const box3 = cards.find((c) => c.number === '3')!
    expect(box1.tax).toBe(src.box1Tax)
    expect(box1.status).toBe(src.box1Status)
    expect(box1.statusText).toBe(src.box1StatusText)
    expect(box3.tax).toBe(src.box3Tax)
    expect(box3.status).toBe(src.box3Status)
    expect(box3.statusText).toBe(src.box3StatusText)
  })

  it('houdt de routes intact — de Box 2-pagina blijft bereikbaar, alleen de tegel verdwijnt', () => {
    const zonder = buildBelastingBoxCards(input({ hasAanmerkelijkBelang: false }))
    const met = buildBelastingBoxCards(input({ hasAanmerkelijkBelang: true }))

    // De overige twee kaarten wijzen in beide standen naar dezelfde subpagina's.
    expect(zonder.map((c) => c.href)).toEqual([
      '/overzicht/belasting/box1',
      '/overzicht/belasting/box3',
    ])
    expect(met.map((c) => c.href)).toEqual([
      '/overzicht/belasting/box1',
      '/overzicht/belasting/box2',
      '/overzicht/belasting/box3',
    ])
  })
})
