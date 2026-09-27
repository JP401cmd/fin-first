/**
 * BRON-SCAN: de (app)-layout start zijn onafhankelijke laadstappen parallel
 * (Snelheid B1, docs/superpowers/plans/2026-09-26-ttfb-oorzaak-en-plan.md §4 B1).
 *
 * Wat hier bewaakt wordt is een VOLGORDE in de bron, geen uitkomst: de
 * leverscores en de gids-seed moeten vóór de `await` van de hoofdbatch gestart
 * zijn, en de lever-loader moet zijn realisatie-fetch in zijn eerste golf
 * meenemen. Een terugval naar `await loadLeverScores(...)` ná de batch geeft
 * dezelfde HTML en laat elke gedragstest groen — alleen de meting (SRV_TOTAL_MS)
 * zou het na een week verraden. Daarom deze scan.
 *
 * De timer-markers `lever`/`guide` horen bij het OPLOSSEN van de promise te
 * worden gezet (eigen stapduur), niet na een latere await — anders meet
 * SRV_LEVER_MS de wachttijd op de batch in plaats van de lever-loader.
 */
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

// Eerst hele-regel-`//`-commentaar, dán blokcommentaar: een regelcommentaar met
// een glob erin (`lib/page-status/*`) zou anders als opening van een blok alles
// tot de volgende `*/` wegvegen.
const code = (path: string) =>
  readSourceLF(path)
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

describe('app/(app)/layout.tsx — laadstappen parallel (Snelheid B1)', () => {
  const src = code('app/(app)/layout.tsx')
  const batchAwait = src.indexOf('await Promise.all([')

  it('heeft precies één hoofdbatch-await', () => {
    expect(batchAwait).toBeGreaterThan(-1)
    expect(src.indexOf('await Promise.all([', batchAwait + 1)).toBe(-1)
  })

  it('start loadLeverScores vóór de hoofdbatch, met exact de pagina-argumenten', () => {
    const start = src.indexOf('loadLeverScores(supabase, sidebarPerspective)')
    expect(start).toBeGreaterThan(-1)
    expect(start).toBeLessThan(batchAwait)
    expect(src).not.toMatch(/await\s+loadLeverScores\(/)
  })

  it('start de gids-seed vóór de hoofdbatch', () => {
    const start = src.indexOf('loadWelcomeGuideSeed(supabase, userId)')
    expect(start).toBeGreaterThan(-1)
    expect(start).toBeLessThan(batchAwait)
    expect(src).not.toMatch(/await\s+loadWelcomeGuideSeed\(/)
  })

  it('zet de lever-/guide-markers bij het oplossen, vóór de hoofdbatch in de bron', () => {
    for (const m of ["timer.mark('leverStart')", "timer.mark('lever')", "timer.mark('guideStart')", "timer.mark('guide')"]) {
      const at = src.indexOf(m)
      expect(at, m).toBeGreaterThan(-1)
      expect(at, m).toBeLessThan(batchAwait)
    }
  })

  it('één definitie van "gids afgesloten" voor de seed-load én de provider-prop', () => {
    expect(src).toMatch(/const welcomeGuideDismissed = isWelcomeGuideDismissed\(profile\)/)
    expect(src).toMatch(/isWelcomeGuideDismissed\(profileRes\.data\)/)
  })
})

describe('lib/lever-scores-loader.ts — realisatie in de eerste golf', () => {
  it('neemt getRealizedBudgetAmounts mee in de eerste Promise.all, vóór loadBudgetBasis', () => {
    const src = code('lib/lever-scores-loader.ts')
    const waveStart = src.indexOf('await Promise.all([')
    const waveEnd = src.indexOf('])', waveStart)
    expect(waveStart).toBeGreaterThan(-1)
    const wave = src.slice(waveStart, waveEnd)
    expect(wave).toContain('getRealizedBudgetAmounts(supabase)')
    expect(src.indexOf('loadBudgetBasis(', waveEnd)).toBeGreaterThan(waveEnd)
  })
})
