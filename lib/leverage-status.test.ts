import { describe, it, expect } from 'vitest'
import {
  pillarStatus,
  leverageStatusTextClass,
  leverageStatusBgClass,
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  type LeverageStatus,
} from './leverage-status'
import type { LeverStatus } from '@/lib/lever-scores'

/**
 * Pure-logic tests voor leverage-status helpers.
 *
 * Dekt:
 *  1. pillarStatus — score-drempels (>=70 / >=50 / <50 / null)
 *  2. leverageStatusTextClass — klasse-strings per status
 *  3. leverageStatusBgClass — klasse-strings per status
 *  4. LEVERAGE_STATUS_DOT/LABEL — record-volledigheid (alle LeverageStatus-keys)
 *  5. leverToLeverageStatus-mapping — dezelfde inline lambdalogica uit
 *     app/(app)/layout.tsx:362 zodat de sidebar status-mirror-dots goed spiegelen.
 *     Niet geëxporteerd vanuit layout, dus we testen de logica hier als pure
 *     map — één-op-één overgenomen.
 */

// ── leverToLeverageStatus (inline-mapping uit layout.tsx, niet geëxporteerd) ──
// Spiegelt: s === 'green' ? 'good' : s === 'amber' ? 'warn' : s === 'red' ? 'bad' : 'neutral'
function leverToLeverageStatus(s: LeverStatus): LeverageStatus {
  return s === 'green' ? 'good' : s === 'amber' ? 'warn' : s === 'red' ? 'bad' : 'neutral'
}

describe('pillarStatus', () => {
  it('retourneert "neutral" bij null', () => {
    expect(pillarStatus(null)).toBe('neutral')
  })
  it('retourneert "neutral" bij undefined', () => {
    expect(pillarStatus(undefined)).toBe('neutral')
  })
  it('retourneert "good" bij score >= 70', () => {
    expect(pillarStatus(70)).toBe('good')
    expect(pillarStatus(100)).toBe('good')
  })
  it('retourneert "warn" bij score >= 50 en < 70', () => {
    expect(pillarStatus(50)).toBe('warn')
    expect(pillarStatus(69)).toBe('warn')
  })
  it('retourneert "bad" bij score < 50', () => {
    expect(pillarStatus(49)).toBe('bad')
    expect(pillarStatus(0)).toBe('bad')
    expect(pillarStatus(-1)).toBe('bad')
  })
  it('grens 70: precies goed', () => {
    expect(pillarStatus(70)).toBe('good')
    expect(pillarStatus(69.9)).toBe('warn')
  })
  it('grens 50: precies aandacht', () => {
    expect(pillarStatus(50)).toBe('warn')
    expect(pillarStatus(49.9)).toBe('bad')
  })
})

describe('leverToLeverageStatus (status-mirror sidebar Belasting)', () => {
  it('green → good', () => expect(leverToLeverageStatus('green')).toBe('good'))
  it('amber → warn', () => expect(leverToLeverageStatus('amber')).toBe('warn'))
  it('red → bad', () => expect(leverToLeverageStatus('red')).toBe('bad'))
  it('neutral → neutral', () => expect(leverToLeverageStatus('neutral')).toBe('neutral'))
})

describe('leverageStatusTextClass', () => {
  it('good → emerald-707', () => {
    expect(leverageStatusTextClass('good')).toContain('emerald')
  })
  it('warn → amber', () => {
    expect(leverageStatusTextClass('warn')).toContain('amber')
  })
  it('bad → red', () => {
    expect(leverageStatusTextClass('bad')).toContain('red')
  })
  it('neutral → ink-3', () => {
    expect(leverageStatusTextClass('neutral')).toContain('ink')
  })
  it('alle vier statussen leveren een niet-lege string', () => {
    const statuses: LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']
    for (const s of statuses) {
      expect(leverageStatusTextClass(s).length).toBeGreaterThan(0)
    }
  })
})

describe('leverageStatusBgClass', () => {
  it('good → emerald', () => expect(leverageStatusBgClass('good')).toContain('emerald'))
  it('warn → amber', () => expect(leverageStatusBgClass('warn')).toContain('amber'))
  it('bad → red', () => expect(leverageStatusBgClass('bad')).toContain('red'))
  it('neutral → subtle', () => expect(leverageStatusBgClass('neutral')).toContain('subtle'))
})

describe('LEVERAGE_STATUS_DOT volledigheid', () => {
  const expectedKeys: LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']
  it('heeft een waarde voor alle LeverageStatus-keys', () => {
    for (const key of expectedKeys) {
      expect(LEVERAGE_STATUS_DOT[key]).toBeTruthy()
    }
  })
})

describe('LEVERAGE_STATUS_LABEL volledigheid', () => {
  const expectedKeys: LeverageStatus[] = ['good', 'warn', 'bad', 'neutral']
  it('heeft een label voor alle LeverageStatus-keys', () => {
    for (const key of expectedKeys) {
      expect(typeof LEVERAGE_STATUS_LABEL[key]).toBe('string')
      expect(LEVERAGE_STATUS_LABEL[key].length).toBeGreaterThan(0)
    }
  })
})
