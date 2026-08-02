/**
 * CI-koppeling voor de in-app regressiesuite
 * lib/regression-tests/suites/wil-acties.ts.
 *
 * Registreert elke TestCase als losse vitest-test via de gedeelde helper
 * (test/helpers/regression-suite-runner.ts), zodat een regressie hier al
 * rood wordt bij `npm run test:run` — niet pas op /beheer/regressietest.
 * Deze suite bevat geen fetch/Supabase/sessie-afhankelijkheid (statisch
 * gecontroleerd) en draait daarom veilig zonder live server.
 */
import { register } from '@/lib/regression-tests/suites/wil-acties'
import { describeRegressionSuite } from './helpers/regression-suite-runner'

describeRegressionSuite('wil-acties', register)
