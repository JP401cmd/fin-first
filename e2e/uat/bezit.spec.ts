import { test, expect } from '@playwright/test'
import { loginAsAdmin, seedPersona, readFiguresStrip, parseEuroAmount } from './helpers'

/**
 * UAT-BEZIT — Playwright-skelet voor het domein Bezittingen & beleggingen.
 *
 * SKELET-status: demonstreert de automatiserings-weg voor `uat2-bezit.md`
 * (het los aangeleverde UAT-BEZIT-scenariodocument voor deze sessie — niet
 * in dit repo opgenomen), niet bedoeld om in deze ontwikkelomgeving te
 * draaien (geen app-server/admin-sessie/browsers beschikbaar hier). Zie
 * `e2e/README.md` voor hoe je 'm wél draait en welke `data-testid`'s de app
 * nog mist — elke TODO hieronder staat ook daar genoteerd.
 *
 * Alle bedragen/labels zijn overgenomen uit de daadwerkelijke broncode
 * (components/editorial, components/core/assets-client.tsx,
 * components/app/quick-add-wizard/**, components/app/shell/**) en uit
 * `uat2-bezit.md` — nooit verzonnen.
 */

test.describe('UAT-BEZIT-01 — Bezittingenoverzicht: totalen en categorieën', () => {
  test('toont de verwachte figures-strip-cijfers voor persona Tessa Compleet', async ({ page }) => {
    await loginAsAdmin(page)
    await seedPersona(page, 'compleet')

    await page.goto('/overzicht/bezittingen')

    const figures = await readFiguresStrip(page)

    // Bron: uat2-bezit.md, UAT-BEZIT-01 stap 2 + "Berekening
    // verwachting" (regel 18/22): Σ current_value van alle 16 actieve
    // bezit-rijen (13 gedeclareerd + 3 bank-rekeningen-als-cash).
    expect(parseEuroAmount(figures.totaleWaarde)).toBe(1_585_000)
    // Σ monthly_contribution: Spaardeposito €200 + Meesman €1.500.
    expect(parseEuroAmount(figures.maandelijkseInleg)).toBe(1_700)
    // Rendement portefeuille (lib/asset-return.ts#buildAssetReturnBreakdown):
    // uitsluitend de marktportefeuille (investment + crypto), niet Σ alle
    // bezittingen. Meesman: waarde €300.000 − holdings-kostprijs €226.139,98
    // (2.215 × avg_purchase_price €102,0948) = €73.860,02. Crypto: waarde
    // €20.000 − purchase_value €9.000 = €11.000 (geen holdings-tracking op
    // deze asset). Totaal €84.860,02, rondt af naar €84.860 (fc() toont 0
    // decimalen).
    expect(parseEuroAmount(figures.rendementPortefeuille)).toBe(84_860)

    // Kanttekening 1 (uat2-bezit.md regel 8): het vrijheidstijd-onderschrift
    // hangt af van seed-jitter op de lopende-maand-uitgaven — we toetsen
    // daarom alleen het FORMAT en de orde van grootte (~42-43 jaar), niet
    // een exact getal.
    // TODO test-id: geen data-testid op de figures-strip-cel zelf om de
    // `sub`-regel los van de kicker-tekst te selecteren; we zoeken nu op
    // de eerste cel na "Totale waarde" via de gedeelde helper-structuur.
    const totaleWaardeCell = page
      .locator('[data-figures-strip] > a, [data-figures-strip] > div')
      .filter({ hasText: 'Totale waarde' })
    await expect(totaleWaardeCell).toContainText(/\d+\s*jaar/)
  })
})

