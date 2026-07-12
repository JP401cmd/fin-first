/**
 * In-app regressie-suite: UAT-Nav engine-checks.
 *
 * Draait `NAV_ENGINE_CHECKS` (lib/uat/acceptance/nav-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/nav.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `nav-checks.ts`; deze suite roept
 * alleen `check.run()` aan (async, want de next.config.ts-redirects-check is
 * async) en vergelijkt met `assertEqual`.
 *
 * NAV combineert échte routing-/configuratiefuncties (deriveTabFromPath,
 * resolveRouteTitle, filterPagesByModules, buildActionItems, SIMPLE_HIDDEN_NAV_HREFS,
 * next.config.ts-redirects) met twee kleine mirrors (resolveTabRedirect — de
 * server-page is niet client-bundelbaar — en de bel-badge-cap). Alle checks
 * zijn pure functies — geen netwerk, geen auth-afhankelijkheid, vandaar
 * `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { NAV_ENGINE_CHECKS } from '@/lib/uat/acceptance/nav-checks'

const CAT = 'uat.nav'

const tests: TestCase[] = NAV_ENGINE_CHECKS.map((check) => ({
  id: `uat-nav-${check.workflow.toLowerCase()}`,
  name: `${check.workflow} (${check.scenarioId}): ${check.label}`,
  category: CAT,
  description: check.label,
  priority: 'high',
  estimatedDurationMs: 5,
  requiredRole: 'any',
  async fn() {
    const { expected, actual } = await check.run()
    assertEqual(actual, expected, `${check.workflow} — ${check.label}`)
  },
}))

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'UAT — Navigatie (engine)',
    description:
      'Acceptatiecriteria domein Navigatie & shell: actieve-tab-detectie (incl. legacy-routes), titel-fallback/tab-root-detectie, command-palette-module-filter en -acties (perspectief/privacy/sync), Eenvoudig-weergave-verberglijst, navigatie-stack-FIFO-cap, oude ?tab=-deeplinks, het legacy-redirect-net en de bel-badge-cap. Gedeeld met nav.engine.test.ts.',
    icon: 'Compass',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
