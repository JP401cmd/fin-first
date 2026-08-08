/**
 * POORT — de weergavenaam van grenzenpotten staat op precies één plek.
 *
 * `copy.ts` is de enige bron van de gebruikerszichtbare naam (en sinds fase 5
 * van beide aliassen). Deze test dwingt dat af in plaats van het te beloven in
 * een comment: hij scant `lib/spend-limits/**` en `app/api/spend-limits/**` op
 * naam-dragende literals in CODE en faalt bij een treffer (FR-B5-08/AC-B5-05).
 *
 * Twee bewuste afbakeningen:
 *
 *  1. **Comments tellen niet mee.** Interne documentatie blijft canoniek
 *     "Grenzenpot" (dat is de naam van de functionaliteit in ADR's, curatie en
 *     docstrings) — de regel gaat over wat de GEBRUIKER leest. Daarom worden
 *     `//`- en `/* *\/`-comments eerst weggestreept en pas daarna gezocht.
 *  2. **Hoofdletterongevoelig.** De overtreding die deze test moest vangen was
 *     juist de kleine letter: `'Geef de grenzenpot een naam'` in schema.ts.
 *
 * Buiten scope van de scan (bewust): `lib/architecture/**`, `docs/**`,
 * `supabase/migrations/**` — interne curatie/documentatie, geen gebruikers-UI.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_SPEND_LIMIT_ALIAS,
  SPEND_LIMIT_ALIASES,
  SPEND_LIMIT_COPY,
  spendLimitCopy,
} from './copy'

// Repo-root uit de locatie van dít bestand (lib/spend-limits/…) i.p.v.
// process.cwd(): een test die per ongeluk nul bestanden scant is groen om de
// verkeerde reden, en de cwd verschilt tussen vitest-invocaties.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const SCAN_DIRS = ['lib/spend-limits', 'app/api/spend-limits']
/** Alleen `copy.ts` mag de namen dragen; deze test bevat ze als fixture. */
const EXCLUDED_FILES = new Set(['lib/spend-limits/copy.ts', 'lib/spend-limits/copy.test.ts'])
const SOURCE_EXT = /\.(ts|tsx)$/
const FORBIDDEN = /grenzenpot|schaamtepot/i

/**
 * Verwijdert `//`- en `/* *\/`-comments, maar laat string-literals (en de
 * regelindeling) intact zodat een treffer een echt regelnummer krijgt.
 *
 * Bewust een kleine toestandsmachine en geen regex: een regex die comments
 * wegstreept, sloopt ook `'https://…'` in een string. Bekende beperking: een
 * regex-literal die letterlijk `//` bevat wordt als comment gelezen — dat kan
 * alleen tot ONDER-detectie leiden op diezelfde regel, en die vorm komt in de
 * gescande mappen niet voor.
 */
export function stripComments(source: string): string {
  type Mode = 'code' | 'line' | 'block' | "'" | '"' | '`'
  let mode: Mode = 'code'
  let out = ''
  let i = 0

  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]

    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line'
        i += 2
        continue
      }
      if (c === '/' && next === '*') {
        mode = 'block'
        i += 2
        continue
      }
      if (c === "'" || c === '"' || c === '`') mode = c
      out += c
      i += 1
      continue
    }

    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code'
        out += c
      }
      i += 1
      continue
    }

    if (mode === 'block') {
      if (c === '*' && next === '/') {
        mode = 'code'
        i += 2
        continue
      }
      if (c === '\n') out += c // regelnummers intact houden
      i += 1
      continue
    }

    // Binnen een string-literal: escapes overslaan, sluiter herkennen.
    if (c === '\\') {
      out += c + (next ?? '')
      i += 2
      continue
    }
    if (c === mode) mode = 'code'
    out += c
    i += 1
  }

  return out
}

/** Alle naam-treffers in code (comments weggestreept), met regelnummer. */
export function findAliasLiterals(file: string, source: string): string[] {
  return stripComments(source)
    .split('\n')
    .map((line, idx) => (FORBIDDEN.test(line) ? `${file}:${idx + 1} → ${line.trim()}` : null))
    .filter((hit): hit is string => hit !== null)
}

function collectSourceFiles(dir: string): string[] {
  const abs = join(REPO_ROOT, dir)
  const found: string[] = []
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(join(dir, entry)))
      continue
    }
    if (!SOURCE_EXT.test(entry)) continue
    found.push(relative(REPO_ROOT, full).split('\\').join('/'))
  }
  return found
}

