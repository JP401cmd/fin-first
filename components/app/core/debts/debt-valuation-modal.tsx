'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'

export function ValuationModal({
  entityId,
  entityType,
  entityName,
  currentValue,
  onClose,
  onSaved,
}: {
  entityId: string
  entityType: 'asset' | 'debt'
  entityName: string
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

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <BottomSheet open={true} onClose={onClose} title={label} size="md">
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
              Huidige waarde: {formatCurrency(currentValue)}
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
    </BottomSheet>
  )
}
