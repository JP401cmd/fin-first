import { NextResponse } from 'next/server'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import {
  SPEND_LIMIT_WINDOW_BY_PERIOD,
  computePeriodOutcome,
  netSpendFromSums,
  resolveSpendLimitPeriods,
  type SpendLimitAggregateRow,
  type SpendLimitPeriodKind,
} from '@/lib/spend-limits/engine'

/**
 * GET /api/spend-limits/[id]/breakdown?periode=<periodKey>
 *
 * De per-NAAM-uitsplitsing achter één periode van een tegenpartij-grenzenpot:
 * welke schrijfwijzen ("SHELL 1234", "Shell Nederland") zitten er in dit bedrag?
 *
 * ── WAAROM ON-DEMAND EN NIET IN DE BUNDEL (D6) ──────────────────────────────
 * De prestatieweergave doet voor haar standaardbeeld NUL extra fetches — alles
 * komt uit `SpendLimitWithReport` dat al op de pagina staat. Alleen deze
 * uitsplitsing, die achter twee kliks zit, is on-demand. In de bundel zou hij
 * élke laadbeurt van de transactiepagina een RPC per pot kosten voor data die de
 * meeste gebruikers nooit openen.
 *
 * ── DATUMVENSTER KOMT UIT DE MOTOR (D-P3) ───────────────────────────────────
 * De periodesleutel wordt NIET hier geparseerd. `resolveSpendLimitPeriods` uit
 * lib/spend-limits/engine.ts levert de slices; wij zoeken de slice met deze
 * sleutel op. Een tweede periodesleutel→datum-mapping is exact de drift-klasse
 * die de motor in fase 5 kwam repareren.
 *
 * `slice.until` is INCLUSIEF; beide RPC's voeren een HALF-OPEN venster
 * (`>= p_from AND < p_to`). `p_to` is daarom de dag ná `until`.
 *
 * ── DE REST-BUCKET ──────────────────────────────────────────────────────────
 * De RPC levert top-N namen, geen totaal. Het canonieke periodebedrag komt uit
 * de MOTOR (`computePeriodOutcome` over het tegenpartij-maandaggregaat) — precies
 * dezelfde functie en dezelfde bron als de loader gebruikt, dus per definitie
 * hetzelfde getal als op de kaart. Rest = canoniek − som van de top-N.
 *
 * ── DEZELFDE VERZAMELING AAN BEIDE KANTEN (parity, migratie 20260808170000) ──
 * `tx_counterparty_name_breakdown` sluit (joint_)transfer-rijen uit met exact het
 * predikaat van `isRealAggRow` (lib/server-data/tx-aggregates.ts), dat de motor
 * via `computePeriodOutcome` toepast. Dat is een HAND-GEBORGD parity-paar — er is
 * geen test die SQL en TS naast elkaar uitvoert — dus wie de ene helft aanraakt,
 * raakt de andere aan. Vóór die migratie telde de SQL wél overboekingen mee en
 * kon de uitsplitsing hóger uitvallen dan het bedrag waarvan ze een uitsplitsing
 * heet te zijn.
 *
 * De 0-klem op de restpost blijft staan als VERDEDIGING, niet als vangnet voor
 * die asymmetrie. Er blijft één legitieme route naar een negatief verschil: de
 * top-N is gesorteerd op grootste uitgave, dus namen die per saldo geld
 * TERUGGAVEN (een refund-only schrijfwijze) vallen buiten de top-50 terwijl hun
 * positieve saldo wél in het canonieke periodebedrag zit. De som van de getoonde
 * namen kan dan boven dat bedrag uitkomen. Een negatieve restpost zou een
 * onwaarheid op het scherm zijn; het canonieke bedrag blijft leidend en de
 * uitsplitsing is uitleg, geen tweede optelling.
 *
 * RLS: anon-client (`lib/supabase/server`), nooit service-role. Beide RPC's zijn
 * SECURITY INVOKER en erven de SELECT-policy van `transactions` onverkort.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Aantal namen dat we vragen; de SQL klemt zelf hard op 50 (NFR-B1-03). */
const BREAKDOWN_NAME_LIMIT = 50

interface CounterpartyAggRow {
  month: string
  transaction_type: string | null
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
}

interface NameBreakdownRow {
  counterparty_name: string
  sum_positief: number | string
  sum_negatief: number | string
  count: number | string
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
  return raw === 'quarter' || raw === 'year' ? raw : 'month'
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

  // Own-row: RLS doet het werk, de `.eq('user_id')` is de vangrail die een
  // gemiste policy als 404 zichtbaar maakt in plaats van als stille lees-lek.
  const { data: row, error: rowError } = await supabase
    .from('spend_limits')
    .select('id, rule_type, counterparty_key, limit_amount, period')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .maybeSingle()

  if (rowError) return serverError(rowError, 'spend-limits-breakdown:GET')
  if (!row) return notFound()

  // Budget-potten tonen hun uitsplitsing per (kind)budget uit de loader-data —
  // die zit al in de bundel en kost geen tweede bron.
  if (row.rule_type !== 'counterparty' || !row.counterparty_key) {
    return badRequest('Deze grens loopt op een budget; de uitsplitsing staat al op het scherm')
  }

  const period = toPeriodKind(row.period)
  const slices = resolveSpendLimitPeriods(period, new Date(), SPEND_LIMIT_WINDOW_BY_PERIOD[period])
  const slice = slices.find((s) => s.periodKey === periodKey)
  if (!slice) return badRequest('Onbekende periode')

  const from = slice.since
  const to = dayAfter(slice.until)
  const limitAmount = Number(row.limit_amount)

  const [aggResult, namesResult] = await Promise.all([
    supabase.rpc('tx_counterparty_month_aggregate', {
      p_from: from,
      p_to: to,
      p_keys: [row.counterparty_key],
      p_own_only: false,
    }),
    supabase.rpc('tx_counterparty_name_breakdown', {
      p_from: from,
      p_to: to,
      p_key: row.counterparty_key,
      p_limit: BREAKDOWN_NAME_LIMIT,
      p_own_only: false,
    }),
  ])

  if (aggResult.error) return serverError(aggResult.error, 'spend-limits-breakdown:GET')
  if (namesResult.error) return serverError(namesResult.error, 'spend-limits-breakdown:GET')

  const engineRows: SpendLimitAggregateRow[] = ((aggResult.data ?? []) as CounterpartyAggRow[]).map(
    (r) => ({
      month: r.month,
      transactionType: r.transaction_type,
      sumPositief: Number(r.sum_positief),
      sumNegatief: Number(r.sum_negatief),
      count: Number(r.count),
    }),
  )

  // Canoniek periodebedrag: dezelfde motorfunctie als de loader, geen eigen som.
  const outcome = computePeriodOutcome(slice, engineRows, limitAmount)

  const names = ((namesResult.data ?? []) as NameBreakdownRow[]).map((r) => ({
    name: r.counterparty_name,
    matchedAmount: netSpendFromSums(r.sum_negatief, r.sum_positief),
    count: Number(r.count),
  }))

  const namedAmount = names.reduce((sum, n) => sum + n.matchedAmount, 0)
  const namedCount = names.reduce((sum, n) => sum + n.count, 0)

  return NextResponse.json({
    periodKey: slice.periodKey,
    label: slice.label,
    names,
    restMatchedAmount: Math.max(0, outcome.periodMatchedAmount - namedAmount),
    restCount: Math.max(0, outcome.matchedTransactionCount - namedCount),
  })
}
