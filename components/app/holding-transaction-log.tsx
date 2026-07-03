'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ArrowUpRight, ArrowDownRight, DollarSign, Receipt,
  TrendingUp, TrendingDown, Loader2, AlertTriangle,
  Plus, ChevronDown, ChevronUp, Trash2, Split,
} from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { MaskedAmount } from '@/components/app/masked-amount'

type TransactionWithPnL = {
  id: string
  holding_id: string
  type: 'buy' | 'sell' | 'dividend' | 'split'
  units: number
  price_per_unit: number
  total_amount: number
  date: string
  notes: string | null
  created_at: string
  running_units: number
  running_cost_basis: number
  running_avg_price: number
  realized_pnl: number
  cumulative_realized_pnl: number
  cumulative_dividends: number
}

type TransactionSummary = {
  total_invested: number
  total_sold: number
  realized_pnl: number
  unrealized_pnl: number
  dividend_income: number
  total_return: number
  current_units: number
  current_avg_price: number
  current_price: number
}

type HoldingTransactionLogProps = {
  holdingId: string
  holdingName: string
  holdingTicker?: string | null
  onTransactionAdded?: () => void
}

const typeConfig = {
  buy: {
    label: 'Koop',
    icon: ArrowDownRight,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    sign: '+',
  },
  sell: {
    label: 'Verkoop',
    icon: ArrowUpRight,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badgeBg: 'bg-red-100',
    sign: '-',
  },
  dividend: {
    label: 'Dividend',
    icon: DollarSign,
    color: 'text-kern-600',
    bg: 'bg-kern-50',
    border: 'border-kern-200',
    badgeBg: 'bg-kern-100',
    sign: '+',
  },
  split: {
    label: 'Split',
    icon: Split,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badgeBg: 'bg-violet-100',
    sign: '',
  },
}

