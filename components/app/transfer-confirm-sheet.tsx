'use client'

import { useState } from 'react'
import { ArrowLeftRight, X } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'

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
  transaction: TransferTransaction | null
  matchedAccount: MatchedAccount | null
  onClose: () => void
  onConfirmed: () => void
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function TransferConfirmSheet({
  transaction,
  matchedAccount,
  onClose,
  onConfirmed,
}: TransferConfirmSheetProps) {
  const [saving, setSaving] = useState(false)

  if (!transaction) return null

  const dateObj = new Date(transaction.date + 'T00:00:00')
  const dateLabel = dateObj.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function handleConfirmTransfer() {
    if (!transaction) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('transactions')
      .update({
        transaction_type: 'transfer',
        budget_id: null,
        category_source: 'transfer',
      })
      .eq('id', transaction.id)
    setSaving(false)
    onConfirmed()
    onClose()
  }

  async function handleConfirmJoint() {
    if (!transaction) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('transactions')
      .update({
        transaction_type: 'joint_transfer',
        category_source: 'transfer',
      })
      .eq('id', transaction.id)
    setSaving(false)
    onConfirmed()
    onClose()
  }

  return (
    <BottomSheet open={!!transaction} onClose={onClose} title="Overboeking controleren">
      {/* Kassabon container */}
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-4 font-mono text-sm">
        {/* Header */}
        <div className="mb-3 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--ink-2)]">
            Transactiedetails
          </p>
          <p className="mt-0.5 text-[11px] italic text-[var(--ink-3)] font-[var(--font-source-serif)]">
            {dateLabel}
          </p>
        </div>

        {/* Uitleg */}
        <p className="mb-3 text-[11px] text-[var(--ink-4)]">
          Het tegenpartij-IBAN van deze transactie komt overeen met een van jouw eigen rekeningen.
        </p>

        {/* Regelitems */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Omschrijving</span>
            <span className="max-w-[180px] truncate text-right tabular-nums text-[var(--ink)]">
              {transaction.description}
            </span>
          </div>
          {transaction.counterparty_name && (
            <div className="flex justify-between">
              <span className="text-[var(--ink-3)]">Tegenpartij</span>
              <span className="max-w-[180px] truncate text-right text-[var(--ink)]">
                {transaction.counterparty_name}
              </span>
            </div>
          )}
          {transaction.counterparty_iban && (
            <div className="flex justify-between">
              <span className="text-[var(--ink-3)]">Tegenrekening</span>
              <span className="tabular-nums text-[var(--ink)]">
                {transaction.counterparty_iban}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--ink-3)]">Bedrag</span>
            <span className="tabular-nums text-[var(--ink)]">
              {formatCurrency(transaction.amount)}
            </span>
          </div>
        </div>

        {/* Scheidingslijn */}
        <div className="my-3 border-b border-dashed border-zinc-300" />

        {/* Rekening match */}
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

        {/* Totaalregel */}
        <div className="mt-3 border-t-2 border-zinc-900 pt-2">
          <div className="flex justify-between font-bold">
            <span className="text-[var(--ink)]">Als overboeking</span>
            <span className="text-[var(--ink-2)]">geen budgetimpact</span>
          </div>
        </div>
      </div>

      {/* AI quote */}
      <div className="mt-4 border-l-[3px] border-kern-400 pl-3">
        <p className="text-[13px] italic leading-relaxed text-[var(--ink-2)] font-[var(--font-source-serif)]">
          "Dit bedrag verplaatst geld tussen jouw eigen rekeningen. Het kost geen vrijheidsdagen."
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
          onClick={onClose}
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
          Overboeking naar gezamenlijk account →
        </button>
      </div>

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
