// lib/cashflow-cards.ts
// Bouwt de vier hefboom-stijl kaarten voor de cashflow-landingspagina
// (/overzicht/cashflow): Budget, Transacties, Vaste lasten, Forecast. Elke
// kaart krijgt een status, een KPI en uitklap-detail — afgeleid uit data die de
// pagina toch al laadt (CashflowCardScalars + CashflowData + de vaste-lasten-
// samenvatting). Pure module zodat de server-page hem kan aanroepen; de client
// rendert de serialiseerbare output.

import type { CashflowCardScalars } from '@/lib/cashflow-kpis'
import type { CashflowData } from '@/lib/cashflow-data-loader'
import type { VasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { buildForecast } from '@/lib/cashflow-forecast-math'
import { pillarStatus, type LeverageStatus } from '@/lib/leverage-status'
import { formatCurrency } from '@/lib/format'

export type CashflowCardKey = 'budget' | 'transacties' | 'vaste-lasten' | 'forecast'

/**
 * De vier kaartstatussen als platte payload — het wire-contract van
 * `GET /api/overzicht/cashflow-status` én van de server-seed op de hub, en
 * daarmee van de sidebar-status-dots (`useCashflowStatusContext`). Woont hier
 * omdat dit de module is die de statussen produceert; route, TTL-cache, seed en
 * sidebar consumeren allemaal DEZE vorm.
 */
export interface CashflowCardStatuses {
  budget: LeverageStatus
  transacties: LeverageStatus
  vasteLasten: LeverageStatus
  forecast: LeverageStatus
}

export interface CashflowCard {
  key: CashflowCardKey
  label: string
  href: string
  tooltip: string
  /** Hoofdcijfer (al geformatteerd), of null wanneer er geen data is. */
  kpi: string | null
  status: LeverageStatus
  subText: string | null
  /**
   * VENSTER-LABEL onder de KPI (CF-3) — de grondslag van het hoofdcijfer in
   * gewone taal, bv. "in augustus tot nu toe". `null` = het cijfer draagt zijn
   * venster al (vaste lasten: "/mnd") of er ís geen cijfer.
   *
   * Rendert in de `subAmount`-slot van `LeverageCard` — dezelfde gedempte
   * 11px-regel waarin de hefbomen-rij op /overzicht haar grondslag ("excl.
   * eigen woning · €X") kwijt kan. Het is bewust GEEN tweede statusregel:
   * `subText` blijft het oordeel, dit is de meetlat eronder.
   */
  kpiWindow: string | null
  /** Uitklap-detail: secundaire waarde + 1-regel inzicht + deeplink-label. */
  detail: { label: string; value: string; tip: string; actionLabel: string }
}

/**
 * Projecteer de vier kaarten op hun statussen — de ENIGE plek waar
 * `CashflowCard[]` in `CashflowCardStatuses` wordt omgezet.
 *
 * Twee oppervlakken consumeren deze projectie op exact dezelfde kaart-array: de
 * API-route (`GET /api/overzicht/cashflow-status`, voor de sidebar-dots op de
 * sub-pagina's) en de server-seed op de cashflow-hub
 * (`components/overview/cashflow-cards-loader.tsx`). Zo kan een dot per
 * constructie niet van zijn kaart afwijken: dezelfde `buildCashflowCards`-
 * uitkomst, dezelfde projectie, geen tweede sleutel-mapping die kan wegdrijven.
 */
export function cashflowCardStatuses(cards: CashflowCard[]): CashflowCardStatuses {
  const byKey = (k: CashflowCardKey): LeverageStatus =>
    cards.find((c) => c.key === k)?.status ?? 'neutral'
  return {
    budget: byKey('budget'),
    transacties: byKey('transacties'),
    vasteLasten: byKey('vaste-lasten'),
    forecast: byKey('forecast'),
  }
}

const BASE = '/overzicht/cashflow'

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
}

