/**
 * Map-brede grendels voor de Plan-bladeren (fase 1, ADR 0179).
 *
 * - Euro-weergave (ADR 0090/0093, kaart §4): een Plan-blad krijgt al gedeflateerde
 *   `view*`-feeds en deflateert nooit zelf — geen `deflate*`-aanroep, geen
 *   `inflationFactor`, geen eigen `Math.pow`-machtsverheffing.
 * - Kernantwoord (hero-fire-age): geen `fire.fireAge` / `fire.fireTarget`.
 * - Overlays (ADR 0039): geen directe BottomSheet-import.
 * - Koppen (ADR 0110): nooit een `<h1>`.
 * - Herkomst: elk bestand noemt het bronbereik in horizon-client @ c1b4849eb.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'

const DIR = join(process.cwd(), 'components', 'toekomst', 'plan')
const bestanden = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))

function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'))
    })
    .join('\n')
}

describe('Plan-bladeren — map-brede grendels', () => {
  it('vindt de bladeren (de grendel mag niet leeg draaien)', () => {
    for (const f of [
      'plan-helpers.tsx',
      'plan-hero-kop.tsx',
      'plan-kpi-strip.tsx',
      'plan-hero-duiding.tsx',
      'plan-gegevensmelding.tsx',
      'plan-meldingen.tsx',
      'plan-verdieping.tsx',
      'plan-kassabons.tsx',
    ]) {
      expect(bestanden).toContain(f)
    }
  })

  it.each(bestanden)('%s begint met de herkomstregel', (f) => {
    const eerste = readSourceLF(join(DIR, f)).split('\n')[0]
    expect(eerste).toMatch(/^\/\/ Verplaatst uit components\/app\/horizon\/horizon-client\.tsx r\d+–\d+.* @ c1b4849eb \(fase 1, ADR 0179\)\.$/)
  })

  it.each(bestanden)('%s deflateert niet zelf', (f) => {
    const src = code(readSourceLF(join(DIR, f)))
    expect(src).not.toMatch(/\b(deflate|deflateRowsByAge|deflatePoints|deflateSeriesByOffset|factorAtAge|buildFactorByAge|buildFactorByOffset)\(/)
    expect(src).not.toMatch(/\binflationFactor\b/)
    expect(src).not.toMatch(/Math\.pow\(/)
    expect(src).not.toContain("from '@/lib/euro-display'")
  })

  it.each(bestanden)('%s draagt de euro-view-regel als het bedragen toont', (f) => {
    const src = readSourceLF(join(DIR, f))
    if (!/<MaskedAmount\b|formatMasked\w*Currency\(|\bview[A-Z]\w*/.test(code(src))) return
    expect(src.split('\n').slice(0, 3)).toContain(
      '// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf',
    )
  })

  it.each(bestanden)('%s leest het kernantwoord niet uit fire.*', (f) => {
    const src = code(readSourceLF(join(DIR, f)))
    expect(src).not.toMatch(/\bfire[?!]?\.fireAge\b/)
    expect(src).not.toMatch(/\bfire[?!]?\.fireTarget\b/)
  })

  it.each(bestanden)('%s gebruikt geen directe BottomSheet en geen <h1>', (f) => {
    const src = readSourceLF(join(DIR, f))
    expect(src).not.toMatch(/from '@\/components\/app\/bottom-sheet'/)
    expect(src).not.toMatch(/<h1[\s>]/)
  })
})
