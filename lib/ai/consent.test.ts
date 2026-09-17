import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AI_CONSENT_CLIENT_SOURCES,
  AI_CONSENT_DECISIONS,
  AI_CONSENT_KINDS,
  AI_CONSENT_SOURCES,
} from './consent'

/**
 * De CHECK-constraints in de migratie spiegelen `lib/ai/consent.ts` letterlijk —
 * die belofte staat in beide bestanden, en dit is de toets die 'm waar houdt.
 * Drift is hier geen theoretisch risico: een nieuwe bron in TypeScript zonder
 * correctiemigratie levert in productie een 23514 op de INSERT, en dat pad
 * (POST /api/consent/ai) is precies de plek waar een gebruiker "ja" zegt.
 */
const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260917130000_ai_consent_events.sql',
)

function checkValues(sql: string, column: string): string[] {
  const match = sql.match(new RegExp(`${column}\\s+text\\s+not null\\s+check\\s*\\(${column} in \\(([^)]*)\\)\\)`))
  if (!match) throw new Error(`Geen CHECK op kolom ${column} gevonden in de migratie`)
  return match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
}

describe('lib/ai/consent ↔ migratie 20260917130000', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('kind-CHECK spiegelt AI_CONSENT_KINDS', () => {
    expect(checkValues(sql, 'kind').sort()).toEqual([...AI_CONSENT_KINDS].sort())
  })

  it('decision-CHECK spiegelt AI_CONSENT_DECISIONS', () => {
    expect(checkValues(sql, 'decision').sort()).toEqual([...AI_CONSENT_DECISIONS].sort())
  })

  it('source-CHECK spiegelt AI_CONSENT_SOURCES', () => {
    expect(checkValues(sql, 'source').sort()).toEqual([...AI_CONSENT_SOURCES].sort())
  })

  it('de client-bronnen zijn een strikte deelverzameling (server-only bronnen blijven server-only)', () => {
    for (const s of AI_CONSENT_CLIENT_SOURCES) expect(AI_CONSENT_SOURCES).toContain(s)
    expect(AI_CONSENT_SOURCES.length).toBeGreaterThan(AI_CONSENT_CLIENT_SOURCES.length)
    expect(AI_CONSENT_CLIENT_SOURCES).not.toContain('pension-upload')
    expect(AI_CONSENT_CLIENT_SOURCES).not.toContain('seed')
  })
})
