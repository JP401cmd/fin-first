'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { WillPageData } from '@/lib/will-data-loader'
import type { TemporalContext } from '@/lib/briefing/types'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'
import { DAIshboard } from '@/components/daishboard/daishboard'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { useDashboardType } from '@/components/app/dashboard-type-provider'
import { ModuleSideBar } from './module-side-bar'
import { ActionCenter } from './action-center'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { MonthlyCheckinCard } from '@/components/dashboard/monthly-checkin-card'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type SubscriptionItem = {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'high' | 'medium' | 'low'
  isVariableAmount: boolean
  occurrences: number
  alreadyConfirmed: boolean
}

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

  // Subscription state (loaded client-side)
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])
  const [subscriptionMonthly, setSubscriptionMonthly] = useState(0)
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false)
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)

  // Deep-link: open modal via ?modal= URL param
  useEffect(() => {
    const modal = searchParams.get('modal')
    if (modal === 'subscriptions') {
      setSubscriptionsOpen(true)
      router.replace('/will', { scroll: false })
    }
  }, [searchParams, router])

  // Load subscriptions client-side (non-blocking)
  useEffect(() => {
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then(data => {
        if (data.subscriptions) {
          setSubscriptions(data.subscriptions as SubscriptionItem[])
          setSubscriptionMonthly(data.totalMonthly ?? 0)
        }
      })
      .catch(() => {/* ignore */})
  }, [])

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

        {/* ── Sectie 1: Widget grid of DAIshboard met zijnavigatie (geschaald naar 90%) ── */}
        <section aria-label={dashboardType === 'widgets' ? 'Mijn Widgets' : "Will's Briefing"} data-testid="will-widget-grid">
          <div className="overflow-hidden">
            <div style={{ transform: 'scale(0.9)', transformOrigin: 'top left', width: 'calc(100% / 0.9)' }}>
              <div className="flex items-stretch gap-1.5">
                <ModuleSideBar module="kern" label="De Kern" href="/core" side="left" />

                <div className="flex-1 min-w-0">
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

                <ModuleSideBar module="horizon" label="De Horizon" href="/horizon" side="right" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Sectie 2: Check-in ─────────────────────────────── */}
        <div className="mt-6">
          <MonthlyCheckinCard />
        </div>

        {/* ── Sectie 3: Actiecentrum met KPI-header ──────────── */}
        <section className="mt-10" aria-label="Actiecentrum">
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

        {/* ── Sectie 4: Abonnementen (collapsible) ───────────── */}
        {subscriptions.length > 0 && (
          <section className="mt-10">
            <CollapsibleSection
              storageKey="will-abonnementen"
              title={`Abonnementen (${subscriptions.length})`}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {subscriptions.map(sub => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">{sub.name}</p>
                      <p className="text-xs text-[var(--ink-3)]">{sub.frequency}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                        €{sub.monthlyAmount.toFixed(2)}/mnd
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                  <span className="text-xs font-medium text-[var(--ink-2)]">Totaal per maand</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    €{subscriptionMonthly.toFixed(2)}
                  </span>
                </div>
              </div>
            </CollapsibleSection>
          </section>
        )}

        {/* ── Opzeg Modal ────────────────────────────────────── */}
        <OpzegModal
          open={!!opzegTarget}
          onClose={() => setOpzegTarget(null)}
          subscription={null}
          initialMetadata={opzegTarget ?? undefined}
          userProfile={userProfile}
          onSavedToActionList={() => {}}
        />
      </div>
    </FreedomDaysAnimationProvider>
  )
}
