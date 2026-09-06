/**
 * B-019 — de voorspelling moet de RICHTING van het budget volgen.
 *
 * Gemeld op /overzicht/cashflow/budget: "Inkomens budgetten worden in de
 * verwachting gezien als uitgaven". `computeBudgetForecast` rekende correct
 * (de reeks die de aanroeper doorgeeft is al richting-gecorrigeerd door
 * `spendingContribution`), maar bénoemde elke uitkomst als uitgave: de kop
 * "Verwachte uitgaven", de zin "geef je volgende maand € X uit aan salaris",
 * de lege staat "Nog niet genoeg uitgavenhistorie" en een limiet-alert die op
 * een inkomstenbudget juist goed nieuws beschrijft.
 *
 * Given een budget met een richting (income/savings/debt/expense/archive)
 * When  de voorspelling wordt berekend
 * Then  draagt zij de woorden van díe richting, en verschijnt er alleen een
 *       limiet-alarm waar boven de limiet uitkomen ook echt slecht is.
 *
 * De GETALLEN zijn richtingsloos en mogen niet meebewegen — dat is de laatste
 * case van deze suite.
 *
 * Bedragen worden NIET letterlijk geassserteerd: `Intl.NumberFormat('nl-NL')`
 * zet een harde spatie (U+00A0) tussen € en het getal, en die vergelijking is
 * ICU-afhankelijk. De woorden eromheen zijn wat deze suite bewaakt.
 */

import { describe, it, expect } from 'vitest'
import { computeBudgetForecast } from './budget-forecast'

/** Zes maanden salaris, oplopend — ruim boven de drie-maanden-drempel. */
const INKOMSTEN = [3100, 3150, 3200, 3180, 3250, 3300]
/** Zes maanden boodschappen, boven een limiet van 400. */
const UITGAVEN = [380, 400, 420, 410, 430, 440]

describe('computeBudgetForecast — richting van het budget', () => {
  it('een INKOMSTEN-budget heet geen uitgave', () => {
    const f = computeBudgetForecast(INKOMSTEN, 3000, 'Salaris', 'income')
    expect(f.label).toBe('Verwacht inkomen')
    expect(f.message).toContain('binnen op salaris')
    expect(f.message).not.toContain('uit aan')
  })

  it('een INKOMSTEN-budget boven zijn doel krijgt geen waarschuwing', () => {
    const f = computeBudgetForecast(INKOMSTEN, 3000, 'Salaris', 'income')
    expect(f.exceedsLimit).toBe(true)
    expect(f.alertMessage).toBeNull()
  })

  it('een SPAAR-budget spreekt van inleg, niet van uitgaven', () => {
    const f = computeBudgetForecast([500, 500, 500, 500], 400, 'Vakantiepot', 'savings')
    expect(f.label).toBe('Verwachte inleg')
    expect(f.message).toContain('opzij op vakantiepot')
    expect(f.exceedsLimit).toBe(true)
    expect(f.alertMessage).toBeNull()
  })

  it('een AFLOSSINGS-budget spreekt van aflossen', () => {
    const f = computeBudgetForecast([250, 250, 250, 250], 200, 'Studieschuld', 'debt')
    expect(f.label).toBe('Verwachte aflossing')
    expect(f.message).toContain('af op studieschuld')
    // Meer aflossen dan begroot is winst, geen overschrijding.
    expect(f.exceedsLimit).toBe(true)
    expect(f.alertMessage).toBeNull()
  })

  it('een UITGAVEN-budget houdt exact de bestaande woorden', () => {
    const f = computeBudgetForecast(UITGAVEN, 400, 'Boodschappen', 'expense')
    expect(f.label).toBe('Verwachte uitgaven')
    expect(f.message.startsWith('Op basis van je patroon geef je volgende maand')).toBe(true)
    expect(f.message.endsWith('uit aan boodschappen')).toBe(true)
    expect(f.alertMessage).not.toBeNull()
    expect(f.alertMessage).toContain('verwachte uitgaven overschrijden je limiet met')
  })

  it('de lege staat noemt de historie van de juiste kant', () => {
    const uit = computeBudgetForecast([100, 0, 0], 500, 'Boodschappen', 'expense')
    const inkomen = computeBudgetForecast([100, 0, 0], 500, 'Salaris', 'income')
    expect(uit.hasSufficientData).toBe(false)
    expect(inkomen.hasSufficientData).toBe(false)
    expect(uit.message).toContain('uitgavenhistorie')
    expect(inkomen.message).toContain('inkomstenhistorie')
  })

  it('een richtingloze post (archief / eigen rekening) krijgt neutrale woorden', () => {
    const f = computeBudgetForecast([120, 130, 140, 150], 100, 'Eigen rekening', 'archive')
    expect(f.label).toBe('Verwacht bedrag')
    expect(f.message).not.toContain('uit aan')
    expect(f.exceedsLimit).toBe(true)
    expect(f.alertMessage).toBeNull()
  })

  it('DE GETALLEN ZIJN RICHTINGSLOOS: alleen de woorden verschillen', () => {
    const uit = computeBudgetForecast(UITGAVEN, 400, 'Boodschappen', 'expense')
    const inkomen = computeBudgetForecast(UITGAVEN, 400, 'Boodschappen', 'income')
    expect(inkomen.predicted).toBe(uit.predicted)
    expect(inkomen.mean).toBe(uit.mean)
    expect(inkomen.stdDev).toBe(uit.stdDev)
    expect(inkomen.confidence).toBe(uit.confidence)
    expect(inkomen.confidencePercent).toBe(uit.confidencePercent)
    expect(inkomen.monthsUsed).toBe(uit.monthsUsed)
    expect(inkomen.exceedsLimit).toBe(uit.exceedsLimit)
    expect(inkomen.exceedAmount).toBe(uit.exceedAmount)
    expect(inkomen.monthlyValues).toEqual(uit.monthlyValues)
  })
})
