import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { formatCurrency } from '@/lib/format'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'
import Link from 'next/link'
import {
  ArrowRight, Zap, Compass, TrendingUp, Info,
} from 'lucide-react'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'
import { MonthlyCheckinCard } from '@/components/dashboard/monthly-checkin-card'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
    monthlyGrowth,
    growthDaysStr,
    openActionsCount,
    totalFreedomDaysOpen,
    simFireCountdown,
    fireProjResult,
    activated,
  } = await loadDashboardData(supabase)

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
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
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-kern-50 shrink-0">
                <FhinAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Kern</h2>
                <p className="label-editorial text-kern-600">Financieel Fundament</p>
              </div>
              <button
                type="button"
                title="Je financiële fundament. Inzicht in je vermogen, schulden en budgetten."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Kern"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

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
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-wil-50 shrink-0">
                <FinnAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Wil</h2>
                <p className="label-editorial text-wil-600">Bewuste Actie</p>
              </div>
              <button
                type="button"
                title="Bewuste keuzes en acties. Van inzicht naar impact."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Wil"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Preview metric — X acties open — Y dagen te winnen */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="wil-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Zap className="h-3.5 w-3.5" /> Openstaande acties
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="wil-preview-value">
                  <span className="font-mono">{openActionsCount}</span> {openActionsCount === 1 ? 'actie' : 'acties'} open
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
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-horizon-50 shrink-0">
                <FfinAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Horizon</h2>
                <p className="label-editorial text-horizon-600">Toekomstperspectief</p>
              </div>
              <button
                type="button"
                title="Je pad naar financiële vrijheid. Projecties, scenario's en je tijdlijn."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Horizon"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Preview metric — Countdown: X jaar, Y maanden */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="horizon-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Compass className="h-3.5 w-3.5" /> Countdown naar vrijheid
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="horizon-preview-value">
                  {(() => {
                    const cd = simFireCountdown ?? fireProjResult
                    return cd.fireDate === 'Bereikt!'
                      ? <span className="text-horizon-600">Bereikt!</span>
                      : cd.countdownDays > 0
                        ? <>Countdown: <span className="text-horizon-600 font-mono">{cd.countdownYears} jaar, {cd.countdownMonths} maanden</span></>
                        : <span className="text-[var(--ink-4)]">-</span>
                  })()}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-horizon-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* ── Monthly Check-in Reminder ─────────────────────────── */}
      <div className="mt-6">
        <MonthlyCheckinCard />
      </div>

      {/* ── Mijn Dashboard — Widget Grid ────────────────────────── */}
      <section className="mt-8" aria-label="Mijn Dashboard" data-testid="widget-grid">
        <DraggableWidgetGrid
          initialPrefs={activeWidgets}
          allPrefs={allWidgetPrefs}
          data={dashboardData}
          showDashboardTypeToggle
        />
      </section>

    </div>
  )
}
