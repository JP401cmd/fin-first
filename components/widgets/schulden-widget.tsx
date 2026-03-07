import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function SchuldenWidget({ size, data, href }: Props) {
  const { totalDebts, totalAssets, monthlyExpenses, budgetTotals } = data

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && totalDebts > 0
    ? calculateFreedomTime(totalDebts, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Quarter-size: compact amount + freedom time ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
        <div>
          <p className={`font-mono text-lg font-semibold tabular-nums ${totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {totalDebts > 0 ? `-${formatCurrency(totalDebts)}` : `${formatCurrency(0)}`}
          </p>
          {totalDebts > 0 && freedomStr ? (
            <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
              {freedomStr} terug te winnen
            </p>
          ) : totalDebts === 0 ? (
            <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
              Schuldenvrij!
            </p>
          ) : null}
        </div>
      </WidgetShell>
    )
  }

  // Schuldratio: debt as proportion of total assets
  const schuldRatio = totalAssets > 0 ? Math.min((totalDebts / totalAssets) * 100, 100) : (totalDebts > 0 ? 100 : 0)
  const monthlyRepayment = budgetTotals.debt.spent

  // ── Half-size: enriched with progress bar, ratio, repayment ────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
        <p className={`font-mono text-2xl font-semibold tabular-nums ${totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {totalDebts > 0 ? '-' : ''}{formatCurrency(totalDebts)}
        </p>
        {freedomStr && (
          <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
            {freedomStr} vrijheid terug te winnen
          </p>
        )}

        {totalDebts > 0 && (
          <div className="mt-3 space-y-2">
            {/* Schuldratio progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[var(--ink-3)]">Schuldratio</span>
                <span className="font-mono tabular-nums text-red-600">{schuldRatio.toFixed(0)}%</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div
                  className="h-full rounded-full bg-red-500/70 transition-all duration-500"
                  style={{ width: `${schuldRatio}%` }}
                />
              </div>
            </div>

            {/* Monthly repayment */}
            {monthlyRepayment > 0 && (
              <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                Aflossing: {formatCurrency(monthlyRepayment)}/mnd
              </p>
            )}
          </div>
        )}

        <p className="mt-2 text-xs text-[var(--ink-3)]">
          {totalDebts > 0 ? 'Vrijheid die je terugkoopt' : 'Schuldenvrij — alle vrijheid is van jou'}
        </p>
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
      <p className={`font-mono text-2xl font-semibold tabular-nums ${totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {totalDebts > 0 ? '-' : ''}{formatCurrency(totalDebts)}
      </p>
      {freedomStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          {freedomStr} vrijheid terug te winnen
        </p>
      )}

      {totalDebts > 0 ? (
        <div className="mt-3 space-y-3">
          {/* Schuldratio progress bar */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-[var(--ink-3)]">Schuldratio</span>
              <span className="font-mono tabular-nums text-red-600">{schuldRatio.toFixed(0)}%</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-red-500/70 transition-all duration-500"
                style={{ width: `${schuldRatio}%` }}
              />
            </div>
          </div>

          {/* Monthly repayment section */}
          {monthlyRepayment > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--ink-3)]">Maandelijkse aflossing</span>
                <span className="font-mono tabular-nums font-medium text-[var(--ink)]">
                  {formatCurrency(monthlyRepayment)}/mnd
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
            <span className="font-mono tabular-nums font-medium text-emerald-600">
              +{formatCurrency(totalDebts)} netto vermogen
            </span>
          </div>

          <p className="text-xs text-[var(--ink-3)]">
            Vrijheid die je terugkoopt
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className="h-full w-full rounded-full bg-emerald-500/60" />
          </div>
          <p className="text-xs font-medium text-emerald-600">
            Schuldenvrij — 100% inzet voor vrijheid
          </p>
        </div>
      )}
    </WidgetShell>
  )
}
