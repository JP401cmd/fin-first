// ── B2 in code: de Krant rekent en spreekt alleen in euro's ──────────────────
//
// Niets in de repo dwingt "alleen euro's" mechanisch af; de app-brede regel
// is juist de omgekeerde ("elk bedrag boven €100 ook in vrijheidstijd"). Het
// risico is een toekomstige agent of reviewer die de Krant "repareert" op die
// app-regel. Deze brontest is de vangrail (ADR 0172), in twee lagen:
//
//   1. IMPORT-REGEL — uit `@/lib/format` mag alleen `formatCurrency` komen; elke
//      import uit de vrijheidstijd-modules (`lib/horizon/vrijheidsdagen`,
//      `lib/freedom-*`, `lib/format-freedom*`) is rood. Dat vangt ook een
//      functie die deze lijst nog niet kent.
//   2. IDENTIFIER-REGEL — de bekende €→tijd-symbolen en de vervallen
//      uitgavenband mogen nergens in code staan.
//
// Alleen CODE telt: commentaar en gewone stringliterals worden gestript (de
// prompt van 1A zegt letterlijk "nooit … dagtarief"). Van een template literal
// blijft alleen de CODE in `${…}` over — daar zit `${formatWithFreedom(...)}`
// in, precies de vorm waarin een gerenderde regel geschreven wordt; de
// statische tekst eromheen is proza. Recursief over lib/krant/.

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

const KRANT_DIR = join(process.cwd(), 'lib', 'krant')

/** Symbolen van de €→tijd-vertaling en de vervallen uitgavenband. */
const VERBODEN_IDENTIFIERS = [
  'formatWithFreedom',
  'formatFreedom',
  'formatFreedomTimeString',
  'carryFreedomUnits',
  'dailyExpenseRate',
  'intakeDailyExpenseRate',
  'credibleDailyExpense',
  'calculateFreedomTime',
  'computeFreedomTicker',
  'buildMonthlyFreedomData',
  'computeFreedomMilestones',
  'presentFreedomMilestones',
  'freedomDays',
  'freedomDaysAtAge',
  'freedomDaysToday',
  'estimated_monthly_expenses',
  'monthlyExpenses',
  'dailyExpenses',
  'dagtarief',
  'vrijheidsdagen',
  'vrijheidstijd',
]

/** Modules waaruit lib/krant niets mag importeren. */
const VERBODEN_MODULES = [/^@\/lib\/horizon\/vrijheidsdagen/, /^@\/lib\/freedom/, /^@\/lib\/format-freedom/]

/** Uit `@/lib/format` is dit het enige toegestane symbool. */
const TOEGESTAAN_UIT_FORMAT = new Set(['formatCurrency'])

function codeZonderCommentaarEnStrings(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // Template literal → alleen de expressies erin, gescheiden door spaties.
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, (tl) => [...tl.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' '))
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
}

function bronbestanden(dir: string): string[] {
  const out: string[] = []
  for (const naam of readdirSync(dir).sort()) {
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) out.push(...bronbestanden(pad))
    else if (naam.endsWith('.ts') && !naam.endsWith('.test.ts')) out.push(pad)
  }
  return out
}

function imports(bron: string): Array<{ module: string; symbolen: string[] }> {
  const out: Array<{ module: string; symbolen: string[] }> = []
  for (const m of bron.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|[\w$]+)?\s*from\s*'([^']+)'/g)) {
    const symbolen = (m[1] ?? '')
      .split(',')
      .map((s) => s.replace(/\btype\b/, '').trim().split(/\s+as\s+/)[0])
      .filter(Boolean)
    out.push({ module: m[2], symbolen })
  }
  return out
}

describe('euro-only (B2, ADR 0172)', () => {
  const bestanden = bronbestanden(KRANT_DIR)

  it('vindt de bronbestanden (recursief)', () => {
    expect(bestanden.length).toBeGreaterThan(8)
  })

  it('importregel: uit @/lib/format alleen formatCurrency; niets uit de vrijheidstijd-modules', () => {
    for (const f of bestanden) {
      const rel = relative(KRANT_DIR, f)
      for (const imp of imports(readSourceLF(f))) {
        expect(VERBODEN_MODULES.some((re) => re.test(imp.module)), `${rel} importeert ${imp.module}`).toBe(false)
        if (imp.module === '@/lib/format') {
          for (const s of imp.symbolen) expect(TOEGESTAAN_UIT_FORMAT.has(s), `${rel} importeert ${s} uit @/lib/format`).toBe(true)
        }
      }
    }
  })

  it('identifierregel: geen vrijheidstijd-symbool of uitgavenband in code (template literals inbegrepen)', () => {
    for (const f of bestanden) {
      const rel = relative(KRANT_DIR, f)
      const code = codeZonderCommentaarEnStrings(readSourceLF(f))
      for (const id of VERBODEN_IDENTIFIERS) {
        expect(new RegExp(`\\b${id}\\b`).test(code), `${rel} gebruikt ${id}`).toBe(false)
      }
    }
  })

  it('sentinel: de scanner bijt op een identifier in code én in een template literal, niet op commentaar of een gewone string', () => {
    const code = codeZonderCommentaarEnStrings(
      "const x = formatWithFreedom(1, 2)\nconst t = `nooit een dagtarief: ${dailyExpenseRate(b)}`\n// calculateFreedomTime mag hier\nconst s = 'freedomDays'",
    )
    expect(/\bformatWithFreedom\b/.test(code)).toBe(true)
    expect(/\bdailyExpenseRate\b/.test(code)).toBe(true)
    expect(/\bdagtarief\b/.test(code), 'proza in een template literal telt niet').toBe(false)
    expect(/\bcalculateFreedomTime\b/.test(code)).toBe(false)
    expect(/\bfreedomDays\b/.test(code)).toBe(false)
    expect(imports("import { formatWithFreedom as f } from '@/lib/format'")[0].symbolen).toEqual(['formatWithFreedom'])
    expect(VERBODEN_MODULES.some((re) => re.test('@/lib/horizon/vrijheidsdagen'))).toBe(true)
  })

  it('de kernbestanden dragen de euro-only-markering', () => {
    for (const f of ['sjablonen.ts', 'sjablonen-catalogus.ts', 'matcher.ts', 'impact.ts', 'profiel.ts']) {
      expect(readSourceLF(join(KRANT_DIR, f)), f).toMatch(/euro-only \(B2, ADR 0172\)/)
    }
  })
})
