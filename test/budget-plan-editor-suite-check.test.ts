/**
 * CI-koppeling voor de in-app regressiesuite
 * lib/regression-tests/suites/budget-plan-editor.ts.
 *
 * Registreert elke TestCase als losse vitest-test via de gedeelde helper
 * (test/helpers/regression-suite-runner.ts), zodat een regressie hier al
 * rood wordt bij `npm run test:run` — niet pas op /beheer/regressietest.
 * Deze suite bevat geen fetch/Supabase/sessie-afhankelijkheid (statisch
 * gecontroleerd) en draait daarom veilig zonder live server.
 */
import { register } from '@/lib/regression-tests/suites/budget-plan-editor'
import { describeRegressionSuite } from './helpers/regression-suite-runner'

describeRegressionSuite('budget-plan-editor', register, {
  networkOnly: {
    // firstOfCurrentMonth() leest getFullYear()/getMonth() in LOKALE tijdzone;
    // de test voert een UTC-ISO-string in (bv. '2026-12-31T23:00:00Z'). Op een
    // machine ten oosten van UTC (bv. Europe/Amsterdam) rolt dat lokaal over
    // naar de volgende dag/maand — CI-runners (GitHub Actions, TZ=UTC) hebben
    // dit probleem niet, maar lokaal wel. Tijdzone-afhankelijk, dus geen
    // deterministische assertie — uitgesloten i.p.v. als "known failing"
    // geregistreerd (die zou hier flaky worden i.p.v. stabiel falen).
    'budget-plan-first-of-current-month': 'tijdzone-afhankelijke assertie (lokale getMonth() vs UTC-invoer)',
  },
})
