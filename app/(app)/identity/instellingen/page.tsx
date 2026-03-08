'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_TYPES } from '@/lib/identity-constants'
import { Lock, GripVertical, ChevronDown, ChevronRight, Shield, Eye, EyeOff, Server, FileText, Users, CalendarCheck, HandCoins, BellRing, SplitSquareVertical, Bell, UserPlus } from 'lucide-react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  WIDGET_CATALOG,
  DEFAULT_WIDGET_PREFS,
  mergeWidgetPrefs,
  type WidgetDef,
  type WidgetPref,
  type WidgetModule,
  type WidgetSize,
} from '@/lib/widget-catalog'
import { reassignOrders } from '@/lib/widget-order'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { NL_SWR, BOX3_DRAG } from '@/lib/horizon-data'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { useModuleColors, useBudgetColors, usePhaseColors, useFontTheme } from '@/components/app/module-color-provider'
import type { FontTheme } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, DEFAULT_BUDGET_COLORS, DEFAULT_PHASE_COLORS } from '@/lib/color-palette'
import type { ModuleColorConfig, ModuleName, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import { Palette, RotateCcw, Type } from 'lucide-react'
import { useDashboardType } from '@/components/app/dashboard-type-provider'
import { readBriefingContentPrefs, saveBriefingContentPrefs, type BriefingContentPrefs } from '@/lib/briefing/user-preferences'
import { type RetirementExpenseMethod } from '@/lib/budget-utils'
import { type FireEndStrategy, STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'

import { formatCurrency } from '@/lib/format'

// ── Widget section helpers ────────────────────────────────────────────────

const MODULE_GROUPS: { module: WidgetModule; label: string; accentClass: string }[] = [
  { module: 'kern',    label: 'De Kern',      accentClass: 'border-kern-400 text-kern-600' },
  { module: 'wil',     label: 'De Wil',       accentClass: 'border-wil-400 text-wil-600' },
  { module: 'horizon', label: 'De Horizon',   accentClass: 'border-horizon-400 text-horizon-600' },
  { module: 'cross',   label: 'Cross-Module', accentClass: 'border-[var(--border-md)] text-[var(--ink-3)]' },
]

const MODULE_DOT: Record<WidgetModule, string> = {
  kern:    'bg-kern-500',
  wil:     'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross:   'bg-[var(--border-md)]',
}

interface SortableWidgetRowProps {
  def: WidgetDef
  pref: WidgetPref | undefined
  locked: boolean
  module: WidgetModule
  onToggle: (id: string) => void
  onSizeChange: (id: string, size: WidgetSize) => void
}

function SortableWidgetRow({ def, pref, locked, module, onToggle, onSizeChange }: SortableWidgetRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: def.id,
    disabled: locked,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const enabled = pref?.enabled ?? false
  const size = pref?.size ?? def.defaultSize
  const allowedSizes = def.sizes

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-4 px-4 sm:px-6 py-3 ${locked ? 'opacity-60' : ''}`}
    >
      {!locked ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Versleep ${def.name}`}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-4)] hover:text-[var(--ink-3)] cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <div className="shrink-0 flex h-7 w-7 items-center justify-center">
          <div className="h-4 w-4" />
        </div>
      )}

      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`h-2 w-2 shrink-0 rounded-full ${MODULE_DOT[module]} ${locked ? 'opacity-40' : ''}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink-2)]">{def.name}</p>
          <p className="text-xs text-[var(--ink-3)]">{def.description}</p>
        </div>
      </div>

      {locked ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-[var(--ink-4)]" />
          <span className="rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
            {def.requiredPhase}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {allowedSizes.length > 1 && (
            <select
              value={size}
              onChange={e => onSizeChange(def.id, e.target.value as WidgetSize)}
              disabled={!enabled}
              className="rounded border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-xs text-[var(--ink-2)] disabled:opacity-50"
            >
              {allowedSizes.map(s => (
                <option key={s} value={s}>{s === 'quarter' ? 'Kwart' : s === 'half' ? 'Half' : 'Volledig'}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => onToggle(def.id)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              enabled ? 'bg-zinc-900' : 'bg-zinc-300'
            }`}
            aria-label={`${enabled ? 'Verberg' : 'Toon'} ${def.name}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Typography helpers ────────────────────────────────────────────────────

const FONT_THEMES: {
  id: FontTheme
  label: string
  description: string
  headingSample: string
  bodySample: string
  headingStyle: React.CSSProperties
  bodyStyle: React.CSSProperties
}[] = [
  {
    id: 'editorial',
    label: 'Redactioneel',
    description: 'Playfair Display + Source Serif 4 — krantenstijl, klassiek',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-playfair-orig, var(--font-playfair))', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-source-serif-orig, var(--font-source-serif))', fontStyle: 'italic' },
  },
  {
    id: 'andada',
    label: 'Andada Pro',
    description: 'Andada Pro — humanistisch serif, scherm-geoptimaliseerd',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-andada)', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-andada)', fontStyle: 'italic' },
  },
  {
    id: 'digital',
    label: 'Digitaal',
    description: 'Inter — helder, modern schreefloos',
    headingSample: 'Geld is opgeslagen tijd',
    bodySample: 'Elke euro vertegenwoordigt een stukje levenstijd.',
    headingStyle: { fontFamily: 'var(--font-inter)', fontWeight: 700 },
    bodyStyle: { fontFamily: 'var(--font-inter)' },
  },
]

function fmt(pct: number, decimals = 2) {
  return pct.toFixed(decimals).replace('.', ',') + '%'
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function InstellingenPage() {
  const router = useRouter()
  const supabase = createClient()

  // ─ Accordion open state ─
  const [notifOpen, setNotifOpen] = useState(false)
  const [widgetsOpen, setWidgetsOpen] = useState(false)
  const [fireOpen, setFireOpen] = useState(false)
  const [weergaveOpen, setWeergaveOpen] = useState(false)
  const [gegevensOpen, setGegevensOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  // ─ Section F: Privacy & AI ─
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiSaving, setAiSaving] = useState(false)
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)

  // ─ Section G: Huishouden Privacy ─
  type PrivacyLevel = 'volledig' | 'totalen' | 'verborgen'
  type PrivacySettings = Record<string, PrivacyLevel>
  const DEFAULT_HOUSEHOLD_PRIVACY: PrivacySettings = {
    vermogen: 'totalen',
    schulden: 'totalen',
    budgetten: 'totalen',
    transacties: 'totalen',
    inkomen: 'totalen',
  }
  const [huishoudenOpen, setHuishoudenOpen] = useState(false)
  const [huishoudenPrivacySubOpen, setHuishoudenPrivacySubOpen] = useState(false)
  const [hasHousehold, setHasHousehold] = useState(false)
  const [householdPrivacy, setHouseholdPrivacy] = useState<PrivacySettings>(DEFAULT_HOUSEHOLD_PRIVACY)
  const [householdPrivacySaved, setHouseholdPrivacySaved] = useState<PrivacySettings>(DEFAULT_HOUSEHOLD_PRIVACY)
  const [householdPrivacyLoading, setHouseholdPrivacyLoading] = useState(true)
  const [householdPrivacySaving, setHouseholdPrivacySaving] = useState(false)
  const [householdPrivacyMessage, setHouseholdPrivacyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Section A: Notificaties ─
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    budget: true, sync: true,
    recommendation: true, insight: true, levelup: true,
  })
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Partner transaction notification preferences ─
  type PartnerNotifMode = 'all_shared' | 'threshold' | 'categories' | 'disabled'
  const [partnerNotifMode, setPartnerNotifMode] = useState<PartnerNotifMode>('all_shared')
  const [partnerNotifThreshold, setPartnerNotifThreshold] = useState<string>('100')
  const [partnerNotifCategories, setPartnerNotifCategories] = useState<string[]>([])
  const [partnerNotifSaving, setPartnerNotifSaving] = useState(false)
  const [partnerNotifMessage, setPartnerNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [partnerNotifSaved, setPartnerNotifSaved] = useState<{ mode: PartnerNotifMode; threshold: string; categories: string[] }>({ mode: 'all_shared', threshold: '100', categories: [] })
  const [userBudgetCategories, setUserBudgetCategories] = useState<{ id: string; name: string }[]>([])

  // ─ Monthly check-in toggle ─
  const [checkinEnabled, setCheckinEnabled] = useState(true)
  const [checkinSaving, setCheckinSaving] = useState(false)

  // ─ Section B: Dashboard Widgets ─
  const { dashboardType, setDashboardType } = useDashboardType()
  const [dashTypeSaving, setDashTypeSaving] = useState(false)
  const [prefs, setPrefs] = useState<WidgetPref[]>(DEFAULT_WIDGET_PREFS.widgets)
  const [widgetsLoading, setWidgetsLoading] = useState(true)
  const [widgetsSaving, setWidgetsSaving] = useState(false)
  const [widgetsMessage, setWidgetsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sovereigntyLevel, setSovereigntyLevel] = useState<number>(-2)
  const [briefingContentPrefs, setBriefingContentPrefs] = useState<BriefingContentPrefs>({ showNextSteps: true, showDiscover: true })

  // ─ Section C: FIRE Instellingen ─
  const [expectedReturn, setExpectedReturn] = useState(7)
  const [inflationRate, setInflationRate] = useState(2)
  const [paramSaving, setParamSaving] = useState(false)
  const [paramMessage, setParamMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [retirementMethod, setRetirementMethod] = useState<RetirementExpenseMethod>('essential_budgets')
  const [retirementCustomAmount, setRetirementCustomAmount] = useState<string>('')
  const [fireEndStrategy, setFireEndStrategy] = useState<FireEndStrategy>('perpetual')
  const [fireEndAge, setFireEndAge] = useState<string>('85')
  const [fireLegacyAmount, setFireLegacyAmount] = useState<string>('')
  const [fireSaving, setFireSaving] = useState(false)
  const [fireMessage, setFireMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Section D: Weergave ─
  const { fontTheme, setFontTheme } = useFontTheme()
  const { setConfig } = useModuleColors()
  const { setBudgetConfig } = useBudgetColors()
  const { setPhaseConfig } = usePhaseColors()
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeMessage, setTypeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [moduleColors, setModuleColors] = useState<ModuleColorConfig>(DEFAULT_MODULE_COLORS)
  const [budgetColors, setBudgetColorsLocal] = useState<BudgetColorConfig>(DEFAULT_BUDGET_COLORS)
  const [phaseColors, setPhaseColorsLocal] = useState<PhaseColorConfig>(DEFAULT_PHASE_COLORS)
  const [moduleColorSaving, setModuleColorSaving] = useState(false)
  const [moduleColorMessage, setModuleColorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [budgetColorSaving, setBudgetColorSaving] = useState(false)
  const [budgetColorMessage, setBudgetColorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [phaseColorSaving, setPhaseColorSaving] = useState(false)
  const [phaseColorMessage, setPhaseColorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Section E: Gegevens ─
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ─ Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [notifData, profileData, assetsResult, debtsResult, txResult, briefingPrefsData] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', `notifications_preferences_${user.id}`).maybeSingle(),
        supabase.from('profiles').select(
          'widget_prefs, expected_return, inflation_rate, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, module_colors, budget_colors, phase_colors, typography_theme, ai_enabled'
        ).eq('id', user.id).single(),
        supabase.from('assets').select('current_value').eq('is_active', true),
        supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
        supabase.from('transactions').select('amount')
          .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
          .lt('date', new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0]),
        supabase.from('app_settings').select('value').eq('key', `briefing_preferences_${user.id}`).maybeSingle(),
      ])

      // Notificaties
      if (notifData.data?.value) {
        try {
          const parsed = JSON.parse(notifData.data.value)
          setNotifPrefs(prev => ({ ...prev, ...parsed }))
        } catch { /* ignore */ }
      }
      setNotifLoading(false)

      // Monthly check-in preference
      try {
        const checkinRes = await fetch('/api/monthly-checkin')
        if (checkinRes.ok) {
          const checkinData = await checkinRes.json()
          setCheckinEnabled(checkinData.enabled !== false)
        }
      } catch { /* ignore */ }

      // Briefing content preferences (DB → localStorage fallback)
      if (briefingPrefsData.data?.value) {
        try {
          const parsed = JSON.parse(briefingPrefsData.data.value) as BriefingContentPrefs
          const merged = { showNextSteps: parsed.showNextSteps !== false, showDiscover: parsed.showDiscover !== false }
          setBriefingContentPrefs(merged)
          saveBriefingContentPrefs(merged) // sync to localStorage
        } catch {
          setBriefingContentPrefs(readBriefingContentPrefs())
        }
      } else {
        setBriefingContentPrefs(readBriefingContentPrefs())
      }

      // FIRE parameters
      const d = profileData.data
      if (d) {
        if (d.expected_return != null) setExpectedReturn(Math.round(d.expected_return * 1000) / 10)
        if (d.inflation_rate != null) setInflationRate(Math.round(d.inflation_rate * 1000) / 10)
        if (d.retirement_expense_method) setRetirementMethod(d.retirement_expense_method as RetirementExpenseMethod)
        if (d.retirement_expense_custom_amount) setRetirementCustomAmount(String(d.retirement_expense_custom_amount))
        const fs = parseFireStrategy(d)
        setFireEndStrategy(fs.strategy)
        if (fs.endAge) setFireEndAge(String(fs.endAge))
        if (fs.legacyAmount) setFireLegacyAmount(String(fs.legacyAmount))

        // Weergave: module colors
        if (d.module_colors) {
          const mc = d.module_colors as Record<string, string>
          const newConfig: ModuleColorConfig = { ...DEFAULT_MODULE_COLORS }
          for (const m of Object.keys(DEFAULT_MODULE_COLORS) as ModuleName[]) {
            if (mc[m]) newConfig[m] = mc[m]
          }
          setModuleColors(newConfig)
          setConfig(newConfig)
        }

        // Weergave: budget colors
        if (d.budget_colors) {
          const bc = d.budget_colors as Record<string, string>
          const newBudget: BudgetColorConfig = { ...DEFAULT_BUDGET_COLORS }
          for (const k of Object.keys(DEFAULT_BUDGET_COLORS)) {
            if (bc[k]) newBudget[k as keyof BudgetColorConfig] = bc[k]
          }
          setBudgetColorsLocal(newBudget)
          setBudgetConfig(newBudget)
        }

        // Weergave: phase colors
        if (d.phase_colors) {
          const pc = d.phase_colors as Record<string, string>
          const newPhase: PhaseColorConfig = { ...DEFAULT_PHASE_COLORS }
          for (const k of Object.keys(DEFAULT_PHASE_COLORS)) {
            if (pc[k]) newPhase[k as keyof PhaseColorConfig] = pc[k]
          }
          setPhaseColorsLocal(newPhase)
          setPhaseConfig(newPhase)
        }

        // Weergave: typography
        if (d.typography_theme) {
          setFontTheme(d.typography_theme as FontTheme)
        }

        // Privacy & AI
        if (d.ai_enabled != null) {
          setAiEnabled(d.ai_enabled as boolean)
        }

      }

      // Widgets + sovereignty level
      const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
      const netWorth = totalAssets - totalDebts
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt < 0) monthlyExpenses += Math.abs(amt)
      }
      const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
        const dt = (d as { debt_type?: string }).debt_type
        return dt === 'credit_card' || dt === 'personal_loan' || dt === 'consumer'
      })
      const yearlyExpenses = monthlyExpenses * 12
      const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
      const freedomPct = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0
      setSovereigntyLevel(computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt))

      const saved = d?.widget_prefs as { widgets: WidgetPref[] } | null
      const merged = mergeWidgetPrefs(saved)
      setPrefs(merged.widgets)
      setWidgetsLoading(false)

      // Household privacy settings + partner notification prefs
      try {
        const privacyRes = await fetch('/api/household/privacy')
        if (privacyRes.ok) {
          const privacyData = await privacyRes.json()
          setHasHousehold(true)
          setHouseholdPrivacy(privacyData.privacySettings)
          setHouseholdPrivacySaved(privacyData.privacySettings)

          // Load partner notification preferences
          try {
            const pnRes = await fetch('/api/partner-notifications')
            if (pnRes.ok) {
              const pnData = await pnRes.json()
              setPartnerNotifMode(pnData.mode || 'all_shared')
              setPartnerNotifThreshold(String(pnData.threshold ?? 100))
              setPartnerNotifCategories(pnData.categories || [])
              setPartnerNotifSaved({ mode: pnData.mode || 'all_shared', threshold: String(pnData.threshold ?? 100), categories: pnData.categories || [] })
            }
          } catch { /* defaults are fine */ }

          // Load budget categories for partner notification category picker
          const { data: budgets } = await supabase
            .from('budgets')
            .select('id, name, parent_id, budget_type')
            .eq('user_id', user.id)
            .in('budget_type', ['expense', 'savings', 'debt'])
            .is('parent_id', null)
            .order('name')
          if (budgets) {
            setUserBudgetCategories(budgets.map(b => ({ id: b.id, name: b.name })))
          }
        } else if (privacyRes.status === 404) {
          setHasHousehold(false)
        }
      } catch {
        // No household or error — leave hidden
      }
      setHouseholdPrivacyLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─ Section A handlers ────────────────────────────────────────────────────
  const toggleNotifPref = useCallback((type: string) => {
    setNotifPrefs(prev => ({ ...prev, [type]: !prev[type] }))
  }, [])

  const saveNotifPrefs = useCallback(async () => {
    setNotifSaving(true)
    setNotifMessage(null)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: notifPrefs }),
      })
      if (!res.ok) throw new Error('Save failed')
      setNotifMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setNotifMessage(null), 3000)
    } catch {
      setNotifMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setNotifSaving(false)
  }, [notifPrefs])

  const savePartnerNotifPrefs = useCallback(async () => {
    setPartnerNotifSaving(true)
    setPartnerNotifMessage(null)
    try {
      const res = await fetch('/api/partner-notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: partnerNotifMode,
          threshold: Number(partnerNotifThreshold) || 100,
          categories: partnerNotifCategories,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setPartnerNotifSaved({ mode: partnerNotifMode, threshold: partnerNotifThreshold, categories: [...partnerNotifCategories] })
      setPartnerNotifMessage({ type: 'success', text: 'Partner-notificaties opgeslagen!' })
      setTimeout(() => setPartnerNotifMessage(null), 3000)
    } catch {
      setPartnerNotifMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setPartnerNotifSaving(false)
  }, [partnerNotifMode, partnerNotifThreshold, partnerNotifCategories])

  const partnerNotifChanged = partnerNotifMode !== partnerNotifSaved.mode
    || partnerNotifThreshold !== partnerNotifSaved.threshold
    || JSON.stringify(partnerNotifCategories) !== JSON.stringify(partnerNotifSaved.categories)

  const togglePartnerCategory = useCallback((catId: string) => {
    setPartnerNotifCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    )
  }, [])

  const toggleCheckin = useCallback(async () => {
    const newVal = !checkinEnabled
    setCheckinEnabled(newVal)
    setCheckinSaving(true)
    try {
      await fetch('/api/monthly-checkin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal }),
      })
    } catch {
      setCheckinEnabled(!newVal) // revert
    }
    setCheckinSaving(false)
  }, [checkinEnabled])

  // ─ Section B handlers ────────────────────────────────────────────────────
  const isWidgetLocked = useCallback((def: WidgetDef): boolean => {
    return sovereigntyLevel < def.minLevel
  }, [sovereigntyLevel])

  const toggleEnabled = useCallback((id: string) => {
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p))
  }, [])

  const changeSize = useCallback((id: string, size: WidgetSize) => {
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, size } : p))
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent, moduleWidgetIds: string[]) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPrefs(prev => {
      const modulePrefs = moduleWidgetIds
        .map(id => prev.find(p => p.id === id))
        .filter((p): p is WidgetPref => p !== undefined)
      const oldIdx = modulePrefs.findIndex(p => p.id === active.id)
      const newIdx = modulePrefs.findIndex(p => p.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const reorderedModule = arrayMove(modulePrefs, oldIdx, newIdx)
      const reorderedWithOrders = reassignOrders(reorderedModule)
      const moduleIdSet = new Set(moduleWidgetIds)
      const otherPrefs = prev.filter(p => !moduleIdSet.has(p.id))
      return [...otherPrefs, ...reorderedWithOrders]
    })
  }, [])

  const saveDashboardType = useCallback(async (type: 'widgets' | 'briefing') => {
    setDashTypeSaving(true)
    await setDashboardType(type)
    setDashTypeSaving(false)
  }, [setDashboardType])

  const toggleBriefingContentPref = useCallback(async (key: keyof BriefingContentPrefs) => {
    setBriefingContentPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] }
      saveBriefingContentPrefs(updated)
      // Persist to app_settings (fire-and-forget)
      const sb = createClient()
      sb.auth.getUser().then(({ data: { user: u } }) => {
        if (!u) return
        sb.from('app_settings').upsert(
          { key: `briefing_preferences_${u.id}`, value: JSON.stringify(updated) },
          { onConflict: 'key' },
        )
      })
      return updated
    })
  }, [])

  const saveWidgets = useCallback(async () => {
    setWidgetsSaving(true)
    setWidgetsMessage(null)
    try {
      const res = await fetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: prefs }),
      })
      if (!res.ok) throw new Error('Save failed')
      setWidgetsMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setWidgetsMessage(null), 3000)
    } catch {
      setWidgetsMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setWidgetsSaving(false)
  }, [prefs])

  // ─ Section C handlers ────────────────────────────────────────────────────
  const box3Pct = BOX3_DRAG * 100
  const effectiveSwrPct = Math.max(0.1, expectedReturn - box3Pct - inflationRate)
  const fireMultiplier = effectiveSwrPct > 0 ? (100 / effectiveSwrPct) : 0

  const saveParams = useCallback(async () => {
    setParamSaving(true)
    setParamMessage(null)
    try {
      const res = await fetch('/api/parameters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_return: expectedReturn / 100,
          inflation_rate: inflationRate / 100,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setParamMessage({ type: 'error', text: d.error ?? 'Opslaan mislukt' })
      } else {
        setParamMessage({ type: 'success', text: 'Parameters opgeslagen' })
        setTimeout(() => setParamMessage(null), 3000)
      }
    } catch {
      setParamMessage({ type: 'error', text: 'Netwerkfout — probeer opnieuw' })
    }
    setParamSaving(false)
  }, [expectedReturn, inflationRate])

  const saveFireSettings = useCallback(async () => {
    setFireSaving(true)
    setFireMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({
        retirement_expense_method: retirementMethod,
        retirement_expense_custom_amount: retirementCustomAmount ? Number(retirementCustomAmount) : null,
        fire_end_strategy: fireEndStrategy,
        fire_end_age: Number(fireEndAge) || 90,
        fire_legacy_amount: fireLegacyAmount ? Number(fireLegacyAmount) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)
      if (error) throw error
      setFireMessage({ type: 'success', text: 'FIRE instellingen opgeslagen!' })
      setTimeout(() => setFireMessage(null), 3000)
    } catch {
      setFireMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setFireSaving(false)
  }, [supabase, retirementMethod, retirementCustomAmount, fireEndStrategy, fireEndAge, fireLegacyAmount])

  // ─ Section F: Privacy & AI handler ────────────────────────────────────────
  const toggleAiEnabled = useCallback(async (enabled: boolean) => {
    setAiEnabled(enabled)
    setAiSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ ai_enabled: enabled }).eq('id', user.id)
      if (error) throw error
    } catch {
      setAiEnabled(!enabled) // revert on failure
    }
    setAiSaving(false)
  }, [supabase])

  // ─ Section G: Huishouden Privacy handler ─────────────────────────────────
  const saveHouseholdPrivacy = useCallback(async () => {
    setHouseholdPrivacySaving(true)
    setHouseholdPrivacyMessage(null)
    try {
      const res = await fetch('/api/household/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacySettings: householdPrivacy }),
      })
      if (!res.ok) throw new Error('Save failed')
      setHouseholdPrivacySaved({ ...householdPrivacy })
      setHouseholdPrivacyMessage({ type: 'success', text: 'Privacy-instellingen opgeslagen!' })
      setTimeout(() => setHouseholdPrivacyMessage(null), 3000)
    } catch {
      setHouseholdPrivacyMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setHouseholdPrivacySaving(false)
  }, [householdPrivacy])

  // ─ Section D handlers ────────────────────────────────────────────────────
  const saveTypography = useCallback(async () => {
    setTypeSaving(true)
    setTypeMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ typography_theme: fontTheme }).eq('id', user.id)
      if (error) throw error
      setTypeMessage({ type: 'success', text: 'Typografie opgeslagen!' })
      setTimeout(() => setTypeMessage(null), 3000)
    } catch {
      setTypeMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setTypeSaving(false)
  }, [supabase, fontTheme])

  const saveModuleColors = useCallback(async () => {
    setModuleColorSaving(true)
    setModuleColorMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ module_colors: moduleColors }).eq('id', user.id)
      if (error) throw error
      setConfig(moduleColors)
      setModuleColorMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setModuleColorMessage(null), 3000)
    } catch {
      setModuleColorMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setModuleColorSaving(false)
  }, [supabase, moduleColors, setConfig])

  const resetModuleColors = useCallback(async () => {
    setModuleColors(DEFAULT_MODULE_COLORS)
    setConfig(DEFAULT_MODULE_COLORS)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ module_colors: DEFAULT_MODULE_COLORS }).eq('id', user.id)
  }, [supabase, setConfig])

  const saveBudgetColors = useCallback(async () => {
    setBudgetColorSaving(true)
    setBudgetColorMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ budget_colors: budgetColors }).eq('id', user.id)
      if (error) throw error
      setBudgetConfig(budgetColors)
      setBudgetColorMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setBudgetColorMessage(null), 3000)
    } catch {
      setBudgetColorMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setBudgetColorSaving(false)
  }, [supabase, budgetColors, setBudgetConfig])

  const resetBudgetColors = useCallback(async () => {
    setBudgetColorsLocal(DEFAULT_BUDGET_COLORS)
    setBudgetConfig(DEFAULT_BUDGET_COLORS)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ budget_colors: DEFAULT_BUDGET_COLORS }).eq('id', user.id)
  }, [supabase, setBudgetConfig])

  const savePhaseColors = useCallback(async () => {
    setPhaseColorSaving(true)
    setPhaseColorMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ phase_colors: phaseColors }).eq('id', user.id)
      if (error) throw error
      setPhaseConfig(phaseColors)
      setPhaseColorMessage({ type: 'success', text: 'Kleuren opgeslagen!' })
      setTimeout(() => setPhaseColorMessage(null), 3000)
    } catch {
      setPhaseColorMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setPhaseColorSaving(false)
  }, [supabase, phaseColors, setPhaseConfig])

  const resetPhaseColors = useCallback(async () => {
    setPhaseColorsLocal(DEFAULT_PHASE_COLORS)
    setPhaseConfig(DEFAULT_PHASE_COLORS)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ phase_colors: DEFAULT_PHASE_COLORS }).eq('id', user.id)
  }, [supabase, setPhaseConfig])

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Page header */}
      <div className="mb-5 sm:mb-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Identiteit</p>
        <h1 className="font-display text-[28px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
          Instellingen
        </h1>
        <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
          Notificaties, widgets, berekeningen, weergave, huishouden en gegevensbeheer.
        </p>
      </div>

      {/* ── A: Notificaties ─────────────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setNotifOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Notificaties</h2>
            {!notifOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {NOTIFICATION_TYPES.filter(n => notifPrefs[n.type] !== false).length} van {NOTIFICATION_TYPES.length} actief
              </p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${notifOpen ? 'rotate-180' : ''}`} />
        </button>

        {notifOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 pb-6 pt-4">
            {notifLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
              </div>
            ) : (
              <>
                <div className="divide-y divide-zinc-100 rounded-xl border border-[var(--border-ed)]">
                  {NOTIFICATION_TYPES.map(({ type, label, description, icon: Icon }) => {
                    const enabled = notifPrefs[type] !== false
                    return (
                      <div key={type} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--ink-2)]">{label}</p>
                            <p className="text-xs text-[var(--ink-3)]">{description}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleNotifPref(type)}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            enabled ? 'bg-zinc-900' : 'bg-zinc-300'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
                            enabled ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Monthly check-in toggle */}
                <div className="mt-4 rounded-xl border border-[var(--border-ed)]">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CalendarCheck className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ink-2)]">Maandelijkse geldcheck-in</p>
                        <p className="text-xs text-[var(--ink-3)]">Herinnering om elke maand je financi&euml;n te checken</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleCheckin}
                      disabled={checkinSaving}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        checkinEnabled ? 'bg-zinc-900' : 'bg-zinc-300'
                      } ${checkinSaving ? 'opacity-50' : ''}`}
                      aria-label={checkinEnabled ? 'Schakel geldcheck-in uit' : 'Schakel geldcheck-in in'}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
                        checkinEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Partner transacties — only when user has a household */}
                {hasHousehold && (
                  <div id="partner-transacties" className="mt-5 rounded-xl border border-[var(--border-ed)] overflow-hidden scroll-mt-4">
                    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--subtle)] border-b border-[var(--border-ed)]">
                      <HandCoins className="h-4 w-4 shrink-0 text-wil-600" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">Partner transacties</p>
                        <p className="text-xs text-[var(--ink-3)]">Meldingen over transacties van je partner</p>
                      </div>
                    </div>
                    <div className="px-4 py-4 space-y-4">
                      {/* Mode selector */}
                      <div className="space-y-2">
                        {([
                          { mode: 'all_shared' as PartnerNotifMode, label: 'Alle gedeelde transacties', desc: 'Ontvang een melding bij elke gedeelde transactie' },
                          { mode: 'threshold' as PartnerNotifMode, label: 'Boven drempelbedrag', desc: 'Alleen transacties boven een bepaald bedrag' },
                          { mode: 'categories' as PartnerNotifMode, label: 'Geselecteerde categorieën', desc: 'Alleen transacties in bepaalde budgetcategorieën' },
                          { mode: 'disabled' as PartnerNotifMode, label: 'Uitgeschakeld', desc: 'Geen meldingen over partner transacties' },
                        ]).map(opt => (
                          <button
                            key={opt.mode}
                            type="button"
                            onClick={() => setPartnerNotifMode(opt.mode)}
                            className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                              partnerNotifMode === opt.mode
                                ? 'bg-wil-50 border border-wil-300'
                                : 'border border-[var(--border-ed)] hover:bg-[var(--subtle)]'
                            }`}
                          >
                            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              partnerNotifMode === opt.mode ? 'border-wil-600' : 'border-[var(--border-md)]'
                            }`}>
                              {partnerNotifMode === opt.mode && (
                                <div className="h-2 w-2 rounded-full bg-wil-600" />
                              )}
                            </div>
                            <div>
                              <p className={`text-sm font-medium ${partnerNotifMode === opt.mode ? 'text-wil-800' : 'text-[var(--ink-2)]'}`}>{opt.label}</p>
                              <p className="text-xs text-[var(--ink-3)]">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Threshold amount input */}
                      {partnerNotifMode === 'threshold' && (
                        <div className="rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
                          <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">
                            Drempelbedrag
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--ink-3)]">€</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={partnerNotifThreshold}
                              onChange={e => setPartnerNotifThreshold(e.target.value)}
                              className="w-28 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-sm font-mono tabular-nums text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-wil-400"
                            />
                            <span className="text-xs text-[var(--ink-3)]">of hoger</span>
                          </div>
                        </div>
                      )}

                      {/* Category selection */}
                      {partnerNotifMode === 'categories' && (
                        <div className="rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--subtle)]">
                          <label className="block text-xs font-medium text-[var(--ink-2)] mb-2">
                            Selecteer categorieën
                          </label>
                          {userBudgetCategories.length > 0 ? (
                            <div className="space-y-1.5">
                              {userBudgetCategories.map(cat => {
                                const checked = partnerNotifCategories.includes(cat.id)
                                return (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => togglePartnerCategory(cat.id)}
                                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                                      checked ? 'bg-wil-50 border border-wil-200' : 'border border-transparent hover:bg-[var(--paper)]'
                                    }`}
                                  >
                                    <div className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center ${
                                      checked ? 'bg-wil-600 border-wil-600' : 'border-[var(--border-md)] bg-[var(--paper)]'
                                    }`}>
                                      {checked && (
                                        <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </div>
                                    <span className={`text-sm ${checked ? 'text-wil-800 font-medium' : 'text-[var(--ink-2)]'}`}>{cat.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-[var(--ink-3)] italic">Geen budgetcategorieën gevonden. Maak eerst budgetten aan.</p>
                          )}
                        </div>
                      )}

                      {/* Save button for partner notification prefs */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={savePartnerNotifPrefs}
                          disabled={partnerNotifSaving || !partnerNotifChanged}
                          className="rounded-lg bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
                        >
                          {partnerNotifSaving ? 'Opslaan...' : 'Opslaan'}
                        </button>
                        {partnerNotifMessage && (
                          <span className={`text-sm ${partnerNotifMessage.type === 'success' ? 'text-wil-600' : 'text-red-600'}`}>
                            {partnerNotifMessage.text}
                          </span>
                        )}
                        {partnerNotifChanged && !partnerNotifMessage && (
                          <span className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={saveNotifPrefs}
                    disabled={notifSaving}
                    className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {notifSaving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  {notifMessage && (
                    <span className={`text-sm ${notifMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {notifMessage.text}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── B: Dashboard ─────────────────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setWidgetsOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Dashboard</h2>
            {!widgetsOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {dashboardType === 'briefing' ? 'AI Briefing' : 'Widgets'} · {prefs.filter(p => p.enabled).length} van {prefs.length} widgets actief
              </p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${widgetsOpen ? 'rotate-180' : ''}`} />
        </button>

        {widgetsOpen && (
          <>
            {/* Dashboard type toggle */}
            <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 py-4">
              <label className="text-sm font-medium text-[var(--ink-2)]">Standaard dashboard</label>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => saveDashboardType('widgets')}
                  disabled={dashTypeSaving}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    dashboardType === 'widgets'
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--border-md)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  Widgets
                </button>
                <button
                  type="button"
                  onClick={() => saveDashboardType('briefing')}
                  disabled={dashTypeSaving}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    dashboardType === 'briefing'
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--border-md)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  AI Briefing
                </button>
              </div>
              {dashboardType === 'briefing' && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-[var(--ink-3)]">
                    Widget-instellingen hieronder gelden alleen voor het widgets-dashboard.
                  </p>

                  <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 sm:p-4 space-y-1">
                    <p className="text-xs font-medium text-[var(--ink-2)]">Briefing-inhoud</p>

                    <label className="flex items-center justify-between gap-4 min-h-[44px] py-2 cursor-pointer">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--ink)]">Volgende stappen tonen</span>
                        <p className="text-xs text-zinc-500">Will toont relevante volgende stappen in je DAIshboard</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={briefingContentPrefs.showNextSteps}
                        aria-label="Volgende stappen tonen"
                        onClick={() => toggleBriefingContentPref('showNextSteps')}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors touch-manipulation ${
                          briefingContentPrefs.showNextSteps ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          briefingContentPrefs.showNextSteps ? 'translate-x-[22px]' : 'translate-x-[3px]'
                        }`} />
                      </button>
                    </label>

                    <label className="flex items-center justify-between gap-4 min-h-[44px] py-2 cursor-pointer">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--ink)]">Ontdek-suggesties tonen</span>
                        <p className="text-xs text-zinc-500">Will toont tips over features die je nog niet hebt ontdekt</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={briefingContentPrefs.showDiscover}
                        aria-label="Ontdek-suggesties tonen"
                        onClick={() => toggleBriefingContentPref('showDiscover')}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors touch-manipulation ${
                          briefingContentPrefs.showDiscover ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
                        }`}
                      >
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          briefingContentPrefs.showDiscover ? 'translate-x-[22px]' : 'translate-x-[3px]'
                        }`} />
                      </button>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 py-3">
              <p className="text-sm text-[var(--ink-3)]">
                Kies welke widgets op jouw dashboard verschijnen en in welk formaat. Sleep rijen om de volgorde aan te passen.
              </p>
            </div>

            {widgetsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
              </div>
            ) : (
              <div className="space-y-0">
                {MODULE_GROUPS.map(({ module, label, accentClass }) => {
                  const widgets = WIDGET_CATALOG.filter(w => w.module === module && sovereigntyLevel >= w.minLevel)
                  if (widgets.length === 0) return null
                  const widgetIds = widgets.map(w => w.id)
                  const sortedWidgets = [...widgets].sort((a, b) => {
                    const pa = prefs.find(p => p.id === a.id)
                    const pb = prefs.find(p => p.id === b.id)
                    return (pa?.order ?? 999) - (pb?.order ?? 999)
                  })
                  return (
                    <div key={module}>
                      <div className={`flex items-center gap-2 border-l-[3px] px-4 sm:px-6 py-3 bg-[var(--subtle)]/50 ${accentClass}`}>
                        <div className={`h-2 w-2 rounded-full ${MODULE_DOT[module]}`} />
                        <h3 className="label-editorial">{label.toUpperCase()}</h3>
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={e => handleDragEnd(e, widgetIds)}
                      >
                        <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
                          <div className="divide-y divide-[var(--border-ed)]">
                            {sortedWidgets.map(def => (
                              <SortableWidgetRow
                                key={def.id}
                                def={def}
                                pref={prefs.find(p => p.id === def.id)}
                                locked={isWidgetLocked(def)}
                                module={module}
                                onToggle={toggleEnabled}
                                onSizeChange={changeSize}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )
                })}
                <div className="flex items-center gap-3 px-4 sm:px-8 py-4 sm:py-6">
                  <button
                    onClick={saveWidgets}
                    disabled={widgetsSaving}
                    className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {widgetsSaving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  {widgetsMessage && (
                    <span className={`text-sm ${widgetsMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {widgetsMessage.text}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── C: FIRE Instellingen ─────────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setFireOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">FIRE Instellingen</h2>
            {!fireOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                Rendement {fmt(expectedReturn)} · inflatie {fmt(inflationRate)} · SWR {fmt(Math.max(0.1, expectedReturn - BOX3_DRAG * 100 - inflationRate))} · {STRATEGY_LABELS[fireEndStrategy].name}
              </p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${fireOpen ? 'rotate-180' : ''}`} />
        </button>

        {fireOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 py-6">
        {/* Marktaannames */}
        <div className="mb-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Marktaannames</p>

          <div className="mb-6">
            <div className="mb-2 flex items-end justify-between">
              <label className="text-sm font-semibold text-[var(--ink)]">Verwacht bruto rendement</label>
              <span className="font-mono text-base font-bold tabular-nums text-horizon-700">{fmt(expectedReturn)}</span>
            </div>
            <input
              type="range" min={1} max={15} step={0.1} value={expectedReturn}
              onChange={e => setExpectedReturn(Number(e.target.value))}
              className="w-full cursor-pointer accent-horizon-600"
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-[var(--ink-4)]">
              <span>1% conservatief</span><span>7% historisch gem.</span><span>15% optimistisch</span>
            </div>
            <p className="mt-2 font-sans text-[11px] text-[var(--ink-3)]">
              Verwacht jaarlijks rendement op je beleggingsportefeuille vóór Box 3-heffing en inflatie. Het MSCI World historisch gemiddelde over 30+ jaar is ≈7–9%.
            </p>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-end justify-between">
              <label className="text-sm font-semibold text-[var(--ink)]">Verwachte inflatie</label>
              <span className="font-mono text-base font-bold tabular-nums text-horizon-700">{fmt(inflationRate)}</span>
            </div>
            <input
              type="range" min={0} max={8} step={0.1} value={inflationRate}
              onChange={e => setInflationRate(Number(e.target.value))}
              className="w-full cursor-pointer accent-horizon-600"
            />
            <div className="mt-1.5 flex justify-between text-[10px] text-[var(--ink-4)]">
              <span>0% deflatie</span><span>2% NL-gemiddelde</span><span>8% hoog</span>
            </div>
          </div>

          {/* Live kassabon */}
          <div className="mb-4">
            <KassabonShell>
              <div className="mb-3 text-center">
                <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">NETTO REËEL RENDEMENT</p>
                <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">Live berekening op basis van jouw aannames</p>
              </div>
              <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Bruto rendement</span>
                  <span className="tabular-nums text-[var(--ink)]">+ {fmt(expectedReturn)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Box 3-heffing (wettelijk, vast)</span>
                  <span className="tabular-nums text-[var(--ink-3)]">− {fmt(box3Pct, 3)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Inflatie</span>
                  <span className="tabular-nums text-[var(--ink-3)]">− {fmt(inflationRate)}</span>
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                <span className="text-[var(--ink)]">Netto reëel rendement (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{fmt(effectiveSwrPct, 2)}</span>
              </div>
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">FIRE Multiplier (1 ÷ SWR)</span>
                  <span className="tabular-nums font-bold text-[var(--ink)]">{fireMultiplier.toFixed(1)}×</span>
                </div>
                <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
                  Je hebt <strong>{fireMultiplier.toFixed(1)}×</strong> je jaarlijkse must-uitgaven nodig voor volledige vrijheid. Klassiek 4%-regel = 25×.
                </p>
              </div>
              <div className="mt-3 rounded-[var(--r-sm)] border border-dashed border-horizon-300 bg-horizon-50/50 px-3 py-2 font-sans text-[11px] text-horizon-700">
                De Box 3-heffing ({fmt(box3Pct, 3)}) is wettelijk vastgesteld voor 2025: 5,88% forfaitair rendement × 36% belastingtarief.
              </div>
            </KassabonShell>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button" onClick={saveParams} disabled={paramSaving}
              className="rounded-[var(--r)] bg-horizon-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-horizon-700 disabled:opacity-50"
            >
              {paramSaving ? 'Opslaan...' : 'Aannames opslaan'}
            </button>
            {paramMessage && (
              <span className={`text-sm font-medium ${paramMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {paramMessage.text}
              </span>
            )}
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Retirement expense method */}
        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Jaarlijkse uitgave na retirement</p>
          <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
            Hoeveel je per jaar uitgeeft nadat je financieel vrij bent. Dit bepaalt je FIRE-doel en vrijheidsdagen.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              { value: 'essential_budgets', label: 'Essentiële budgetten', subtitle: 'Gebaseerd op je must-budgetten' },
              { value: 'custom_amount', label: 'Eigen bedrag', subtitle: 'Voer een eigen jaarbedrag in' },
              { value: 'current_income', label: 'Huidig inkomen', subtitle: 'Gebaseerd op je inkomen' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRetirementMethod(opt.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
                  retirementMethod === opt.value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-[var(--border-md)] text-[var(--ink-2)] hover:border-zinc-400'
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className={`text-xs mt-0.5 ${retirementMethod === opt.value ? 'text-zinc-300' : 'text-[var(--ink-3)]'}`}>
                  {opt.subtitle}
                </div>
              </button>
            ))}
          </div>
          {retirementMethod === 'custom_amount' && (
            <div className="mt-4">
              <label htmlFor="retirementCustomAmount" className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Jaarlijks bedrag na retirement (€)
              </label>
              <input
                id="retirementCustomAmount"
                type="number"
                min={0}
                step={500}
                value={retirementCustomAmount}
                onChange={e => setRetirementCustomAmount(e.target.value)}
                placeholder="bv. 30000"
                className="mt-1.5 w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 font-mono"
              />
              {retirementCustomAmount && !isNaN(Number(retirementCustomAmount)) && Number(retirementCustomAmount) > 0 && (
                <p className="mt-1.5 font-sans text-[11px] text-[var(--ink-3)]">
                  ≈ {formatCurrency(Number(retirementCustomAmount) / 12)}/maand &middot; dagprijs {formatCurrency(Number(retirementCustomAmount) / 365)}
                </p>
              )}
            </div>
          )}
          {retirementMethod === 'current_income' && (
            <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
              Gebaseerd op je geschat jaarinkomen uit de afgelopen 12 maanden transacties. Voor wie na retirement dezelfde levensstijl wil handhaven.
            </p>
          )}
          <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
            De gekozen methode bepaalt het FIRE-doel, alle vrijheidsdagen-berekeningen en de dagprijs in De Kern, De Horizon en de belastingpagina.
          </p>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* FIRE Eindstrategie */}
        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">FIRE Eindstrategie</p>
          <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
            Wat wil je doen met je vermogen op het einde van de rit?
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.entries(STRATEGY_LABELS) as [FireEndStrategy, typeof STRATEGY_LABELS[keyof typeof STRATEGY_LABELS]][]).map(([key, info]) => {
              const isSelected = fireEndStrategy === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFireEndStrategy(key)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    isSelected ? 'border-zinc-900 bg-zinc-50' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                  }`}
                >
                  <span className={`text-sm font-semibold ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                    {info.name}
                  </span>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">{info.subtitle}.</p>
                </button>
              )
            })}
          </div>

          {/* Extra inputs for deplete / legacy */}
          {(fireEndStrategy === 'deplete' || fireEndStrategy === 'legacy') && (
            <div className="mt-4">
              <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Eindleeftijd</label>
              <input
                type="number" min={50} max={120} step={1} value={fireEndAge}
                onChange={e => setFireEndAge(e.target.value)}
                className="mt-1.5 w-32 rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
              />
              <span className="ml-2 text-sm text-[var(--ink-3)]">jaar</span>
            </div>
          )}
          {fireEndStrategy === 'legacy' && (
            <div className="mt-4">
              <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Na te laten bedrag (€)</label>
              <input
                type="number" min={0} step={10000} value={fireLegacyAmount}
                onChange={e => setFireLegacyAmount(e.target.value)}
                placeholder="bv. 100000"
                className="mt-1.5 w-full rounded-lg border border-[var(--border-md)] bg-[var(--subtle)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
              />
            </div>
          )}
          <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
            De gekozen strategie bepaalt hoeveel vermogen je nodig hebt voor FIRE en hoe de simulatiegrafiek eruitziet.
          </p>
        </div>

        {/* Save FIRE settings */}
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={saveFireSettings} disabled={fireSaving}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {fireSaving ? 'Opslaan...' : 'FIRE instellingen opslaan'}
          </button>
          {fireMessage && (
            <span className={`text-sm ${fireMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {fireMessage.text}
            </span>
          )}
        </div>
          </div>
        )}
      </section>

      {/* ── D: Weergave ─────────────────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setWeergaveOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Weergave</h2>
            {!weergaveOpen && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-[var(--ink-3)]">
                  {FONT_THEMES.find(t => t.id === fontTheme)?.label ?? 'Redactioneel'}
                </span>
                <span className="text-[var(--ink-4)]">·</span>
                {(Object.entries(moduleColors) as [ModuleName, string][]).map(([m, c]) => (
                  <span key={m} className="inline-block h-3 w-3 rounded-full border border-[var(--border-ed)]" style={{ backgroundColor: c }} title={m} />
                ))}
              </div>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${weergaveOpen ? 'rotate-180' : ''}`} />
        </button>

        {weergaveOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 py-6">

        {/* Typography */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Type className="h-4 w-4 text-[var(--ink-3)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Typografie</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {FONT_THEMES.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setFontTheme(theme.id)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  fontTheme === theme.id ? 'border-zinc-900 bg-zinc-50' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                }`}
              >
                <p style={theme.headingStyle} className="text-base text-[var(--ink)]">{theme.headingSample}</p>
                <p style={theme.bodyStyle} className="mt-1 text-sm text-[var(--ink-3)]">{theme.bodySample}</p>
                <div className="mt-2">
                  <p className="text-xs font-semibold text-[var(--ink-2)]">{theme.label}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">{theme.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveTypography} disabled={typeSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {typeSaving ? 'Opslaan...' : 'Typografie opslaan'}
            </button>
            {typeMessage && (
              <span className={`text-sm ${typeMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {typeMessage.text}
              </span>
            )}
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Module kleuren */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-[var(--ink-3)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Module Kleuren</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(Object.entries(moduleColors) as [ModuleName, string][]).map(([moduleName, color]) => (
              <ColorPickerCard
                key={moduleName}
                label={moduleName === 'kern' ? 'De Kern' : moduleName === 'wil' ? 'De Wil' : 'De Horizon'}
                value={color}
                defaultValue={DEFAULT_MODULE_COLORS[moduleName]}
                onChange={newColor => {
                  setModuleColors(prev => ({ ...prev, [moduleName]: newColor }))
                  setConfig({ ...moduleColors, [moduleName]: newColor })
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveModuleColors} disabled={moduleColorSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {moduleColorSaving ? 'Opslaan...' : 'Kleuren opslaan'}
            </button>
            <button
              onClick={resetModuleColors}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Standaard
            </button>
            {moduleColorMessage && (
              <span className={`text-sm ${moduleColorMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {moduleColorMessage.text}
              </span>
            )}
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Budget kleuren */}
        <div className="mb-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Budget Categorie Kleuren</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.entries(budgetColors) as [keyof BudgetColorConfig, string][]).map(([key, color]) => (
              <ColorPickerCard
                key={key}
                label={key}
                value={color}
                defaultValue={DEFAULT_BUDGET_COLORS[key]}
                onChange={newColor => {
                  setBudgetColorsLocal(prev => ({ ...prev, [key]: newColor }))
                  setBudgetConfig({ ...budgetColors, [key]: newColor })
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveBudgetColors} disabled={budgetColorSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {budgetColorSaving ? 'Opslaan...' : 'Kleuren opslaan'}
            </button>
            <button
              onClick={resetBudgetColors}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Standaard
            </button>
            {budgetColorMessage && (
              <span className={`text-sm ${budgetColorMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {budgetColorMessage.text}
              </span>
            )}
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Fase kleuren */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Soevereiniteits-Fase Kleuren</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.entries(phaseColors) as [keyof PhaseColorConfig, string][]).map(([key, color]) => (
              <ColorPickerCard
                key={key}
                label={key}
                value={color}
                defaultValue={DEFAULT_PHASE_COLORS[key]}
                onChange={newColor => {
                  setPhaseColorsLocal(prev => ({ ...prev, [key]: newColor }))
                  setPhaseConfig({ ...phaseColors, [key]: newColor })
                }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={savePhaseColors} disabled={phaseColorSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {phaseColorSaving ? 'Opslaan...' : 'Kleuren opslaan'}
            </button>
            <button
              onClick={resetPhaseColors}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Standaard
            </button>
            {phaseColorMessage && (
              <span className={`text-sm ${phaseColorMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {phaseColorMessage.text}
              </span>
            )}
          </div>
        </div>
          </div>
        )}
      </section>

      {/* ── F: Privacy & AI ──────────────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setPrivacyOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Privacy & AI</h2>
            {!privacyOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">Hoe je data wordt beschermd bij AI-verwerking</p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${privacyOpen ? 'rotate-180' : ''}`} />
        </button>

        {privacyOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 pb-6 pt-4 space-y-6">
            {/* AI Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-ed)] p-4">
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-semibold text-[var(--ink)]">AI-features inschakelen</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  {aiEnabled
                    ? 'AI-briefing, chat en gepersonaliseerd nieuws zijn actief.'
                    : 'AI is uitgeschakeld. De app werkt als puur financieel dashboard.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiEnabled}
                disabled={aiSaving}
                onClick={() => toggleAiEnabled(!aiEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wil-500 disabled:opacity-50 ${aiEnabled ? 'bg-wil-500' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Intro */}
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              TriFinity gebruikt AI om je financiële inzichten en aanbevelingen te geven. Hieronder zie je precies welke data wordt gedeeld en hoe deze wordt beschermd.
            </p>

            {/* Wat WEL wordt gedeeld */}
            <div className="rounded-xl border border-[var(--border-ed)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-wil-50">
                  <Eye className="h-4 w-4 text-wil-600" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Wat wordt gedeeld</h3>
              </div>
              <ul className="space-y-2 text-sm text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Geaggregeerde bedragen (netto vermogen, totale inkomsten/uitgaven)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Percentages en ratio&apos;s (spaarquote, vrijheidspercentage, SWR)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Budgetcategorieën en bijbehorende bedragen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Leeftijd (niet je geboortedatum)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>Huishoudtype en temporal balance level</span>
                </li>
              </ul>
            </div>

            {/* Wat NIET wordt gedeeld */}
            <div className="rounded-xl border border-[var(--border-ed)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
                  <EyeOff className="h-4 w-4 text-red-500" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Wat NOOIT wordt gedeeld</h3>
              </div>
              <ul className="space-y-2 text-sm text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>Namen (vervangen door &apos;gebruiker&apos; / &apos;partner&apos;)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>IBAN-nummers en bankrekeningen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>BSN (burgerservicenummer)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>E-mailadressen en telefoonnummers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>Adressen en postcodes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>Ruwe transactie-omschrijvingen (alleen categorie + bedrag)</span>
                </li>
              </ul>
            </div>

            {/* Dataverwerking */}
            <div className="rounded-xl border border-[var(--border-ed)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-horizon-50">
                  <Server className="h-4 w-4 text-horizon-600" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Hoe je data wordt verwerkt</h3>
              </div>
              <ul className="space-y-2 text-sm text-[var(--ink-2)]">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                  <span><strong>Zero-retention:</strong> AI-providers (Anthropic, OpenAI) bewaren je data niet na verwerking</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                  <span><strong>Geen training:</strong> je gegevens worden niet gebruikt om AI-modellen te trainen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                  <span><strong>Data minimalisatie:</strong> alleen de noodzakelijke context wordt verstuurd via automatische sanitisatie</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                  <span><strong>Versleuteld:</strong> alle communicatie verloopt via HTTPS/TLS</span>
                </li>
              </ul>
            </div>

            {/* Shield badge */}
            <div className="flex items-center gap-2 rounded-lg bg-[var(--subtle)] px-4 py-3">
              <Shield className="h-4 w-4 shrink-0 text-wil-600" />
              <p className="text-xs text-[var(--ink-3)]">
                Alle data wordt automatisch gesanitiseerd voordat het naar een AI-provider wordt verstuurd.
              </p>
            </div>

            {/* Full privacy statement link */}
            <button
              type="button"
              onClick={() => setPrivacyModalOpen(true)}
              className="flex items-center gap-2 text-sm font-medium text-wil-600 hover:text-wil-700 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Volledige privacyverklaring
            </button>
          </div>
        )}
      </section>

      {/* ── E: Gegevens & Account ────────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-red-200 bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setGegevensOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-red-50/50 transition-colors"
        >
          <div>
            <h2 className="text-xs font-semibold tracking-[0.15em] text-red-400 uppercase">Gegevens Resetten</h2>
            {!gegevensOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">Alle data permanent verwijderen en opnieuw starten</p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-red-300 transition-transform duration-200 ${gegevensOpen ? 'rotate-180' : ''}`} />
        </button>

        {gegevensOpen && (
          <div className="border-t border-red-100 px-4 sm:px-8 py-6">
            <p className="mb-4 text-sm text-[var(--ink-3)]">
              Wis al je financiële gegevens en doorloop de onboarding opnieuw.
              Dit verwijdert al je bankrekeningen, transacties, budgetten, doelen en overige data.
            </p>
            <button
              onClick={() => setShowResetDialog(true)}
              disabled={resetting}
              className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {resetting ? 'Bezig met wissen...' : 'Alle gegevens wissen'}
            </button>
            {resetError && <p className="mt-3 text-sm text-red-600">{resetError}</p>}
          </div>
        )}
      </section>

      {/* ── G: Huishouden ──────────────────────────────────────────── */}
      {hasHousehold && (
        <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
          <button
            type="button"
            onClick={() => setHuishoudenOpen(o => !o)}
            className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
          >
            <div>
              <h2 className="label-editorial text-[var(--ink-2)]">Huishouden</h2>
              {!huishoudenOpen && (
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">Privacy, verdeling, notificaties en leden</p>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${huishoudenOpen ? 'rotate-180' : ''}`} />
          </button>

          {huishoudenOpen && (
            <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 pb-6 pt-4 space-y-4">
              {/* Quick-link cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Privacy card — expands inline */}
                <button
                  type="button"
                  onClick={() => setHuishoudenPrivacySubOpen(o => !o)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                    huishoudenPrivacySubOpen
                      ? 'border-wil-300 bg-wil-50/50'
                      : 'border-[var(--border-ed)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wil-100 text-wil-700">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">Privacy</p>
                    <p className="text-xs text-[var(--ink-3)] truncate">Wat je partner kan zien</p>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform duration-200 ${huishoudenPrivacySubOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Split-modus card — links to profiel */}
                <Link
                  href="/identity/profiel#huishouden"
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] p-4 text-left transition-colors hover:bg-[var(--subtle)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    <SplitSquareVertical className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">Split-modus</p>
                    <p className="text-xs text-[var(--ink-3)] truncate">Kostenverdeling instellen</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                </Link>

                {/* Notificaties card — scrolls to partner notifications in Section A */}
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(true)
                    setTimeout(() => {
                      document.getElementById('partner-transacties')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 100)
                  }}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] p-4 text-left transition-colors hover:bg-[var(--subtle)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-horizon-100 text-horizon-700">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">Notificaties</p>
                    <p className="text-xs text-[var(--ink-3)] truncate">Partner transactie-meldingen</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                </button>

                {/* Leden card — links to profiel */}
                <Link
                  href="/identity/profiel#huishouden"
                  className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] p-4 text-left transition-colors hover:bg-[var(--subtle)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink)]">Leden</p>
                    <p className="text-xs text-[var(--ink-3)] truncate">Leden beheren en uitnodigen</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
                </Link>
              </div>

              {/* Privacy sub-section — expands inline when Privacy card is clicked */}
              {huishoudenPrivacySubOpen && (
                <div className="rounded-xl border border-wil-200 bg-wil-50/30 p-4 sm:p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Shield className="mt-0.5 h-5 w-5 text-wil-600 shrink-0" />
                    <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                      Stel per categorie in welke financiële gegevens je partner kan zien.
                      Dit geldt alleen voor hoe jouw data wordt getoond aan je partner.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4 rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--paper)]">
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-wil-600" />
                      <span className="text-xs text-[var(--ink-2)]"><strong>Volledig</strong> — alle details zichtbaar</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs text-[var(--ink-2)]"><strong>Totalen</strong> — alleen totaalbedragen</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs text-[var(--ink-2)]"><strong>Verborgen</strong> — volledig afgeschermd</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {([
                      { key: 'vermogen', label: 'Vermogen', description: 'Bezittingen en beleggingen' },
                      { key: 'schulden', label: 'Schulden', description: 'Leningen en schulden' },
                      { key: 'budgetten', label: 'Budgetten', description: 'Maandbudgetten en bestedingen' },
                      { key: 'transacties', label: 'Transacties', description: 'Individuele transacties' },
                      { key: 'inkomen', label: 'Inkomen', description: 'Salaris en overig inkomen' },
                    ] as const).map(cat => {
                      const currentLevel = householdPrivacy[cat.key] || 'totalen'
                      return (
                        <div key={cat.key} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h3 className="text-sm font-semibold text-[var(--ink)]">{cat.label}</h3>
                              <p className="text-xs text-[var(--ink-3)]">{cat.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {([
                              { level: 'volledig' as PrivacyLevel, label: 'Volledig', icon: Eye, color: 'wil' },
                              { level: 'totalen' as PrivacyLevel, label: 'Totalen', icon: Shield, color: 'amber' },
                              { level: 'verborgen' as PrivacyLevel, label: 'Verborgen', icon: EyeOff, color: 'red' },
                            ]).map(opt => {
                              const isActive = currentLevel === opt.level
                              const Icon = opt.icon
                              return (
                                <button
                                  key={opt.level}
                                  type="button"
                                  onClick={() => setHouseholdPrivacy(prev => ({ ...prev, [cat.key]: opt.level }))}
                                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                    isActive
                                      ? opt.color === 'wil'
                                        ? 'bg-wil-50 text-wil-700 border border-wil-300'
                                        : opt.color === 'amber'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-300'
                                        : 'bg-red-50 text-red-700 border border-red-300'
                                      : 'border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">{opt.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <button
                      onClick={saveHouseholdPrivacy}
                      disabled={householdPrivacySaving || JSON.stringify(householdPrivacy) === JSON.stringify(householdPrivacySaved)}
                      className="rounded-lg bg-wil-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:opacity-50"
                    >
                      {householdPrivacySaving ? 'Opslaan...' : 'Opslaan'}
                    </button>
                    {householdPrivacyMessage && (
                      <p className={`text-sm ${householdPrivacyMessage.type === 'success' ? 'text-wil-600' : 'text-red-600'}`}>
                        {householdPrivacyMessage.text}
                      </p>
                    )}
                    {JSON.stringify(householdPrivacy) !== JSON.stringify(householdPrivacySaved) && !householdPrivacyMessage && (
                      <p className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Weet je het zeker?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-red-600">al je financiële data</span> permanent.
              Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowResetDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowResetDialog(false)
                  setResetting(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResetting(false)
                    setResetError('Reset mislukt. Probeer opnieuw.')
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Alles wissen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy statement modal */}
      <BottomSheet
        open={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        title="Privacyverklaring"
      >
        <div className="space-y-6 px-1 pb-4">
          {/* Introductie */}
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            TriFinity hecht grote waarde aan de bescherming van je persoonsgegevens. Deze verklaring beschrijft welke gegevens we verzamelen, hoe we ze gebruiken en welke rechten je hebt.
          </p>

          {/* 1. Welke gegevens */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">1. Welke gegevens verzamelen we</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Accountgegevens:</strong> e-mailadres en versleuteld wachtwoord</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Profielgegevens:</strong> naam, geboortedatum, huishoudtype</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Financiële gegevens:</strong> bankrekeningen, transacties, budgetten, bezittingen, schulden, doelen</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Voorkeuren:</strong> widget-instellingen, kleurconfiguratie, FIRE-parameters</span>
              </li>
            </ul>
          </div>

          {/* 2. Waarheen */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">2. Waar worden je gegevens opgeslagen</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span><strong>Database:</strong> Supabase (PostgreSQL) met row-level security — alleen jij hebt toegang tot jouw data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span><strong>AI-providers:</strong> Anthropic of OpenAI ontvangen alleen geanonimiseerde, geaggregeerde financiële data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span><strong>Lokaal:</strong> sommige voorkeuren worden opgeslagen in je browser (localStorage)</span>
              </li>
            </ul>
          </div>

          {/* 3. Bewaartermijn */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">3. Hoe lang bewaren we je data</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span><strong>Financiële data:</strong> zolang je account actief is</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span><strong>AI-verwerking:</strong> zero-retention — providers bewaren je data niet na verwerking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span><strong>Na verwijdering:</strong> bij het wissen van je account worden alle gegevens permanent verwijderd</span>
              </li>
            </ul>
          </div>

          {/* 4. Jouw rechten */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">4. Jouw rechten</h3>
            <p className="mb-2 text-sm text-[var(--ink-2)]">Op grond van de AVG heb je de volgende rechten:</p>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Inzage:</strong> je kunt al je opgeslagen data bekijken in de app</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Correctie:</strong> je kunt je gegevens op elk moment aanpassen via Profiel</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Verwijdering:</strong> je kunt alle data wissen via Instellingen &gt; Gegevens Resetten</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Bezwaar:</strong> je kunt AI-verwerking uitschakelen via de AI-toggle hierboven</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span><strong>Overdraagbaarheid:</strong> je kunt je data exporteren (neem contact op)</span>
              </li>
            </ul>
          </div>

          {/* 5. Contact */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">5. Contact</h3>
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              Heb je vragen over je privacy of wil je een van je rechten uitoefenen? Neem contact op via{' '}
              <a href="mailto:privacy@trifinity.nl" className="font-medium text-wil-600 hover:text-wil-700 underline underline-offset-2">
                privacy@trifinity.nl
              </a>
            </p>
          </div>

          {/* Versie */}
          <div className="border-t border-[var(--border-ed)] pt-4">
            <p className="text-xs text-[var(--ink-4)]">
              Versie 1.0 — Laatst bijgewerkt: maart 2026
            </p>
          </div>
        </div>
      </BottomSheet>

    </div>
  )
}
