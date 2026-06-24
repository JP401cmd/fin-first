import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regressie: `/beheer/horizon-tabellen-mij` fetchte `GET /api/horizon-engine/ledger`,
 * maar die route werd in de C5-uitfasering (commit 1417a4568) verwijderd terwijl
 * de consumerende pagina bleef staan → 404 ("Serverfout (404)") bij het ophalen
 * van de tabellen. Deze test pint het page↔route-contract: elke `/api`-fetch in
 * de pagina MOET een bestaand route-handler-bestand hebben.
 */
describe('mijn-ledger page ↔ API route contract', () => {
  const pageSrc = readFileSync(
    join(process.cwd(), 'app/(app)/beheer/horizon-tabellen-mij/mijn-ledger.tsx'),
    'utf8',
  )
  const fetched = [...pageSrc.matchAll(/fetch\(\s*['"`](\/api\/[^'"`]+)['"`]/g)].map((m) => m[1])

  it('fetcht minstens één /api-endpoint', () => {
    expect(fetched.length).toBeGreaterThan(0)
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
