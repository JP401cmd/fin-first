import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    render(
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
    render(
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
    const { container } = render(
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
    render(
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
    render(
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
    const { container } = render(
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
    const zonder = render(
      <HubTotaleDruk
        overview={overview}
        dailyExpenses={DAILY_EXPENSES}
        dailyIncome={GROSS / 365}
        incomeKnown
      />,
    )
    const bedragZonder = zonder.container.querySelector('span.tabular-nums')?.textContent
    zonder.unmount()

    const met = render(
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
