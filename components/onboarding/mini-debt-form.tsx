'use client'

import { useState } from 'react'
import {
  DEBT_TYPE_LABELS,
  DEBT_TYPE_FIELDS,
  DEBT_SUBTYPE_LABELS,
  DEBT_SUBTYPE_DEFAULTS,
  REPAYMENT_TYPE_LABELS,
  type DebtType,
  type RepaymentType,
} from '@/lib/debt-data'

export interface DebtEntry {
  name: string
  debt_type: DebtType
  original_amount: string
  current_balance: string
  interest_rate: string
  minimum_payment: string
  monthly_payment: string
  creditor: string
  // Type-specific
  subtype: string
  repayment_type: string
  is_tax_deductible: boolean
  fixed_rate_end_date: string
  nhg: boolean
  credit_limit: string
  draagkrachtmeting_date: string
}

const EMPTY: DebtEntry = {
  name: '',
  debt_type: 'personal_loan',
  original_amount: '',
  current_balance: '',
  interest_rate: '',
  minimum_payment: '',
  monthly_payment: '',
  creditor: '',
  subtype: '',
  repayment_type: '',
  is_tax_deductible: false,
  fixed_rate_end_date: '',
  nhg: false,
  credit_limit: '',
  draagkrachtmeting_date: '',
}

