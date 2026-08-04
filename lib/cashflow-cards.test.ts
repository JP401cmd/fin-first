// lib/cashflow-cards.test.ts
//
// Vastlegging van twee bevestigde bugs in `cashflow-cards.ts#buildCashflowCards`
// als FALENDE tests (firsthand geverifieerd op live accountdata — zie de
// bug-fix-opdracht). Dit bestand fixt de productiecode NIET; de rode tests
// zijn het bewijsstuk. Naast de bug-tests staan er expliciete regressie-
// asserties die het gedrag vastleggen dat door de toekomstige fix NIET mag
// verschuiven (statusdot-semantiek, lege staten, drempel-logica).
//
// Docstrings zijn in norm-stem geschreven: ze beschrijven het CORRECTE gedrag,
// niet "verwacht na de fix" — zodat ze na de fix gewoon blijven kloppen.
//
// NB — de hard-gepinde bedrag-strings schrijven de scheider na het euroteken
// als de zichtbare escape \u00A0 (U+00A0, NON-BREAKING SPACE): `formatCurrency`
// draait op Intl('nl-NL', { style: 'currency' }) en dát is het teken dat Intl
// daar zet. Met een gewone spatie vergelijk je twee visueel identieke strings
// die niet gelijk zijn — de runner meldt dan letterlijk
// "expected '€ -17.608' to be '€ -17.608'". De escape maakt het onzichtbare
// teken leesbaar; de bedragen zelf zijn ongewijzigd.

import { describe, it, expect } from 'vitest'
import {
  buildCashflowCards,
  budgetCardStatus,
  transactiesCardStatus,
} from './cashflow-cards'
import { MOCK_DASHBOARD_DATA } from './mock-dashboard-data'
import { formatCurrency } from './format'
import type { DashboardData } from '@/lib/types/dashboard'
import type { CashflowData } from './cashflow-data-loader'
import type { VasteLastenSummary } from './vaste-lasten-summary'

// ── Contract-uitbreiding (Bug B) ──────────────────────────────────────────
// `currentMonthIncome`/`currentMonthExpenses` zijn VERPLICHTE velden op
// `DashboardData` (de gerealiseerde huidige kalendermaand uit transacties,
// excl. transfers) — bewust niet optioneel, want een optioneel veld nodigt uit
// tot `?? data.monthlyExpenses` en dat is Bug B opnieuw. Er is dus geen lokaal
// intersectietype meer nodig: de gewone `DashboardData` draagt het contract.
function baseDashboard(overrides: Partial<DashboardData>): DashboardData {
  return { ...MOCK_DASHBOARD_DATA, ...overrides }
}

const EMPTY_CASHFLOW: CashflowData = {
  monthLabel: 'juli 2026',
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
  totalMonthlySubscriptions: 0,
  totalMonthlyVasteKosten: 0,
  totalMonthly: 0,
  count: 0,
}

function budgetCard(dashboardData: DashboardData) {
  const cards = buildCashflowCards(dashboardData, EMPTY_CASHFLOW, EMPTY_VASTE_LASTEN)
  const card = cards.find((c) => c.key === 'budget')
  if (!card) throw new Error('budget-kaart ontbreekt')
  return card
}

function transactiesCard(dashboardData: DashboardData) {
  const cards = buildCashflowCards(dashboardData, EMPTY_CASHFLOW, EMPTY_VASTE_LASTEN)
  const card = cards.find((c) => c.key === 'transacties')
  if (!card) throw new Error('transacties-kaart ontbreekt')
  return card
}

// ── Bug A — Budget-kaart ──────────────────────────────────────────────────
// De Budget-KPI toont het resterende budget van deze maand
// (budgetTotals.expense.limit − budgetTotals.expense.spent), niet het
// maandplafond. Grondslag is uitsluitend budgetTotals.expense — savings-
// budgetten tellen niet mee.

