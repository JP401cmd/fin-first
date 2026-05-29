'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { WillPageData } from '@/lib/will-data-loader'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { TipsTeaser } from '@/components/overview/tips-teaser'
import { type RecurringItem } from './vaste-kosten-analyse'
import { CashflowSection } from './cashflow-section'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { MonthlyCheckinCard } from '@/components/dashboard/monthly-checkin-card'
import type { CancellationMetadata } from '@/lib/cancellation-types'

/**
 * WillLanding — minimale render onder de `<OverzichtHero>`-kop.
 *
 * De hero levert al de briefing (6 entries), vier-hefbomen-tegels en
 * Health Score. Hier blijven alleen wat geen andere plek heeft:
 *   1. Header ("Wat is je wil voor vandaag?")
 *   2. MonthlyCheckinCard — kort, leeft alleen op deze pagina
 *   3. TipsTeaser — drie tegels naar /overzicht/tips + Will-chat
 *   4. CashflowSection — spaarquote, vaste kosten, abonnementen
 *   5. OpzegModal — overlay voor cancellation-flow uit vaste kosten
 *
 * Verwijderd in deze cleanup:
 *  - DAIshboard (tweede AI-briefing) + BriefingHistory
 *  - StappenplannenStrook (post-onboarding "volgende stappen")
 *  - DraggableWidgetGrid (mijn dashboard)
 *  - DoelenStrook (kompas + doelen — leven nu op /toekomst)
 */
interface WillLandingProps {
  dashboardData: DashboardData
  willData: WillPageData
  userName?: string
}

export function WillLanding({
  dashboardData,
  willData,
  userName,
}: WillLandingProps) {
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

  // Load recurring data client-side (non-blocking)
  useEffect(() => {
    loadRecurringData().catch(() => {/* ignore */})
  }, [loadRecurringData])

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const { recommendations, actions, userProfile } = willData
  const now = Date.now()
  const pendingTipCount = recommendations.filter(
    (r) =>
      r.status === 'pending' ||
      (r.status === 'postponed' && r.postponed_until && new Date(r.postponed_until).getTime() <= now),
  ).length

  return (
    <FreedomDaysAnimationProvider>
      <div className="mx-auto max-w-6xl py-5 sm:py-8">

        {/* ── Sectie-header ── */}
        <header className="mb-6 space-y-2 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            Wil · {userName ? `welkom ${userName}` : 'jouw daadkracht'}
          </div>
          <h2
            className="font-bold leading-tight tracking-[-0.02em] text-[22px] sm:text-[28px]"
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
          </h2>
        </header>

        {/* ── Maandelijkse check-in ── */}
        <MonthlyCheckinCard />

        {/* ── Tips & acties teaser ── */}
        <TipsTeaser
          pendingTipCount={pendingTipCount}
          openActionCount={actions.filter((a) => a.status === 'open').length}
        />

        {/* ── Cashflow-detailblok ── */}
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
