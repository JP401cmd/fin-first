import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { HubTotaleDruk } from './hub-totale-druk'
import { buildTaxOverview } from '@/lib/tax-overview'
import { computeBox1Tax } from '@/lib/box1-tax'
import { formatCurrency } from '@/lib/format'

/**
 * Bevinding M4 (+ C9): de druk-kaart toonde "MARGINAAL 35,8%" terwijl de Box
 * 1-kaart ernaast op hetzelfde scherm "Inkomen onbekend" meldde — twee
 * onafhankelijke "is het inkomen bekend"-signalen die elkaar tegenspraken.
 *
 * Deze test bewaakt de gekozen oplossing (optie A, eigenaarsbesluit
 * 26-08-2026): zonder bekend inkomen verschijnt er GÉÉN percentage, maar de
 * expliciete mededeling "Inkomen onbekend". Mét inkomen verschijnen beide
 * tarieven, elk met hun grondslag eronder zodat "Effectief" niet gelezen wordt
 * als "de hele rekening gedeeld door mijn inkomen".
 */

const GROSS = 93_369
const BOX3_TAX = 599
const DAILY_EXPENSES = 100

const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: 2026 })

function overviewMetInkomen() {
  return buildTaxOverview({
    box1Tax: Math.round(motor.tax),
    box2Tax: null,
    box3Tax: BOX3_TAX,
    effectiveRate: motor.effectiveRate,
    marginalRate: motor.marginalRate,
    dailyExpenses: DAILY_EXPENSES,
  })
}

/**
 * S14 — de tariefcellen zijn sinds deze kaart WEERGAVE-AFHANKELIJK: in
 * "Volledig" staan de twee cellen zoals altijd, in "Eenvoudig" één zin.
 * `useDisplayMode()` valt buiten een provider bewust terug op 'simple' (ADR
 * 0026), dus élke render moet de modus expliciet zetten — anders test je
 * ongemerkt de andere tak. De bestaande M4/C9/H22-tests beschrijven allemaal
 * Volledig-gedrag en draaien daarom op `initialMode="full"`; dat is de énige
 * aanpassing die S14 aan die tests maakt (géén assertie is verzwakt).
 */
function renderKaart(ui: ReactElement, mode: 'simple' | 'full' = 'full') {
  return render(<DisplayModeProvider initialMode={mode}>{ui}</DisplayModeProvider>)
}

/** Precies wat de hub bouwt wanneer `grossYearly === 0`. */
function overviewZonderInkomen() {
  return buildTaxOverview({
    box1Tax: null,
    box2Tax: null,
    box3Tax: BOX3_TAX,
    effectiveRate: null,
    marginalRate: null,
    dailyExpenses: DAILY_EXPENSES,
  })
}

describe('HubTotaleDruk — bekend inkomen', () => {
  it('toont beide tarieven mét hun grondslag', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
    )
    expect(screen.getByText('Effectief')).toBeTruthy()
    expect(screen.getByText('Marginaal')).toBeTruthy()
    expect(screen.getByText('Box 1 · over je inkomen')).toBeTruthy()
    expect(screen.getByText('op je laatste euro')).toBeTruthy()
    expect(screen.queryByText('Inkomen onbekend')).toBeNull()
  })

  it('toont het motortarief, niet een schijftarief-vuistregel', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
    )
    const marg = Math.round(motor.marginalRate * 1000) / 10
    expect(screen.getByText(`${marg}%`)).toBeTruthy()
    // De vuistregel-waarden die de bevinding meldde mogen hier niet staan.
    expect(screen.queryByText('35.8%')).toBeNull()
    expect(screen.queryByText('36.6%')).toBeNull()
  })

  it('het getoonde effectieve tarief ligt onder het marginale', () => {
    const overview = overviewMetInkomen()
    expect(overview.effectiveRate!).toBeLessThan(overview.marginalRate!)
  })
})

