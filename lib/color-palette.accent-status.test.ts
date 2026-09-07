import { describe, it, expect } from 'vitest'
import {
  accentClashesWithStatus,
  hexToOklch,
  ACCENT_CHROMA_MAX,
  STATUS_HUES,
  DEFAULT_MODULE_COLORS,
  DEFAULT_PHASE_COLORS,
  DEFAULT_BUDGET_COLORS,
} from './color-palette'

/**
 * UR3-32, acceptatiecriterium 2: "welke accentkeuze dan ook — een statuskleur
 * blijft te onderscheiden van de identiteitskleur."
 *
 * De vondst uit het onderzoek was dat het echte onderscheid NIET in hue zit
 * maar in chroma. Het oude horizon-goud stond op 6,5 graden van amber-warn en
 * botste tóch niet, puur omdat het ontzadigd was; de hefboom Bezittingen stond
 * op 3,1 graden van "op koers"-groen en botste wél, omdat hij verzadigd was.
 * Een hue-only toets zou dus precies de verkeerde twee afkeuren.
 */

/** De stoplichtkleuren zoals `lib/leverage-status.ts` ze draagt. */
const STOPLICHT = {
  'op koers (emerald-500)': '#10b981',
  'aandacht (amber-500)': '#f59e0b',
  'actie (red-500)': '#ef4444',
}

describe('accentClashesWithStatus — het stoplicht', () => {
  for (const [naam, hex] of Object.entries(STOPLICHT)) {
    it(`waarschuwt voor ${naam}`, () => {
      expect(accentClashesWithStatus(hex)).toBe('warn')
    })
  }

  it('de stoplichtkleuren zitten allemaal bóven de accent-band', () => {
    for (const hex of Object.values(STOPLICHT)) {
      expect(hexToOklch(hex).C).toBeGreaterThanOrEqual(ACCENT_CHROMA_MAX)
    }
  })

  it('de gepinde STATUS_HUES komen overeen met de echte stoplicht-hexen', () => {
    expect(hexToOklch('#10b981').h).toBeCloseTo(STATUS_HUES.goed, 0)
    expect(hexToOklch('#f59e0b').h).toBeCloseTo(STATUS_HUES.aandacht, 0)
    expect(hexToOklch('#ef4444').h).toBeCloseTo(STATUS_HUES.actie, 0)
  })
})

describe('accentClashesWithStatus — de accent-defaults', () => {
  it('alle vier de accent-defaults zijn ok', () => {
    for (const [key, hex] of Object.entries(DEFAULT_MODULE_COLORS)) {
      expect(accentClashesWithStatus(hex), `${key} (${hex})`).toBe('ok')
    }
  })

  it('alle vier de accent-defaults zitten in de accent-band', () => {
    for (const [key, hex] of Object.entries(DEFAULT_MODULE_COLORS)) {
      const { C } = hexToOklch(hex)
      expect(C, `${key} (${hex}) onder de band`).toBeGreaterThan(0.02)
      expect(C, `${key} (${hex}) boven de band`).toBeLessThan(ACCENT_CHROMA_MAX)
    }
  })

  /**
   * De kern van de UR3-32-oplossing: Bezittingen HOUDT de groene familie van
   * de oude hefboomtint (hue blijft dicht bij emerald), maar is ontzadigd tot
   * in de accent-band. Herkenbaarheid behouden, botsing opgeheven.
   */
  it('Bezittingen houdt de groene familie maar is ontzadigd', () => {
    const nieuw = hexToOklch(DEFAULT_MODULE_COLORS.kern)
    const oudeHefboomTint = hexToOklch('#047857') // emerald-700, de oude tint
    expect(Math.abs(nieuw.h - oudeHefboomTint.h)).toBeLessThan(5)
    expect(nieuw.C).toBeLessThan(oudeHefboomTint.C)
    expect(accentClashesWithStatus(DEFAULT_MODULE_COLORS.kern)).toBe('ok')
    expect(accentClashesWithStatus('#047857')).toBe('warn')
  })

  it('een gedempte kleur naast een statushue blijft ok (chroma, niet hue, beslist)', () => {
    // Het oude horizon-goud: h=76,6 — 6,5 graden van amber-warn, maar C=0,082.
    expect(accentClashesWithStatus('#c4a06b')).toBe('ok')
  })

  it('een verzadigde kleur ver van elke statushue blijft ok', () => {
    // Indigo #4338ca: C ver boven de band, maar hue nergens in de buurt.
    expect(accentClashesWithStatus('#4338ca')).toBe('ok')
  })
})

/**
 * De toets is er voor IDENTITEITS-accenten. Fase- en budget-type-kleuren zijn
 * een eigen systeem waarin een rood juist iets betekent (herstel-urgentie,
 * een verplichting) — die mogen dus bewust wél in de rode band zitten. Dat
 * pinnen we hier expliciet, zodat een latere hergebruik van deze toets op die
 * groepen een bewuste keuze is en geen ongeluk.
 */
describe('accentClashesWithStatus — de overige instelbare kleurgroepen', () => {
  it('de fase-kleuren die géén urgentie dragen zijn ok', () => {
    for (const key of ['phase_stability', 'phase_momentum', 'phase_mastery'] as const) {
      const hex = DEFAULT_PHASE_COLORS[key]
      expect(accentClashesWithStatus(hex), `${key} (${hex})`).toBe('ok')
    }
  })

  it('phase_recovery zit bewust in de rode band — dat is daar de betekenis', () => {
    expect(accentClashesWithStatus(DEFAULT_PHASE_COLORS.phase_recovery)).toBe('warn')
  })

  it('de budget-type-defaults zijn ok, behalve het bewust bordeauxrode "debt"', () => {
    for (const key of ['income', 'expense', 'savings', 'other'] as const) {
      const hex = DEFAULT_BUDGET_COLORS[key]
      expect(accentClashesWithStatus(hex), `${key} (${hex})`).toBe('ok')
    }
    expect(accentClashesWithStatus(DEFAULT_BUDGET_COLORS.debt)).toBe('warn')
  })
})
