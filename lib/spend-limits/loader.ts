/**
 * SERVER-LOADER voor grenzenpotten (ADR 0058: lezen via de loader, niet
 * client-direct). Haalt de configuratie op, haalt de bijbehorende maandsommen
 * uit de aggregaat-RPC's, en laat de PURE rekenmotor (lib/spend-limits/engine.ts)
 * de uitkomst bepalen. Hier staat geen rekenregel — alleen data-toevoer.
 *
 * ── WAAROM AGGREGATEN EN GEEN TRANSACTIERIJEN ───────────────────────────────
 * PostgREST kapt elk antwoord af op `max_rows` (=1000), óók bij een hogere
 * `.limit()`. Een loop over transactierijen zou voor tx-rijke gebruikers stil
 * een te LAGE overschrijding tonen — een correctheidsbug, geen performance-
 * kwestie. Die fout-klasse is in deze repo al twee keer opgetreden (zie de kop
 * van 20260719131916_perf_tx_month_aggregates.sql en de spaarquote-canon van
 * 29-07-2026). Beide bronnen hier zijn daarom aggregaten: `tx_month_aggregate`
 * voor budget-regels en `tx_counterparty_month_aggregate` voor tegenpartij-
 * regels.
 *
 * ── EN WAAROM DAT AGGREGAAT SINDS FASE 5 GECHUNKT WORDT ─────────────────────
 * Een jaarpot kijkt 4 kalenderjaren terug (48 maanden). Ook een aggregaat kan
 * dán tegen diezelfde cap lopen: 48 maanden × veel budgetten × transactietypes
 * haalt de 1000 rijen. Het venster wordt daarom in stukken van ten hoogste 12
 * maanden geknipt (één call per stuk, ongeacht het aantal potten), en komt een
 * stuk tóch op de cap terug, dan zegt de UI dat eerlijk
 * (`aggregateTruncationSuspected`) in plaats van stil een te laag getal te tonen.
 *
 * ── GRONDSLAG ───────────────────────────────────────────────────────────────
 * `ownOnly` blijft false: een grenzenpot telt exact dezelfde transacties als je
 * overzicht — je eigen boekingen plus de gedeelde huishoudboekingen die de
 * RLS-policy je toont, ongeschaald. Geen fractionele partnerverdeling in fase 1;
 * dat is een expliciete keuze en geen omissie (zie ADR 0089).
 *
 * RLS: de RPC's zijn SECURITY INVOKER en MOETEN met de authenticated-client
 * (lib/supabase/server.ts) worden aangeroepen — nooit met getServiceClient().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  aggToExpenseRows,
  fetchTxMonthAggregate,
  getTxAgg12m,
  isRealAggRow,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { getCurrentMonthTx, getOwnProfile } from '@/lib/server-data/base'
import { deriveRealMonthTotals, type MonthTxRow } from '@/lib/cashflow-kpis'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import {
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  buildSpendLimitReport,
  resolveSpendLimitPeriods,
  sliceContainsMonth,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
} from './engine'
import type {
  SpendLimitBudgetOption,
  SpendLimitBudgetSplitRow,
  SpendLimitConfig,
  SpendLimitsSectionData,
  SpendLimitWithReport,
} from './types'

/**
 * Vensterlengte in kalendermaanden voor een MAANDpot, INCLUSIEF de lopende maand.
 *
 * Afgeleid uit de motor-map (`SPEND_LIMIT_WINDOW_BY_PERIOD`), niet herhaald: er
 * is één home voor deze getallen. Blijft geëxporteerd omdat de tegenpartij-
 * suggestielijst (`app/api/spend-limits/counterparties/route.ts`) precies dít
 * venster gebruikt — een suggestie gaat altijd over maanden, ongeacht welke
 * periodesoort de gebruiker straks kiest.
 */
export const SPEND_LIMIT_WINDOW_PERIODS = SPEND_LIMIT_WINDOW_BY_PERIOD.month

/**
 * Maximaal aantal maanden per aggregaat-call. Zie de kop: het unie-venster van
 * alle potten samen wordt hierin geknipt, zodat één antwoord nooit de
 * PostgREST-cap kan halen enkel doordat het venster lang is.
 */
const AGGREGATE_CHUNK_MONTHS = 12

/**
 * De PostgREST `max_rows`-cap (supabase/config.toml). Komt een chunk met exact
 * dit aantal rijen terug, dan is afkapping niet uit te sluiten — dat is een
 * kanarie, geen bewijs, en de UI zegt het erbij.
 */
