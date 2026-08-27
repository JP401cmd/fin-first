/**
 * Unit-tests voor de tellers van de import-duplicatenstap (M33).
 * De helpers zijn puur, dus we toetsen ze zonder DOM/render.
 */
import { describe, it, expect } from 'vitest'
import { countImportRows, selectionCounterLabel, type CountableRow } from './import-counters'

const row = (over: Partial<CountableRow> = {}): CountableRow => ({
  isDuplicate: false,
  crossSourceDuplicate: null,
  skipImport: false,
  ...over,
})

describe('countImportRows', () => {
  it('lege lijst telt overal nul', () => {
    expect(countImportRows([])).toEqual({
      newCount: 0,
      dupCount: 0,
      crossSourceCount: 0,
      toImportCount: 0,
      overriddenCount: 0,
    })
  })

  it('classificaties tellen samen op tot het totaal aantal rijen', () => {
    const rows = [
      row(),
      row(),
      row({ isDuplicate: true, skipImport: true }),
      row({ crossSourceDuplicate: { reason: 'iban' }, skipImport: true }),
    ]
    const c = countImportRows(rows)
    expect(c.newCount + c.dupCount + c.crossSourceCount).toBe(rows.length)
    expect(c).toMatchObject({ newCount: 2, dupCount: 1, crossSourceCount: 1, toImportCount: 2 })
  })

  it('het gemelde scenario: zeven duplicaten, één alsnog aangevinkt', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ isDuplicate: true, skipImport: i !== 0 }),
    )
    expect(countImportRows(rows)).toEqual({
      newCount: 0,
      dupCount: 7,
      crossSourceCount: 0,
      toImportCount: 1,
      overriddenCount: 1,
    })
  })

  it('overriddenCount telt alleen aangevinkte duplicaten, niet nieuwe rijen', () => {
    const rows = [
      row(),
      row({ isDuplicate: true, skipImport: false }),
      row({ crossSourceDuplicate: { reason: 'name' }, skipImport: false }),
      row({ isDuplicate: true, skipImport: true }),
    ]
    expect(countImportRows(rows)).toMatchObject({ toImportCount: 3, overriddenCount: 2 })
  })
})

describe('selectionCounterLabel', () => {
  const label = (rows: CountableRow[]) => selectionCounterLabel(countImportRows(rows))

  it('schone import: geen "alsnog", meervoud correct', () => {
    expect(label([row(), row(), row()])).toBe('3 transacties geselecteerd om te importeren')
  })

  it('niets geselecteerd: nul in meervoud, geen "alsnog"', () => {
    expect(label([row({ isDuplicate: true, skipImport: true })])).toBe(
      '0 transacties geselecteerd om te importeren',
    )
  })

  it('alleen overruled duplicaten: enkelvoud + "alsnog"', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ isDuplicate: true, skipImport: i !== 0 }),
    )
    expect(label(rows)).toBe('1 transactie geselecteerd om alsnog te importeren')
  })

  it('mix van nieuw en overruled: benoemt hoeveel er herkend waren', () => {
    const rows = [row(), row(), row({ isDuplicate: true, skipImport: false })]
    expect(label(rows)).toBe(
      '3 transacties geselecteerd om te importeren, waarvan 1 herkend als duplicaat',
    )
  })

  it('cross-bron-duplicaat telt net zo goed als overruled', () => {
    const rows = [row({ crossSourceDuplicate: { reason: 'iban' }, skipImport: false })]
    expect(label(rows)).toBe('1 transactie geselecteerd om alsnog te importeren')
  })
})