describe('buildCashflowCards — Bug A: Budget-KPI toont resterend budget, niet het plafond', () => {
  it('binnen budget (remaining > 0): KPI is het resterende bedrag, zonder /mnd-suffix, ongeacht savings-budget', () => {
    const dashboardData = baseDashboard({
      budgetingActive: true,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 2000 }, // remaining = 1950
        // Absurd afwijkend savings-budget: mag de expense-KPI niet raken.
        savings: { limit: 99_999, spent: 88_888 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    const remaining = 3950 - 2000
    expect(card.kpi).toBe(formatCurrency(remaining))
    expect(card.kpi).not.toMatch(/\/mnd/)
  })

  it('boven budget (live-bug-cijfers: plafond €3.950, besteed €21.558,38): KPI toont het overschreden bedrag als expliciet negatief bedrag', () => {
    const dashboardData = baseDashboard({
      budgetingActive: true,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 21_558.38 }, // remaining = -17.608,38 ("5,5× over budget")
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    const remaining = 3950 - 21_558.38
    expect(remaining).toBeLessThan(0)
    expect(card.kpi).toBe(formatCurrency(remaining))
    expect(card.kpi).toBe('€\u00A0-17.608')
  })

  it('remaining exact nul: KPI toont €0, zonder overschreden-framing', () => {
    const dashboardData = baseDashboard({
      budgetingActive: true,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 3950 }, // remaining = 0
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    expect(card.kpi).toBe(formatCurrency(0))
    expect(card.kpi).not.toMatch(/-/)
  })
})

describe('buildCashflowCards — Budget-kaart: gedrag dat de fix NIET mag verschuiven', () => {
  it('budgetCardStatus (de statusdot) blijft gebaseerd op monthSummary.budgetScore — niet op remaining', () => {
    // budgetScore laag (bad) terwijl remaining ruim positief is: status volgt
    // de score, niet de intuïtie die "veel over" zou suggereren.
    const dashboardData = baseDashboard({
      budgetingActive: true,
      monthSummary: { ...MOCK_DASHBOARD_DATA.monthSummary, budgetScore: 40 },
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 500 }, // remaining ruim positief
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    expect(card.status).toBe(
      budgetCardStatus({ budgetingActive: true, expenseLimit: 3950, budgetScore: 40 }),
    )
    expect(card.status).toBe('bad')
  })

  it('lege staat (budgetingActive = false): kpi null + subText "Nog geen budget", ongewijzigd', () => {
    const dashboardData = baseDashboard({
      budgetingActive: false,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 2000 },
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    expect(card.kpi).toBeNull()
    expect(card.subText).toBe('Nog geen budget')
  })

  it('lege staat (limit = 0): kpi null + subText "Nog geen budget", ongewijzigd', () => {
    const dashboardData = baseDashboard({
      budgetingActive: true,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 0, spent: 0 },
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = budgetCard(dashboardData)
    expect(card.kpi).toBeNull()
    expect(card.subText).toBe('Nog geen budget')
  })
})

// ── Bug B — Transacties-kaart ──────────────────────────────────────────────
// De Transacties-KPI (en transactiesCardStatus, en detail.tip, en de
// spaarquote in detail.value) draaien op de werkelijk gerealiseerde
// kalendermaand-sommen uit transacties (`currentMonthIncome` /
// `currentMonthExpenses`), niet op de effective/manual-override-waarden
// (`monthlyIncome`/`monthlyExpenses`, die bij income_source/expenses_source
// = 'manual' de profielinschatting zijn).

describe('buildCashflowCards — Bug B: Transacties-KPI draait op de gerealiseerde maand, niet op de profielinschatting', () => {
  it('live-bug-scenario (profiel manual 5000/3000, gerealiseerd juli €25.227,42 in / €92.436,70 uit): KPI/tip/spaarquote gebruiken de gerealiseerde cijfers', () => {
    const dashboardData = baseDashboard({
      // Effective/manual-override-waarden (profiles.income_source/expenses_source = 'manual').
      monthlyIncome: 5000,
      monthlyExpenses: 3000,
      // Werkelijk gerealiseerde juli-transacties (excl. transfer/joint_transfer).
      currentMonthIncome: 25_227.42,
      currentMonthExpenses: 92_436.70,
    })
    const card = transactiesCard(dashboardData)
    const realizedNet = 25_227.42 - 92_436.70

    expect(card.kpi).toBe('€\u00A0-67.209')
    expect(card.kpi).not.toBe('+€\u00A02.000') // de profiel-gebaseerde (foute) uitkomst
    expect(card.detail.tip).toBe('Inkomen €\u00A025.227 · uitgaven €\u00A092.437.')
    expect(card.detail.value).toBe('-266% spaarquote')
    expect(realizedNet).toBeLessThan(0)
  })

  it('effective-waarden suggereren een gezonde spaarquote, maar de gerealiseerde cijfers geven een tekort → status moet bad zijn', () => {
    const dashboardData = baseDashboard({
      monthlyIncome: 5000, // effective: net +2000, 40% spaarquote → zou 'good' suggereren
      monthlyExpenses: 3000,
      currentMonthIncome: 25_227.42, // gerealiseerd: fors tekort → moet 'bad' zijn
      currentMonthExpenses: 92_436.70,
    })
    const card = transactiesCard(dashboardData)
    expect(card.status).toBe('bad')
    expect(card.subText).toBe('Tekort deze maand')
  })

  it('geen transacties deze maand (gerealiseerd 0/0), ondanks een van-nul-verschillende profielinschatting: kpi null, subText "Nog geen transacties", status neutral', () => {
    const dashboardData = baseDashboard({
      monthlyIncome: 5000, // profielinschatting blijft aanwezig
      monthlyExpenses: 3000,
      currentMonthIncome: 0, // maar er zijn deze kalendermaand geen transacties
      currentMonthExpenses: 0,
    })
    const card = transactiesCard(dashboardData)
    expect(card.kpi).toBeNull()
    expect(card.subText).toBe('Nog geen transacties')
    expect(card.status).toBe('neutral')
  })
})

describe('buildCashflowCards — Transacties-kaart: gedrag dat de fix NIET mag verschuiven', () => {
  it('transactiesCardStatus-drempels blijven ongewijzigd (≥20% good, ≥0% warn, <0% bad) — alleen de invoer wisselt van bron', () => {
    // Zuivere functie-check, los van buildCashflowCards: de fix verandert WELKE
    // getallen worden doorgegeven, niet de drempellogica zelf.
    expect(transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 750 })).toBe('good') // 25%
    expect(transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 950 })).toBe('warn') // 5%
    expect(transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 1200 })).toBe('bad') // -20%
    expect(transactiesCardStatus({ currentMonthIncome: 0, currentMonthExpenses: 0 })).toBe('neutral')
  })
})