const POSTGREST_MAX_ROWS = 1000

/** De rauwe DB-vorm; blijft binnen deze module en de API-routes. */
interface SpendLimitRow {
  id: string
  name: string
  purpose: string | null
  rule_type: string
  budget_id: string | null
  include_child_budgets: boolean
  counterparty_key: string | null
  counterparty_label: string | null
  limit_amount: number | string
  period: string
  is_active: boolean
  created_at: string
}

interface CounterpartyAggRow {
  counterparty_key: string
  month: string
  transaction_type: string | null
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
  matched_names: string[] | null
}

const EMPTY: SpendLimitsSectionData = {
  limits: [],
  budgetOptions: [],
  dailyExpenseRate: null,
  aggregateTruncationSuspected: false,
}

/** Opties voor `loadSpendLimitsSection` — uitbreidend met defaults, nooit vervangend. */
export interface LoadSpendLimitsOptions {
  /**
   * Vul `budgetOptions` (de keuzelijst van het formulier). Zet op `false` op
   * oppervlakken die alleen lézen — dashboardbundel, meldingen — zodat een
   * account zonder pot daar géén budgets-query kost.
   *
   * LET OP: dit onderdrukt alleen de KEUZELIJST. Zijn er budget-potten, dan
   * blijft de budgets-query nodig (kind-oprol + budgetnamen) en draait hij ook
   * met `false`; alleen `budgetOptions` blijft dan leeg.
   */
  withBudgetOptions?: boolean
  /**
   * Bereken `dailyExpenseRate` (de €→vrijheidstijd-dagbasis). Zet op `false` waar
   * het oppervlak die tijd niet toont óf 'm al uit de dashboardbundel heeft
   * (`DashboardData.dailyExpenseRate` — hetzelfde 12-maands rolling tarief, uit
   * exact dezelfde bron; zie `resolveDailyExpenseRate`). Dan hoeft deze loader
   * profiel, maandtransacties en het 12-maands aggregaat niet te raadplegen.
   */
  withDailyExpenseRate?: boolean
}

/**
 * Alle budget-ids die bij een pot horen: het gekozen budget zelf, plus — als
 * `include_child_budgets` aan staat — al zijn afstammelingen.
 *
 * Transitief en niet één niveau diep: `budgets.parent_id` beschrijft een boom,
 * en een kleinkind hoort net zo goed bij het hoofdbudget als een kind. Dit
 * spiegelt de kind-oprol die de budgetkaarten al doen.
 *
 * GEËXPORTEERD zodat de match-preview (app/api/spend-limits/preview/route.ts)
 * exact dezelfde verzameling budget-ids optelt als de pot straks — een tweede
 * boomwandeling naast deze zou de preview een ander bedrag kunnen laten tonen dan
 * de pot die eruit ontstaat. (`collectBudgetSubtree` in lib/spend-limits/overlap.ts
 * is de Supabase-vrije tweelingbroer voor de REGEL-observatie; wijzig je de ene,
 * kijk dan naar de andere.)
 */
export function collectBudgetIds(
  rootId: string,
  includeChildren: boolean,
  childrenByParent: ReadonlyMap<string, string[]>,
): Set<string> {
  const ids = new Set<string>([rootId])
  if (!includeChildren) return ids
  const queue = [rootId]
  while (queue.length > 0) {
    const parent = queue.shift() as string
    for (const child of childrenByParent.get(parent) ?? []) {
      if (ids.has(child)) continue
      ids.add(child)
      queue.push(child)
    }
  }
  return ids
}

/** De DB-kolom is vrije tekst met een CHECK; alles buiten de drie soorten = maand. */
function toPeriodKind(raw: string | null | undefined): SpendLimitPeriodKind {
  return raw === 'quarter' || raw === 'year' ? raw : 'month'
}

/** `YYYY-MM-01` + n maanden, tijdzone-veilig via de lokale datum-componenten. */
function addMonthsToMonthStart(monthStartIso: string, months: number): string {
  const [y, m] = monthStartIso.split('-').map(Number)
  return localMonthStart(new Date(y, m - 1 + months, 1))
}

