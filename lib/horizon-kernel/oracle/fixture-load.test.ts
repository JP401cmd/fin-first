import { afterAll, describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  columnLettersToIndex,
  findSheet,
  getCell,
  getSheet,
  listFixtures,
  loadFixture,
  parseCellRef,
} from './fixture-load'
import { collectSchemaProblems, isOracleFixture, type OracleFixture } from './fixture-types'
import {
  compareGrid,
  DEFAULT_TOLERANCE,
  MAX_MISMATCH_SAMPLES,
  summarizeComparisons,
  type GridComparison,
} from './compare'

/**
 * Unit-tests voor het oracle-harnas op een zelfgemaakte mini-fixture (geen
 * echte Excel-extractie nodig): loader → gzip-roundtrip, A1-adressering incl.
 * kolommen voorbij Z, en de pure comparator (tolerantie-randen, null↔0).
 */

// ── Mini-fixture-bouwers ─────────────────────────────────────────────────────

/** Een geldige minimale fixture; `sheets` optioneel te overschrijven. */
function makeFixture(overrides: Partial<OracleFixture> = {}): OracleFixture {
  const base: OracleFixture = {
    meta: {
      fixtureVersion: 1,
      scenario: 'mini',
      description: 'Zelfgemaakte mini-fixture voor unit-tests',
      sourceFile: 'Core calc v5.xlsm',
      sourceLastWriteTime: '2026-07-02T12:24:53.000Z',
      sourceSha256: 'a'.repeat(64),
      extractedAt: '2026-07-02T13:00:00.000Z',
      overrides: [],
      macros: ['BepaalFIRE'],
      solver: { fireAge: 55, gap: 0, statusText: 'reached_at', staleText: 'solver actueel' },
      controleK1: 'OK — alles sluit',
      warnings: [],
    },
    sheets: {
      // Brede eerste rij (30 kolommen: waarde === kolomindex) om A1-parsing
      // voorbij Z te testen.
      Mini: {
        range: 'A1:AD2',
        values: [Array.from({ length: 30 }, (_, i) => i), ['x', 'y', 'z']],
      },
    },
  }
  return { ...base, ...overrides }
}

/** Gzip een fixture en schrijf 'm naar een tmp-bestand; geeft het pad terug. */
function writeFixtureFile(dir: string, name: string, fixture: OracleFixture): string {
  const filePath = join(dir, name)
  writeFileSync(filePath, gzipSync(Buffer.from(JSON.stringify(fixture), 'utf-8')))
  return filePath
}

// Eén tmp-map voor de disk-gebonden tests; opgeruimd na afloop.
const TMP = mkdtempSync(join(tmpdir(), 'horizon-oracle-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

// ── loadFixture + listFixtures ───────────────────────────────────────────────

describe('loadFixture — gzip-roundtrip', () => {
  it('laadt een geldige fixture en behoudt meta + sheets', () => {
    const path = writeFixtureFile(TMP, 'mini.json.gz', makeFixture())
    const fx = loadFixture(path)
    expect(fx.meta.scenario).toBe('mini')
    expect(fx.meta.fixtureVersion).toBe(1)
    expect(isOracleFixture(fx)).toBe(true)
    expect(getSheet(fx, 'Mini').values[1]).toEqual(['x', 'y', 'z'])
  })

  it('gooit een duidelijke fout bij een ontbrekend bestand', () => {
    expect(() => loadFixture(join(TMP, 'bestaat-niet.json.gz'))).toThrow(/niet gevonden/i)
  })

  it('gooit een gzip-fout bij niet-gzip-inhoud', () => {
    const path = join(TMP, 'geen-gzip.json.gz')
    writeFileSync(path, Buffer.from('dit is geen gzip', 'utf-8'))
    expect(() => loadFixture(path)).toThrow(/geldige gzip/i)
  })

  it('gooit een JSON-fout bij gzip van kapotte JSON', () => {
    const path = join(TMP, 'kapotte-json.json.gz')
    writeFileSync(path, gzipSync(Buffer.from('{ niet: geldig', 'utf-8')))
    expect(() => loadFixture(path)).toThrow(/geldige JSON/i)
  })

  it('gooit een schema-fout met probleembeschrijving bij een mismatch', () => {
    const path = join(TMP, 'fout-schema.json.gz')
    // fixtureVersion als string i.p.v. number → schema-mismatch.
    const broken = { meta: { fixtureVersion: '1' }, sheets: {} }
    writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(broken), 'utf-8')))
    expect(() => loadFixture(path)).toThrow(/schema/i)
  })
})

