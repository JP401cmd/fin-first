'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, X, Check } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { BudgetIcon } from '@/components/app/budget-shared'
import { createClient } from '@/lib/supabase/client'
import { type Budget } from '@/lib/budget-data'

type TransferTransaction = {
  id: string
  date: string
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  amount: number
}

type MatchedAccount = {
  name: string
  iban: string | null
}

type TransferConfirmSheetProps = {
  transactions: TransferTransaction[]
  matchedAccounts: Map<string, MatchedAccount>
  budgetGroups: { parent: Budget; children: Budget[] }[]
  onClose: () => void
  onConfirmed: () => void
}

type Phase = 'confirm' | 'budget-select' | 'done'
type DoneAction = 'transfer' | 'joint' | 'expense'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function TransferConfirmSheet({
  transactions,
  matchedAccounts,
  budgetGroups,
  onClose,
  onConfirmed,
}: TransferConfirmSheetProps) {
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [doneAction, setDoneAction] = useState<DoneAction>('transfer')
  const [doneBudgetName, setDoneBudgetName] = useState<string | null>(null)

  const tx = transactions[currentIndex] ?? null
  const matchedAccount = tx ? matchedAccounts.get(tx.id) ?? null : null
  const total = transactions.length
  const showCounter = total > 1

  // Auto-advance after 'done' phase
  useEffect(() => {
    if (phase !== 'done') return
    const timer = setTimeout(() => {
      const nextIndex = currentIndex + 1
      if (nextIndex < total) {
        setCurrentIndex(nextIndex)
        setPhase('confirm')
        setSelectedBudgetId(null)
        setDoneBudgetName(null)
      } else {
        onConfirmed()
        onClose()
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [phase, currentIndex, total, onConfirmed, onClose])

  const handleConfirmTransfer = useCallback(async () => {
    if (!tx) return
    setSaving(true)
    const supabase = createClient()

    const { data: eigenBudget } = await supabase
      .from('budgets')
      .select('id')
      .eq('slug', 'eigen-rekening-sub')
      .limit(1)
      .maybeSingle()

    await supabase
      .from('transactions')
      .update({
        transaction_type: 'transfer',
        budget_id: eigenBudget?.id ?? null,
        category_source: 'transfer',
      })
      .eq('id', tx.id)

    setSaving(false)
    setDoneAction('transfer')
    setPhase('done')
  }, [tx])

  const handleConfirmJoint = useCallback(async () => {
    if (!tx) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('transactions')
      .update({
        transaction_type: 'joint_transfer',
        category_source: 'transfer',
      })
      .eq('id', tx.id)
    setSaving(false)
    setDoneAction('joint')
    setPhase('done')
  }, [tx])

  const handleDismissAsExpense = useCallback(async () => {
    if (!tx || !selectedBudgetId) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Update the transaction with selected budget
    await supabase
      .from('transactions')
      .update({
        budget_id: selectedBudgetId,
        category_source: 'user',
      })
      .eq('id', tx.id)

    // Upsert category_correction rule
    const matchField = tx.counterparty_name ? 'counterparty_name' : 'description'
    const matchValue = tx.counterparty_name || tx.description

    await supabase
      .from('category_corrections')
      .delete()
      .eq('user_id', user.id)
      .eq('match_field', matchField)
      .ilike('match_value', matchValue)

    await supabase.from('category_corrections').insert({
      user_id: user.id,
      match_field: matchField,
      match_value: matchValue,
      budget_id: selectedBudgetId,
    })

    // Find budget name for done message
    const budgetName = budgetGroups
      .flatMap(g => [g.parent, ...g.children])
      .find(b => b.id === selectedBudgetId)?.name ?? null

    setSaving(false)
    setDoneAction('expense')
    setDoneBudgetName(budgetName)
    setPhase('done')
  }, [tx, selectedBudgetId, budgetGroups])

  if (!tx) return null

  const dateObj = new Date(tx.date + 'T00:00:00')
  const dateLabel = dateObj.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Filter budget groups: exclude archive and income
  const filteredGroups = budgetGroups.filter(
    g => g.parent.budget_type !== 'archive' && g.parent.budget_type !== 'income'
  )

  return (
    <BottomSheet open={transactions.length > 0} onClose={onClose} title="Overboeking controleren">
      {/* Counter */}
      {showCounter && phase !== 'done' && (
        <p className="mb-3 text-xs font-medium text-[var(--ink-3)]">
          {currentIndex + 1} van {total}
        </p>
      )}

      {/* Phase: confirm */}
      {phase === 'confirm' && (
        <>
          {/* Kassabon container */}
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
            <div className="mb-3 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-2)]">
                Transactiedetails
              </p>
              <p className="mt-0.5 text-[11px] italic text-[var(--ink-3)] font-[var(--font-source-serif)]">
                {dateLabel}
              </p>
            </div>

            <p className="mb-3 font-sans text-[11px] text-[var(--ink-3)]">
              Het tegenpartij-IBAN van deze transactie komt overeen met een van jouw eigen rekeningen.
            </p>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--ink-3)]">Omschrijving</span>
                <span className="max-w-[180px] truncate text-right tabular-nums text-[var(--ink)]">
                  {tx.description}
                </span>
              </div>
              {tx.counterparty_name && (
                <div className="flex justify-between">
                  <span className="text-[var(--ink-3)]">Tegenpartij</span>
                  <span className="max-w-[180px] truncate text-right text-[var(--ink)]">
                    {tx.counterparty_name}
                  </span>
                </div>
              )}
              {tx.counterparty_iban && (
                <div className="flex justify-between">
                  <span className="text-[var(--ink-3)]">Tegenrekening</span>
                  <span className="tabular-nums text-[var(--ink)]">
                    {tx.counterparty_iban}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--ink-3)]">Bedrag</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            </div>

            <div className="my-3 border-b border-dashed border-[var(--border-ed)]" />

            {matchedAccount && (
              <div className="space-y-1">
                <p className="text-[11px] text-[var(--ink-3)]">Rekening gevonden in tf.:</p>
                <div className="flex justify-between">
                  <span className="text-[var(--ink-2)]">{matchedAccount.name}</span>
                  {matchedAccount.iban && (
                    <span className="tabular-nums text-[var(--ink-3)]">
                      {matchedAccount.iban.slice(-4).padStart(matchedAccount.iban.length, '·')}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 border-t-2 border-[var(--ink)] pt-2">
              <div className="flex justify-between font-bold">
                <span className="text-[var(--ink)]">Als overboeking</span>
                <span className="text-[var(--ink-2)]">geen budgetimpact</span>
              </div>
            </div>
          </div>

          {/* AI quote */}
          <div className="mt-4 border-l-[3px] border-kern-400 pl-3">
            <p className="text-[13px] italic leading-relaxed text-[var(--ink-2)] font-[var(--font-source-serif)]">
              &ldquo;Dit bedrag verplaatst geld tussen jouw eigen rekeningen. Het kost geen vrijheidsdagen.&rdquo;
            </p>
          </div>

          {/* Buttons */}
          <div className="mt-5 space-y-2">
            <button
              onClick={handleConfirmTransfer}
              disabled={saving}
              className="w-full rounded-[var(--r)] bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Ja, eigen overboeking'}
            </button>
            <button
              onClick={() => setPhase('budget-select')}
              disabled={saving}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
            >
              Nee, echte uitgave
            </button>
            <button
              onClick={handleConfirmJoint}
              disabled={saving}
              className="w-full px-4 py-1.5 text-[11px] italic text-[var(--ink-4)] hover:text-kern-600 font-[var(--font-source-serif)] disabled:opacity-50"
            >
              Overboeking naar gezamenlijk account &rarr;
            </button>
          </div>
        </>
      )}

      {/* Phase: budget-select */}
      {phase === 'budget-select' && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => { setPhase('confirm'); setSelectedBudgetId(null) }}
              className="rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--subtle)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-semibold text-[var(--ink)]">Kies een budget</h3>
          </div>

          <p className="mb-3 text-xs text-[var(--ink-3)]">
            Selecteer het budget waar deze transactie bij hoort.
          </p>

          <div className="max-h-[50vh] overflow-y-auto space-y-3">
            {filteredGroups.map(group => (
              <div key={group.parent.id}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-3)]">
                  {group.parent.name}
                </p>
                <div className="space-y-0.5">
                  {group.children
                    .filter(b => b.budget_type !== 'archive' && b.budget_type !== 'income')
                    .map(budget => (
                      <button
                        key={budget.id}
                        onClick={() => setSelectedBudgetId(budget.id)}
                        className={`flex w-full items-center gap-2.5 rounded-[var(--r)] px-3 py-2 text-left transition-colors ${
                          selectedBudgetId === budget.id
                            ? 'border border-kern-500 bg-kern-50'
                            : 'border border-transparent hover:bg-[var(--subtle)]'
                        }`}
                      >
                        <BudgetIcon name={budget.icon} className="h-4 w-4 text-[var(--ink-3)]" />
                        <span className="text-sm text-[var(--ink)]">{budget.name}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleDismissAsExpense}
            disabled={saving || !selectedBudgetId}
            className="mt-4 w-full rounded-[var(--r)] bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </>
      )}

      {/* Phase: done */}
      {phase === 'done' && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-[var(--ink)]">
            {doneAction === 'transfer' && 'Bevestigd als eigen overboeking'}
            {doneAction === 'joint' && 'Bevestigd als gezamenlijke overboeking'}
            {doneAction === 'expense' && `Gecategoriseerd als ${doneBudgetName ?? 'uitgave'}`}
          </p>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-1 text-[var(--ink-3)] hover:bg-[var(--subtle)]"
      >
        <X className="h-5 w-5" />
      </button>
    </BottomSheet>
  )
}
