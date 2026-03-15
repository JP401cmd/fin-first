import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { RefreshCcw, Home, ShoppingCart, Car, Zap, Heart, Smartphone, CreditCard, HelpCircle } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  wonen: <Home className="h-3.5 w-3.5 text-kern-500" />,
  boodschappen: <ShoppingCart className="h-3.5 w-3.5 text-kern-500" />,
  vervoer: <Car className="h-3.5 w-3.5 text-kern-500" />,
  energie: <Zap className="h-3.5 w-3.5 text-kern-500" />,
  verzekering: <Heart className="h-3.5 w-3.5 text-kern-500" />,
  telecom: <Smartphone className="h-3.5 w-3.5 text-kern-500" />,
  abonnement: <CreditCard className="h-3.5 w-3.5 text-kern-500" />,
}

function getCategoryIcon(category: string | null) {
  if (!category) return <HelpCircle className="h-3.5 w-3.5 text-[var(--ink-4)]" />
  const key = category.toLowerCase()
  for (const [k, icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return icon
  }
  return <RefreshCcw className="h-3.5 w-3.5 text-[var(--ink-4)]" />
}

export function TerugkerendeTransactiesWidget({ size, data, href }: Props) {
  const { recurringTransactions, totalRecurringAmount, topRecurringTransactions, monthlyExpenses, monthlyIncome } = data

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && totalRecurringAmount > 0
    ? calculateFreedomTime(totalRecurringAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null
  const freedomDays = dailyExp > 0 && totalRecurringAmount > 0
    ? Math.round(totalRecurringAmount / dailyExp)
    : 0

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Vaste Lasten" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {formatCurrency(totalRecurringAmount)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact count + icon ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
        <div className="flex items-center gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5 text-kern-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {recurringTransactions}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          {recurringTransactions === 1 ? 'vaste last' : 'vaste lasten'} actief
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size: total + top-3 + freedom time (compact for 1-row height) ────
  if (size === 'half') {
    const top5 = topRecurringTransactions.slice(0, 3)
    return (
      <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4 text-kern-500 shrink-0" />
          <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(totalRecurringAmount)} <span className="text-sm font-normal text-[var(--ink-3)]">per maand</span>
          </p>
        </div>
        {top5.length > 0 && (
          <ul className="mt-2 space-y-1">
            {top5.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-xs text-[var(--ink-2)]">
                <span className="truncate mr-2">{t.name}</span>
                <span className="font-mono tabular-nums shrink-0">{formatCurrency(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {freedomStr && (
          <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            = {freedomDays} vrijheidsdagen per maand
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full-size: volledige lijst + categorie-iconen + maand/jaar bedragen + % inkomen ────
  const allItems = topRecurringTransactions.slice(0, 10)
  const yearlyTotal = totalRecurringAmount * 12
  const incomePercent = monthlyIncome > 0
    ? Math.round((totalRecurringAmount / monthlyIncome) * 100)
    : null

  return (
    <WidgetShell module="kern" size={size} kicker="Vaste Lasten" href={href}>
      <div className="flex items-baseline gap-2">
        <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(totalRecurringAmount)}
        </p>
        <span className="text-sm text-[var(--ink-3)]">per maand</span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">
        {formatCurrency(yearlyTotal)} per jaar
        {incomePercent !== null && (
          <span> &middot; {incomePercent}% van inkomen</span>
        )}
      </p>

      {allItems.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--border-ed)] pt-3">
          {allItems.map((t) => (
            <li key={t.id} className="flex items-center justify-between text-sm text-[var(--ink-2)]">
              <div className="flex items-center gap-2 min-w-0">
                {getCategoryIcon(t.category)}
                <span className="truncate">{t.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono tabular-nums text-xs">{formatCurrency(t.amount)}</span>
                {t.frequency && (
                  <span className="text-[10px] text-[var(--ink-4)]">/{t.frequency}</span>
                )}
              </div>
            </li>
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
}