describe('listFixtures', () => {
  it('sorteert alleen *.json.gz-bestanden', () => {
    const dir = mkdtempSync(join(tmpdir(), 'horizon-oracle-list-'))
    writeFixtureFile(dir, 'b.json.gz', makeFixture())
    writeFixtureFile(dir, 'a.json.gz', makeFixture())
    writeFileSync(join(dir, 'negeer.txt'), 'x')
    const found = listFixtures(dir).map((p) => p.split(/[\\/]/).pop())
    expect(found).toEqual(['a.json.gz', 'b.json.gz'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('geeft een lege lijst voor een niet-bestaande map (geen fout)', () => {
    expect(listFixtures(join(TMP, 'bestaat-niet'))).toEqual([])
  })
})

// ── A1-adressering ───────────────────────────────────────────────────────────

describe('columnLettersToIndex — bijectief base-26', () => {
  it.each([
    ['A', 0],
    ['B', 1],
    ['Z', 25],
    ['AA', 26],
    ['AB', 27],
    ['AZ', 51],
    ['BA', 52],
    ['ZZ', 701],
    ['AAA', 702],
  ] as const)('%s → %i', (letters, index) => {
    expect(columnLettersToIndex(letters)).toBe(index)
  })

  it('gooit bij lege of niet-alfabetische invoer', () => {
    expect(() => columnLettersToIndex('')).toThrow()
    expect(() => columnLettersToIndex('A1')).toThrow()
  })
})

describe('parseCellRef', () => {
  it('ontleedt een simpele referentie', () => {
    expect(parseCellRef('P!B16')).toEqual({ sheet: 'P', colIndex: 1, rowIndex: 15 })
  })

  it('ondersteunt tabnamen met spaties/koppeltekens', () => {
    expect(parseCellRef('Toename en afname!AB1200')).toEqual({
      sheet: 'Toename en afname',
      colIndex: 27,
      rowIndex: 1199,
    })
  })

  it('gooit bij een onparseerbaar adres', () => {
    expect(() => parseCellRef('P16')).toThrow(/ongeldige cel/i)
  })
})

describe('getCell — A1-lookup incl. kolommen voorbij Z', () => {
  const fx = makeFixture()

  it.each([
    ['Mini!A1', 0],
    ['Mini!Z1', 25],
    ['Mini!AA1', 26],
    ['Mini!AB1', 27],
    ['Mini!AD1', 29],
  ] as const)('%s → %i', (ref, waarde) => {
    expect(getCell(fx, ref)).toBe(waarde)
  })

  it('geeft null buiten het gedumpte bereik (kolom voorbij de rij)', () => {
    expect(getCell(fx, 'Mini!AE1')).toBeNull()
  })

  it('geeft null voor een rij voorbij het grid', () => {
    expect(getCell(fx, 'Mini!A99')).toBeNull()
  })

  it('gebruikt genormaliseerde tab-lookup (case-insensitief, trim)', () => {
    expect(getCell(fx, '  mini  !A1')).toBe(0)
    expect(findSheet(fx, 'MINI')).toBe(getSheet(fx, 'Mini'))
  })

  it('gooit een duidelijke fout voor een onbekende tab', () => {
    expect(() => getCell(fx, 'Onbekend!A1')).toThrow(/niet gevonden/i)
  })
})

// ── collectSchemaProblems / isOracleFixture ──────────────────────────────────

describe('collectSchemaProblems', () => {
  it('is leeg voor een geldige fixture', () => {
    expect(collectSchemaProblems(makeFixture())).toEqual([])
  })

  it('benoemt ontbrekende meta-velden', () => {
    const problems = collectSchemaProblems({ sheets: {} })
    expect(problems.some((p) => p.includes('meta'))).toBe(true)
  })

  it('signaleert een niet-toegestane celwaarde', () => {
    const bad = makeFixture()
    // Bewust een object in het grid injecteren (buiten CellValue).
    ;(bad.sheets.Mini.values[0] as unknown[])[0] = { nope: true }
    expect(collectSchemaProblems(bad).some((p) => p.includes('celwaarde'))).toBe(true)
  })
})

// ── compareGrid ──────────────────────────────────────────────────────────────

describe('compareGrid — tolerantie', () => {
  it('gebruikt default-tolerantie 0,01', () => {
    expect(DEFAULT_TOLERANCE).toBe(0.01)
  })

  it('binnen tolerantie (0,01) → geen mismatch', () => {
    const cmp = compareGrid([[0]], [[0.01]])
    expect(cmp.mismatchCount).toBe(0)
    expect(cmp.maxAbsDiff).toBe(0)
  })

  it('net boven tolerantie → mismatch met numerieke diff', () => {
    const cmp = compareGrid([[0]], [[0.02]])
    expect(cmp.mismatchCount).toBe(1)
    expect(cmp.maxAbsDiff).toBeCloseTo(0.02, 10)
    expect(cmp.mismatches[0]).toMatchObject({ row: 0, col: 0, expected: 0, actual: 0.02 })
    expect(cmp.mismatches[0].diff).toBeCloseTo(0.02, 10)
  })

  it('respecteert een aangepaste tolerantie', () => {
    expect(compareGrid([[1]], [[1.5]], { tolerance: 0.5 }).mismatchCount).toBe(0)
    expect(compareGrid([[1]], [[1.5]], { tolerance: 0.4 }).mismatchCount).toBe(1)
  })
})

describe('compareGrid — null↔0 en type-verschillen (structureel)', () => {
  it('null↔0 is een expliciete mismatch met diff=null', () => {
    const cmp = compareGrid([[null]], [[0]])
    expect(cmp.mismatchCount).toBe(1)
    expect(cmp.mismatches[0].diff).toBeNull()
    expect(cmp.maxAbsDiff).toBe(0) // structureel telt niet mee in maxAbsDiff
  })

  it('0↔null is óók een mismatch', () => {
    expect(compareGrid([[0]], [[null]]).mismatchCount).toBe(1)
  })

  it('null↔null is gelijk', () => {
    expect(compareGrid([[null]], [[null]]).mismatchCount).toBe(0)
  })

  it('string vs number is een mismatch', () => {
    expect(compareGrid([['5']], [[5]]).mismatchCount).toBe(1)
  })
})

describe('compareGrid — strings, booleans en vorm', () => {
  it('vergelijkt strings exact', () => {
    expect(compareGrid([['OK']], [['OK']]).mismatchCount).toBe(0)
    expect(compareGrid([['OK']], [['ok']]).mismatchCount).toBe(1)
  })

  it('vergelijkt booleans exact', () => {
    expect(compareGrid([[true]], [[true]]).mismatchCount).toBe(0)
    expect(compareGrid([[true]], [[false]]).mismatchCount).toBe(1)
  })

  it('ontbrekende cel telt als null (vorm-verschil wordt zichtbaar)', () => {
    // actual mist kolom 1 → null↔2 mismatch.
    const cmp = compareGrid([[1, 2]], [[1]])
    expect(cmp.cellCount).toBe(2)
    expect(cmp.mismatchCount).toBe(1)
    expect(cmp.mismatches[0]).toMatchObject({ row: 0, col: 1, expected: 2, actual: null })
  })
})

describe('compareGrid — cap op mismatch-voorbeelden', () => {
  it('capt mismatches op MAX_MISMATCH_SAMPLES maar telt door', () => {
    const expected = [Array.from({ length: 100 }, () => 0)]
    const actual = [Array.from({ length: 100 }, () => 100)]
    const cmp = compareGrid(expected, actual)
    expect(cmp.cellCount).toBe(100)
    expect(cmp.mismatchCount).toBe(100)
    expect(cmp.mismatches).toHaveLength(MAX_MISMATCH_SAMPLES)
    expect(cmp.maxAbsDiff).toBe(100)
  })
})

// ── summarizeComparisons ─────────────────────────────────────────────────────

describe('summarizeComparisons', () => {
  it('vat schone + vuile tabellen samen en wijst de slechtste aan', () => {
    const schoon: GridComparison = compareGrid([[1, 2]], [[1, 2]])
    const vuil: GridComparison = compareGrid([[0, 0, 0]], [[5, 6, 0]])
    const sum = summarizeComparisons({ CF: schoon, Bel: vuil })

    expect(sum.tableCount).toBe(2)
    expect(sum.totalCells).toBe(schoon.cellCount + vuil.cellCount)
    expect(sum.totalMismatches).toBe(2)
    expect(sum.maxAbsDiff).toBe(6)
    expect(sum.worstTable).toBe('Bel')
    expect(sum.ok).toBe(false)
    expect(sum.perTable.CF.mismatchCount).toBe(0)
  })

  it('ok=true en worstTable=null als alles klopt', () => {
    const sum = summarizeComparisons({ CF: compareGrid([[1]], [[1]]) })
    expect(sum.ok).toBe(true)
    expect(sum.worstTable).toBeNull()
  })
})
