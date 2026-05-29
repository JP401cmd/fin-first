'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Wand2, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import {
  buildDashboardLayout,
  type FocusChoice,
  type ModulePreference,
  type GridSize,
  type DetailLevel,
  type AutoDashboardAnswers,
} from '@/lib/auto-dashboard-builder'
import { WIDGET_CATALOG, type WidgetPref } from '@/lib/widget-catalog'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'
import type { DashboardData } from './widget-renderer'

// ── Props ────────────────────────────────────────────────────

interface AutoDashboardWizardProps {
  open: boolean
  onClose: () => void
  onApply: (prefs: WidgetPref[]) => void
  features: FeatureAccessMap
  allBudgets: DashboardData['allBudgets']
}

// ── Option definitions ───────────────────────────────────────

const FOCUS_OPTIONS: { value: FocusChoice; label: string; description: string; dotColor: string }[] = [
  { value: 'budget_cashflow',    label: 'Budgetten & cashflow',   description: 'Grip op uitgaven & budgetten',     dotColor: 'bg-kern-400' },
  { value: 'assets_investments', label: 'Vermogen & beleggen',    description: 'Vermogensgroei & beleggingen',     dotColor: 'bg-kern-400' },
  { value: 'fire_freedom',      label: 'Financiële vrijheid',    description: 'Vrijheidsdatum en projectie',      dotColor: 'bg-horizon-400' },
  { value: 'goals_actions',     label: 'Doelen & acties',        description: 'Doelen & acties bijhouden',        dotColor: 'bg-wil-400' },
  { value: 'overview',          label: 'Totaaloverzicht',        description: 'Breed overzicht van alles',        dotColor: 'bg-[var(--ink-4)]' },
]

const MODULE_OPTIONS: { value: ModulePreference; label: string; description: string; dotColor: string }[] = [
  { value: 'kern',     label: 'Overzicht',       description: 'Focus op financiële basis',     dotColor: 'bg-kern-400' },
  { value: 'wil',      label: 'Tips & acties',   description: 'Focus op acties & impact',      dotColor: 'bg-wil-400' },
  { value: 'horizon',  label: 'Toekomst',    description: 'Focus op toekomst & projecties', dotColor: 'bg-horizon-400' },
  { value: 'balanced', label: 'Evenwichtig',   description: 'Gelijke verdeling',             dotColor: 'bg-[var(--ink-4)]' },
]

const GRID_SIZE_OPTIONS: { value: GridSize; label: string; description: string; meta: string }[] = [
  { value: 'small',  label: 'Weinig',  description: 'Overzichtelijk, alleen de kern',    meta: '4×3 grid' },
  { value: 'medium', label: 'Middel',  description: 'Goede balans tussen overzicht en detail', meta: '4×4 grid' },
  { value: 'large',  label: 'Veel',    description: 'Maximaal inzicht in één oogopslag', meta: '4×5 grid' },
]

const DETAIL_OPTIONS: { value: DetailLevel; label: string; description: string }[] = [
  { value: 'compact',  label: 'Compact',      description: 'Meer widgets, kleiner formaat' },
  { value: 'balanced', label: 'Gebalanceerd', description: 'Mix van groot en klein' },
  { value: 'detailed', label: 'Uitgebreid',   description: 'Minder widgets, groter formaat' },
]

const BUDGET_TYPE_LABELS: Record<string, string> = {
  expense: 'Uitgaven',
  income: 'Inkomsten',
  savings: 'Sparen',
  debt: 'Schulden',
}

// ── Component ────────────────────────────────────────────────