const ALL_TYPES: DebtType[] = ['mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'other']

export function MiniDebtForm({
  items,
  onChange,
}: {
  items: DebtEntry[]
  onChange: (items: DebtEntry[]) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<DebtEntry>({ ...EMPTY })

  function openNew() {
    setDraft({ ...EMPTY })
    setEditingIndex(-1)
  }

  function openEdit(i: number) {
    setDraft({ ...items[i] })
    setEditingIndex(i)
  }

  function save() {
    if (!draft.name || !draft.current_balance) return
    if (editingIndex === -1) {
      onChange([...items, { ...draft }])
    } else if (editingIndex !== null) {
      onChange(items.map((item, idx) => (idx === editingIndex ? { ...draft } : item)))
    }
    setEditingIndex(null)
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  function updateDraft(patch: Partial<DebtEntry>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function handleTypeChange(debt_type: DebtType) {
    updateDraft({
      debt_type,
      subtype: '',
      repayment_type: '',
      is_tax_deductible: false,
      fixed_rate_end_date: '',
      nhg: false,
      credit_limit: '',
      draagkrachtmeting_date: '',
    })
  }

  function handleSubtypeChange(subtype: string) {
    const defaults = DEBT_SUBTYPE_DEFAULTS[subtype]
    updateDraft({
      subtype,
      ...(defaults?.repayment_type ? { repayment_type: defaults.repayment_type } : {}),
      ...(defaults?.is_tax_deductible !== undefined ? { is_tax_deductible: defaults.is_tax_deductible } : {}),
    })
  }

  const visibleFields = editingIndex !== null ? DEBT_TYPE_FIELDS[draft.debt_type] : []
  const subtypeLabels = editingIndex !== null ? DEBT_SUBTYPE_LABELS[draft.debt_type] : undefined

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {DEBT_TYPE_LABELS[item.debt_type]} &middot; &euro;{Number(item.current_balance).toLocaleString('nl-NL')}
              {item.interest_rate && <> &middot; {item.interest_rate}%</>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => openEdit(i)} className="text-xs font-medium text-wil-600 hover:text-wil-800">Bewerk</button>
            <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-700">Verwijder</button>
          </div>
        </div>
      ))}

      {/* Add button */}
      <button
        onClick={openNew}
        className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-ed)] py-2 text-xs font-medium text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)] active:bg-[var(--subtle)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Schuld toevoegen
      </button>

      {/* Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditingIndex(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] p-4 shadow-xl sm:p-6 [&_input]:text-base [&_input]:sm:text-sm [&_select]:text-base [&_select]:sm:text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-[var(--ink)]">
              {editingIndex === -1 ? 'Schuld toevoegen' : 'Schuld bewerken'}
            </h3>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
                <select
                  value={draft.debt_type}
                  onChange={(e) => handleTypeChange(e.target.value as DebtType)}
                  className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>{DEBT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Subtype */}
              {visibleFields.includes('subtype') && subtypeLabels && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
                  <select
                    value={draft.subtype}
                    onChange={(e) => handleSubtypeChange(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  >
                    <option value="">— Kies subtype —</option>
                    {Object.entries(subtypeLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
                <input
                  type="text"
                  placeholder="Bijv. Hypotheek ABN AMRO"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                />
              </div>

              {/* Original amount */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Oorspronkelijk bedrag</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={100}
                    min={0}
                    value={draft.original_amount}
                    onChange={(e) => updateDraft({ original_amount: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Current balance */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={100}
                    min={0}
                    value={draft.current_balance}
                    onChange={(e) => updateDraft({ current_balance: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Interest rate */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rente (% per jaar)</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={0}
                    value={draft.interest_rate}
                    onChange={(e) => updateDraft({ interest_rate: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 pr-8 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">%</span>
                </div>
              </div>

              {/* Minimum payment */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Minimale aflossing / maand</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={10}
                    min={0}
                    value={draft.minimum_payment}
                    onChange={(e) => updateDraft({ minimum_payment: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Monthly payment */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Werkelijke maandbetaling</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={10}
                    min={0}
                    value={draft.monthly_payment}
                    onChange={(e) => updateDraft({ monthly_payment: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Creditor */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietverstrekker</label>
                <input
                  type="text"
                  placeholder="Bijv. ABN AMRO, ING, DUO"
                  value={draft.creditor}
                  onChange={(e) => updateDraft({ creditor: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                />
              </div>

              {/* ── Type-specific fields ──────────────── */}

              {/* Repayment type (mortgage) */}
              {visibleFields.includes('repayment_type') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aflossingsvorm</label>
                  <select
                    value={draft.repayment_type}
                    onChange={(e) => updateDraft({ repayment_type: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  >
                    <option value="">— Kies —</option>
                    {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tax deductible (mortgage) */}
              {visibleFields.includes('is_tax_deductible') && (
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.is_tax_deductible}
                    onChange={(e) => updateDraft({ is_tax_deductible: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--border-ed)] text-wil-600 focus:ring-wil-500"
                  />
                  <span className="text-sm text-[var(--ink-2)]">Hypotheekrenteaftrek</span>
                </label>
              )}

              {/* NHG (mortgage) */}
              {visibleFields.includes('nhg') && (
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.nhg}
                    onChange={(e) => updateDraft({ nhg: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--border-ed)] text-wil-600 focus:ring-wil-500"
                  />
                  <span className="text-sm text-[var(--ink-2)]">Nationale Hypotheek Garantie (NHG)</span>
                </label>
              )}

              {/* Fixed rate end date (mortgage) */}
              {visibleFields.includes('fixed_rate_end_date') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum rentevaste periode</label>
                  <input
                    type="date"
                    value={draft.fixed_rate_end_date}
                    onChange={(e) => updateDraft({ fixed_rate_end_date: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Credit limit (credit_card, revolving_credit) */}
              {visibleFields.includes('credit_limit') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietlimiet</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={100}
                      min={0}
                      value={draft.credit_limit}
                      onChange={(e) => updateDraft({ credit_limit: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}

              {/* Draagkrachtmeting date (student_loan) */}
              {visibleFields.includes('draagkrachtmeting_date') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum draagkrachtmeting</label>
                  <input
                    type="date"
                    value={draft.draagkrachtmeting_date}
                    onChange={(e) => updateDraft({ draagkrachtmeting_date: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditingIndex(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)]"
              >
                Annuleer
              </button>
              <button
                onClick={save}
                disabled={!draft.name || !draft.current_balance}
                className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:opacity-40"
              >
                {editingIndex === -1 ? 'Toevoegen' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
