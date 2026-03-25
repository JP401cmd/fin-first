'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { WillPageData } from '@/lib/will-data-loader'
import type { TemporalContext } from '@/lib/briefing/types'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'
import { SectionDivider } from '@/components/app/section-divider'
import { DAIshboard } from '@/components/daishboard/daishboard'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { useDashboardType } from '@/components/app/dashboard-type-provider'
import { ActionCenter } from './action-center'
import { VasteKostenAnalyse, type RecurringItem } from './vaste-kosten-analyse'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { MonthlyCheckinCard } from '@/components/dashboard/monthly-checkin-card'
import type { CancellationMetadata } from '@/lib/cancellation-types'

interface WillLandingProps {
  dashboardData: DashboardData
  activeWidgets: WidgetPref[]
  allPrefs: WidgetPref[]
  willData: WillPageData
  temporal: TemporalContext
  userName?: string
  aiEnabled: boolean
}

export function WillLanding({
  dashboardData,
  activeWidgets,
  allPrefs,
  willData,
  temporal,
  userName,
  aiEnabled,
}: WillLandingProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { dashboardType } = useDashboardType()

  // Recurring costs state (loaded client-side)
  const [subscriptions, setSubscriptions] = useState<RecurringItem[]>([])
  const [vasteKosten, setVasteKosten] = useState<RecurringItem[]>([])
  const [totalMonthlySubs, setTotalMonthlySubs] = useState(0)
  const [totalMonthlyVK, setTotalMonthlyVK] = useState(0)
  const [totalMonthly, setTotalMonthly] = useState(0)
  const [loadingRecurring, setLoadingRecurring] = useState(true)
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)

  // Reusable fetch for initial load + "Nu scannen" refresh
  const loadRecurringData = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions')
      const data = await res.json()
      if (data.subscriptions) {
        setSubscriptions(data.subscriptions as RecurringItem[])
        setVasteKosten(data.vasteKosten as RecurringItem[] ?? [])
        setTotalMonthlySubs(data.totalMonthlySubscriptions ?? 0)
        setTotalMonthlyVK(data.totalMonthlyVasteKosten ?? 0)
        setTotalMonthly(data.totalMonthly ?? 0)
      }
    } finally {
      setLoadingRecurring(false)
    }
  }, [])

  // Deep-link: open modal via ?modal= URL param
  useEffect(() => {
    const modal = searchParams.get('modal')
    if (modal === 'subscriptions') {
      router.replace('/will', { scroll: false })
    }
  }, [searchParams, router])

  // Load recurring data client-side (non-blocking)
  useEffect(() => {
    loadRecurringData().catch(() => {/* ignore */})
  }, [loadRecurringData])

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const { kpiData, recommendations, actions, goals, goalProgresses, goalAssets, goalDebts, partnerInfo, currentUserId, completedGoalCount, totalGoalCount, userProfile } = willData

  // Compute average goal progress for KPI card
  const avgGoalProgress = kpiData.goalProgresses.length > 0
    ? Math.round(kpiData.goalProgresses.reduce((s, g) => s + g.pct, 0) / kpiData.goalProgresses.length)
    : 0

  return (
    <FreedomDaysAnimationProvider>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">

        {/* ── Sectie 1: Widget grid of DAIshboard ── */}
        <section
          aria-label={dashboardType === 'widgets' ? 'Mijn Widgets' : "Will's Briefing"}
          data-testid="will-widget-grid"
          className="card-editorial overflow-hidden"
        >
          <div className="h-1.5 bg-wil-500" />
          <div className="p-4 sm:p-6 md:p-8">
            <DraggableWidgetGrid
              initialPrefs={activeWidgets}
              allPrefs={allPrefs}
              data={dashboardData}
              showDashboardTypeToggle
            />
            {dashboardType === 'briefing' && (
              <div className="mt-4">
                <DAIshboard
                  data={dashboardData}
                  temporal={temporal}
                  userName={userName}
                  aiEnabled={aiEnabled}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Sectie 2: Check-in ─────────────────────────────── */}
        <div className="mt-2">
          <MonthlyCheckinCard />
        </div>

        <SectionDivider variant="asterisk" />

        {/* ── Sectie 3: Actiecentrum met KPI-header ──────────── */}
        <section className="mt-4" aria-label="Actiecentrum">
          <ActionCenter
            recommendations={recommendations}
            actions={actions}
            goals={goals}
            goalProgresses={goalProgresses}
            goalAssets={goalAssets}
            goalDebts={goalDebts}
            completedGoalCount={completedGoalCount}
            totalGoalCount={totalGoalCount}
            partnerInfo={partnerInfo}
            currentUserId={currentUserId}
            onCancellationOpen={handleCancellationOpen}
            openRecommendationCount={kpiData.allPendingRecs.length}
            openActionCount={kpiData.openActions.length}
            avgGoalProgress={avgGoalProgress}
          />
        </section>

        {/* ── Sectie 4: Vaste Kosten Analyse (2 kolommen) ──── */}
        <section className="mt-10" aria-label="Vaste Kosten Analyse">
          {loadingRecurring ? (
            <div className="animate-pulse rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
              <div className="h-4 w-48 rounded bg-[var(--subtle)]" />
            </div>
          ) : (subscriptions.length > 0 || vasteKosten.length > 0) ? (
            <VasteKostenAnalyse
              subscriptions={subscriptions}
              vasteKosten={vasteKosten}
              totalMonthlySubscriptions={totalMonthlySubs}
              totalMonthlyVasteKosten={totalMonthlyVK}
              totalMonthly={totalMonthly}
              userProfile={userProfile}
              onCancellationOpen={handleCancellationOpen}
              onRefresh={loadRecurringData}
            />
          ) : null}
        </section>

        {/* ── Opzeg Modal ────────────────────────────────────── */}
        <OpzegModal
          open={!!opzegTarget}
          onClose={() => setOpzegTarget(null)}
          subscription={opzegTarget ? {
            id: '',
            name: opzegTarget.subscription_name,
            averageAmount: opzegTarget.monthly_amount,
            monthlyAmount: opzegTarget.monthly_amount,
            frequency: opzegTarget.frequency as 'monthly' | 'weekly' | 'quarterly' | 'yearly',
            nextDate: null,
            confidence: 'high' as const,
            isVariableAmount: false,
            occurrences: 0,
            alreadyConfirmed: false,
          } : null}
          initialMetadata={opzegTarget ?? undefined}
          userProfile={userProfile}
          onSavedToActionList={() => setOpzegTarget(null)}
        />
      </div>
    </FreedomDaysAnimationProvider>
  )
}