/**
 * Het venster-label van de GEREALISEERDE huidige kalendermaand: "augustus tot
 * nu toe" (CF-3 uit docs/eenvoudige-weergave-audit.md).
 *
 * ── WAT HET CIJFER WERKELIJK IS (geverifieerd in de loader, niet aangenomen) ──
 * `loadCashflowKpis` (lib/cashflow-kpis.ts) vult `currentMonthIncome` /
 * `currentMonthExpenses` met `aggIncomeByMonth` / `aggExpenseByMonthAbs` over
 * `tx_month_aggregate`, opgezocht op ÉÉN sleutel: `currentMonthKey(now)`. Dat is
 * de kalendermaand waarin `now` valt — dus de som over `[de 1e, de 1e van de
 * volgende maand)`, transfers eruit (`realOnly: true`). De budget-`spent` loopt
 * via `getCurrentMonthTx` (lib/server-data/base.ts) en gebruikt met
 * `localMonthBounds` exact dezelfde grenzen.
 *
 * Daarom is "tot nu toe" de eerlijke lezing en niet een mooiere formulering van
 * "deze maand": de maand loopt nog, het getal groeit tot de 1e. Precies dat
 * onderscheidt het van de 30-DAGEN-cijfers op /overzicht/cashflow/transacties —
 * dezelfde verwarring die ADR 0073 vastlegde, hier in de copy afgevangen in
 * plaats van in de grondslag.
 *
 * `now` is een parameter en géén interne `new Date()`, zodat het label
 * deterministisch te testen is naast de cijfers die het beschrijft.
 */
export function currentMonthWindowLabel(now: Date): string {
  const month = new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(now)
  return `${month} tot nu toe`
}

// ── Pure status-helpers (SINGLE SOURCE) ───────────────────────────────────
//
// De vier cashflow-kaartstatussen als kleine pure functies, zodat ZOWEL
// `buildCashflowCards` (de kaarten) ALS de sidebar-status-dots (via
// /api/overzicht/cashflow-status → buildCashflowCards) exact dezelfde
// LeverageStatus produceren. Geen gedupliceerde drempels meer.

/** Budget: budgetdekkings-score (pillarStatus) wanneer een budget actief is. */
export function budgetCardStatus(input: {
  budgetingActive: boolean
  expenseLimit: number
  budgetScore: number
}): LeverageStatus {
  const active = input.budgetingActive && input.expenseLimit > 0
  return active ? pillarStatus(input.budgetScore) : 'neutral'
}

/**
 * Transacties: maand-spaarquote (netto/inkomen). ≥20% good, ≥0% warn, <0 bad.
 *
 * De parameternamen benoemen de grondslag met opzet: dit draait op de
 * GEREALISEERDE huidige kalendermaand (`DashboardData.currentMonthIncome/
 * currentMonthExpenses`), niet op het effective `monthlyIncome/monthlyExpenses`
 * — dat laatste is bij `income_source = 'manual'` een profielinschatting.
 */
export function transactiesCardStatus(input: {
  currentMonthIncome: number
  currentMonthExpenses: number
}): LeverageStatus {
  const { currentMonthIncome, currentMonthExpenses } = input
  const monthlyNet = currentMonthIncome - currentMonthExpenses
  const hasTx = currentMonthIncome > 0 || currentMonthExpenses > 0
  const rate = currentMonthIncome > 0 ? (monthlyNet / currentMonthIncome) * 100 : null
  if (!hasTx || rate == null) return 'neutral'
  return rate >= 20 ? 'good' : rate >= 0 ? 'warn' : 'bad'
}

/**
 * Vaste-lasten-aandeeldrempels (fractie van maandinkomen).
 *
 * Gedeeld tussen `vasteLastenCardStatus` (de statussemantiek) én de
 * vaste-lasten-quote-meter op /overzicht/cashflow/vaste-lasten, zodat de
 * meter-zones EXACT samenvallen met de statusgrenzen — geen losse getallen in
 * de UI, geen drift. Grondslag: Nibud-richtlijn (≤ ~50% van je netto-inkomen
 * aan vaste lasten is gezond; boven ~70% wordt het risicovol).
 *
 *   aandeel < VASTE_LASTEN_GOOD_MAX  → good  (gezond)
 *   aandeel ≤ VASTE_LASTEN_WARN_MAX  → warn  (aandacht)
 *   anders                           → bad   (risico)
 */
