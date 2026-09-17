import { describe, it, expect } from 'vitest'
import {
  ACCENT_RING,
  contrastRatio,
  hexToOklch,
  randomModuleColors,
  type ModuleColorConfig,
} from './color-palette'

/**
 * Een nieuwe gebruiker krijgt zijn vier accentkleuren WILLEKEURIG toebedeeld bij
 * het begin van de onboarding (17 sep 2026). Willekeur is hier het gewenste
 * gedrag, en precies daarom hoort er een vangrail omheen: een trekking die
 * ontspoort levert geen foutmelding op, alleen een gebruiker die zijn
 * Bezittingen niet van zijn Schulden kan onderscheiden of een kop leest die op
 * papier wegvalt. Beide zouden in de app zelf pas opvallen als iemand het ziet.
 *
 * We toetsen daarom álle 18 mogelijke trekkingen uitputtend, niet een steekproef.
 */

const PAPIER = '#faf9f6'
const MODULES = ['kern', 'wil', 'horizon', 'fin'] as const

/** Elke mogelijke uitkomst: één per startpunt op de ring. */
function alleTrekkingen(): ModuleColorConfig[] {
  return ACCENT_RING.map((_, i) => randomModuleColors(() => i / ACCENT_RING.length))
}

/** Kleinste hoek tussen twee hues op de kleurencirkel (0..180). */
function hueAfstand(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return d > 180 ? 360 - d : d
}

describe('randomModuleColors — vier gespreide, leesbare accenten', () => {
  it('trekt uitsluitend tinten uit de gevalideerde ring', () => {
    const ringHexes = new Set(ACCENT_RING.map((t) => t.hex))
    for (const trekking of alleTrekkingen()) {
      for (const mod of MODULES) {
        expect(ringHexes.has(trekking[mod])).toBe(true)
      }
    }
  })

  it('geeft vier verschillende kleuren — nooit twee dezelfde modules', () => {
    for (const trekking of alleTrekkingen()) {
      const uniek = new Set(MODULES.map((mod) => trekking[mod]))
      expect(uniek.size).toBe(4)
    }
  })

  it('houdt minstens 60° hue tussen elk paar, zodat de vier uit elkaar te houden zijn', () => {
    for (const trekking of alleTrekkingen()) {
      const hues = MODULES.map((mod) => hexToOklch(trekking[mod]).h)
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          expect(hueAfstand(hues[i], hues[j])).toBeGreaterThanOrEqual(60)
        }
      }
    }
  })

  it('levert nooit een accent dat op papier onder WCAG AA zakt', () => {
    for (const trekking of alleTrekkingen()) {
      for (const mod of MODULES) {
        expect(contrastRatio(trekking[mod], PAPIER)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('verdeelt de startpunten over de hele ring — niet elke gebruiker hetzelfde', () => {
    const eersteKleuren = new Set(alleTrekkingen().map((t) => t.kern))
    expect(eersteKleuren.size).toBe(ACCENT_RING.length)
  })

  // Bewaakt de modulo op de índexering (niet op `start`): zonder die modulo
  // loopt een startpunt aan de bovenrand van de ring over de grens en levert
  // `ring[18]` → undefined → een crash op `.hex`.
  it('blijft binnen de ring als de generator exact 1 teruggeeft (bovenrand)', () => {
    const trekking = randomModuleColors(() => 1)
    for (const mod of MODULES) {
      expect(trekking[mod]).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(new Set(MODULES.map((mod) => trekking[mod])).size).toBe(4)
  })
})
