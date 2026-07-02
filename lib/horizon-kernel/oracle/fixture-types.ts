/**
 * Horizon-kernel · Excel-oracle — fixture-types.
 *
 * TypeScript-typering van het fixture-schema dat de Python-extractor
 * (`scripts/horizon-oracle/extract-fixture.py`, FASE 1) wegschrijft naar
 * `test/fixtures/horizon-oracle/<scenario>.json.gz` (gzip van UTF-8 JSON).
 *
 * Dit bestand is de canonieke bron voor de vorm van een oracle-fixture: één
 * `meta`-blok (herkomst + solver-uitkomst + waarschuwingen) en `sheets`
 * (alle geëxtraheerde Excel-tabs als 2D-celgrids). De rekenkern zelf
 * (FASE 2) bestaat nog niet; deze typen + de loader/comparator vormen het
 * harnas waartegen de kern later cel-voor-cel parity-getest wordt (ADR 0032).
 *
 * Puur typen + één type-guard — geen runtime-afhankelijkheden, dus veilig te
 * importeren in zowel test-, server- als (indien ooit nodig) client-context.
 */

/**
 * Eén celwaarde uit een Excel-tab. `null` = lege cel; datums leveren de
 * extractor als ISO-string aan (dus een `string`, geen apart type).
 */
export type CellValue = number | string | boolean | null

/** Eén geëxtraheerde Excel-tab: het A1-bereik + de celwaarden als 2D-grid. */
export interface OracleSheet {
  /** A1-bereik van de dump, bv. `"A1:HK1205"`. */
  range: string
  /** Rijen × kolommen; `values[rij][kolom]`. Mag jagged zijn (trailing leeg). */
  values: CellValue[][]
}

/**
 * Eén bewust doorgevoerde afwijking t.o.v. de onaangeraakte Excel-invoer,
 * gelogd door de extractor (bv. een ontbrekende prioriteit gezet vóór het
 * draaien van de macro's). Maakt fixtures reproduceerbaar en auditbaar.
 */
export interface OracleOverride {
  /** Cel in A1-notatie mét tab-prefix, bv. `"TS!D8"`. */
  cell: string
  /** De gezette waarde. */
  value: CellValue
  /** Waarom deze override nodig was. */
  reason: string
}

/**
 * Samengevatte uitkomst van de Excel-solver-macro's (`BepaalFIRE` e.a.) op
 * het moment van extractie.
 */
export interface OracleSolver {
  /** Gevonden FIRE-leeftijd, of `null` bij een onbereikbaar-status. */
  fireAge: number | null
  /** Resterend gat (netto-liquide − doelbedrag) op de eindleeftijd, of `null`. */
  gap: number | null
  /** Samengevatte statustekst (P!B93-familie). */
  statusText: string
  /** Tekst van de stale-detector (P!B95) — signaleert of de solver herdraaid moet worden. */
  staleText: string
}

/** Herkomst- en context-metadata van een fixture. */
export interface OracleMeta {
  /** Schema-versie; deze harnasversie verwacht `1`. */
  fixtureVersion: number
  /** Unieke scenario-naam (= bestandsnaam zonder `.json.gz`). */
  scenario: string
  /** Eén regel NL die het scenario omschrijft. */
  description: string
  /** Bronbestand, bv. `"Core calc v5.xlsm"`. */
  sourceFile: string
  /** LastWriteTime van het bronbestand als ISO-string. */
  sourceLastWriteTime: string
  /** SHA-256 (hex) van het bronbestand — koppelt de fixture aan een exacte save. */
  sourceSha256: string
  /** Tijdstip van extractie als ISO-string. */
  extractedAt: string
  /** Bewuste, gelogde afwijkingen t.o.v. de onaangeraakte invoer. */
  overrides: OracleOverride[]
  /** Namen van de gedraaide VBA-macro's. */
  macros: string[]
  /** Samengevatte solver-uitkomst. */
  solver: OracleSolver
  /** Reconciliatie-uitspraak van de Controle-tab (Controle!K1). */
  controleK1: string
  /** Vrije waarschuwingen die de extractor opving. */
  warnings: string[]
}

/**
 * Eén complete oracle-fixture: metadata + alle geëxtraheerde tabs, gemapt op
 * hun (Excel-)tabnaam. Voor tab-lookup: gebruik `getSheet`/`findSheet` uit
 * `fixture-load.ts` (genormaliseerde naam-vergelijking), niet directe indexering.
 */