export const VASTE_LASTEN_GOOD_MAX = 0.5
export const VASTE_LASTEN_WARN_MAX = 0.7

/** Vaste lasten: aandeel van inkomen. <50% good, ≤70% warn, anders bad. */
export function vasteLastenCardStatus(input: {
  totalMonthly: number
  count: number
  monthlyIncome: number
}): LeverageStatus {
  const hasVaste = input.count > 0
  const ratio = input.monthlyIncome > 0 ? input.totalMonthly / input.monthlyIncome : null
  if (!hasVaste || ratio == null) return 'neutral'
  return ratio < VASTE_LASTEN_GOOD_MAX ? 'good' : ratio <= VASTE_LASTEN_WARN_MAX ? 'warn' : 'bad'
}

/** Forecast: netto per maand. >0 good, <0 bad, ==0 warn; geen forecast → neutral. */
export function forecastCardStatus(input: {
  netPerMonth: number
  hasForecast: boolean
}): LeverageStatus {
  if (!input.hasForecast) return 'neutral'
  return input.netPerMonth > 0 ? 'good' : input.netPerMonth < 0 ? 'bad' : 'warn'
}

/**
 * De eerste parameter is bewust `CashflowCardScalars` (lib/cashflow-kpis.ts) en
 * niet de volledige `DashboardData`: dit zijn exact de zeven scalars die de
 * kaarten lezen. `DashboardData` is er structureel aan toewijsbaar, dus elke
 * bestaande callsite die de volle bundel doorgeeft blijft ongewijzigd werken —
 * terwijl een oppervlak dat alleen de kaarten nodig heeft de slanke
 * `loadCashflowKpis` kan voeden i.p.v. de hele dashboard-loader (ADR 0083).
 *
 * `now` is optioneel en defaultt op `new Date()` — exact de waarde die de
 * forecast hier altijd al zelf bemonsterde. Hij is naar de signatuur getild
 * zodat de forecast én het venster-label van CF-3 op DEZELFDE klok draaien en
 * een test beide deterministisch kan pinnen. Bestaande callsites (de hub-loader
 * en /api/overzicht/cashflow-status) blijven ongewijzigd werken.
 */
