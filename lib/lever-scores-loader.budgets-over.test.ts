/**
 * lib/lever-scores-loader.budgets-over.test.ts
 *
 * `budgetsOver` (aantal top-level expense/savings-budgetten boven de maandlimiet)
 * voedt de cashflow-hefboom en daarmee het STATUSPUNT in de zijbalk — op élke
 * route. Deze test staat op de echte loader-helper (`deriveBudgetHealthCounts`),
 * niet op een kopie ervan: de vorige versie van dit bestand hield twee woordelijk
 * gekopieerde varianten naast elkaar en bewees daarmee alleen dat twee kopieën
 * gelijk waren — precies de constructie die de teken-blinde som zo lang liet staan.
 *
 * WAT HIER VASTLIGT: de teller consumeert de canonieke besteed-som
 * (`buildBudgetSpendingMap`, lib/budget-spending.ts), dus
 *   - een inkomst op een uitgaven-budget gaat van de besteding AF en kan een
 *     budget niet "over" maken;
 *   - een transfer telt niet mee op een richting-budget;
 *   - op een savings-budget (inkomsten-richting) IS de positieve rij de
 *     realisatie, dus een spaarstorting (negatieve boeking) zet het budget niet
 *     over de limiet.
 */

import { describe, it, expect } from 'vitest'
import { deriveBudgetHealthCounts } from './lever-scores-loader'

type Tx = { budget_id?: string | null; amount: number | string; transaction_type?: string | null }

// Top-level budgetten zoals `healthBudgets` ze aanlevert (expense + savings).
const BUDGETS = [
  { id: 'boodschappen', default_limit: 400 },
  { id: 'uit-eten', default_limit: 150 },
  { id: 'sparen', default_limit: 500 },
  { id: 'geen-limiet', default_limit: 0 }, // limit 0 → nooit "over", telt niet mee
]

const TYPES = new Map<string, string>([
  ['boodschappen', 'expense'],
  ['uit-eten', 'expense'],
  ['sparen', 'savings'],
  ['geen-limiet', 'expense'],
])

const over = (tx: Tx[]) => deriveBudgetHealthCounts(BUDGETS, tx, [], TYPES).budgetsOver

describe('deriveBudgetHealthCounts — budgetsOver op de canonieke besteed-som', () => {
  it('niets uitgegeven → geen enkel budget over', () => {
    expect(over([])).toBe(0)
  })

  it('uitgaven boven de limiet tellen als over', () => {
    expect(
      over([
        { budget_id: 'boodschappen', amount: -250 },
        { budget_id: 'boodschappen', amount: -200 }, // 450 > 400 → over
        { budget_id: 'uit-eten', amount: -100 }, // 100 < 150 → ok
      ]),
    ).toBe(1)
  })

  it('exact op de limiet telt NIET als over (strikt groter-dan)', () => {
    expect(over([{ budget_id: 'boodschappen', amount: -400 }])).toBe(0)
  })

  it('een budget zonder limiet telt nooit mee', () => {
    expect(over([{ budget_id: 'geen-limiet', amount: -9_999 }])).toBe(0)
  })

  it('REGRESSIE: een INKOMST op een uitgaven-budget maakt het niet "over"', () => {
    // De teken-blinde voorganger telde |200| als besteding en zette dit budget
    // over de limiet van 150 — een terugbetaling kleurde het statuspunt rood.
    expect(over([{ budget_id: 'uit-eten', amount: 200 }])).toBe(0)
  })

  it('REGRESSIE: een inkomst trekt een echte overschrijding weer terug', () => {
    expect(
      over([
        { budget_id: 'boodschappen', amount: -450 }, // 450 > 400
        { budget_id: 'boodschappen', amount: 100 }, // → 350, niet meer over
      ]),
    ).toBe(0)
  })

  it('REGRESSIE: een transfer is geen besteding op een uitgaven-budget', () => {
    expect(
      over([{ budget_id: 'boodschappen', amount: -9_999, transaction_type: 'transfer' }]),
    ).toBe(0)
  })

  it('REGRESSIE: een spaarSTORTING zet een savings-budget niet over de limiet', () => {
    // Inkomsten-richting: de negatieve boeking is de storting, geen besteding.
    // Voorheen telde |800| > 500 als "over".
    expect(over([{ budget_id: 'sparen', amount: -800 }])).toBe(0)
    // Een OPNAME (positieve rij) is daar wél de realisatie.
    expect(over([{ budget_id: 'sparen', amount: 800 }])).toBe(1)
  })

  it('budgetsTotal/onTrack tellen alleen budgetten met een echte limiet', () => {
    const counts = deriveBudgetHealthCounts(BUDGETS, [{ budget_id: 'boodschappen', amount: -500 }], [], TYPES)
    expect(counts.budgetsTotal).toBe(3)
    expect(counts.budgetsOver).toBe(1)
    expect(counts.budgetsOnTrack).toBe(2)
  })

  it('GRENS: er is geen parent-rollup — een kind-boeking telt niet op de parent', () => {
    // Bewust vastgelegd: `healthBudgets` bevat alleen top-level budgetten en de
    // som leest het budget_id van de transactie zelf. Verandert dat, dan hoort
    // deze verwachting mee te veranderen (en niet stilzwijgend).
    expect(over([{ budget_id: 'boodschappen-kind', amount: -9_999 }])).toBe(0)
  })
})
