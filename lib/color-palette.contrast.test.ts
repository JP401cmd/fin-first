import { describe, it, expect } from 'vitest'
import { contrastRatio, relativeLuminance, generatePalette } from './color-palette'

/**
 * contrastRatio / relativeLuminance — WCAG 2.x, puur en orde-onafhankelijk.
 * Gebruikt door ColorPickerCard (contrastHint) om te waarschuwen wanneer
 * witte tekst op de 700-shade van een gekozen accentkleur onder AA zakt.
 */
describe('contrastRatio (WCAG 2.x)', () => {
  it('zwart/wit = 21:1, orde-onafhankelijk', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('gelijke kleuren = 1:1', () => {
    expect(contrastRatio('#6b4339', '#6b4339')).toBeCloseTo(1, 5)
  })

  it('bekend WCAG-referentiepaar: wit op #767676 ≈ 4.54:1 (net AA)', () => {
    expect(contrastRatio('#ffffff', '#767676')).toBeGreaterThan(4.5)
    expect(contrastRatio('#ffffff', '#767676')).toBeLessThan(4.6)
  })

  it('relativeLuminance: wit = 1, zwart = 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })
})

describe('contrastHint-drempel op echte accentbases', () => {
  it('default-bases (donker genoeg): wit op 700-shade haalt AA', () => {
    for (const base of ['#6b4339', '#3d3048', '#c4a06b']) {
      const p = generatePalette(base)
      expect(contrastRatio('#ffffff', p[700].hex)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('te lichte basis (oude horizon-Amber #f59e0b): wit op 700-shade zakt onder AA', () => {
    const p = generatePalette('#f59e0b')
    expect(contrastRatio('#ffffff', p[700].hex)).toBeLessThan(4.5)
  })
})
