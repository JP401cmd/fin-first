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
  currentMonthWindowLabel,
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

// ── CF-3 — venster-label bij de maandcijfers ───────────────────────────────
// De Transacties-KPI is de gerealiseerde LOPENDE kalendermaand; op
// /overzicht/cashflow/transacties staan 30-DAGEN-cijfers. Zonder venster zijn
// die twee niet uit elkaar te houden — dezelfde verwarringsklasse als ADR 0073,
// alleen nu in de copy i.p.v. in de grondslag. Deze suite pint het label vast
// TEGEN de velden die het beschrijft, zodat een label niet stil kan blijven
// staan terwijl de grondslag eronder verschuift.

describe('buildCashflowCards — CF-3: maandcijfers dragen hun venster', () => {
  // 9 augustus 2026, lokaal — bewust midden in de maand: "tot nu toe" is dan
  // een echte bewering en niet toevallig waar.
  const NOW = new Date(2026, 7, 9)

  function cardsAt(dashboardData: DashboardData, now: Date = NOW) {
    return buildCashflowCards(dashboardData, EMPTY_CASHFLOW, EMPTY_VASTE_LASTEN, now)
  }

  it('currentMonthWindowLabel benoemt de maand van `now`, niet "deze maand"', () => {
    expect(currentMonthWindowLabel(NOW)).toBe('augustus tot nu toe')
    expect(currentMonthWindowLabel(new Date(2026, 0, 31))).toBe('januari tot nu toe')
    expect(currentMonthWindowLabel(new Date(2027, 11, 1))).toBe('december tot nu toe')
  })

  it('Transacties: het venster-label hoort bij de KPI die het beschrijft (gerealiseerde maand, niet de profielinschatting)', () => {
    const dashboardData = baseDashboard({
      // Effective/manual-override — mag de kaart NIET voeden (ADR 0073).
      monthlyIncome: 5000,
      monthlyExpenses: 3000,
      currentMonthIncome: 4200,
      currentMonthExpenses: 3100,
    })
    const card = cardsAt(dashboardData).find((c) => c.key === 'transacties')!

    // Runtime-assertie: het gelabelde cijfer IS het verschil van de twee
    // canonieke `currentMonth*`-velden — niet van de effective velden.
    expect(card.kpi).toBe(`+${formatCurrency(4200 - 3100)}`)
    expect(card.kpi).not.toBe(`+${formatCurrency(5000 - 3000)}`)
    expect(card.kpiWindow).toBe('in augustus tot nu toe')
  })

  it('Transacties: het uitklap-detail draagt hetzelfde venster als label', () => {
    const card = cardsAt(
      baseDashboard({ currentMonthIncome: 4200, currentMonthExpenses: 3100 }),
    ).find((c) => c.key === 'transacties')!
    expect(card.detail.label).toBe('augustus tot nu toe')
  })

  it('Transacties: geen transacties → geen venster-regel (er is niets om te labelen)', () => {
    const card = cardsAt(
      baseDashboard({ currentMonthIncome: 0, currentMonthExpenses: 0 }),
    ).find((c) => c.key === 'transacties')!
    expect(card.kpi).toBeNull()
    expect(card.kpiWindow).toBeNull()
  })

  it('Budget: de bestedings-tip noemt het venster; de KPI zelf krijgt géén venster-regel (het is een restant, geen som over de maand)', () => {
    const dashboardData = baseDashboard({
      budgetingActive: true,
      budgetTotals: {
        income: { limit: 5200, spent: 5200 },
        expense: { limit: 3950, spent: 2000 },
        savings: { limit: 1500, spent: 1400 },
        debt: { limit: 500, spent: 500 },
      },
    })
    const card = cardsAt(dashboardData).find((c) => c.key === 'budget')!
    expect(card.detail.tip).toBe(
      `${formatCurrency(2000)} van ${formatCurrency(3950)} besteed in augustus tot nu toe.`,
    )
    expect(card.kpiWindow).toBeNull()
  })

  it('Vaste lasten en Forecast dragen geen venster-regel — hun eenheid/tip doet dat al', () => {
    const cards = cardsAt(baseDashboard({}))
    expect(cards.find((c) => c.key === 'vaste-lasten')!.kpiWindow).toBeNull()
    expect(cards.find((c) => c.key === 'forecast')!.kpiWindow).toBeNull()
  })

  it('`now` is optioneel: zonder argument blijft de bestaande callsite werken', () => {
    const cards = buildCashflowCards(
      baseDashboard({ currentMonthIncome: 100, currentMonthExpenses: 50 }),
      EMPTY_CASHFLOW,
      EMPTY_VASTE_LASTEN,
    )
    const card = cards.find((c) => c.key === 'transacties')!
    expect(card.kpiWindow).toBe(`in ${currentMonthWindowLabel(new Date())}`)
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

// ── C6 — de halve maand is geen tekort ─────────────────────────────────────
// Bevinding C6 ("Vals alarm over een tekort", 26 aug 2026): op de 24e — vaste
// lasten afgeschreven, salaris nog niet binnen — meldde de Transacties-kaart
// "Tekort deze maand" (rood) terwijl de Forecast-kaart ernaast een overschot
// voorspelde. Twee kaarten uit dezelfde `buildCashflowCards`-aanroep die elkaar
// tegenspreken; deze suite pint vast dat ze dat niet meer doen.

describe('buildCashflowCards — C6: geen tekort-alarm op een onvolledige maand', () => {
  /** Prognose met een structureel overschot: +€1.000 netto per maand. */
  const CASHFLOW_MET_OVERSCHOT: CashflowData = {
    ...EMPTY_CASHFLOW,
    baselineIncome: 3000,
    baselineExpenses: 2000,
  }
  /** Prognose die zelf negatief is: −€500 netto per maand. */
  const CASHFLOW_MET_TEKORT: CashflowData = {
    ...EMPTY_CASHFLOW,
    baselineIncome: 2000,
    baselineExpenses: 2500,
  }

  /** 24 augustus 2026 — de dag uit de reproductiestappen, vóór de salarisdatum. */
  const VOOR_SALARIS = new Date(2026, 7, 24)

  /** Salaris nog niet binnen (€400 van €3.000), vaste lasten wél (−€1.800). */
  const HALVE_MAAND: Partial<DashboardData> = {
    monthlyIncome: 3000,
    monthlyExpenses: 2000,
    currentMonthIncome: 400,
    currentMonthExpenses: 1800,
  }

  function txCard(cashflow: CashflowData, overrides: Partial<DashboardData>) {
    const cards = buildCashflowCards(baseDashboard(overrides), cashflow, EMPTY_VASTE_LASTEN, VOOR_SALARIS)
    const card = cards.find((c) => c.key === 'transacties')
    if (!card) throw new Error('transacties-kaart ontbreekt')
    return card
  }

  it('halve maand + positieve prognose: geen rood, en de kaart zegt WAT er ontbreekt', () => {
    const card = txCard(CASHFLOW_MET_OVERSCHOT, HALVE_MAAND)
    expect(card.status).toBe('neutral')
    expect(card.subText).toBe('Inkomen nog niet compleet')
    // Het cijfer zelf wordt NIET verzacht: het saldo blijft negatief en het
    // venster blijft "tot nu toe" — alleen het OORDEEL wacht op een volle maand.
    expect(card.kpi).toBe('€\u00A0-1.400')
    expect(card.kpiWindow).toBe('in augustus tot nu toe')
  })

  it('de tip zet de eigen prognose ernaast (dát is de toets die de kaart doet)', () => {
    const card = txCard(CASHFLOW_MET_OVERSCHOT, HALVE_MAAND)
    expect(card.detail.tip).toContain('Deze maand loopt nog')
    expect(card.detail.tip).toContain('+€\u00A01.000')
  })

  it('Transacties en Forecast spreken elkaar niet meer tegen', () => {
    const cards = buildCashflowCards(
      baseDashboard(HALVE_MAAND),
      CASHFLOW_MET_OVERSCHOT,
      EMPTY_VASTE_LASTEN,
      VOOR_SALARIS,
    )
    const tx = cards.find((c) => c.key === 'transacties')!
    const forecast = cards.find((c) => c.key === 'forecast')!
    expect(forecast.status).toBe('good')
    expect(tx.status).not.toBe('bad') // vóór C6 stond hier 'bad' náást een groene forecast
  })

  it('halve maand + NEGATIEVE prognose: wél rood — de melding blijft betekenisvol', () => {
    const card = txCard(CASHFLOW_MET_TEKORT, HALVE_MAAND)
    expect(card.status).toBe('bad')
    expect(card.subText).toBe('Tekort deze maand')
  })

  it('salaris binnen én toch een tekort: rood, ook al is de prognose positief', () => {
    const card = txCard(CASHFLOW_MET_OVERSCHOT, {
      monthlyIncome: 3000,
      monthlyExpenses: 2000,
      currentMonthIncome: 3000,
      currentMonthExpenses: 3400,
    })
    expect(card.status).toBe('bad')
    expect(card.subText).toBe('Tekort deze maand')
    // Volle maand ⇒ geen "loopt nog"-zin in de tip.
    expect(card.detail.tip).not.toContain('Deze maand loopt nog')
  })

  it('zonder prognose (lege cashflow) blijft het oordeel wat het was: rood', () => {
    const card = txCard(EMPTY_CASHFLOW, HALVE_MAAND)
    expect(card.status).toBe('bad')
    expect(card.subText).toBe('Tekort deze maand')
  })
})
