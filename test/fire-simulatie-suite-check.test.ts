/**
 * CI-koppeling voor de in-app regressiesuite
 * lib/regression-tests/suites/fire-simulatie.ts.
 *
 * Registreert elke TestCase als losse vitest-test via de gedeelde helper
 * (test/helpers/regression-suite-runner.ts), zodat een regressie hier al
 * rood wordt bij `npm run test:run` — niet pas op /beheer/regressietest.
 * Deze suite bevat geen fetch/Supabase/sessie-afhankelijkheid (statisch
 * gecontroleerd) en draait daarom veilig zonder live server.
 */
import { register } from '@/lib/regression-tests/suites/fire-simulatie'
import { describeRegressionSuite } from './helpers/regression-suite-runner'

describeRegressionSuite('fire-simulatie', register, {
  networkOnly: {
    // Wandklok-drempel (<3s voor 4 kernel-runs). Op zichzelf haalt hij dat ruim
    // — empirisch ~800ms — maar naast de andere ~790 testbestanden vecht hij om
    // dezelfde kernen en valt hij willekeurig om. Waargenomen op 3 aug 2026: los
    // groen, in de volledige suite rood terwijl het bestand er 70s over deed.
    //
    // Zelfde afweging als bij berekening-performance-suite-check: uitgesloten in
    // plaats van als "bekende fout" geregistreerd, want die lijst eist dat een
    // entry BETROUWBAAR faalt — een flaky test zou de bewaking zelf flaky maken.
    // De echte prestatiebewaking hoort op /beheer/regressietest, waar één machine
    // zonder concurrentie betekenisvolle getallen geeft.
    'fire-sim-ws-performance': 'wandklok-drempel (<3s), flaky naast de volledige suite',
  },
})