describe('HubTotaleDruk — onbekend inkomen (M4)', () => {
  it('toont "Inkomen onbekend" en geen enkel percentage', () => {
    const { container } = renderKaart(
      <HubTotaleDruk
        overview={overviewZonderInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={0}
        incomeKnown={false}
      />,
    )
    expect(screen.getByText('Inkomen onbekend')).toBeTruthy()
    expect(screen.queryByText('Effectief')).toBeNull()
    expect(screen.queryByText('Marginaal')).toBeNull()
    // Geen enkel tarief-percentage op de kaart.
    expect(container.textContent).not.toMatch(/\d+([.,]\d+)?%/)
  })

  it('houdt het bedrag zelf wél zichtbaar — dat is bekend', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewZonderInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={0}
        incomeKnown={false}
      />,
    )
    expect(screen.getByText(/599/)).toBeTruthy()
  })
})

/**
 * Bevinding H22: het totaal heet "totale druk" maar telt Box 2 bewust niet mee.
 * Die weglating stond alleen in de callout ónder de verdeelstaaf. Eigenaars-
 * besluit 26-08-2026 (optie B): het bedrag blijft ongewijzigd, maar de kaart
 * toont de weglating bij het getal zelf en wijst de weg naar de Box 2-pagina.
 */
describe('HubTotaleDruk — Box 2 buiten het totaal (H22)', () => {
  it('toont bij aanmerkelijk belang de weglating én de weg ernaartoe', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
        exclBox2
      />,
    )
    expect(screen.getByText('excl. Box 2')).toBeTruthy()
    expect(screen.getByText(/Box 2 \(aanmerkelijk belang\) zit hier niet in/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Bekijk Box 2/ })
    expect(link.getAttribute('href')).toBe('/overzicht/belasting/box2')
  })

  it('zwijgt over Box 2 wanneer die box niet speelt', () => {
    const { container } = renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
    )
    expect(container.textContent).not.toContain('Box 2')
  })

  it('verandert het getoonde bedrag niet — dit is een weergave-fix', () => {
    const overview = overviewMetInkomen()
    const zonder = renderKaart(
      <HubTotaleDruk
        overview={overview}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
    )
    const bedragZonder = zonder.container.querySelector('span.tabular-nums')?.textContent
    zonder.unmount()

    const met = renderKaart(
      <HubTotaleDruk
        overview={overview}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
        exclBox2
      />,
    )
    const bedragMet = met.container.querySelector('span.tabular-nums')?.textContent

    expect(bedragMet).toBe(bedragZonder)
    // ... en het is nog steeds exact het aggregator-totaal, niet een tweede som.
    expect(bedragMet).toBe(formatCurrency(Math.round(overview.total)))
    expect(overview.total).toBe(Math.round(motor.tax) + BOX3_TAX)
  })
})

/**
 * S14 — de twee tariefcellen zijn expert-informatie: "Effectief 46,0% ·
 * Marginaal 56,0%" naast elkaar vraagt van de lezer dat hij wéét welk van de
 * twee zijn volgende keuze stuurt. In Eenvoudig staat daar één beslisbare zin.
 *
 * Eigenaarsbesluit 26-08-2026: optie A — hub-only, via de nieuwe
 * `SwapInSimple`-primitive; /overzicht/belasting/box1 houdt BEL-4 (effectief +
 * netto besteedbaar) en wordt hier bewust NIET aangeraakt.
 */
