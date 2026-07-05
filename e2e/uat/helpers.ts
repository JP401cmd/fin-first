import { expect, type Page } from '@playwright/test'

/**
 * Herbruikbare UAT-helpers voor het domein Bezit (en bij uitbreiding: de
 * overige `docs/uat/uat-plan.md`-deelgebieden). SKELET-status — zie
 * `e2e/README.md` voor hoe je dit daadwerkelijk draait en welke
 * `data-testid`'s de app nog mist voor robuustere locators.
 *
 * Bewust GEEN import van `@/lib/test-personas` of andere app-bronnen: de
 * e2e-map heeft een eigen tsconfig-scope (zie `e2e/tsconfig.json`) die los
 * staat van de root-`tsc`-run, en de bronwaarheid voor persona-namen kan
 * zonder e2e-brekende gevolgen wijzigen. In plaats daarvan spiegelen we
 * hier alleen de weergavenaam die de UI toont (voornaam op de "Laden als
 * …"-knop), met een verwijzing naar de bron zodat een toekomstige
 * naamswijziging in `lib/test-personas.ts` hier zichtbaar blijft als
 * één regel om bij te werken.
 */

export type PersonaKey = 'daan' | 'lisa' | 'willem' | 'marijke' | 'compleet'

/**
 * Voornaam zoals getoond op de "Laden als <voornaam>"-knop in
 * `components/app/persona-card.tsx` (`meta.name.split(' ')[0]`).
 * Bron van de volledige namen: `lib/test-personas.ts`.
 */
export const PERSONA_FIRST_NAMES: Record<PersonaKey, string> = {
  daan: 'Daan', // lib/test-personas.ts: 'Daan Bakker'
  lisa: 'Lisa', // lib/test-personas.ts: 'Lisa de Groot'
  willem: 'Willem', // lib/test-personas.ts: 'Willem Jansen'
  marijke: 'Marijke', // lib/test-personas.ts: 'Marijke Vermeer'
  compleet: 'Tessa', // lib/test-personas.ts: 'Tessa Compleet' — let op: key ≠ voornaam
}

/**
 * Logt in als admin-testaccount via env-credentials — NOOIT hardcoden.
 * Vereist `UAT_ADMIN_EMAIL` en `UAT_ADMIN_PASSWORD` (zie e2e/README.md).
 *
 * Alleen nodig voor scenario's die `/beheer/**`-routes raken (persona-seed,
 * testaccountbeheer). De labels ("E-mailadres"/"Wachtwoord"/"Inloggen")
 * zijn correct met `<label htmlFor>` gekoppeld in `app/login/page.tsx`,
 * dus `getByLabel` is hier een robuuste, test-id-vrije locator.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const email = process.env.UAT_ADMIN_EMAIL
  const password = process.env.UAT_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'UAT_ADMIN_EMAIL en UAT_ADMIN_PASSWORD moeten als env-var gezet zijn ' +
        '(zie e2e/README.md) — er staan bewust geen testcredentials in de repo.',
    )
  }

  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(email)
  await page.getByLabel('Wachtwoord').fill(password)
  await page.getByRole('button', { name: 'Inloggen' }).click()

  // TODO test-id: er is geen expliciete "ingelogd"-marker (bv.
  // data-testid="app-shell") op de post-login pagina om op te wachten.
  // We nemen daarom "URL is niet meer /login" als praktische proxy —
  // faalt pas zichtbaar als de login zelf mislukt (blijft op /login met
  // een foutmelding), dus voldoende voor dit skelet.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  })
}

/**
 * Seedt een persona via `/beheer/testdata` (WF-BEHEER-20): navigeer erheen,
 * klik de "Laden als <voornaam>"-knop op de persona-kaart, bevestig in de
 * modal, en wacht tot de seed-stream "Klaar!" meldt.
 *
 * Reset = opnieuw seeden — elk scenario begint zo vanuit exact dezelfde
 * uitgangssituatie (zie docs/uat/uat-plan.md §2.3). Vereist een ingelogde
 * admin-sessie (roep vóór dit `loginAsAdmin(page)` aan, of hergebruik een
 * bestaande authenticated storageState — zie e2e/README.md).
 */
export async function seedPersona(page: Page, key: PersonaKey): Promise<void> {
  await page.goto('/beheer/testdata')

  // TODO test-id: components/app/persona-card.tsx heeft geen
  // data-testid="persona-card-<key>". De kaart toont in beheer-mode twee
  // knoppen ("Bekijken" + "Laden als <voornaam>"); de tekst-locator hier
  // breekt stilzwijgend als de persona-voornaam ooit wijzigt in
  // lib/test-personas.ts. Een stabiele testid per persona-key zou dat
  // ontkoppelen van copy.
  await page
    .getByRole('button', { name: `Laden als ${PERSONA_FIRST_NAMES[key]}` })
    .click()

  // Bevestigingsdialoog — zelfde copy voor elke persona
  // (app/(app)/beheer/testdata/page.tsx: "Bevestiging" / "Bevestigen").
  await page.getByRole('button', { name: 'Bevestigen' }).click()

  // De seed draait als server-sent-events-stream; "Klaar!" is de
  // expliciete eindstatus (zelfde bestand, `setSeedStep('Klaar!')`).
  // Ruime timeout: een volledige persona-seed vult tientallen tabellen.
  await expect(page.getByText('Klaar!', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
}

export interface FiguresStripValues {
  totaleWaarde: string
  maandelijkseInleg: string
  rendementTotaal: string
}

/**
 * Leest de figures-strip op `/overzicht/bezittingen` (en overal elders waar
 * `components/editorial` se `<FiguresStrip>` wordt gebruikt).
 *
 * Gebaseerd op de daadwerkelijke DOM van `<FiguresStrip>`
 * (`components/editorial/index.tsx`):
 * de strip-container draagt `data-figures-strip` (print-hook, maar prima
 * bruikbaar als addressable target), en elke cel is een directe child
 * (`<div>` of — bij een `href`-cel — `<a>`) met een kicker-tekst en een
 * `data-figure-amount`-element. Beide attributen bestonden al vóór deze
 * suite; geen nieuwe test-id's nodig om dit te lezen.
 */
export async function readFiguresStrip(page: Page): Promise<FiguresStripValues> {
  const strip = page.locator('[data-figures-strip]')

  async function readByKicker(kicker: string): Promise<string> {
    // `:scope > a, :scope > div` beperkt tot de directe cel-children —
    // zonder deze scope zou de kicker-div zelf ook matchen op hasText en
    // zou .first() het verkeerde (te kleine) element kunnen pakken.
    const cell = strip.locator(':scope > a, :scope > div').filter({ hasText: kicker })
    await expect(cell).toHaveCount(1)
    return (await cell.locator('[data-figure-amount]').innerText()).trim()
  }

  return {
    totaleWaarde: await readByKicker('Totale waarde'),
    maandelijkseInleg: await readByKicker('Maandelijkse inleg'),
    rendementTotaal: await readByKicker('Rendement totaal'),
  }
}

/**
 * Parseert een NL-geformatteerd euro-bedrag ("€ 1.585.000", "+€ 559.000",
 * "€ 1.585.000") naar een geheel getal. Decimalen komen op de
 * figures-strip niet voor (`fc()` rondt af), dus we hoeven geen komma's
 * te ontleden. Geeft `NaN` terug bij een placeholder als "—".
 */
export function parseEuroAmount(text: string): number {
  const digits = text.replace(/[^\d-]/g, '')
  return digits.length > 0 ? parseInt(digits, 10) : NaN
}
