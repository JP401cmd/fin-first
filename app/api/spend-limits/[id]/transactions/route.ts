import { NextResponse } from 'next/server'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import {
  SPEND_LIMIT_GRAIN_BY_PERIOD,
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  computePeriodOutcome,
  netSpendFromSums,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
} from '@/lib/spend-limits/engine'
import {
  aggregateChunkMonths,
  buildAggregateChunks,
  collectBudgetIds,
} from '@/lib/spend-limits/loader'
import type {
  SpendLimitTransactionRow,
  SpendLimitTransactionsResponse,
} from '@/lib/spend-limits/types'

/**
 * GET /api/spend-limits/[id]/transactions?periode=<periodKey>
 *
 * De LOSSE BOEKINGEN achter één periode van een grenzenpot: welke transacties
 * telden hier eigenlijk mee? De rij-tegenhanger van de per-budget-, per-regel- en
 * per-naam-uitsplitsing die de pane al toont.
 *
 * ── ON-DEMAND, NIET IN DE BUNDEL (D6) ───────────────────────────────────────
 * Zelfde afweging als de breakdown-route: het standaardbeeld van de pane doet NUL
 * extra fetches. Deze lijst zit achter twee kliks (pane openen, periode kiezen) en
 * zou in de bundel élke laadbeurt van de transactiepagina een rij-RPC per pot
 * kosten voor data die de meeste gebruikers nooit openen.
 *
 * ── WERKT VOOR ÉLKE POTVORM (anders dan de breakdown-route) ─────────────────
 * De breakdown-route serveert bewust alleen ZUIVERE tegenpartij-potten, omdat
 * `tx_counterparty_name_breakdown` de budget-dimensie niet kent en dus groter zou
 * kunnen uitvallen dan het geheel. Die beperking geldt hier NIET:
 * `spend_limit_rule_transactions` evalueert exact dezelfde regelvorm als het
 * aggregaat — inclusief de EN-combinatie en de ontdubbeling per pot — dus de lijst
 * beschrijft per constructie dezelfde verzameling als het bedrag erboven.
 *
 * ── DE TOTALEN KOMEN UIT DE MOTOR, NIET UIT DE RIJEN ────────────────────────
 * `totalCount` = `outcome.matchedTransactionCount`, `totalMatchedAmount` =
 * `outcome.periodMatchedAmount`, allebei uit `computePeriodOutcome` over hetzelfde
 * regel-aggregaat dat de loader gebruikt. "Er zijn er meer dan we tonen" is dus
 * `totalCount > rows.length` — afgeleid uit de CANONIEKE telling, niet uit de vraag
 * of de SQL zijn eigen LIMIT raakte. Dat is bewust: het verschil is meteen ook een
 * parity-controle tussen de rij-RPC en het aggregaat, en er ontstaat geen tweede
 * truncatie-vlag naast `aggregateTruncationSuspected` (die over de aggregaat-chunks
 * van de loader gaat en hier niets te zoeken heeft).
 *
 * ── DE KIND-BUDGETTEN WORDEN HIER OPGEROLD (anders is de lijst te smal) ─────
 * De loader stuurt het aggregaat niet de gekozen budget-ids maar hun hele
 * SUBBOOM (`collectBudgetIds`). Zou deze route de kale `budget_ids` doorsturen, dan
 * miste de lijst precies de boekingen op subbudgetten die in het totaal wél
 * meetellen — een lijst die stelselmatig korter is dan zijn eigen teller. Dezelfde
 * functie, niet een tweede boomwandeling.
 *
 * ── PERSPECTIEF-NEUTRAAL (D47 / ADR 0089) ──────────────────────────────────
 * Deze route leest de perspectief-cookie NIET en schaalt niets. Een grenzenpot
 * telt gedeelde huishoudboekingen ongeschaald — zou de lijst wél schalen, dan
 * stond er €50 in de pot en €25 in de lijst eronder.
 *
 * ── DATUMVENSTER UIT DE MOTOR (D-P3) ────────────────────────────────────────
 * De periodesleutel wordt niet hier geparseerd; `resolveSpendLimitPeriods` levert
 * de slices en wij zoeken die met deze sleutel op. `slice.until` is INCLUSIEF, de
 * RPC's voeren een HALF-OPEN venster — `p_to` is dus de dag ná `until`.
 *
 * RLS: anon-client (`lib/supabase/server`), nooit service-role. Beide RPC's zijn
 * SECURITY INVOKER en erven de SELECT-policy van `transactions` onverkort.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Aantal rijen dat we vragen; de SQL klemt zelf hard op 200. */
