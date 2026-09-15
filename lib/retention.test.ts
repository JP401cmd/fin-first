import { describe, it, expect } from 'vitest'
import {
  RETENTION_MONTHS,
  LEAD_INTAKES_RETENTION_DAYS,
  USER_ACTIVITY_RETENTION_DAYS,
  retentionCutoffDate,
  retentionCutoffIso,
} from './retention'

/**
 * [Arch F3] Recht 4 — bewaartermijnen (ADR 0059). Borgt de goedgekeurde termijnen
 * (single source) en de cutoff-rekenkundigheid die de retentie-cron gebruikt.
 */
describe('retention — bewaartermijnen (single source)', () => {
  it('legt de goedgekeurde termijnen vast', () => {
    expect(RETENTION_MONTHS).toEqual({
      error_logs: 12,
      mail_log: 12,
      job_runs: 6,
      contract_events: 24,
      ai_token_usage: 24,
      ai_usage: 24,
    })
    expect(LEAD_INTAKES_RETENTION_DAYS).toBe(90)
    expect(USER_ACTIVITY_RETENTION_DAYS).toBe(400)
  })

  it('retentionCutoffDate rekent `days` dagen terug als YYYY-MM-DD', () => {
    const now = new Date('2026-09-15T22:30:00.000Z')
    expect(retentionCutoffDate(400, now)).toBe('2025-08-11')
    expect(retentionCutoffDate(0, now)).toBe('2026-09-15')
  })

  it('retentionCutoffIso rekent `months` maanden terug', () => {
    const now = new Date('2026-07-21T03:45:00.000Z')
    const cutoff12 = new Date(retentionCutoffIso(12, now))
    expect(cutoff12.toISOString()).toBe('2025-07-21T03:45:00.000Z')

    const cutoff6 = new Date(retentionCutoffIso(6, now))
    expect(cutoff6.toISOString()).toBe('2026-01-21T03:45:00.000Z')
  })

  it('cutoff ligt altijd in het verleden', () => {
    const now = new Date()
    for (const months of Object.values(RETENTION_MONTHS)) {
      expect(new Date(retentionCutoffIso(months, now)).getTime()).toBeLessThan(now.getTime())
    }
  })
})
