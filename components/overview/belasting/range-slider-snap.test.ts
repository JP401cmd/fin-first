import { describe, it, expect } from 'vitest'
import {
  nextRangeValueForKey,
  RANGE_PAGE_STEPS,
  snapToStep,
  stepBy,
} from './range-slider-snap'

/**
 * IJKGETALLEN uit de repro (WF-BELAST-10-bug1, Tessa, bruto €160.658, 2026):
 * bovengrens 35.588 → stap round(35588/100) = 356; ondergrens 18.955.
 * 18.955 is géén veelvoud van 356 (53 × 356 = 18.868) en 35.588 evenmin
 * (100 × 356 = 35.600 > max): precies de twee standen die een native
 * numerieke `step` onbereikbaar maakt.
 */
const TESSA = { step: 356, min: 0, max: 35_588 }
const ONDERGRENS = 18_955

describe('range-slider-snap — premisse', () => {
  it('de ondergrens én de bovengrens uit de repro zijn géén veelvoud van de stap', () => {
    expect(ONDERGRENS % TESSA.step).not.toBe(0)
    expect(TESSA.max % TESSA.step).not.toBe(0)
    // Wat de browser er met step=356 van maakte (de waargenomen DOM-waarde).
    expect(Math.round(ONDERGRENS / TESSA.step) * TESSA.step).toBe(18_868)
  })
})

describe('snapToStep — slepen snapt op het raster, grenzen blijven bereikbaar', () => {
  it('rondt naar het dichtstbijzijnde veelvoud', () => {
    expect(snapToStep(19_100, TESSA)).toBe(19_224) // 53,65 → 54 × 356
    expect(snapToStep(19_000, TESSA)).toBe(18_868) // 53,37 → 53 × 356
  })

  it('laat max winnen wanneer het veelvoud eroverheen rondt (bovengrens bereikbaar)', () => {
    // 35.588 / 356 = 99,97 → 100 × 356 = 35.600 > max → max zelf, niet 35.244.
    expect(snapToStep(35_588, TESSA)).toBe(35_588)
    expect(snapToStep(99_999, TESSA)).toBe(35_588)
  })

  it('klemt op min en vangt niet-eindige invoer op', () => {
    expect(snapToStep(-5, TESSA)).toBe(0)
    expect(snapToStep(Number.NaN, TESSA)).toBe(0)
  })

  it('klemt alleen wanneer er geen bruikbare stap is', () => {
    expect(snapToStep(1234, { step: 0, min: 0, max: 5000 })).toBe(1234)
    expect(snapToStep(9999, { step: Number.NaN, min: 0, max: 5000 })).toBe(5000)
  })
})

describe('stepBy — vanaf een niet-veelvoud naar het eerstvolgende rasterpunt', () => {
  it('stapt vanaf de ondergrens omhoog naar het volgende veelvoud, niet naar onder + stap', () => {
    expect(stepBy(ONDERGRENS, 1, TESSA)).toBe(19_224) // 54 × 356
    expect(stepBy(ONDERGRENS, 1, TESSA)).not.toBe(ONDERGRENS + TESSA.step)
  })

  it('stapt vanaf de ondergrens omlaag naar het vorige veelvoud', () => {
    expect(stepBy(ONDERGRENS, -1, TESSA)).toBe(18_868) // 53 × 356
  })

  it('blijft op het raster zodra het erop staat', () => {
    expect(stepBy(19_224, 1, TESSA)).toBe(19_580)
    expect(stepBy(19_224, -1, TESSA)).toBe(18_868)
  })

  it('klemt op de grenzen', () => {
    expect(stepBy(35_400, 1, TESSA)).toBe(35_588)
    expect(stepBy(200, -1, TESSA)).toBe(0)
    expect(stepBy(35_588, 1, TESSA)).toBe(35_588)
  })

  it('count 0 verandert niets (behalve klemmen)', () => {
    expect(stepBy(ONDERGRENS, 0, TESSA)).toBe(ONDERGRENS)
  })
})

describe('nextRangeValueForKey — toetsenbord', () => {
  it('pijltjes stappen één rasterpunt', () => {
    expect(nextRangeValueForKey('ArrowRight', ONDERGRENS, TESSA)).toBe(19_224)
    expect(nextRangeValueForKey('ArrowUp', ONDERGRENS, TESSA)).toBe(19_224)
    expect(nextRangeValueForKey('ArrowLeft', ONDERGRENS, TESSA)).toBe(18_868)
    expect(nextRangeValueForKey('ArrowDown', ONDERGRENS, TESSA)).toBe(18_868)
  })

  it('PageUp/PageDown stappen RANGE_PAGE_STEPS rasterpunten', () => {
    expect(nextRangeValueForKey('PageUp', 0, TESSA)).toBe(RANGE_PAGE_STEPS * TESSA.step)
    expect(nextRangeValueForKey('PageDown', 35_588, TESSA)).toBe(
      (99 - RANGE_PAGE_STEPS + 1) * TESSA.step, // ceil(99,97)=100 → 90 × 356
    )
  })

  it('Home/End springen exact naar min/max (ook als max geen veelvoud is)', () => {
    expect(nextRangeValueForKey('Home', ONDERGRENS, TESSA)).toBe(0)
    expect(nextRangeValueForKey('End', ONDERGRENS, TESSA)).toBe(35_588)
  })

  it('laat andere toetsen aan de browser (null)', () => {
    expect(nextRangeValueForKey('Tab', ONDERGRENS, TESSA)).toBeNull()
    expect(nextRangeValueForKey('Enter', ONDERGRENS, TESSA)).toBeNull()
  })
})