export function AutoDashboardWizard({ open, onClose, onApply, features, allBudgets }: AutoDashboardWizardProps) {
  // Wizard state
  const [step, setStep] = useState(0)
  const [focuses, setFocuses] = useState<FocusChoice[]>([])
  const [modulePreference, setModulePreference] = useState<ModulePreference>('balanced')
  const [gridSize, setGridSize] = useState<GridSize>('medium')
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('balanced')
  const [selectedBudgetFavIds, setSelectedBudgetFavIds] = useState<string[]>([])

  // Budget step is shown when budget_cashflow is a selected focus and there are budgets
  const showBudgetStep = focuses.includes('budget_cashflow') && allBudgets.length > 0
  const totalSteps = showBudgetStep ? 5 : 4

  // Reset on open, pre-select existing favorites
  useEffect(() => {
    if (open) {
      setStep(0)
      setFocuses([])
      setModulePreference('balanced')
      setGridSize('medium')
      setDetailLevel('balanced')
      setSelectedBudgetFavIds(allBudgets.filter(b => b.isFavorite).map(b => b.id))
    }
  }, [open, allBudgets])

  const canProceed = step === 0 ? focuses.length > 0 : true

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) setStep(s => s + 1)
  }, [step, totalSteps])

  const handlePrev = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  const toggleFocus = useCallback((value: FocusChoice) => {
    setFocuses(prev => {
      if (prev.includes(value)) return prev.filter(f => f !== value)
      if (prev.length >= 2) return [prev[1], value] // Replace oldest
      return [...prev, value]
    })
  }, [])

  const toggleBudgetFav = useCallback((id: string) => {
    setSelectedBudgetFavIds(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }, [])

  const handleApply = useCallback(async () => {
    // Sync favorites to DB: selected IDs if budget step was shown, otherwise clear all
    await fetch('/api/budgets/favorites', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteIds: showBudgetStep ? selectedBudgetFavIds : [] }),
    })

    const effectiveFavIds = showBudgetStep ? selectedBudgetFavIds : []
    const answers: AutoDashboardAnswers = {
      focuses,
      modulePreference,
      gridSize,
      detailLevel,
      selectedBudgetFavIds: effectiveFavIds,
    }
    const favBudgets = allBudgets
      .filter(b => effectiveFavIds.includes(b.id))
      .map(b => ({ id: b.id, name: b.name }))
    const prefs = buildDashboardLayout(answers, WIDGET_CATALOG, features, favBudgets)
    onApply(prefs)
    onClose()
  }, [focuses, modulePreference, gridSize, detailLevel, selectedBudgetFavIds, showBudgetStep, features, allBudgets, onApply, onClose])

  const isLastStep = step === totalSteps - 1

  return (
    <BottomSheet open={open} onClose={onClose} title="Automatisch samenstellen" size="lg">
      <div className="px-5 pb-5 pt-3">
        {/* Step indicator */}
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === step
                  ? 'w-6 bg-[var(--ink)]'
                  : i < step
                    ? 'w-1.5 bg-[var(--ink-3)]'
                    : 'w-1.5 bg-[var(--border-md)]'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[280px]">
          {step === 0 && (
            <StepFocus selected={focuses} onToggle={toggleFocus} />
          )}
          {step === 1 && (
            <StepModule selected={modulePreference} onSelect={setModulePreference} />
          )}
          {step === 2 && (
            <StepGridSize selected={gridSize} onSelect={setGridSize} />
          )}
          {step === 3 && (
            <StepDetail selected={detailLevel} onSelect={setDetailLevel} />
          )}
          {step === 4 && showBudgetStep && (
            <StepBudgetPicker
              allBudgets={allBudgets}
              selected={selectedBudgetFavIds}
              onToggle={toggleBudgetFav}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrev}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] px-3 py-2 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Vorige
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={handleApply}
              disabled={!canProceed}
              className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--ink)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Dashboard samenstellen
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--ink)] px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Volgende
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Step components ──────────────────────────────────────────

