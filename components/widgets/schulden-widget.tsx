'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { debtRatioPercent } from '@/lib/financial-health'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'
import { Users, UserCheck } from 'lucide-react'
import { usePerspective } from '@/components/app/perspective-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SchuldenWidget = memo(function SchuldenWidget({ size, data, href }: Props) {
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household' && data.householdOverrides != null
  const isPartnerView = perspective === 'partner' && data.partnerOverrides != null

  // Use perspective-appropriate data overrides for the headline + ratio metrics
  const overrides = isHouseholdView ? data.householdOverrides! : isPartnerView ? data.partnerOverrides! : null
  const totalDebts = overrides ? overrides.totalDebts : data.totalDebts
  const totalAssets = overrides ? overrides.totalAssets : data.totalAssets
  const monthlyExpenses = overrides ? overrides.monthlyExpenses : data.monthlyExpenses
  const { budgetTotals } = data

  const kickerLabel = isHouseholdView
    ? 'Schulden — Huishouden'
    : isPartnerView
      ? `Schulden — ${partnerName ?? 'Partner'}`
      : 'Schulden'

  // In-view fill-animatie (700ms bezier, 0% → doel; transition:none pre-entered).
  // Eén hook bovenaan; per render toont het widget precies één size, dus dezelfde
  // ref op elke size-track is rules-of-hooks-veilig.
  const { ref: barRef, hasEntered } = useInViewAnimation({ duration: 700 })
  const barTransition = hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none'

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker={kickerLabel} href={href}>
        <p className={`${totalDebts > 0 ? 'text-negative' : 'text-positive'} leading-none truncate`}>
          <MaskedAmount
            value={totalDebts}
            signPrefix={totalDebts > 0 ? '-' : ''}
            tone="kern"
            className="text-[15px] font-semibold"
          />
        </p>
      </WidgetShell>
    )
  }

  // Personal view: canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20);
  // override-perspectief houdt zijn eigen (perspectief-eigen) uitgavenniveau.
  const dailyExp = overrides
    ? dailyExpenseRate(monthlyExpenses)
    : data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && totalDebts > 0
    ? calculateFreedomTime(totalDebts, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // Schuldratio: schuld als aandeel van totaal vermogen — canonieke bron
  // (debtRatioPercent, gedeeld met de gezondheidsscore om drift te voorkomen).
  // Clamp op 100% voor balkbreedte + label.
  const schuldRatio = Math.min(debtRatioPercent(totalAssets, totalDebts), 100)
  const ratioLabel = `Schuldratio ${schuldRatio.toFixed(0)} procent`

  // ── Quarter-size: compact amount + freedom time + ratio bar ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <div>
          {(isHouseholdView || isPartnerView) && (
            <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
              {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
              {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
            </div>
          )}
          <p className={totalDebts > 0 ? 'text-negative' : 'text-positive'}>
            <MaskedAmount
              value={totalDebts}
              signPrefix={totalDebts > 0 ? '-' : ''}
              tone="kern"
              className="text-lg font-semibold"
            />
          </p>
          {totalDebts > 0 && freedomStr ? (
            <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
              {freedomStr} terug te winnen
            </p>
          ) : totalDebts === 0 ? (
            <p className="mt-0.5 text-[11px] font-medium text-positive">
              Schuldenvrij!
            </p>
          ) : null}
          {totalDebts > 0 && (
            <>
              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <span className="text-[var(--ink-3)]">Schuldratio</span>
                <span className="font-mono tabular-nums text-negative">{schuldRatio.toFixed(0)}%</span>
              </div>
              <div
                ref={barRef}
                role="progressbar"
                aria-label={ratioLabel}
                aria-valuenow={Math.round(schuldRatio)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]"
              >
                <div
                  className="h-full rounded-full bg-negative/70"
                  style={{ width: hasEntered ? `${schuldRatio}%` : '0%', transition: barTransition }}
                />
              </div>
            </>
          )}
        </div>
      </WidgetShell>
    )
  }

  // Aflossing komt uit het eigen budget — hoort bij eigen items, niet bij het huishoud-totaal.
  const monthlyRepayment = (isHouseholdView || isPartnerView) ? 0 : budgetTotals.debt.spent

  // ── Half-size: horizontal layout — left metric, right ratio bar ────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {(isHouseholdView || isPartnerView) && (
              <div className="mb-1 flex items-center gap-1 text-[10px] text-kern-600">
                {isPartnerView ? <UserCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {isPartnerView ? (partnerName ?? 'Partner') : 'Huishouden'}
              </div>
            )}
            <p className={totalDebts > 0 ? 'text-negative' : 'text-positive'}>
              <MaskedAmount
                value={totalDebts}
                signPrefix={totalDebts > 0 ? '-' : ''}
                tone="kern"
                className="text-xl font-semibold"
              />
            </p>
            {totalDebts > 0 && freedomStr ? (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                {freedomStr} terug te winnen
              </p>
            ) : totalDebts === 0 ? (
              <p className="mt-0.5 text-[11px] font-medium text-positive">
                Schuldenvrij!
              </p>
            ) : null}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {totalDebts > 0 && (
              <>
                {/* Schuldratio progress bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-[var(--ink-3)]">Schuldratio</span>
                    <span className="font-mono tabular-nums text-negative">{schuldRatio.toFixed(0)}%</span>
                  </div>
                  <div
                    ref={barRef}
                    role="progressbar"
                    aria-label={ratioLabel}
                    aria-valuenow={Math.round(schuldRatio)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
                  >
                    <div
                      className="h-full rounded-full bg-negative/70"
                      style={{ width: hasEntered ? `${schuldRatio}%` : '0%', transition: barTransition }}
                    />
                  </div>
                </div>
                {/* Monthly repayment */}
                {monthlyRepayment > 0 && (
                  <p className="text-[11px] text-[var(--ink-3)]">
                    Aflossing: <MaskedAmount value={monthlyRepayment} tone="kern" />/mnd
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // Freedom days per repayment euro
  const repaymentFreedomDays = dailyExp > 0 && monthlyRepayment > 0
    ? monthlyRepayment / dailyExp
    : null

  // ── Full-size: enriched breakdown with freedom framing ────
  return (
    <WidgetShell module="kern" size={size} kicker={kickerLabel} href={href}>
      {(isHouseholdView || isPartnerView) && (
        <div className="mb-1.5 flex items-center gap-1 text-[11px] text-kern-600">
          {isPartnerView ? <UserCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
          {isPartnerView ? (partnerName ?? 'Partner') : 'Gecombineerd huishouden'}
        </div>
      )}
      <p className={totalDebts > 0 ? 'text-negative' : 'text-positive'}>
        <MaskedAmount
          value={totalDebts}
          signPrefix={totalDebts > 0 ? '-' : ''}
          tone="kern"
          className="text-2xl font-semibold"
        />
      </p>
      {freedomStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          {freedomStr} vrijheid terug te winnen
        </p>
      )}

      {totalDebts > 0 ? (
        <div className="mt-2 space-y-1">
          {/* Schuldratio progress bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-[var(--ink-3)]">Schuldratio</span>
              <span className="font-mono tabular-nums text-negative">{schuldRatio.toFixed(0)}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={ratioLabel}
              aria-valuenow={Math.round(schuldRatio)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
            >
              <div
                className="h-full rounded-full bg-negative/70 transition-all duration-500"
                style={{ width: `${schuldRatio}%` }}
              />
            </div>
          </div>

          {/* Monthly repayment section */}
          {monthlyRepayment > 0 && (
            <div className="space-y-0.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--ink-3)]">Maandelijkse aflossing</span>
                <span className="font-medium text-[var(--ink)]">
                  <MaskedAmount value={monthlyRepayment} tone="kern" />/mnd
                </span>
              </div>
              {/* Freedom framing for repayment */}
              {repaymentFreedomDays !== null && (
                <p className="font-serif italic text-[11px] text-[var(--ink-3)]">
                  Elke maand {repaymentFreedomDays.toFixed(1)} dagen vrijheid teruggewonnen
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-[var(--ink-3)]">
            Vrijheid die je terugkoopt
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className="h-full w-full rounded-full bg-positive/60" />
          </div>
          <p className="text-xs font-medium text-positive">
            Schuldenvrij — 100% inzet voor vrijheid
          </p>
        </div>
      )}
    </WidgetShell>
  )
})