/**
 * Het UNIE-venster over álle potten samen, geknipt in stukken van ten hoogste
 * `AGGREGATE_CHUNK_MONTHS` maanden.
 *
 * Half-open per stuk (`>= from`, `< to`), exact zoals de bestaande RPC's
 * (`t.date >= p_from AND t.date < p_to`): sluitende stukken zonder overlap, dus
 * een maandgrens telt nooit dubbel en valt nooit weg. Het aantal calls hangt aan
 * de LENGTE van het venster, niet aan het aantal potten.
 *
 * GEËXPORTEERD voor de budget-tak van de match-preview: die leest hetzelfde
 * `tx_month_aggregate` over een venster dat bij een jaarpot 48 maanden lang is, en
 * moet dus in dezelfde stukken knippen. Eén gedeelde knipregel, anders kan de
 * preview op een andere plek afkappen dan de loader.
 */
export function buildAggregateChunks(from: string, to: string): { from: string; to: string }[] {
  const chunks: { from: string; to: string }[] = []
  let cursor = from
  while (cursor < to) {
    const next = addMonthsToMonthStart(cursor, AGGREGATE_CHUNK_MONTHS)
    chunks.push({ from: cursor, to: next < to ? next : to })
    cursor = next
  }
  return chunks
}

/**
 * De €→vrijheidstijd-dagbasis, uit de CANONIEKE 12-MAANDS ROLLING BRON —
 * dezelfde keten die `DashboardData.dailyExpenseRate` produceert
 * (lib/dashboard-data-loader.ts): `getTxAgg12m` → `aggToExpenseRows(…,
 * { realOnly: false })` → `recentDailyExpenseRateFromRows` (lib/expense-rate.ts,
 * ×12/365 via `dailyExpenseRate`).
 *
 * ── WAAROM NIET DE EFFECTIVE MAANDUITGAVEN (was: de bug) ────────────────────
 * Hier stond `dailyExpenseRate(resolveEffectiveIncomeExpenses(...).expenses)`:
 * de LOSSE-KALENDERMAAND-conversie die KRUIS-17/20 juist heeft afgeschaft. Op 3
 * augustus met €120 geboekt levert die ~€3,95/dag op waar het rolling tarief
 * ~€100/dag zegt — factor 25 op elke vrijheidstijd-regel. En dat naast een
 * widget die dezelfde pot toont met het BUNDELVELD (`data.dailyExpenseRate`,
 * rolling): twee oppervlakken, twee grondslagen, tegensprekende getallen over
 * exact hetzelfde bedrag. Eén metriek, één grondslag — dus leest deze loader nu
 * dezelfde bron.
 *
 * ── DE EFFECTIVE-WAARDE BLIJFT, MAAR ALLEEN ALS FALLBACK ────────────────────
 * `recentDailyExpenseRateFromRows` gebruikt de meegegeven maandschatting
 * UITSLUITEND wanneer er geen uitgaven-rijen in het venster zijn (onboarding
 * zonder transacties). Precies zoals de dashboardbundel, die daar
 * `effectiveMonthlyExpenses` voor doorgeeft. Vandaar dat profiel + huidige-maand-
 * rijen hier nog steeds gelezen worden.
 *
 * ── KOSTEN ─────────────────────────────────────────────────────────────────
 * Alle drie de fetches zijn `cache()`-gedeeld (lib/server-data/base.ts +
 * tx-aggregates.ts): draait er in hetzelfde request al een loader die ze
 * gebruikt, dan kost dit nul extra queries. Op de transactiepagina — de enige
 * plek die `withDailyExpenseRate` aan laat staan — is `getTxAgg12m` nog niet
 * warm en kost dit één extra RPC. Dat is bewust: een tegensprekend getal is
 * duurder dan een aggregaat-call. LET OP: dit 12-maands venster staat LOS van
 * het pot-venster hierboven (13 maanden / 9 kwartalen / 4 jaar); ze delen
 * bewust geen rijen, want het zijn twee verschillende grootheden.
 *
 * Er wordt hier GEEN som gemaakt — alleen bestaande, canonieke helpers achter
 * elkaar gezet.
 *
 * `null` bij een niet-positief tarief: dan is er geen eerlijke dagbasis en toont
 * het oppervlak het bedrag zónder tijdregel (nooit een eigen /30-benadering).
 */
