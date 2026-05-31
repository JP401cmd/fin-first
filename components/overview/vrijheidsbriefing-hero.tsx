'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { BudgetSparkline } from '@/components/app/budget-sparkline'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useCountUp } from '@/lib/hooks/use-count-up'
import type { FreedomHeroProps } from '@/lib/briefing/overview-briefing'

/**
 * VrijheidsbriefingHero — de emotionele kern bovenaan de weekbriefing.
 * Toont de week-over-week vrijheidswinst ("+X dagen vrijheid deze week") als
 * groot, oplopend getal, plus het lopende totaal en een vrijheidsdagen-sparkline.
 * "Geld is opgeslagen tijd" voelbaar gemaakt. Alle waarden komen uit de bevroren
 * week-snapshot, dus de hero blijft de hele week stabiel.
 */
export function VrijheidsbriefingHero({
  totalLabel,
  deltaDays,
  isFirstWeek,
  sparkline,
  isInfinite,
  isDeficit,
}: FreedomHeroProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 800 })

  const hasDelta = deltaDays != null && deltaDays !== 0 && !isInfinite && !isDeficit
  const up = (deltaDays ?? 0) > 0
  const counted = useCountUp(hasDelta ? Math.abs(deltaDays as number) : 0, { start: hasEntered })

  const fallbackLine = isInfinite
    ? 'Vul je uitgaven aan om je vrijheidstijd te zien'
    : isDeficit
      ? 'Bouw je eerste vrijheid op — elke euro telt'
      : `${totalLabel} vrij`

  return (
    <div
      ref={ref}
      className="mb-4 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--ink-3)]">
            Jouw vrijheid deze week
          </div>

          {hasDelta ? (
            <>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`font-serif text-3xl sm:text-4xl font-semibold tabular-nums ${
                    up ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {up ? '+' : '−'}
                  {Math.round(counted)}
                </span>
                <span className="text-sm text-[var(--ink-2)]">
                  {up ? 'dagen vrijheid erbij' : 'dagen minder'}
                </span>
                {up ? (
                  <ArrowUpRight className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-amber-600" aria-hidden="true" />
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--ink-2)]">
                Je staat nu op{' '}
                <span className="font-semibold text-[var(--ink)]">{totalLabel}</span> aan vrijheid.
              </p>
            </>
          ) : (
            <>
              <div className="mt-1 font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink)]">
                {fallbackLine}
              </div>
              {isFirstWeek && !isInfinite && !isDeficit && (
                <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                  Vanaf volgende week zie je hier je wekelijkse vrijheidswinst.
                </p>
              )}
            </>
          )}
        </div>

        {sparkline.length >= 2 && (
          <div className="hidden shrink-0 sm:block" aria-hidden="true">
            <BudgetSparkline data={sparkline} isIncome width={128} height={44} showFill />
          </div>
        )}
      </div>
    </div>
  )
}