export default function HoldingTransactionLog({
  holdingId,
  holdingName,
  holdingTicker,
  onTransactionAdded,
}: HoldingTransactionLogProps) {
  const [transactions, setTransactions] = useState<TransactionWithPnL[]>([])
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const [showNewTxForm, setShowNewTxForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadTransactions = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/holdings/${holdingId}/transactions`)
      if (!res.ok) {
        if (res.status === 401) throw new Error('Niet ingelogd')
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setTransactions(data.transactions || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon transacties niet laden')
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  const handleDeleteTransaction = useCallback(async (txId: string) => {
    if (deleting) return
    setDeleting(txId)
    try {
      const res = await fetch(`/api/holding-transactions?id=${txId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Verwijderen mislukt')
      }
      setDeleteConfirm(null)
      setExpandedTx(null)
      setLoading(true)
      loadTransactions()
      onTransactionAdded?.() // refresh parent holding data too
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt')
    } finally {
      setDeleting(null)
    }
  }, [deleting, loadTransactions, onTransactionAdded])

  useEffect(() => {
    loadTransactions()
  }, [loadTransactions])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="transaction-log-loading">
        <Loader2 className="h-6 w-6 animate-spin text-kern-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-4" data-testid="transaction-log-error">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadTransactions() }}
          className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="transaction-log">
      {/* P&L Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="pnl-summary">
          <SummaryCard
            label="Totaal belegd"
            value={summary.total_invested}
            testId="total-invested"
          />
          <SummaryCard
            label="Gerealiseerde W/V"
            value={summary.realized_pnl}
            colored
            testId="realized-pnl"
          />
          <SummaryCard
            label="Ongerealiseerde W/V"
            value={summary.unrealized_pnl}
            colored
            testId="unrealized-pnl"
          />
          <SummaryCard
            label="Dividend inkomen"
            value={summary.dividend_income}
            colored
            testId="dividend-income"
          />
          <SummaryCard
            label="Totaal rendement"
            value={summary.total_return}
            colored
            highlight
            testId="total-return"
          />
        </div>
      )}

      {/* New transaction button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--ink-2)]">
          Transactiegeschiedenis
          {transactions.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-[var(--ink-3)]">
              ({transactions.length} transactie{transactions.length !== 1 ? 's' : ''})
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowNewTxForm(!showNewTxForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700"
          data-testid="new-transaction-btn"
        >
          <Plus className="h-3.5 w-3.5" />
          Transactie toevoegen
        </button>
      </div>

      {/* Inline new transaction form */}
      {showNewTxForm && (
        <InlineTransactionForm
          holdingId={holdingId}
          holdingName={holdingName}
          currentUnits={summary?.current_units || 0}
          currentPrice={summary?.current_price || 0}
          onSaved={() => {
            setShowNewTxForm(false)
            setLoading(true)
            loadTransactions()
            onTransactionAdded?.()
          }}
          onCancel={() => setShowNewTxForm(false)}
        />
      )}

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-8 text-center" data-testid="no-transactions">
          <Receipt className="mx-auto h-10 w-10 text-[var(--ink-4)]" />
          <p className="mt-3 text-sm font-medium text-[var(--ink-2)]">Nog geen transacties</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Registreer je eerste koop-, verkoop-, dividend- of splittransactie.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5" data-testid="transaction-list">
          {transactions.map((tx) => {
            const cfg = typeConfig[tx.type] || typeConfig.buy
            const Icon = cfg.icon
            const isExpanded = expandedTx === tx.id

            return (
              <div
                key={tx.id}
                className={`rounded-[var(--r-lg)] border bg-[var(--paper)] transition-colors ${isExpanded ? 'border-kern-200' : 'border-[var(--border-ed)]'}`}
                data-testid={`transaction-item-${tx.id}`}
              >
                {/* Transaction row */}
                <button
                  className="flex w-full items-center gap-3 p-3 text-left"
                  onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-[var(--ink-3)]">
                        {new Date(tx.date).toLocaleDateString('nl-NL', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                      {tx.notes && (
                        <span className="truncate text-xs text-[var(--ink-3)] italic">
                          {tx.notes}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-3)]">
                      {tx.type === 'split'
                        ? `${tx.units}:1 split`
                        : `${tx.units} eenhe${tx.units === 1 ? 'id' : 'den'} @ ${formatCurrency(tx.price_per_unit)}`
                      }
                    </p>
                  </div>

                  {/* Transaction amount */}
                  <div className="shrink-0 text-right">
                    {tx.type === 'split' ? (
                      <p className={`text-sm font-semibold ${cfg.color}`}>
                        {tx.units}:1
                      </p>
                    ) : (
                      <>
                        <p className={`text-sm font-semibold ${cfg.color}`}>
                          {cfg.sign}{<MaskedAmount value={tx.total_amount} tone="kern" />}
                        </p>
                        <FreedomTimeBadge amount={tx.total_amount} className="mt-0.5 justify-end text-[10px]" />
                        {tx.type === 'sell' && tx.realized_pnl !== 0 && (
                          <p className={`text-xs font-medium ${tx.realized_pnl >= 0 ? 'text-positive' : 'text-negative'}`}
                             data-testid="tx-realized-pnl"
                          >
                            W/V: {tx.realized_pnl >= 0 ? '+' : ''}{<MaskedAmount value={tx.realized_pnl} tone="kern" />}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
                    )}
                  </div>
                </button>

                {/* Expanded detail: running P&L */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-ed)] px-3 py-3" data-testid="tx-detail">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <MiniStat label="Eenheden na tx" value={tx.running_units.toString()} />
                      <MiniStat label="Gem. kosten" value={<MaskedAmount value={tx.running_avg_price} tone="kern" />} />
                      <MiniStat label="Kostenbasis" value={<MaskedAmount value={tx.running_cost_basis} tone="kern" />} />
                      {tx.type === 'sell' && (
                        <MiniStat
                          label="Gerealiseerde W/V"
                          value={<MaskedAmount value={tx.realized_pnl} signPrefix={tx.realized_pnl >= 0 ? '+' : ''} tone="kern" />}
                          colored={tx.realized_pnl}
                        />
                      )}
                      <MiniStat
                        label="Cumulatieve W/V"
                        value={<MaskedAmount value={tx.cumulative_realized_pnl} signPrefix={tx.cumulative_realized_pnl >= 0 ? '+' : ''} tone="kern" />}
                        colored={tx.cumulative_realized_pnl}
                      />
                      {tx.cumulative_dividends > 0 && (
                        <MiniStat
                          label="Cum. dividenden"
                          value={<MaskedAmount value={tx.cumulative_dividends} tone="kern" />}
                          colored={tx.cumulative_dividends}
                        />
                      )}
                    </div>
                    {/* Delete transaction button */}
                    <div className="mt-3 flex justify-end border-t border-[var(--border-ed)] pt-3">
                      {deleteConfirm === tx.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--ink-3)]">Transactie verwijderen?</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(tx.id) }}
                            disabled={deleting === tx.id}
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            data-testid={`tx-delete-confirm-${tx.id}`}
                          >
                            {deleting === tx.id ? 'Bezig...' : 'Ja, verwijder'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                            className="rounded-lg border border-[var(--border-ed)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                          >
                            Annuleren
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tx.id) }}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          data-testid={`tx-delete-trigger-${tx.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Verwijderen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────

function SummaryCard({
  label,
  value,
  colored = false,
  highlight = false,
  testId,
}: {
  label: string
  value: number
  colored?: boolean
  highlight?: boolean
  testId?: string
}) {
  const valueColor = colored
    ? value > 0
      ? 'text-emerald-600'
      : value < 0
        ? 'text-red-600'
        : 'text-[var(--ink-2)]'
    : 'text-[var(--ink)]'

  return (
    <div
      className={`rounded-[var(--r-lg)] border p-3 ${
        highlight
          ? 'border-kern-200 bg-kern-50/50'
          : 'border-[var(--border-ed)] bg-[var(--paper)]'
      }`}
      data-testid={testId}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <p className={`mt-1 text-sm font-bold ${valueColor}`} data-testid={testId ? `${testId}-value` : undefined}>
        {colored && value > 0 ? '+' : ''}{<MaskedAmount value={value} tone="kern" />}
      </p>
    </div>
  )
}

function MiniStat({
  label,
  value,
  colored,
}: {
  label: string
  value: React.ReactNode
  colored?: number
}) {
  const color = colored !== undefined
    ? colored > 0
      ? 'text-emerald-600'
      : colored < 0
        ? 'text-red-600'
        : 'text-[var(--ink-2)]'
    : 'text-[var(--ink)]'

  return (
    <div>
      <p className="text-[10px] font-medium text-[var(--ink-3)]">{label}</p>
      <p className={`text-xs font-semibold ${color}`}>{value}</p>
    </div>
  )
}

// ── Inline transaction form ────────────────────────────────────

function InlineTransactionForm({
  holdingId,
  holdingName,
  currentUnits,
  currentPrice,
  onSaved,
  onCancel,
}: {
  holdingId: string
  holdingName: string
  currentUnits: number
  currentPrice: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [txType, setTxType] = useState<'buy' | 'sell' | 'dividend' | 'split'>('buy')
  const [units, setUnits] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState(String(currentPrice || ''))
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalAmount = txType === 'split' ? 0 : (Number(units) || 0) * (Number(pricePerUnit) || 0)
  const sellExceedsOwned = txType === 'sell' && Number(units) > currentUnits
  const sellFromZero = txType === 'sell' && currentUnits <= 0
  const splitInvalid = txType === 'split' && (Number(units) || 0) < 2

  async function handleSave() {
    if (!units || !date) return
    if (txType !== 'split' && !pricePerUnit) return
    if (txType === 'sell' && (sellExceedsOwned || sellFromZero)) return
    if (txType === 'split' && splitInvalid) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/holdings/${holdingId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: txType,
          units: Number(units),
          price_per_unit: txType === 'split' ? 0 : Number(pricePerUnit),
          date,
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon transactie niet opslaan')
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50/30 p-4" data-testid="inline-transaction-form">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Type selector */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        {(['buy', 'sell', 'dividend', 'split'] as const).map((t) => {
          const cfg = typeConfig[t]
          const Icon = cfg.icon
          return (
            <button
              key={t}
              onClick={() => setTxType(t)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                txType === t
                  ? `${cfg.bg} ${cfg.border} ${cfg.color} ring-1 ring-offset-0`
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
              }`}
              data-testid={`tx-type-${t}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Fields */}
      {txType === 'split' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">
              Split ratio (bijv. 2 voor 2:1) *
            </label>
            <input
              type="number"
              step="1"
              min="2"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className={`w-full rounded-lg border px-2.5 py-1.5 text-sm ${
                splitInvalid && units ? 'border-red-300 bg-red-50/50' : 'border-[var(--border-ed)]'
              }`}
              placeholder="2"
              autoFocus
              data-testid="tx-units-input"
            />
            {currentUnits > 0 && Number(units) >= 2 && (
              <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                {currentUnits} eenheden &rarr; {currentUnits * Number(units)} eenheden
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Datum *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] px-2.5 py-1.5 text-sm"
              data-testid="tx-date-input"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">
              {txType === 'dividend' ? 'Bedrag per eenheid' : 'Eenheden'} *
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className={`w-full rounded-lg border px-2.5 py-1.5 text-sm ${
                  sellExceedsOwned || sellFromZero ? 'border-red-300 bg-red-50/50' : 'border-[var(--border-ed)]'
                }`}
                placeholder="10"
                autoFocus
                data-testid="tx-units-input"
              />
              {txType === 'sell' && currentUnits > 0 && (
                <button
                  type="button"
                  onClick={() => setUnits(String(currentUnits))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-red-600 hover:text-red-700"
                  data-testid="sell-all-inline-btn"
                >
                  Alles
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Prijs *</label>
            <input
              type="number"
              step="0.01"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] px-2.5 py-1.5 text-sm"
              placeholder="50.00"
              data-testid="tx-price-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Datum *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-ed)] px-2.5 py-1.5 text-sm"
              data-testid="tx-date-input"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">Totaal</label>
            <div className="flex items-center rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-1.5 text-sm font-medium text-[var(--ink-2)]">
              {<MaskedAmount value={totalAmount} tone="kern" />}
            </div>
          </div>
        </div>
      )}

      {/* Sell validation */}
      {(sellExceedsOwned || sellFromZero) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3" />
          {sellFromZero
            ? 'Deze holding heeft 0 eenheden. Je kunt niet verkopen.'
            : `Je hebt maar ${currentUnits} eenheden. Je kunt niet meer verkopen dan je bezit.`}
        </div>
      )}

      {/* Split validation */}
      {txType === 'split' && splitInvalid && units && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3" />
          Split ratio moet minimaal 2 zijn (bijv. 2 voor een 2:1 split).
        </div>
      )}

      {/* Notes + actions */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border-ed)] px-2.5 py-1.5 text-sm"
          placeholder="Notitie (optioneel)"
          data-testid="tx-notes-input"
        />
        <button
          onClick={onCancel}
          className="rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
        >
          Annuleren
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !units || !date || (txType !== 'split' && !pricePerUnit) || sellExceedsOwned || sellFromZero || (txType === 'split' && splitInvalid)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
            txType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' :
            txType === 'sell' ? 'bg-red-600 hover:bg-red-700' :
            txType === 'split' ? 'bg-violet-600 hover:bg-violet-700' :
            'bg-kern-600 hover:bg-kern-700'
          }`}
          data-testid="tx-save-btn"
        >
          {saving ? 'Opslaan...' : `${typeConfig[txType].label} registreren`}
        </button>
      </div>
    </div>
  )
}
