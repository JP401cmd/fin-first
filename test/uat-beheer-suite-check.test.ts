/**
 * CI-koppeling voor de in-app regressiesuite
 * lib/regression-tests/suites/uat-beheer.ts.
 *
 * Registreert elke TestCase als losse vitest-test via de gedeelde helper
 * (test/helpers/regression-suite-runner.ts), zodat een regressie hier al
 * rood wordt bij `npm run test:run` — niet pas op /beheer/regressietest.
 * Deze suite bevat geen fetch/Supabase/sessie-afhankelijkheid (statisch
 * gecontroleerd) en draait daarom veilig zonder live server.
 *
 * uat-beheer registreert legitiem 0 tests: Beheer is een admin-tooling-zone
 * zonder rekenkern (BEHEER_ENGINE_CHECKS is bewust leeg, zie de suite's eigen
 * doc-comment) — de 33 criteria zijn ui-only/consistency/oracle en worden
 * live (Chrome DevTools) geverifieerd, niet hier.
 */
import { register } from '@/lib/regression-tests/suites/uat-beheer'
import { describeRegressionSuite } from './helpers/regression-suite-runner'

describeRegressionSuite('uat-beheer', register, { allowZeroTests: true })
