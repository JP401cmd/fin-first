import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright-configuratie voor de TriFinity UAT-suite (domein Bezit, en
 * uitbreidbaar naar de overige UAT-deelgebieden uit `docs/uat/uat-plan.md`
 * Deel 2).
 *
 * SKELET-status: dit demonstreert de automatiserings-weg voor de UAT-
 * scenario's; er is in de ontwikkelomgeving geen draaiende app-server, geen
 * admin-sessie en geen browser-install beschikbaar om deze suite hier uit
 * te voeren. Zie `e2e/README.md` voor hoe je 'm wél draait.
 *
 * Bewust GEEN `webServer`-blok: de UAT draait per ontwerp tegen een
 * gedeelde, herstelbare testomgeving met test-/adminaccounts (§2.3
 * uat-plan.md) — niet tegen een per-run gestarte lokale server met
 * productiedata-risico. Start de app zelf (`npm run dev`, of een
 * Vercel-preview) en geef de URL mee via UAT_BASE_URL.
 */
export default defineConfig({
  testDir: './uat',

  // UAT-scenario's muteren gedeelde testdata via persona-seeds
  // (/beheer/testdata wist en herlaadt alle financiële data van het
  // ingelogde account) — parallelle workers zouden elkaars seed
  // wegschrijven. Sequentieel per bestand is dus veiliger dan raced writes.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: process.env.UAT_BASE_URL ?? 'http://localhost:3000',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // TODO: voeg een mobiel project toe (bv. devices['Pixel 7']) zodra de
    // "webapp+mobiel"-scenario's (zie uat2-bezit.md — Platform-kolom) ook
    // daadwerkelijk automatisch gedraaid worden; de KERN-scenario's in
    // bezit.spec.ts draaien nu alleen op desktop-chromium.
  ],
})
