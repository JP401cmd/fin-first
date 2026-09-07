import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Poort op de bronverwijzingen in de acceptatiecriteria.
 *
 * Elk criterium in `lib/uat/acceptance/*.ts` noemt in `assertion.source` de
 * bestanden waar het gedrag vandaan komt. Die verwijzingen verouderen stil: een
 * bestand verhuist naar een submap en de `source` blijft naar het oude pad
 * wijzen. Niets valideerde dat tot nu toe — WF-RAPP-11 wees maandenlang naar
 * `app/(app)/rapportages/benchmark/metric-detail-sheet.tsx` terwijl het bestand
 * onder `benchmark/components/` staat, en geen enkele suite merkte het.
 *
 * Bewust conservatief: alleen tokens die met een bekende top-level map beginnen
 * EN op een bekende extensie eindigen tellen als controleerbaar pad. Daarmee
 * vallen API-routes (`/api/admin/settings`), losse symbolen en relatieve
 * vervolgen (`kpi/page.tsx` na een eerder genoemde map) buiten de toets. Liever
 * een paar paden niet gecontroleerd dan een poort die ruis geeft en daarom
 * genegeerd wordt.
 */

const ROOT = join(__dirname, '..', '..')
const ACCEPTANCE_DIR = join(ROOT, 'lib', 'uat', 'acceptance')

/**
 * De lookbehind veranker het pad aan een echte woordgrens. Zonder die anker
 * snijdt de regex een geldig ogende staart uit een langer pad — `packages/lib/
 * foo.ts` zou als `lib/foo.ts` gelezen worden en dan als vals dood pad
 * opduiken. Prijs van het anker: een verkeerd getypte hoofdmap (`component/app/
 * x.tsx`) wordt niet meer herkend en dus ook niet gecontroleerd. Liever een
 * blinde vlek dan een poort die onterecht rood staat.
 *
 * Nauw verwant: `scripts/uat/stale-scan.mjs#extractSourceRefs` doet dit voor de
 * `source:`-velden en draait al in CI. Deze toets is bewust ruimer — hij scant
 * óók `given`/`when`/`then`, waar net zo goed bestandsverwijzingen in staan.
 */
const CHECKABLE_PATH =
  /(?<![A-Za-z0-9_/-])(?:app|lib|components|scripts|supabase|docs)\/[A-Za-z0-9_\-./()[\]]*\.(?:tsx|ts|mjs|json|sql|css|md)/g

/**
 * Verwijzingen die de cashflow-laag noemen. Die laag is met ADR 0135 verdwenen
 * (budget werd hefboom 3) en de criteria wijzen nog naar de oude bestanden.
 * Wélk oppervlak hun rol heeft overgenomen is domeinkennis die hier niet thuis
 * hoort — dat is een aparte opruiming voor de uat-docs-keeper.
 *
 * Deze lijst mag alleen KRIMPEN: staat een entry er nog in terwijl het pad weer
 * bestaat (of de verwijzing is herschreven), dan faalt de toets hieronder hard.
 * Voeg hier niets aan toe zonder dat expliciet te verantwoorden.
 */
const RESIDUE = [
  'components/app/cash-overview.tsx',
  'app/(app)/overzicht/cashflow/page.tsx',
  'lib/overview/sinds-vorig-bezoek.ts',
] as const

function acceptanceFiles(): string[] {
  return readdirSync(ACCEPTANCE_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    // types.ts draagt de typedefinities, geen criteria — en de doc-comments
    // daarin gebruiken een letterlijke ellips (`docs/uat/.../bezit.md`) als
    // voorbeeldvorm, niet als bestandsverwijzing.
    .filter((f) => f !== 'types.ts')
    .sort()
}

/** Alle (bestand, pad)-paren uit de `source:`-regels van de acceptatiecriteria. */
function collectSourcePaths(): Array<{ inFile: string; path: string }> {
  const found: Array<{ inFile: string; path: string }> = []
  for (const file of acceptanceFiles()) {
    const text = readFileSync(join(ACCEPTANCE_DIR, file), 'utf8')
    for (const line of text.split('\n')) {
      if (!line.includes('/') || !/\.(tsx|ts|mjs|json|sql|css|md)\b/.test(line)) continue
      for (const match of line.matchAll(CHECKABLE_PATH)) {
        found.push({ inFile: file, path: match[0] })
      }
    }
  }
  return found
}

describe('UAT-acceptatiecriteria — bronverwijzingen', () => {
  it('noemt genoeg controleerbare paden om de toets betekenis te geven', () => {
    // Ondergrens: valt de extractie stil (bv. door een formaatwijziging), dan
    // wordt de bestaanscheck hieronder een lege lus die altijd slaagt.
    expect(collectSourcePaths().length).toBeGreaterThan(300)
  })

  it('verwijst uitsluitend naar bestaande bestanden', () => {
    const dood = collectSourcePaths()
      .filter(({ path }) => !existsSync(join(ROOT, path)))
      .filter(({ path }) => !RESIDUE.includes(path as (typeof RESIDUE)[number]))
      .map(({ inFile, path }) => `${inFile} → ${path}`)

    expect(dood).toEqual([])
  })

  it('houdt de residulijst krimpend — een opgelost pad hoort eruit', () => {
    const nogSteedsDood = RESIDUE.filter((path) => !existsSync(join(ROOT, path)))
    expect(nogSteedsDood).toEqual([...RESIDUE])
  })
})
