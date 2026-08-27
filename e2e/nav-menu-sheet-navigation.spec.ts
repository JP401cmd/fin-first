import { test, expect, devices } from '@playwright/test'

/**
 * Norm: een link in een overlay navigeert.
 *
 * Een menu-item in de mobiele NavMenuSheet sluit de sheet én wisselt van
 * route. Die twee mogen elkaar niet in de weg zitten: de sluiting ruimt haar
 * history-entry op, de navigatie duwt er een nieuwe — en de gebruiker komt op
 * de nieuwe route uit, met één terug-druk terug op de vorige.
 *
 * Waarom dat een eigen e2e-test verdient: de sluitroute en de navigatie lopen
 * niet gelijk op. `<Link onClick={onClose}>` sluit de sheet direct, terwijl
 * Next's route-wissel asynchroon is (de router duwt zijn entry pas als de
 * RSC-payload binnen is). Ruimde de overlay in dat gat haar entry op met een
 * `history.back()`, dan brak die back de lopende navigatie af — de fetch
 * slaagde (200) maar de navigatie werd afgebroken (`net::ERR_ABORTED`) en de
 * URL bleef staan. Zichtbaar als "tik op een menu-item doet niets", voor elke
 * link in elke overlay en ongeacht invoermethode (een kale muisklik zonder
 * touch-events faalde identiek — het was géén tik-vs-sleep-beslissing in
 * `use-swipe-to-dismiss.ts`).
 *
 * `lib/overlay-history.ts` herkent die sluitroute nu aan de link-klik en laat
 * de history dan met rust. Dit is de enige laag waar de race echt te toetsen
 * is: een unit-test die Next's `<Link>` mockt, mockt precies het asynchrone
 * gedrag weg dat het defect veroorzaakte. De bookkeeping eromheen staat in
 * `lib/overlay-history.test.ts` en `components/app/bottom-sheet.test.tsx`.
 */

const EMAIL = process.env.REGRESSION_TEST_EMAIL
const PASSWORD = process.env.REGRESSION_TEST_PASSWORD

// Chromium-mobiel (niet devices['iPhone 13'] — dat preset dwingt WebKit af,
// wat een aparte browser-install vergt; de chromium-project-config in
// playwright.config.ts blijft zo intact).
test.use({ ...devices['Pixel 7'] })

test.describe('NavMenuSheet — navigatie via een menu-item', () => {
  // Ruimere test-timeout dan de config-standaard (30s): tegen een net gestarte
  // `next start` wordt elke route hier voor het eerst gerenderd. Gemeten op een
  // koude server: inloggen + eerste /overzicht-render en daarna ~3,5s voordat de
  // klik de URL op /mijn zet — samen ruim over de 30s. Die wachttijd zegt niets
  // over het gedrag dat deze test bewaakt.
  test.describe.configure({ timeout: 90_000 })

  test.skip(
    !EMAIL || !PASSWORD,
    'REGRESSION_TEST_EMAIL en REGRESSION_TEST_PASSWORD zijn niet gezet — zie e2e/README.md.',
  )

  test('tik op "Mijn" in de mobiele NavMenuSheet navigeert naar /mijn', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('E-mailadres').fill(EMAIL!)
    await page.getByLabel('Wachtwoord').fill(PASSWORD!)
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click()
    await page.waitForURL((url) => url.pathname.startsWith('/overzicht'), { timeout: 20_000 })

    // Open de mobiele nav-sheet via de zwevende pill.
    const pill = page.locator('button[aria-label*="menu" i], button[aria-label*="navigatie" i]').first()
    await pill.click()
    await page.waitForSelector('text=Navigatie')
    // Sheet + open-animatie (~280ms, zie bottom-sheet.tsx) laten settelen —
    // dit is bewust GEEN race-op-de-mount-variant; de bug reproduceert ook
    // ruim ná de animatie.
    await page.waitForTimeout(350)

    const mijnLink = page.locator('[role="dialog"] a', { hasText: 'Mijn' }).first()
    await mijnLink.scrollIntoViewIfNeeded()
    await mijnLink.click()

    // Budget bewust ruim: op een koude server duurt de eerste /mijn-render
    // ~3,5s (gemeten), en dat is serveropwarming — geen navigatiedefect. Te
    // krap afgesteld faalt deze test met exact het symptoom dat ze moet
    // onderscheiden (URL blijft op /overzicht), en dat leest als een regressie.
    await page.waitForURL((url) => url.pathname.startsWith('/mijn'), { timeout: 20_000 })

    // En de weg terug klopt ook: één terug-druk brengt je op /overzicht, niet
    // op een achtergebleven overlay-entry die niets doet.
    await page.goBack()
    await page.waitForURL((url) => url.pathname.startsWith('/overzicht'), { timeout: 10_000 })
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
  })
})
