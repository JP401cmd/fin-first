/**
 * CI-koppeling voor de in-app regressiesuite
 * lib/regression-tests/suites/berekening-performance.ts.
 *
 * Registreert elke TestCase als losse vitest-test via de gedeelde helper
 * (test/helpers/regression-suite-runner.ts), zodat een regressie hier al
 * rood wordt bij `npm run test:run` — niet pas op /beheer/regressietest.
 * Deze suite bevat geen fetch/Supabase/sessie-afhankelijkheid (statisch
 * gecontroleerd) en draait daarom veilig zonder live server.
 */
import { register } from '@/lib/regression-tests/suites/berekening-performance'
import { describeRegressionSuite } from './helpers/regression-suite-runner'

// De HELE suite is een prestatiemeting: élke case assert een wandklok-drempel
// (<500ms projectie, <200ms backtest, <300ms fire-range, <50ms dashboardlayout).
// Zulke asserties zijn op een gedeelde runner per definitie niet deterministisch
// — parallelle vitest-workers, wisselende load — en CLAUDE.md verbiedt precies
// die vorm van flakiness.
//
// Eerst stonden hier twee cases los uitgesloten. Dat was de verkeerde snede: het
// waren de twee die tijdens één run toevallig omvielen, terwijl de andere elf
// dezelfde eigenschap hebben. Bij een run naast de zestig andere suite-checks
// viel prompt een dérde om. De ongeschiktheid zit in de suite, niet in de cases,
// dus wordt de suite als geheel overgeslagen.
//
// Niet als "known failing" geregistreerd: die lijst eist dat een entry nog
// steeds FAALT, en deze tests falen juist onbetrouwbaar. Dat zou de bewaking
// zelf flaky maken.
//
// De import draait wél, dus een kapotte register() of een verdwenen suite valt
// hier nog steeds door de mand. Voor de echte prestatiebewaking blijft
// /beheer/regressietest de plek: één machine, geen concurrentie, betekenisvolle
// getallen.
describeRegressionSuite('berekening-performance', register, {
  skipAll: 'wandklok-drempels; niet deterministisch op een gedeelde CI-runner',
})
