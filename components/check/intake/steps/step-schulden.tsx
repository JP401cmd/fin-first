'use client'

import { useState, useCallback, useId } from 'react'
import { Plus, Trash2, CreditCard } from 'lucide-react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { CheckIntakeDebt } from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'
import { parseBedrag } from '@/lib/check/use-check-draft'
import { primaryBtn, backBtn, inlineAddBtn, inputBase } from '../intake-styles'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

type DebtPreset = {
  debtType: string
  label: string
  hint: string
}

const DEBT_PRESETS: DebtPreset[] = [
  { debtType: 'mortgage', label: 'Hypotheek', hint: 'Resterende hypotheekschuld' },
  { debtType: 'personal_loan', label: 'Persoonlijke lening', hint: 'Aflopend of doorlopend krediet' },
  { debtType: 'student_loan', label: 'Studieschuld', hint: 'DUO of overig' },
  { debtType: 'car_loan', label: 'Autolening', hint: 'Financiering motorvoertuig' },
  { debtType: 'credit_card', label: 'Creditcard', hint: 'Openstaand saldo' },
  { debtType: 'other', label: 'Overige schuld', hint: 'Familie, belasting, rest' },
]

interface DebtRowFormProps {
  preset: DebtPreset
  onAdd: (debt: CheckIntakeDebt) => void
}

function DebtRowForm({ preset, onAdd }: DebtRowFormProps) {
  const [open, setOpen] = useState(false)
  const [rawLabel, setRawLabel] = useState('')
  const [rawBalance, setRawBalance] = useState('')
  const [rawRate, setRawRate] = useState('')
  const [rawPayment, setRawPayment] = useState('')
  const id = useId()

  function handleAdd() {
    const balance = parseBedrag(rawBalance)
    if (balance <= 0) return
    const rate = parseBedrag(rawRate)
    const payment = parseBedrag(rawPayment)
    onAdd({
      debtType: preset.debtType,
      name: rawLabel.trim() || preset.label,
      balance,
      interestRatePct: rate,
      monthlyPayment: payment,
    })
    setRawLabel('')
    setRawBalance('')
    setRawRate('')
    setRawPayment('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border border-dashed border-[var(--border-ed)] px-4 py-3 text-left text-sm text-[var(--ink-2)] transition-colors hover:border-wil-400 hover:bg-wil-50/50"
      >
        <Plus className="h-4 w-4 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
        <span className="font-display font-medium">{preset.label}</span>
        <span className="font-serif text-xs italic text-[var(--ink-3)]">{preset.hint}</span>
      </button>
    )
  }

  return (
    <div className="border border-wil-300 bg-wil-50/30 px-4 py-4 space-y-3">
      <p className="font-display text-sm font-semibold text-[var(--ink)]">{preset.label}</p>
      {/* Label (optioneel — om duplicaten te onderscheiden) */}
      <input
        type="text"
        value={rawLabel}
        onChange={(e) => setRawLabel(e.target.value)}
        placeholder={`Naam (optioneel) — bijv. ${preset.label} bij ABN`}
        aria-label={`Naam voor ${preset.label}`}
        className={`${inputBase('wil')} px-3 py-2 font-serif text-sm`}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {/* Saldo */}
        <div>
          <label htmlFor={`${id}-bal`} className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
            Openstaand saldo
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id={`${id}-bal`}
              type="text"
              inputMode="decimal"
              value={rawBalance}
              autoFocus
              onChange={(e) => setRawBalance(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="15.000"
              className={`${inputBase('wil')} py-2 pr-2 pl-6 font-mono text-sm tabular-nums`}
            />
          </div>
        </div>
        {/* Rente */}
        <div>
          <label htmlFor={`${id}-rate`} className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
            Rente %{' '}
            <span className="font-normal italic text-[var(--ink-4)]">(opt.)</span>
          </label>
          <div className="relative">
            <input
              id={`${id}-rate`}
              type="text"
              inputMode="decimal"
              value={rawRate}
              onChange={(e) => setRawRate(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="3,5"
              className={`${inputBase('wil')} px-3 py-2 font-mono text-sm tabular-nums`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-4)]">
              %
            </span>
          </div>
        </div>
        {/* Maandlast */}
        <div>
          <label htmlFor={`${id}-pay`} className="mb-1 block text-xs font-medium text-[var(--ink-3)]">
            Maandlast{' '}
            <span className="font-normal italic text-[var(--ink-4)]">(opt.)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id={`${id}-pay`}
              type="text"
              inputMode="decimal"
              value={rawPayment}
              onChange={(e) => setRawPayment(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="350"
              className={`${inputBase('wil')} py-2 pr-2 pl-6 font-mono text-sm tabular-nums`}
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={handleAdd} className={inlineAddBtn('wil')}>
          Toevoegen
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}

export function StepSchulden({ intake, onChange, onNext, onBack }: Props) {
  const debts = intake.debts ?? []
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0)

  const handleAdd = useCallback(
    (debt: CheckIntakeDebt) => {
      onChange({ debts: [...debts, debt] })
    },
    [debts, onChange],
  )

  const handleRemove = useCallback(
    (idx: number) => {
      onChange({ debts: debts.filter((_, i) => i !== idx) })
    },
    [debts, onChange],
  )

  return (
    <div className="space-y-4">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Schulden zijn vrijheid die je terugkoopt. Voeg toe wat relevant is — het complete beeld
        maakt je rapport nauwkeuriger.
      </p>

      {/* Bestaande schulden */}
      {debts.length > 0 && (
        <ul className="space-y-1" aria-label="Toegevoegde schulden">
          {debts.map((d, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 shrink-0 text-wil-500" aria-hidden="true" />
                <div>
                  <span className="font-serif text-sm text-[var(--ink)]">{d.name}</span>
                  {d.interestRatePct > 0 && (
                    <span className="ml-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                      {d.interestRatePct}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(d.balance)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  aria-label={`Verwijder ${d.name}`}
                  className="text-[var(--ink-4)] transition-colors hover:text-negative"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          <li className="flex justify-between border-t border-[var(--border-ed)] px-3 pt-2">
            <span className="font-serif text-xs italic text-[var(--ink-3)]">Totaal schulden</span>
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
              {formatCurrency(totalDebt)}
            </span>
          </li>
        </ul>
      )}

      {/* Voeg-toe rijen — elk type mag meerdere keren (onderscheid via naam) */}
      <div className="space-y-2">
        {DEBT_PRESETS.map((preset) => (
          <DebtRowForm key={preset.debtType} preset={preset} onAdd={handleAdd} />
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button type="button" onClick={onNext} className={primaryBtn('wil')}>
          {debts.length === 0 ? 'Overslaan (geen schulden)' : 'Verder'}
        </button>
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
