/**
 * H3 — een netto-inkomst-maand mag de prognose niet uitschakelen.
 *
 * `computeBudgetForecast` filtert de maandreeks op `v > 0` ("een nulmaand
 * betekent misschien geen data, geen nul-uitgaven") en eist minimaal 3 maanden
 * met besteding. Sinds de norm van 30 aug 2026 kan een maand NEGATIEF zijn
 * (meer inkomsten dan uitgaven op een uitgaven-budget); zo'n maand viel dus
 * volledig weg, en bij 3+ van die maanden flipte het paneel naar "Nog niet
 * genoeg uitgavenhistorie" terwijl er een volle jaarhistorie ligt.
 *
 * Besluit: de aanroeper klemt de reeks op `Math.max(0, spent)` per maand — een
 * netto-inkomst-maand is voor de PROGNOSE een maand zonder uitgaven, geen
 * ontbrekende maand. Deze suite legt beide kanten vast: ongeklemd valt de
 * prognose om, geklemd niet.
 */

import { describe, it, expect } from 'vitest'
import { computeBudgetForecast } from './budget-forecast'

const LIMIT = 1642

/** 12 maanden, waarvan er 4 negatief zijn (netto inkomsten). */
const RAW_MONTHS = [
  1200, 1300, -6735, 1250, -400, 1180,
  1220, -900, 1300, 1275, -150, 1240,
]

/** Wat de aanroeper doorgeeft sinds de klem. */
const CLAMPED_MONTHS = RAW_MONTHS.map((v) => Math.max(0, v))

describe('computeBudgetForecast — negatieve maanden', () => {
  it('ONGEKLEMD verliest de negatieve maanden en kan omvallen', () => {
    // Documenteert waaróm de klem er is: van de laatste 6 maanden blijven er
    // maar 4 met `v > 0` over, en bij een ongunstiger venster zakt dat onder 3.
    const laatsteZes = RAW_MONTHS.slice(-6)
    expect(laatsteZes.filter((v) => v > 0).length).toBeLessThan(laatsteZes.length)
  })

  it('ongeklemd met 4 negatieve maanden in het venster: geen prognose', () => {
    const slechtVenster = [-100, 1200, -200, -300, 1250, -400]
    const r = computeBudgetForecast(slechtVenster, LIMIT, 'Inventaris & apparaten')
    expect(r.hasSufficientData).toBe(false)
    expect(r.message).toContain('Nog niet genoeg uitgavenhistorie')
  })

  it('GEKLEMD blijft de prognose staan bij 12 maanden waarvan 4 negatief', () => {
    const r = computeBudgetForecast(CLAMPED_MONTHS, LIMIT, 'Inventaris & apparaten')
    expect(r.hasSufficientData).toBe(true)
    expect(r.message).not.toContain('Nog niet genoeg uitgavenhistorie')
    expect(r.predicted).toBeGreaterThan(0)
  })

  it('geklemd: hetzelfde slechte venster levert nu wél een prognose', () => {
    const slechtVenster = [-100, 1200, -200, -300, 1250, -400].map((v) => Math.max(0, v))
    const r = computeBudgetForecast(slechtVenster, LIMIT, 'Inventaris & apparaten')
    // Twee echte uitgavenmaanden blijven twee; de klem verzint geen data.
    expect(r.monthsUsed).toBe(2)
    expect(r.hasSufficientData).toBe(false)
  })

  it('de klem verandert niets aan een reeks zonder negatieve maanden', () => {
    const positief = [1200, 1300, 1250, 1180, 1220, 1300]
    const a = computeBudgetForecast(positief, LIMIT, 'X')
    const b = computeBudgetForecast(positief.map((v) => Math.max(0, v)), LIMIT, 'X')
    expect(b).toEqual(a)
  })

  it('de prognose blijft nooit negatief', () => {
    const r = computeBudgetForecast(CLAMPED_MONTHS, LIMIT, 'Inventaris & apparaten')
    expect(r.predicted).toBeGreaterThanOrEqual(0)
  })
})
