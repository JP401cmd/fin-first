/**
 * SERVER-LOADER voor grenzenpotten (ADR 0058: lezen via de loader, niet
 * client-direct). Haalt de configuratie + de regels op, haalt de bijbehorende
 * sommen uit het regel-aggregaat, en laat de PURE rekenmotor
 * (lib/spend-limits/engine.ts) de uitkomst bepalen. Hier staat geen rekenregel —
 * alleen data-toevoer.
 *
 * ── WAAROM AGGREGATEN EN GEEN TRANSACTIERIJEN ───────────────────────────────
 * PostgREST kapt elk antwoord af op `max_rows` (=1000), óók bij een hogere
 * `.limit()`. Een loop over transactierijen zou voor tx-rijke gebruikers stil
 * een te LAGE overschrijding tonen — een correctheidsbug, geen performance-
 * kwestie. Die fout-klasse is in deze repo al twee keer opgetreden (zie de kop
 * van 20260719131916_perf_tx_month_aggregates.sql en de spaarquote-canon van
 * 29-07-2026).
 *
 * ── ÉÉN AGGREGAAT SINDS 10-08-2026: `spend_limit_rule_aggregate` ────────────
 * De twee fase-1-bronnen (`tx_month_aggregate` per budget,
 * `tx_counterparty_month_aggregate` per sleutel) zijn hier vervangen door één
 * functie die de REGEL evalueert. Dat is geen opruiming maar noodzaak: een regel
 * kan nu "budget X ÉN tegenpartij Y" zijn, en de doorsnede van twee sommen is
 * geen som. Dezelfde functie levert bovendien dag- en weekbuckets, die per
 * definitie niet uit een maandsom af te leiden zijn.
 *
 * ONTDUBBELING ZIT IN DE SQL, NIET HIER. Raken twee regels van dezelfde pot
 * dezelfde transactie, dan rekent de SQL die transactie aan precies één regel toe
 * (de laagste index). Deze loader mag de regelrijen van een pot dus zonder meer
 * bij elkaar optellen — zou hij daar zelf moeten ontdubbelen, dan had hij de
 * transactie-id's nodig en was het aggregaat zinloos.
 *
 * ── EN WAAROM HET VENSTER GECHUNKT WORDT ────────────────────────────────────
 * Een jaarpot kijkt 4 kalenderjaren terug (48 maanden). Ook een aggregaat kan
 * dán tegen de cap lopen: 48 maanden × veel budgetten × transactietypes haalt de
 * 1000 rijen. Het venster wordt daarom in stukken geknipt, en komt een stuk tóch
 * op de cap terug, dan zegt de UI dat eerlijk (`aggregateTruncationSuspected`)
 * in plaats van stil een te laag getal te tonen.
 *
 * ── GRONDSLAG ───────────────────────────────────────────────────────────────
 * Een grenzenpot telt exact dezelfde transacties als je overzicht — je eigen
 * boekingen plus de gedeelde huishoudboekingen die de RLS-policy je toont,
 * ongeschaald. Geen fractionele partnerverdeling; dat is een expliciete keuze en
 * geen omissie (zie ADR 0089).
 *
 * RLS: het aggregaat is SECURITY INVOKER en MOET met de authenticated-client
 * (lib/supabase/server.ts) worden aangeroepen — nooit met getServiceClient().
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  aggToExpenseRows,
  getTxAgg12m,
  isRealAggRow,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { getCurrentMonthTx, getOwnProfile } from '@/lib/server-data/base'
import { deriveRealMonthTotals, type MonthTxRow } from '@/lib/cashflow-kpis'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import {
  SPEND_LIMIT_GRAIN_BY_PERIOD,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  buildSpendLimitReport,
  netSpendFromSums,
  resolveSpendLimitPeriods,
  sliceContainsBucket,
  type SpendLimitAggregateRow,
  type SpendLimitGrain,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodSlice,
  type SpendLimitRuleType,
} from './engine'
import type {
  SpendLimitBudgetOption,
  SpendLimitBudgetSplitRow,
  SpendLimitConfig,
  SpendLimitRuleConfig,
  SpendLimitRuleSplitRow,
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
 * alle potten met dezelfde korrel wordt hierin geknipt, zodat één antwoord nooit
 * de PostgREST-cap kan halen enkel doordat het venster lang is.
 */
