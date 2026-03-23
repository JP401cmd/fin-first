import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { RefreshCcw, Home, ShoppingCart, Car, Zap, Heart, Smartphone, CreditCard, HelpCircle } from 'lucide-react'
import type { DashboardData, TopRecurringTransaction } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Category classification ──────────────────────────────────
// Subscriptions: digital/recurring services
const ABONNEMENT_CATEGORIES = ['abonnement', 'telecom', 'streaming', 'software', 'app']
// Fixed costs: housing, insurance, utilities, transport, groceries, and everything else
const VASTE_LASTEN_CATEGORIES = ['wonen', 'verzekering', 'energie', 'vervoer', 'boodschappen']

function isAbonnement(category: string | null): boolean {
  if (!category) return false
  const key = category.toLowerCase()
  return ABONNEMENT_CATEGORIES.some(c => key.includes(c))
}

// ── Category icons ───────────────────────────────────────────

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

// ── Item list renderer (shared between half and full) ────────

function ItemRow({ t }: { t: TopRecurringTransaction }) {
  return (
    <li className="flex items-center justify-between text-sm text-[var(--ink-2)]">
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
  )
}

// ── Main widget component ────────────────────────────────────

export const VasteLastenWidget = memo(function VasteLastenWidget({ size, data, href }: Props) {
  const { recurringTransactions, totalRecurringAmount, topRecurringTransactions, monthlyExpenses, monthlyIncome } = data

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && totalRecurringAmount > 0
    ? calculateFreedomTime(totalRecurringAmount, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null
  const freedomDays = dailyExp > 0 && totalRecurringAmount > 0
    ? Math.round(totalRecurringAmount / dailyExp)
    : 0

  // Split transactions into two groups
  const abonnementen = topRecurringTransactions.filter(t => isAbonnement(t.category))
  const overigeVasteLasten = topRecurringTransactions.filter(t => !isAbonnement(t.category))

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
          {recurringTransactions === 1 ? 'vaste last' : 'vaste lasten'}
        </p>
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
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(totalRecurringAmount)}
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
                    <span className="font-mono tabular-nums shrink-0 ml-1">{formatCurrency(t.amount)}</span>
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

  const abonnementenItems = abonnementen.slice(0, 5)
  const overigeItems = overigeVasteLasten.slice(0, 6)

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
