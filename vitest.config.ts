import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Fail-fast-guard tegen een gediagnosticeerde omgevingsbug (Git Bash): op
// win32 geeft de Bash-tool een lowercase-drive cwd (`c:\...`) ongewijzigd
// door aan node, terwijl PowerShell 'm via .NET's SetCurrentDirectory
// gedwongen hoofdlettert. Met een lowercase cwd bouwt vitest zijn
// module-graph deels op `file:///c:/...` (cwd-afgeleid) terwijl node's
// ESM-resolver het geëxternaliseerde `import 'vitest'` naar de on-disk
// casing `file:///C:/...` herleidt — het vitest-pakket laadt daardoor
// twee keer, en de tweede instantie mist runner-state, wat verschijnt als
// de misleidende "Vitest failed to find the current suite"-fout (géén
// echte testbreuk). Een chdir hier in de config is bewezen te laat (de
// vitest-CLI-modules zitten dan al onder de lowercase-cwd in node's
// ESM-cache) — dit is dus alleen een vroege, duidelijke melding i.p.v. een
// fix. Machinefix: `BASH_ENV` met `cd "$PWD"` (herleidt via de
// MSYS-mounttabel naar de gehoofdletterde Windows-cwd), of draai via de
// PowerShell-tool. Geen effect op Linux/CI (path-scheiding is `/`, de
// regex matcht daar nooit).
if (process.platform === 'win32' && /^[a-z]:/.test(process.cwd())) {
  throw new Error(
    `Vitest gestart met een lowercase drive-letter in de working directory (${process.cwd()}). ` +
      'Dit splitst vitest\'s module-graph in twee ESM-instanties (cwd-afgeleide file-URLs vs. ' +
      'node\'s on-disk-casing-resolutie) en leidt normaal tot de misleidende fout ' +
      '"Vitest failed to find the current suite" i.p.v. een echte testbreuk. ' +
      'Fix: draai `cd "$PWD"` in Git Bash vóór vitest (herleidt naar de gehoofdletterde ' +
      'Windows-cwd via de MSYS-mounttabel) of gebruik de PowerShell-tool.'
  )
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    // '**/e2e/**': de Playwright-suite (e2e/uat/*.spec.ts) draait tegen
    // @playwright/test, niet tegen vitest — zonder deze exclude probeert
    // vitest's default *.spec.ts-glob die bestanden zelf te runnen en
    // faalt op de ontbrekende '@playwright/test'-resolutie.
    exclude: [...configDefaults.exclude, '**/.claude/**', '**/e2e/**'],
    // De FIRE-/Horizon-solver en Monte-Carlo-pariteitstests zijn rekenzwaar
    // en overschrijden de vitest-default van 5s zodra de runner onder load
    // staat (CI-runners hebben minder kernen dan een dev-laptop). Een ruime
    // per-test-timeout voorkomt flaky timeouts in CI zonder een assertion te
    // verzwakken; een echte hang wordt nog steeds na 30s afgevangen.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
