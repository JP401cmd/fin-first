/**
 * BRON-GRENDEL op het spaarquote-meetvenster (bevinding C6, doorgetrokken op
 * 3 sep 2026 — Notion-kaart "Spaarquote-venster (C6) doortrekken naar what-if
 * en check-in-routes").
 *
 * WAAROM EEN BRON-TEST: de what-if-pagina riep de juiste motor aan
 * (`computeSavingsRate6m`) maar voedde die met een LOKAAL gebouwd venster
 * `[getMonth() − 5, volgende maand)` — zes kalendermaanden INCLUSIEF de halfvolle
 * lopende maand, exact het pre-C6-patroon — terwijl het bestand zelf claimde
 * "canoniek" te zijn. Geen enkele bestaande test kon dat vangen: de unit-tests op
 * `savingsRateWindow` bewijzen dat de helper klopt, niet dat élke producent hem
 * ook gebruikt. Een render-test op de what-if-pagina (dynamic imports, worker,
 * Supabase) is te zwaar voor wat hier bewaakt moet worden: dat er nérgens een
 * tweede vensterdefinitie of een losse `× 6` bijkomt. Dus lezen we de bron.
 * (Precedent: `components/app/horizon/horizon-client.euro-view.test.ts`,
 * `lib/fire-target-shared.test.ts`.)
 *
 * DRIE REGELS over de PRODUCENTEN van 6-maands-grootheden:
 *  1. VENSTER — elke producent haalt zijn grenzen uit `savingsRateWindow` (of de
 *     daarop gebouwde `deriveSavingsRate6mWindow`) en bouwt géén eigen
 *     `getMonth() − 5/6`- of `…MonthsAgo(now, 5/6)`-venster.
 *  2. LENGTE — de vensterlengte is nergens een literal: geen `× 6` of `÷ 6` op een
 *     regel die een 6m-grootheid, aflossing of half-jaar-som noemt. Alleen
 *     `SAVINGS_RATE_WINDOW_MONTHS` (lib/constants.ts).
 *  3. DATAMAANDEN — wie `computeSavingsRate6m` aanroept, telt zijn datamaanden via
 *     `savingsRateDataMonths` (of `deriveDataMonths6`), niet met een lokale kopie.
 *
 * Commentaarregels tellen niet mee (die mogen het oude patroon ter documentatie
 * noemen); trailing `// …` wordt van codelijnen gestript.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { savingsRateWindow } from '@/lib/savings-source'
import { SAVINGS_RATE_WINDOW_MONTHS } from '@/lib/constants'

/** Alle producenten van een 6-maands spaarquote-/health-grootheid. */
const PRODUCERS = [
  'lib/dashboard-data-loader.ts',
  'lib/cashflow-kpis.ts',
  'lib/horizon/raw-data-loader.ts',
  'lib/core-data-loader.ts',
  'lib/lever-scores-loader.ts',
  'lib/goal-current-value.ts',
  'app/api/checkin/overview/route.ts',
  'app/api/checkin/gespreksstarters/route.ts',
  'app/(app)/horizon/whatif/whatif-page-client.tsx',
  'components/app/horizon/horizon-client.tsx',
] as const

const CANONICAL_WINDOW = /\b(savingsRateWindow|deriveSavingsRate6mWindow)\s*\(/
const CANONICAL_DATA_MONTHS = /\b(savingsRateDataMonths|deriveDataMonths6)\s*\(/
const ENGINE_CALL = /\bcomputeSavingsRate6m\s*\(/

/** Het pre-C6-patroon: een eigen 6-maands-ondergrens uit `now`. */
const LOCAL_WINDOW = /getMonth\(\)\s*-\s*[56]\b|MonthsAgo\(\s*\w+\s*,\s*[56]\s*\)/

/**
 * Een literal 6 als vermenigvuldiger/deler op een regel die een 6m-grootheid
 * noemt. `(?![\d.\w])` sluit `60`, `6.5` en identifiers uit.
 */
const LITERAL_SIX = /(6m\b|6M\b|HalfYear|Income6\b|Expenses6\b|SavingsBudget6\b|[Aa]flossing)[^\n]*[*/]\s*6(?![\d.\w])/

function codeLines(relPath: string): { line: string; nr: number }[] {
  const text = readFileSync(join(process.cwd(), relPath), 'utf8')
  return text.split(/\r?\n/).flatMap((raw, index) => {
    const trimmed = raw.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return []
    // Trailing commentaar strippen — een string-literal met '//' komt in deze
    // producenten niet voor op de bewaakte regels.
    const code = raw.replace(/\/\/.*$/, '')
    return [{ line: code, nr: index + 1 }]
  })
}

describe('spaarquote-meetvenster — één bron voor alle producenten (C6-grendel)', () => {
  describe.each(PRODUCERS)('%s', (relPath) => {
    const lines = codeLines(relPath)
    const source = lines.map((l) => l.line).join('\n')

    it('regel 1 — leest zijn venster uit savingsRateWindow / deriveSavingsRate6mWindow', () => {
      expect(CANONICAL_WINDOW.test(source)).toBe(true)
    })

    it('regel 1 — bouwt geen eigen getMonth()−5/6-venster', () => {
      const offenders = lines.filter((l) => LOCAL_WINDOW.test(l.line)).map((l) => `r${l.nr}: ${l.line.trim()}`)
      expect(offenders, 'lokaal 6-maands-venster gevonden').toEqual([])
    })

    it('regel 2 — geen literal × 6 / ÷ 6 op een 6m-grootheid (alleen SAVINGS_RATE_WINDOW_MONTHS)', () => {
      const offenders = lines.filter((l) => LITERAL_SIX.test(l.line)).map((l) => `r${l.nr}: ${l.line.trim()}`)
      expect(offenders, 'literal vensterlengte gevonden').toEqual([])
    })

    it('regel 3 — wie computeSavingsRate6m aanroept, telt datamaanden canoniek', () => {
      if (!ENGINE_CALL.test(source)) return
      expect(CANONICAL_DATA_MONTHS.test(source)).toBe(true)
    })
  })
})

describe('het oude what-if-venster tegenover het canonieke (documentatie van de bug)', () => {
  // 3 sep 2026, 12:00 lokaal — de lopende maand (september) is halfvol.
  const now = new Date(2026, 8, 3, 12, 0, 0)

  it('het pre-C6-venster van de what-if-pagina sloot de lopende maand IN', () => {
    // Letterlijk wat er stond: [getMonth() − 5, volgende maand).
    const oudVan = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]
    const oudTot = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
    expect(oudVan).toBe('2026-04-01')
    expect(oudTot).toBe('2026-10-01')
    expect('2026-09-02' >= oudVan && '2026-09-02' < oudTot).toBe(true) // september telde mee
  })

  it('het canonieke venster is zes VOLTOOIDE maanden, september exclusief', () => {
    const { fromDate, toDate, sinceMonth, beforeMonth } = savingsRateWindow(now)
    expect(fromDate).toBe('2026-03-01')
    expect(toDate).toBe('2026-09-01')
    expect(sinceMonth).toBe('2026-03')
    expect(beforeMonth).toBe('2026-09')
    expect('2026-09-02' >= fromDate && '2026-09-02' < toDate).toBe(false) // september valt eruit
    const [fy, fm] = fromDate.split('-').map(Number)
    const [ty, tm] = toDate.split('-').map(Number)
    expect((ty - fy) * 12 + (tm - fm)).toBe(SAVINGS_RATE_WINDOW_MONTHS)
  })
})
