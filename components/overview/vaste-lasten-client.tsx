'use client'

/**
 * VasteLastenClient — orchestrator voor het Vaste-lasten-scherm
 * (/overzicht/cashflow/vaste-lasten). Twee lagen die meebewegen met de
 * weergavemodus:
 *
 *   Eenvoudig → hoofdcijfer €/mnd + vrijheidstijd-onderschrift + compacte
 *               aandeel-stoplichtmeter + de bestaande lijst (VasteKostenAnalyse)
 *               + één "Bespreek met Will"-knop.
 *   Volledig  → daarbovenop de uitgebreide inzicht-blokken (VasteLastenInsights)
 *               onder <HideInSimple>.
 *
 * Data komt server-side binnen als props (geen client-fetch/spinner meer);
 * refresh = router.refresh(). Module-chrome = kern (amber); Will-teal alleen op
 * de Will-knop. Bedragen via <MaskedAmount>. De opzeg-flow (OpzegModal) wordt
 * hier gehost zodat zowel de rij-opzegknoppen als de sluipverbruik-CTA werken.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-will-button'
import { OpzegModal } from '@/components/app/opzeg-modal'
import {
  VasteKostenAnalyse,
  type RecurringItem,
} from '@/components/will/vaste-kosten-analyse'
import { VasteLastenInsights } from '@/components/overview/vaste-lasten-insights'
import { formatFreedomTimeString, formatCurrency } from '@/lib/format'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
} from '@/lib/leverage-status'
import type { VasteLastenInsights as Insights } from '@/lib/vaste-lasten-insights'
import type { CancellationMetadata } from '@/lib/cancellation-types'

// ── Compacte aandeel-meter (kop, beide modi) ──────────────────
function CompactMeter({ insights }: { insights: Insights }) {
  const { ratioPct, status, meterValue } = insights
  if (ratioPct == null || meterValue == null) return null
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--ink-3)]">Aandeel van je inkomen</span>
        <span className={`font-medium tabular-nums ${leverageStatusTextClass(status)}`}>
          {ratioPct}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
        role="img"
        aria-label={`Vaste lasten zijn ${ratioPct}% van je inkomen — ${LEVERAGE_STATUS_LABEL[status]}`}
      >
        <div
          className={`h-full rounded-full ${LEVERAGE_STATUS_DOT[status]} opacity-80 transition-[width] duration-500`}
          style={{ width: `${Math.min(100, ratioPct)}%` }}
        />
      </div>
    </div>
  )
}

export function VasteLastenClient({
  insights,
  subscriptions,
  vasteKosten,
  fullName,
}: {
  insights: Insights
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  fullName: string | null
}) {
  const router = useRouter()
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)

  const refresh = useCallback(async () => {
    router.refresh()
  }, [router])

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const handleOpzegFromBlock = useCallback(
    (item: { name: string; monthlyAmount: number }) => {
      setOpzegTarget({
        type: 'subscription_cancellation',
        subscription_name: item.name,
        monthly_amount: item.monthlyAmount,
        frequency: 'monthly',
        user_name: fullName ?? '',
        user_address: '',
        user_postcode: '',
        user_city: '',
      })
    },
    [fullName],
  )

  // Detail-context voor Will: totaal, aandeel, grootste posten.
  const willDetail = insights.hasData
    ? `Mijn vaste lasten zijn ${formatCurrency(insights.totalMonthly)} per maand` +
      (insights.ratioPct != null ? ` (${insights.ratioPct}% van mijn inkomen)` : '') +
      `. Abonnementen ${formatCurrency(insights.subscriptionsMonthly)}/mnd, overige vaste kosten ${formatCurrency(insights.vasteKostenMonthly)}/mnd.` +
      (insights.largestItem ? ` Grootste post: ${insights.largestItem.name}.` : '')
    : 'Ik heb nog geen vaste lasten in beeld.'

  return (
    <div className="space-y-6">
      {/* ── Kop: hoofdcijfer + vrijheidstijd + compacte meter + Will ── */}
      <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-gradient-to-br from-kern-50 to-[var(--paper)] p-5 shadow-[var(--s0)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label-editorial mb-1 text-[var(--ink-3)]">Totaal vaste lasten</p>
            <div className="flex items-baseline gap-1.5">
              <MaskedAmount
                value={insights.totalMonthly}
                tone="kern"
                className="font-serif text-3xl font-semibold text-[var(--ink)] sm:text-4xl"
              />
              <span className="text-sm text-[var(--ink-3)]">/mnd</span>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              <MaskedAmount
                value={insights.totalYearly}
                tone="ink"
                className="text-[var(--ink-2)]"
              />{' '}
              per jaar
              {insights.freedomDaysPerMonth > 0 && (
                <>
                  {' · '}
                  <span className="text-kern-700">
                    ± {insights.freedomDaysPerMonth}{' '}
                    {insights.freedomDaysPerMonth === 1 ? 'dag' : 'dagen'} vrijheid/mnd
                  </span>
                </>
              )}
            </p>
          </div>
          <BesprekMetWillButton
            onderwerp="Mijn vaste lasten"
            detail={willDetail}
            vraag="Waar kan ik het meeste vrijheid terugwinnen op mijn vaste lasten?"
          />
        </div>
        {insights.hasData && (
          <div className="mt-4">
            <CompactMeter insights={insights} />
          </div>
        )}
      </section>

      {/* ── De bestaande lijst (beide modi) ── */}
      <VasteKostenAnalyse
        subscriptions={subscriptions}
        vasteKosten={vasteKosten}
        totalMonthlySubscriptions={insights.subscriptionsMonthly}
        totalMonthlyVasteKosten={insights.vasteKostenMonthly}
        totalMonthly={insights.totalMonthly}
        userProfile={fullName ? { full_name: fullName } : null}
        onCancellationOpen={handleCancellationOpen}
        onRefresh={refresh}
        collapsible={false}
      />

      {/* ── Uitgebreide inzichten (alleen Volledig) ── */}
      <HideInSimple>
        <VasteLastenInsights insights={insights} onOpzeg={handleOpzegFromBlock} />
      </HideInSimple>

      {/* ── Opzeg-flow ── */}
      <OpzegModal
        open={!!opzegTarget}
        onClose={() => setOpzegTarget(null)}
        subscription={
          opzegTarget
            ? {
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
              }
            : null
        }
        initialMetadata={opzegTarget ?? undefined}
        userProfile={{ full_name: fullName }}
        onSavedToActionList={() => setOpzegTarget(null)}
      />
    </div>
  )
}