const AGGREGATE_CHUNK_MONTHS = 12

/**
 * Kleinere stukken zodra er een per-budget-uitsplitsing in het antwoord zit.
 *
 * Die uitsplitsing voegt een DIMENSIE aan de rijen toe (regel × bucket × type ×
 * budget in plaats van regel × bucket × type). Met een subboom van enkele
 * tientallen budgetten en een paar transactietypes loopt 12 maanden tegen de
 * 1000 rijen aan; 4 maanden houdt dat structureel op ruwweg een kwart daarvan.
 * Meer calls, maar ze draaien parallel — en een stil te laag getal is duurder
 * dan een extra RPC.
 */
const AGGREGATE_CHUNK_MONTHS_WITH_BUDGET_SPLIT = 4

/**
 * De PostgREST `max_rows`-cap (supabase/config.toml). Komt een chunk met exact
 * dit aantal rijen terug, dan is afkapping niet uit te sluiten — dat is een
 * kanarie, geen bewijs, en de UI zegt het erbij.
 */
const POSTGREST_MAX_ROWS = 1000

/** De rauwe DB-vorm van een regel; blijft binnen deze module en de API-routes. */
interface SpendLimitRuleRow {
  id: string
  sort_order: number | null
  budget_ids: string[] | null
  include_child_budgets: boolean | null
  counterparty_keys: string[] | null
  counterparty_labels: string[] | null
}

/** De rauwe DB-vorm van een pot, met zijn regels als ingebedde bron. */
interface SpendLimitRow {
  id: string
  name: string
  purpose: string | null
  limit_amount: number | string
  period: string
  is_active: boolean
  created_at: string
  spend_limit_rules: SpendLimitRuleRow[] | null
}

/** Eén rij uit `public.spend_limit_rule_aggregate`. */
interface RuleAggRow {
  rule_index: number
  bucket_start: string
  budget_id: string | null
  transaction_type: string | null
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
  matched_names: string[] | null
}

