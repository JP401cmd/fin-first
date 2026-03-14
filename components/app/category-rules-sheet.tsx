'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type Budget } from '@/lib/budget-data'
import { BottomSheet } from '@/components/app/bottom-sheet'

type CategoryRule = {
  id: string
  match_field: 'counterparty_name' | 'description'
  match_value: string
  budget_id: string
  auto_apply: boolean
  created_at: string
}

interface CategoryRulesSheetProps {
  budgets: Budget[]
  onClose: () => void
}

const MATCH_FIELD_LABELS: Record<string, string> = {
  counterparty_name: 'Tegenpartij',
  description: 'Omschrijving',
}

export function CategoryRulesSheet({ budgets, onClose }: CategoryRulesSheetProps) {
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    matchField: 'counterparty_name' as 'counterparty_name' | 'description',
    matchValue: '',
    budgetId: '',
    autoApply: true,
  })
  const [saving, setSaving] = useState(false)

  const expenseBudgets = budgets.filter((b) => b.budget_type !== 'archive')

  const loadRules = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('category_corrections')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRules(data as CategoryRule[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  async function handleAdd() {
    if (!form.matchValue.trim() || !form.budgetId) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('category_corrections').insert({
      user_id: user.id,
      match_field: form.matchField,
      match_value: form.matchValue.trim(),
      budget_id: form.budgetId,
      auto_apply: form.autoApply,
    })
    setForm((f) => ({ ...f, matchValue: '', budgetId: '' }))
    setSaving(false)
    loadRules()
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('category_corrections').delete().eq('id', id)
    loadRules()
  }

  const getBudgetName = (id: string) => budgets.find((b) => b.id === id)?.name ?? '—'

  return (
    <BottomSheet open={true} onClose={onClose} title="Categorisatieregels" size="lg">
      <div className="p-5">
        {/* Uitleg */}
        <div className="mb-4 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
          Regels koppelen tegenpartijen of omschrijvingen automatisch aan een budget.
          Nieuwe transacties die overeenkomen worden direct gecategoriseerd.
        </div>

        {/* Nieuwe regel */}
        <div className="mb-5 space-y-2.5 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 p-4">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Nieuwe regel
          </p>
          <div className="flex gap-2">
            <select
              className="w-36 shrink-0 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-2 py-2 text-xs text-[var(--ink)] focus:outline-none"
              value={form.matchField}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  matchField: e.target.value as 'counterparty_name' | 'description',
                }))
              }
            >
              <option value="counterparty_name">Tegenpartij</option>
              <option value="description">Omschrijving</option>
            </select>
            <input
              className="flex-1 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--ink)] placeholder-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-kern-400"
              placeholder="bv. Spotify, Netflix, Albert Heijn…"
              value={form.matchValue}
              onChange={(e) => setForm((f) => ({ ...f, matchValue: e.target.value }))}
            />
          </div>
          <select
            className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--ink)] focus:outline-none"
            value={form.budgetId}
            onChange={(e) => setForm((f) => ({ ...f, budgetId: e.target.value }))}
          >
            <option value="">— kies budget —</option>
            {expenseBudgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.autoApply}
              onChange={(e) => setForm((f) => ({ ...f, autoApply: e.target.checked }))}
              className="h-3.5 w-3.5 rounded accent-kern-600"
            />
            <span className="font-sans text-[11px] text-[var(--ink-2)]">
              Automatisch toepassen bij nieuwe transacties
            </span>
          </label>
          <button
            onClick={handleAdd}
            disabled={saving || !form.matchValue.trim() || !form.budgetId}
            className="flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Regel toevoegen
          </button>
        </div>

        {/* Bestaande regels */}
        <div>
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
            Bestaande regels ({rules.length})
          </p>
          {loading ? (
            <p className="py-4 text-center text-xs text-[var(--ink-4)]">Laden…</p>
          ) : rules.length === 0 ? (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] py-6 text-center">
              <Tag className="mx-auto mb-2 h-5 w-5 text-[var(--ink-4)]" />
              <p className="text-xs text-[var(--ink-4)]">Nog geen regels aangemaakt</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)]">
              {rules.map((rule, idx) => (
                <div
                  key={rule.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx < rules.length - 1 ? 'border-b border-[var(--border-ed)]' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--ink)]">
                      <span className="mr-1.5 text-[var(--ink-4)]">
                        {MATCH_FIELD_LABELS[rule.match_field]}:
                      </span>
                      {rule.match_value}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="rounded-full bg-kern-50 px-2 py-0.5 text-[9px] font-medium text-kern-700">
                        → {getBudgetName(rule.budget_id)}
                      </span>
                      {rule.auto_apply && (
                        <span className="text-[9px] text-[var(--ink-4)]">auto</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:bg-red-50 hover:text-red-500"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
