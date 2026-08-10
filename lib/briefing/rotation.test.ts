import { describe, it, expect } from 'vitest'
import {
  BRIEFING_ROTATION_MODULO,
  nextRotationOffset,
  parseRotationOffset,
  rotateEntries,
} from './rotation'

describe('parseRotationOffset', () => {
  it('leest een geldig getal', () => {
    expect(parseRotationOffset('4')).toBe(4)
  })

  it('valt terug op 0 bij ontbrekende of onzinnige waarde', () => {
    expect(parseRotationOffset(undefined)).toBe(0)
    expect(parseRotationOffset(null)).toBe(0)
    expect(parseRotationOffset('')).toBe(0)
    expect(parseRotationOffset('geen getal')).toBe(0)
    expect(parseRotationOffset('-3')).toBe(0)
  })

  it('modulo\'t een te grote waarde binnen de cap', () => {
    expect(parseRotationOffset(String(BRIEFING_ROTATION_MODULO + 2))).toBe(2)
  })
})

describe('nextRotationOffset', () => {
  it('schuift één plek op', () => {
    expect(nextRotationOffset(0)).toBe(1)
    expect(nextRotationOffset(4)).toBe(5)
  })

  it('rolt om binnen de cap', () => {
    expect(nextRotationOffset(BRIEFING_ROTATION_MODULO - 1)).toBe(0)
  })
})

describe('rotateEntries', () => {
  const six = [1, 2, 3, 4, 5, 6]

  it('pakt drie opeenvolgende items vanaf de cursor', () => {
    expect(rotateEntries(six, 0, 3)).toEqual([1, 2, 3])
    expect(rotateEntries(six, 1, 3)).toEqual([2, 3, 4])
    expect(rotateEntries(six, 3, 3)).toEqual([4, 5, 6])
  })

  it('loopt cyclisch door over het einde heen', () => {
    expect(rotateEntries(six, 4, 3)).toEqual([5, 6, 1])
    expect(rotateEntries(six, 5, 3)).toEqual([6, 1, 2])
    expect(rotateEntries(six, 6, 3)).toEqual([1, 2, 3])
  })

  it('mobiel-venster van 1 schuift per stap één briefje op', () => {
    expect(rotateEntries(six, 0, 1)).toEqual([1])
    expect(rotateEntries(six, 1, 1)).toEqual([2])
    expect(rotateEntries(six, 5, 1)).toEqual([6])
    expect(rotateEntries(six, 6, 1)).toEqual([1])
  })

  it('herhaalt niets wanneer er minder items zijn dan het venster', () => {
    expect(rotateEntries([1, 2], 0, 3)).toEqual([1, 2])
    expect(rotateEntries([1, 2], 1, 3)).toEqual([2, 1])
    expect(rotateEntries([1], 7, 3)).toEqual([1])
  })

  it('geeft een lege lijst bij geen items of leeg venster', () => {
    expect(rotateEntries([], 3, 3)).toEqual([])
    expect(rotateEntries(six, 0, 0)).toEqual([])
  })
})
