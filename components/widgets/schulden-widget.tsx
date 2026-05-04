import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SchuldenWidget = memo(function SchuldenWidget({ size, data, href }: Props) {
  const { totalDebts, totalAssets, monthlyExpenses, budgetTotals } = data

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Schulden" href={href}>
        <p className="text-negative leading-none truncate">
          <MaskedAmount value={totalDebts} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && totalDebts > 0
    ? calculateFreedomTime(totalDebts, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // Schuldratio: debt as proportion of total assets
  const schuldRatio = totalAssets > 0 ? Math.min((totalDebts / totalAssets) * 100, 100) : (totalDebts > 0 ? 100 : 0)

  // ── Quarter-size: compact amount + freedom time + ratio bar ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
        <div>
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
            <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-negative/70"
                style={{ width: `${schuldRatio}%` }}
              />
            </div>
          )}
        </div>
      </WidgetShell>
    )
  }

  const monthlyRepayment = budgetTotals.debt.spent

  // ── Half-size: horizontal layout — left metric, right ratio bar ────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
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
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full bg-negative/70 transition-all duration-500"
                      style={{ width: `${schuldRatio}%` }}
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
    <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
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
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
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

          {/* Net worth impact */}
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--ink-3)]">Na aflossing</span>
            <span className="font-medium text-positive">
              <MaskedAmount value={totalDebts} signPrefix="+" tone="kern" /> netto vermogen
            </span>
          </div>

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