function StepFocus({ selected, onToggle }: { selected: FocusChoice[]; onToggle: (v: FocusChoice) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--ink)]">Waar wil je je op richten?</h4>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Kies 1–2 focusgebieden. Dit bepaalt welke widgets prominent op je dashboard komen.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {FOCUS_OPTIONS.map(opt => {
          const isSelected = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`group flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--subtle)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--border-md)]'
              }`}>
                {isSelected && <Check className="h-3 w-3 text-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${opt.dotColor}`} />
                  <span className="text-sm font-medium text-[var(--ink)]">{opt.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepModule({ selected, onSelect }: { selected: ModulePreference; onSelect: (v: ModulePreference) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--ink)]">Module voorkeur</h4>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Geeft een module extra gewicht in je dashboard.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {MODULE_OPTIONS.map(opt => {
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`group flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--subtle)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--border-md)]'
              }`}>
                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${opt.dotColor}`} />
                  <span className="text-sm font-medium text-[var(--ink)]">{opt.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepGridSize({ selected, onSelect }: { selected: GridSize; onSelect: (v: GridSize) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--ink)]">Hoeveel widgets?</h4>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Bepaalt de grootte van je dashboard.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {GRID_SIZE_OPTIONS.map(opt => {
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`group flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--subtle)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--border-md)]'
              }`}>
                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)]">{opt.label}</span>
                  <span className="text-[10px] font-mono text-[var(--ink-4)]">{opt.meta}</span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepDetail({ selected, onSelect }: { selected: DetailLevel; onSelect: (v: DetailLevel) => void }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--ink)]">Detail niveau</h4>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Compact toont meer widgets kleiner, uitgebreid toont minder widgets groter.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {DETAIL_OPTIONS.map(opt => {
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`group flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3 text-left transition-all ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--subtle)] shadow-sm'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
              }`}
            >
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? 'border-[var(--ink)] bg-[var(--ink)]' : 'border-[var(--border-md)]'
              }`}>
                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--ink)]">{opt.label}</span>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepBudgetPicker({
  allBudgets,
  selected,
  onToggle,
}: {
  allBudgets: DashboardData['allBudgets']
  selected: string[]
  onToggle: (id: string) => void
}) {
  // Group: parents per type, children nested under parent
  const { parents, childrenByParent } = useMemo(() => {
    const parents = allBudgets.filter(b => b.parentId === null)
    const childrenByParent: Record<string, typeof allBudgets> = {}
    for (const b of allBudgets) {
      if (b.parentId) {
        if (!childrenByParent[b.parentId]) childrenByParent[b.parentId] = []
        childrenByParent[b.parentId].push(b)
      }
    }
    return { parents, childrenByParent }
  }, [allBudgets])

  // Group parents by type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof parents> = {}
    for (const b of parents) {
      if (!groups[b.budgetType]) groups[b.budgetType] = []
      groups[b.budgetType].push(b)
    }
    return groups
  }, [parents])

  const typeOrder = ['expense', 'income', 'savings', 'debt']

  return (
    <div>
      <h4 className="text-sm font-semibold text-[var(--ink)]">Budgetten op je dashboard</h4>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Zet budgetten aan die je op je dashboard wilt zien. Deze worden ook als favoriet opgeslagen.
      </p>
      <div className="mt-4 flex flex-col gap-4 max-h-[320px] overflow-y-auto pr-1">
        {typeOrder.map(type => {
          const budgets = grouped[type]
          if (!budgets || budgets.length === 0) return null
          return (
            <div key={type}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">
                {BUDGET_TYPE_LABELS[type] ?? type}
              </p>
              <div className="flex flex-col gap-0.5">
                {budgets.map(b => {
                  const isOn = selected.includes(b.id)
                  const children = childrenByParent[b.id]
                  return (
                    <div key={b.id}>
                      <BudgetToggleRow budget={b} isOn={isOn} onToggle={onToggle} indent={false} />
                      {children?.map(child => {
                        const childOn = selected.includes(child.id)
                        return (
                          <BudgetToggleRow key={child.id} budget={child} isOn={childOn} onToggle={onToggle} indent />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BudgetToggleRow({
  budget,
  isOn,
  onToggle,
  indent,
}: {
  budget: { id: string; name: string; icon: string }
  isOn: boolean
  onToggle: (id: string) => void
  indent: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(budget.id)}
      className={`flex w-full items-center gap-3 rounded-[var(--r-sm)] px-3 py-2 text-left transition-colors hover:bg-[var(--subtle)]/50 ${indent ? 'pl-8' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {budget.icon && <span className={indent ? 'text-xs' : 'text-sm'}>{budget.icon}</span>}
        <span className={`${indent ? 'text-xs text-[var(--ink-2)]' : 'text-sm text-[var(--ink)]'}`}>{budget.name}</span>
      </div>
      <div
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          isOn ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            isOn ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  )
}
