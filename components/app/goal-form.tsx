'use client'

import { useState, useEffect } from 'react'
import { X, Save, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  GOAL_TYPE_LABELS, GOAL_COLORS, GOAL_TYPE_META, GOAL_TYPE_ICONS,
  goalValueLabels, type Goal, type GoalType,
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
  lockedToSavings,
  initialValues,
}: {
  goal?: Goal
  assets: Asset[]
  debts: Debt[]
  onClose: () => void
  onSaved: (newGoalId?: string) => void
  lockedToSavings?: boolean
  initialValues?: { target_value?: string; target_date?: string; name?: string }
}) {
  const isEdit = !!goal
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasHousehold, setHasHousehold] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(goal?.ownership === 'shared')

  // Check if user has a household
  useEffect(() => {
    async function checkHousehold() {
      try {
        const res = await fetch('/api/household/status')
        if (res.ok) {
          const data = await res.json()
          if (data.has_household && data.household?.id) {
            setHasHousehold(true)
            setHouseholdId(data.household.id)
          }
        }
      } catch {
        // No household — keep defaults
      }
    }
    checkHousehold()
  }, [])

  const [form, setForm] = useState({
    name: goal?.name ?? initialValues?.name ?? '',
    description: goal?.description ?? '',
    goal_type: (goal?.goal_type ?? 'savings') as GoalType,
    target_value: goal ? String(goal.target_value) : (initialValues?.target_value ?? ''),
    current_value: goal ? String(goal.current_value) : '0',
    target_date: goal?.target_date ?? initialValues?.target_date ?? '',
    linked_asset_id: goal?.linked_asset_id ?? '',
    linked_debt_id: goal?.linked_debt_id ?? '',
    icon: goal?.icon ?? 'Target',
    color: goal?.color ?? 'teal',
    custom_unit: goal?.custom_unit ?? '',
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

    const row: Record<string, unknown> = {
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
      custom_unit: form.goal_type === 'custom' ? (form.custom_unit.trim() || null) : null,
      ownership: isShared ? 'shared' : 'personal',
      household_id: isShared ? householdId : null,
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
      onSaved()
    } else {
      const { data, error: insertError } = await supabase
        .from('goals')
        .insert(row)
        .select('id')
        .single()

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
      onSaved(data?.id)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-y-auto rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {isEdit ? 'Doel bewerken' : 'Nieuw doel'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
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
              <label htmlFor="goal-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Naam
              </label>
              <input
                id="goal-name"
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                placeholder="bijv. Noodfonds opbouwen"
                required
              />
            </div>

            {/* Shared goal toggle */}
            {hasHousehold && (
              <div>
                <button
                  type="button"
                  onClick={() => setIsShared(!isShared)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    isShared
                      ? 'border-wil-300 bg-wil-50'
                      : 'border-[var(--border-md)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isShared ? 'bg-wil-100' : 'bg-zinc-100'
                  }`}>
                    <Users className={`h-4 w-4 ${isShared ? 'text-wil-600' : 'text-[var(--ink-3)]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${isShared ? 'text-wil-700' : 'text-[var(--ink)]'}`}>
                      Gedeeld doel
                    </p>
                    <p className="text-xs text-[var(--ink-3)]">
                      {isShared
                        ? 'Beide partners zien dit doel en kunnen bijdragen'
                        : 'Maak dit een gezamenlijk doel met je partner'}
                    </p>
                  </div>
                  <div className={`h-5 w-9 rounded-full transition-colors ${isShared ? 'bg-wil-500' : 'bg-zinc-300'}`}>
                    <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${isShared ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            )}

            {/* Type */}
            {!lockedToSavings && (
              <div>
                <label htmlFor="goal-type" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Type doel
                </label>
                <select
                  id="goal-type"
                  value={form.goal_type}
                  onChange={(e) => {
                    const newType = e.target.value as GoalType
                    update('goal_type', newType)
                    update('icon', GOAL_TYPE_ICONS[newType])
                  }}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                >
                  <optgroup label="Financieel">
                    {(Object.keys(GOAL_TYPE_META) as GoalType[])
                      .filter((t) => GOAL_TYPE_META[t].group === 'Financieel')
                      .map((type) => (
                        <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                      ))}
                  </optgroup>
                  <optgroup label="Persoonlijk">
                    {(Object.keys(GOAL_TYPE_META) as GoalType[])
                      .filter((t) => GOAL_TYPE_META[t].group === 'Persoonlijk')
                      .map((type) => (
                        <option key={type} value={type}>{GOAL_TYPE_LABELS[type]}</option>
                      ))}
                  </optgroup>
                </select>
              </div>
            )}

            {/* Custom unit field */}
            {form.goal_type === 'custom' && (
              <div>
                <label htmlFor="goal-custom-unit" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Eenheid
                </label>
                <input
                  id="goal-custom-unit"
                  type="text"
                  value={form.custom_unit}
                  onChange={(e) => update('custom_unit', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  placeholder="bijv. boeken, km, uren"
                />
              </div>
            )}

            {/* Target + Current */}
            {(() => {
              const labels = goalValueLabels(form.goal_type)
              const meta = GOAL_TYPE_META[form.goal_type]
              return (
                <div className={`grid gap-4 ${lockedToSavings ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <label htmlFor="goal-target" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                      {labels.target}
                    </label>
                    <input
                      id="goal-target"
                      type="number"
                      min={meta.min ?? 1}
                      max={meta.max}
                      step={meta.step}
                      value={form.target_value}
                      onChange={(e) => update('target_value', e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                      placeholder="0"
                      required
                    />
                  </div>
                  {!lockedToSavings && (
                    <div>
                      <label htmlFor="goal-current" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                        {labels.current}
                      </label>
                      <input
                        id="goal-current"
                        type="number"
                        min={meta.min ?? 0}
                        max={meta.max}
                        step={meta.step}
                        value={form.current_value}
                        onChange={(e) => update('current_value', e.target.value)}
                        className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Deadline */}
            <div>
              <label htmlFor="goal-date" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Deadline (optioneel)
              </label>
              <input
                id="goal-date"
                type="date"
                value={form.target_date}
                onChange={(e) => update('target_date', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
              />
            </div>

            {/* Link to asset (for types that support it) */}
            {!lockedToSavings && GOAL_TYPE_META[form.goal_type].supportsAssetLink && assets.length > 0 && (
              <div>
                <label htmlFor="goal-asset" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Koppel aan asset (optioneel)
                </label>
                <select
                  id="goal-asset"
                  value={form.linked_asset_id}
                  onChange={(e) => handleAssetLink(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                >
                  <option value="">Niet gekoppeld</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — €{Number(a.current_value).toLocaleString('nl-NL')}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Link to debt (for types that support it) */}
            {!lockedToSavings && GOAL_TYPE_META[form.goal_type].supportsDebtLink && debts.length > 0 && (
              <div>
                <label htmlFor="goal-debt" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Koppel aan schuld
                </label>
                <select
                  id="goal-debt"
                  value={form.linked_debt_id}
                  onChange={(e) => handleDebtLink(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
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
                <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Kleur</label>
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
                <label htmlFor="goal-icon" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Icoon</label>
                <select
                  id="goal-icon"
                  value={form.icon}
                  onChange={(e) => update('icon', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                >
                  {iconOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="goal-desc" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Beschrijving (optioneel)
              </label>
              <textarea
                id="goal-desc"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                rows={2}
                placeholder="Waarom is dit doel belangrijk?"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--border-ed)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-wil-600 px-4 py-2 text-sm font-medium text-white hover:bg-wil-700 disabled:opacity-50"
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