async function resolveDailyExpenseRate(
  supabase: SupabaseClient,
  now: Date,
): Promise<number | null> {
  try {
    const [profileResult, monthTxResult, aggResult] = await Promise.all([
      getOwnProfile(supabase),
      getCurrentMonthTx(supabase),
      getTxAgg12m(supabase),
    ])
    const profile = (profileResult.data ?? {}) as IncomeExpenseSources
    const monthTx = (monthTxResult.data ?? []) as unknown as MonthTxRow[]
    const realMonth = deriveRealMonthTotals(monthTx)
    // Alleen de FALLBACK-grondslag (zie boven) — nooit meer het tarief zelf.
    const { expenses } = resolveEffectiveIncomeExpenses(profile, realMonth.income, realMonth.expenses)
    // Faalt het aggregaat, dan valt de helper terug op de schatting — een STILLE
    // wissel van grondslag. De uitkomst blijft identiek aan de dashboardbundel
    // (die dezelfde `?? []` doet), maar de wissel hoort zichtbaar te zijn.
    if (aggResult.error) {
      console.error('[spend-limits:loader] 12-maands aggregaat mislukt — dagtarief valt terug op de schatting', aggResult.error)
    }
    const agg12 = (aggResult.data ?? []) as TxMonthAggregateRow[]
    const { dailyRate } = recentDailyExpenseRateFromRows(
      aggToExpenseRows(agg12, { realOnly: false }),
      now,
      expenses,
    )
    return dailyRate > 0 ? dailyRate : null
  } catch (err) {
    console.error('[spend-limits:loader] dagtarief afleiden mislukt', err)
    return null
  }
}

/**
 * Laad de grenzenpot-sectie voor de ingelogde gebruiker.
 *
 * Faalt de configuratie-query (bv. omdat de migratie op deze omgeving nog niet
 * gedraaid heeft), dan levert de loader een LEGE sectie en logt hij server-side.
 * Een secundaire sectie mag de transactiepagina niet meeslepen; de fout blijft
 * wel zichtbaar in de logs met een grep-bare tag.
 *
 * ── COMPUTE-GATE ────────────────────────────────────────────────────────────
 * De configuratie-query gaat áltijd eerst en is de gate: wie geen pot heeft,
 * betaalt op een leesoppervlak (`withBudgetOptions: false`) precies één query.
 */
