// lib/cashflow-cards.transacties-verdict.test.ts
//
// `transactiesVerdict` levert het oordeelswoord dat sinds de kop-herziening
// (sep 2026) TWEE oppervlakken draagt: de `subText` van de Transacties-kaart op
// /overzicht/budget én de PAGINATITEL van /overzicht/budget/transacties.
//
// De belangrijkste test in dit bestand is de laatste: hij pint vast dat die twee
// per constructie dezelfde zin tonen. Zonder die grendel is dit precies de vorm
// waarin drift ontstaat — de kaart zegt "Krap deze maand" terwijl de titel er
// "Aandacht" van maakt, en niemand merkt het tot een gebruiker beide ziet.

import { describe, it, expect } from 'vitest'
import {
  buildCashflowCards,
  transactiesVerdict,
  transactiesVerdictFromSources,
} from './cashflow-cards'
import { MOCK_DASHBOARD_DATA } from './mock-dashboard-data'
import type { DashboardData } from '@/lib/types/dashboard'
import type { CashflowData } from './cashflow-data-loader'
import type { VasteLastenSummary } from './vaste-lasten-summary'

const MONTH_WINDOW = 'augustus tot nu toe'

const EMPTY_CASHFLOW: CashflowData = {
  monthLabel: 'augustus 2026',
  fullName: null,
  recurrings: [],
  baselineIncome: 0,
  baselineExpenses: 0,
  startingBalance: 0,
  accountCount: 0,
  perspective: 'personal',
  partnerMonthlyIncome: null,
  hasHousehold: false,
  partnerName: null,
}

const EMPTY_VASTE_LASTEN: VasteLastenSummary = {
  subscriptions: [],
  vasteKosten: [],
  terugkerendVariabel: [],
  totalMonthlySubscriptions: 0,
  totalMonthlyVasteKosten: 0,
  totalMonthlyVariabel: 0,
  totalMonthly: 0,
  count: 0,
}

/** 24 augustus 2026 — vóór de gebruikelijke salarisdatum. */
const NOW = new Date(2026, 7, 24)

function verdict(over: Partial<Parameters<typeof transactiesVerdict>[0]>) {
  return transactiesVerdict({
    currentMonthIncome: 4000,
    currentMonthExpenses: 3000,
    expectedMonthlyIncome: 4000,
    forecastNetPerMonth: null,
    hasHistory: true,
    monthWindow: MONTH_WINDOW,
    ...over,
  })
}

describe('transactiesVerdict — het oordeelswoord', () => {
  it('spaarquote ≥20% → goed op koers, met de bijbehorende zin', () => {
    // 4000 binnen, 3000 uit = 25% opgebouwd.
    // Tegenwoordige tijd: de maand loopt nog, dus geen afgeronde uitkomst.
    expect(verdict({})).toEqual({ status: 'good', label: 'Goed aan het sparen deze maand' })
  })

  it('spaarquote tussen 0% en 20% → aandacht', () => {
    // 4000 binnen, 3800 uit = 5%.
    expect(verdict({ currentMonthExpenses: 3800 })).toEqual({
      status: 'warn',
      label: 'Krap deze maand',
    })
  })

  it('negatieve spaarquote bij een compleet inkomen → risico', () => {
    expect(verdict({ currentMonthExpenses: 4500 })).toEqual({
      status: 'bad',
      label: 'Tekort deze maand',
    })
  })

  it('negatief, maar het inkomen is nog niet binnen én de prognose is positief → geen oordeel', () => {
    // DIT IS DE HALVE-MAAND-UITZONDERING. Rond de 1e zijn de vaste lasten al af
    // en staat het salaris er nog niet op; een tekort melden dat de prognose
    // ernaast weerlegt is precies het valse alarm dat mensen rode meldingen
    // leert negeren. De titel zegt dan wát er ontbreekt.
    expect(
      verdict({
        currentMonthIncome: 200,
        currentMonthExpenses: 1800,
        expectedMonthlyIncome: 4000,
        forecastNetPerMonth: 350,
      }),
    ).toEqual({ status: 'neutral', label: 'Inkomen nog niet compleet' })
  })

  it('lege maand mét historie benoemt het VENSTER, niet de administratie', () => {
    // UR2-13: een account met honderden boekingen las anders "Nog geen
    // transacties" zodra de lopende maand toevallig leeg was.
    expect(verdict({ currentMonthIncome: 0, currentMonthExpenses: 0 })).toEqual({
      status: 'neutral',
      label: `Geen transacties in ${MONTH_WINDOW}`,
    })
  })

  it('lege maand zonder enige historie houdt de lege-staat-tekst', () => {
    expect(
      verdict({ currentMonthIncome: 0, currentMonthExpenses: 0, hasHistory: false }),
    ).toEqual({ status: 'neutral', label: 'Nog geen transacties' })
  })
})

describe('kaart en paginatitel delen één bron', () => {
  function scenario(over: Partial<DashboardData>, cashflow: CashflowData = EMPTY_CASHFLOW) {
    const data: DashboardData = { ...MOCK_DASHBOARD_DATA, ...over }
    const cards = buildCashflowCards(data, cashflow, EMPTY_VASTE_LASTEN, NOW)
    const card = cards.find((c) => c.key === 'transacties')
    if (!card) throw new Error('transacties-kaart ontbreekt')
    return { card, header: transactiesVerdictFromSources(data, cashflow, NOW) }
  }

  it.each([
    ['een goede maand', { currentMonthIncome: 4000, currentMonthExpenses: 3000 }],
    ['een krappe maand', { currentMonthIncome: 4000, currentMonthExpenses: 3900 }],
    ['een tekort', { currentMonthIncome: 4000, currentMonthExpenses: 4600 }],
    ['een lege maand', { currentMonthIncome: 0, currentMonthExpenses: 0 }],
  ])('%s: de titel zegt exact wat de kaart zegt', (_naam, over) => {
    const { card, header } = scenario(over as Partial<DashboardData>)
    expect(header.label).toBe(card.subText)
    expect(header.status).toBe(card.status)
  })

  it('ook bij de halve-maand-uitzondering, waar een prognose het oordeel stuurt', () => {
    // De prognose leeft in CashflowData, niet in de scalars — juist hier zou een
    // tweede implementatie in de kop anders uitkomen dan de kaart.
    const { card, header } = scenario(
      { currentMonthIncome: 200, currentMonthExpenses: 1800, monthlyIncome: 4000 },
      { ...EMPTY_CASHFLOW, baselineIncome: 4000, baselineExpenses: 3500 },
    )
    expect(header.label).toBe(card.subText)
    expect(header.status).toBe(card.status)
  })
})
