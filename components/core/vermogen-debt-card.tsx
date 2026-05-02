'use client'

import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { formatCurrency } from '@/lib/format'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  REPAYMENT_TYPE_LABELS,
} from '@/lib/debt-data'
import {
  Home,
  Banknote,
  GraduationCap,
  Car,
  CreditCard,
  RefreshCw,
  CalendarCheck,
  Receipt,
  Heart,
  Building2,
  CircleDot,
} from 'lucide-react'
import { CardKpiStrip } from './card-kpi-strip'
import { ConnectionIndicator } from './connection-indicator'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'

// ── Constants ───────────────────────────────────────────────

/** Fixed red accent for all debt cards */
const DEBT_ACCENT_COLOR = '#ef4444'

// ── Icon mapping ────────────────────────────────────────────

const DEBT_ICONS: Record<DebtType, React.ComponentType<{ className?: string }>> = {
  mortgage: Home,
  personal_loan: Banknote,
  student_loan: GraduationCap,
  car_loan: Car,
  credit_card: CreditCard,
  revolving_credit: RefreshCw,
  payment_plan: CalendarCheck,
  belastingschuld: Receipt,
  familielening: Heart,
  dga_schuld: Building2,
  other: CircleDot,
}

// ── Props ───────────────────────────────────────────────────

interface VermogenDebtCardProps {
  debt: Debt
  /**
   * KPI-paar voor de strip onder de hoofdregel. Caller berekent dit via
   * `computeDebtKpi(debt, ctx)` uit `lib/debt-kpi.ts`.
   */
  kpiPair?: KpiPair
  /**
   * Optionele actieve externe koppeling — rendert hetzelfde `Plug`-symbool
   * als op asset-kaarten zodra een hypotheek-API of bank-connector aan een
   * schuld gekoppeld kan worden. Voorlopig altijd `undefined` in productie
   * (geen actieve debt-koppelingen), maar het display-pad is in stelling.
   */
  connection?: AssetConnectionSummary
  onClick: (debtId: string) => void
  staggerIndex?: number
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Format interest rate for display: e.g. 3.8 -> "3,8%"
 * Uses Dutch locale comma separator.
 */
function formatRate(rate: number): string {
  return `${rate.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// ── Component ───────────────────────────────────────────────

export function VermogenDebtCard({
  debt,
  kpiPair,
  connection,
  onClick,
  staggerIndex = 0,
}: VermogenDebtCardProps) {
  const { flashClass } = useFlashChange(debt.current_balance)
  const Icon = DEBT_ICONS[debt.debt_type]

  // Build subtitle parts: repayment type + interest rate
  const subtitleParts: string[] = []
  if (debt.repayment_type) {
    subtitleParts.push(REPAYMENT_TYPE_LABELS[debt.repayment_type])
  }
  if (debt.interest_rate > 0) {
    subtitleParts.push(formatRate(debt.interest_rate))
  }
  const subtitle = subtitleParts.join(' · ') // joined with middle dot

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(debt.id) }}
      className="card-editorial animate-fade-up w-full text-left"
      style={
        { '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties
      }
    >
      {/* 3px top accent bar — always red for debts */}
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: DEBT_ACCENT_COLOR }}
      />

      <div className="flex items-center gap-3 p-3 sm:p-4">
        {/* Left: icon + name + subtitle */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-red-100">
          <Icon className="h-4 w-4 text-red-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {debt.name}
            </p>
            {connection && <ConnectionIndicator connection={connection} />}
          </div>
          <p className="truncate text-[10px] text-[var(--ink-4)]">
            {DEBT_TYPE_LABELS[debt.debt_type]}
            {subtitle ? ` · ${subtitle}` : ''}
          </p>
        </div>

        {/* Right: balance + monthly payment */}
        <div className="shrink-0 text-right">
          <p
            className={`font-mono text-sm font-bold tabular-nums text-negative ${flashClass}`}
          >
            {formatCurrency(-Math.abs(debt.current_balance))}
          </p>
          {debt.monthly_payment > 0 && (
            <span className="font-mono text-[10px] font-medium tabular-nums text-[var(--ink-3)]">
              {formatCurrency(debt.monthly_payment)}
              <span className="text-[var(--ink-4)]">/mnd</span>
            </span>
          )}
        </div>
      </div>

      {kpiPair && <CardKpiStrip pair={kpiPair} variant="item" />}
    </button>
  )
}
