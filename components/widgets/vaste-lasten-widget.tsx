import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { RefreshCcw, Home, Car, Zap, Heart, CreditCard } from 'lucide-react'
import type { DashboardData, TopRecurringTransaction } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Category icons ───────────────────────────────────────────
// Gemapt op de canonieke RecurringCategory (lib/recurring-detection.ts), niet op
// budgetnaam — zelfde grondslag als de vaste-lasten-pagina.

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  rent: <Home className="h-3.5 w-3.5 text-kern-500" />,
  mortgage: <Home className="h-3.5 w-3.5 text-kern-500" />,
  housing_other: <Home className="h-3.5 w-3.5 text-kern-500" />,
  utility: <Zap className="h-3.5 w-3.5 text-kern-500" />,
  transport: <Car className="h-3.5 w-3.5 text-kern-500" />,
  insurance: <Heart className="h-3.5 w-3.5 text-kern-500" />,
  healthcare: <Heart className="h-3.5 w-3.5 text-kern-500" />,
  subscription: <CreditCard className="h-3.5 w-3.5 text-kern-500" />,
}

function getCategoryIcon(category: string | null) {
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category]
  return <RefreshCcw className="h-3.5 w-3.5 text-[var(--ink-4)]" />
}

// ── Item list renderer (shared between half and full) ────────

function ItemRow({ t }: { t: TopRecurringTransaction }) {
  return (
    <li className="flex items-center justify-between text-sm text-[var(--ink-2)]">
      <div className="flex items-center gap-2 min-w-0">
        {getCategoryIcon(t.category)}
        <span className="truncate">{t.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <MaskedAmount value={t.amount} tone="kern" className="text-xs" />
        {t.frequency && (
          <span className="text-[10px] text-[var(--ink-4)]">/{t.frequency}</span>
        )}
      </div>
    </li>
  )
}

// ── Main widget component ────────────────────────────────────

export const VasteLastenWidget = memo(function VasteLastenWidget({ size, data, href }: Props) {
  const { recurringTransactions, totalRecurringAmount, topRecurringTransactions, monthlyExpenses, monthlyIncome } = data

  // Canoniek 12-mnd rolling dagtarief uit de bundel (KRUIS-20); fallback voor mocks.
  const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)
  const freedomTime = dailyExp > 0 && totalRecurringAmount > 0
    ? calculateFreedomTime(totalRecurringAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null
  const freedomDays = dailyExp > 0 && totalRecurringAmount > 0
    ? Math.round(totalRecurringAmount / dailyExp)
    : 0

  // Canonieke split: abonnement vs. overige vaste last (bron: loadVasteLastenSummary).
  const abonnementen = topRecurringTransactions.filter(t => t.isSubscription)
  const overigeVasteLasten = topRecurringTransactions.filter(t => !t.isSubscription)

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Vaste Lasten" href={href}>
        <p className="text-[var(--ink)] leading-none truncate">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-[15px] font-semibold" />
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: bedrag (geen metric-sprong t.o.v. mini) + aantal als context ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
        <p className="text-[var(--ink)] leading-none">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-lg font-semibold" />
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          per maand
          {recurringTransactions > 0 && (
            <> &middot; {recurringTransactions} {recurringTransactions === 1 ? 'post' : 'posten'}</>
          )}
        </p>
      </WidgetShell>
    )
  }

  // ── Lege staat (half & full) ─────────────────────────────
  if (topRecurringTransactions.length === 0 && totalRecurringAmount === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm text-[var(--ink-2)]">Nog geen vaste lasten herkend.</p>
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">
            Zodra terugkerende betalingen zijn gedetecteerd, verschijnen ze hier.
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left total, right top items ────
  if (size === 'half') {
    const top3 = topRecurringTransactions.slice(0, 3)
    return (
      <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-[var(--ink)]">
              <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-xl font-semibold" />
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">per maand</p>
            {freedomStr && (
              <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
                = {freedomDays} dagen/mnd
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {top3.length > 0 && (
              <ul className="space-y-1">
                {top3.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-[11px] text-[var(--ink-2)]">
                    <div className="flex items-center gap-1 min-w-0">
                      {getCategoryIcon(t.category)}
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span className="shrink-0 ml-1">
                      <MaskedAmount value={t.amount} tone="kern" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: grouped view with two sections ────
  const yearlyTotal = totalRecurringAmount * 12
  const incomePercent = monthlyIncome > 0
    ? Math.round((totalRecurringAmount / monthlyIncome) * 100)
    : null

  const abonnementenItems = abonnementen.slice(0, 6)
  const overigeItems = overigeVasteLasten.slice(0, 8)

  return (
    <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
      <div className="flex items-baseline gap-2">
        <p className="text-[var(--ink)]">
          <MaskedAmount value={totalRecurringAmount} tone="kern" className="text-xl font-semibold" />
        </p>
        <span className="text-sm text-[var(--ink-3)]">per maand</span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">
        <MaskedAmount value={yearlyTotal} tone="kern" /> per jaar
        {incomePercent !== null && (
          <span> &middot; {incomePercent}% van inkomen</span>
        )}
      </p>

      {/* Abonnementen section */}
      {abonnementenItems.length > 0 && (
        <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            Abonnementen
          </p>
          <ul className="space-y-1.5">
            {abonnementenItems.map((t) => (
              <ItemRow key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}

      {/* Overige vaste lasten section */}
      {overigeItems.length > 0 && (
        <div className="mt-3 border-t border-[var(--border-ed)] pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            Overige vaste lasten
          </p>
          <ul className="space-y-1.5">
            {overigeItems.map((t) => (
              <ItemRow key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}

      {/* Show ungrouped list if no items matched either category */}
      {abonnementenItems.length === 0 && overigeItems.length === 0 && topRecurringTransactions.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--border-ed)] pt-3">
          {topRecurringTransactions.slice(0, 10).map((t) => (
            <ItemRow key={t.id} t={t} />
          ))}
        </ul>
      )}

      {freedomStr && (
        <p className="mt-3 font-serif italic text-[12px] text-[var(--ink-3)]">
          {freedomStr} per maand aan vaste lasten
        </p>
      )}
      <p className="mt-1 text-[11px] text-[var(--ink-4)]">
        {recurringTransactions} {recurringTransactions === 1 ? 'vaste last' : 'vaste lasten'} totaal
      </p>
    </WidgetShell>
  )
})
