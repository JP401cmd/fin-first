'use client'

/**
 * VasteLastenClient — orchestrator voor het Vaste-lasten-scherm
 * (/overzicht/cashflow/vaste-lasten). Twee lagen die meebewegen met de
 * weergavemodus:
 *
 *   Eenvoudig → hoofdcijfer €/mnd + vrijheidstijd-onderschrift + compacte
 *               aandeel-stoplichtmeter + de bestaande lijst (VasteKostenAnalyse)
 *               + één "Bespreek met Fin"-knop.
 *   Volledig  → daarbovenop de uitgebreide inzicht-blokken (VasteLastenInsights)
 *               onder <HideInSimple>.
 *
 * Data komt server-side binnen als props (geen client-fetch/spinner meer);
 * refresh = router.refresh(). Module-chrome = kern (amber); Fin-teal alleen op
 * de Fin-knop. Bedragen via <MaskedAmount>. De opzeg-flow (OpzegModal) wordt
 * hier gehost zodat zowel de rij-opzegknoppen als de sluipverbruik-CTA werken.
 *
 * De pagina-aanhef (kicker + titel) staat NIET meer hier maar op de server-pagina
 * — zie perf Task 2.4 en de comment bij het cijferblok hieronder.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { PageOpeningFigure } from '@/components/editorial'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-fin-button'
import { OpzegModal } from '@/components/app/opzeg-modal'
import {
  VasteKostenAnalyse,
  type RecurringItem,
} from '@/components/fin/vaste-kosten-analyse'
import { VasteLastenInsights } from '@/components/overview/vaste-lasten-insights'
import { formatCurrency } from '@/lib/format'
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
  terugkerendVariabel = [],
  fullName,
}: {
  insights: Insights
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  /** Terugkerend maar variabel (H14) — buiten de quote, wél getoond. */
  terugkerendVariabel?: RecurringItem[]
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

  // Detail-context voor Fin: totaal, aandeel, grootste posten.
  const finDetail = insights.hasData
    ? `Mijn vaste lasten zijn ${formatCurrency(insights.totalMonthly)} per maand` +
      (insights.ratioPct != null ? ` (${insights.ratioPct}% van mijn inkomen)` : '') +
      `. Abonnementen ${formatCurrency(insights.subscriptionsMonthly)}/mnd, overige vaste kosten ${formatCurrency(insights.vasteKostenMonthly)}/mnd.` +
      (insights.largestItem ? ` Grootste post: ${insights.largestItem.name}.` : '')
    : 'Ik heb nog geen vaste lasten in beeld.'

  return (
    <div className="space-y-6">
      {/* ── Cijferblok onder de pagina-aanhef: hairline-scheiding, groot
             mono-hoofdcijfer, vrijheidstijd-onderschrift, aandeel-stoplichtmeter
             + Fin. Geen gradient-kaart.

             De KICKER + TITEL horen bij dit blok maar staan sinds perf Task 2.4
             op de server-pagina (`<PageOpening>` in page.tsx): ze hebben geen
             data nodig en zijn de LCP-kandidaat, dus ze gaan mee in de eerste
             byte i.p.v. achter de Suspense-grens. De `space-y-3` hier is
             dezelfde afstand die de `<PageOpening>`-header intern gaf, zodat het
             ritme kop → hairline → cijfer ongewijzigd blijft. ── */}
      <div className="space-y-3">
        {/* Hoofdcijfer-blok — hairline-scheiding, groot mono-cijfer, Fin rechts */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border-ed)] pt-4">
          <PageOpeningFigure
            kicker="Totaal per maand"
            amount={
              <MaskedAmount
                value={insights.totalMonthly}
                tone="kern"
                className="text-[32px] font-bold leading-none tracking-[-0.01em] text-[var(--ink)] sm:text-[40px]"
              />
            }
            unit="/mnd"
            sub={
              <>
                <MaskedAmount
                  value={insights.totalYearly}
                  tone="ink"
                  className="text-[var(--ink-2)]"
                />{' '}
                per jaar
                {insights.freedomDaysPerMonth > 0 && (
                  <>
                    {' · '}
                    <span className="not-italic text-[var(--module-active-700)]">
                      ± {insights.freedomDaysPerMonth}{' '}
                      {insights.freedomDaysPerMonth === 1 ? 'dag' : 'dagen'} vrijheid/mnd
                    </span>
                  </>
                )}
              </>
            }
          />
          <BesprekMetWillButton
            onderwerp="Mijn vaste lasten"
            detail={finDetail}
            vraag="Waar kan ik het meeste vrijheid terugwinnen op mijn vaste lasten?"
          />
        </div>

        {insights.hasData && <CompactMeter insights={insights} />}
      </div>

      {/* ── De bestaande lijst (beide modi) ── */}
      <VasteKostenAnalyse
        subscriptions={subscriptions}
        vasteKosten={vasteKosten}
        terugkerendVariabel={terugkerendVariabel}
        totalMonthlySubscriptions={insights.subscriptionsMonthly}
        totalMonthlyVasteKosten={insights.vasteKostenMonthly}
        totalMonthlyVariabel={insights.variabelMonthly}
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
