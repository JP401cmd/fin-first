/**
 * lib/dashboard-data-loader.budget-spending.test.ts
 *
 * De dashboard-bundel draagt VIER oppervlakken die dezelfde grootheid tonen —
 * "besteed op dit budget deze maand": de favorieten-widget, de Budgetten-widget
 * (`topBudgets`), de budget-alert-meldingen en de uitgaven-heatmap. Ze draaiden
 * elk hun eigen `Math.abs(amount)`-lus; ze lezen nu één gedeelde map uit de
 * canonieke `buildBudgetSpendingMap` (lib/budget-spending.ts).
 *
 * Deze suite legt de twee beslissingen vast die daarbij in de loader zelf
 * genomen zijn en die niet door de canon gedekt worden:
 *   1. "beschikbaar" klemt op de limiet (`budgetBeschikbaar`);
 *   2. het alert-percentage klemt onderaan op 0 maar bovenaan NIET
 *      (`budgetBarPct`), zodat een terugbetaling geen alarm afvuurt terwijl een
 *      overschrijding haar ernst behoudt.
 */

import { describe, it, expect } from 'vitest'
import { budgetBeschikbaar } from './budget-spending'
import { buildBudgetSpendingMap, budgetBarPct } from './budget-spending'

const TYPES = new Map<string, string>([
  ['inventaris', 'expense'],
  ['boodschappen', 'expense'],
])

describe('budgetBeschikbaar — klem op de limiet', () => {
  it('normale besteding: limiet − besteed', () => {
    expect(budgetBeschikbaar(400, 150)).toBe(250)
  })

  it('overschrijding blijft negatief zichtbaar (onderkant niet geklemd)', () => {
    expect(budgetBeschikbaar(400, 550)).toBe(-150)
  })

  it('exact op de limiet → 0 beschikbaar', () => {
    expect(budgetBeschikbaar(400, 400)).toBe(0)
  })

  it('REGRESSIE: een negatieve besteding geeft nooit méér dan de limiet', () => {
    // De gemelde productie-case: limiet €1.642, besteed −€6.735 (één uitgave van
    // 1.265 tegen 8.000 aan binnenkomende partner-overboekingen). Ongeklemd zou
    // hier €8.377 "beschikbaar" staan.
    expect(budgetBeschikbaar(1642, -6735)).toBe(1642)
  })

  it('limiet 0 → nooit beschikbare ruimte', () => {
    expect(budgetBeschikbaar(0, -500)).toBe(0)
  })
})

describe('budget-alertdrempel op de canonieke som', () => {
  /** Spiegelt de loader: canonieke som → budgetBarPct → drempelvergelijking. */
  const pctFor = (
    tx: { budget_id?: string | null; amount: number | string; transaction_type?: string | null }[],
    limit: number,
  ) => budgetBarPct(buildBudgetSpendingMap(tx, [], TYPES)['inventaris'] ?? 0, limit)

  it('REGRESSIE: de gemelde case vuurt geen alarm meer af', () => {
    // 1.265 uitgave, 6.000 + 2.000 binnen ⇒ besteed −6.735 ⇒ 0%, geen melding.
    const pct = pctFor(
      [
        { budget_id: 'inventaris', amount: -1265 },
        { budget_id: 'inventaris', amount: 6000 },
        { budget_id: 'inventaris', amount: 2000 },
      ],
      1642,
    )
    expect(pct).toBe(0)
    expect(pct >= 80).toBe(false)
  })

  it('een echte overschrijding houdt haar ernst (bovenkant niet geklemd)', () => {
    const pct = pctFor([{ budget_id: 'inventaris', amount: -2500 }], 1000)
    expect(pct).toBe(250)
    // >120% ⇒ severity 'critical' in de loader; met een klem op 100 zou dat
    // onderscheid verdwijnen.
    expect(pct > 120).toBe(true)
  })

  it('limiet 0 ⇒ 0% (geen deling door nul, geen melding)', () => {
    expect(pctFor([{ budget_id: 'inventaris', amount: -500 }], 0)).toBe(0)
  })

  it('een transfer telt niet mee op een uitgaven-budget', () => {
    expect(
      pctFor([{ budget_id: 'inventaris', amount: -9999, transaction_type: 'transfer' }], 1000),
    ).toBe(0)
  })
})
