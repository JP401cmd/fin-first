'use client'

import { useState } from 'react'
import { X, Edit3, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  type Debt,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_SUBTYPE_LABELS,
  REPAYMENT_TYPE_LABELS,
  debtProjection,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import type { Valuation } from './debt-types'
import { DebtTrajectoryChart } from './debt-trajectory-chart'

export function DebtDetailModal({
  debt,
  valuations,
  userAssets,
  dailyExpenses,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
  userAssets: Asset[]
  dailyExpenses: number
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const balance = Number(debt.current_balance)
  const original = Number(debt.original_amount)
  const pct = original > 0 ? ((original - balance) / original) * 100 : 0
  const proj = debtProjection(debt)
  const icon = DEBT_TYPE_ICONS[debt.debt_type] ?? 'CircleDot'
  const linkedAsset = debt.linked_asset_id ? userAssets.find((a) => a.id === debt.linked_asset_id) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <BudgetIcon name={icon} className="h-5 w-5 text-kern-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[var(--ink)]">{debt.name}</h2>
            <p className="text-xs text-[var(--ink-3)]">
              {DEBT_TYPE_LABELS[debt.debt_type]}
              {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                : ''}
              {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance highlight */}
        <div className="border-b border-[var(--border-ed)] px-6 py-4 text-center">
          <p className="text-3xl font-bold text-[var(--ink)]" data-testid="modal-debt-balance">{formatCurrency(balance)}</p>
          {dailyExpenses > 0 && balance >= 100 && (
            <p className="mt-0.5 text-sm text-kern-600" data-testid="modal-debt-freedom-time">
              je koopt deze tijd terug in {formatFreedomTimeString(calculateFreedomTime(balance, dailyExpenses), 'long')}
            </p>
          )}
          <p className="mt-1 text-sm text-[var(--ink-3)]">van {formatCurrency(original)} ({pct.toFixed(1)}% afgelost)</p>
          <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-kern-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {debt.repayment_type && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
                {REPAYMENT_TYPE_LABELS[debt.repayment_type]}
              </span>
            )}
            {debt.nhg && (
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">NHG</span>
            )}
            {debt.is_tax_deductible && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Renteaftrek</span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          {/* Payoff timeline highlight */}
          {debt.repayment_type !== 'aflossingsvrij' && proj.isPayable && proj.monthsToPayoff > 0 && (
            <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-3 text-center" data-testid="payoff-timeline">
              <p className="text-xs font-medium text-kern-700/60 uppercase">Aflostijd</p>
              <p className="mt-1 text-2xl font-bold text-kern-700" data-testid="months-to-payoff">
                {proj.monthsToPayoff} maanden
              </p>
              <p className="mt-0.5 text-xs text-kern-600" data-testid="payoff-freedom-message">
                {proj.payoffDate
                  ? `Schuldenvrij in ${new Date(proj.payoffDate).getFullYear()} — dan verdien je 100% voor jezelf`
                  : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Rente</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(debt.interest_rate)}% p.j.</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3" data-testid="modal-monthly-payment">
              <p className="text-xs text-[var(--ink-3)]">Maandelijkse betaling</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{formatCurrency(Number(debt.monthly_payment))}</p>
              {dailyExpenses > 0 && Number(debt.monthly_payment) > 0 && (
                <p className="mt-0.5 text-[10px] text-kern-600/80" data-testid="modal-payment-freedom-days">
                  je wint {Math.round(Number(debt.monthly_payment) / dailyExpenses)} {Math.round(Number(debt.monthly_payment) / dailyExpenses) === 1 ? 'dag' : 'dagen'} per maand terug
                </p>
              )}
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Aflossing op</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {debt.repayment_type === 'aflossingsvrij'
                  ? 'Aflossingsvrij'
                  : proj.isPayable && proj.payoffDate
                    ? new Date(proj.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                    : 'Onbekend'}
              </p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Resterende rente</p>
              <p className="mt-0.5 text-sm font-medium text-red-600">
                {proj.isPayable ? formatCurrency(proj.totalInterest) : 'Onbetaalbaar'}
              </p>
              {dailyExpenses > 0 && proj.isPayable && proj.totalInterest >= 100 && (
                <p className="mt-0.5 text-[10px] text-red-500/80">
                  {formatFreedomTimeString(calculateFreedomTime(proj.totalInterest, dailyExpenses), 'long')} verloren tijd
                </p>
              )}
            </div>
          </div>

          {/* Type-specific details */}
          {(() => {
            const details: { label: string; value: string }[] = []
            if (debt.fixed_rate_end_date) details.push({ label: 'Rentevast tot', value: new Date(debt.fixed_rate_end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (debt.credit_limit) details.push({ label: 'Kredietlimiet', value: formatCurrency(Number(debt.credit_limit)) })
            if (linkedAsset) details.push({ label: 'Gekoppelde woning', value: linkedAsset.name })
            if (debt.draagkrachtmeting_date) details.push({ label: 'Draagkrachtmeting', value: new Date(debt.draagkrachtmeting_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (details.length === 0) return null
            return (
              <div className="grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-[var(--r)] bg-kern-50/50 p-3">
                    <p className="text-xs text-kern-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {!proj.isPayable && debt.repayment_type !== 'aflossingsvrij' && (
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">
                De maandelijkse betaling dekt de rente niet. Verhoog de betaling om deze schuld af te lossen.
              </p>
            </div>
          )}

          {debt.notes && <p className="text-xs text-[var(--ink-3)]">{debt.notes}</p>}

          {/* Debt trajectory chart: actual vs projected */}
          <DebtTrajectoryChart debt={debt} valuations={valuations} />

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Saldohistorie</p>
              <div className="space-y-1">
                {valuations.slice(0, 5).map((v) => {
                  const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
                  const diff = prev ? Number(v.value) - Number(prev.value) : null
                  return (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-[var(--ink-3)]">
                        {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(v.value))}</span>
                      {diff !== null && (
                        <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button
            onClick={onRevalue}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] border border-kern-200 px-3 py-2 text-xs font-medium text-kern-700 hover:bg-kern-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Saldo bijwerken
          </button>
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bewerken
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Bevestigen
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
