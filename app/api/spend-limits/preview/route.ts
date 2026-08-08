import { NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { localMonthBounds } from '@/lib/month-range'
import {
  fetchTxMonthAggregate,
  isRealAggRow,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import {
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  computePeriodOutcome,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodSlice,
  type SpendLimitRuleType,
} from '@/lib/spend-limits/engine'
import { buildAggregateChunks, collectBudgetIds } from '@/lib/spend-limits/loader'
import { spendLimitCounterpartyKey } from '@/lib/spend-limits/counterparty-key'
import { spendLimitPreviewSchema } from '@/lib/spend-limits/schema'
import {
  SPEND_LIMIT_MIN_MATCH_KEY_LENGTH,
  findOverlappingLimits,
  type SpendLimitOverlap,
  type SpendLimitOverlapSubject,
} from '@/lib/spend-limits/overlap'

/**
 * POST /api/spend-limits/preview — "wat raakt deze regel eigenlijk?"
 *
 * ── WAAROM DE SERVER DE ENIGE MATCH-AUTORITEIT IS (FR-B3-05/NFR-B3-01) ──────
 * De verleiding is om de al geladen suggestielijst client-side te filteren. Die
 * lijst is een TOP-40; tik je "SHELL" terwijl "Shell #57" net buiten die top
 * valt, dan meldt zo'n filter "geen matches" terwijl de pot straks wél telt. Dat
 * zou een tweede, foutieve waarheid naast de echte som zetten — en het hele punt
 * van een preview is dat je mag geloven wat je ziet. De sleutel wordt daarom
 * hier afgeleid (`spendLimitCounterpartyKey`, de TS-helft van het SQL-parity-paar)
 * en de som komt uit dezelfde RPC die de pot straks voedt.
 *
 * ── TWEE REGELSOORTEN, ÉÉN ANTWOORDVORM ─────────────────────────────────────
 * Een preview die alleen tegenpartij-regels kende, liet de gebruiker bij een
 * budget-pot alsnog blind opslaan. Beide takken lopen daarom door dezelfde
 * MOTORFUNCTIES als de loader — `resolveSpendLimitPeriods` voor het venster,
 * `computePeriodOutcome` voor de optelling, `collectBudgetIds` voor de subboom —
 * zodat het bedrag dat je vóór opslaan ziet exact het bedrag is dat de pot daarna
 * toont. De grens staat in beide takken op 0: er is nog geen grens gekozen, dus de
 * grens-afhankelijke velden (status, headroom, isNearLimit) worden bewust
 * WEGGEGOOID. Een tweede, betekenisloze status naast het echte rapport zou de
 * gebruiker een oordeel tonen dat nog niet bestaat.
 *
 * ── WAAROM ALLEEN DE BUDGET-TAK CHUNKT ──────────────────────────────────────
 * `tx_counterparty_month_aggregate` groepeert op (sleutel × maand × type) en de
 * preview vraagt altijd ÉÉN sleutel: 48 maanden × 1 × ~3 types ≈ 150 rijen, dus
 * structureel ver onder de PostgREST `max_rows`-cap (=1000). `tx_month_aggregate`
 * groepeert op (budget × maand × type) en kent geen sleutelfilter: 48 maanden ×
 * tientallen budgetten × types haalt die cap wél. Die tak knipt het venster
 * daarom in dezelfde stukken als de loader (`buildAggregateChunks`) — dezelfde
 * knipregel, anders kan de preview op een andere plek afkappen dan de pot. Beide
 * takken dragen de kanarie: liever "dit kan te laag zijn" dan stil een te laag
 * getal.
 *
 * ── WAAROM POST EN TOCH `getAuthClaims` ─────────────────────────────────────
 * De methode is POST omdat het label in de body hoort (een tegenpartij in een
 * query-string belandt in access-logs), maar de handler SCHRIJFT niets. De
 * getUser()-regel voor mutatieroutes (ADR 0052) geldt daarom niet; lokale
 * JWKS-verificatie volstaat en scheelt een auth-roundtrip per toetsaanslag-
 * pauze. Alle DB-toegang loopt onder de RLS van de ingelogde gebruiker —
 * nooit de service-role, want de aggregaat-RPC's zijn SECURITY INVOKER en zouden
 * daaronder over álle gebruikers rekenen.
 *
 * ── DEBOUNCE ZIT IN HET FORMULIER, NIET HIER (FR-B3-03) ─────────────────────
 * Deze handler is idempotent en goedkoop: hooguit drie queries, geen schrijfactie,
 * geen cache-invalidatie. Het formulier debounced (400 ms) en annuleert de vorige
 * vlucht; de server hoeft daar niets voor te onthouden.
 */

/** Eén periode uit het preview-venster. Bewust ZONDER status/grens: er is nog geen grens. */
export interface SpendLimitPreviewPeriodMatch {
  periodKey: string
  label: string
  /** True voor de lopende periode — die is voorlopig, precies als in de motor. */
  isOpen: boolean
  /** Netto gerealiseerde uitgave in deze periode (refunds verrekend, transfers eruit). */
  matchedAmount: number
  matchedTransactionCount: number
}

/**
 * Het responscontract. Consumenten importeren dit met `import type`, zodat er
 * geen server-code de client in wordt getrokken (staand patroon, zie
 * `@/app/api/notifications/route`).
 */
export interface SpendLimitPreviewResponse {
  /**
   * `too_short` = het tegenpartij-label houdt na normalisatie te weinig over om
   * zinnig op te matchen. Een EXPLICIETE uitkomst en geen lege trefferlijst: "0
   * matches" halverwege het typen is misleidend, en een validatiefout zou het
   * formulier laten schreeuwen terwijl de gebruiker nog bezig is (AC-B3-03).
   * Een budget-regel kent deze staat niet: een budget kies je, je typt het niet.
   */
  status: 'ok' | 'too_short'
  /** Welke tak dit antwoord beschrijft — spiegelt de discriminator uit de body. */
  ruleType: SpendLimitRuleType
  /**
   * De genormaliseerde zoeksleutel die de server afleidde — de UI legt 'm uit.
   * `null` bij een budget-regel: die matcht op budget-id, niet op tekst.
   */
  key: string | null
  period: SpendLimitPeriodKind
  /**
   * Wat er in dit venster daadwerkelijk meetelde, alfabetisch: bij een
   * tegenpartij-regel de gematchte SCHRIJFWIJZEN, bij een budget-regel de
   * (sub)BUDGETTEN waarop geboekt is. Eén veld, één betekenis — "welke
   * onderliggende dingen zitten in dit bedrag" — zodat het formulier niet per
   * regelsoort een ander veld hoeft te kennen.
   */
  matchedNames: string[]
  matchedTransactionCount: number
  matchedAmountByPeriod: SpendLimitPreviewPeriodMatch[]
  /** Regel-observatie: welke bestaande potten zien mogelijk dezelfde uitgaven. */
  overlappingLimits: SpendLimitOverlap[]
  /**
   * Een aggregaat kwam terug op de PostgREST-cap; de sommen kunnen stil te laag
   * zijn. Het oppervlak zegt dat erbij in plaats van een te laag getal te tonen.
   */
  aggregateTruncationSuspected: boolean
}

/** De rauwe RPC-vorm van het tegenpartij-aggregaat; blijft binnen deze route. */
interface CounterpartyAggRow {
  counterparty_key: string
  month: string
  transaction_type: string | null
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
  matched_names: string[] | null
}

interface SpendLimitConfigRow {
  id: string
  name: string
  rule_type: string
  counterparty_key: string | null
  budget_id: string | null
  include_child_budgets: boolean | null
  is_active: boolean
}

interface BudgetRow {
  id: string
  name: string
  parent_id: string | null
}

/** De kolommen die de overlap-observatie nodig heeft — nooit `select('*')`. */
const LIMIT_COLUMNS = 'id, name, rule_type, counterparty_key, budget_id, include_child_budgets, is_active'

/** Zie lib/spend-limits/loader.ts — dezelfde cap, dezelfde kanarie-redenering. */
const POSTGREST_MAX_ROWS = 1000

function emptyPreview(
  status: SpendLimitPreviewResponse['status'],
  ruleType: SpendLimitRuleType,
  key: string | null,
  period: SpendLimitPeriodKind,
): SpendLimitPreviewResponse {
  return {
    status,
    ruleType,
    key,
    period,
    matchedNames: [],
    matchedTransactionCount: 0,
    matchedAmountByPeriod: [],
    overlappingLimits: [],
    aggregateTruncationSuspected: false,
  }
}

/**
 * Het venster van de gekozen periodesoort, uit de MOTOR — geen tweede
 * periodesleutel- of datumrekening in deze route (D-P3). De bovengrens is de 1e
 * van de volgende maand: half-open, exact zoals de RPC's zelf rekenen
 * (`t.date >= p_from AND t.date < p_to`).
 */
function resolveWindow(period: SpendLimitPeriodKind, now: Date) {
  const slices = resolveSpendLimitPeriods(period, now, SPEND_LIMIT_WINDOW_BY_PERIOD[period])
  return { slices, from: slices[0].since, to: localMonthBounds(now).end }
}

/**
 * De periode-uitkomsten via de motor. Identiek voor beide regelsoorten: de
 * optelling (refund-verrekening, transfer-uitsluiting, bereik-match op
 * kalendermaanden, −0-normalisatie) heeft één eigenaar.
 *
 * `counterpartyNames` komt uit dezelfde uitkomst en niet uit de rauwe rijen: zo
 * vallen transfer-rijen daar net zo hard uit als bij het bedrag. Bij budget-rijen
 * blijft die set leeg (het maandaggregaat draagt geen namen).
 */
function summarise(
  slices: SpendLimitPeriodSlice[],
  engineRows: SpendLimitAggregateRow[],
): {
  periods: SpendLimitPreviewPeriodMatch[]
  totalCount: number
  counterpartyNames: Set<string>
} {
  let totalCount = 0
  const counterpartyNames = new Set<string>()
  const periods = slices.map((slice) => {
    const outcome = computePeriodOutcome(slice, engineRows, 0)
    totalCount += outcome.matchedTransactionCount
    for (const n of outcome.matchedCounterpartyNames) counterpartyNames.add(n)
    return {
      periodKey: outcome.periodKey,
      label: outcome.label,
      isOpen: outcome.isOpen,
      matchedAmount: outcome.periodMatchedAmount,
      matchedTransactionCount: outcome.matchedTransactionCount,
    }
  })
  return { periods, totalCount, counterpartyNames }
}

function noteTruncation(bron: string, rowCount: number): boolean {
  if (rowCount < POSTGREST_MAX_ROWS) return false
  console.warn(
    `[spend-limits:preview] mogelijke afkapping — ${bron} gaf ${rowCount} rijen terug (max_rows=${POSTGREST_MAX_ROWS})`,
  )
  return true
}

/**
 * Een query-fout die als HTTP-respons naar buiten moet. Beide takken doen meerdere
 * queries in één `Promise.all`; zonder dit zou elke tak zijn eigen
 * `if (error) return …`-ladder moeten dragen en zou een fout in een chunk stil
 * kunnen verdwijnen achter een gedeeltelijk antwoord.
 */
class RouteError extends Error {
  constructor(readonly response: Response) {
    super('spend-limits-preview')
  }
}

function failOn(error: unknown): never {
  throw new RouteError(serverError(error, 'spend-limits-preview:POST'))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(spendLimitPreviewSchema, req)
  if (!parsed.ok) return parsed.response

  const input = parsed.data
  const { period, excludeLimitId } = input
  const now = new Date()

  try {
    if (input.ruleType === 'counterparty') {
      return NextResponse.json(
        await previewCounterparty(supabase, {
          label: input.counterpartyLabel,
          period,
          excludeLimitId: excludeLimitId ?? null,
          now,
        }),
      )
    }
    return NextResponse.json(
      await previewBudget(supabase, {
        budgetId: input.budgetId,
        includeChildBudgets: input.includeChildBudgets,
        period,
        excludeLimitId: excludeLimitId ?? null,
        now,
      }),
    )
  } catch (err) {
    // `RouteError` draagt een al opgebouwde foutrespons uit een mislukte query;
    // al het andere is een echte uitzondering.
    if (err instanceof RouteError) return err.response
    return serverError(err, 'spend-limits-preview:POST')
  }
}

// ── Tegenpartij-tak ─────────────────────────────────────────────────────────

async function previewCounterparty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { label: string; period: SpendLimitPeriodKind; excludeLimitId: string | null; now: Date },
): Promise<SpendLimitPreviewResponse> {
  const key = spendLimitCounterpartyKey(args.label)
  if (key.length < SPEND_LIMIT_MIN_MATCH_KEY_LENGTH) {
    return emptyPreview('too_short', 'counterparty', key, args.period)
  }

  const { slices, from, to } = resolveWindow(args.period, args.now)

  const [aggResult, limitsResult] = await Promise.all([
    supabase.rpc('tx_counterparty_month_aggregate', {
      p_from: from,
      p_to: to,
      p_keys: [key],
      // Zelfde grondslag als de loader: je eigen boekingen plus de gedeelde
      // huishoudboekingen die de RLS je toont, ongeschaald. Een preview die een
      // andere verzameling telt dan de pot straks, is geen preview.
      p_own_only: false,
    }),
    supabase
      .from('spend_limits')
      .select(LIMIT_COLUMNS)
      .eq('is_archived', false)
      .eq('rule_type', 'counterparty'),
  ])

  if (aggResult.error) failOn(aggResult.error)
  if (limitsResult.error) failOn(limitsResult.error)

  const aggRows = (aggResult.data ?? []) as CounterpartyAggRow[]

  const engineRows: SpendLimitAggregateRow[] = aggRows
    .filter((r) => r.counterparty_key === key)
    .map((r) => ({
      month: r.month,
      transactionType: r.transaction_type,
      sumPositief: Number(r.sum_positief),
      sumNegatief: Number(r.sum_negatief),
      count: Number(r.count),
      matchedNames: r.matched_names ?? [],
    }))

  const { periods, totalCount, counterpartyNames } = summarise(slices, engineRows)

  const existing: SpendLimitOverlapSubject[] = ((limitsResult.data ?? []) as SpendLimitConfigRow[]).map(
    (r) => ({
      id: r.id,
      name: r.name,
      ruleType: 'counterparty',
      isActive: r.is_active,
      counterpartyKey: r.counterparty_key,
    }),
  )

  return {
    status: 'ok',
    ruleType: 'counterparty',
    key,
    period: args.period,
    matchedNames: [...counterpartyNames].sort(),
    matchedTransactionCount: totalCount,
    matchedAmountByPeriod: periods,
    overlappingLimits: findOverlappingLimits(
      { ruleType: 'counterparty', counterpartyKey: key, id: args.excludeLimitId },
      existing,
    ),
    aggregateTruncationSuspected: noteTruncation('tx_counterparty_month_aggregate', aggRows.length),
  }
}

// ── Budget-tak ──────────────────────────────────────────────────────────────

async function previewBudget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    budgetId: string
    includeChildBudgets: boolean
    period: SpendLimitPeriodKind
    excludeLimitId: string | null
    now: Date
  },
): Promise<SpendLimitPreviewResponse> {
  const { slices, from, to } = resolveWindow(args.period, args.now)
  const chunks = buildAggregateChunks(from, to)

  const [budgetsResult, limitsResult, ...chunkResults] = await Promise.all([
    // ALLE budgetten, ook gearchiveerde: de subboom-wandeling mag geen tak
    // verliezen doordat een tussenliggend budget gearchiveerd is — de historische
    // boekingen eronder tellen wel degelijk mee.
    supabase.from('budgets').select('id, name, parent_id'),
    supabase.from('spend_limits').select(LIMIT_COLUMNS).eq('is_archived', false).eq('rule_type', 'budget'),
    ...chunks.map((c) => fetchTxMonthAggregate(supabase, { from: c.from, to: c.to })),
  ])

  if (budgetsResult.error) failOn(budgetsResult.error)
  if (limitsResult.error) failOn(limitsResult.error)

  const budgets = (budgetsResult.data ?? []) as BudgetRow[]
  const childrenByParent = new Map<string, string[]>()
  const budgetNameById = new Map<string, string>()
  for (const b of budgets) {
    budgetNameById.set(b.id, b.name)
    if (!b.parent_id) continue
    const list = childrenByParent.get(b.parent_id) ?? []
    list.push(b.id)
    childrenByParent.set(b.parent_id, list)
  }

  // Exact dezelfde subboom als de loader straks optelt — één boomwandeling.
  const budgetIds = collectBudgetIds(args.budgetId, args.includeChildBudgets, childrenByParent)

  let aggregateTruncationSuspected = false
  const potRows: TxMonthAggregateRow[] = []
  for (const res of chunkResults) {
    if (res.error) failOn(res.error)
    const rows = (res.data ?? []) as TxMonthAggregateRow[]
    if (noteTruncation('tx_month_aggregate', rows.length)) aggregateTruncationSuspected = true
    for (const r of rows) if (r.budget_id && budgetIds.has(r.budget_id)) potRows.push(r)
  }

  const engineRows: SpendLimitAggregateRow[] = potRows.map((r) => ({
    month: r.month,
    transactionType: r.transaction_type,
    sumPositief: Number(r.sum_positief),
    sumNegatief: Number(r.sum_negatief),
    count: Number(r.count),
  }))

  const { periods, totalCount } = summarise(slices, engineRows)

  // Welke (sub)budgetten dragen hier daadwerkelijk boekingen? Zelfde
  // transfer-filter als de motor, zodat de opsomming dezelfde verzameling
  // beschrijft als het bedrag ernaast.
  const names = new Set<string>()
  for (const r of potRows) {
    if (!isRealAggRow(r)) continue
    if (!r.budget_id) continue
    names.add(budgetNameById.get(r.budget_id) ?? r.budget_id)
  }

  const existing: SpendLimitOverlapSubject[] = ((limitsResult.data ?? []) as SpendLimitConfigRow[]).map(
    (r) => ({
      id: r.id,
      name: r.name,
      ruleType: 'budget',
      isActive: r.is_active,
      budgetId: r.budget_id,
      includeChildBudgets: r.include_child_budgets,
    }),
  )

  return {
    status: 'ok',
    ruleType: 'budget',
    key: null,
    period: args.period,
    matchedNames: [...names].sort(),
    matchedTransactionCount: totalCount,
    matchedAmountByPeriod: periods,
    overlappingLimits: findOverlappingLimits(
      {
        ruleType: 'budget',
        budgetId: args.budgetId,
        includeChildBudgets: args.includeChildBudgets,
        id: args.excludeLimitId,
      },
      existing,
      childrenByParent,
    ),
    aggregateTruncationSuspected,
  }
}