export function buildCashflowCards(
  kpis: CashflowCardScalars,
  cashflow: CashflowData,
  vasteLastenSummary: VasteLastenSummary,
  now: Date = new Date(),
): CashflowCard[] {
  // Venster-label voor de maandcijfers (CF-3) — zie `currentMonthWindowLabel`
  // voor de verificatie van wat `currentMonth*` en de budget-`spent` werkelijk
  // meten.
  const monthWindow = currentMonthWindowLabel(now)

  // ── Budget ──────────────────────────────────────────────────
  const budgetLimit = kpis.budgetTotals.expense.limit
  const budgetSpent = kpis.budgetTotals.expense.spent
  const budgetScore = kpis.monthSummary.budgetScore
  const budgetActive = kpis.budgetingActive && budgetLimit > 0
  // Wat er van het maandbudget OVER is — een moment-opname van deze maand, geen
  // maandplafond (dus geen '/mnd'-suffix). Negatief = over budget; de duiding
  // daarvan komt uit `subText` (status bad → 'Boven budget'), niet uit een eigen
  // status: `budgetCardStatus` blijft op monthSummary.budgetScore staan zodat er
  // geen tweede statusbron naast lib/leverage-status.ts ontstaat.
  // Grondslag uitsluitend budgetTotals.expense — savings-budgetten tellen niet mee.
  const budgetRemaining = budgetLimit - budgetSpent
  const budgetStatus: LeverageStatus = budgetCardStatus({
    budgetingActive: kpis.budgetingActive,
    expenseLimit: budgetLimit,
    budgetScore,
  })
  const budget: CashflowCard = {
    key: 'budget',
    label: 'Budget',
    href: `${BASE}/budget`,
    tooltip: 'Plan en volg je maandbudgetten.',
    kpi: budgetActive ? formatCurrency(budgetRemaining) : null,
    status: budgetStatus,
    subText: budgetActive
      ? budgetStatus === 'good'
        ? 'Op schema'
        : budgetStatus === 'warn'
          ? 'Let op je budget'
          : 'Boven budget'
      : 'Nog geen budget',
    // BEWUST GEEN venster-regel onder de KPI: dit cijfer is een RESTANT
    // (maandlimiet − wat er tot nu toe af is), geen som over het venster. Een
    // "in augustus tot nu toe" eronder zou beschrijven wat het niet is. Het
    // venster hoort hier bij de besteding, en die staat in `detail.tip`.
    kpiWindow: null,
    detail: {
      label: 'Budgetdekking',
      value: budgetActive ? `${Math.round(budgetScore)}/100` : '—',
      tip: budgetActive
        ? `${formatCurrency(budgetSpent)} van ${formatCurrency(budgetLimit)} besteed in ${monthWindow}.`
        : 'Stel budgetten in om grip te krijgen op je uitgaven.',
      actionLabel: 'Bekijk budget',
    },
  }

  // ── Transacties ─────────────────────────────────────────────
  // GRONDSLAG: de GEREALISEERDE huidige kalendermaand uit transacties. LET OP —
  // `kpis.monthlyIncome/monthlyExpenses` zijn de EFFECTIVE waarden
  // (resolveEffectiveIncomeExpenses): bij profiles.income_source/expenses_source
  // = 'manual' winnen de handmatige profielbedragen, dus die mogen hier NIET
  // gebruikt worden — de kaart zou dan een profielinschatting tonen i.p.v. wat
  // deze maand werkelijk gebeurde. KPI, spaarquote, tip en status draaien
  // allemaal op ditzelfde paar, anders spreekt de tip de KPI tegen.
  const currentMonthIncome = kpis.currentMonthIncome
  const currentMonthExpenses = kpis.currentMonthExpenses
  const monthlyNet = currentMonthIncome - currentMonthExpenses
  const hasTx = currentMonthIncome > 0 || currentMonthExpenses > 0
  const rate = currentMonthIncome > 0 ? (monthlyNet / currentMonthIncome) * 100 : null
  const txStatus: LeverageStatus = transactiesCardStatus({
    currentMonthIncome,
    currentMonthExpenses,
  })
  const transacties: CashflowCard = {
    key: 'transacties',
    label: 'Transacties',
    href: `${BASE}/transacties`,
    tooltip: 'Inkomsten en uitgaven van deze maand.',
    kpi: hasTx ? signed(monthlyNet) : null,
    subText: !hasTx
      ? 'Nog geen transacties'
      : txStatus === 'good'
        ? 'Goed gespaard deze maand'
        : txStatus === 'warn'
          ? 'Krap deze maand'
          : 'Tekort deze maand',
    status: txStatus,
    // DE KAART WAAR CF-3 OM BEGONNEN IS. Dit netto-cijfer staat één klik
    // verwijderd van de 30-dagen-cijfers op /overzicht/cashflow/transacties en
    // was zonder venster niet van die cijfers te onderscheiden. `subText` doet
    // het oordeel ("Tekort deze maand"), deze regel de meetlat.
    kpiWindow: hasTx ? `in ${monthWindow}` : null,
    detail: {
      // Rendert in de kaart met `uppercase`, dus de kleine letter van
      // `currentMonthWindowLabel` valt weg: "AUGUSTUS TOT NU TOE".
      label: monthWindow,
      value: rate != null ? `${rate.toFixed(0)}% spaarquote` : '—',
      tip: `Inkomen ${formatCurrency(currentMonthIncome)} · uitgaven ${formatCurrency(currentMonthExpenses)}.`,
      actionLabel: 'Bekijk transacties',
    },
  }

  // ── Vaste lasten ────────────────────────────────────────────
  // Bron: gedeelde vaste-lasten-samenvatting (confirmed recurrings +
  // auto-detectie over 12 mnd) — exact hetzelfde totaal als de
  // Vaste-lasten-pagina, die /api/subscriptions → loadVasteLastenSummary leest.
  const vastePerMonth = vasteLastenSummary.totalMonthly
  const vasteCount = vasteLastenSummary.count
  const hasVaste = vasteCount > 0
  // BEWUST het EFFECTIVE `monthlyIncome` (niet de gerealiseerde maand): een
  // structureel aandeel hoort tegen een stabiel maandinkomen te worden gemeten,
  // niet tegen een half-afgelopen kalendermaand (die het aandeel vroeg in de
  // maand kunstmatig naar 100%+ zou duwen).
  const effectiveMonthlyIncome = kpis.monthlyIncome
  const vasteRatio = effectiveMonthlyIncome > 0 ? vastePerMonth / effectiveMonthlyIncome : null
  const vasteStatus: LeverageStatus = vasteLastenCardStatus({
    totalMonthly: vastePerMonth,
    count: vasteCount,
    monthlyIncome: effectiveMonthlyIncome,
  })
  const vasteLasten: CashflowCard = {
    key: 'vaste-lasten',
    label: 'Vaste lasten',
    href: `${BASE}/vaste-lasten`,
    tooltip: 'Abonnementen en terugkerende kosten.',
    kpi: hasVaste ? `${formatCurrency(Math.round(vastePerMonth))}/mnd` : null,
    subText: !hasVaste
      ? 'Nog geen vaste lasten'
      : vasteRatio != null
        ? `${Math.round(vasteRatio * 100)}% van inkomen`
        : `${vasteCount} ${vasteCount === 1 ? 'post' : 'posten'}`,
    status: vasteStatus,
    // De KPI draagt zijn venster al in de eenheid ("/mnd") — een tweede regel
    // zou hetzelfde nog eens zeggen.
    kpiWindow: null,
    detail: {
      label: 'Vaste lasten',
      value: hasVaste ? `${formatCurrency(Math.round(vastePerMonth * 12))}/jr` : '—',
      tip: hasVaste
        ? `${vasteCount} terugkerende ${vasteCount === 1 ? 'post' : 'posten'}.`
        : 'Voeg je abonnementen en vaste kosten toe.',
      actionLabel: 'Bekijk vaste lasten',
    },
  }

  // ── Forecast ────────────────────────────────────────────────
  const rows = buildForecast(
    cashflow.recurrings,
    cashflow.baselineIncome,
    cashflow.baselineExpenses,
    cashflow.startingBalance,
    now,
  )
  const netPerMonth = rows[0]?.net ?? 0
  const endBalance = rows[rows.length - 1]?.cumulative ?? cashflow.startingBalance
  const hasForecast =
    cashflow.baselineIncome > 0 || cashflow.baselineExpenses > 0 || cashflow.recurrings.length > 0
  const fcStatus: LeverageStatus = forecastCardStatus({ netPerMonth, hasForecast })
  const forecast: CashflowCard = {
    key: 'forecast',
    label: 'Forecast',
    href: `${BASE}/forecast`,
    tooltip: 'Verwachte kasstroom 6 maanden vooruit.',
    kpi: hasForecast ? formatCurrency(endBalance) : null,
    subText: !hasForecast
      ? 'Nog geen forecast'
      : netPerMonth > 0
        ? 'Saldo groeit'
        : netPerMonth < 0
          ? 'Saldo daalt'
          : 'Stabiel',
    status: fcStatus,
    // Vooruitkijkend cijfer, geen maandcijfer: het venster ("na N maanden")
    // staat in `detail.tip`, waar het bij de horizon hoort.
    kpiWindow: null,
    detail: {
      label: 'Netto per maand',
      value: signed(netPerMonth),
      tip: `Verwacht saldo na ${rows.length} maanden: ${formatCurrency(endBalance)}.`,
      actionLabel: 'Bekijk forecast',
    },
  }

  return [budget, transacties, vasteLasten, forecast]
}
