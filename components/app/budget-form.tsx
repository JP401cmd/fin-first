'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, AlertTriangle, RefreshCw, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Budget } from '@/lib/budget-data'
import { iconMap, iconOptions } from '@/components/app/budget-shared'
import { OwnershipToggle, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { GoalForm } from '@/components/app/goal-form'

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
  ownership: OwnershipType
  goal_type: string
  goal_amount: string
  goal_date: string
  goal_frequency: string
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
  const [categoryName, setCategoryName] = useState('')
  const [linkedGoalId, setLinkedGoalId] = useState<string>('')
  const [availableSavingsGoals, setAvailableSavingsGoals] = useState<
    { id: string; name: string; target_value: number; target_date: string | null }[]
  >([])
  const [showCreateGoal, setShowCreateGoal] = useState(false)
  const { hasHousehold, householdId } = useHouseholdStatus()

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
    ownership: budget?.ownership ?? 'personal',
    goal_type: budget?.goal_type ?? '',
    goal_amount: budget?.goal_amount ? String(budget.goal_amount) : '',
    goal_date: budget?.goal_date ?? '',
    goal_frequency: budget?.goal_frequency ?? '',
  })

  const needsAutoParent = !budget && !form.parent_id

  // --- Draft / dirty-state management ---
  const draftKey = budget ? `budget-edit-draft-${budget.id}` : 'budget-new-draft'

  // Load draft from localStorage on mount
  const loadDraft = useCallback(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null
      if (raw) {
        const draft = JSON.parse(raw)
        if (budget ? draft.budgetId === budget.id : draft.isNew) {
          return draft
        }
      }
    } catch { /* ignore parse errors */ }
    return null
  }, [draftKey, budget])

  // Recover draft on mount
  const [draftRecovered, setDraftRecovered] = useState(false)
  useEffect(() => {
    const draft = loadDraft()
    if (draft?.formData) {
      setForm(draft.formData)
      if (draft.categoryName !== undefined) setCategoryName(draft.categoryName)
      setDraftRecovered(true)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [showDraftNotice, setShowDraftNotice] = useState(false)
  // Show draft notice after mount if draft was recovered
  useEffect(() => {
    if (draftRecovered) setShowDraftNotice(true)
  }, [draftRecovered])

  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null)

  // Build initial form values for comparison
  const initialForm = useMemo<FormData>(() => ({
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
    ownership: budget?.ownership ?? 'personal',
    goal_type: budget?.goal_type ?? '',
    goal_amount: budget?.goal_amount ? String(budget.goal_amount) : '',
    goal_date: budget?.goal_date ?? '',
    goal_frequency: budget?.goal_frequency ?? '',
  }), [budget])

  const isDirty = useMemo(() => {
    return (
      form.name !== initialForm.name ||
      form.icon !== initialForm.icon ||
      form.description !== initialForm.description ||
      form.default_limit !== initialForm.default_limit ||
      form.budget_type !== initialForm.budget_type ||
      form.interval !== initialForm.interval ||
      form.rollover_type !== initialForm.rollover_type ||
      form.limit_type !== initialForm.limit_type ||
      form.alert_threshold !== initialForm.alert_threshold ||
      form.max_single_transaction_amount !== initialForm.max_single_transaction_amount ||
      form.is_essential !== initialForm.is_essential ||
      form.priority_score !== initialForm.priority_score ||
      form.is_inflation_indexed !== initialForm.is_inflation_indexed ||
      form.parent_id !== initialForm.parent_id ||
      form.ownership !== initialForm.ownership ||
      form.goal_type !== initialForm.goal_type ||
      form.goal_amount !== initialForm.goal_amount ||
      form.goal_date !== initialForm.goal_date ||
      form.goal_frequency !== initialForm.goal_frequency ||
      (needsAutoParent && categoryName.trim() !== '')
    )
  }, [form, initialForm, needsAutoParent, categoryName])

  // Auto-save draft to localStorage when dirty
  useEffect(() => {
    if (isDirty) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          budgetId: budget?.id ?? null,
          isNew: !budget,
          formData: form,
          categoryName,
          savedAt: new Date().toISOString(),
        }))
      } catch { /* ignore storage errors */ }
    } else {
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    }
  }, [isDirty, draftKey, budget, form, categoryName])

  // beforeunload warning
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Je hebt onopgeslagen wijzigingen. Weet je zeker dat je wilt vernieuwen?'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // Load available savings goals + existing linked goal on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('goals')
      .select('id, name, target_value, target_date')
      .eq('goal_type', 'savings')
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setAvailableSavingsGoals(data) })
    if (budget?.id) {
      supabase
        .from('goals')
        .select('id')
        .eq('budget_id', budget.id)
        .maybeSingle()
        .then(({ data }) => { if (data) setLinkedGoalId(data.id) })
    }
  }, [budget?.id])

  // Navigation interception for internal links
  function handleNavClick(e: React.MouseEvent, href: string) {
    if (isDirty) {
      e.preventDefault()
      setPendingNavHref(href)
      setShowNavWarning(true)
    }
  }

  function confirmNavigation() {
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    setShowNavWarning(false)
    if (pendingNavHref) {
      router.push(pendingNavHref)
    }
  }

  function cancelNavigation() {
    setShowNavWarning(false)
    setPendingNavHref(null)
  }

  function discardDraft() {
    setForm(initialForm)
    setCategoryName('')
    setShowDraftNotice(false)
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
  }

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Naam is verplicht')
      return
    }
    if (needsAutoParent && !categoryName.trim()) {
      setError('Categorie-naam is verplicht')
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

    const ownershipFields = {
      ownership: form.ownership,
      household_id: form.ownership === 'shared' ? householdId : null,
    }

    let savedBudgetId: string | null = budget?.id ?? null

    if (budget) {
      // Edit existing budget
      const row = {
        user_id: user.id,
        name: form.name.trim(),
        icon: form.icon,
        description: form.description.trim() || null,
        default_limit: parseFloat(form.default_limit) || 0,
        budget_type: form.budget_type,
        interval: form.interval,
        rollover_type: form.goal_type === 'maandelijkse_reservering' ? 'carry-over' : form.rollover_type,
        limit_type: form.limit_type,
        alert_threshold: form.alert_threshold,
        max_single_transaction_amount: parseFloat(form.max_single_transaction_amount) || 0,
        is_essential: form.is_essential,
        priority_score: form.priority_score,
        is_inflation_indexed: form.is_inflation_indexed,
        parent_id: form.parent_id || null,
        goal_type: form.goal_type || null,
        goal_amount: parseFloat(form.goal_amount) || null,
        goal_date: form.goal_date || null,
        goal_frequency: form.goal_frequency || null,
        ...ownershipFields,
      }

      const { error: updateError } = await supabase
        .from('budgets')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', budget.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else if (needsAutoParent) {
      // Create parent + child automatically
      const { data: parentData, error: parentError } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          name: categoryName.trim(),
          icon: form.icon,
          description: form.description.trim() || null,
          default_limit: 0,
          budget_type: form.budget_type,
          interval: form.interval,
          rollover_type: form.rollover_type,
          limit_type: form.limit_type,
          alert_threshold: form.alert_threshold,
          max_single_transaction_amount: 0,
          is_essential: form.is_essential,
          priority_score: form.priority_score,
          is_inflation_indexed: form.is_inflation_indexed,
          parent_id: null,
          ...ownershipFields,
        })
        .select('id')
        .single()

      if (parentError || !parentData) {
        setError(parentError?.message ?? 'Fout bij aanmaken categorie')
        setSaving(false)
        return
      }

      const { error: childError } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          icon: form.icon,
          description: null,
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
          parent_id: parentData.id,
          sort_order: 0,
          ...ownershipFields,
        })

      if (childError) {
        setError(childError.message)
        setSaving(false)
        return
      }
    } else {
      // Create child under existing parent
      const row = {
        user_id: user.id,
        name: form.name.trim(),
        icon: form.icon,
        description: form.description.trim() || null,
        default_limit: parseFloat(form.default_limit) || 0,
        budget_type: form.budget_type,
        interval: form.interval,
        rollover_type: form.goal_type === 'maandelijkse_reservering' ? 'carry-over' : form.rollover_type,
        limit_type: form.limit_type,
        alert_threshold: form.alert_threshold,
        max_single_transaction_amount: parseFloat(form.max_single_transaction_amount) || 0,
        is_essential: form.is_essential,
        priority_score: form.priority_score,
        is_inflation_indexed: form.is_inflation_indexed,
        parent_id: form.parent_id || null,
        goal_type: form.goal_type || null,
        goal_amount: parseFloat(form.goal_amount) || null,
        goal_date: form.goal_date || null,
        goal_frequency: form.goal_frequency || null,
        ...ownershipFields,
      }

      const { data: insertedBudget, error: insertError } = await supabase
        .from('budgets')
        .insert(row)
        .select('id')
        .single()

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
      savedBudgetId = insertedBudget?.id ?? null
    }

    // Goal koppeling (alleen voor spaardoel budgets met parent)
    if (form.goal_type === 'spaardoel' && savedBudgetId) {
      // Ontkoppel eventuele vorige goals die naar dit budget wijzen
      const { data: oldLinked } = await supabase
        .from('goals')
        .select('id')
        .eq('budget_id', savedBudgetId)
      for (const old of oldLinked ?? []) {
        if (old.id !== linkedGoalId) {
          await supabase.from('goals').update({ budget_id: null }).eq('id', old.id)
        }
      }
      if (linkedGoalId) {
        await supabase.from('goals').update({ budget_id: savedBudgetId }).eq('id', linkedGoalId)
      }
    } else if (budget?.id && form.goal_type !== 'spaardoel') {
      // goal_type gewijzigd weg van spaardoel → ontkoppel
      await supabase.from('goals').update({ budget_id: null }).eq('budget_id', budget.id)
    }

    // Clear draft on successful save
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    router.push('/core/budgets')
  }

  const SelectedIcon = iconMap[form.icon] ?? iconMap['Circle']

  return (
    <>
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl px-6 py-8" data-testid="budget-form">
      {/* Back */}
      <div className="mb-6">
        <a
          href="/core/budgets"
          onClick={(e) => handleNavClick(e, '/core/budgets')}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar budgetten
        </a>
      </div>

      <h1 className="mb-8 text-2xl font-bold text-[var(--ink)]">
        {budget ? 'Budget bewerken' : 'Nieuw budget'}
      </h1>

      {/* Unsaved changes navigation warning */}
      {showNavWarning && (
        <div className="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4" data-testid="unsaved-changes-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-orange-800">Onopgeslagen wijzigingen</p>
              <p className="mt-1 text-sm text-orange-700">
                Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze verwijderen of verder bewerken?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmNavigation}
                  className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                  data-testid="confirm-nav-btn"
                >
                  Wijzigingen verwijderen
                </button>
                <button
                  type="button"
                  onClick={cancelNavigation}
                  className="rounded-md border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100"
                  data-testid="cancel-nav-btn"
                >
                  Verder bewerken
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft recovered notice */}
      {showDraftNotice && (
        <div className="mb-6 rounded-lg border border-blue-300 bg-blue-50 p-4" data-testid="draft-recovered-notice">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800">Concept hersteld</p>
              <p className="mt-1 text-sm text-blue-700">
                Er is een eerder bewaard concept gevonden. Je kunt doorgaan of het origineel laden.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDraftNotice(false)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  data-testid="accept-draft-btn"
                >
                  Doorgaan met concept
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  data-testid="discard-draft-btn"
                >
                  Origineel laden
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dirty indicator */}
      {isDirty && !showNavWarning && !showDraftNotice && (
        <div className="mb-4 flex items-center gap-1.5 rounded-md bg-kern-50 px-3 py-1.5 border border-kern-200" data-testid="dirty-indicator">
          <div className="h-2 w-2 rounded-full bg-kern-500 animate-pulse" />
          <span className="text-xs font-medium text-kern-700">Onopgeslagen wijzigingen</span>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* === Identiteit === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Identiteit
        </legend>
        <div className="space-y-4">
          {/* Categorie-naam (alleen bij nieuw standalone budget) */}
          {needsAutoParent && (
            <div>
              <label htmlFor="category_name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Categorie-naam
              </label>
              <input
                id="category_name"
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="bijv. Abonnementen"
                required
              />
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                De overkoepelende categorie (hoofdbudget)
              </p>
            </div>
          )}

          {/* Naam */}
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              {needsAutoParent ? 'Sub-budget naam' : 'Naam'}
            </label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              placeholder={needsAutoParent ? 'bijv. Streaming' : 'bijv. Boodschappen'}
              required
              data-testid="budget-name-input"
            />
            {needsAutoParent && (
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Het specifieke sub-budget binnen de categorie
              </p>
            )}
          </div>

          {/* Icoon */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
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
                        ? 'border-kern-500 bg-kern-50 text-kern-600'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
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
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Beschrijving
            </label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              rows={2}
              placeholder="Optionele beschrijving..."
            />
          </div>
        </div>
      </fieldset>

      {/* === Eigendom === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Eigendom
        </legend>
        <OwnershipToggle
          value={form.ownership}
          onChange={(v) => update('ownership', v)}
          hasHousehold={hasHousehold}
        />
      </fieldset>

      {/* === Financieel === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Financieel
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type */}
          <div>
            <label htmlFor="budget_type" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Type
            </label>
            <select
              id="budget_type"
              value={form.budget_type}
              onChange={(e) => update('budget_type', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              data-testid="budget-type-select"
            >
              <option value="expense">Uitgave</option>
              <option value="income">Inkomen</option>
              <option value="savings">Sparen</option>
              <option value="debt">Schuld</option>
              <option value="archive">Verborgen</option>
            </select>
          </div>

          {/* Limiet */}
          <div>
            <label htmlFor="default_limit" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Limiet (&euro;)
            </label>
            <input
              id="default_limit"
              type="number"
              min="0"
              step="0.01"
              value={form.default_limit}
              onChange={(e) => update('default_limit', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              placeholder="0"
              data-testid="budget-limit-input"
            />
          </div>

          {/* Interval */}
          <div>
            <label htmlFor="interval" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Interval
            </label>
            <select
              id="interval"
              value={form.interval}
              onChange={(e) => update('interval', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              data-testid="budget-interval-select"
            >
              <option value="monthly">Maandelijks</option>
              <option value="quarterly">Per kwartaal</option>
              <option value="yearly">Jaarlijks</option>
            </select>
          </div>

          {/* Overschot-beheer */}
          <div>
            <label htmlFor="rollover_type" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Overschot-beheer
            </label>
            <select
              id="rollover_type"
              value={form.rollover_type}
              onChange={(e) => update('rollover_type', e.target.value)}
              className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
              data-testid="budget-rollover-select"
            >
              <option value="reset">Reset</option>
              <option value="carry-over">Doorschuiven</option>
              <option value="invest-sweep">Beleggen-sweep</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* === Doeltype === (alleen voor subbudgetten) */}
      {form.parent_id && (
        <fieldset className="mb-8">
          <legend className="mb-1 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
            Doeltype <span className="font-normal normal-case tracking-normal">(optioneel)</span>
          </legend>
          <p className="mb-3 text-[11px] text-[var(--ink-3)]">
            Kies hoe dit budget werkt. Het doeltype bepaalt hoe overschotten en voortgang worden berekend.
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { value: '', label: 'Geen' },
              { value: 'vaste_maandlast', label: 'Vaste maandlast' },
              { value: 'bestedingslimiet', label: 'Bestedingslimiet' },
              { value: 'spaardoel', label: 'Spaardoel' },
              { value: 'maandelijkse_reservering', label: 'Reservering' },
              { value: 'periodieke_last', label: 'Periodieke last' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  update('goal_type', value)
                  if (value !== 'spaardoel') { update('goal_date', ''); if (value !== 'periodieke_last') update('goal_amount', '') }
                  if (value !== 'periodieke_last') update('goal_frequency', '')
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  form.goal_type === value
                    ? 'bg-kern-50 border-kern-200 text-kern-700'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {form.goal_type !== '' && (
            <div className="mt-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-kern-700">
                {form.goal_type === 'vaste_maandlast' && 'Een vaste terugkerende uitgave. Je ziet direct of je inkomsten dit dekken of tekortschiet.'}
                {form.goal_type === 'bestedingslimiet' && 'Maximaal te besteden bedrag. Je ontvangt een melding zodra je de ingestelde drempel nadert.'}
                {form.goal_type === 'spaardoel' && 'Spaart toe naar een doel. Vul een doelbedrag en einddatum in om de voortgang te volgen.'}
                {form.goal_type === 'maandelijkse_reservering' && 'Bouwt maandelijks saldo op voor een toekomstige uitgave. Overschot wordt automatisch doorgeschoven naar de volgende maand.'}
                {form.goal_type === 'periodieke_last' && 'Voor grote uitgaven die je periodiek verwacht, zoals een verzekering of vakantie. Je reserveert maandelijks een deel van het totaalbedrag.'}
              </p>
            </div>
          )}

          {/* Conditionele extra velden — Spaardoel */}
          {form.goal_type === 'spaardoel' && (
            <div className="mt-3">
              {availableSavingsGoals.length > 0 && (
                <select
                  value={linkedGoalId}
                  onChange={(e) => {
                    const gid = e.target.value
                    setLinkedGoalId(gid)
                    if (gid) {
                      const g = availableSavingsGoals.find(x => x.id === gid)
                      if (g) {
                        update('goal_amount', String(g.target_value))
                        update('goal_date', g.target_date ?? '')
                      }
                    } else {
                      update('goal_amount', '')
                      update('goal_date', '')
                    }
                  }}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                >
                  <option value="">— Geen koppeling —</option>
                  {availableSavingsGoals.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              {linkedGoalId && (
                <p className="mt-1 text-[11px] text-wil-600">
                  Doelbedrag en einddatum worden overgenomen uit het gekoppelde doel.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowCreateGoal(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-wil-600 hover:text-wil-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Maak nieuw doel aan in De Wil
              </button>
            </div>
          )}

          {/* Conditionele extra velden — Periodieke Last */}
          {form.goal_type === 'periodieke_last' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Totaalbedrag (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.goal_amount}
                  onChange={(e) => update('goal_amount', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  placeholder="bijv. 600"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Frequentie</label>
                <select
                  value={form.goal_frequency}
                  onChange={(e) => update('goal_frequency', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                >
                  <option value="">Kies frequentie</option>
                  <option value="jaarlijks">Jaarlijks</option>
                  <option value="halfjaarlijks">Halfjaarlijks</option>
                  <option value="kwartaal">Kwartaal</option>
                </select>
              </div>
            </div>
          )}

          {form.goal_type === 'maandelijkse_reservering' && (
            <p className="mt-2 text-xs text-[var(--ink-3)]">
              Rollover wordt automatisch ingesteld op &apos;Doorschuiven&apos;.
            </p>
          )}
        </fieldset>
      )}

      {/* === Controle === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Controle
        </legend>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Limiet-type */}
            <div>
              <label htmlFor="limit_type" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Limiet-type
              </label>
              <select
                id="limit_type"
                value={form.limit_type}
                onChange={(e) => update('limit_type', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                data-testid="budget-limit-type-select"
              >
                <option value="soft">Zacht (waarschuwing)</option>
                <option value="hard">Hard (blokkering)</option>
              </select>
            </div>

            {/* Max transactiebedrag */}
            <div>
              <label htmlFor="max_single" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Max transactiebedrag (&euro;)
              </label>
              <input
                id="max_single"
                type="number"
                min="0"
                step="0.01"
                value={form.max_single_transaction_amount}
                onChange={(e) => update('max_single_transaction_amount', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="0 = geen limiet"
                data-testid="budget-max-transaction-input"
              />
            </div>
          </div>

          {/* Notificatiedrempel */}
          <div>
            <label htmlFor="alert_threshold" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
              Notificatiedrempel: {form.alert_threshold}%
            </label>
            <input
              id="alert_threshold"
              type="range"
              min="0"
              max="100"
              value={form.alert_threshold}
              onChange={(e) => update('alert_threshold', parseInt(e.target.value))}
              className="w-full accent-kern-500"
              data-testid="budget-alert-threshold"
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--ink-3)]">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </fieldset>

      {/* === Behandeling === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Behandeling
        </legend>
        <div className="space-y-4">
          {/* Essentieel toggle */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--ink-2)]">Essentieel</p>
              <p className="text-xs text-[var(--ink-3)]">Deze uitgave is noodzakelijk voor het dagelijks leven</p>
            </div>
            <button
              type="button"
              onClick={() => update('is_essential', !form.is_essential)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.is_essential ? 'bg-kern-500' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${
                  form.is_essential ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Prioriteit */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
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
                      ? 'border-kern-500 bg-kern-50 text-kern-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)]'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--ink-3)]">
              1 = laagste prioriteit, 5 = hoogste prioriteit
            </p>
          </div>

          {/* Inflatie-indexatie toggle */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--ink-2)]">Inflatie-indexatie</p>
              <p className="text-xs text-[var(--ink-3)]">Limiet jaarlijks automatisch corrigeren voor inflatie</p>
            </div>
            <button
              type="button"
              onClick={() => update('is_inflation_indexed', !form.is_inflation_indexed)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.is_inflation_indexed ? 'bg-kern-500' : 'bg-zinc-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${
                  form.is_inflation_indexed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </fieldset>

      {/* === Hiërarchie === */}
      <fieldset className="mb-8">
        <legend className="mb-4 text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Hiërarchie
        </legend>
        <div>
          <label htmlFor="parent_id" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Bestaande categorie
          </label>
          <select
            id="parent_id"
            value={form.parent_id}
            onChange={(e) => update('parent_id', e.target.value)}
            className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            data-testid="budget-parent-select"
          >
            <option value="">Nieuwe categorie aanmaken</option>
            {parentBudgets
              .filter((b) => b.id !== budget?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          {!form.parent_id && !budget && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Er wordt automatisch een nieuwe categorie aangemaakt met een sub-budget
            </p>
          )}
        </div>
      </fieldset>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 border-t border-[var(--border-ed)] pt-6">
        <a
          href="/core/budgets"
          onClick={(e) => handleNavClick(e, '/core/budgets')}
          className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
        >
          Annuleren
        </a>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-5 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          data-testid="budget-submit-btn"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </form>

    {showCreateGoal && (
      <GoalForm
        assets={[]}
        debts={[]}
        lockedToSavings
        onClose={() => setShowCreateGoal(false)}
        onSaved={async (newGoalId) => {
          setShowCreateGoal(false)
          if (newGoalId) {
            const supabase = createClient()
            const { data } = await supabase
              .from('goals')
              .select('id, name, target_value, target_date')
              .eq('goal_type', 'savings')
              .eq('is_completed', false)
              .order('sort_order', { ascending: true })
            setAvailableSavingsGoals(data ?? [])
            setLinkedGoalId(newGoalId)
            const newGoal = data?.find(g => g.id === newGoalId)
            if (newGoal) {
              update('goal_amount', String(newGoal.target_value))
              update('goal_date', newGoal.target_date ?? '')
            }
          }
        }}
        initialValues={{
          target_value: form.goal_amount || undefined,
          target_date: form.goal_date || undefined,
        }}
      />
    )}
    </>
  )
}
