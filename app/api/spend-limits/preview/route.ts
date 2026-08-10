import { NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { localMonthBounds } from '@/lib/month-range'
import { isRealAggRow } from '@/lib/server-data/tx-aggregates'
import {
  SPEND_LIMIT_GRAIN_BY_PERIOD,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  computePeriodOutcome,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
  type SpendLimitPeriodSlice,
  type SpendLimitRuleType,
} from '@/lib/spend-limits/engine'
import {
  aggregateChunkMonths,
  buildAggregateChunks,
  collectBudgetIds,
  deriveSpendLimitRuleType,
} from '@/lib/spend-limits/loader'
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
 * van een preview is dat je mag geloven wat je ziet. De sleutels worden daarom
 * hier afgeleid (`spendLimitCounterpartyKey`, de TS-helft van het SQL-parity-paar)
 * en de som komt uit dezelfde RPC die de pot straks voedt.
 *
 * ── ÉÉN REGELVORM, ÉÉN ANTWOORDVORM (sinds 10-08-2026) ──────────────────────
 * Tot fase 5 had deze route twee takken (budget óf tegenpartij). Een regel kan nu
 * beide dimensies tegelijk dragen — "budget X ÉN tegenpartij Y" — dus is er niets
 * meer om op te splitsen: één pad, dat exact dezelfde MOTORFUNCTIES draait als de
 * loader (`resolveSpendLimitPeriods` voor het venster, `computePeriodOutcome`
 * voor de optelling, `collectBudgetIds` voor de subboom) en exact hetzelfde
 * aggregaat aanroept. Het bedrag dat je vóór opslaan ziet, is daarmee het bedrag
 * dat de pot daarna toont.
 *
 * De grens staat op 0: er is nog geen grens gekozen, dus de grens-afhankelijke
 * velden (status, headroom, isNearLimit) worden bewust WEGGEGOOID. Een tweede,
 * betekenisloze status naast het echte rapport zou de gebruiker een oordeel tonen
 * dat nog niet bestaat.
 *
 * ── WAAROM POST EN TOCH `getAuthClaims` ─────────────────────────────────────
 * De methode is POST omdat de labels in de body horen (een tegenpartij in een
 * query-string belandt in access-logs), maar de handler SCHRIJFT niets. De
 * getUser()-regel voor mutatieroutes (ADR 0052) geldt daarom niet; lokale
 * JWKS-verificatie volstaat en scheelt een auth-roundtrip per toetsaanslag-
 * pauze. Alle DB-toegang loopt onder de RLS van de ingelogde gebruiker —
 * nooit de service-role, want het aggregaat is SECURITY INVOKER en zou daaronder
 * over álle gebruikers rekenen.
 *
 * ── DEBOUNCE ZIT IN HET FORMULIER, NIET HIER (FR-B3-03) ─────────────────────
 * Deze handler is idempotent en goedkoop: hooguit een handvol queries, geen
 * schrijfactie, geen cache-invalidatie. Het formulier debounced (400 ms) en
 * annuleert de vorige vlucht; de server hoeft daar niets voor te onthouden.
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
   * `too_short` = er zijn wél tegenpartij-labels ingevuld, maar géén ervan houdt
   * na normalisatie genoeg over om zinnig op te matchen. Een EXPLICIETE uitkomst
   * en geen lege trefferlijst: "0 matches" halverwege het typen is misleidend, en
   * een validatiefout zou het formulier laten schreeuwen terwijl de gebruiker nog
   * bezig is (AC-B3-03). Houdt minstens één label wél iets over, dan telt de
   * preview gewoon door op de bruikbare sleutels.
   */
  status: 'ok' | 'too_short'
  /** Waar deze regel over gaat, afgeleid uit de ingevulde dimensies. */
  ruleType: SpendLimitRuleType
  /**
   * De genormaliseerde zoeksleutels die de server afleidde — de UI legt ze uit.
   * Leeg bij een regel zonder tegenpartij-dimensie: die matcht op budget-id, niet
   * op tekst.
   */
  keys: string[]
  period: SpendLimitPeriodKind
  /**
   * Wat er in dit venster daadwerkelijk meetelde, alfabetisch: bij een
   * tegenpartij-dimensie de gematchte SCHRIJFWIJZEN, bij een zuivere budget-regel
   * de (sub)BUDGETTEN waarop geboekt is. Eén veld, één betekenis — "welke
   * onderliggende dingen zitten in dit bedrag".
   *
   * LEEG bij een zuivere budget-regel op DAG- of WEEKgrens: het aggregaat draagt
   * daar bewust geen budget-uitsplitsing (zie de migratie — rijcap). Het bedrag
   * klopt onverkort; alleen de opsomming eronder ontbreekt.
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

/** Eén rij uit `public.spend_limit_rule_aggregate`; blijft binnen deze route. */
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

interface BudgetRow {
  id: string
  name: string
  parent_id: string | null
}

interface LimitWithRulesRow {
  id: string
  name: string
  is_active: boolean
  spend_limit_rules:
    | {
        budget_ids: string[] | null
        include_child_budgets: boolean | null
        counterparty_keys: string[] | null
      }[]
    | null
}

/** De kolommen die de overlap-observatie nodig heeft — nooit `select('*')`. */
const LIMIT_COLUMNS =
  'id, name, is_active, spend_limit_rules(budget_ids, include_child_budgets, counterparty_keys)'

/** Zie lib/spend-limits/loader.ts — dezelfde cap, dezelfde kanarie-redenering. */
const POSTGREST_MAX_ROWS = 1000

function emptyPreview(
  status: SpendLimitPreviewResponse['status'],
  ruleType: SpendLimitRuleType,
  keys: string[],
  period: SpendLimitPeriodKind,
): SpendLimitPreviewResponse {
  return {
    status,
    ruleType,
    keys,
    period,
    matchedNames: [],
    matchedTransactionCount: 0,
    matchedAmountByPeriod: [],
    overlappingLimits: [],
    aggregateTruncationSuspected: false,
  }
}

/**
 * De periode-uitkomsten via de motor: de optelling (refund-verrekening,
 * transfer-uitsluiting, bereik-match, −0-normalisatie) heeft één eigenaar.
 *
 * `counterpartyNames` komt uit dezelfde uitkomst en niet uit de rauwe rijen: zo
 * vallen transfer-rijen daar net zo hard uit als bij het bedrag.
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

function noteTruncation(rowCount: number): boolean {
  if (rowCount < POSTGREST_MAX_ROWS) return false
  console.warn(
    `[spend-limits:preview] mogelijke afkapping — spend_limit_rule_aggregate gaf ${rowCount} rijen terug (max_rows=${POSTGREST_MAX_ROWS})`,
  )
  return true
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(spendLimitPreviewSchema, req)
  if (!parsed.ok) return parsed.response

  const { budgetIds, includeChildBudgets, counterpartyLabels, period, excludeLimitId } = parsed.data
  const now = new Date()

  // De sleutels: genormaliseerd, ontdaan van te korte ruis. Zijn er wél labels
  // maar houdt geen enkele iets over, dan is dat een EIGEN uitkomst — geen lege
  // trefferlijst en geen validatiefout (AC-B3-03).
  const keys = counterpartyLabels
    .map((l) => spendLimitCounterpartyKey(l))
    .filter((k) => k.length >= SPEND_LIMIT_MIN_MATCH_KEY_LENGTH)

  const ruleType = deriveSpendLimitRuleType([
    {
      id: 'preview',
      budgets: budgetIds.map((id) => ({ id, name: null, archived: false })),
      includeChildBudgets,
      counterparties: keys.map((key) => ({ key, label: key })),
    },
  ])

  if (counterpartyLabels.length > 0 && keys.length === 0) {
    return NextResponse.json(emptyPreview('too_short', ruleType, keys, period))
  }
  if (budgetIds.length === 0 && keys.length === 0) {
    // Leeg formulier: een lege preview, geen 400. Een regel zonder dimensies zou
    // bovendien op álles matchen — die vraag stellen we de database niet eens.
    return NextResponse.json(emptyPreview('ok', ruleType, keys, period))
  }

  try {
    const grain = SPEND_LIMIT_GRAIN_BY_PERIOD[period]
    const slices = resolveSpendLimitPeriods(period, now, SPEND_LIMIT_WINDOW_BY_PERIOD[period])
    const from = slices[0].since
    // De bovengrens is de 1e van de volgende maand: half-open, exact zoals de
    // RPC zelf rekent (`t.date >= p_from AND t.date < p_to`).
    const to = localMonthBounds(now).end

    const [budgetsResult, limitsResult] = await Promise.all([
      // ALLE budgetten, ook gearchiveerde: de subboom-wandeling mag geen tak
      // verliezen doordat een tussenliggend budget gearchiveerd is — de
      // historische boekingen eronder tellen wel degelijk mee. Ook nodig bij een
      // zuivere tegenpartij-regel: de overlap-observatie vergelijkt tegen
      // bestaande BUDGET-potten en heeft daar dezelfde boom voor nodig.
      supabase.from('budgets').select('id, name, parent_id'),
      supabase.from('spend_limits').select(LIMIT_COLUMNS).eq('is_archived', false),
    ])

    if (budgetsResult.error) return serverError(budgetsResult.error, 'spend-limits-preview:POST')
    if (limitsResult.error) return serverError(limitsResult.error, 'spend-limits-preview:POST')

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
    const expandedBudgetIds = [
      ...collectBudgetIds(budgetIds, includeChildBudgets, childrenByParent),
    ]

    // Dezelfde knipregel als de loader: anders kan de preview op een andere plek
    // afkappen dan de pot die eruit ontstaat.
    const chunks = buildAggregateChunks(
      from,
      to,
      aggregateChunkMonths(grain, expandedBudgetIds.length > 0 && keys.length === 0),
    )

    const chunkResults = await Promise.all(
      chunks.map((c) =>
        supabase.rpc('spend_limit_rule_aggregate', {
          p_rules: [{ p: 0, i: 0, b: expandedBudgetIds, k: keys }],
          p_from: c.from,
          p_to: c.to,
          p_grain: grain,
        }),
      ),
    )

    let aggregateTruncationSuspected = false
    const aggRows: RuleAggRow[] = []
    for (const res of chunkResults) {
      if (res.error) return serverError(res.error, 'spend-limits-preview:POST')
      const rows = (res.data ?? []) as RuleAggRow[]
      if (noteTruncation(rows.length)) aggregateTruncationSuspected = true
      aggRows.push(...rows)
    }

    const engineRows: SpendLimitAggregateRow[] = aggRows.map((r) => ({
      bucketStart: r.bucket_start,
      transactionType: r.transaction_type,
      sumPositief: Number(r.sum_positief),
      sumNegatief: Number(r.sum_negatief),
      count: Number(r.count),
      matchedNames: r.matched_names ?? [],
    }))

    const { periods, totalCount, counterpartyNames } = summarise(slices, engineRows)

    // Welke onderliggende dingen zitten in dit bedrag? Bij een tegenpartij-
    // dimensie de schrijfwijzen; bij een zuivere budget-regel de (sub)budgetten
    // die daadwerkelijk boekingen dragen — zelfde transfer-filter als de motor,
    // zodat de opsomming dezelfde verzameling beschrijft als het bedrag ernaast.
    const names = new Set<string>(counterpartyNames)
    if (keys.length === 0) {
      for (const r of aggRows) {
        if (!r.budget_id) continue
        if (!isRealAggRow({ transaction_type: r.transaction_type })) continue
        names.add(budgetNameById.get(r.budget_id) ?? r.budget_id)
      }
    }

    const existing: SpendLimitOverlapSubject[] = (
      (limitsResult.data ?? []) as unknown as LimitWithRulesRow[]
    ).map((r) => {
      const rules = (r.spend_limit_rules ?? []).map((rule) => ({
        budgetIds: rule.budget_ids ?? [],
        includeChildBudgets: rule.include_child_budgets !== false,
        counterpartyKeys: rule.counterparty_keys ?? [],
      }))
      return {
        id: r.id,
        name: r.name,
        isActive: r.is_active,
        rules,
        ruleType: deriveSpendLimitRuleType(
          rules.map((rule, i) => ({
            id: `${r.id}:${i}`,
            budgets: rule.budgetIds.map((id) => ({ id, name: null, archived: false })),
            includeChildBudgets: rule.includeChildBudgets,
            counterparties: rule.counterpartyKeys.map((key) => ({ key, label: key })),
          })),
        ),
      }
    })

    return NextResponse.json({
      status: 'ok',
      ruleType,
      keys,
      period,
      matchedNames: [...names].sort(),
      matchedTransactionCount: totalCount,
      matchedAmountByPeriod: periods,
      overlappingLimits: findOverlappingLimits(
        {
          budgetIds,
          includeChildBudgets,
          counterpartyKeys: keys,
          id: excludeLimitId ?? null,
        },
        existing,
        childrenByParent,
      ),
      aggregateTruncationSuspected,
    } satisfies SpendLimitPreviewResponse)
  } catch (err) {
    return serverError(err, 'spend-limits-preview:POST')
  }
}
