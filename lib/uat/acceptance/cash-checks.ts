/**
 * Gedeelde engine-checks voor de UAT-Cash-acceptatiecriteria (`cash.ts`).
 *
 * PURE module — geen vitest/DOM-afhankelijkheden — zodat dezelfde lijst checks
 * kan draaien onder:
 *  1. `cash.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-cash.ts`):
 *     `assertEqual(actual, expected, label)` per check.
 *
 * De meeste checks roepen ÉCHTE productiefuncties aan (geen mirror) — deze zone
 * heeft ongewoon veel pure, client-veilige rekenkernen. Uitzonderingen (met
 * bronregel-verwijzing, spiegelt de mirrors in `start-checks.ts`/`will-checks.ts`):
 *  - aandeel-% per rekening (components/app/cash-overview.tsx)
 *  - split-som-validatie (components/app/transaction-form.tsx)
 *  - euro_impact_monthly-negatie bij opzeggen (components/app/opzeg-modal.tsx)
 *  - sibling-matching op genormaliseerde tegenpartijnaam (lib/parsers/categorize.ts-conventie)
 *
 * WF-CASH-25 roept sinds feature #881 de ÉCHTE `orderGroupsLargestFirst` +
 * `buildCombinedGroups` aan (lib/auto-categorize.ts) — geen mirror meer van de
 * vervallen import-pagina-confidence-drempels.
 *  - eerstvolgende-voorkomst-arithmetiek (lib/recurring-data.ts#getNextOccurrence
 *    gebruikt intern `new Date()`, niet injecteerbaar — hier met expliciete `now`).
 *
 * `run()` mag een Promise retourneren (de MT940/OFX/CSV-parsers zijn async) —
 * ANDERS dan de eerdere zones (start/will): dit is de eerste CASH-specifieke
 * uitbreiding van het `EngineCheck`-contract, nodig omdat de bankimport-parsers
 * écht async zijn (crypto.subtle.digest voor de import-hash).
 */

