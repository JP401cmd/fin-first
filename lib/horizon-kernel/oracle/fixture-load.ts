/**
 * Horizon-kernel · Excel-oracle — fixture-loader.
 *
 * **Node/test/server-only.** Dit bestand importeert `node:fs`/`node:zlib` en
 * mag NIET in een client-bundle terechtkomen. De pure comparator (`compare.ts`)
 * en de typen (`fixture-types.ts`) zijn wél client-veilig; de latere
 * beheer-VERIFICATIE-pagina laadt fixtures uitsluitend server-side.
 *
 * Verantwoordelijkheden:
 *   - `loadFixture(pad)`      — lees `.json.gz`, gunzip, parse, valideer schema.
 *   - `listFixtures(dir)`     — sorteer alle `*.json.gz` in een map.
 *   - `getSheet`/`findSheet`  — tab-lookup met genormaliseerde naam (trim/lowercase).
 *   - `getCell(fixture, ref)` — A1-notatie ("P!B16") → celwaarde (kolommen tot ZZ+).
 *
 * Bij een schema-mismatch of corrupt bestand gooit de loader een duidelijke,
 * pad-gecontextualiseerde fout (via `collectSchemaProblems`).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import {
  collectSchemaProblems,
  type CellValue,
  type OracleFixture,
  type OracleSheet,
} from './fixture-types'

/** Suffix van een fixture-bestand op schijf. */
const FIXTURE_SUFFIX = '.json.gz'

// ── Laden ────────────────────────────────────────────────────────────────────

/**
 * Laad en valideer één oracle-fixture van schijf.
 *
 * @throws Error met het bestandspad in de melding bij: bestand ontbreekt,
 *         ongeldige gzip, ongeldige JSON, of schema-mismatch.
 */
export function loadFixture(filePath: string): OracleFixture {
  if (!existsSync(filePath)) {
    throw new Error(`Fixture niet gevonden: ${filePath}`)
  }

  let raw: Buffer
  try {
    raw = readFileSync(filePath)
  } catch (err) {
    throw new Error(`Fixture kon niet gelezen worden (${filePath}): ${errMsg(err)}`)
  }

  let jsonText: string
  try {
    jsonText = gunzipSync(raw).toString('utf-8')
  } catch (err) {
    throw new Error(`Fixture is geen geldige gzip (${filePath}): ${errMsg(err)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Fixture bevat geen geldige JSON (${filePath}): ${errMsg(err)}`)
  }

  const problems = collectSchemaProblems(parsed)
  if (problems.length > 0) {
    throw new Error(
      `Fixture voldoet niet aan het OracleFixture-schema (${filePath}):\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    )
  }

  // Veilig te casten: collectSchemaProblems bewaakt de vorm.
  return parsed as OracleFixture
}

/**
 * Alle fixture-bestanden (`*.json.gz`) in `dir`, gesorteerd op bestandsnaam,
 * als absolute paden. Bestaat de map niet, dan een lege lijst (geen fout — zo
 * kan de integriteits-suite netjes skippen tot de extractor gedraaid heeft).
 */
export function listFixtures(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(FIXTURE_SUFFIX))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => join(dir, f))
}

// ── Tab-lookup ───────────────────────────────────────────────────────────────

/** Normaliseer een tabnaam voor tolerante vergelijking (trim + lowercase). */
function normalizeSheetName(naam: string): string {
  return naam.trim().toLowerCase()
}

/**
 * Zoek een tab op genormaliseerde naam (trim/lowercase). Geeft `undefined` als
 * de tab ontbreekt — geschikt voor aanwezigheids-checks.
 */
export function findSheet(fixture: OracleFixture, naam: string): OracleSheet | undefined {
  const target = normalizeSheetName(naam)
  for (const [key, sheet] of Object.entries(fixture.sheets)) {
    if (normalizeSheetName(key) === target) return sheet
  }
  return undefined
}

/**
 * Haal een tab op via genormaliseerde naam.
 *
 * @throws Error als de tab niet bestaat (met de beschikbare tabnamen erbij).
 */
export function getSheet(fixture: OracleFixture, naam: string): OracleSheet {
  const sheet = findSheet(fixture, naam)
  if (sheet === undefined) {
    const beschikbaar = Object.keys(fixture.sheets).join(', ') || '(geen)'
    throw new Error(`Tab "${naam}" niet gevonden. Beschikbaar: ${beschikbaar}`)
  }
  return sheet
}

// ── A1-adressering ───────────────────────────────────────────────────────────

/**
 * Zet Excel-kolomletters om naar een 0-gebaseerde kolomindex. Bijectief
 * base-26: A→0, Z→25, AA→26, AZ→51, BA→52, ZZ→701, AAA→702, …
 *
 * @throws Error bij lege of niet-alfabetische invoer.
 */
export function columnLettersToIndex(letters: string): number {
  if (letters.length === 0 || !/^[A-Za-z]+$/.test(letters)) {
    throw new Error(`Ongeldige kolomletters: "${letters}"`)
  }
  let index = 0
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64) // 'A' = 65 → 1
  }
  return index - 1 // bijectief → 0-gebaseerd
}

/** Ontleed geparste onderdelen van een cel-referentie met tab-prefix. */
interface ParsedCellRef {
  sheet: string
  colIndex: number
  rowIndex: number
}

/**
 * Ontleed een cel-referentie in A1-notatie mét tab-prefix, bv. `"P!B16"` of
 * `"Toename en afname!AB1200"`. Tabnamen mogen spaties/koppeltekens bevatten;
 * het cel-adres (letters + cijfers) staat altijd achteraan.
 *
 * @throws Error bij een onparseerbaar adres.
 */
export function parseCellRef(ref: string): ParsedCellRef {
  // Greedy tab-deel (`.+`) vóór de laatste `!`; letters+cijfers verankerd aan het eind.
  const match = /^(.+)!([A-Za-z]+)(\d+)$/.exec(ref)
  if (!match) {
    throw new Error(`Ongeldige cel-referentie: "${ref}" (verwacht bv. "P!B16")`)
  }
  const [, sheet, letters, digits] = match
  const rowIndex = Number.parseInt(digits, 10) - 1 // A1-rij 1 → index 0
  if (rowIndex < 0) {
    throw new Error(`Ongeldig rijnummer in "${ref}"`)
  }
  return { sheet, colIndex: columnLettersToIndex(letters), rowIndex }
}

/**
 * Lees één cel via A1-notatie mét tab-prefix (`getCell(fixture, "P!B16")`).
 * Ondersteunt kolommen tot ZZ en verder. Een adres buiten het gedumpte bereik
 * levert `null` (lege cel) — consistent met hoe leegte in het grid staat.
 *
 * @throws Error als de tab niet bestaat of het adres onparseerbaar is.
 */
export function getCell(fixture: OracleFixture, ref: string): CellValue {
  const { sheet, colIndex, rowIndex } = parseCellRef(ref)
  const { values } = getSheet(fixture, sheet)
  const row = values[rowIndex]
  if (row === undefined) return null
  const cell = row[colIndex]
  return cell === undefined ? null : cell
}

// ── intern ───────────────────────────────────────────────────────────────────

/** Beknopte foutmelding uit een onbekende `unknown`-error. */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