export async function loadSpendLimitsSection(
  supabase: SupabaseClient,
  now: Date = new Date(),
  opts: LoadSpendLimitsOptions = {},
): Promise<SpendLimitsSectionData> {
  const wantBudgetOptions = opts.withBudgetOptions !== false
  const wantDailyRate = opts.withDailyExpenseRate !== false

  const { data: rawLimits, error } = await supabase
    .from('spend_limits')
    .select(
      // `created_at` is geen weergaveveld maar de ondergrens van betekenis voor de
      // reeks-meldingen (zie SpendLimitConfig.createdAt).
      'id, name, purpose, rule_type, budget_id, include_child_budgets, counterparty_key, counterparty_label, limit_amount, period, is_active, created_at',
    )
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[spend-limits:loader] configuratie laden mislukt', error)
    return EMPTY
  }

  const rows = (rawLimits ?? []) as SpendLimitRow[]

  const budgetRules = rows.filter((r) => r.rule_type === 'budget' && r.budget_id)
  const counterpartyKeys = [
    ...new Set(
      rows
        .filter((r) => r.rule_type === 'counterparty' && r.counterparty_key)
        .map((r) => r.counterparty_key as string),
    ),
  ]

  // Budgetten zijn nodig zodra (a) het formulier een keuzelijst moet tonen, óf
  // (b) er een budget-pot bestaat — die heeft de kind-oprol en de budgetnaam
  // nodig, ook wanneer de keuzelijst niet gevraagd is.
  const needBudgets = wantBudgetOptions || budgetRules.length > 0

  if (rows.length === 0 && !needBudgets) return EMPTY

  const childrenByParent = new Map<string, string[]>()
  const budgetNameById = new Map<string, string>()
  /**
   * Budgetten die de gebruiker heeft gearchiveerd. Ze houden hun naam en hun
   * historie — de pot blijft dus gewoon rekenen — maar het oppervlak zegt erbij
   * dat er waarschijnlijk niets nieuws meer bij komt (AC-B1-02).
   */
  const archivedBudgetIds = new Set<string>()
  const budgetOptions: SpendLimitBudgetOption[] = []

  if (needBudgets) {
    // Eén goedkope, RLS-gescopede query.
    const { data: budgetRows } = await supabase
      .from('budgets')
      .select('id, name, parent_id, budget_type, is_archived')
      .order('sort_order', { ascending: true })

    const budgets = (budgetRows ?? []) as {
      id: string
      name: string
      parent_id: string | null
      budget_type: string | null
      is_archived: boolean | null
    }[]

    for (const b of budgets) {
      budgetNameById.set(b.id, b.name)
      if (b.is_archived) archivedBudgetIds.add(b.id)
      if (b.parent_id) {
        const list = childrenByParent.get(b.parent_id) ?? []
        list.push(b.id)
        childrenByParent.set(b.parent_id, list)
      }
    }
    if (wantBudgetOptions) {
      for (const b of budgets) {
        // Een grens gaat over uitgeven; inkomsten-, spaar- en archiefbudgetten
        // horen niet in de keuzelijst.
        if (b.is_archived) continue
        if (b.budget_type && b.budget_type !== 'expense') continue
        budgetOptions.push({
          id: b.id,
          name: b.name,
          hasChildren: (childrenByParent.get(b.id) ?? []).length > 0,
          parentId: b.parent_id,
        })
      }
    }
  }

  if (rows.length === 0) {
    return { ...EMPTY, budgetOptions }
  }

  // ── Unie-venster + chunks ─────────────────────────────────────────────────
  // De vroegste `since` over de periodesoorten die deze gebruiker daadwerkelijk
  // gebruikt — uit de motor, zodat er geen tweede periodesleutel-/datumrekening
  // ontstaat. Een jaarpot trekt het venster naar 4 kalenderjaren, een maandpot
  // naar 13 maanden; de langste wint voor iedereen.
  const to = localMonthBounds(now).end
  let from = localMonthBounds(now).start
  for (const kind of new Set(rows.map((r) => toPeriodKind(r.period)))) {
    const first = resolveSpendLimitPeriods(kind, now, SPEND_LIMIT_WINDOW_BY_PERIOD[kind])[0]
    if (first.since < from) from = first.since
  }
  const chunks = buildAggregateChunks(from, to)

  let aggregateTruncationSuspected = false
  const noteChunkSize = (bron: string, length: number) => {
    if (length < POSTGREST_MAX_ROWS) return
    aggregateTruncationSuspected = true
    console.warn(
      `[spend-limits:loader] mogelijke afkapping — ${bron} gaf ${length} rijen terug (max_rows=${POSTGREST_MAX_ROWS})`,
    )
  }

  const [monthChunkResults, cpChunkResults, resolvedDailyRate] = await Promise.all([
    Promise.all(
      budgetRules.length > 0
        ? chunks.map((c) => fetchTxMonthAggregate(supabase, { from: c.from, to: c.to }))
        : [],
    ),
    Promise.all(
      counterpartyKeys.length > 0
        ? chunks.map((c) =>
            supabase.rpc('tx_counterparty_month_aggregate', {
              p_from: c.from,
              p_to: c.to,
              p_keys: counterpartyKeys,
              p_own_only: false,
            }),
          )
        : [],
    ),
    wantDailyRate ? resolveDailyExpenseRate(supabase, now) : Promise.resolve(null),
  ])

  const monthRows: TxMonthAggregateRow[] = []
  for (const res of monthChunkResults) {
    if (res.error) console.error('[spend-limits:loader] maandaggregaat mislukt', res.error)
    const data = (res.data ?? []) as TxMonthAggregateRow[]
    noteChunkSize('tx_month_aggregate', data.length)
    monthRows.push(...data)
  }

  const cpRows: CounterpartyAggRow[] = []
  for (const res of cpChunkResults) {
    if (res.error) console.error('[spend-limits:loader] tegenpartij-aggregaat mislukt', res.error)
    const data = (res.data ?? []) as CounterpartyAggRow[]
    noteChunkSize('tx_counterparty_month_aggregate', data.length)
    cpRows.push(...data)
  }

  // ── Per pot: kies de bijbehorende rijen en laat de motor rekenen ──────────
  const limits: SpendLimitWithReport[] = []

  for (const row of rows) {
    const period = toPeriodKind(row.period)
    const windowPeriods = SPEND_LIMIT_WINDOW_BY_PERIOD[period]
    const limitAmount = Number(row.limit_amount)
    let engineRows: SpendLimitAggregateRow[] = []
    let budgetSplit: SpendLimitBudgetSplitRow[] = []

    if (row.rule_type === 'budget' && row.budget_id) {
      const ids = collectBudgetIds(row.budget_id, row.include_child_budgets, childrenByParent)
      const potRows = monthRows.filter((r) => r.budget_id !== null && ids.has(r.budget_id))
      engineRows = potRows.map((r) => ({
        month: r.month,
        transactionType: r.transaction_type,
        sumPositief: Number(r.sum_positief),
        sumNegatief: Number(r.sum_negatief),
        count: Number(r.count),
      }))
      budgetSplit = buildBudgetSplit(potRows, period, now, windowPeriods, budgetNameById)
    } else if (row.rule_type === 'counterparty' && row.counterparty_key) {
      engineRows = cpRows
        .filter((r) => r.counterparty_key === row.counterparty_key)
        .map((r) => ({
          month: r.month,
          transactionType: r.transaction_type,
          sumPositief: Number(r.sum_positief),
          sumNegatief: Number(r.sum_negatief),
          count: Number(r.count),
          matchedNames: r.matched_names ?? [],
        }))
    }

    const config: SpendLimitConfig = {
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      ruleType: row.rule_type === 'counterparty' ? 'counterparty' : 'budget',
      budgetId: row.budget_id,
      budgetName: row.budget_id ? (budgetNameById.get(row.budget_id) ?? null) : null,
      budgetArchived: row.budget_id ? archivedBudgetIds.has(row.budget_id) : false,
      includeChildBudgets: row.include_child_budgets,
      counterpartyKey: row.counterparty_key,
      counterpartyLabel: row.counterparty_label,
      limitAmount,
      period,
      isActive: row.is_active,
      createdAt: row.created_at,
    }

    limits.push({
      config,
      report: buildSpendLimitReport({
        // `createdAt` is GEEN optioneel extraatje: `computeSpendLimitTrend` past
        // de aanmaak-ondergrens (`closedPeriodsSinceCreation`) alléén toe als dit
        // veld gevuld is, en deze loader is blijkens de motor-docstring de enige
        // adapter die 'm kan vullen. Zonder deze regel is de ondergrens in
        // productie dood: kaart, pane en widget tonen dan een richting over lege
        // periodes van vóór het bestaan van de pot.
        rule: { ruleType: config.ruleType, limitAmount, period, createdAt: config.createdAt },
        rows: engineRows,
        now,
        windowPeriods,
      }),
      budgetSplit,
    })
  }

  return {
    limits,
    budgetOptions,
    dailyExpenseRate: resolvedDailyRate,
    aggregateTruncationSuspected,
  }
}

