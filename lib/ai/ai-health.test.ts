import { describe, it, expect } from 'vitest'
import { AI_HEALTH_FAILURE_THRESHOLD, deriveAiHealth, type AiFailureSignal } from './ai-health'

/**
 * UR3-09 / ADR 0132 — puur, geen IO. Drempel = 2 mislukte calls sinds het
 * laatste succes (eigenaar-besluit 5 sep 2026).
 */

const AT = (iso: string) => iso // leesbaarheid: expliciete ISO-tijdstempels

describe('deriveAiHealth', () => {
  it('0 mislukkingen + wél een laatste succes → ok', () => {
    const r = deriveAiHealth({ lastSuccessAt: AT('2026-09-01T10:00:00Z'), failuresSinceSuccess: [] })
    expect(r.status).toBe('ok')
    expect(r.sinceAt).toBeNull()
    expect(r.failureCount).toBe(0)
    expect(r.lastSuccessAt).toBe('2026-09-01T10:00:00Z')
  })

  it('0 mislukkingen + geen laatste succes → idle', () => {
    const r = deriveAiHealth({ lastSuccessAt: null, failuresSinceSuccess: [] })
    expect(r.status).toBe('idle')
    expect(r.lastSuccessAt).toBeNull()
  })

  it('1 mislukking (ongeacht soort) → attention', () => {
    for (const kind of ['refused', 'transient', 'unknown'] as const) {
      const r = deriveAiHealth({
        lastSuccessAt: AT('2026-09-01T10:00:00Z'),
        failuresSinceSuccess: [{ at: '2026-09-05T09:00:00Z', kind }],
      })
      expect(r.status, kind).toBe('attention')
    }
  })

  it(`${AI_HEALTH_FAILURE_THRESHOLD}+ mislukkingen waarvan de LAATSTE (op tijd, niet invoegvolgorde) 'refused' is → storing`, () => {
    // Bewust uit volgorde aangeleverd: de tweede array-entry is chronologisch
    // de EERSTE mislukking. deriveAiHealth moet zelf op `at` sorteren.
    const failures: AiFailureSignal[] = [
      { at: '2026-09-05T09:00:00Z', kind: 'refused' }, // chronologisch laatste
      { at: '2026-09-05T08:00:00Z', kind: 'transient' }, // chronologisch eerste
    ]
    const r = deriveAiHealth({ lastSuccessAt: '2026-09-05T07:00:00Z', failuresSinceSuccess: failures })
    expect(r.status).toBe('storing')
    expect(r.sinceAt).toBe('2026-09-05T08:00:00Z') // eerste mislukking, niet de eerste array-entry
    expect(r.failureCount).toBe(2)
  })

  it(`${AI_HEALTH_FAILURE_THRESHOLD}+ mislukkingen waarvan de laatste 'transient' is → hapering`, () => {
    const failures: AiFailureSignal[] = [
      { at: '2026-09-05T08:00:00Z', kind: 'refused' },
      { at: '2026-09-05T09:00:00Z', kind: 'transient' },
    ]
    const r = deriveAiHealth({ lastSuccessAt: '2026-09-05T07:00:00Z', failuresSinceSuccess: failures })
    expect(r.status).toBe('hapering')
  })

  it(`${AI_HEALTH_FAILURE_THRESHOLD}+ mislukkingen waarvan de laatste 'unknown' is → hapering`, () => {
    const failures: AiFailureSignal[] = [
      { at: '2026-09-05T08:00:00Z', kind: 'refused' },
      { at: '2026-09-05T09:00:00Z', kind: 'unknown' },
    ]
    const r = deriveAiHealth({ lastSuccessAt: '2026-09-05T07:00:00Z', failuresSinceSuccess: failures })
    expect(r.status).toBe('hapering')
  })

  it('sinceAt is altijd de VROEGSTE mislukking, ook bij 3+ door elkaar aangeleverd', () => {
    const failures: AiFailureSignal[] = [
      { at: '2026-09-05T12:00:00Z', kind: 'transient' },
      { at: '2026-09-05T08:00:00Z', kind: 'transient' }, // vroegst
      { at: '2026-09-05T10:00:00Z', kind: 'transient' },
    ]
    const r = deriveAiHealth({ lastSuccessAt: null, failuresSinceSuccess: failures })
    expect(r.sinceAt).toBe('2026-09-05T08:00:00Z')
    expect(r.failureCount).toBe(3)
  })

  it('failureCount is altijd de array-lengte', () => {
    const failures: AiFailureSignal[] = Array.from({ length: 5 }, (_, i) => ({
      at: `2026-09-0${i + 1}T10:00:00Z`,
      kind: 'unknown' as const,
    }))
    const r = deriveAiHealth({ lastSuccessAt: null, failuresSinceSuccess: failures })
    expect(r.failureCount).toBe(5)
  })
})
