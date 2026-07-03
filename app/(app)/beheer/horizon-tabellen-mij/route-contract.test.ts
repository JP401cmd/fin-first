import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressie: `/beheer/horizon-tabellen-mij` fetchte ooit `GET /api/horizon-engine/ledger`.
 * Die route (en de hele v2-grootboek-engine) is inmiddels verwijderd, dus de pagina is
 * gedegradeerd tot een stub die enkel doorverwijst naar de horizon-kernel. Deze test pint
 * dat vast: de stub mag GEEN /api-fetch meer bevatten (en zeker niet de verdwenen
 * ledger-route), en moet naar `/beheer/horizon-kernel` verwijzen. Als een fetch terugkomt,
 * moet de bijbehorende route bestaan.
 */
describe('horizon-tabellen-mij stub ↔ geen dode route', () => {
  const pageSrc = readFileSync(
    join(process.cwd(), 'app/(app)/beheer/horizon-tabellen-mij/page.tsx'),
    'utf8',
  )
  const fetched = [...pageSrc.matchAll(/fetch\(\s*['"`](\/api\/[^'"`]+)['"`]/g)].map((m) => m[1])

  it('bevat geen client-fetch naar een /api-endpoint (stub verwijst alleen door)', () => {
    expect(fetched).toHaveLength(0)
  })

  it('verwijst niet meer naar de verwijderde v2-grootboek-route', () => {
    expect(pageSrc).not.toContain('/api/horizon-engine/ledger')
  })

  it('verwijst door naar de horizon-kernel', () => {
    expect(pageSrc).toContain('/beheer/horizon-kernel')
  })

  it.each(fetched)('route-handler bestaat voor %s', (apiPath) => {
    const rel = apiPath.replace(/^\//, '').split('?')[0]
    const candidates = ['ts', 'tsx', 'js'].map((ext) =>
      join(process.cwd(), 'app', rel, `route.${ext}`),
    )
    expect(
      candidates.some(existsSync),
      `Ontbrekende route-handler voor ${apiPath} (verwacht app/${rel}/route.ts)`,
    ).toBe(true)
  })
})