export interface OracleFixture {
  meta: OracleMeta
  sheets: Record<string, OracleSheet>
}

// ── Type-guards ──────────────────────────────────────────────────────────────

/** True als `v` een geldige `CellValue` is (number/string/boolean/null). */
function isCellValue(v: unknown): v is CellValue {
  return v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
}

/** Smalle helper: `v` is een niet-null object (geen array). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Verzamelt schema-problemen als leesbare NL-tekst i.p.v. alleen een boolean —
 * gebruikt door `loadFixture` om een duidelijke fout te formuleren. Leeg = geldig.
 * Bewust breedte-eerst en tolerant: alleen structurele eisen, geen waarde-oordeel
 * (dat is de integriteits-suite).
 */
export function collectSchemaProblems(value: unknown): string[] {
  const problems: string[] = []
  if (!isRecord(value)) return ['top-level is geen object']

  // meta ---------------------------------------------------------------------
  const meta = value.meta
  if (!isRecord(meta)) {
    problems.push('meta ontbreekt of is geen object')
  } else {
    if (typeof meta.fixtureVersion !== 'number') problems.push('meta.fixtureVersion is geen number')
    if (typeof meta.scenario !== 'string') problems.push('meta.scenario is geen string')
    if (typeof meta.description !== 'string') problems.push('meta.description is geen string')
    if (typeof meta.sourceFile !== 'string') problems.push('meta.sourceFile is geen string')
    if (typeof meta.sourceLastWriteTime !== 'string')
      problems.push('meta.sourceLastWriteTime is geen string')
    if (typeof meta.sourceSha256 !== 'string') problems.push('meta.sourceSha256 is geen string')
    if (typeof meta.extractedAt !== 'string') problems.push('meta.extractedAt is geen string')
    if (!Array.isArray(meta.overrides)) problems.push('meta.overrides is geen array')
    if (!Array.isArray(meta.macros)) problems.push('meta.macros is geen array')
    if (!Array.isArray(meta.warnings)) problems.push('meta.warnings is geen array')
    if (typeof meta.controleK1 !== 'string') problems.push('meta.controleK1 is geen string')

    const solver = meta.solver
    if (!isRecord(solver)) {
      problems.push('meta.solver ontbreekt of is geen object')
    } else {
      if (solver.fireAge !== null && typeof solver.fireAge !== 'number')
        problems.push('meta.solver.fireAge is geen number|null')
      if (solver.gap !== null && typeof solver.gap !== 'number')
        problems.push('meta.solver.gap is geen number|null')
      if (typeof solver.statusText !== 'string') problems.push('meta.solver.statusText is geen string')
      if (typeof solver.staleText !== 'string') problems.push('meta.solver.staleText is geen string')
    }
  }

  // sheets -------------------------------------------------------------------
  const sheets = value.sheets
  if (!isRecord(sheets)) {
    problems.push('sheets ontbreekt of is geen object')
  } else {
    for (const [naam, sheet] of Object.entries(sheets)) {
      if (!isRecord(sheet)) {
        problems.push(`sheet "${naam}" is geen object`)
        continue
      }
      if (typeof sheet.range !== 'string') problems.push(`sheet "${naam}".range is geen string`)
      if (!Array.isArray(sheet.values)) {
        problems.push(`sheet "${naam}".values is geen array`)
        continue
      }
      // Steekproef op de eerste rij houdt de guard O(kolommen) i.p.v. O(cellen):
      // volledige celvalidatie hoort niet in een hot-path type-guard.
      const firstRow = sheet.values[0]
      if (firstRow !== undefined) {
        if (!Array.isArray(firstRow)) {
          problems.push(`sheet "${naam}".values[0] is geen rij-array`)
        } else if (!firstRow.every(isCellValue)) {
          problems.push(`sheet "${naam}".values[0] bevat een niet-toegestane celwaarde`)
        }
      }
    }
  }

  return problems
}

/**
 * Type-guard: is `value` een structureel geldige `OracleFixture`?
 * Controleert de vorm (aanwezigheid + types van de verplichte velden), niet de
 * inhoudelijke correctheid van de gegevens (dat doet de integriteits-suite).
 */
export function isOracleFixture(value: unknown): value is OracleFixture {
  return collectSchemaProblems(value).length === 0
}