const SCANNED_FILES = SCAN_DIRS.flatMap(collectSourceFiles).filter(
  (file) => !EXCLUDED_FILES.has(file),
)

describe('copy-poort: de weergavenaam staat alleen in copy.ts', () => {
  it('scant daadwerkelijk de bedoelde bestanden (anti-vals-groen)', () => {
    // Zonder deze assertie zou een verkeerd pad of een kapotte glob een lege
    // lijst opleveren — en dan is de poort hieronder altijd groen.
    expect(SCANNED_FILES.length).toBeGreaterThan(5)
    expect(SCANNED_FILES).toContain('lib/spend-limits/schema.ts')
    expect(SCANNED_FILES).toContain('lib/spend-limits/engine.ts')
    expect(SCANNED_FILES).toContain('app/api/spend-limits/route.ts')
    expect(SCANNED_FILES).toContain('app/api/spend-limits/[id]/route.ts')
    expect(SCANNED_FILES).not.toContain('lib/spend-limits/copy.ts')
  })

  it('geen naam-dragende literal in code buiten copy.ts', () => {
    const hits = SCANNED_FILES.flatMap((file) =>
      findAliasLiterals(file, readFileSync(join(REPO_ROOT, file), 'utf8')),
    )

    expect(hits).toEqual([])
  })
})

describe('findAliasLiterals — wat wel en niet telt', () => {
  it('vlagt een naam in een gebruikerszichtbare string, ook in kleine letters', () => {
    const source = "const msg = 'Geef de grenzenpot een naam'\n"
    expect(findAliasLiterals('x.ts', source)).toHaveLength(1)
  })

  it('vlagt de tweede alias net zo goed', () => {
    const source = 'const t = `Schaamtepot archiveren`\n'
    expect(findAliasLiterals('x.ts', source)).toHaveLength(1)
  })

  it('negeert een naam in een regel-comment', () => {
    expect(findAliasLiterals('x.ts', '// Grenzenpot — wijzigen en archiveren\n')).toEqual([])
  })

  it('negeert een naam in een blok-comment maar houdt de regelnummers kloppend', () => {
    const source = ['/**', ' * Grenzenpotten — lijst.', ' */', "const a = 'Schaamtepot'", ''].join(
      '\n',
    )
    expect(findAliasLiterals('x.ts', source)).toEqual(["x.ts:4 → const a = 'Schaamtepot'"])
  })

  it('laat een string met // erin ongemoeid (geen naïeve comment-regex)', () => {
    const source = "const url = 'https://x.test' // Grenzenpot\nconst b = 1\n"
    expect(findAliasLiterals('x.ts', source)).toEqual([])
    expect(stripComments(source)).toContain('https://x.test')
  })
})

describe('copy-map', () => {
  it('kent voor elke alias een volledige tekstset', () => {
    for (const alias of SPEND_LIMIT_ALIASES) {
      const copy = spendLimitCopy(alias)
      expect(copy.singular.length).toBeGreaterThan(0)
      expect(copy.plural.length).toBeGreaterThan(0)
      expect(copy.singularLower).toBe(copy.singular.toLowerCase())
      expect(copy.pluralLower).toBe(copy.plural.toLowerCase())
      expect(copy.intro.length).toBeGreaterThan(0)
      expect(copy.aliasDescription.length).toBeGreaterThan(0)
    }
  })

  it('geeft per alias een andere naam terug', () => {
    expect(spendLimitCopy('grenzenpot').singular).not.toBe(spendLimitCopy('schaamtepot').singular)
  })

  it('valt terug op de default bij een ontbrekende of onbekende waarde', () => {
    const fallback = spendLimitCopy(DEFAULT_SPEND_LIMIT_ALIAS)
    expect(spendLimitCopy(null)).toEqual(fallback)
    expect(spendLimitCopy(undefined)).toEqual(fallback)
    // Een profielrij van vóór de migratie of een handmatig gemanipuleerde waarde.
    expect(spendLimitCopy('potje' as never)).toEqual(fallback)
  })

  it('houdt de niet-reactieve fallback-constante gelijk aan de default-alias', () => {
    expect(SPEND_LIMIT_COPY).toEqual(spendLimitCopy(DEFAULT_SPEND_LIMIT_ALIAS))
  })
})
