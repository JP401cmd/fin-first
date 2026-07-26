/**
 * In-app regressie-suite: UAT-CANON engine-checks (canonieke getallen).
 *
 * Draait `CANON_ENGINE_CHECKS` (lib/uat/acceptance/canon-checks.ts) — dezelfde
 * lijst als `lib/uat/acceptance/canon.engine.test.ts` (vitest/CI) — vanuit
 * `/beheer/regressietest`. Geen tweede bron van waarheid: de rekenlogica en de
 * "expected"-cijfers leven UITSLUITEND in `canon-checks.ts`; deze suite roept
 * alleen `check.run()` aan en vergelijkt met `assertEqual`.
 *
 * CANON toetst per kerngetal dat er precies één canonieke bron is. Alleen de
 * PURE canonieke functies (spaarquote, vrijheids-%, FIRE-eligible grondslag, SWR,
 * dagtarief, Box 3-heffing, jaarruimte-besparing) zijn exact toetsbaar en staan
 * hier. Alle checks zijn pure functies op vaste fixture-getallen — geen netwerk,
 * geen auth-afhankelijkheid, vandaar `requiredRole: 'any'`.
 */
import { registerCategory, registerTests } from '../test-registry'
import { assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { CANON_ENGINE_CHECKS } from '@/lib/uat/acceptance/canon-checks'

const CAT = 'uat.canon'

const tests: TestCase[] = CANON_ENGINE_CHECKS.map((check) => ({
  id: `uat-canon-${check.workflow.toLowerCase()}`,
  name: `${check.workflow} (${check.scenarioId}): ${check.label}`,
  category: CAT,
  description: check.label,
  priority: 'high',
  estimatedDurationMs: 5,
  requiredRole: 'any',
  fn() {
    const { expected, actual } = check.run()
    assertEqual(actual, expected, `${check.workflow} — ${check.label}`)
  },
}))

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'UAT — Canonieke getallen (engine)',
    description:
      'Acceptatiecriteria domein CANON: elk kerngetal precies één canonieke bron. De exact-toetsbare identiteiten (spaarquote, vrijheids-%, FIRE-eligible grondslag-delta, SWR, één dagtarief, Box 3-heffing, jaarruimte-besparing) via de canonieke SSoT-functies op vaste fixtures. Gedeeld met canon.engine.test.ts.',
    icon: 'Fingerprint',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