const TRANSACTION_ROW_LIMIT = 200

interface RuleAggRow {
  bucket_start: string
  transaction_type: string | null
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
}

interface TxRow {
  id: string
  date: string
  counterparty_name: string | null
  description: string | null
  amount: number | string
  budget_id: string | null
}

interface RuleRow {
  id: string
  sort_order: number | null
  budget_ids: string[] | null
  include_child_budgets: boolean | null
  counterparty_keys: string[] | null
}

/** De dag ná een inclusieve einddatum, lokaal gerekend (geen UTC-drift). */
function dayAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${next.getFullYear()}-${mm}-${dd}`
}

function toPeriodKind(raw: string | null | undefined): SpendLimitPeriodKind {
  return raw === 'day' || raw === 'week' || raw === 'quarter' || raw === 'year' ? raw : 'month'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badRequest('Ongeldig ID-formaat')

  const periodKey = new URL(req.url).searchParams.get('periode')?.trim()
  if (!periodKey) return badRequest('Geef een periode op')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  // Own-row: RLS doet het werk, de `.eq('user_id')` is de vangrail die een gemiste
  // policy als 404 zichtbaar maakt in plaats van als stille lees-lek.
  const { data: row, error: rowError } = await supabase
    .from('spend_limits')
    // Bewust één STRING-LITERAL en geen concatenatie: supabase-js leidt de rijvorm
    // uit dit letterlijke type af, en `'a' + 'b'` verbreedt naar `string` — dan
    // wordt `row` een foutvorm en klopt de type-check niet meer.
    .select(
      'id, limit_amount, period, spend_limit_rules(id, sort_order, budget_ids, include_child_budgets, counterparty_keys)',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .maybeSingle()

  if (rowError) return serverError(rowError, 'spend-limits-transactions:GET')
  if (!row) return notFound()

  // Formuliervolgorde = de volgorde waarin de SQL ontdubbelt (laagste index wint).
  const rules = [
    ...(((row as unknown as { spend_limit_rules: RuleRow[] | null }).spend_limit_rules) ?? []),
  ].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  if (rules.length === 0) return badRequest('Deze grens heeft nog geen regels')

  const period = toPeriodKind(row.period as string)
  const slices = resolveSpendLimitPeriods(period, new Date(), SPEND_LIMIT_WINDOW_BY_PERIOD[period])
  const slice = slices.find((s) => s.periodKey === periodKey)
  if (!slice) return badRequest('Onbekende periode')

  const from = slice.since
  const to = dayAfter(slice.until)
  const limitAmount = Number(row.limit_amount)

  // ── Kind-budgetten oprollen, exact zoals de loader (zie de kop) ────────────
  const childrenByParent = new Map<string, string[]>()
  if (rules.some((r) => (r.budget_ids ?? []).length > 0)) {
    const { data: budgetRows, error: budgetError } = await supabase
      .from('budgets')
      .select('id, parent_id')
    if (budgetError) return serverError(budgetError, 'spend-limits-transactions:GET')
    for (const b of (budgetRows ?? []) as { id: string; parent_id: string | null }[]) {
      if (!b.parent_id) continue
      const list = childrenByParent.get(b.parent_id) ?? []
      list.push(b.id)
      childrenByParent.set(b.parent_id, list)
    }
  }

  // Eén potindex (`p: 0`) voor alle regels: de ontdubbeling loopt dus over de hele
  // pot, net als in de loader. De regelindex `i` volgt de formuliervolgorde.
  const ruleInput = rules.map((r, i) => ({
    p: 0,
    i,
    b: [...collectBudgetIds(r.budget_ids ?? [], r.include_child_budgets !== false, childrenByParent)],
    k: (r.counterparty_keys ?? []).filter((k) => k.length > 0),
  }))

  // ── Het aggregaat in DEZELFDE stukken knippen als de loader ────────────────
  // Niet cosmetisch. De loader knipt op 4 maanden zodra er een budget-only regel
  // bij zit, omdat de per-budget-dimensie (bucket × budget × transactietype) de
  // PostgREST-cap van 1000 rijen kan halen. Eén ongeknipte call over een jaarpot
  // met een subboom van tientallen budgetten kapt daar stil af — en dan toont
  // deze route een LAGER periodetotaal dan de pane erboven, die via de geknipte
  // loader kwam. Twee bedragen voor exact hetzelfde periodetotaal, op één scherm.
  // `buildAggregateChunks`/`aggregateChunkMonths` zijn precies hiervoor
  // geëxporteerd; de knipregel heeft één home.
  const grain = SPEND_LIMIT_GRAIN_BY_PERIOD[period]
  const hasBudgetOnlyRule = ruleInput.some((r) => r.b.length > 0 && r.k.length === 0)
  const chunks = buildAggregateChunks(from, to, aggregateChunkMonths(grain, hasBudgetOnlyRule))

  const [txResult, ...aggResults] = await Promise.all([
    supabase.rpc('spend_limit_rule_transactions', {
      p_rules: ruleInput,
      p_from: from,
      p_to: to,
      p_limit: TRANSACTION_ROW_LIMIT,
    }),
    // Canoniek periodebedrag én -aantal: hetzelfde aggregaat, dezelfde regelvorm en
    // dezelfde motorfunctie als de loader — geen eigen som over de rijen hierboven.
    ...chunks.map((c) =>
      supabase.rpc('spend_limit_rule_aggregate', {
        p_rules: ruleInput,
        p_from: c.from,
        p_to: c.to,
        p_grain: grain,
      }),
    ),
  ])

  if (txResult.error) return serverError(txResult.error, 'spend-limits-transactions:GET')
  const aggError = aggResults.find((r) => r.error)?.error
  if (aggError) return serverError(aggError, 'spend-limits-transactions:GET')

  const engineRows: SpendLimitAggregateRow[] = aggResults
    .flatMap((r) => (r.data ?? []) as RuleAggRow[])
    .map((r) => ({
      bucketStart: r.bucket_start,
      transactionType: r.transaction_type,
      sumPositief: Number(r.sum_positief),
      sumNegatief: Number(r.sum_negatief),
      count: Number(r.count),
    }))

  const outcome = computePeriodOutcome(slice, engineRows, limitAmount)

  const rows: SpendLimitTransactionRow[] = ((txResult.data ?? []) as TxRow[]).map((t) => {
    const amount = Number(t.amount)
    return {
      id: t.id,
      date: t.date,
      counterpartyName: t.counterparty_name,
      description: t.description ?? '',
      // De tekenregel heeft één eigenaar (`netSpendFromSums`): positief = uitgave,
      // inclusief de −0-normalisatie. Een losse `-amount` hier zou die regel voor
      // de derde keer overschrijven — precies wat die helper kwam voorkomen.
      matchedAmount: netSpendFromSums(
        amount < 0 ? amount : 0,
        amount > 0 ? amount : 0,
      ),
      budgetId: t.budget_id,
    }
  })

  const body: SpendLimitTransactionsResponse = {
    periodKey: slice.periodKey,
    label: slice.label,
    rows,
    totalCount: outcome.matchedTransactionCount,
    totalMatchedAmount: outcome.periodMatchedAmount,
  }

  return NextResponse.json(body)
}
