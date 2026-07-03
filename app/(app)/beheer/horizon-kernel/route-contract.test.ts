import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract: elke `/api/horizon-kernel*`-fetch in de beheer-client MOET een
 * bestaand route-handler-bestand hebben (spiegelt de horizon-tabellen-mij-regressie:
 * een pagina die een verwijderde route fetcht → 404). Scant alle tab-clients.
 */
describe('horizon-kernel beheer-pagina ↔ API route contract', () => {
  const base = join(process.cwd(), 'app/(app)/beheer/horizon-kernel')
  const files = [
    'horizon-kernel-client.tsx',
    'tab-stappen.tsx',
    'tab-verificatie.tsx',
    'tab-vergelijk.tsx',
  ]
  const fetched = new Set<string>()
  for (const f of files) {
    const src = readFileSync(join(base, f), 'utf8')
    for (const m of src.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"?]+)/g)) {
      fetched.add(m[1])
    }
  }
  const paths = [...fetched]

  it('fetcht minstens de drie horizon-kernel-endpoints', () => {
    expect(paths).toContain('/api/horizon-kernel')
    expect(paths).toContain('/api/horizon-kernel/tabel')
    expect(paths).toContain('/api/horizon-kernel/verificatie')
    expect(paths).toContain('/api/horizon-kernel/vergelijk')
  })

  it.each(paths)('route-handler bestaat voor %s', (apiPath) => {
    const rel = apiPath.replace(/^\//, '').split('?')[0]
    const candidates = ['ts', 'tsx', 'js'].map((ext) => join(process.cwd(), 'app', rel, `route.${ext}`))
    expect(candidates.some(existsSync), `Ontbrekende route-handler voor ${apiPath}`).toBe(true)
  })
})
