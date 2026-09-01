import { test, expect } from '@playwright/test'

/**
 * Auth-smoke: login → /overzicht → een tweede beveiligde route, plus het
 * negatieve geval (uitgelogd op een beveiligde route → redirect naar
 * /login). Dit dekt precies de drie acceptatiecriteria van de kaart
 * "Één Playwright smoke-spec (login → dashboard → beveiligde route)":
 *
 *   1) draait lokaal (en na CI-commit in CI) groen
 *   2) dekt login + één beveiligde route
 *   3) faalt correct bij een auth-regressie (de negatieve redirect-test)
 *
 * Bewust GEEN persona-seed nodig (in tegenstelling tot uat/bezit.spec.ts):
 * dit is een kale, read-only auth-smoke tegen een BESTAAND, niet-admin
 * testaccount. Lichter, sneller, en onafhankelijk van testdata-state.
 *
 * Credentials: REGRESSION_TEST_EMAIL / REGRESSION_TEST_PASSWORD — hetzelfde
 * paar dat het in-app regressieframework gebruikt (lib/regression-tests/
 * server-runner.ts, account regression-test@fintwo.nl). Bewust NIET
 * UAT_ADMIN_EMAIL/PASSWORD: die zijn bedoeld voor /beheer/**-scenario's
 * (persona-seed), niet voor een kale auth-check. Nooit hardcoden — de spec
 * skipt met een duidelijke melding als de env-vars ontbreken, in plaats van
 * van stil te falen of te slagen op toeval.
 *
 * Protected-route-lijst geverifieerd tegen lib/supabase/proxy.ts
 * (protectedPrefixes or /overzicht, /toekomst, /mijn, /dashboard, /core,
 * /will, /horizon, /identity, /beheer, /onboarding); login-formulierlabels
 * geverifieerd tegen app/login/page.tsx ("E-mailadres" / "Wachtwoord" /
 * knop "Inloggen").
 */

const EMAIL = process.env.REGRESSION_TEST_EMAIL
const PASSWORD = process.env.REGRESSION_TEST_PASSWORD

test.describe('Auth-smoke: login → dashboard → beveiligde route', () => {
  test.skip(
    !EMAIL || !PASSWORD,
    'REGRESSION_TEST_EMAIL en REGRESSION_TEST_PASSWORD zijn niet gezet — ' +
      'zie e2e/README.md voor hoe je deze env-vars aanlevert. Er staan ' +
      'bewust geen testcredentials in de repo.',
  )

  test('uitgelogd op een beveiligde route → redirect naar /login', async ({ page }) => {
    await page.goto('/toekomst')
    await page.waitForURL((url) => url.pathname.startsWith('/login'), {
      timeout: 15_000,
    })
    // redirectTo bewijst dat de proxy de oorspronkelijke bestemming onthoudt
    // (lib/supabase/proxy.ts) — een auth-regressie die per ongeluk toch
    // doorlaat, zou hier nooit op /login belanden.
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe('/toekomst')
  })

  test('login → /overzicht → tweede beveiligde route blijft toegankelijk', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('E-mailadres').fill(EMAIL!)
    await page.getByLabel('Wachtwoord').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Inloggen' }).click()

    // Ingelogde bezoekers op /login worden naar hun homescherm gestuurd
    // (proxy.ts: authPages-redirect volgt profiles.home_screen) — dit is de
    // "dashboard"-stap uit de kaarttitel. De assertie op /overzicht geldt
    // zolang het smoke-account de default-keuze houdt.
    await page.waitForURL((url) => url.pathname.startsWith('/overzicht'), {
      timeout: 15_000,
    })

    // Tweede beveiligde route: geen redirect terug naar /login betekent dat
    // de sessie geldig blijft over een navigatie heen.
    await page.goto('/mijn')
    await expect(page).not.toHaveURL(/\/login/)
  })
})
