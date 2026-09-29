import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

/**
 * Bron-scan (Krant 3A, ADR 0187): de native API praat UITSLUITEND als de lezer
 * (anon-client + token, RLS own-row). Eén service-role-import en een fout in
 * één route lekt de rijen van alle lezers.
 *
 * TRANSITIEF: vanaf elke v1-route volgen we de runtime-imports (`@/…` en
 * relatief; `import type` telt niet) door de hele lib-graaf. Geen enkel
 * bereikt bestand mag de service-role of de cookie-client gebruiken — behalve
 * de ALLOWLIST hieronder, waar de scan ook niet verder in afdaalt.
 *
 * Daarnaast: elke handler — in élke exportvorm — authenticeert eerst via
 * `vereisBearer`, met `muteren: true` voor elke mutatie.
 */

const ROOT = process.cwd()
const V1 = join(ROOT, 'app', 'api', 'v1')

/**
 * Bewust toegestaan, met reden. Het bestand zelf wordt niet op VERBODEN getoetst;
 * `afdalen` zegt of de scan zijn imports nog volgt.
 */
const ALLOWLIST: Record<string, { reden: string; afdalen: boolean }> = {
  'lib/api/respond.ts': { reden: 'foutvorm (ADR 0044); importeert de foutlogging hieronder', afdalen: true },
  'lib/observability/server-error-log.ts': {
    reden: 'schrijft error_logs met de service-role (ADR 0044) — gemaskeerd, geen lezersdata, nooit een read',
    afdalen: false,
  },
}

/** Commentaar weg (blok + regel), zodat een uitleg die getServiceClient noemt niet meetelt. URL's in strings blijven staan. */
const zonderCommentaar = (bron: string) => bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
const code = (pad: string) => zonderCommentaar(readSourceLF(pad))

const VERBODEN: Array<[string, RegExp]> = [
  ['getServiceClient', /\bgetServiceClient\b/],
  ['lib/supabase/service', /lib\/supabase\/service['"]/],
  ['SUPABASE_SERVICE_ROLE_KEY', /SUPABASE_SERVICE_ROLE_KEY/],
  ['cookie-client lib/supabase/server', /lib\/supabase\/server['"]/],
  ['next/headers (cookies)', /['"]next\/headers['"]/],
]

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/')

function bestanden(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) return bestanden(pad)
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : []
  })
}

function losOp(spec: string, van: string): string | null {
  const basis = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(van), spec) : null
  if (!basis) return null // pakket uit node_modules
  for (const kandidaat of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, 'index.ts'), join(basis, 'index.tsx')]) {
    if (existsSync(kandidaat) && statSync(kandidaat).isFile()) return kandidaat
  }
  return null
}

/** Runtime-imports (geen `import type`), inclusief re-exports en dynamische imports. */
function imports(bron: string): string[] {
  const uit: string[] = []
  const statisch = /^\s*(import|export)\s+(?!type\s)[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm
  const kaal = /^\s*import\s+['"]([^'"]+)['"]/gm
  const dynamisch = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of bron.matchAll(statisch)) uit.push(m[2])
  for (const m of bron.matchAll(kaal)) uit.push(m[1])
  for (const m of bron.matchAll(dynamisch)) uit.push(m[1])
  return uit
}

function graaf(start: string[]): string[] {
  const gezien = new Set<string>()
  const stapel = [...start]
  while (stapel.length) {
    const pad = stapel.pop()!
    if (gezien.has(pad)) continue
    gezien.add(pad)
    if (ALLOWLIST[rel(pad)] && !ALLOWLIST[rel(pad)].afdalen) continue
    for (const spec of imports(code(pad))) {
      const doel = losOp(spec, pad)
      if (doel && !gezien.has(doel)) stapel.push(doel)
    }
  }
  return [...gezien]
}

const V1_BESTANDEN = bestanden(V1)
const ROUTES = V1_BESTANDEN.filter((p) => p.endsWith('route.ts'))
const EXTRA = [
  join(ROOT, 'lib', 'supabase', 'bearer.ts'),
  ...readdirSync(join(ROOT, 'lib', 'krant'))
    .filter((n) => /^(v1-.*|contract.*)\.ts$/.test(n) && !/\.test\.ts$/.test(n))
    .map((n) => join(ROOT, 'lib', 'krant', n)),
]
const BEREIKT = graaf([...V1_BESTANDEN, ...EXTRA])

describe('app/api/v1/** gebruikt nooit de service-role of cookies — ook niet transitief', () => {
  it('vindt de v1-routes, de helpers en hun graaf (de scan kijkt niet in het niets)', () => {
    expect(ROUTES.map(rel)).toEqual(
      expect.arrayContaining([
        'app/api/v1/krant/config/route.ts',
        'app/api/v1/krant/profiel/route.ts',
        'app/api/v1/krant/feedback/route.ts',
      ]),
    )
    const bereikt = BEREIKT.map(rel)
    for (const verwacht of [
      'lib/supabase/bearer.ts',
      'lib/krant/contract.ts',
      'lib/krant/contract-openapi.ts',
      'lib/krant/v1-profiel.ts',
      'lib/krant/tijdlijn-bron.ts',
      'lib/api/respond.ts',
    ]) {
      expect(bereikt).toContain(verwacht)
    }
  })

  it.each(VERBODEN)('geen %s', (_naam, patroon) => {
    const overtreders = BEREIKT.filter((p) => !ALLOWLIST[rel(p)])
      .filter((p) => patroon.test(code(p)))
      .map(rel)
    expect(overtreders).toEqual([])
  })

  it('de allowlist is nog nodig (een entry die niets meer uitzondert moet weg)', () => {
    for (const pad of Object.keys(ALLOWLIST)) expect(BEREIKT.map(rel)).toContain(pad)
  })
})

describe('elke v1-handler authenticeert eerst via vereisBearer', () => {
  const METHODE = 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS'

  it('geen handler buiten `export async function` om (export const / export { x as … })', () => {
    const fouten: string[] = []
    for (const pad of ROUTES) {
      const bron = readSourceLF(pad)
      if (new RegExp(`^export\\s+(const|let|var)\\s+(${METHODE})\\b`, 'm').test(bron)) fouten.push(`${rel(pad)}: export const-handler`)
      if (new RegExp(`^export\\s+function\\s+(${METHODE})\\b`, 'm').test(bron)) fouten.push(`${rel(pad)}: synchrone handler`)
      if (new RegExp(`^export\\s*\\{[^}]*\\bas\\s+(${METHODE})\\b`, 'm').test(bron)) fouten.push(`${rel(pad)}: export { … as METHODE }`)
      if (new RegExp(`^export\\s*\\{[^}]*\\b(${METHODE})\\b[^}]*\\}`, 'm').test(bron)) fouten.push(`${rel(pad)}: export { METHODE }`)
      if (/^export\s+\*\s+from/m.test(bron)) fouten.push(`${rel(pad)}: export * from`)
    }
    expect(fouten).toEqual([])
  })

  it('muteren: true voor elke mutatie, false voor GET', () => {
    const fouten: string[] = []
    for (const pad of ROUTES) {
      const handlers = readSourceLF(pad).split(/^export async function /m).slice(1)
      if (handlers.length === 0) fouten.push(`${rel(pad)}: geen handler gevonden`)
      for (const h of handlers) {
        const methode = h.slice(0, h.indexOf('('))
        const verwacht = methode === 'GET' ? 'false' : 'true'
        if (!h.includes(`vereisBearer(request, { muteren: ${verwacht} })`)) fouten.push(`${rel(pad)} ${methode}`)
      }
    }
    expect(fouten).toEqual([])
  })
})
