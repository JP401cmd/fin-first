import { createClient } from '@/lib/supabase/server'
import { loadBudgetsData } from '@/lib/budgets-data-loader'
import BudgetsClient from '@/components/app/budgets-client'

/**
 * BudgetsLoader — async server-child achter een eigen `<Suspense>` op
 * /overzicht/budget. Draagt de zware kant van de pagina: de budgets-bundel plus
 * de drie tellingen achter de koppel-nudge.
 *
 * WAAROM APART. `page.tsx` mag maar één await boven zijn return hebben (de
 * perspectief-cookie); zodra daar een loader bij komt wacht de HELE pagina weer
 * en zijn de `<Suspense>`-grenzen decoratief. Dat was precies de toestand nadat
 * deze pagina van sub-pagina naar hefboom promoveerde: de titel en de drie
 * kaarten stonden achter de volledige budgets-load. Op een pagina die je
 * dagelijks opent — en die een van de twee mogelijke startschermen is — telt de
 * eerste seconde het zwaarst.
 *
 * `createClient()` is React-`cache()`-gewrapt, dus dit is dezelfde instantie als
 * elders in de render en kost geen tweede cookie-read.
 */
export async function BudgetsLoader() {
  const supabase = await createClient()
  const data = await loadBudgetsData(supabase)

  // showKoppelNudge: toon ná het doorlopen van de setup éénmalig de koppel-nudge
  // (BudgetKoppelNudge). Zelf-beperkend: alleen als de eenmalige marker ontbreekt
  // ÉN de gebruiker nog géén bank_accounts en géén transacties heeft. De 0-data-
  // guard voorkomt dat bestaande (backfill-)gebruikers de nudge zien. User-scoped
  // tellen (.eq('user_id', …)), niet via gedeelde huishoud-RLS, zodat partner-data
  // niet meetelt. Slug-string spiegelt BUDGET_KOPPEL_NUDGE_SHOWN_SLUG uit
  // components/app/budget-koppel-nudge.tsx.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let showKoppelNudge = false
  if (user) {
    const [markerRes, accountsRes, txRes] = await Promise.all([
      supabase
        .from('user_feature_visits')
        .select('feature_slug')
        .eq('user_id', user.id)
        .eq('feature_slug', 'budget_koppel_nudge_shown')
        .maybeSingle(),
      supabase
        .from('bank_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ])
    const markerAbsent = !markerRes.data
    const noAccounts = (accountsRes.count ?? 0) === 0
    const noTransactions = (txRes.count ?? 0) === 0
    showKoppelNudge = markerAbsent && noAccounts && noTransactions
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <BudgetsClient initialData={data} showKoppelNudge={showKoppelNudge} />
    </div>
  )
}

/**
 * Suspense-fallback voor het budgetblok. Reserveert grofweg de hoogte van de
 * hoofdgetallen-strip plus een handvol budgetregels, zodat de instroom geen
 * layout-shift geeft.
 */
export function BudgetsFallback() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-6xl animate-pulse px-4 pt-6 sm:px-6">
      <div className="mb-4 h-3 w-40 bg-[var(--subtle)]" />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-editorial p-4">
            <div className="mb-1 h-4 w-28 bg-[var(--subtle)]" />
            <div className="h-7 w-24 bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card-editorial p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="h-4 w-32 bg-[var(--subtle)]" />
              <div className="h-4 w-20 bg-[var(--subtle)]" />
            </div>
            <div className="h-2 w-full bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