test.describe('UAT-BEZIT-05 — Bezitting toevoegen (QuickAdd-wizard)', () => {
  test('een nieuw spaargeld-bezit van €5.000 verhoogt de Totale waarde met exact dat bedrag', async ({ page }) => {
    await loginAsAdmin(page)
    await seedPersona(page, 'lisa')

    await page.goto('/overzicht/bezittingen')
    const before = parseEuroAmount((await readFiguresStrip(page)).totaleWaarde)

    // Toolbar-knop: components/core/assets-client.tsx:752-760
    // (aria-label="Bezitting toevoegen", initialIntent="asset" → wizard
    // opent direct op de type-keuze, geen "bezit of schuld"-stap).
    await page.getByRole('button', { name: 'Bezitting toevoegen' }).click()

    // TODO test-id: de type-tegels in
    // components/app/quick-add-wizard/steps/step-type.tsx zijn gewone
    // `<button>`s binnen een `role="group"` (het foutieve `role="listitem"`
    // dat de button-rol overschreef is verwijderd). De locator hangt nu nog
    // aan de zichtbare label-tekst; een `data-testid="asset-type-savings"`
    // zou 'm ongevoelig maken voor copy-wijzigingen.
    await page.getByRole('button', { name: 'Spaargeld' }).click()

    // step-details.tsx: "Naam" en "Huidige waarde" zijn correct met
    // <label htmlFor>/<input id> gekoppeld (regel 295-360) — getByLabel
    // werkt hier zonder test-id.
    await page.getByLabel('Naam').fill('Spaarrekening extra')
    await page.getByLabel('Huidige waarde').fill('5000')

    // Default submitLabel = 'Toevoegen' (step-details.tsx:289) — kan per
    // call-site overschreven worden; TODO test-id: data-testid="quick-add-submit"
    // zou dit onafhankelijk van copy-varianten maken.
    await page.getByRole('button', { name: 'Toevoegen' }).click()

    // Success-stap toont "Nog een toevoegen" / "Terug naar overzicht"
    // (quick-add-wizard.tsx:858-870).
    await page.getByRole('button', { name: 'Terug naar overzicht' }).click()
    await page.reload()

    const after = parseEuroAmount((await readFiguresStrip(page)).totaleWaarde)
    expect(after).toBe(before + 5_000)
  })
})

test.describe('UAT-BEZIT-06 — Bezitting bekijken via kaart-klik (detail-pane)', () => {
  test('opent de slide-in pane met asset-detail en sluit weer via de kruisknop', async ({ page }) => {
    await loginAsAdmin(page)
    await seedPersona(page, 'compleet')

    await page.goto('/overzicht/bezittingen')

    // TODO test-id: asset-kaarten (components/core/assets-client.tsx) hebben
    // geen data-testid="asset-card-<id>" — tekstmatch op de naam is de enige
    // optie en breekt als de asset ooit hernoemd wordt in de seed-fixture.
    await page.getByText('Belang Volkert Compleet Holding BV', { exact: true }).click()

    // De pane is `<ShellOverlay kind="pane">` → op desktop een SlideInPane
    // met role="dialog" (components/app/shell/slide-in-pane.tsx:192) en
    // ?asset=<id> in de URL (components/app/core/assets/asset-pane.tsx).
    await expect(page).toHaveURL(/[?&]asset=/)
    const pane = page.getByRole('dialog')
    await expect(pane.getByText('Belang Volkert Compleet Holding BV')).toBeVisible()

    // TODO: de UAT vraagt hier ook een waarde- en rendement%-check
    // (uat2-bezit.md UAT-BEZIT-06 stap 1: rendement 900,0%, DGA-schuld
    // ver onder de drempel → geen waarschuwing). Dit skelet verifieert
    // bewust alleen dat de pane opent met de juiste asset — de exacte
    // rendement%/DGA-waarschuwing-tekst kon in deze pas niet met
    // zekerheid tot een stabiel selector herleid worden (geen test-id op
    // die velden). Voeg data-testid="asset-pane-rendement" /
    // data-testid="asset-pane-dga-warning" toe en breid deze test uit.

    // Sluiten: TODO test-id — components/app/shell/slide-in-pane.tsx:230
    // geeft de ←-terug-knop óók aria-label="Sluiten" wanneer geen `onBack`
    // is meegegeven (wat hier het geval is), naast de losstaande ✕-knop
    // op regel 261 die altijd "Sluiten" heet. Er zijn dus TWEE knoppen met
    // dezelfde accessible name — `.first()` pakt de ←-knop (die hier
    // functioneel identiek is aan sluiten), maar dit is fragiel. Een
    // `data-testid="pane-close"` op de ✕-knop zou de ambiguïteit oplossen.
    await pane.getByRole('button', { name: 'Sluiten' }).first().click()
    await expect(page).not.toHaveURL(/[?&]asset=/)
  })
})

