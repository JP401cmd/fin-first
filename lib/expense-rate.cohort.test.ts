import { describe, it, expect } from 'vitest'
import { recentDailyExpenseRateFromRows } from './expense-rate'
import { formatFreedomRateFootnote } from './format'

/**
 * De VIERDE herkomst van het dagtarief: `'cohort'` (UR3-05 op ADR 0131).
 *
 * Twee soorten "schatting" die vóór deze kaart één woord deelden:
 *  · `'estimate'` — het tarief rust op het profielbedrag i.p.v. op transacties.
 *    Dat bedrag kan de gebruiker zélf getypt hebben; de schatting zit in het
 *    ontbreken van boekingen.
 *  · `'cohort'`   — óók het bedrag is een gok van de app ("Schat het voor me").
 *
 * Vallen die samen, dan blijft "(schatting) uit je profiel" staan nadat de
 * gebruiker zijn eigen bedrag invulde — terecht voor `estimate`, onjuist voor de
 * gok, en daarmee sneuvelt acceptatiecriterium 3 ("het label verdwijnt overal").
 */
const REF = new Date(2026, 8, 5)

describe('recentDailyExpenseRateFromRows — herkomst van de terugval', () => {
  it("noemt de app-gok 'cohort' i.p.v. 'estimate'", () => {
    const uit = recentDailyExpenseRateFromRows([], REF, 2800, 'cohort')
    expect(uit.source).toBe('cohort')
    expect(uit.dailyRate).toBeCloseTo((2800 * 12) / 365, 6)
  })

  it("houdt een eigen profielbedrag op 'estimate' (default)", () => {
    expect(recentDailyExpenseRateFromRows([], REF, 2800).source).toBe('estimate')
    expect(recentDailyExpenseRateFromRows([], REF, 2800, 'profile').source).toBe('estimate')
  })

  it('laat de herkomst van de terugval los zodra er een geloofwaardige meting is', () => {
    // Twaalf maanden van €1.000, één boeking per maand (okt 2025 t/m sep 2026).
    // Datums als letterlijke ISO-string: `new Date(...).toISOString()` schuift de
    // maandgrens in NL een dag terug (repo-lintregel op month-range.ts).
    const rijen = Array.from({ length: 12 }, (_, i) => {
      const maand = 10 + i
      const jaar = maand > 12 ? 2026 : 2025
      const mm = String(maand > 12 ? maand - 12 : maand).padStart(2, '0')
      return { amount: -1000, date: `${jaar}-${mm}-15` }
    })
    // Ook mét fallbackSource 'cohort' wint de meting — de gok is dan irrelevant.
    expect(recentDailyExpenseRateFromRows(rijen, REF, 2800, 'cohort').source).toBe('transactions')
  })

  it("blijft 'none' zonder meting én zonder bedrag — een gok van 0 bestaat niet", () => {
    expect(recentDailyExpenseRateFromRows([], REF, 0, 'cohort').source).toBe('none')
  })
})

describe('formatFreedomRateFootnote — de gok maakt zichzelf bekend', () => {
  it('wijst bij een cohort-gok de weg terug naar een eigen bedrag', () => {
    const lang = formatFreedomRateFootnote(92, 'cohort', false)
    expect(lang).toContain('schatting op basis van je leeftijd')
    expect(lang).toContain('eigen bedrag')
    expect(formatFreedomRateFootnote(92, 'cohort', false, 'short')).toContain(
      '/dag (geschat op je leeftijd)',
    )
  })

  it('laat de bestaande profiel-schatting ongemoeid', () => {
    expect(formatFreedomRateFootnote(92, 'estimate', false)).toContain('uit je profiel')
    expect(formatFreedomRateFootnote(92, 'transactions', false)).toContain('afgelopen 12 maanden')
  })

  it('blijft in privacymodus zwijgen — het tarief is een inverteerbare wisselkoers', () => {
    expect(formatFreedomRateFootnote(92, 'cohort', true)).toBeNull()
  })
})
