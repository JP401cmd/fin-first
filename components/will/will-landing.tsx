'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { WillPageData } from '@/lib/will-data-loader'
import type { TemporalContext } from '@/lib/briefing/types'
import type { CategoryAppLink } from '@/lib/category-app-nav'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'
import { SectionDivider } from '@/components/app/section-divider'
import { DAIshboard } from '@/components/dashboard/daishboard'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { TipsTeaser } from '@/components/overview/tips-teaser'
import { DoelenStrook } from './doelen-strook'
import { StappenplannenStrook } from './stappenplannen-strook'
import { type RecurringItem } from './vaste-kosten-analyse'
import { CashflowSection } from './cashflow-section'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { MonthlyCheckinCard } from '@/components/dashboard/monthly-checkin-card'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BriefingHistory } from '@/components/dashboard/briefing-history'

interface WillLandingProps {
  dashboardData: DashboardData
  activeWidgets: WidgetPref[]
  allPrefs: WidgetPref[]
  willData: WillPageData
  temporal: TemporalContext
  userName?: string
  aiEnabled: boolean
  /** Klikbare app-deeplinks per actieve categorie — voor de balk bovenaan. */
  categoryAppLinks: CategoryAppLink[]
}

export function WillLanding({
  dashboardData,
  activeWidgets,
  allPrefs,
  willData,
  temporal,
  userName,
  aiEnabled,
  categoryAppLinks,
}: WillLandingProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Briefing is now always the prominent main component at the top of /will
  // No longer gated behind dashboardType toggle

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

  const handleDataChanged = useCallback(() => {
    router.refresh()
  }, [router])

  const { recommendations, actions, goals, goalProgresses, goalAssets, goalDebts, partnerInfo, currentUserId, userProfile } = willData
  const now = Date.now()
  const pendingTipCount = recommendations.filter(
    (r) =>
      r.status === 'pending' ||
      (r.status === 'postponed' && r.postponed_until && new Date(r.postponed_until).getTime() <= now),
  ).length

  return (
    <FreedomDaysAnimationProvider>
      <div className="mx-auto max-w-6xl py-5 sm:py-8">

        {/* ── Editorial header — blueprint Type 1 (Module-landing) ── */}
        <header className="relative mb-6 space-y-2 px-4 sm:px-6">
          <PageInfoButton
            description={PAGE_INFO['/will']}
            className="absolute right-4 top-0 sm:right-6"
          />
          {/* Kicker met 28×1px Wil-streep */}
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            Wil · {userName ? `welkom ${userName}` : 'jouw daadkracht'}
          </div>
          {/* Headline met italic-em "wil" in Wil-700 */}
          <h1
            className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
            style={{ fontFamily: 'var(--font-playfair, serif)' }}
          >
            Wat is je{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--module-active-700)' }}
            >
              wil
            </em>{' '}
            voor vandaag?
          </h1>
        </header>

        {/* ── Sectie 0: Briefing als prominent hoofdcomponent ── */}
        <section
          id="briefing"
          aria-label="Will's Briefing"
          data-testid="will-briefing-hero"
          className="card-editorial overflow-hidden scroll-mt-20"
        >
          {/* Module-active accent (Wil-500 op /will/**) */}
          <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />
          <DAIshboard
            data={dashboardData}
            temporal={temporal}
            userName={userName}
            aiEnabled={aiEnabled}
          />
        </section>

        {/* ── Briefing geschiedenis link ── */}
        <div className="mt-3 px-4 sm:px-6">
          <BriefingHistory data={dashboardData} />
        </div>

        {/* ── Stappenplannen-strook (boven het widget grid) ── */}
        <StappenplannenStrook data={dashboardData} />

        {/* ── Sectie 1: Widget grid ── */}
        <section
          aria-label="Mijn Widgets"
          data-testid="will-widget-grid"
          className="card-editorial overflow-hidden"
        >
          <div className="p-4 sm:p-6 md:p-8">
            <DraggableWidgetGrid
              initialPrefs={activeWidgets}
              allPrefs={allPrefs}
              data={dashboardData}
              categoryAppLinks={categoryAppLinks}
            />
          </div>
        </section>

        {/* ── Sectie 2: Check-in ─────────────────────────────── */}
        <div className="mt-2">
          <MonthlyCheckinCard />
        </div>

        <SectionDivider variant="asterisk" />

        {/* ── Sectie 3a: Tips-teaser → /overzicht/tips + Will-chat ─── */}
        <TipsTeaser
          pendingTipCount={pendingTipCount}
          openActionCount={actions.filter((a) => a.status === 'open').length}
        />

        {/* ── Sectie 3b: Doelen (Kompas) — gescheiden door double-rule ── */}
        <SectionDivider variant="double-rule" />

        <section className="mt-4" aria-label="Doelen">
          <DoelenStrook
            goals={goals}
            goalProgresses={goalProgresses}
            goalAssets={goalAssets}
            goalDebts={goalDebts}
            partnerInfo={partnerInfo}
            currentUserId={currentUserId}
            onGoalsChanged={handleDataChanged}
            onDataChanged={handleDataChanged}
          />
        </section>

        {/* ── Sectie 4: Cashflow (spaarquote + trends + vaste kosten) ── */}
        <CashflowSection
          data={dashboardData}
          subscriptions={subscriptions}
          vasteKosten={vasteKosten}
          totalMonthlySubscriptions={totalMonthlySubs}
          totalMonthlyVasteKosten={totalMonthlyVK}
          totalMonthly={totalMonthly}
          userProfile={userProfile}
          loadingRecurring={loadingRecurring}
          onCancellationOpen={handleCancellationOpen}
          onRefresh={loadRecurringData}
        />

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