/**
 * Per-(kind)budget-uitsplitsing per periode uit dezelfde aggregaat-rijen die de
 * motor optelt — geen tweede fetch en geen tweede optelregel: de bereik-match
 * komt uit `sliceContainsMonth` (motor) en de transfer-filter uit `isRealAggRow`
 * (lib/server-data/tx-aggregates.ts), precies zoals `computePeriodOutcome`.
 *
 * Het is een UITSPLITSING, geen rapport: er zit bewust geen status, grens of
 * overschrijding in. Die horen bij de pot als geheel en hebben één eigenaar.
 */
function buildBudgetSplit(
  potRows: TxMonthAggregateRow[],
  period: SpendLimitPeriodKind,
  now: Date,
  windowPeriods: number,
  budgetNameById: Map<string, string>,
): SpendLimitBudgetSplitRow[] {
  if (potRows.length === 0) return []
  const slices = resolveSpendLimitPeriods(period, now, windowPeriods)
  const byKey = new Map<string, SpendLimitBudgetSplitRow>()

  for (const r of potRows) {
    if (!isRealAggRow(r)) continue
    if (!r.budget_id) continue
    const slice = slices.find((s) => sliceContainsMonth(s, r.month))
    if (!slice) continue
    const key = `${slice.periodKey}|${r.budget_id}`
    let entry = byKey.get(key)
    if (!entry) {
      entry = {
        periodKey: slice.periodKey,
        budgetId: r.budget_id,
        budgetName: budgetNameById.get(r.budget_id) ?? null,
        matchedAmount: 0,
        matchedTransactionCount: 0,
      }
      byKey.set(key, entry)
    }
    // Netto uitgave = −(negatieve som + positieve som), identiek aan de motor.
    entry.matchedAmount += -(Number(r.sum_negatief) + Number(r.sum_positief))
    entry.matchedTransactionCount += Number(r.count)
  }

  return [...byKey.values()].map((e) => ({
    ...e,
    matchedAmount: Object.is(e.matchedAmount, -0) ? 0 : e.matchedAmount,
  }))
}
