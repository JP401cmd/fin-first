/**
 * De selectie-statemachine van transactie-bulkbewerken.
 *
 * De eerste twee blokken toetsen de regel waar dit soort schermen op stukgaat:
 * de kopcheckbox mag NOOIT meer pakken dan de zichtbare pagina, en "alle N" is
 * een aparte, expliciete handeling. Shopify Polaris draagt precies daar een
 * openstaande bug; bij een hard delete zonder prullenbak (besluit B1) is dat het
 * verschil tussen een correctie en dataverlies.
 */
import { describe, it, expect } from 'vitest'
import {
  EMPTY_SELECTION,
  headerState,
  isRowSelected,
  selectAllMatching,
  selectRange,
  selectionCount,
  shouldOfferSelectAll,
  togglePage,
  toggleRow,
} from './selection-model'

/** 50 zichtbare rijen uit een verzameling van 340 treffers (AC2/AC3). */
const PAGE = Array.from({ length: 50 }, (_, i) => `id-${i}`)
const TOTAL = 340

describe('kopcheckbox — uitsluitend de zichtbare pagina', () => {
  it('zet precies de 50 rijen van de pagina, niet de 340 treffers', () => {
    const sel = togglePage(EMPTY_SELECTION, PAGE)
    expect(sel.ids.size).toBe(50)
    expect(selectionCount(sel, TOTAL)).toBe(50)
    expect(sel.allMatching).toBe(false)
  })

  it('raakt geen id van een andere pagina aan', () => {
    const withOffPage = toggleRow(EMPTY_SELECTION, 'id-van-pagina-2', PAGE)
    const sel = togglePage(withOffPage, PAGE)
    expect(sel.ids.has('id-van-pagina-2')).toBe(true)
    expect(sel.ids.size).toBe(51)

    // Nog een keer: de pagina gaat eraf, de vreemde id blijft staan.
    const off = togglePage(sel, PAGE)
    expect(off.ids.size).toBe(1)
    expect(off.ids.has('id-van-pagina-2')).toBe(true)
  })

  it('kent drie standen: leeg, indeterminate, vol', () => {
    expect(headerState(EMPTY_SELECTION, PAGE)).toBe('empty')
    expect(headerState(toggleRow(EMPTY_SELECTION, PAGE[0], PAGE), PAGE)).toBe('indeterminate')
    expect(headerState(togglePage(EMPTY_SELECTION, PAGE), PAGE)).toBe('full')
  })

  it('is leeg wanneer er geen rijen zijn', () => {
    expect(headerState(EMPTY_SELECTION, [])).toBe('empty')
    expect(togglePage(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION)
  })
})

describe('"alle N" is apart, nooit de standaard', () => {
  it('verschijnt pas als de hele pagina vol is én er meer treffers zijn', () => {
    expect(shouldOfferSelectAll(EMPTY_SELECTION, PAGE, TOTAL)).toBe(false)
    const half = toggleRow(EMPTY_SELECTION, PAGE[0], PAGE)
    expect(shouldOfferSelectAll(half, PAGE, TOTAL)).toBe(false)
    const vol = togglePage(EMPTY_SELECTION, PAGE)
    expect(shouldOfferSelectAll(vol, PAGE, TOTAL)).toBe(true)
  })

  it('verschijnt niet wanneer de pagina álle treffers al toont', () => {
    const vol = togglePage(EMPTY_SELECTION, PAGE)
    expect(shouldOfferSelectAll(vol, PAGE, PAGE.length)).toBe(false)
  })

  it('telt pas 340 ná de expliciete keuze — de kopcheckbox doet dat niet', () => {
    const vol = togglePage(EMPTY_SELECTION, PAGE)
    expect(selectionCount(vol, TOTAL)).toBe(50)

    const alles = selectAllMatching()
    expect(alles.allMatching).toBe(true)
    expect(selectionCount(alles, TOTAL)).toBe(340)
    expect(shouldOfferSelectAll(alles, PAGE, TOTAL)).toBe(false)
  })

  it('valt bij een rij-klik terug naar de zichtbare pagina', () => {
    const alles = selectAllMatching()
    expect(isRowSelected(alles, PAGE[3])).toBe(true)

    const na = toggleRow(alles, PAGE[3], PAGE)
    expect(na.allMatching).toBe(false)
    expect(na.ids.size).toBe(49)
    expect(na.ids.has(PAGE[3])).toBe(false)
    expect(selectionCount(na, TOTAL)).toBe(49)
  })
})

describe('shift-klik selecteert een aaneengesloten bereik', () => {
  it('selecteert van anker tot en met de aangeklikte rij', () => {
    const start = toggleRow(EMPTY_SELECTION, PAGE[2], PAGE)
    const range = selectRange(start, PAGE[6], PAGE)
    expect([...range.ids].sort()).toEqual(PAGE.slice(2, 7).sort())
  })

  it('werkt ook omhoog en houdt het anker vast', () => {
    const start = toggleRow(EMPTY_SELECTION, PAGE[8], PAGE)
    const range = selectRange(start, PAGE[4], PAGE)
    expect([...range.ids].sort()).toEqual(PAGE.slice(4, 9).sort())
    expect(range.anchorId).toBe(PAGE[8])
  })

  it('haalt nooit rijen uit de selectie', () => {
    const start = toggleRow(EMPTY_SELECTION, PAGE[8], PAGE)
    const range = selectRange(start, PAGE[4], PAGE)
    // Shift-klik binnen een al geselecteerd bereik laat de selectie intact —
    // een modifier-toets mag hier niets stilzwijgend uitzetten.
    const again = selectRange(range, PAGE[6], PAGE)
    expect([...again.ids].sort()).toEqual(PAGE.slice(4, 9).sort())
  })

  it('valt zonder anker terug op een gewone toggle', () => {
    const sel = selectRange(EMPTY_SELECTION, PAGE[5], PAGE)
    expect(sel.ids.size).toBe(1)
    expect(sel.ids.has(PAGE[5])).toBe(true)
  })
})