import { dailyExpenseRate, calculateFreedomTime, formatCurrency } from '@/lib/format'
import {
  transactiesCardStatus,
  vasteLastenCardStatus,
  forecastCardStatus,
  buildCashflowCards,
} from '@/lib/cashflow-cards'
import type { DashboardData } from '@/lib/types/dashboard'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { CashflowData } from '@/lib/cashflow-data-loader'
import type { VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { localMonthBounds } from '@/lib/month-range'
import { recomputeTriple } from '@/lib/cashflow-overrides'
import { resolvePeriodWindow, summarizeFlow, resolveHeatmapWindow, type AnalysisTransaction } from '@/lib/transaction-insights'
import { avgDailyExpense, freedomDays } from '@/lib/transaction-display'
import { computeCounterpartyStats, type CounterpartyTransaction } from '@/lib/counterparty-analysis'
import { recurringPerMonth, buildForecast, type ForecastRow } from '@/lib/cashflow-forecast-math'
import type { RecurringTransaction } from '@/lib/recurring-data'
import { getExpectedMonthlyTotal } from '@/lib/recurring-data'
import { cancelEffect } from '@/lib/vaste-lasten-insights'
import { parseMT940 } from '@/lib/parsers/mt940'
import { parseOFX } from '@/lib/parsers/ofx'
import { parseCSV } from '@/lib/parsers/csv'
import { CSV_PRESETS } from '@/lib/parsers/index'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import { applyAssignmentToImportRows, type AssignableImportRow } from '@/lib/sleepmodus/import-assign'
import { buildCombinedGroups, orderGroupsLargestFirst, type CombinedTx } from '@/lib/auto-categorize'
import { mapTransaction, mapAccountType } from '@/lib/truelayer/mapper'
import type { TLTransaction } from '@/lib/truelayer/types'
import { planInitialFetch } from '@/lib/truelayer/initial-fetch'
import { isSelectableTargetOption, occupiedTargetAccountMessage, type TargetAccountOption } from '@/lib/truelayer/target-account'
import { deriveBankLinkState } from '@/lib/bank-connection-status'
import {
  isSameBalance,
  formatBankSyncNote,
  parseBankSyncPrevious,
  formatBankSyncCorrectionNote,
} from '@/lib/truelayer/balance-valuation'
import {
  computePeriodOutcome,
  computeStreaks,
  computeSpendLimitTrend,
  computeSpendLimitScore,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodOutcome,
} from '@/lib/spend-limits/engine'
import { resolveAmountWithBasis } from '@/lib/effective-financials'
import { resolveSavingsSource } from '@/lib/savings-source'
import { spendLimitCounterpartyKey, counterpartyMatchesKey } from '@/lib/spend-limits/counterparty-key'
import {
  applyTransactionSearchCriteria,
  type TransactionFilterBuilder,
} from '@/lib/transactions/search-query'
import { TYPE_TO_CONFIRM_THRESHOLD } from '@/lib/transactions/bulk-contract'
import { transferMarkingFor } from '@/lib/transactions/transfer-marking'
import { planBulkBudgetUpdate, type BulkCandidateRow } from '@/lib/transactions/bulk-mutate'
import {
  EMPTY_SELECTION,
  togglePage,
  headerState,
  shouldOfferSelectAll,
  selectionCount,
  selectAllMatching,
} from '@/components/overview/transacties/bulk/selection-model'
import { criteriaKey } from '@/components/overview/transacties/bulk/criteria'
import { CASH_ACCEPTANCE } from './cash'
import type { AcceptanceCriterion } from './types'

export interface CashEngineCheck {
  /** 'WF-CASH-01' */
  workflow: string
  /** 'UAT-CASH-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. Mag async zijn (parsers). */
  run: () => { expected: number | string; actual: number | string } | Promise<{ expected: number | string; actual: number | string }>
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in cash.ts — gooit als cash.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = CASH_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — cash.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in cash.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

function fx(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

/** Minimale AnalysisTransaction met sensible defaults. */
function makeTx(overrides: Partial<AnalysisTransaction> & { id: string; date: string; amount: number }): AnalysisTransaction {
  return {
    description: 'Test',
    counterparty_name: null,
    counterparty_iban: null,
    budget_id: null,
    category: null,
    account_id: null,
    account_name: null,
    is_income: overrides.amount > 0,
    transaction_type: null,
    bank_code: null,
    running_balance: null,
    creditor_id: null,
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
    ...overrides,
  }
}

/** Minimale CounterpartyTransaction met sensible defaults. */
function makeCpTx(overrides: Partial<CounterpartyTransaction> & { id: string; date: string; amount: number }): CounterpartyTransaction {
  return {
    description: 'Test',
    budget_id: null,
    is_income: overrides.amount > 0,
    budget: null,
    ...overrides,
  }
}

/** Minimale RecurringTransaction met sensible defaults. */
function makeRecurring(overrides: Partial<RecurringTransaction> & { id: string; amount: number; frequency: RecurringTransaction['frequency'] }): RecurringTransaction {
  return {
    user_id: 'test-user',
    account_id: 'test-account',
    budget_id: null,
    name: 'Recurring',
    description: null,
    counterparty_name: null,
    day_of_month: 1,
    day_of_week: null,
    start_date: '2026-01-01',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2026-01-01',
    category_override: null,
    ...overrides,
  }
}

/** Mirror van de aandeel-%-formule per rekening (components/app/cash-overview.tsx). */
function aandeelPct(balance: number, total: number): number {
  return (balance / total) * 100
}

/** Mirror van de split-som-validatie (components/app/transaction-form.tsx):
 *  som binnen €0,01 van het totaal; bij precies 2 regels vult regel 2 automatisch het restant. */
function validateSplit(totaal: number, regels: number[]): { som: number; klopt: boolean } {
  const som = regels.reduce((s, r) => s + r, 0)
  return { som, klopt: Math.abs(som - totaal) < 0.01 }
}
function autoRestant(totaal: number, eersteRegel: number): number {
  return Math.round((totaal - eersteRegel) * 100) / 100
}

/** Mirror van euro_impact_monthly = −maandbedrag (components/app/opzeg-modal.tsx#handleSaveToDraft). */
function euroImpactMonthly(monthlyAmount: number): number {
  return -monthlyAmount
}

/** Minimale TargetAccountOption voor de FR5-kiesbaarheidscheck (WF-CASH-48). */
function makeTargetOption(overrides: Partial<TargetAccountOption> & { id: string; linked_provider_name: string | null }): TargetAccountOption {
  return {
    name: 'Rekening',
    bank_name: null,
    iban_tail: null,
    transaction_count: 0,
    oldest_transaction_date: null,
    newest_transaction_date: null,
    budget_tracking: true,
    fetch_plan: { mode: 'incremental', start_date: '2026-07-01' },
    ...overrides,
  }
}

/** Minimale CombinedTx met sensible defaults, voor de groepsvolgorde-check (WF-CASH-25). */
function makeCombinedTx(overrides: Partial<CombinedTx> & { id: string; counterparty_name: string; date: string }): CombinedTx {
  return {
    description: overrides.counterparty_name,
    counterparty_iban: null,
    amount: -10,
    account_id: null,
    reference: null,
    ...overrides,
  }
}

/** Mirror van sibling-matching op genormaliseerde tegenpartijnaam
 *  (lib/parsers/categorize.ts-conventie: IBAN > naam > omschrijving). */
function normalizeCounterparty(name: string): string {
  return name.trim().toLowerCase()
}
function countSiblings(rows: { counterparty: string }[], target: string): number {
  const normalizedTarget = normalizeCounterparty(target)
  return rows.filter((r) => normalizeCounterparty(r.counterparty) === normalizedTarget).length - 1
}

/** Mirror van de rate-limit-drempel + dagreset (app/api/bank-connect/sync/route.ts
 *  regel 55-76): >=10 verzoeken vandaag blokkeert; een nieuwe kalenderdag reset
 *  de teller naar 0 ongeacht de vorige stand. */
function rateLimitCheck(dailyRequests: number, resetDate: string, today: string): { blocked: boolean; effectiveCount: number } {
  const effectiveCount = resetDate !== today ? 0 : dailyRequests
  return { blocked: effectiveCount >= 10, effectiveCount }
}

/** Mirror van de dedup-scoping (lib/truelayer/existing-hashes.ts#loadExistingImportHashes):
 *  een hash "bestaat al" alléén als een bestaande rij zowel dezelfde `import_hash`
 *  ALS dezelfde `account_id` heeft — de query filtert expliciet op accountId. */
function existsInAccount(existing: { accountId: string; hash: string }[], candidate: { accountId: string; hash: string }): boolean {
  return existing.some((e) => e.accountId === candidate.accountId && e.hash === candidate.hash)
}

/** Mirror van de eerstvolgende-voorkomst-arithmetiek voor een monthly recurring
 *  (lib/recurring-data.ts#getNextOccurrence — hier met injecteerbare `now`, want
 *  de productiefunctie gebruikt intern `new Date()` en is dus niet los te pinnen). */
function nextMonthlyOccurrence(dayOfMonth: number, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
  if (next <= today) {
    next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
  }
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Fake PostgREST-filterbuilder die alleen registreert welke methoden zijn
 *  aangeroepen — precies de structurele vorm die search-query.ts vraagt
 *  (zie het docblock daar: bewust géén echte PostgrestFilterBuilder, anders
 *  klapt TS om in TS2589 door diens recursieve `this`-vorm). */
function makeFakeFilterBuilder(): { calls: string[]; builder: TransactionFilterBuilder } {
  const calls: string[] = []
  const builder: TransactionFilterBuilder = {
    eq: (c) => { calls.push(`eq:${c}`); return builder },
    in: (c) => { calls.push(`in:${c}`); return builder },
    is: (c) => { calls.push(`is:${c}`); return builder },
    or: (f) => { calls.push(`or:${f}`); return builder },
    gt: (c) => { calls.push(`gt:${c}`); return builder },
    lt: (c) => { calls.push(`lt:${c}`); return builder },
    gte: (c) => { calls.push(`gte:${c}`); return builder },
    lte: (c) => { calls.push(`lte:${c}`); return builder },
  }
  return { calls, builder }
}

/** Mirror van de netto-berekening in BulkImpact (components/overview/transacties/bulk/bulk-impact.tsx:64):
 *  net = sumPositief + sumNegatief — inline in het component, geen eigen export. */
function bulkImpactNet(sumPositief: number, sumNegatief: number): number {
  return sumPositief + sumNegatief
}

/** Mirror van de bevestigingsstaat in BulkDeleteConfirm
 *  (components/overview/transacties/bulk/bulk-bevestigingen.tsx:254-259): het
 *  genoemde aantal, de type-to-confirm-poort en de knoptekst — inline
 *  React-state, geen eigen export. */
function deleteConfirmState(
  count: number,
  linkedCounterpartCount: number | null,
  includeLinked: boolean,
  typed: string,
): { totaal: number; needsTyping: boolean; typedOk: boolean; label: string } {
  const meegaand = includeLinked && linkedCounterpartCount != null ? linkedCounterpartCount : 0
  const totaal = count + meegaand
  const needsTyping = totaal > TYPE_TO_CONFIRM_THRESHOLD
  const typedOk = !needsTyping || Number(typed.trim()) === totaal
  const label = `Verwijder ${totaal} ${totaal === 1 ? 'transactie' : 'transacties'}`
  return { totaal, needsTyping, typedOk, label }
}

/** Minimale BulkCandidateRow met sensible defaults (WF-CASH-56). */
function makeBulkCandidate(overrides: Partial<BulkCandidateRow> & { id: string }): BulkCandidateRow {
  return {
    is_split: false,
    transaction_type: null,
    linked_transfer_id: null,
    ...overrides,
  }
}

// ── Checks — één per 'exact'-workflow in CASH_ACCEPTANCE ───────────────────

export const CASH_ENGINE_CHECKS: CashEngineCheck[] = [
  {
    workflow: 'WF-CASH-01',
    scenarioId: 'UAT-CASH-01',
    label: 'Hefboom-kaart-statusdrempels (transactiesCardStatus/vasteLastenCardStatus/forecastCardStatus)',
    run: () => {
      criterion('WF-CASH-01')
      const transGood = transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 800 })
      const transWarn = transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 1000 })
      const transBad = transactiesCardStatus({ currentMonthIncome: 1000, currentMonthExpenses: 1100 })
      const vlGood = vasteLastenCardStatus({ totalMonthly: 499, count: 1, monthlyIncome: 1000 })
      const vlWarn = vasteLastenCardStatus({ totalMonthly: 700, count: 1, monthlyIncome: 1000 })
      const vlBad = vasteLastenCardStatus({ totalMonthly: 701, count: 1, monthlyIncome: 1000 })
      const fcGood = forecastCardStatus({ netPerMonth: 100, hasForecast: true })
      const fcBad = forecastCardStatus({ netPerMonth: -100, hasForecast: true })
      const fcWarn = forecastCardStatus({ netPerMonth: 0, hasForecast: true })
      return {
        expected: 'transGood=good; transWarn=warn; transBad=bad; vlGood=good; vlWarn=warn; vlBad=bad; fcGood=good; fcBad=bad; fcWarn=warn',
        actual: `transGood=${transGood}; transWarn=${transWarn}; transBad=${transBad}; vlGood=${vlGood}; vlWarn=${vlWarn}; vlBad=${vlBad}; fcGood=${fcGood}; fcBad=${fcBad}; fcWarn=${fcWarn}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-02',
    scenarioId: 'UAT-CASH-02',
    label: 'Maandgrenzen (localMonthBounds): tijdzone-veilig, geen dag-shift',
    run: () => {
      criterion('WF-CASH-02')
      const juni = localMonthBounds(new Date(2026, 5, 1))
      const juli = localMonthBounds(new Date(2026, 6, 1))
      return {
        expected: 'juniStart=2026-06-01; juniEnd=2026-07-01; juliStart=2026-07-01; juliEnd=2026-08-01',
        actual: `juniStart=${juni.start}; juniEnd=${juni.end}; juliStart=${juli.start}; juliEnd=${juli.end}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-04',
    scenarioId: 'UAT-CASH-04',
    label: 'Aandeel-% per rekening (mirror): 850/2.850 + 2.000/2.850',
    run: () => {
      criterion('WF-CASH-04')
      const totaal = 850 + 2000
      const betaalPct = aandeelPct(850, totaal)
      const spaarPct = aandeelPct(2000, totaal)
      return {
        expected: 'betaalPct=29.82; spaarPct=70.18',
        actual: `betaalPct=${fx(betaalPct, 2)}; spaarPct=${fx(spaarPct, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-05',
    scenarioId: 'UAT-CASH-05',
    label: 'Cashflow-driehoek herrekenen (recomputeTriple): spaarquote 25% → uitgaven €2.700',
    run: () => {
      criterion('WF-CASH-05')
      const r = recomputeTriple({ monthlyIncome: 3600, monthlyExpenses: 2808, savingsRate: 0 }, 'savingsRate', 'expenses')
      // gebruiker vult 25% spaarquote in vóór het herrekenen
      const r2 = recomputeTriple({ monthlyIncome: 3600, monthlyExpenses: 2808, savingsRate: 25 }, 'savingsRate', 'expenses')
      return {
        expected: 'nieuweUitgaven=2700; inkomenOngewijzigd=3600',
        actual: `nieuweUitgaven=${r2.next.monthlyExpenses}; inkomenOngewijzigd=${r.next.monthlyIncome}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-08',
    scenarioId: 'UAT-CASH-08',
    label: 'Periodevenster (resolvePeriodWindow): maand juli 2026 + vorige (juni)',
    run: () => {
      criterion('WF-CASH-08')
      const now = new Date(2026, 6, 15)
      const juli = resolvePeriodWindow('month', 0, now)
      const juni = resolvePeriodWindow('month', -1, now)
      return {
        expected: 'juliSince=2026-07-01; juliUntil=2026-07-31; juliLabel=juli 2026; juniSince=2026-06-01; juniUntil=2026-06-30',
        actual: `juliSince=${juli.since}; juliUntil=${juli.until}; juliLabel=${juli.label}; juniSince=${juni.since}; juniUntil=${juni.until}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-09',
    scenarioId: 'UAT-CASH-09',
    label: 'Spaarquote-gauge (summarizeFlow) + heatmap-venster (resolveHeatmapWindow)',
    run: () => {
      criterion('WF-CASH-09')
      const txns = [
        makeTx({ id: 't1', date: '2026-06-05', amount: 3000 }),
        makeTx({ id: 't2', date: '2026-06-10', amount: -1800 }),
      ]
      const flow = summarizeFlow(txns)
      const spaarquote = flow.savingsRate
      const window = resolveHeatmapWindow(new Date(2026, 6, 15))
      return {
        expected: 'spaarquote=40; heatmapStart=2025-07-01; heatmapEnd=2026-06-30',
        actual: `spaarquote=${spaarquote}; heatmapStart=${window.start}; heatmapEnd=${window.end}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-10',
    scenarioId: 'UAT-CASH-10',
    label: 'Vrijheidsdagen-label (avgDailyExpense/freedomDays): 10 dagen, €1.000 uitgaven, dagtransactie €50',
    run: () => {
      criterion('WF-CASH-10')
      const txns = Array.from({ length: 4 }, (_, i) =>
        ({ amount: -250, transaction_type: null as string | null }))
      const rate = avgDailyExpense(txns, 10)
      const dagen = freedomDays(50, rate)
      return {
        expected: 'avgDailyExpense=100; freedomDays=0.5',
        actual: `avgDailyExpense=${rate}; freedomDays=${dagen}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-13',
    scenarioId: 'UAT-CASH-13',
    label: 'Split-som-validatie (mirror): auto-restant bij 2 regels, mismatch bij 3',
    run: () => {
      criterion('WF-CASH-13')
      const restant = autoRestant(95, 70)
      const twee = validateSplit(95, [70, restant])
      const drie = validateSplit(95, [70, 25, 10])
      return {
        expected: 'restant2Regels=25; somKlopt2Regels=true; som3Regels=105; somKlopt3Regels=false',
        actual: `restant2Regels=${restant}; somKlopt2Regels=${twee.klopt}; som3Regels=${drie.som}; somKlopt3Regels=${drie.klopt}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-15',
    scenarioId: 'UAT-CASH-15',
    label: 'Tegenpartij-statistieken (computeCounterpartyStats): 3 Albert Heijn-uitgaven',
    run: () => {
      criterion('WF-CASH-15')
      const txns = [
        makeCpTx({ id: 'c1', date: '2026-05-01', amount: -40 }),
        makeCpTx({ id: 'c2', date: '2026-06-01', amount: -55 }),
        makeCpTx({ id: 'c3', date: '2026-07-01', amount: -35 }),
      ]
      const stats = computeCounterpartyStats(txns)
      return {
        expected: 'totalSpent=-130; transactionCount=3; averageAmount=-43.33',
        actual: `totalSpent=${stats.totalSpent}; transactionCount=${stats.transactionCount}; averageAmount=${fx(stats.averageAmount, 2)}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-16',
    scenarioId: 'UAT-CASH-16',
    label: 'Vaste-lasten-totaal/aandeel/vrijheidstijd (recurringPerMonth + dailyExpenseRate)',
    run: () => {
      criterion('WF-CASH-16')
      const monthly = recurringPerMonth({ amount: -100, frequency: 'monthly' })
      const weekly = recurringPerMonth({ amount: -25, frequency: 'weekly' })
      const quarterly = recurringPerMonth({ amount: -90, frequency: 'quarterly' })
      const yearly = recurringPerMonth({ amount: -1200, frequency: 'yearly' })
      const totaalMaand = Math.abs(monthly + weekly + quarterly + yearly)
      const aandeelPctVal = (totaalMaand / 3400) * 100
      const rate = dailyExpenseRate(2200)
      const vrijheidsdagen = calculateFreedomTime(totaalMaand, rate).totalDays
      return {
        expected: 'totaalMaand=338.33; aandeelPct=9.95; vrijheidsdagen=4.7',
        actual: `totaalMaand=${fx(totaalMaand, 2)}; aandeelPct=${fx(aandeelPctVal, 2)}; vrijheidsdagen=${vrijheidsdagen}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-18',
    scenarioId: 'UAT-CASH-18',
    label: 'Opzegbrief euro_impact_monthly (mirror): −maandbedrag',
    run: () => {
      criterion('WF-CASH-18')
      const impact = euroImpactMonthly(15.99)
      return {
        expected: 'euroImpactMonthly=-15.99',
        actual: `euroImpactMonthly=${impact}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-20',
    scenarioId: 'UAT-CASH-20',
    label: '"Wat als ik opzeg" (cancelEffect): €44,90/mnd → €538,80/jr + vrijheidsdagen',
    run: () => {
      criterion('WF-CASH-20')
      // `cancelEffect` neemt sinds de vervolg-KRUIS-20-fix het KANT-EN-KLARE
      // dagtarief (€/dag) i.p.v. maanduitgaven, zodat de aanroeper de grondslag
      // niet meer kan kiezen. De verwachting blijft identiek: hetzelfde
      // €2.200/mnd, alleen expliciet door de canonieke conversie geleid.
      const r = cancelEffect(44.9, dailyExpenseRate(2200))
      return {
        expected: 'jaarbedrag=538.8; vrijheidsdagen=7.4',
        actual: `jaarbedrag=${r.yearlyEuro}; vrijheidsdagen=${r.freedom.totalDays}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-21',
    scenarioId: 'UAT-CASH-21',
    label: 'Eerstvolgende voorkomst (mirror van getNextOccurrence): dag 7, "nu"=5 juli 2026',
    run: () => {
      criterion('WF-CASH-21')
      const next = nextMonthlyOccurrence(7, new Date(2026, 6, 5))
      return {
        expected: 'eerstvolgendeDatum=2026-07-07',
        actual: `eerstvolgendeDatum=${next}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-22',
    scenarioId: 'UAT-CASH-22',
    label: 'Cashflow-forecast (buildForecast): 6 maanden, baseline €800 netto, startsaldo €2.850',
    run: () => {
      criterion('WF-CASH-22')
      const rows: ForecastRow[] = buildForecast([], 3000, 2200, 2850, new Date(2026, 6, 1))
      const netto = rows[0].net
      const saldoNa6m = rows[rows.length - 1].cumulative
      return {
        expected: 'netto=800; saldoNa6m=7650',
        actual: `netto=${netto}; saldoNa6m=${saldoNa6m}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-23',
    scenarioId: 'UAT-CASH-23',
    label: 'MT940/OFX-import (parseMT940/parseOFX): 3 transacties, €2.500 bij / €895 af',
    run: async () => {
      criterion('WF-CASH-23')
      const mt940Content = [
        ':20:STMT20260705',
        ':25:NL00TEST0123456789',
        ':28C:00001/001',
        ':60F:C260601EUR1250,00',
        ':61:2606100610D45,00NTRFNONREF//BANKREF001',
        ':86:/NAME/Albert Heijn/IBAN/NL91ABNA0417164300/EREF/AH-BOODSCHAPPEN-JUNI',
        ':61:2606200620C2500,00NTRFNONREF//BANKREF002',
        ':86:/NAME/Werkgever BV/IBAN/NL02RABO0123456789/RREF/SALARIS-JUNI-2026',
        ':61:2607010701D850,00NTRFNONREF//BANKREF003',
        ':86:/NAME/Woonstichting Ymere/IBAN/NL55INGB0000012345/EREF/HUUR-JULI-2026',
        ':62F:C260701EUR2855,00',
      ].join('\n')
      const ofxContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>TESTNL2A</BANKID>
<ACCTID>NL00TEST0123456789</ACCTID>
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260601
<DTEND>20260701
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260610
<TRNAMT>-45.00
<FITID>BANKREF001B
<NAME>Albert Heijn
<MEMO>AH-BOODSCHAPPEN-JUNI-OFX
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260620
<TRNAMT>2500.00
<FITID>BANKREF002B
<NAME>Werkgever BV
<MEMO>SALARIS-JUNI-2026-OFX
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260701
<TRNAMT>-850.00
<FITID>BANKREF003B
<NAME>Woonstichting Ymere
<MEMO>HUUR-JULI-2026-OFX
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>2855.00
<DTASOF>20260701
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`
      const mt940Txns = await parseMT940(mt940Content)
      const ofxTxns = await parseOFX(ofxContent)
      const sumBij = (txns: { amount: number }[]) => txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const sumAf = (txns: { amount: number }[]) => Math.abs(txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0))
      // WF-CASH-23-bug1 (17 jul 2026): de MT940/OFX-parsers zetten ooit de rauwe
      // bank-typecode (bv. "NTRF"/"DEBIT") in `transaction_type` — die kolom heeft
      // een DB-CHECK-constraint op een vaste enum en elke insert faalde. De fix
      // (lib/parsers/mt940.ts / ofx.ts) laat `transaction_type` altijd `null` en
      // legt de rauwe code in `bank_code`. De eerdere assertie (alleen count/som)
      // ving dit niet — bewezen met een bijt-proef (bug teruggezet, deze check
      // rood). Assert daarom expliciet beide velden voor elke geparste rij.
      const allTxns = [...mt940Txns, ...ofxTxns]
      const transactionTypeAlwaysNull = allTxns.every((t) => t.transaction_type === null)
      const mt940BankCodeOk = mt940Txns.every((t) => t.bank_code === 'NTRF')
      const ofxBankCodeOk =
        ofxTxns[0]?.bank_code === 'DEBIT' && ofxTxns[1]?.bank_code === 'CREDIT' && ofxTxns[2]?.bank_code === 'DEBIT'
      return {
        expected:
          'mt940Count=3; mt940Bij=2500; mt940Af=895; ofxCount=3; ofxBij=2500; ofxAf=895; transactionTypeAlwaysNull=true; mt940BankCodeOk=true; ofxBankCodeOk=true',
        actual: `mt940Count=${mt940Txns.length}; mt940Bij=${fx(sumBij(mt940Txns), 0)}; mt940Af=${fx(sumAf(mt940Txns), 0)}; ofxCount=${ofxTxns.length}; ofxBij=${fx(sumBij(ofxTxns), 0)}; ofxAf=${fx(sumAf(ofxTxns), 0)}; transactionTypeAlwaysNull=${transactionTypeAlwaysNull}; mt940BankCodeOk=${mt940BankCodeOk}; ofxBankCodeOk=${ofxBankCodeOk}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-24',
    scenarioId: 'UAT-CASH-24',
    label: 'CSV-import (parseCSV, ING-preset): 4 transacties, €2.525 bij / €895 af',
    run: async () => {
      criterion('WF-CASH-24')
      const csvContent = [
        'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);MutatieSoort;Mededelingen',
        '20260601;Albert Heijn;NL00TEST0123456789;NL91ABNA0417164300;BA;Af;45,00;Betaalautomaat;AH BOODSCHAPPEN JUNI',
        '20260605;Werkgever BV;NL00TEST0123456789;NL02RABO0123456789;OV;Bij;2500,00;Overschrijving;SALARIS JUNI 2026',
        '20260701;Woonstichting Ymere;NL00TEST0123456789;NL55INGB0000012345;IC;Af;850,00;Incasso;HUUR JULI 2026',
        '20260703;Vriend Jan;NL00TEST0123456789;NL33TEST0987654321;GT;Bij;25,00;Tikkie;TERUGBETALING DINER',
      ].join('\n')
      const ingPreset = CSV_PRESETS.find((p) => p.id === 'ing')!
      const txns = await parseCSV(csvContent, ingPreset)
      const bij = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
      const af = Math.abs(txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0))
      return {
        expected: 'csvCount=4; csvBij=2525; csvAf=895; netto=1630',
        actual: `csvCount=${txns.length}; csvBij=${fx(bij, 0)}; csvAf=${fx(af, 0)}; netto=${fx(bij - af, 0)}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-25',
    scenarioId: 'UAT-CASH-25',
    label: 'AI-tegenpartijgroepen-volgorde (orderGroupsLargestFirst): grootste eerst, recentste-datum-tiebreak',
    run: () => {
      criterion('WF-CASH-25')
      const txs: CombinedTx[] = [
        makeCombinedTx({ id: 'ah1', counterparty_name: 'Albert Heijn', date: '2026-06-01' }),
        makeCombinedTx({ id: 'ah2', counterparty_name: 'Albert Heijn', date: '2026-06-10' }),
        makeCombinedTx({ id: 'ah3', counterparty_name: 'Albert Heijn', date: '2026-06-20' }),
        makeCombinedTx({ id: 'bol1', counterparty_name: 'Bol.com', date: '2026-06-05' }),
        makeCombinedTx({ id: 'bol2', counterparty_name: 'Bol.com', date: '2026-06-15' }),
        makeCombinedTx({ id: 'bol3', counterparty_name: 'Bol.com', date: '2026-06-25' }),
        makeCombinedTx({ id: 'uniek1', counterparty_name: 'Uniek Winkeltje', date: '2026-06-10' }),
      ]
      const groups = buildCombinedGroups(txs)
      const ordered = orderGroupsLargestFirst(Array.from(groups.keys()), groups)
      const namen = ordered.map((k) => groups.get(k)![0].counterparty_name).join(',')
      return {
        expected: 'volgorde=Bol.com,Albert Heijn,Uniek Winkeltje',
        actual: `volgorde=${namen}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-26',
    scenarioId: 'UAT-CASH-26',
    label: 'Sibling-matching op tegenpartijnaam (mirror): 3× "Koffiehuis De Kade", 1× uniek',
    run: () => {
      criterion('WF-CASH-26')
      const rows = [
        { counterparty: 'Koffiehuis De Kade' },
        { counterparty: 'Koffiehuis De Kade' },
        { counterparty: 'Koffiehuis De Kade' },
        { counterparty: 'Uniek Winkeltje' },
      ]
      const siblingsKoffiehuis = countSiblings(rows, 'Koffiehuis De Kade')
      const siblingsUniek = countSiblings(rows, 'Uniek Winkeltje')
      return {
        expected: 'siblingsKoffiehuis=2; siblingsUniek=0',
        actual: `siblingsKoffiehuis=${siblingsKoffiehuis}; siblingsUniek=${siblingsUniek}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-27',
    scenarioId: 'UAT-CASH-27',
    label: 'Eigen-overboeking-detectie (isOwnAccountTransfer): eigen IBAN vs. onbekende IBAN',
    run: () => {
      criterion('WF-CASH-27')
      const ownIbans = new Set(['NL11INGB0001234568'])
      const eigenRekeningHerkend = isOwnAccountTransfer('NL11INGB0001234568', ownIbans)
      const onbekendNietHerkend = isOwnAccountTransfer('NL77TEST0111222333', ownIbans)
      return {
        expected: 'eigenRekeningHerkend=true; onbekendNietHerkend=false',
        actual: `eigenRekeningHerkend=${eigenRekeningHerkend}; onbekendNietHerkend=${onbekendNietHerkend}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-28',
    scenarioId: 'UAT-CASH-28',
    label: 'Sleepmodus-toewijzing (applyAssignmentToImportRows): rij 1 gecategoriseerd, rij 2 ongewijzigd',
    run: () => {
      criterion('WF-CASH-28')
      const rows: AssignableImportRow[] = [
        { import_hash: 'h1', bank_seq: null, budget_id: null, budgetName: null, confidence: 0, category_source: null, isTransfer: false, transaction_type: null },
        { import_hash: 'h2', bank_seq: null, budget_id: null, budgetName: null, confidence: 0, category_source: null, isTransfer: false, transaction_type: null },
      ]
      const result = applyAssignmentToImportRows(rows, {
        keys: ['h1|'],
        budgetId: 'budget-boodschappen',
        budgetName: 'Boodschappen',
        isTransfer: false,
      })
      const rij2Ongewijzigd = result[1].budget_id === null && result[1].confidence === 0
      return {
        expected: 'rij1BudgetId=budget-boodschappen; rij1Confidence=1; rij1Source=manual; rij2Ongewijzigd=true',
        actual: `rij1BudgetId=${result[0].budget_id}; rij1Confidence=${result[0].confidence}; rij1Source=${result[0].category_source}; rij2Ongewijzigd=${rij2Ongewijzigd}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-31',
    scenarioId: 'UAT-CASH-31',
    label: 'Verwacht maandtotaal terugkerende regels (getExpectedMonthlyTotal): 1 regel, gedeactiveerd, 2 regels',
    run: () => {
      criterion('WF-CASH-31')
      const eenRegel = [makeRecurring({ id: 'r1', amount: -975, frequency: 'monthly', is_active: true })]
      const gedeactiveerd = [makeRecurring({ id: 'r1', amount: -975, frequency: 'monthly', is_active: false })]
      const tweeRegels = [
        makeRecurring({ id: 'r1', amount: -975, frequency: 'monthly', is_active: true }),
        makeRecurring({ id: 'r2', amount: -150, frequency: 'monthly', is_active: true }),
      ]
      return {
        expected: 'totaalEenRegel=-975; totaalGedeactiveerd=0; totaalTweeRegels=-1125',
        actual: `totaalEenRegel=${getExpectedMonthlyTotal(eenRegel)}; totaalGedeactiveerd=${getExpectedMonthlyTotal(gedeactiveerd)}; totaalTweeRegels=${getExpectedMonthlyTotal(tweeRegels)}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-35',
    scenarioId: 'UAT-CASH-35',
    label: 'Sync-rate-limit (mirror): 10 verzoeken blokkeert, 9 mag door, nieuwe dag reset',
    run: () => {
      criterion('WF-CASH-35')
      const bij10 = rateLimitCheck(10, '2026-07-29', '2026-07-29')
      const bij9 = rateLimitCheck(9, '2026-07-29', '2026-07-29')
      const nieuweDag = rateLimitCheck(10, '2026-07-28', '2026-07-29')
      return {
        expected: 'geblokkeerdBij10=true; toegestaanBij9=true; resetBijNieuweDag=0',
        actual: `geblokkeerdBij10=${bij10.blocked}; toegestaanBij9=${!bij9.blocked}; resetBijNieuweDag=${nieuweDag.effectiveCount}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-36',
    scenarioId: 'UAT-CASH-36',
    label: 'Lege sync (mirror): geen bank-transacties → 0 nieuw, 0 dup, cursor ongewijzigd',
    run: () => {
      criterion('WF-CASH-36')
      const parsed: { import_hash: string }[] = []
      const existingHashSet = new Set<string>()
      const newTransactions = parsed.filter((p) => !existingHashSet.has(p.import_hash))
      const insertedCount = newTransactions.length
      const duplicateCount = parsed.length - newTransactions.length
      const tlTransactions: { timestamp: string }[] = []
      let latestDate: string | null = '2026-07-01' // vorige sync_cursor-waarde
      for (const tx of tlTransactions) {
        const txDate = tx.timestamp.split('T')[0]
        if (!latestDate || txDate > latestDate) latestDate = txDate
      }
      return {
        expected: 'insertedCount=0; duplicateCount=0; cursorOngewijzigd=true',
        actual: `insertedCount=${insertedCount}; duplicateCount=${duplicateCount}; cursorOngewijzigd=${latestDate === '2026-07-01'}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-38',
    scenarioId: 'UAT-CASH-38',
    label: 'Tegenpartij-meta-fallback (mapTransaction): merchant_name ontbreekt → meta.counter_party_*',
    run: async () => {
      criterion('WF-CASH-38')
      const rabobankStijl: TLTransaction = {
        transaction_id: 'tx1',
        timestamp: '2026-07-10T00:00:00Z',
        amount: -12.5,
        currency: 'EUR',
        description: 'BETALING',
        transaction_type: 'DEBIT',
        transaction_category: 'PURCHASE',
        merchant_name: '   ', // whitespace-only → telt als "niet gevuld"
        meta: {
          counter_party_preferred_name: 'Jumbo Supermarkten',
          counter_party_iban: 'NL91ABNA0417164300',
        },
      }
      const standaardVeldGevuld: TLTransaction = {
        transaction_id: 'tx2',
        timestamp: '2026-07-11T00:00:00Z',
        amount: -8,
        currency: 'EUR',
        description: 'AH BOODSCHAPPEN',
        transaction_type: 'DEBIT',
        transaction_category: 'PURCHASE',
        merchant_name: 'Albert Heijn',
        meta: { counter_party_preferred_name: 'Andere naam in meta' },
      }
      const fallback = await mapTransaction(rabobankStijl)
      const merchantWint = await mapTransaction(standaardVeldGevuld)
      return {
        expected: 'metaFallbackNaam=Jumbo Supermarkten; metaFallbackIban=NL91ABNA0417164300; merchantNameWintBoven=Albert Heijn',
        actual: `metaFallbackNaam=${fallback.counterparty_name}; metaFallbackIban=${fallback.counterparty_iban}; merchantNameWintBoven=${merchantWint.counterparty_name}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-40',
    scenarioId: 'UAT-CASH-40',
    label: 'Dedup rekening-gescoped (mirror): zelfde hash op twee rekeningen botst niet, binnen één rekening wel',
    run: () => {
      criterion('WF-CASH-40')
      const existing = [{ accountId: 'rekening-A', hash: 'hash-1' }]
      const opAndereRekening = existsInAccount(existing, { accountId: 'rekening-B', hash: 'hash-1' })
      const opZelfdeRekening = existsInAccount(existing, { accountId: 'rekening-A', hash: 'hash-1' })
      return {
        expected: 'verschillendeRekeningBeideNieuw=true; zelfdeRekeningTweedeIsDuplicaat=true',
        actual: `verschillendeRekeningBeideNieuw=${!opAndereRekening}; zelfdeRekeningTweedeIsDuplicaat=${opZelfdeRekening}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-42',
    scenarioId: 'UAT-CASH-42',
    label: 'Eerste ophaal (planInitialFetch): lege rekening → 4 blokken nieuwste-eerst tot 24 mnd, rekening met historie → D−3-venster',
    run: () => {
      criterion('WF-CASH-42')
      const today = '2026-07-29'

      const legeRekening = planInitialFetch({ today, newestExistingDate: null })
      const nieuwsteBlokEerst = legeRekening.blocks.length > 1
        && legeRekening.blocks[0].to === today
        && legeRekening.blocks[legeRekening.blocks.length - 1].from === legeRekening.startDate

      const metHistorie = planInitialFetch({ today, newestExistingDate: '2026-07-20' })
      const vandaagGrens = planInitialFetch({ today, newestExistingDate: today })

      return {
        expected: 'legeRekeningMode=historical; legeRekeningBlokken=4; legeRekeningStartDate=2024-07-29; nieuwsteBlokEerst=true; historieRekeningMode=incremental; historieRekeningStart=2026-07-17; vandaagGrensStart=2026-07-26',
        actual: `legeRekeningMode=${legeRekening.mode}; legeRekeningBlokken=${legeRekening.blocks.length}; legeRekeningStartDate=${legeRekening.startDate}; nieuwsteBlokEerst=${nieuwsteBlokEerst}; historieRekeningMode=${metHistorie.mode}; historieRekeningStart=${metHistorie.startDate}; vandaagGrensStart=${vandaagGrens.startDate}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-46',
    scenarioId: 'UAT-CASH-46',
    label: 'Rekeningtype van de bank (mapAccountType, B3): spaar/zakelijk/creditcard/onbekend',
    run: () => {
      criterion('WF-CASH-46')
      const fmt = (m: ReturnType<typeof mapAccountType>) => `${m.account_type},${m.subtype},${m.is_liquid}`
      return {
        expected: 'transaction=checking,checking,true; savings=savings,savings_account,true; business=business,business,true; creditCard=other,other_cash,false; onbekend=checking,checking,true',
        actual: `transaction=${fmt(mapAccountType('TRANSACTION'))}; savings=${fmt(mapAccountType('SAVINGS'))}; business=${fmt(mapAccountType('BUSINESS_SAVINGS'))}; creditCard=${fmt(mapAccountType('CREDIT_CARD'))}; onbekend=${fmt(mapAccountType('FOO'))}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-48',
    scenarioId: 'UAT-CASH-48',
    label: 'FR5-kiesbaarheid (isSelectableTargetOption) + bezet-melding (occupiedTargetAccountMessage): bezet uitgeschakeld, huidige drager blijft kiesbaar',
    run: () => {
      criterion('WF-CASH-48')
      const bezet = makeTargetOption({ id: 'R', linked_provider_name: 'ING' })
      const vrij = makeTargetOption({ id: 'R2', linked_provider_name: null })
      const bezetNietKiesbaar = isSelectableTargetOption(bezet)
      const vrijKiesbaar = isSelectableTargetOption(vrij)
      const huidigeDragerBlijftKiesbaar = isSelectableTargetOption(bezet, 'R')
      const melding = occupiedTargetAccountMessage('ING')
      return {
        expected: 'bezetNietKiesbaar=false; vrijKiesbaar=true; huidigeDragerBlijftKiesbaar=true; melding=Deze rekening is al gekoppeld aan ING. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.',
        actual: `bezetNietKiesbaar=${bezetNietKiesbaar}; vrijKiesbaar=${vrijKiesbaar}; huidigeDragerBlijftKiesbaar=${huidigeDragerBlijftKiesbaar}; melding=${melding}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-49',
    scenarioId: 'UAT-CASH-49',
    label: 'Bankkoppeling-gezondheid (deriveBankLinkHealth): regelvolgorde is het contract — intentie wint van storing, linked-broken ≠ manual',
    run: () => {
      criterion('WF-CASH-49')
      const now = new Date('2026-07-30T12:00:00.000Z')
      const geenKoppelrij = deriveBankLinkState(null, now)
      const zachtOntkoppeldMaarVerlopen = deriveBankLinkState(
        { linkIsActive: false, connectionStatus: 'expired', tokenExpiresAt: '2026-01-01T00:00:00.000Z', lastSyncedAt: null },
        now,
      )
      const statusKapot = deriveBankLinkState(
        { linkIsActive: true, connectionStatus: 'expired', tokenExpiresAt: '2026-09-01T00:00:00.000Z', lastSyncedAt: null },
        now,
      )
      const tokenVerstreken = deriveBankLinkState(
        { linkIsActive: true, connectionStatus: 'active', tokenExpiresAt: '2026-07-01T00:00:00.000Z', lastSyncedAt: null },
        now,
      )
      const gezond = deriveBankLinkState(
        { linkIsActive: true, connectionStatus: 'active', tokenExpiresAt: '2026-09-01T00:00:00.000Z', lastSyncedAt: null },
        now,
      )
      return {
        expected: 'geenKoppelrij=manual; zachtOntkoppeldMaarVerlopen=manual; statusKapot=linked-broken; tokenVerstreken=linked-broken; gezond=linked',
        actual: `geenKoppelrij=${geenKoppelrij}; zachtOntkoppeldMaarVerlopen=${zachtOntkoppeldMaarVerlopen}; statusKapot=${statusKapot}; tokenVerstreken=${tokenVerstreken}; gezond=${gezond}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-50',
    scenarioId: 'UAT-CASH-50',
    label: 'Saldo via het herwaarderingspad (isSameBalance-poort + notitie-rondtrip): ongewijzigd saldo schrijft niets, de compensatie leest zichzelf niet als banksync',
    run: () => {
      criterion('WF-CASH-50')
      const ongewijzigd = isSameBalance(2543.67, 2543.67)
      const centTolerantie = isSameBalance(2543.6700000000001, 2543.67)
      const gewijzigd = isSameBalance(2543.67, 2600)
      const rondtrip = parseBankSyncPrevious(formatBankSyncNote(2543.67))
      const correctieNietAlsBanksyncGelezen = parseBankSyncPrevious(formatBankSyncCorrectionNote(2600))
      return {
        expected: 'ongewijzigd=true; centTolerantie=true; gewijzigd=false; rondtrip=2543.67; correctieNietAlsBanksyncGelezen=null',
        actual: `ongewijzigd=${ongewijzigd}; centTolerantie=${centTolerantie}; gewijzigd=${gewijzigd}; rondtrip=${rondtrip}; correctieNietAlsBanksyncGelezen=${correctieNietAlsBanksyncGelezen}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-51',
    scenarioId: 'UAT-CASH-51',
    label: 'Cashflow-landingskaarten (buildCashflowCards): Budget-KPI = resterend (niet plafond), Transacties-KPI = gerealiseerde maand (niet effective)',
    run: () => {
      criterion('WF-CASH-51')
      // Échte productiefunctie op literaire invoer — geen mirror. Budget:
      // plafond €3.950, al €4.200 besteed → resterend moet NEGATIEF zijn, niet
      // het plafond. Transacties: EFFECTIVE (monthlyIncome/Expenses) bewust
      // anders dan de GEREALISEERDE huidige maand, om te bewijzen dat de kaart
      // de laatste gebruikt (ADR 0073).
      const dashboardData: DashboardData = {
        ...MOCK_DASHBOARD_DATA,
        budgetingActive: true,
        budgetTotals: {
          ...MOCK_DASHBOARD_DATA.budgetTotals,
          expense: { limit: 3950, spent: 4200 },
        },
        monthlyIncome: 6000,
        monthlyExpenses: 2000,
        currentMonthIncome: 3000,
        currentMonthExpenses: 3500,
      }
      const cashflow: CashflowData = {
        monthLabel: undefined,
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
      const vasteLastenSummary: VasteLastenSummary = {
        subscriptions: [],
        vasteKosten: [],
        totalMonthlySubscriptions: 0,
        totalMonthlyVasteKosten: 0,
        totalMonthly: 0,
        count: 0,
      }
      const cards = buildCashflowCards(dashboardData, cashflow, vasteLastenSummary)
      const budget = cards.find((c) => c.key === 'budget')
      const transacties = cards.find((c) => c.key === 'transacties')
      return {
        expected: `budgetKpi=${formatCurrency(-250)}; transKpi=${formatCurrency(-500)}`,
        actual: `budgetKpi=${budget?.kpi}; transKpi=${transacties?.kpi}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-53',
    scenarioId: 'UAT-CASH-53',
    label: 'Grenzenpot-motor (engine.ts): kwartaal/jaar-containment, isNearLimit-guards, streaks, trend-randgevallen, refund-flip, tegenpartij-parity — allemaal op synthetische invoer, geen mirror',
    run: () => {
      criterion('WF-CASH-53')

      // De motor rekent sinds 10-08-2026 op een BUCKETDATUM in plaats van een
      // maandsleutel (dag/week-grenzen zijn niet uit een maandsom af te leiden).
      // Een maand-bucket is de eerste van die maand — dezelfde omzetting die
      // `sliceContainsMonth` doet.
      const agg = (month: string, sumNegatief: number, sumPositief = 0): SpendLimitAggregateRow => ({
        bucketStart: `${month}-01`,
        transactionType: null,
        sumPositief,
        sumNegatief,
        count: 1,
      })

      // (a) Kwartaal- en jaar-containment: de buurperiode net erbuiten telt niet mee.
      const now = new Date(2026, 7, 15) // 15 aug 2026 — binnen Q3 2026
      const [quarterSlice] = resolveSpendLimitPeriods('quarter', now, 1)
      const quarterOutcome = computePeriodOutcome(
        quarterSlice,
        [agg('2026-06', -1000), agg('2026-07', -300), agg('2026-08', -250), agg('2026-09', -200)],
        900,
      )
      const [yearSlice] = resolveSpendLimitPeriods('year', now, 1)
      const yearRows: SpendLimitAggregateRow[] = [agg('2025-12', -5000)]
      for (let m = 1; m <= 12; m++) yearRows.push(agg(`2026-${String(m).padStart(2, '0')}`, -100))
      const yearOutcome = computePeriodOutcome(yearSlice, yearRows, 5000)

      // (b) isNearLimit-guards: een nulgrens meldt nooit "bijna over", en
      // 'exceeded' sluit 'near' altijd uit, ongeacht het percentage.
      const zeroLimitOutcome = computePeriodOutcome(
        { periodKey: 'z', label: 'z', since: '2026-01-01', until: '2026-01-31', isOpen: false },
        [],
        0,
      )
      const exceededOutcome = computePeriodOutcome(
        { periodKey: 'e', label: 'e', since: '2026-01-01', until: '2026-01-31', isOpen: false },
        [agg('2026-01', -100)],
        50,
      )

      // (c) Streaks: de lopende periode telt niet mee; een enkele overschrijding
      // breekt de reeks, de reeks daarna telt opnieuw op vanaf 0.
      const mk = (periodKey: string, month: string, negatief: number, limit: number): SpendLimitPeriodOutcome =>
        computePeriodOutcome({ periodKey, label: periodKey, since: `${month}-01`, until: `${month}-28`, isOpen: false }, [agg(month, negatief)], limit)
      const closedPeriods = [
        mk('p1', '2020-01', -50, 100),
        mk('p2', '2020-02', -80, 100),
        mk('p3', '2020-03', -150, 100),
        mk('p4', '2020-04', -10, 100),
        mk('p5', '2020-05', -20, 100),
        mk('p6', '2020-06', -30, 100),
      ]
      const streaks = computeStreaks(closedPeriods)

      // (d) Trend-randgevallen (geen NaN, geen "Infinity%"): < 3 afgesloten →
      // recent=null; < 6 afgesloten → prior=null (los van elkaar getoetst);
      // prior=0 & recent=0 → stable/0; prior=0 & recent>0 → worsening/null;
      // |wijziging| < 5% → stable, ondanks een niet-nul verschil.
      const mkFlat = (key: string, matched: number): SpendLimitPeriodOutcome =>
        computePeriodOutcome({ periodKey: key, label: key, since: '2021-01-01', until: '2021-01-31', isOpen: false }, [agg('2021-01', -matched)], 1_000_000)
      const trendTooFewClosed = computeSpendLimitTrend([mkFlat('t1', 100), mkFlat('t2', 100)])
      const trendUnder6Closed = computeSpendLimitTrend([mkFlat('t1', 100), mkFlat('t2', 100), mkFlat('t3', 100), mkFlat('t4', 100)])
      const trendStableZero = computeSpendLimitTrend([
        mkFlat('u1', 0), mkFlat('u2', 0), mkFlat('u3', 0),
        mkFlat('u4', 0), mkFlat('u5', 0), mkFlat('u6', 0),
      ])
      const trendWorseningFromZero = computeSpendLimitTrend([
        mkFlat('v1', 0), mkFlat('v2', 0), mkFlat('v3', 0),
        mkFlat('v4', 100), mkFlat('v5', 100), mkFlat('v6', 100),
      ])
      const trendStableSmallChange = computeSpendLimitTrend([
        mkFlat('w1', 1000), mkFlat('w2', 1000), mkFlat('w3', 1000),
        mkFlat('w4', 970), mkFlat('w5', 970), mkFlat('w6', 970),
      ])
      const trendImproving = computeSpendLimitTrend([
        mkFlat('x1', 1000), mkFlat('x2', 1000), mkFlat('x3', 1000),
        mkFlat('x4', 800), mkFlat('x5', 800), mkFlat('x6', 800),
      ])

      // (e) Refund-flip: dezelfde periode, met een refund erbij, klapt retroactief
      // van 'exceeded' naar 'within' — er wordt niets opgeslagen, alleen herrekend.
      const beforeRefund = computePeriodOutcome(
        { periodKey: 'r', label: 'r', since: '2026-01-01', until: '2026-01-31', isOpen: false },
        [agg('2026-01', -120)],
        100,
      )
      const afterRefund = computePeriodOutcome(
        { periodKey: 'r', label: 'r', since: '2026-01-01', until: '2026-01-31', isOpen: false },
        [agg('2026-01', -120), agg('2026-01', 0, 40)],
        100,
      )

      // (g) DAG- EN WEEKGRENZEN (ADR 0097). De motor rekent op een BUCKETDATUM,
      // en `SPEND_LIMIT_GRAIN_BY_PERIOD` garandeert dat een bucket nooit over een
      // periodegrens ligt. Twee dingen worden hier vastgepind:
      //   * een dagperiode telt uitsluitend díé dag — de dag ervoor niet;
      //   * een weekperiode loopt van maandag t/m zondag, en de ISO-weeksleutel
      //     draagt het ISO-JAAR (de week van 29 dec 2025 heet 2026-W01, want de
      //     donderdag valt in 2026). Een kale getFullYear() op de maandag zou
      //     daar '2025-W01' van maken.
      const dagNu = new Date(2026, 7, 10) // maandag 10 augustus 2026
      const [dagGisteren, dagVandaag] = resolveSpendLimitPeriods('day', dagNu, 2)
      const dagRijen = [
        { bucketStart: '2026-08-09', transactionType: null, sumPositief: 0, sumNegatief: -30, count: 1 },
        { bucketStart: '2026-08-10', transactionType: null, sumPositief: 0, sumNegatief: -12, count: 1 },
      ]
      const dagOutcomeGisteren = computePeriodOutcome(dagGisteren, dagRijen, 20)
      const dagOutcomeVandaag = computePeriodOutcome(dagVandaag, dagRijen, 20)

      const [weekHuidig] = resolveSpendLimitPeriods('week', new Date(2026, 7, 13), 1)
      const [weekJaargrens] = resolveSpendLimitPeriods('week', new Date(2025, 11, 31), 1)

      // (f) Tegenpartij-parity-helpers (spiegel van public.spend_limit_counterparty_key).
      const key = spendLimitCounterpartyKey('Shell Amsterdam #57')
      const matchesShell = counterpartyMatchesKey('Shell Amsterdam #57', 'SHELL')
      const matchesBol = counterpartyMatchesKey('Bol.com', 'SHELL')
      const emptyKeyNeverMatches = counterpartyMatchesKey('Shell Amsterdam #57', '')

      return {
        expected:
          'quarterMatched=750; quarterNear=true; quarterHeadroom=150; quarterTxCount=3; ' +
          'yearMatched=1200; yearNear=false; yearTxCount=12; ' +
          'zeroLimitNear=false; zeroLimitStatus=within; exceededNear=false; exceededStatus=exceeded; ' +
          'currentStreak=3; longestStreak=3; exceededPeriodCount=1; closedPeriodCount=6; lastWithin=p6; ' +
          'tooFewRecent=null; tooFewDirection=unknown; ' +
          'under6Recent=100; under6Prior=null; under6Direction=unknown; ' +
          'stableZeroDirection=stable; stableZeroPct=0; ' +
          'worseningFromZeroDirection=worsening; worseningFromZeroPct=null; ' +
          'stableSmallChangeDirection=stable; ' +
          'improvingDirection=improving; ' +
          'refundFlip: exceeded→within; ' +
          'dagGisteren=30/exceeded; dagVandaag=12/within; ' +
          'week=2026-08-10..2026-08-16; weekJaargrensKey=2026-W01; ' +
          'key=SHELLAMSTERDAM57; matchesShell=true; matchesBol=false; emptyKeyNeverMatches=false',
        actual:
          `quarterMatched=${quarterOutcome.periodMatchedAmount}; quarterNear=${quarterOutcome.isNearLimit}; quarterHeadroom=${quarterOutcome.periodHeadroom}; quarterTxCount=${quarterOutcome.matchedTransactionCount}; ` +
          `yearMatched=${yearOutcome.periodMatchedAmount}; yearNear=${yearOutcome.isNearLimit}; yearTxCount=${yearOutcome.matchedTransactionCount}; ` +
          `zeroLimitNear=${zeroLimitOutcome.isNearLimit}; zeroLimitStatus=${zeroLimitOutcome.status}; exceededNear=${exceededOutcome.isNearLimit}; exceededStatus=${exceededOutcome.status}; ` +
          `currentStreak=${streaks.currentStreak}; longestStreak=${streaks.longestStreak}; exceededPeriodCount=${streaks.exceededPeriodCount}; closedPeriodCount=${streaks.closedPeriodCount}; lastWithin=${streaks.lastWithinPeriodKey}; ` +
          `tooFewRecent=${trendTooFewClosed.recentAvgMatchedAmount}; tooFewDirection=${trendTooFewClosed.direction}; ` +
          `under6Recent=${trendUnder6Closed.recentAvgMatchedAmount}; under6Prior=${trendUnder6Closed.priorAvgMatchedAmount}; under6Direction=${trendUnder6Closed.direction}; ` +
          `stableZeroDirection=${trendStableZero.direction}; stableZeroPct=${trendStableZero.avgMatchedAmountChangePct}; ` +
          `worseningFromZeroDirection=${trendWorseningFromZero.direction}; worseningFromZeroPct=${trendWorseningFromZero.avgMatchedAmountChangePct}; ` +
          `stableSmallChangeDirection=${trendStableSmallChange.direction}; ` +
          `improvingDirection=${trendImproving.direction}; ` +
          `refundFlip: ${beforeRefund.status}→${afterRefund.status}; ` +
          `dagGisteren=${dagOutcomeGisteren.periodMatchedAmount}/${dagOutcomeGisteren.status}; ` +
          `dagVandaag=${dagOutcomeVandaag.periodMatchedAmount}/${dagOutcomeVandaag.status}; ` +
          `week=${weekHuidig.since}..${weekHuidig.until}; weekJaargrensKey=${weekJaargrens.periodKey}; ` +
          `key=${key}; matchesShell=${matchesShell}; matchesBol=${matchesBol}; emptyKeyNeverMatches=${emptyKeyNeverMatches}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-55',
    scenarioId: 'UAT-CASH-55',
    label: 'Bulkbewerken — geen datumvenster op een leeg criterium, kopcheckbox = pagina, "alle N"-affordance, criteriaKey-wissel, impact-net (AC1–AC5)',
    run: () => {
      criterion('WF-CASH-55')

      // AC1: een leeg criterium zet géén enkel datumfilter — de zoekopdracht
      // reikt zonder venster over de hele historie (ADR: geen resolveFetchWindow).
      const fake = makeFakeFilterBuilder()
      applyTransactionSearchCriteria(fake.builder, {}, 'user-1')
      const geenDatumfilterOpLeegCriterium =
        !fake.calls.some((c) => c.startsWith('gte:date') || c.startsWith('lte:date')) &&
        fake.calls.includes('eq:user_id')

      // AC2/AC3: 50 zichtbare rijen van 340 treffers.
      const pageIds = Array.from({ length: 50 }, (_, i) => `tx-${i}`)
      const volleSelectie = togglePage(EMPTY_SELECTION, pageIds)
      const headerStateVolledigePagina = headerState(volleSelectie, pageIds)
      const selectAllAffordance = shouldOfferSelectAll(volleSelectie, pageIds, 340)
      const selectionCountExpliciet = selectionCount(volleSelectie, 340)
      const alleNSelectie = selectAllMatching()
      const selectionCountAlleN = selectionCount(alleNSelectie, 340)

      // AC4: de identiteitssleutel verandert zodra de zoekterm wijzigt.
      const sleutelLeeg = criteriaKey({})
      const sleutelMetZoekterm = criteriaKey({ q: 'Notaris' })
      const criteriaKeyVerandertBijZoekterm = sleutelLeeg !== sleutelMetZoekterm

      // AC5: 12 transacties, netto −€1.240 (uitgaven-overschot).
      const impactNetBedrag = bulkImpactNet(0, -1240)

      return {
        expected:
          'geenDatumfilterOpLeegCriterium=true; headerStateVolledigePagina=full; selectAllAffordance=true; selectionCountExpliciet=50; selectionCountAlleN=340; criteriaKeyVerandertBijZoekterm=true; impactNetBedrag=-1240',
        actual:
          `geenDatumfilterOpLeegCriterium=${geenDatumfilterOpLeegCriterium}; headerStateVolledigePagina=${headerStateVolledigePagina}; selectAllAffordance=${selectAllAffordance}; selectionCountExpliciet=${selectionCountExpliciet}; selectionCountAlleN=${selectionCountAlleN}; criteriaKeyVerandertBijZoekterm=${criteriaKeyVerandertBijZoekterm}; impactNetBedrag=${impactNetBedrag}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-56',
    scenarioId: 'UAT-CASH-56',
    label: 'Bulkbewerken — canoniek trio (transferMarkingFor) en split-uitsluiting (planBulkBudgetUpdate) (AC6–AC8)',
    run: () => {
      criterion('WF-CASH-56')

      // AC7: naar "Eigen rekening" schrijft altijd het volledige trio.
      const eigenRekeningTrioObj = transferMarkingFor({ targetsEigenRekening: true, currentType: null })
      const eigenRekeningTrio = `${eigenRekeningTrioObj.category_source}+${eigenRekeningTrioObj.transaction_type}`

      // AC8: was een verschuiving, gaat naar een gewoon budget → markering wist.
      const wasVerschuivingObj = transferMarkingFor({ targetsEigenRekening: false, currentType: 'transfer' })
      const wasVerschuivingNaarGewoon = `${wasVerschuivingObj.category_source}+transactionTypeNull=${wasVerschuivingObj.transaction_type === null}`

      // AC8: was GEEN verschuiving → de sleutel transaction_type ontbreekt helemaal
      // (geen blanket-null die importherkomst als 'DEBIT' zou overschrijven).
      const wasGeenVerschuivingObj = transferMarkingFor({ targetsEigenRekening: false, currentType: 'DEBIT' })
      const wasGeenVerschuivingNaarGewoon = `${wasGeenVerschuivingObj.category_source}+geenTransactionTypeSleutel=${!('transaction_type' in wasGeenVerschuivingObj)}`

      // AC6: 1.500 niet-gesplitste kandidaten belanden allemaal in een schrijfgroep.
      const candidates1500: BulkCandidateRow[] = Array.from({ length: 1500 }, (_, i) =>
        makeBulkCandidate({ id: `tx-${i}`, transaction_type: i < 3 ? 'transfer' : null }))
      const plan1500 = planBulkBudgetUpdate({
        requestedIds: candidates1500.map((c) => c.id),
        candidates: candidates1500,
        budgetId: 'budget-boodschappen',
        targetsEigenRekening: false,
      })
      const planTotaalCandidates1500 = plan1500.groups.reduce((s, g) => s + g.ids.length, 0)
      const planSkipped1500 = plan1500.skipped.length

      // Randgeval: een split in de selectie wordt geskipt, nooit stil meegenomen.
      const metSplit: BulkCandidateRow[] = [
        makeBulkCandidate({ id: 'split-1', is_split: true }),
        makeBulkCandidate({ id: 'gewoon-1' }),
      ]
      const planMetSplit = planBulkBudgetUpdate({
        requestedIds: metSplit.map((c) => c.id),
        candidates: metSplit,
        budgetId: 'budget-boodschappen',
        targetsEigenRekening: false,
      })
      const splitWordtGeskiptMetReden = planMetSplit.skipped[0]?.reason ?? 'GEEN_SKIP'

      return {
        expected:
          'eigenRekeningTrio=transfer+transfer; wasVerschuivingNaarGewoon=manual+transactionTypeNull=true; wasGeenVerschuivingNaarGewoon=manual+geenTransactionTypeSleutel=true; planTotaalCandidates1500=1500; planSkipped1500=0; splitWordtGeskiptMetReden=is_split',
        actual:
          `eigenRekeningTrio=${eigenRekeningTrio}; wasVerschuivingNaarGewoon=${wasVerschuivingNaarGewoon}; wasGeenVerschuivingNaarGewoon=${wasGeenVerschuivingNaarGewoon}; planTotaalCandidates1500=${planTotaalCandidates1500}; planSkipped1500=${planSkipped1500}; splitWordtGeskiptMetReden=${splitWordtGeskiptMetReden}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-57',
    scenarioId: 'UAT-CASH-57',
    label: 'Bulkbewerken — verwijder-bevestiging: type-to-confirm-poort en herimport-waarschuwing (mirror) (AC9–AC10)',
    run: () => {
      criterion('WF-CASH-57')

      // AC9: 43 (>25) transacties, geen tegenboekingen.
      const bij43Leeg = deleteConfirmState(43, 0, true, '')
      const bij43JuisteGetal = deleteConfirmState(43, 0, true, '43')
      const bij43VerkeerdGetal = deleteConfirmState(43, 0, true, '42')

      // AC10: bankLinkedCount > 0 triggert de waarschuwing, 0 niet (zelfde
      // conditionele render als bulk-bevestigingen.tsx:310 `bankLinkedCount > 0`).
      const waarschuwingBij5BankLinked = 5 > 0
      const geenWaarschuwingBij0 = 0 > 0

      return {
        expected:
          'needsTypingBij43=true; labelBij43=Verwijder 43 transacties; typedOkLeeg=false; typedOkJuisteGetal=true; typedOkVerkeerdGetal=false; waarschuwingBij5BankLinked=true; geenWaarschuwingBij0=false',
        actual:
          `needsTypingBij43=${bij43Leeg.needsTyping}; labelBij43=${bij43Leeg.label}; typedOkLeeg=${bij43Leeg.typedOk}; typedOkJuisteGetal=${bij43JuisteGetal.typedOk}; typedOkVerkeerdGetal=${bij43VerkeerdGetal.typedOk}; waarschuwingBij5BankLinked=${waarschuwingBij5BankLinked}; geenWaarschuwingBij0=${geenWaarschuwingBij0}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-60',
    scenarioId: 'UAT-CASH-60',
    label:
      'Grondslagkeuze (ADR 0103): resolveAmountWithBasis-precedentie (manual > budget > transactie > profiel, met de bewuste budget-overslag op \'transaction\') + de spaarquote die de grondslag volgt',
    run: () => {
      criterion('WF-CASH-60')

      // Drie bronnen die BEWUST uiteenlopen, zodat elke tak een eigen cijfer geeft.
      const PROFIEL = 2000
      const TRANSACTIE = 3000
      const BUDGET = 3600

      const auto = resolveAmountWithBasis('auto', PROFIEL, TRANSACTIE, BUDGET)
      const transactie = resolveAmountWithBasis('transaction', PROFIEL, TRANSACTIE, BUDGET)
      const manual = resolveAmountWithBasis('manual', PROFIEL, TRANSACTIE, BUDGET)
      const terugval = resolveAmountWithBasis('auto', PROFIEL, 0, 0)

      // De spaarquote VOLGT de grondslag. Budgetgrondslag: uniforme (I − E) / I
      // op de effectieve bedragen, zónder spaarbudget-/aflossingscorrectie.
      const opBudget = resolveSavingsSource({
        incomeSource: 'auto',
        expensesSource: 'auto',
        netMonthlyIncome: PROFIEL,
        estimatedMonthlyExpenses: 2700,
        estimatedAnnualIncome: PROFIEL * 12,
        savingsRate6m: 31,
        basis: {
          income: 'budget',
          expenses: 'budget',
          annualIncome: BUDGET * 12,
          monthlyExpenses: 2700,
        },
      })
      // Beide op 'transaction' → savingsRate6m blijft ongewijzigd de uitkomst.
      const opTransactie = resolveSavingsSource({
        incomeSource: 'auto',
        expensesSource: 'auto',
        netMonthlyIncome: PROFIEL,
        estimatedMonthlyExpenses: 2700,
        estimatedAnnualIncome: PROFIEL * 12,
        savingsRate6m: 31,
        basis: {
          income: 'transaction',
          expenses: 'transaction',
          annualIncome: TRANSACTIE * 12,
          monthlyExpenses: 2700,
        },
      })

      return {
        expected:
          'autoBudget=3600/budget; transactieSlaatBudgetOver=3000/transaction; manualWint=2000/manual; terugvalProfiel=2000/profile; quoteBudgetgrondslag=25; quoteBeideTransactie=31',
        actual:
          `autoBudget=${auto.amount}/${auto.basis}; transactieSlaatBudgetOver=${transactie.amount}/${transactie.basis}; manualWint=${manual.amount}/${manual.basis}; terugvalProfiel=${terugval.amount}/${terugval.basis}; quoteBudgetgrondslag=${opBudget.effectiveSavingsRatePct}; quoteBeideTransactie=${opTransactie.effectiveSavingsRatePct}`,
      }
    },
  },
  {
    workflow: 'WF-CASH-61',
    scenarioId: 'UAT-CASH-61',
    label:
      'Grenzenpot-reeksscore (computeSpendLimitScore): 70% trefpercentage + 30% reeks ± 10 trendbonus, geklemd op [0,100]; onder 3 meetellende periodes geen cijfer',
    run: () => {
      criterion('WF-CASH-61')

      const LIMIET = 500
      /** Eén afgesloten maandperiode met een vast bedrag — geen jitter. */
      const periode = (maand: number, bedrag: number): SpendLimitPeriodOutcome => {
        const mm = String(maand).padStart(2, '0')
        const laatsteDag = new Date(Date.UTC(2026, maand, 0)).getUTCDate()
        const over = Math.max(0, bedrag - LIMIET)
        return {
          periodKey: `2026-${mm}`,
          label: `2026-${mm}`,
          since: `2026-${mm}-01`,
          until: `2026-${mm}-${String(laatsteDag).padStart(2, '0')}`,
          isOpen: false,
          periodMatchedAmount: bedrag,
          limitAmount: LIMIET,
          periodOverAmount: over,
          periodHeadroom: Math.max(0, LIMIET - bedrag),
          status: over > 0 ? 'exceeded' : 'within',
          isNearLimit: false,
          matchedTransactionCount: 1,
          matchedCounterpartyNames: [],
        }
      }

      // (a) alles binnen de grens én dalend → volle score, geklemd op 100.
      const goed = [400, 400, 400, 300, 300, 300].map((b, i) => periode(i + 1, b))
      const scoreGoed = computeSpendLimitScore(goed, computeSpendLimitTrend(goed), null)

      // (b) alles boven de grens, vlak → reeks 0, geen bonus.
      const slecht = [900, 900, 900, 900, 900, 900].map((b, i) => periode(i + 1, b))
      const scoreSlecht = computeSpendLimitScore(slecht, computeSpendLimitTrend(slecht), null)

      // (c) onder de ondergrens van SPEND_LIMIT_SCORE_MIN_PERIODS (3).
      const teWeinig = goed.slice(0, 2)
      const scoreTeWeinig = computeSpendLimitScore(teWeinig, computeSpendLimitTrend(teWeinig), null)

      return {
        expected:
          'scoreGoed=100; labelGoed=strak; hitRateGoed=100; basisGoed=6; scoreSlecht=0; labelSlecht=los; scoreTeWeinig=null; labelTeWeinig=null; basisTeWeinig=2',
        actual:
          `scoreGoed=${scoreGoed.score}; labelGoed=${scoreGoed.label}; hitRateGoed=${scoreGoed.hitRatePct}; basisGoed=${scoreGoed.basisPeriodCount}; scoreSlecht=${scoreSlecht.score}; labelSlecht=${scoreSlecht.label}; scoreTeWeinig=${scoreTeWeinig.score}; labelTeWeinig=${scoreTeWeinig.label}; basisTeWeinig=${scoreTeWeinig.basisPeriodCount}`,
      }
    },
  },
]
