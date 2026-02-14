import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type HorizonInput } from '@/lib/horizon-data'
import { formatCurrency } from '@/lib/format'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'
import Link from 'next/link'
import {
  ArrowRight, Wallet, Zap, Compass,
  TrendingUp, Target, Clock, Shield,
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const displayName = user?.email?.split('@')[0] ?? 'daar'

  // Parallel data fetches for all module previews
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [
    txResult, assetsResult, debtsResult, profileResult,
    essentialBudgetsResult, actionsResult, eventsResult,
    allBudgetsResult, recsResult, childBudgetsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
    supabase.from('debts').select('current_balance').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, last_known_phase').single(),
    supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
    supabase.from('actions').select('id, status, freedom_days_impact').in('status', ['open', 'completed']),
    supabase.from('life_events').select('id').eq('is_active', true),
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, alert_threshold, parent_id').is('parent_id', null),
    supabase.from('recommendations').select('id, title').eq('status', 'pending').limit(1),
    supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
  ])

  // Core calculations
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  const allChildren = childBudgetsResult.data ?? []
  let yearlyMustExpenses = 0
  for (const b of essentialBudgetsResult.data ?? []) {
    const children = allChildren.filter(c => c.parent_id === b.id)
    const limit = children.length > 0
      ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
    else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
    else yearlyMustExpenses += limit
  }

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / 0.04 : 0
  const freedomPct = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0

  // FIRE projection
  const horizonInput: HorizonInput = {
    totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
    monthlyContributions, yearlyMustExpenses,
    dateOfBirth: profileResult.data?.date_of_birth ?? null,
  }
  const fireProjResult = computeFireProjection(horizonInput)

  // Will calculations
  const allActions = actionsResult.data ?? []
  const openActions = allActions.filter(a => a.status === 'open')
  const totalFreedomDaysOpen = openActions.reduce((s, a) => s + (Number(a.freedom_days_impact) || 0), 0)
  const latestRec = recsResult.data?.[0] ?? null

  // Horizon calculations
  const eventCount = eventsResult.data?.length ?? 0

  // Budget alerts count
  // For simplicity, estimate budget alerts as budgets where spending might be high
  // We'll just show the count of active top-level budgets
  const budgetCount = allBudgetsResult.data?.length ?? 0

  const activated = profileResult.data?.last_known_phase !== null

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">
          Welkom terug, {displayName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          TriFinity helpt je bewust omgaan met je opgeslagen levensenergie.
        </p>
      </div>

      {/* Three module cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* De Kern */}
        <Link
          href="/core"
          className="group rounded-2xl border border-amber-200 bg-white p-6 transition-all hover:border-amber-300 hover:shadow-lg hover:shadow-amber-50 active:scale-[0.98] transition-transform"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
              <FhinAvatar size={36} />
            </div>
            <div>
              <h2 className="font-bold text-zinc-900">De Kern</h2>
              <p className="text-xs text-amber-600">Waar sta je echt?</p>
            </div>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-zinc-500">
            Je financiele fundament. Inzicht in je vermogen, schulden en budgetten.
          </p>

          {/* Preview metrics */}
          <div className="space-y-3 border-t border-zinc-100 pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Wallet className="h-3.5 w-3.5" /> Netto vermogen
              </span>
              <span className="text-sm font-semibold text-zinc-900">
                {formatCurrency(netWorth)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Shield className="h-3.5 w-3.5" /> Vrijheid
              </span>
              <span className="text-sm font-semibold text-amber-600">
                {freedomPct.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <TrendingUp className="h-3.5 w-3.5" /> Budgetten
              </span>
              <span className="text-sm font-medium text-zinc-600">
                {budgetCount} actief
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-1 text-xs font-medium text-amber-600 opacity-0 transition-opacity group-hover:opacity-100">
            Bekijken <ArrowRight className="h-3 w-3" />
          </div>
        </Link>

        {/* De Wil — hidden until activation */}
        {activated && (
          <Link
            href="/will"
            className="group rounded-2xl border border-teal-200 bg-white p-6 transition-all hover:border-teal-300 hover:shadow-lg hover:shadow-teal-50 active:scale-[0.98] transition-transform"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
                <FinnAvatar size={36} />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900">De Wil</h2>
                <p className="text-xs text-teal-600">Wat ga je doen?</p>
              </div>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-zinc-500">
              Bewuste keuzes en acties. Van inzicht naar impact.
            </p>

            {/* Preview metrics */}
            <div className="space-y-3 border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Zap className="h-3.5 w-3.5" /> Open acties
                </span>
                <span className="text-sm font-semibold text-zinc-900">
                  {openActions.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Target className="h-3.5 w-3.5" /> Potentiele vrijheidsdagen
                </span>
                <span className="text-sm font-semibold text-teal-600">
                  {Math.round(totalFreedomDaysOpen)} dagen
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Clock className="h-3.5 w-3.5" /> Laatste aanbeveling
                </span>
                <span className="max-w-[140px] truncate text-sm font-medium text-zinc-600">
                  {latestRec?.title ?? 'Geen'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 text-xs font-medium text-teal-600 opacity-0 transition-opacity group-hover:opacity-100">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        )}

        {/* De Horizon — hidden until activation */}
        {activated && (
          <Link
            href="/horizon"
            className="group rounded-2xl border border-purple-200 bg-white p-6 transition-all hover:border-purple-300 hover:shadow-lg hover:shadow-purple-50 active:scale-[0.98] transition-transform"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50">
                <FfinAvatar size={36} />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900">De Horizon</h2>
                <p className="text-xs text-purple-600">Waar ga je naartoe?</p>
              </div>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-zinc-500">
              Je pad naar financiele vrijheid. Projecties, scenario&apos;s en je tijdlijn.
            </p>

            {/* Preview metrics */}
            <div className="space-y-3 border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Compass className="h-3.5 w-3.5" /> Verwachte FIRE-leeftijd
                </span>
                <span className="text-sm font-semibold text-zinc-900">
                  {fireProjResult.fireAge != null ? `${Math.round(fireProjResult.fireAge)} jaar` : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <TrendingUp className="h-3.5 w-3.5" /> Countdown
                </span>
                <span className="text-sm font-semibold text-purple-600">
                  {fireProjResult.countdownDays > 0
                    ? `${fireProjResult.countdownYears}j ${fireProjResult.countdownMonths}mnd`
                    : fireProjResult.fireDate === 'Bereikt!' ? 'Bereikt!' : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Target className="h-3.5 w-3.5" /> Levensgebeurtenissen
                </span>
                <span className="text-sm font-medium text-zinc-600">
                  {eventCount} gepland
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 text-xs font-medium text-purple-600 opacity-0 transition-opacity group-hover:opacity-100">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        )}
      </div>

      {/* Freedom indicator */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase">
              Financiele vrijheid
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">
              {freedomPct.toFixed(1)}%
            </p>
          </div>
          <div className="text-right text-xs text-zinc-400">
            {formatCurrency(netWorth)} / {formatCurrency(fireTarget)}
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-purple-500 transition-all duration-1000"
            style={{ width: `${Math.min(freedomPct, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {fireProjResult.fireDate === 'Bereikt!'
            ? 'Je passief inkomen dekt je uitgaven!'
            : fireProjResult.fireDate === 'Niet haalbaar'
              ? 'Verhoog je spaarcapaciteit om je FIRE-doel te bereiken'
              : `Verwacht FIRE-moment: ${fireProjResult.fireDate}`
          }
        </p>
      </section>
    </div>
  )
}
