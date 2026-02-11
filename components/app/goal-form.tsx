'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  GOAL_TYPE_LABELS, GOAL_COLORS, type Goal, type GoalType,
} from '@/lib/goal-data'
import { BudgetIcon, iconOptions } from '@/components/app/budget-shared'

type Asset = { id: string; name: string; current_value: number }
type Debt = { id: string; name: string; current_balance: number }

export function GoalForm({
  goal,
  assets,
  debts,
  onClose,
  onSaved,
}: {
  goal?: Goal
  assets: Asset[]
  debts: Debt[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!goal
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: goal?.name ?? '',
    description: goal?.description ?? '',
    goal_type: (goal?.goal_type ?? 'savings') as GoalType,
    target_value: goal ? String(goal.target_value) : '',
    current_value: goal ? String(goal.current_value) : '0',
    target_date: goal?.target_date ?? '',
    linked_asset_id: goal?.linked_asset_id ?? '',
    linked_debt_id: goal?.linked_debt_id ?? '',
    icon: goal?.icon ?? 'Target',
    color: goal?.color ?? 'teal',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Auto-fill current value when linking an asset or debt
  function handleAssetLink(assetId: string) {
    update('linked_asset_id', assetId)
    update('linked_debt_id', '')
    if (assetId) {
      const asset = assets.find((a) => a.id === assetId)
      if (asset) update('current_value', String(asset.current_value))
    }
  }

  function handleDebtLink(debtId: string) {
    update('linked_debt_id', debtId)
    update('linked_asset_id', '')
    if (debtId) {
      const debt = debts.find((d) => d.id === debtId)
      if (debt) {
        // For debt payoff, current_value = how much has been paid off
        update('current_value', String(Math.max(0, Number(debt.current_balance))))
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Naam is verplicht')
      return
    }
    if (!form.target_value || parseFloat(form.target_value) <= 0) {
      setError('Doelwaarde is verplicht')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setSaving(false)
      return
    }

    const row = {
      user_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      goal_type: form.goal_type,
      target_value: parseFloat(form.target_value),
      current_value: parseFloat(form.current_value) || 0,
      target_date: form.target_date || null,
      linked_asset_id: form.linked_asset_id || null,
      linked_debt_id: form.linked_debt_id || null,
      icon: form.icon,
      color: form.color,
    }

    if (isEdit && goal) {
      const { error: updateError } = await supabase
        .from('goals')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', goal.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('goals')
        .insert(row)

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {isEdit ? 'Doel bewerken' : 'Nieuw doel'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="goal-name" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Naam
              </label>
              <input
                id="goal-name"
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                placeholder="bijv. Noodfonds opbouwen"
                required
              />
            </div>

            {/* Type */}
            <div>
              <label htmlFor="goal-type" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Type doel
              </label>
              <select
                id="goal-type"
                value={form.goal_type}
                onChange={(e) => update('goal_type', e.target.value as GoalType)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              >
                {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((type) => (
                  <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>

            {/* Target + Current */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="goal-target" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  {form.goal_type === 'freedom_days' ? 'Doeldagen' : 'Doelbedrag (€)'}
                </label>
                <input
                  id="goal-target"
                  type="number"
                  min="1"
                  step={form.goal_type === 'freedom_days' ? '1' : '0.01'}
                  value={form.target_value}
                  onChange={(e) => update('target_value', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label htmlFor="goal-current" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  {form.goal_type === 'freedom_days' ? 'Huidige dagen' : 'Huidige waarde (€)'}
                </label>
                <input
                  id="goal-current"
                  type="number"
                  min="0"
                  step={form.goal_type === 'freedom_days' ? '1' : '0.01'}
                  value={form.current_value}
                  onChange={(e) => update('current_value', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Deadline */}
            <div>
              <label htmlFor="goal-date" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Deadline (optioneel)
              </label>
              <input
                id="goal-date"
                type="date"
                value={form.target_date}
                onChange={(e) => update('target_date', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Link to asset (for savings/net_worth) */}
            {(form.goal_type === 'savings' || form.goal_type === 'net_worth') && assets.length > 0 && (
              <div>
                <label htmlFor="goal-asset" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Koppel aan asset (optioneel)
                </label>
                <select
                  id="goal-asset"
                  value={form.linked_asset_id}
                  onChange={(e) => handleAssetLink(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Niet gekoppeld</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — €{Number(a.current_value).toLocaleString('nl-NL')}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Link to debt (for debt_payoff) */}
            {form.goal_type === 'debt_payoff' && debts.length > 0 && (
              <div>
                <label htmlFor="goal-debt" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Koppel aan schuld
                </label>
                <select
                  id="goal-debt"
                  value={form.linked_debt_id}
                  onChange={(e) => handleDebtLink(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Selecteer schuld</option>
                  {debts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} — €{Number(d.current_balance).toLocaleString('nl-NL')}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Color + Icon */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Kleur</label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => update('color', c.value)}
                      className={`h-8 w-8 rounded-full ${c.class} ${
                        form.color === c.value ? 'ring-2 ring-offset-2 ring-zinc-400' : ''
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="goal-icon" className="mb-1.5 block text-sm font-medium text-zinc-700">Icoon</label>
                <select
                  id="goal-icon"
                  value={form.icon}
                  onChange={(e) => update('icon', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                >
                  {iconOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="goal-desc" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Beschrijving (optioneel)
              </label>
              <textarea
                id="goal-desc"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                rows={2}
                placeholder="Waarom is dit doel belangrijk?"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
