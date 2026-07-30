/**
 * Unit-tests voor de "alles selecteren"-logica van de import-duplicatenstap (B-07).
 * De helpers zijn puur, dus we toetsen ze zonder DOM/render.
 */
import { describe, it, expect } from 'vitest'
import { isDefaultExcluded, selectAllState, withAllSkip, type SkippableRow } from './select-all'

const rows = (flags: boolean[]): SkippableRow[] => flags.map((skipImport) => ({ skipImport }))

describe('selectAllState', () => {
  it('lege lijst: niets geselecteerd, niet indeterminate', () => {
    expect(selectAllState([])).toEqual({
      allSelected: false,
      someSelected: false,
      indeterminate: false,
    })
  })

  it('alle rijen te importeren (skipImport=false): allSelected, niet indeterminate', () => {
    expect(selectAllState(rows([false, false, false]))).toEqual({
      allSelected: true,
      someSelected: true,
      indeterminate: false,
    })
  })

  it('alle rijen overgeslagen (skipImport=true): niets geselecteerd, niet indeterminate', () => {
    expect(selectAllState(rows([true, true]))).toEqual({
      allSelected: false,
      someSelected: false,
      indeterminate: false,
    })
  })

  it('deels geselecteerd: indeterminate', () => {
    expect(selectAllState(rows([false, true, false]))).toEqual({
      allSelected: false,
      someSelected: true,
      indeterminate: true,
    })
  })

  it('één rij, geselecteerd: allSelected zonder indeterminate', () => {
    expect(selectAllState(rows([false]))).toEqual({
      allSelected: true,
      someSelected: true,
      indeterminate: false,
    })
  })
})

describe('withAllSkip', () => {
  it('deselecteert alles (skip=true) zonder de input te muteren', () => {
    const input = rows([false, true, false])
    const out = withAllSkip(input, true)
    expect(out.every((r) => r.skipImport)).toBe(true)
    // input ongewijzigd
    expect(input.map((r) => r.skipImport)).toEqual([false, true, false])
  })

  it('selecteert alles (skip=false)', () => {
    const out = withAllSkip(rows([true, true, false]), false)
    expect(out.every((r) => !r.skipImport)).toBe(true)
  })

  it('behoudt overige velden op de rij', () => {
    const input = [{ skipImport: true, id: 'a', amount: -10 }]
    const out = withAllSkip(input, false)
    expect(out[0]).toEqual({ skipImport: false, id: 'a', amount: -10 })
  })

  it('is een no-op qua identiteit maar levert nieuwe objecten (immutably)', () => {
    const input = rows([false])
    const out = withAllSkip(input, false)
    expect(out).not.toBe(input)
    expect(out[0]).not.toBe(input[0])
  })
})

/**
 * Dedup-laag 2 (fase 3/B7). Een cross-bron-duplicaat is dezelfde boeking die al
 * via de bankkoppeling binnenkwam; die staat voorgedeselecteerd en mag niet per
 * ongeluk met één bulk-klik alsnog een dubbele reeks opleveren. Bewust
 * aanvinken blijft wél mogelijk — het oordeel is overrulebaar.
 */
describe('cross-bron-duplicaten in de standaardselectie', () => {
  const dup = (skipImport: boolean): SkippableRow => ({
    skipImport,
    crossSourceDuplicate: { reason: 'iban' },
  })

  it('herkent welke rijen standaard buiten een bulk-selectie vallen', () => {
    expect(isDefaultExcluded({ skipImport: false })).toBe(false)
    expect(isDefaultExcluded({ skipImport: false, crossSourceDuplicate: null })).toBe(false)
    expect(isDefaultExcluded(dup(true))).toBe(true)
  })

  it('"alles selecteren" laat een cross-bron-duplicaat uitgevinkt', () => {
    const out = withAllSkip([{ skipImport: false }, dup(true), { skipImport: true }], false)
    expect(out.map((r) => r.skipImport)).toEqual([false, true, false])
  })

  it('"alles deselecteren" raakt ze net zo goed', () => {
    const out = withAllSkip([{ skipImport: false }, dup(false)], true)
    expect(out.every((r) => r.skipImport)).toBe(true)
  })

  it('een uitgevinkte cross-bron-duplicaat houdt de kop-checkbox niet eeuwig indeterminate', () => {
    expect(selectAllState([{ skipImport: false }, dup(true)])).toEqual({
      allSelected: true,
      someSelected: true,
      indeterminate: false,
    })
  })

  it('een handmatig aangevinkte cross-bron-duplicaat blijft aangevinkt tot de gebruiker zelf deselecteert', () => {
    const state = selectAllState([{ skipImport: false }, dup(false)])
    expect(state).toEqual({ allSelected: true, someSelected: true, indeterminate: false })
    // …en een gewone niet-geselecteerde rij maakt het geheel wél indeterminate.
    expect(selectAllState([{ skipImport: true }, dup(false)]).indeterminate).toBe(true)
  })
})
