'use client'

import { useState, useEffect } from 'react'
import { Save, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { RecurringCategoryOverride } from '@/lib/recurring-data'

// ── Types ────────────────────────────────────────────────────

export interface ClassifyItemData {
  id: string
  name: string
  monthlyAmount: number
  frequency: string
  category: string
  categoryOverride: string | null
  alreadyConfirmed: boolean
}

interface RecurringClassifySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ClassifyItemData | null
  onSaved: () => void
}

// ── Classification options ──────────────────────────────────

type ClassificationOption = {
  value: RecurringCategoryOverride
  label: string
  description: string
}

const CLASSIFICATION_OPTIONS: ClassificationOption[] = [
  {
    value: 'subscription',
    label: 'Abonnement',
    description: 'Streaming, lidmaatschap, software',
  },
  {
    value: 'vaste_kosten',
    label: 'Vaste kosten',
    description: 'Huur, energie, verzekering',
  },
  {
    value: 'excluded',
    label: 'Niet opnemen',
    description: 'Verberg uit overzicht',
  },
]

/**
 * Infer the initial classification from an item's category or override.
 * If the user already set an override, use that. Otherwise, infer from
 * the auto-detected category.
 */
function inferClassification(item: ClassifyItemData): RecurringCategoryOverride {
  if (item.categoryOverride === 'subscription' || item.categoryOverride === 'vaste_kosten' || item.categoryOverride === 'excluded') {
    return item.categoryOverride
  }
  return item.category === 'subscription' ? 'subscription' : 'vaste_kosten'
}

// ── Component ───────────────────────────────────────────────

export function RecurringClassifySheet({
  open,
  onOpenChange,
  item,
  onSaved,
}: RecurringClassifySheetProps) {
  const [name, setName] = useState('')
  const [classification, setClassification] = useState<RecurringCategoryOverride>('vaste_kosten')
  const [saving, setSaving] = useState(false)

  // Reset form state when item changes
  useEffect(() => {
    if (item) {
      setName(item.name)
      setClassification(inferClassification(item))
    }
  }, [item])

  function handleClose() {
    onOpenChange(false)
  }

  async function handleSave() {
    if (!item || !name.trim()) return
    setSaving(true)

    try {
      const supabase = createClient()

      if (item.alreadyConfirmed) {
        // Item already exists in recurring_transactions — update it
        await supabase
          .from('recurring_transactions')
          .update({
            name: name.trim(),
            category_override: classification,
          })
          .eq('id', item.id)
      } else {
        // Auto-detected item that hasn't been confirmed yet — insert it
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Get the user's first bank account as default account_id
        const { data: accounts } = await supabase
          .from('bank_accounts')
          .select('id')
          .limit(1)

        const accountId = accounts?.[0]?.id
        if (!accountId) return

        await supabase
          .from('recurring_transactions')
          .insert({
            user_id: user.id,
            account_id: accountId,
            name: name.trim(),
            amount: -Math.abs(item.monthlyAmount),
            counterparty_name: item.name,
            frequency: item.frequency,
            start_date: new Date().toISOString().split('T')[0],
            is_active: true,
            category_override: classification,
          })
      }

      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <BottomSheet open={open} onClose={handleClose} title="Item classificeren" size="sm">
      <div className="p-5">
        <div className="space-y-5">

          {/* ── Name field ──────────────────────────────────── */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Naam
            </label>
            <input
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-wil-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Naam van dit item"
            />
          </div>

          {/* ── Classification selector ────────────────────── */}
          <div>
            <label className="mb-2 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Classificatie
            </label>
            <div className="grid grid-cols-1 gap-2">
              {CLASSIFICATION_OPTIONS.map((opt) => {
                const isActive = classification === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setClassification(opt.value)}
                    className={`
                      flex w-full flex-col items-start rounded-[var(--r)] border px-4 py-3 text-left transition-colors
                      ${isActive
                        ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]'
                      }
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wil-500 focus-visible:ring-offset-1
                    `}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className={`text-xs ${isActive ? 'text-white/70' : 'text-[var(--ink-3)]'}`}>
                      {opt.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Warning for "Niet opnemen" ─────────────────── */}
          {classification === 'excluded' && (
            <div className="flex items-start gap-2 rounded-[var(--r)] border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Dit item wordt niet meer getoond in je overzicht
              </p>
            </div>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────── */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 rounded-[var(--r)] bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