/** De invoervorm van het aggregaat: `p` = potindex, `i` = regelindex. */
interface RuleAggInput {
  p: number
  i: number
  b: string[]
  k: string[]
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
   * LET OP: dit onderdrukt alleen de KEUZELIJST. Zijn er budget-regels, dan
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
 * Alle budget-ids die bij een regel horen: de gekozen budgetten zelf, plus — als
 * `includeChildBudgets` aan staat — al hun afstammelingen.
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
  roots: readonly string[],
  includeChildren: boolean,
  childrenByParent: ReadonlyMap<string, string[]>,
): Set<string> {
  const ids = new Set<string>(roots)
  if (!includeChildren) return ids
  const queue = [...roots]
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

/** De DB-kolom is vrije tekst met een CHECK; alles buiten de vijf soorten = maand. */
function toPeriodKind(raw: string | null | undefined): SpendLimitPeriodKind {
  return raw === 'day' || raw === 'week' || raw === 'quarter' || raw === 'year' ? raw : 'month'
}

/**
 * Waar deze pot over gáát, afgeleid uit zijn regels.
 *
 * ÉÉN HOME: `spend_limits.rule_type` is legacy en wordt niet meer geschreven, dus
 * dit is de enige plek waar het soort ontstaat. `mixed` zodra één regel beide
 * dimensies combineert óf de pot regels van beide soorten naast elkaar heeft —
 * een oppervlak hoort daar iets anders te zeggen dan bij een zuivere pot.
 *
 * Een pot zonder regels kan via de API niet ontstaan; komt hij toch voor
 * (handmatige DB-actie), dan is `budget` de onschuldigste uitkomst: hij telt dan
 * sowieso niets.
 */
export function deriveSpendLimitRuleType(rules: readonly SpendLimitRuleConfig[]): SpendLimitRuleType {
  let sawBudget = false
  let sawCounterparty = false
  for (const r of rules) {
    const hasB = r.budgets.length > 0
    const hasC = r.counterparties.length > 0
    if (hasB && hasC) return 'mixed'
    if (hasB) sawBudget = true
    if (hasC) sawCounterparty = true
  }
  if (sawBudget && sawCounterparty) return 'mixed'
  return sawCounterparty ? 'counterparty' : 'budget'
}

/** `YYYY-MM-01` + n maanden, tijdzone-veilig via de lokale datum-componenten. */
function addMonthsToMonthStart(monthStartIso: string, months: number): string {
  const [y, m] = monthStartIso.split('-').map(Number)
  return localMonthStart(new Date(y, m - 1 + months, 1))
}

/**
 * Een venster geknipt in stukken van ten hoogste `chunkMonths` maanden.
 *
 * Half-open per stuk (`>= from`, `< to`), exact zoals de RPC's zelf rekenen
 * (`t.date >= p_from AND t.date < p_to`): sluitende stukken zonder overlap, dus
 * een maandgrens telt nooit dubbel en valt nooit weg. Het aantal calls hangt aan
 * de LENGTE van het venster, niet aan het aantal potten.
 *
 * GEËXPORTEERD voor de match-preview: die leest hetzelfde aggregaat over een
 * venster dat bij een jaarpot 48 maanden lang is, en moet dus in dezelfde stukken
 * knippen. Eén gedeelde knipregel, anders kan de preview op een andere plek
 * afkappen dan de loader.
 */
export function buildAggregateChunks(
  from: string,
  to: string,
  chunkMonths: number = AGGREGATE_CHUNK_MONTHS,
): { from: string; to: string }[] {
  const step = Math.max(1, Math.floor(chunkMonths))
  const chunks: { from: string; to: string }[] = []
  let cursor = from
  while (cursor < to) {
    const next = addMonthsToMonthStart(cursor, step)
    chunks.push({ from: cursor, to: next < to ? next : to })
    cursor = next
  }
  return chunks
}

/**
 * Hoe groot de stukken mogen zijn voor deze korrel + regelvorm.
 *
 * ÉÉN HOME voor de keuze, zodat de preview-route dezelfde afweging kan lenen: de
 * per-budget-uitsplitsing (en dus de extra rij-dimensie) bestaat alleen op
 * maand-korrel voor regels zonder tegenpartij-dimensie — precies de conditie die
 * de SQL zelf hanteert.
 */
export function aggregateChunkMonths(grain: SpendLimitGrain, hasBudgetOnlyRule: boolean): number {
  return grain === 'month' && hasBudgetOnlyRule
    ? AGGREGATE_CHUNK_MONTHS_WITH_BUDGET_SPLIT
    : AGGREGATE_CHUNK_MONTHS
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
 * het pot-venster; ze delen bewust geen rijen, want het zijn twee verschillende
 * grootheden.
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

/** De regels van een pot, op formuliervolgorde en met lege arrays genormaliseerd. */
function normaliseRules(raw: SpendLimitRuleRow[] | null | undefined): SpendLimitRuleRow[] {
  return [...(raw ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
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
      // reeks-meldingen en de trend (zie SpendLimitConfig.createdAt).
      // De regels komen als INGEBEDDE bron mee: één round-trip, en PostgREST
      // past de own-row RLS van `spend_limit_rules` er onverkort op toe.
      'id, name, purpose, limit_amount, period, is_active, created_at, ' +
        'spend_limit_rules(id, sort_order, budget_ids, include_child_budgets, counterparty_keys, counterparty_labels)',
    )
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[spend-limits:loader] configuratie laden mislukt', error)
    return EMPTY
  }

  const rows = (rawLimits ?? []) as unknown as SpendLimitRow[]
  const rulesByLimit = new Map<string, SpendLimitRuleRow[]>(
    rows.map((r) => [r.id, normaliseRules(r.spend_limit_rules)]),
  )

  const hasBudgetRule = rows.some((r) =>
    (rulesByLimit.get(r.id) ?? []).some((rule) => (rule.budget_ids ?? []).length > 0),
  )

  // Budgetten zijn nodig zodra (a) het formulier een keuzelijst moet tonen, óf
  // (b) er een regel met budgetten bestaat — die heeft de kind-oprol en de
  // budgetnamen nodig, ook wanneer de keuzelijst niet gevraagd is.
  const needBudgets = wantBudgetOptions || hasBudgetRule

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

  // ── Regels omzetten naar de configuratie- én de aggregaat-vorm ────────────
  //
  // `ruleIndex` is GLOBAAL oplopend over alle potten: het is de sleutel waarmee
  // de aggregaat-rijen straks terugvinden bij welke pot én welke regel ze horen.
  // Binnen één pot loopt hij op in formuliervolgorde, en dát is precies wat de
  // ontdubbeling in SQL gebruikt (laagste index wint) — de eerste regel die de
  // gebruiker heeft opgeschreven, vangt de transactie.
  const configByLimit = new Map<string, SpendLimitConfig>()
  const ruleIdByIndex = new Map<number, string>()
  const ruleIndexesByLimit = new Map<string, number[]>()
  const aggInputByGrain = new Map<SpendLimitGrain, RuleAggInput[]>()
  const budgetOnlyRuleByGrain = new Map<SpendLimitGrain, boolean>()
  let ruleIndex = 0

  rows.forEach((row, potIndex) => {
    const period = toPeriodKind(row.period)
    const grain = SPEND_LIMIT_GRAIN_BY_PERIOD[period]
    const ruleRows = rulesByLimit.get(row.id) ?? []
    const indexes: number[] = []

    const rules: SpendLimitRuleConfig[] = ruleRows.map((rule) => {
      const budgetIds = rule.budget_ids ?? []
      const keys = rule.counterparty_keys ?? []
      const labels = rule.counterparty_labels ?? []
      const includeChildren = rule.include_child_budgets !== false

      const i = ruleIndex++
      indexes.push(i)
      ruleIdByIndex.set(i, rule.id)

      const list = aggInputByGrain.get(grain) ?? []
      list.push({
        p: potIndex,
        i,
        // De subboom wordt HIER opgerold en niet in SQL: `budgets.parent_id` is
        // een boom en een recursieve CTE per regel zou dezelfde wandeling in een
        // tweede taal herhalen. Eén boomwandeling, één waarheid.
        b: [...collectBudgetIds(budgetIds, includeChildren, childrenByParent)],
        k: keys.filter((k) => k.length > 0),
      })
      aggInputByGrain.set(grain, list)
      if (budgetIds.length > 0 && keys.length === 0) budgetOnlyRuleByGrain.set(grain, true)

      return {
        id: rule.id,
        budgets: budgetIds.map((id) => ({
          id,
          name: budgetNameById.get(id) ?? null,
          archived: archivedBudgetIds.has(id),
        })),
        includeChildBudgets: includeChildren,
        // Sleutel en label lopen parallel (CHECK `spend_limit_rules_counterparty_pairs`);
        // de sleutel is de terugval als het label ooit leeg zou zijn.
        counterparties: keys.map((key, idx) => ({ key, label: labels[idx] || key })),
      }
    })

    ruleIndexesByLimit.set(row.id, indexes)
    configByLimit.set(row.id, {
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      ruleType: deriveSpendLimitRuleType(rules),
      rules,
      limitAmount: Number(row.limit_amount),
      period,
      isActive: row.is_active,
      createdAt: row.created_at,
    })
  })

  // ── Per korrel: unie-venster, chunks, één call per stuk ───────────────────
  // De vroegste `since` over de periodesoorten die deze gebruiker daadwerkelijk
  // gebruikt — uit de motor, zodat er geen tweede periodesleutel-/datumrekening
  // ontstaat. Een jaarpot trekt het venster naar 4 kalenderjaren, een dagpot naar
  // 31 dagen; per korrel wint de langste.
  const to = localMonthBounds(now).end
  const fromByGrain = new Map<SpendLimitGrain, string>()
  for (const row of rows) {
    const period = toPeriodKind(row.period)
    const grain = SPEND_LIMIT_GRAIN_BY_PERIOD[period]
    const first = resolveSpendLimitPeriods(period, now, SPEND_LIMIT_WINDOW_BY_PERIOD[period])[0]
    const current = fromByGrain.get(grain)
    if (!current || first.since < current) fromByGrain.set(grain, first.since)
  }

  let aggregateTruncationSuspected = false
  const noteChunkSize = (bron: string, length: number) => {
    if (length < POSTGREST_MAX_ROWS) return
    aggregateTruncationSuspected = true
    console.warn(
      `[spend-limits:loader] mogelijke afkapping — ${bron} gaf ${length} rijen terug (max_rows=${POSTGREST_MAX_ROWS})`,
    )
  }

  const grainCalls: { grain: SpendLimitGrain; promise: Promise<{ data: unknown; error: unknown }> }[] = []
  for (const [grain, ruleInputs] of aggInputByGrain) {
    if (ruleInputs.length === 0) continue
    const from = fromByGrain.get(grain) ?? to
    const chunks = buildAggregateChunks(
      from,
      to,
      aggregateChunkMonths(grain, budgetOnlyRuleByGrain.get(grain) === true),
    )
    for (const c of chunks) {
      grainCalls.push({
        grain,
        promise: supabase.rpc('spend_limit_rule_aggregate', {
          p_rules: ruleInputs,
          p_from: c.from,
          p_to: c.to,
          p_grain: grain,
        }) as unknown as Promise<{ data: unknown; error: unknown }>,
      })
    }
  }

  const [aggResults, resolvedDailyRate] = await Promise.all([
    Promise.all(grainCalls.map((c) => c.promise)),
    wantDailyRate ? resolveDailyExpenseRate(supabase, now) : Promise.resolve(null),
  ])

  /** Alle aggregaat-rijen, gegroepeerd op regelindex. */
  const rowsByRuleIndex = new Map<number, RuleAggRow[]>()
  aggResults.forEach((res, i) => {
    if (res.error) {
      console.error(`[spend-limits:loader] regel-aggregaat (${grainCalls[i].grain}) mislukt`, res.error)
    }
    const data = (res.data ?? []) as RuleAggRow[]
    noteChunkSize(`spend_limit_rule_aggregate:${grainCalls[i].grain}`, data.length)
    for (const r of data) {
      const list = rowsByRuleIndex.get(r.rule_index) ?? []
      list.push(r)
      rowsByRuleIndex.set(r.rule_index, list)
    }
  })

  // ── Per pot: rijen bundelen en de motor laten rekenen ─────────────────────
  const limits: SpendLimitWithReport[] = []

  for (const row of rows) {
    const config = configByLimit.get(row.id) as SpendLimitConfig
    const windowPeriods = SPEND_LIMIT_WINDOW_BY_PERIOD[config.period]
    const indexes = ruleIndexesByLimit.get(row.id) ?? []

    // De SQL heeft binnen de pot al ontdubbeld (laagste regelindex wint), dus de
    // rijen van alle regels mogen zonder meer bij elkaar: geen transactie zit in
    // twee van deze lijsten.
    const potRows: { ruleIndex: number; row: RuleAggRow }[] = []
    for (const i of indexes) {
      for (const r of rowsByRuleIndex.get(i) ?? []) potRows.push({ ruleIndex: i, row: r })
    }

    const engineRows: SpendLimitAggregateRow[] = potRows.map(({ row: r }) => ({
      bucketStart: r.bucket_start,
      transactionType: r.transaction_type,
      sumPositief: Number(r.sum_positief),
      sumNegatief: Number(r.sum_negatief),
      count: Number(r.count),
      matchedNames: r.matched_names ?? [],
    }))

    const slices = resolveSpendLimitPeriods(config.period, now, windowPeriods)

    limits.push({
      config,
      report: buildSpendLimitReport({
        // `createdAt` is GEEN optioneel extraatje: `computeSpendLimitTrend` past
        // de aanmaak-ondergrens (`closedPeriodsSinceCreation`) alléén toe als dit
        // veld gevuld is, en deze loader is blijkens de motor-docstring de enige
        // adapter die 'm kan vullen. Zonder deze regel is de ondergrens in
        // productie dood: kaart, pane en widget tonen dan een richting over lege
        // periodes van vóór het bestaan van de pot.
        rule: {
          ruleType: config.ruleType,
          limitAmount: config.limitAmount,
          period: config.period,
          createdAt: config.createdAt,
        },
        rows: engineRows,
        now,
        windowPeriods,
      }),
      budgetSplit: buildBudgetSplit(potRows, slices, budgetNameById),
      ruleSplit: buildRuleSplit(potRows, slices, ruleIdByIndex),
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
 * komt uit `sliceContainsBucket` (motor) en de netto-uitgave uit
 * `netSpendFromSums` (motor), precies zoals `computePeriodOutcome`.
 *
 * Rijen zonder `budget_id` worden overgeslagen. Dat is geen defensieve check maar
 * de kern van het contract: de SQL vult die kolom uitsluitend op maand-korrel
 * voor regels zonder tegenpartij-dimensie (zie de migratie). Bij een dag-/weekpot
 * of een gemengde regel blijft deze uitsplitsing dus leeg, en valt de pane terug
 * op `ruleSplit`.
 *
 * Het is een UITSPLITSING, geen rapport: er zit bewust geen status, grens of
 * overschrijding in. Die horen bij de pot als geheel en hebben één eigenaar.
 *
 * DE TRANSFER-FILTER ZIT AL IN DE MOTOR-KANT? Nee — en dat is hier het addertje.
 * `computePeriodOutcome` gooit (joint_)transfer-rijen eruit met `isRealAggRow`;
 * deze uitsplitsing moet exact dezelfde verzameling beschrijven, anders telt de
 * som van de balkjes niet op tot het bedrag ernaast. Vandaar dezelfde filter.
 */
function buildBudgetSplit(
  potRows: readonly { ruleIndex: number; row: RuleAggRow }[],
  slices: readonly SpendLimitPeriodSlice[],
  budgetNameById: ReadonlyMap<string, string>,
): SpendLimitBudgetSplitRow[] {
  const byKey = new Map<string, SpendLimitBudgetSplitRow>()

  for (const { row: r } of potRows) {
    if (!r.budget_id) continue
    if (!isCountableAggRow(r)) continue
    const slice = slices.find((s) => sliceContainsBucket(s, r.bucket_start))
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
    // Netto uitgave: de motorregel, niet een kopie ervan.
    entry.matchedAmount += netSpendFromSums(r.sum_negatief, r.sum_positief)
    entry.matchedTransactionCount += Number(r.count)
  }

  // Geen tweede −0-normalisatie op de som: elke term komt genormaliseerd binnen
  // en `entry.matchedAmount` start op +0 — in IEEE-754 is een som alleen −0 als
  // álle termen −0 zijn, en dat kan hier per constructie niet meer.
  return [...byKey.values()]
}

/**
 * Per-REGEL-uitsplitsing per periode: "wat droeg deze regel bij".
 *
 * Werkt bij élke regelvorm en élke periodesoort, want ze leunt alleen op de
 * regelindex die het aggregaat tóch al teruggeeft. De som over de regels van een
 * periode is per constructie gelijk aan `periodMatchedAmount` uit het rapport —
 * dezelfde rijen, dezelfde transfer-filter, dezelfde netto-regel — en dat is de
 * hele reden dat deze uitsplitsing geen tweede waarheid kan worden.
 */
function buildRuleSplit(
  potRows: readonly { ruleIndex: number; row: RuleAggRow }[],
  slices: readonly SpendLimitPeriodSlice[],
  ruleIdByIndex: ReadonlyMap<number, string>,
): SpendLimitRuleSplitRow[] {
  const byKey = new Map<string, SpendLimitRuleSplitRow>()

  for (const { ruleIndex, row: r } of potRows) {
    if (!isCountableAggRow(r)) continue
    const ruleId = ruleIdByIndex.get(ruleIndex)
    if (!ruleId) continue
    const slice = slices.find((s) => sliceContainsBucket(s, r.bucket_start))
    if (!slice) continue
    const key = `${slice.periodKey}|${ruleId}`
    let entry = byKey.get(key)
    if (!entry) {
      entry = {
        periodKey: slice.periodKey,
        ruleId,
        matchedAmount: 0,
        matchedTransactionCount: 0,
      }
      byKey.set(key, entry)
    }
    entry.matchedAmount += netSpendFromSums(r.sum_negatief, r.sum_positief)
    entry.matchedTransactionCount += Number(r.count)
  }

  return [...byKey.values()]
}

/**
 * Dezelfde transfer-uitsluiting als de motor. Eigen-rekening-overboekingen zijn
 * geen uitgave; de typelijst heeft één eigenaar (`isRealAggRow`) en die wordt
 * hier hergebruikt in plaats van gekopieerd.
 */
function isCountableAggRow(row: RuleAggRow): boolean {
  return isRealAggRow({ transaction_type: row.transaction_type })
}
