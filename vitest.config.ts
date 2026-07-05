import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

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