test.describe('UAT-BEZIT-08 — Eén bezitting herwaarderen', () => {
  test('een handmatige herwaardering van Kunst + sieraden telt door in de Totale waarde', async ({ page }) => {
    await loginAsAdmin(page)
    await seedPersona(page, 'compleet')

    await page.goto('/overzicht/bezittingen')
    await page.getByText('Kunst + sieraden', { exact: true }).click()

    const pane = page.getByRole('dialog')
    // Secundaire footer-actie in view-mode (asset-pane.tsx:337-340) —
    // geen aria-label-ambiguïteit hier: de toolbar-"Herwaarderen" is een
    // <Link> (rol "link"), dus role="button" matcht alleen de pane-actie.
    await pane.getByRole('button', { name: 'Herwaarderen' }).click()

    // ValuationModal (components/core/assets-client.tsx:4086-4239).
    // TODO test-id: de labels "Datum"/"Nieuwe waarde"/"Notitie (optioneel)"
    // (regel 4188/4197/4212) hebben GEEN `htmlFor`/wrapping-associatie met
    // hun <input> — dit is een echt a11y-gat, niet alleen een test-gemak:
    // `getByLabel(...)` vindt deze velden dan ook NIET. We selecteren het
    // waardeveld daarom via zijn unieke `type="number"` binnen deze modal
    // (het enige numerieke veld hierin). Aanbevolen fix:
    // data-testid="valuation-date" / "valuation-new-value" / "valuation-notes".
    //
    // TODO test-id: de ValuationModal is een "sibling sheet" naast de nog
    // gemounte asset-pane (asset-pane.tsx regel 415: "sibling sheet
    // (driewegregel)") — beide zijn tegelijk `role="dialog"`, en beide
    // bevatten de tekst "Herwaarderen" (de pane via zijn footer-knop, de
    // modal via zijn titel), dus `hasText` filtert niet uniek. We pakken
    // daarom `.last()` (nieuwste portal-mount) — werkt, maar een
    // `data-testid="valuation-modal"` op de ValuationModal-wrapper zou dit
    // ondubbelzinnig maken.
    const valuationModal = page.getByRole('dialog').last()
    await valuationModal.locator('input[type="number"]').fill('15000')
    await valuationModal.getByRole('button', { name: 'Opslaan' }).click()

    await expect(page.getByText('Kunst + sieraden', { exact: true })).toBeVisible()

    await page.goto('/overzicht/bezittingen')
    const figures = await readFiguresStrip(page)
    // Bron: uat2-bezit.md UAT-BEZIT-08 — delta +€1.000 (14.000 → 15.000),
    // dus nieuw totaal 1.585.000 + 1.000.
    expect(parseEuroAmount(figures.totaleWaarde)).toBe(1_586_000)
  })
})

test.describe('UAT-BEZIT-10 — Bezitting verwijderen', () => {
  test('het verwijderen van Aanhangwagen + gereedschap verlaagt de Totale waarde met €6.000', async ({ page }) => {
    await loginAsAdmin(page)
    await seedPersona(page, 'compleet')

    await page.goto('/overzicht/bezittingen')
    await page.getByText('Aanhangwagen + gereedschap', { exact: true }).click()

    const pane = page.getByRole('dialog')
    // Header-action in view-mode: aria-label="Bezitting verwijderen"
    // (asset-pane.tsx:356-364) — uniek en al goed toegankelijk, geen
    // test-id nodig.
    await pane.getByRole('button', { name: 'Bezitting verwijderen' }).click()

    // Confirm-dialoog (kind="confirm", title="Bezitting verwijderen?",
    // asset-pane.tsx:437-467) — knoptekst is exact "Definitief verwijderen".
    await page.getByRole('button', { name: 'Definitief verwijderen' }).click()

    await page.goto('/overzicht/bezittingen')
    const figures = await readFiguresStrip(page)
    // Bron: uat2-bezit.md UAT-BEZIT-10 — 1.585.000 − 6.000 = 1.579.000.
    expect(parseEuroAmount(figures.totaleWaarde)).toBe(1_579_000)
  })
})
