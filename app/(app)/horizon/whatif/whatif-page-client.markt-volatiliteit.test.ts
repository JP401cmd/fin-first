import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bron-grendel op de doorgifte van `marktVolatiliteit` (ADR 0117) in de what-if-
 * client — het zusje van `horizon-client.euro-view.test.ts`.
 *
 * WAAROM EEN BRON-TEST EN GEEN RENDER-TEST: de pagina laadt client-side via
 * vijftien Supabase-queries en rendert een worker-gedreven grafiek; een
 * render-test zou een mock-woud optuigen om vervolgens één veld te controleren.
 * De fout die we uitsluiten is bovendien structureel: een kernel-context-
 * constructie die het veld NIET meegeeft valt op de default-σ terug en ziet er
 * op het scherm volkomen plausibel uit. Dus lezen we de bron en eisen we dat
 * ÉLKE constructie het veld draagt — ook een zevende die er later bijkomt.
 *
 * De reken-doorgifte zelf (σ bereikt MC!B3 op alle drie de paden) staat in
 * `lib/horizon-kernel/markt-volatiliteit-doorgifte.test.ts`.
 */

const CLIENT_PATH = join(process.cwd(), 'app', '(app)', 'horizon', 'whatif', 'whatif-page-client.tsx')
const PAGE_PATH = join(process.cwd(), 'app', '(app)', 'toekomst', 'whatif', 'page.tsx')

/** Alle brace-gebalanceerde objectliteralen die direct ná `anker` beginnen. */
function objectLiteralsNa(src: string, anker: RegExp): string[] {
  const out: string[] = []
  const re = new RegExp(anker.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const start = src.indexOf('{', m.index + m[0].length - 1)
    let depth = 0
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) {
          out.push(src.slice(start, i + 1))
          break
        }
      }
    }
  }
  return out
}

describe('whatif-page-client.tsx — marktVolatiliteit bereikt élke kernel-context (ADR 0117)', () => {
  const src = readFileSync(CLIENT_PATH, 'utf8')

  it('de client neemt de waarde als PROP aan en doet géén eigen fire_assumptions-read (ADR 0058)', () => {
    expect(src).toMatch(/marktVolatiliteit\?: number/)
    expect(src).toMatch(/function WhatIfPage\(\{ marktVolatiliteit \}/)
    expect(src).not.toContain("from('fire_assumptions')")
    expect(src).not.toContain('resolveFireAssumptions(')
  })

  it('elke `rawContext: {…}` van computeWhatifProjection draagt marktVolatiliteit — en het zijn er precies vijf', () => {
    const blokken = objectLiteralsNa(src, /rawContext:\s*\{/)
    // Baseline, hoofdlijn, pinned overlay, impact-mét en impact-zónder event.
    // Komt hier een zesde bij, dan moet ook dié het veld dragen — pas het getal aan.
    expect(blokken).toHaveLength(5)
    blokken.forEach((blok, i) => {
      expect(blok, `rawContext-constructie #${i + 1} mist marktVolatiliteit`).toMatch(/\bmarktVolatiliteit\b/)
    })
  })

  it('de marktcheck-context (de "Onzekerheid"-band) draagt marktVolatiliteit', () => {
    const start = src.indexOf('useMemo<WhatifRawContext | null>')
    expect(start, 'marktcheckContext-memo niet gevonden').toBeGreaterThan(-1)
    const [blok] = objectLiteralsNa(src.slice(start), /return\s*\{/)
    expect(blok).toBeDefined()
    expect(blok).toMatch(/\bmarktVolatiliteit\b/)
  })

  it('de gedeferde sim-input-bundel draagt het veld mee (anders valt de deferred tak op de default terug)', () => {
    const start = src.indexOf('const whatIfSimInput = useMemo(')
    expect(start).toBeGreaterThan(-1)
    const [blok] = objectLiteralsNa(src.slice(start), /useMemo\(\(\)\s*=>\s*\(\{/)
    expect(blok).toBeDefined()
    expect(blok).toMatch(/\bmarktVolatiliteit\b/)
  })
})

describe('toekomst/whatif/page.tsx — de server-page resolvet de jaarlaag en geeft \'m als prop door', () => {
  const src = readFileSync(PAGE_PATH, 'utf8')

  it('queryt fire_assumptions server-side en consumeert via resolveFireAssumptions (caller queryt, resolver consumeert)', () => {
    expect(src).toContain("from('fire_assumptions')")
    expect(src).toContain('resolveFireAssumptions(')
    expect(src).toMatch(/\.volatility\b/)
  })

  it('geeft marktVolatiliteit als prop aan de client', () => {
    expect(src).toMatch(/<WhatIfPageClient\s+marktVolatiliteit=\{marktVolatiliteit\}\s*\/>/)
  })
})