describe('HubTotaleDruk — tariefcellen in Eenvoudig (S14)', () => {
  it('vervangt de twee cellen door één zin over je volgende euro', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
      'simple',
    )
    expect(screen.queryByText('Effectief')).toBeNull()
    expect(screen.queryByText('Marginaal')).toBeNull()
    expect(screen.getByText('Je volgende euro')).toBeTruthy()
    expect(screen.getByText(/Van elke euro die je extra verdient/)).toBeTruthy()
  })

  it('toont het centen-getal als complement van het CANONIEKE marginale tarief', () => {
    // 1 − marginalRate, afgerond — geen tweede afleiding, geen vuistregel.
    const verwacht = Math.round((1 - motor.marginalRate) * 100)
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
      'simple',
    )
    expect(screen.getByText(`${verwacht} cent`)).toBeTruthy()
    // Grenswaarde uit de kaart: 56,01% marginaal → 44 cent over.
    expect(Math.round((1 - 0.5601) * 100)).toBe(44)
  })

  it('valt zonder bekend inkomen terug op de invulprompt — géén zin, géén 0 cent', () => {
    const { container } = renderKaart(
      <HubTotaleDruk
        overview={overviewZonderInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={0}
        incomeKnown={false}
      />,
      'simple',
    )
    expect(screen.getByText('Inkomen onbekend')).toBeTruthy()
    expect(screen.getByText(/Vul je bruto jaarinkomen in/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/cent over/)
    expect(container.textContent).not.toMatch(/\d+([.,]\d+)?%/)
  })

  it('toont géén zin wanneer het marginale tarief ontbreekt, ook mét inkomen', () => {
    const overview = {
      ...overviewMetInkomen(),
      marginalRate: null,
    }
    const { container } = renderKaart(
      <HubTotaleDruk
        overview={overview}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
      'simple',
    )
    expect(container.textContent).not.toMatch(/cent over/)
    expect(screen.getByText(/Vul je bruto jaarinkomen in/)).toBeTruthy()
  })

  it('laat Volledig ongemoeid — beide cellen staan er nog', () => {
    renderKaart(
      <HubTotaleDruk
        overview={overviewMetInkomen()}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
      'full',
    )
    expect(screen.getByText('Effectief')).toBeTruthy()
    expect(screen.getByText('Marginaal')).toBeTruthy()
    expect(screen.queryByText(/Van elke euro die je extra verdient/)).toBeNull()
  })
})

/**
 * BRON-ASSERTIE (in de geest van `horizon-client.euro-view.test.ts`).
 *
 * De zin "van elke euro extra houd je ±44 cent over" is 1 − marginaal tarief.
 * Precies dáár loerde de C9-val: `deriveMarginaalTarief()` is een netto→bruto-
 * VUISTREGEL die altijd één van twee vaste schijftarieven teruggeeft en 56,0%
 * structureel nooit kan produceren — met die bron zou de zin "±64 cent"
 * zeggen. Een verkeerd getal in expert-notatie is al fout; in gewone taal is
 * het erger. Deze test bewaakt dat het component uitsluitend consumeert wat
 * `buildTaxOverview` levert en zélf geen fiscale bron of constante binnenhaalt.
 */
describe('HubTotaleDruk — consume, don\'t recompute (bron-assertie)', () => {
  // Alleen de CODE toetsen: de docblocks van dit component benoemen de
  // verboden bronnen expliciet ("roep hier nooit deriveMarginaalTarief aan"),
  // en die uitleg moet blijven staan zonder de gate te laten afgaan.
  const bron = readFileSync(
    join(process.cwd(), 'components', 'overview', 'belasting', 'hub-totale-druk.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('importeert geen tariefbron en roept geen vuistregel aan', () => {
    expect(bron).not.toMatch(/deriveMarginaalTarief/)
    expect(bron).not.toMatch(/BOX1_PARAMS/)
    expect(bron).not.toMatch(/from '@\/lib\/box1-tax'/)
    expect(bron).not.toMatch(/from '@\/lib\/box3-data'/)
  })

  it('bevat geen losse fiscale constante', () => {
    // Schijftarieven, arbeidskorting-afbouw en forfaits horen in lib/box1-tax.ts
    // resp. lib/box3-data.ts — nooit in een presentatie-component.
    expect(bron).not.toMatch(/0\.(3575|3756|495|4950|0651)\b/)
    expect(bron).not.toMatch(/\b(49[.,]5|35[.,]75|37[.,]56|6[.,]51)\s*%/)
  })
})
