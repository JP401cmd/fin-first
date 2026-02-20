import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type HorizonInput } from '@/lib/horizon-data'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'
import { JouwPadWidget } from '@/components/app/jouw-pad-widget'
import { BadgeEvaluator } from '@/components/app/badge-evaluator'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { computeFreedomMilestones } from '@/lib/freedom-milestones'
import Link from 'next/link'
import { StreakIndicator } from '@/components/app/streak-indicator'
import { StreakBreakWarning } from '@/components/app/streak-break-warning'
import {
  ArrowRight, Zap, Compass, TrendingUp,
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const displayName = user?.email?.split('@')[0] ?? 'daar'

  // Parallel data fetches for all module previews
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  const [
    txResult, assetsResult, debtsResult, profileResult,
    essentialBudgetsResult, actionsResult, _eventsResult,
    _allBudgetsResult, _recsResult, childBudgetsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
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

  // Daily expenses for freedom-time calculations
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // Vermogensgroei deze maand (net cash flow this month: income - expenses)
  const monthlyGrowth = monthlyIncome - monthlyExpenses
  const growthDays = dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(monthlyGrowth), dailyExpenses)
    : null
  const growthDaysStr = growthDays
    ? formatFreedomTimeString(growthDays, 'long')
    : null

  const activated = profileResult.data?.last_known_phase !== null

  // Sovereignty level calculation for Jouw Pad widget
  const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
    const dt = (d as { debt_type?: string }).debt_type
    return dt === 'credit_card' || dt === 'personal_loan' || dt === 'consumer'
  })
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt)
  const currentPhaseId = levelToPhaseId(sovereigntyLevel)

  // Freedom milestone forecast for Jouw Pad widget
  const monthlySavings = monthlyIncome - monthlyExpenses
  const milestoneResult = computeFreedomMilestones(netWorth, monthlyExpenses, monthlySavings)

  // Dateline
  const dateStr = now.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Badge evaluation on dashboard load */}
      <BadgeEvaluator />

      {/* Dateline row */}
      <div className="flex items-center justify-between border-b border-[var(--border-ed)] pb-3 mb-6">
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.11em' }} className="text-[var(--ink-3)]">{dateStr}</span>
        <div className="flex items-center gap-3">
          <StreakIndicator />
          <span className="font-serif italic text-[13px] text-[var(--ink-3)] hidden sm:inline">Persoonlijk Financieel Dagblad</span>
        </div>
      </div>

      {/* Header */}
      <div className="mb-5 sm:mb-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Jouw financieel dagblad</p>
        <h1 className="font-display text-[32px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
          Welkom terug, <em className="not-italic font-display italic text-kern-600">{displayName}</em>
        </h1>
        <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
          TriFinity helpt je bewust omgaan met je opgeslagen levensenergie.
        </p>
      </div>

      {/* Streak break warning notification */}
      <div className="mb-3 sm:mb-6" data-testid="streak-warning-section">
        <StreakBreakWarning />
      </div>

      {/* Three module cards */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
        {/* De Kern */}
        <Link
          href="/core"
          className="group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up"
          style={{ animationDelay: '0s' }}
        >
          <div className="h-1 bg-kern-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-kern-50">
                <FhinAvatar size={36} />
              </div>
              <div>
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Kern</h2>
                <p className="label-editorial text-kern-600">Financieel Fundament</p>
              </div>
            </div>
            <p className="mb-3 sm:mb-5 text-sm leading-relaxed text-[var(--ink-3)]">
              Je financiele fundament. Inzicht in je vermogen, schulden en budgetten.
            </p>

            {/* Preview metric — Vermogensgroei deze maand */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="kern-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Vermogensgroei deze maand
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="kern-preview-value">
                  <span className="font-mono">{monthlyGrowth >= 0 ? '+' : ''}{formatCurrency(monthlyGrowth)}</span>
                  {growthDaysStr && (
                    <span className="ml-1 font-normal text-kern-600">
                      ({monthlyGrowth >= 0 ? '+' : '-'}{growthDaysStr})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-kern-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>

        {/* De Wil */}
        <Link
          href="/will"
          className={`group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up ${!activated ? 'opacity-75' : ''}`}
          style={{ animationDelay: '0.05s' }}
        >
          <div className="h-1 bg-wil-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-wil-50">
                <FinnAvatar size={36} />
              </div>
              <div>
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Wil</h2>
                <p className="label-editorial text-wil-600">Bewuste Actie</p>
              </div>
            </div>
            <p className="mb-3 sm:mb-5 text-sm leading-relaxed text-[var(--ink-3)]">
              Bewuste keuzes en acties. Van inzicht naar impact.
            </p>

            {/* Preview metric — X acties open — Y dagen te winnen */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="wil-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Zap className="h-3.5 w-3.5" /> Openstaande acties
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="wil-preview-value">
                  <span className="font-mono">{openActions.length}</span> {openActions.length === 1 ? 'actie' : 'acties'} open
                  <span className="mx-1 text-[var(--ink-4)]">—</span>
                  <span className="text-wil-600 font-mono">
                    {Math.round(totalFreedomDaysOpen)} {Math.round(totalFreedomDaysOpen) === 1 ? 'dag' : 'dagen'} te winnen
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-wil-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>

        {/* De Horizon */}
        <Link
          href="/horizon"
          className={`group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up ${!activated ? 'opacity-75' : ''}`}
          style={{ animationDelay: '0.1s' }}
        >
          <div className="h-1 bg-horizon-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-horizon-50">
                <FfinAvatar size={36} />
              </div>
              <div>
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Horizon</h2>
                <p className="label-editorial text-horizon-600">Toekomstperspectief</p>
              </div>
            </div>
            <p className="mb-3 sm:mb-5 text-sm leading-relaxed text-[var(--ink-3)]">
              Je pad naar financiele vrijheid. Projecties, scenario&apos;s en je tijdlijn.
            </p>

            {/* Preview metric — Countdown: X jaar, Y maanden */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="horizon-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Compass className="h-3.5 w-3.5" /> Countdown naar vrijheid
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="horizon-preview-value">
                  {fireProjResult.fireDate === 'Bereikt!'
                    ? <span className="text-horizon-600">Bereikt!</span>
                    : fireProjResult.countdownDays > 0
                      ? <>Countdown: <span className="text-horizon-600 font-mono">{fireProjResult.countdownYears} jaar, {fireProjResult.countdownMonths} maanden</span></>
                      : <span className="text-[var(--ink-4)]">-</span>
                  }
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-horizon-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* Freedom indicator — preview teaser linking to De Kern (primary owner) */}
      <section className="mt-8" aria-label="Vrijheidsvoortgang" data-testid="dashboard-freedom-teaser">
        <div className="card-editorial px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Compass className="h-3.5 w-3.5 text-horizon-600" />
              <p className="label-editorial text-horizon-600">
                Vrijheidsvoortgang
              </p>
              <span className="text-[var(--ink-4)]">·</span>
              <span className="text-xs font-mono text-[var(--ink-3)]">
                {formatCurrency(netWorth)} / {formatCurrency(fireTarget)}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 animate-prog-in"
                  style={{ width: `${Math.min(freedomPct, 100)}%` }}
                />
              </div>
              <span className="text-sm font-mono font-medium text-[var(--ink-2)] tabular-nums">
                {freedomPct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1.5 font-serif italic text-[12px] text-[var(--ink-3)]">
              {fireProjResult.fireDate === 'Bereikt!'
                ? 'Je passief inkomen dekt je uitgaven — volledige vrijheid bereikt!'
                : fireProjResult.fireDate === 'Niet haalbaar'
                  ? 'Verhoog je spaarcapaciteit om volledige vrijheid te bereiken'
                  : `Verwacht moment van volledige vrijheid: ${fireProjResult.fireDate}`
              }
            </p>
          </div>
        </div>
      </section>

      {/* Jouw Pad widget */}
      <section className="mt-6">
        <JouwPadWidget
          level={sovereigntyLevel}
          phase={currentPhaseId}
          freedomPct={freedomPct}
          netWorth={netWorth}
          monthsCovered={monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0}
          hasConsumerDebt={hasConsumerDebt}
          milestones={milestoneResult.milestones}
          nextMilestoneMessage={milestoneResult.nextMilestone?.message ?? null}
        />
      </section>
    </div>
  )
}
