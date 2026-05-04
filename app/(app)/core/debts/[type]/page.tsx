import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  DEBT_TYPE_LABELS,
  type Debt,
  type DebtType,
} from '@/lib/debt-data'
import { loadKpiContextRefs } from '@/lib/kpi-context'
import {
  loadConnectionsByDebtIds,
  type AssetConnectionSummary,
} from '@/lib/connections-data'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import { DebtCategoryPage } from '@/components/core/debt-category-page'

// ── Type guards ──────────────────────────────────────────────

const VALID_DEBT_TYPES = Object.keys(DEBT_TYPE_LABELS) as DebtType[]

/**
 * Type-guard die ook `notFound()`-friendly werkt: alles wat niet exact in
 * de `DEBT_TYPE_LABELS`-keyset zit telt als een verkeerde URL en hoort een
 * 404 te krijgen — geen leeg scherm.
 */
function isValidDebtType(value: string): value is DebtType {
  return (VALID_DEBT_TYPES as string[]).includes(value)
}

// ── Page ─────────────────────────────────────────────────────

/**
 * Server-component voor `/core/debts/[type]`. Symmetrisch met de
 * asset-categorie pagina: validate type → load debts in deze categorie →
 * delegate aan client-component `<DebtCategoryPage />`.
 *
 * Geen module-eis — registratie zonder verdieping is een volwaardige
 * use-case (CLAUDE.md fundament-regel). Schulden hebben in deze ronde geen
 * verdiepings-tabs, maar de pagina is voorbereid voor toekomstige entries
 * in de category-deepening-registry.
 */
export default async function DebtCategoryServerPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params

  if (!isValidDebtType(type)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', user.id)
    .eq('debt_type', type)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    return <DebtCategoryError type={type} detail={error.message} />
  }

  const debts = (data ?? []) as Debt[]

  // KPI-context refs voor LTV (mortgage → linked asset waarde) en
  // overige type-specifieke berekeningen. Falen we hier, dan tonen de
  // kaarten gewoon geen LTV — geen 500.
  const kpiRefs = await loadKpiContextRefs(supabase).catch(() => null)

  // Batched-load van actieve API-koppelingen per debt — voorlopig leeg in
  // productie (geen actieve hypotheek/bank-connectoren), maar het pad is in
  // stelling zodat het symbool zichtbaar wordt zodra de eerste debt-API komt.
  // Falen we hier, dan vervalt het symbool stilzwijgend; de pagina blijft
  // functioneel.
  let connectionsByDebtId: Record<string, AssetConnectionSummary> | undefined
  if (debts.length > 0) {
    try {
      connectionsByDebtId = await loadConnectionsByDebtIds(
        supabase,
        debts.map((d) => d.id),
      )
    } catch {
      connectionsByDebtId = undefined
    }
  }

  // Per-debt sparklines voor de items-grid. Faalt non-fataal: lege map →
  // kaarten tonen alleen de tweelagentint zonder breuklijn.
  const debtSparklines = debts.length > 0
    ? await loadEntitySparklines(supabase, 'debt', debts.map((d) => d.id))
    : {}

  return (
    <DebtCategoryPage
      type={type}
      initialDebts={debts}
      initialKpiRefs={kpiRefs ?? undefined}
      initialConnectionsByDebtId={connectionsByDebtId}
      initialDebtSparklines={debtSparklines}
    />
  )
}

// ── Editorial error-state ────────────────────────────────────

function DebtCategoryError({ type, detail }: { type: DebtType; detail: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {DEBT_TYPE_LABELS[type]}
      </p>
      <h1 className="mt-2 font-serif text-2xl font-semibold text-[var(--ink)]">
        We konden deze categorie niet laden.
      </h1>
      <p className="mt-3 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Vernieuw de pagina om het opnieuw te proberen, of ga terug naar de
        Kern voor het volledige overzicht.
      </p>
      <p className="mt-4 font-mono text-[11px] text-[var(--ink-4)]">{detail}</p>
    </div>
  )
}
