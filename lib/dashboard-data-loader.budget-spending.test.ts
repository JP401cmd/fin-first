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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { budgetBeschikbaar } from './budget-spending'
import { buildBudgetSpendingMap, budgetBarPct } from './budget-spending'
import { BUDGET_ZERO_LIMIT_BAR_PCT } from './constants'

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

  it('limiet 0 met besteding ⇒ verzadigd, niet 0 (B-032)', () => {
    // Een begroting van nul waar wél op geboekt is, is overschreden — geen
    // deling door nul, maar ook geen "er is nog niets gebeurd". Zie B-032.
    expect(pctFor([{ budget_id: 'inventaris', amount: -500 }], 0)).toBe(
      BUDGET_ZERO_LIMIT_BAR_PCT,
    )
  })

  it('limiet 0 zonder besteding blijft 0', () => {
    expect(pctFor([], 0)).toBe(0)
  })

  it('MELDEN vereist een ingestelde limiet, ook al is het percentage verzadigd', () => {
    // De loader-lus draagt bovenop deze rekenstap een eigen `if (!(limit > 0))
    // continue`: een balk op het scherm moet de waarheid tonen, maar iemand
    // ongevraagd aanspreken op een categorie die hij nooit begroot heeft is
    // ruis. Zelfde lijn als `shouldAlert` en app/api/notifications/route.ts.
    const src = readFileSync(
      join(process.cwd(), 'lib', 'dashboard-data-loader.ts'),
      'utf8',
    )
    expect(src).toContain('if (!(limit > 0)) continue')
  })

  it('een transfer telt niet mee op een uitgaven-budget', () => {
    expect(
      pctFor([{ budget_id: 'inventaris', amount: -9999, transaction_type: 'transfer' }], 1000),
    ).toBe(0)
  })
})

describe('budgetsOverLimit is een MELD-teller, geen weergave-teller (B-032, review)', () => {
  /*
   * `budgetsOverLimit` op de bundel ziet eruit als een telling, maar hij gaat
   * naar `computeNextSteps` en wordt daar een ONGEVRAAGDE actiekaart
   * ("Budgetten bijsturen — N budgetten over de limiet"). `topBudgets` filtert
   * zelf NIET op limiet, dus zonder een expliciete `limit > 0` zou de
   * nul-limiet-tak van B-032 die kaart oproepen voor een categorie die de
   * gebruiker nooit begroot heeft.
   *
   * Bron-grendel omdat de teller diep in een loader van duizenden regels wordt
   * samengesteld uit een live Supabase-fetch; de eigenschap die telt is dat de
   * filterregel er staat, niet welke rijen een specifieke fixture oplevert.
   */
  it('eist een ingestelde limiet vóór hij een budget als "over" telt', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'dashboard-data-loader.ts'), 'utf8')
    expect(src).toContain(
      "budgetsOverLimit: topBudgets.filter(b => b.budgetType === 'expense' && b.limit > 0 && isOverBudget(b.spent, b.limit)).length",
    )
  })

  it('de check-in-editor houdt dezelfde grens — anders toont hij een rij die niet op te slaan is', () => {
    // `changedCount` slaat `limit <= 0` over en de opslaanknop hangt aan die
    // teller; een nul-limiet-rij in de lijst zou een invoerveld tonen dat de
    // knop nooit vrijgeeft.
    const src = readFileSync(
      join(process.cwd(), 'app', '(app)', 'core', 'checkin', 'page.tsx'),
      'utf8',
    )
    expect(src).toContain('expenseBudgets.filter(b => b.limit > 0 && isOverBudget(b.spent, b.limit))')
  })
})
