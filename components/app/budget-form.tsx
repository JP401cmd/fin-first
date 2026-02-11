'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Budget } from '@/lib/budget-data'
import { iconMap, iconOptions } from '@/components/app/budget-shared'

type FormData = {
  name: string
  icon: string
  description: string
  default_limit: string
  budget_type: string
  interval: string
  rollover_type: string
  limit_type: string
  alert_threshold: number
  max_single_transaction_amount: string
  is_essential: boolean
  priority_score: number
  is_inflation_indexed: boolean
  parent_id: string
}

export function BudgetForm({
  budget,
  parentBudgets,
}: {
  budget?: Budget
  parentBudgets: Budget[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<FormData>({
    name: budget?.name ?? '',
    icon: budget?.icon ?? 'Circle',
    description: budget?.description ?? '',
    default_limit: budget ? String(budget.default_limit) : '',
    budget_type: budget?.budget_type ?? 'expense',
    interval: budget?.interval ?? 'monthly',
    rollover_type: budget?.rollover_type ?? 'reset',
    limit_type: budget?.limit_type ?? 'soft',
    alert_threshold: budget?.alert_threshold ?? 80,
    max_single_transaction_amount: budget ? String(budget.max_single_transaction_amount) : '0',
    is_essential: budget?.is_essential ?? false,
    priority_score: budget?.priority_score ?? 3,
    is_inflation_indexed: budget?.is_inflation_indexed ?? false,
    parent_id: budget?.parent_id ?? '',
  })

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Naam is verplicht')
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
      icon: form.icon,
      description: form.description.trim() || null,
      default_limit: parseFloat(form.default_limit) || 0,
      budget_type: form.budget_type,
      interval: form.interval,
      rollover_type: form.rollover_type,
      limit_type: form.limit_type,
      alert_threshold: form.alert_threshold,
      max_single_transaction_amount: parseFloat(form.max_single_transaction_amount) || 0,
      is_essential: form.is_essential,
      priority_score: form.priority_score,
      is_inflation_indexed: form.is_inflation_indexed,
      parent_id: form.parent_id || null,
    }

    if (budget) {
      const { error: updateError } = await supabase
        .from('budgets')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', budget.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('budgets')
        .insert(row)

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
    }

    router.push('/core/budgets')
  }

  const SelectedIcon = iconMap[form.icon] ?? iconMap['Circle']

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-6 py-8">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/core/budgets"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar budgetten
        </Link>
      </div>

      <h1 className="mb-8 text-2xl font-bold text-zinc-900">
        {budget ? 'Budget bewerken' : 'Nieuw budget'}
      </h1>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* === Identiteit === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Identiteit
        </legend>
        <div className="space-y-4">
          {/* Naam */}
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Naam
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              placeholder="bijv. Boodschappen"
              required
            />
          </div>

          {/* Icoon */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Icoon
            </label>
            <div className="flex flex-wrap gap-1.5">
              {iconOptions.map((iconName) => {
                const Icon = iconMap[iconName]
                const isSelected = form.icon === iconName
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => update('icon', iconName)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50 text-amber-600'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                    }`}
                    title={iconName}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Beschrijving */}
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Beschrijving
            </label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              rows={2}
              placeholder="Optionele beschrijving..."
            />
          </div>
        </div>
      </fieldset>

      {/* === Financieel === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Financieel
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type */}
          <div>
            <label htmlFor="budget_type" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Type
            </label>
            <select
              id="budget_type"
              value={form.budget_type}
              onChange={(e) => update('budget_type', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="expense">Uitgave</option>
              <option value="income">Inkomen</option>
              <option value="savings">Sparen</option>
            </select>
          </div>

          {/* Limiet */}
          <div>
            <label htmlFor="default_limit" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Limiet (&euro;)
            </label>
            <input
              id="default_limit"
              type="number"
              min="0"
              step="0.01"
              value={form.default_limit}
              onChange={(e) => update('default_limit', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              placeholder="0"
            />
          </div>

          {/* Interval */}
          <div>
            <label htmlFor="interval" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Interval
            </label>
            <select
              id="interval"
              value={form.interval}
              onChange={(e) => update('interval', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="monthly">Maandelijks</option>
              <option value="quarterly">Per kwartaal</option>
              <option value="yearly">Jaarlijks</option>
            </select>
          </div>

          {/* Overschot-beheer */}
          <div>
            <label htmlFor="rollover_type" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Overschot-beheer
            </label>
            <select
              id="rollover_type"
              value={form.rollover_type}
              onChange={(e) => update('rollover_type', e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="reset">Reset</option>
              <option value="carry-over">Doorschuiven</option>
              <option value="invest-sweep">Beleggen-sweep</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* === Controle === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Controle
        </legend>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Limiet-type */}
            <div>
              <label htmlFor="limit_type" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Limiet-type
              </label>
              <select
                id="limit_type"
                value={form.limit_type}
                onChange={(e) => update('limit_type', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                <option value="soft">Zacht (waarschuwing)</option>
                <option value="hard">Hard (blokkering)</option>
              </select>
            </div>

            {/* Max transactiebedrag */}
            <div>
              <label htmlFor="max_single" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Max transactiebedrag (&euro;)
              </label>
              <input
                id="max_single"
                type="number"
                min="0"
                step="0.01"
                value={form.max_single_transaction_amount}
                onChange={(e) => update('max_single_transaction_amount', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="0 = geen limiet"
              />
            </div>
          </div>

          {/* Notificatiedrempel */}
          <div>
            <label htmlFor="alert_threshold" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Notificatiedrempel: {form.alert_threshold}%
            </label>
            <input
              id="alert_threshold"
              type="range"
              min="0"
              max="100"
              value={form.alert_threshold}
              onChange={(e) => update('alert_threshold', parseInt(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-400">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </fieldset>

      {/* === Behandeling === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Behandeling
        </legend>
        <div className="space-y-4">
          {/* Essentieel toggle */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-700">Essentieel</p>
              <p className="text-xs text-zinc-500">Deze uitgave is noodzakelijk voor het dagelijks leven</p>
            </div>
            <button
              type="button"
              onClick={() => update('is_essential', !form.is_essential)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.is_essential ? 'bg-amber-500' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  form.is_essential ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Prioriteit */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Prioriteit
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => update('priority_score', score)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                    form.priority_score === score
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">
              1 = laagste prioriteit, 5 = hoogste prioriteit
            </p>
          </div>

          {/* Inflatie-indexatie toggle */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-700">Inflatie-indexatie</p>
              <p className="text-xs text-zinc-500">Limiet jaarlijks automatisch corrigeren voor inflatie</p>
            </div>
            <button
              type="button"
              onClick={() => update('is_inflation_indexed', !form.is_inflation_indexed)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.is_inflation_indexed ? 'bg-amber-500' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  form.is_inflation_indexed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </fieldset>

      {/* === Hiërarchie === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Hiërarchie
        </legend>
        <div>
          <label htmlFor="parent_id" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Ouder-budget (optioneel)
          </label>
          <select
            id="parent_id"
            value={form.parent_id}
            onChange={(e) => update('parent_id', e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Geen (hoofdbudget)</option>
            {parentBudgets
              .filter((b) => b.id !== budget?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </div>
      </fieldset>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-6">
        <Link
          href="/core/budgets"
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Annuleren
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </form>
  )
}
