import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CRON_PUBLIC_PATHS } from './proxy'

/**
 * Bewaakt de sync tussen de cron-allowlist in de middleware en de crons in
 * `vercel.json` (ADR 0102).
 *
 * WAAROM dit een test verdient: `/api/` is een protected prefix, dus een
 * cron-route die hier ontbreekt krijgt een 401 van de middleware VÓÓR zijn eigen
 * CRON_SECRET-check. De taak draait dan nooit, schrijft géén `job_runs`-rij, en
 * `/beheer/jobs` toont exact hetzelfde beeld als "nog niet aan de beurt" —
 * stille, volledige uitval. Precies dat gebeurde bij het toevoegen van
 * `/api/cron/alerts-sweep`: het comment zei al dat de lijsten in sync moesten
 * blijven, maar niets dwong het af.
 */

const vercelConfig = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf-8'),
) as { crons?: { path: string; schedule: string }[] }

describe('cron-paths: middleware-allowlist ↔ vercel.json', () => {
  it('vercel.json heeft crons gedefinieerd', () => {
    expect(vercelConfig.crons?.length).toBeGreaterThan(0)
  })

  it('elke geplande cron staat in de middleware-allowlist', () => {
    const missing = (vercelConfig.crons ?? [])
      .map((c) => c.path)
      .filter((path) => !CRON_PUBLIC_PATHS.includes(path))
    expect(
      missing,
      `Deze cron-paden ontbreken in CRON_PUBLIC_PATHS (lib/supabase/proxy.ts) en worden ` +
        `daardoor door de middleware ge-401't vóór hun CRON_SECRET-check: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('de allowlist bevat geen paden die geen cron (meer) zijn', () => {
    const scheduled = new Set((vercelConfig.crons ?? []).map((c) => c.path))
    const stale = CRON_PUBLIC_PATHS.filter((p) => !scheduled.has(p))
    expect(
      stale,
      `Deze paden staan publiek in de middleware maar zijn geen geplande cron meer — ` +
        `verwijderen, anders blijft er onnodig een uitgelogd bereikbaar endpoint open: ${stale.join(', ')}`,
    ).toEqual([])
  })
})
