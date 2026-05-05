'use client'

/**
 * Fase 1.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane) + §5.2 (sheet)
 * DebtDetailModal → pane; DebtForm + ValuationModal → sheet (via ShellOverlay).
 *
 * ValuationModal is een light single-veld + notitie-flow — past in §5.2 als
 * sheet. ShellOverlay kind="sheet" rendert intern een BottomSheet, dus
 * zelfde visuele behaviour als voorheen — alle overlay-mechanica gaat nu
 * door één centrale wrapper.
 *
 * Werkt onafhankelijk van de feature-flag — bij flag UIT zien gebruikers
 * dezelfde behaviour, alleen via één centrale wrapper.
 */

import { useState } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { createClient } from '@/lib/supabase/client'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'

import { MaskedAmount } from '@/components/app/masked-amount'

export function ValuationModal({
  entityId,
  entityType,
  entityName,
  entitySubtype,
  netWorthInclusionPct,
  currentValue,
  onClose,
  onSaved,
}: {
  entityId: string
  entityType: 'asset' | 'debt'
  entityName: string
  entitySubtype: string
  netWorthInclusionPct?: number | null
  currentValue: number
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [value, setValue] = useState(String(currentValue))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!value) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: valError } = await supabase.from('valuations').upsert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      valuation_date: date,
      value: Number(value),
      notes: notes || null,
    }, { onConflict: 'entity_id,valuation_date' })

    if (valError) {
      console.error('Valuation error:', valError)
      setSaving(false)
      return
    }

    const table = entityType === 'asset' ? 'assets' : 'debts'
    const column = entityType === 'asset' ? 'current_value' : 'current_balance'
    const newValue = Number(value)
    const updatePayload: Record<string, unknown> = { [column]: newValue }

    // When a debt balance reaches 0, mark it as paid off (is_active = false)
    if (entityType === 'debt' && newValue <= 0) {
      updatePayload.is_active = false
    }

    await supabase.from(table).update(updatePayload).eq('id', entityId)

    // Mirror naar balance_snapshots zodat de categorie-sparkline meebeweegt.
    await upsertSingleBalanceSnapshot(supabase, user.id, date, {
      type: entityType,
      id: entityId,
      name: entityName,
      subtype: entitySubtype,
      balance: newValue,
      netWorthInclusionPct,
    })

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <ShellOverlay open={true} onClose={onClose} kind="sheet" size="md" title={label}>
      <div className="p-6">
        <p className="mb-4 text-sm text-[var(--ink-3)]">{entityName}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidige waarde: {<MaskedAmount value={currentValue} tone="kern" />}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </ShellOverlay>
  )
}
