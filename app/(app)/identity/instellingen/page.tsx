'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_TYPES } from '@/lib/identity-constants'
import { ChevronRight, Shield, Eye, EyeOff, Server, FileText, Users, CalendarCheck, HandCoins, BellRing, SplitSquareVertical, Bell, UserPlus, Wallet, CreditCard, Receipt, ArrowLeftRight, Banknote, Link2 } from 'lucide-react'
import Link from 'next/link'
import { BOX3_DRAG } from '@/lib/horizon-data'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { useModuleColors, useBudgetColors, usePhaseColors, useFontTheme, usePaletteTheme, PALETTE_THEMES, type PaletteTheme } from '@/components/app/module-color-provider'
import type { FontTheme } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, DEFAULT_BUDGET_COLORS, DEFAULT_PHASE_COLORS } from '@/lib/color-palette'
import type { ModuleColorConfig, ModuleName, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import { ColorPickerCard } from '@/components/app/color-picker-card'
import {
  useCategoryTints,
  useCategoryTintPercents,
  DEFAULT_CATEGORY_TINTS,
  DEFAULT_CATEGORY_TINT_PERCENTS,
} from '@/lib/category-tints'
import { Palette, RotateCcw, Type } from 'lucide-react'
import { ExportDropdown } from '@/components/app/export-dropdown'
import { type RetirementExpenseMethod } from '@/lib/budget-utils'
import { type FireEndStrategy, STRATEGY_LABELS, parseFireStrategy } from '@/lib/fire-strategy'
import { type WithdrawalStrategyType, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { FireEndStrategyPanel } from '@/components/horizon/fire-end-strategy-panel'
import { FireRetirementExpensePanel } from '@/components/horizon/fire-retirement-expense-panel'
import { HousingStrategySection } from '@/components/identity/instellingen/housing-strategy-section'

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

// ── Tab definitions ──────────────────────────────────────────────────────
type SettingsTab = 'notificaties' | 'weergave' | 'privacy' | 'gegevens' | 'huishouden'

const BASE_TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'notificaties', label: 'Notificaties', icon: BellRing },
  { id: 'weergave', label: 'Weergave', icon: Palette },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'gegevens', label: 'Gegevens', icon: Server },
]

// ── Main page ─────────────────────────────────────────────────────────────

export default function InstellingenPage() {
  const router = useRouter()
  const supabase = createClient()

  const searchParams = useSearchParams()

  // ─ Tab state (URL-driven for deep-linking) ─
  const activeTab: SettingsTab = (searchParams.get('tab') as SettingsTab) || 'notificaties'

  const setActiveTab = useCallback((tab: SettingsTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/identity/instellingen?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  // ─ Section: Financiële toelichting ─
  const [financialContext, setFinancialContext] = useState('')
  const [financialContextSaved, setFinancialContextSaved] = useState('')
  const [contextSaving, setContextSaving] = useState(false)
  const [contextMessage, setContextMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Section: Rebalancing ─
  const [rebalanceThreshold, setRebalanceThreshold] = useState(5)
  const [rebalanceThresholdSaved, setRebalanceThresholdSaved] = useState(5)
  const [rebalanceSaving, setRebalanceSaving] = useState(false)
  const [rebalanceMessage, setRebalanceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [hasTargetAllocations, setHasTargetAllocations] = useState(false)

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
    recommendation: true, insight: true, levelup: true, holding_alert: true,
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

  // ─ Section C: FIRE Instellingen ─
  const [expectedReturn, setExpectedReturn] = useState(7)
  const [inflationRate, setInflationRate] = useState(2)
  const [box3Method, setBox3Method] = useState<'forfaitair' | 'werkelijk'>('forfaitair')
  const [marginaalTarief, setMarginaalTarief] = useState<'auto' | '0.3697' | '0.4950'>('auto')
  const [paramSaving, setParamSaving] = useState(false)
  const [paramMessage, setParamMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [retirementMethod, setRetirementMethod] = useState<RetirementExpenseMethod>('essential_budgets')
  const [retirementCustomAmount, setRetirementCustomAmount] = useState<string>('')
  const [fireEndStrategy, setFireEndStrategy] = useState<FireEndStrategy>('perpetual')
  const [fireEndAge, setFireEndAge] = useState<string>('90')
  const [fireLegacyAmount, setFireLegacyAmount] = useState<string>('')
  const [fireSaving, setFireSaving] = useState(false)
  const [fireMessage, setFireMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Withdrawal strategy ─
  const [withdrawalStrategy, setWithdrawalStrategy] = useState<WithdrawalStrategyType>('static')
  const [guardrailFloor, setGuardrailFloor] = useState<string>('80')
  const [guardrailCeiling, setGuardrailCeiling] = useState<string>('120')
  const [guardrailCutStep, setGuardrailCutStep] = useState<string>('10')
  const [guardrailRaiseStep, setGuardrailRaiseStep] = useState<string>('10')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsMessage, setWsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─ Section D: Weergave ─
  const { fontTheme, setFontTheme } = useFontTheme()
  const { paletteTheme, setPaletteTheme } = usePaletteTheme()
  const { setConfig } = useModuleColors()
  const { setBudgetConfig } = useBudgetColors()
  const { setPhaseConfig } = usePhaseColors()
  const [categoryTints, setCategoryTints] = useCategoryTints()
  const [categoryTintPercents, setCategoryTintPercents] = useCategoryTintPercents()
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

  // ─ Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [notifData, profileData] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key', `notifications_preferences_${user.id}`).maybeSingle(),
        supabase.from('profiles').select(
          'expected_return, inflation_rate, box3_method, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, module_colors, budget_colors, phase_colors, typography_theme, ai_enabled, rebalance_threshold, financial_context'
        ).eq('id', user.id).single(),
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

      // Load marginaal_tarief from parameters API (resilient to missing DB column)
      try {
        const paramRes = await fetch('/api/parameters')
        if (paramRes.ok) {
          const paramData = await paramRes.json()
          if (paramData.marginaal_tarief === 0.3697) setMarginaalTarief('0.3697')
          else if (paramData.marginaal_tarief === 0.4950) setMarginaalTarief('0.4950')
          else setMarginaalTarief('auto')
        }
      } catch { /* ignore */ }

      // FIRE parameters
      const d = profileData.data
      if (d) {
        if (d.expected_return != null) setExpectedReturn(Math.round(d.expected_return * 1000) / 10)
        if (d.inflation_rate != null) setInflationRate(Math.round(d.inflation_rate * 1000) / 10)
        if (d.box3_method === 'werkelijk') setBox3Method('werkelijk')
        if (d.retirement_expense_method) setRetirementMethod(d.retirement_expense_method as RetirementExpenseMethod)
        if (d.retirement_expense_custom_amount) setRetirementCustomAmount(String(d.retirement_expense_custom_amount))
        // Use fire-settings API which handles app_settings fallback for pensioen
        try {
          const fsRes = await fetch('/api/fire-settings')
          if (fsRes.ok) {
            const fsData = await fsRes.json()
            setFireEndStrategy(fsData.fire_end_strategy as FireEndStrategy)
            setFireEndAge(String(fsData.fire_end_age ?? 90))
            if (fsData.fire_legacy_amount) setFireLegacyAmount(String(fsData.fire_legacy_amount))
          } else {
            // Fallback to profile data if API fails
            const fs = parseFireStrategy(d)
            setFireEndStrategy(fs.strategy)
            if (fs.endAge) setFireEndAge(String(fs.endAge))
            if (fs.legacyAmount) setFireLegacyAmount(String(fs.legacyAmount))
          }
        } catch {
          // Fallback to profile data if fetch fails
          const fs = parseFireStrategy(d)
          setFireEndStrategy(fs.strategy)
          if (fs.endAge) setFireEndAge(String(fs.endAge))
          if (fs.legacyAmount) setFireLegacyAmount(String(fs.legacyAmount))
        }

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

        // Rebalancing threshold
        if (d.rebalance_threshold != null) {
          const th = Number(d.rebalance_threshold)
          setRebalanceThreshold(th)
          setRebalanceThresholdSaved(th)
        }

        // Financial context
        if (d.financial_context) {
          setFinancialContext(d.financial_context as string)
          setFinancialContextSaved(d.financial_context as string)
        }
      }

      // Check if user has target allocations (progressive disclosure)
      try {
        const { count } = await supabase
          .from('target_allocations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
        setHasTargetAllocations((count ?? 0) > 0)
      } catch { /* table may not exist */ }

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

      // Withdrawal strategy
      try {
        const wsRes = await fetch('/api/withdrawal-strategy')
        if (wsRes.ok) {
          const wsData = await wsRes.json()
          setWithdrawalStrategy(wsData.withdrawal_strategy ?? 'static')
          setGuardrailFloor(String(Math.round((wsData.guardrail_floor ?? 0.80) * 100)))
          setGuardrailCeiling(String(Math.round((wsData.guardrail_ceiling ?? 1.20) * 100)))
          setGuardrailCutStep(String(Math.round((wsData.guardrail_cut_step ?? 0.10) * 100)))
          setGuardrailRaiseStep(String(Math.round((wsData.guardrail_raise_step ?? 0.10) * 100)))
        }
      } catch { /* defaults are fine */ }

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
          box3_method: box3Method,
          marginaal_tarief: marginaalTarief === 'auto' ? null : Number(marginaalTarief),
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
  }, [expectedReturn, inflationRate, box3Method, marginaalTarief])

  const saveFireSettings = useCallback(async () => {
    setFireSaving(true)
    setFireMessage(null)
    try {
      const res = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retirement_expense_method: retirementMethod,
          retirement_expense_custom_amount: retirementCustomAmount ? Number(retirementCustomAmount) : null,
          fire_end_strategy: fireEndStrategy,
          fire_end_age: Number(fireEndAge) || 90,
          fire_legacy_amount: fireLegacyAmount ? Number(fireLegacyAmount) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      setFireMessage({ type: 'success', text: 'FIRE instellingen opgeslagen!' })
      setTimeout(() => setFireMessage(null), 3000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt. Probeer opnieuw.'
      setFireMessage({ type: 'error', text: msg })
    }
    setFireSaving(false)
  }, [retirementMethod, retirementCustomAmount, fireEndStrategy, fireEndAge, fireLegacyAmount])

  const saveWithdrawalStrategy = useCallback(async () => {
    setWsSaving(true)
    setWsMessage(null)
    try {
      const res = await fetch('/api/withdrawal-strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawal_strategy: withdrawalStrategy,
          guardrail_floor: Number(guardrailFloor) / 100,
          guardrail_ceiling: Number(guardrailCeiling) / 100,
          guardrail_cut_step: Number(guardrailCutStep) / 100,
          guardrail_raise_step: Number(guardrailRaiseStep) / 100,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setWsMessage({ type: 'error', text: d.error ?? 'Opslaan mislukt' })
      } else {
        setWsMessage({ type: 'success', text: 'Onttrekkingsstrategie opgeslagen' })
        setTimeout(() => setWsMessage(null), 3000)
      }
    } catch {
      setWsMessage({ type: 'error', text: 'Netwerkfout — probeer opnieuw' })
    }
    setWsSaving(false)
  }, [withdrawalStrategy, guardrailFloor, guardrailCeiling, guardrailCutStep, guardrailRaiseStep])

  // ─ Section: Rebalancing handler ──────────────────────────────────────────
  const saveRebalanceThreshold = useCallback(async () => {
    setRebalanceSaving(true)
    setRebalanceMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase.from('profiles').update({ rebalance_threshold: rebalanceThreshold }).eq('id', user.id)
      if (error) throw error
      setRebalanceThresholdSaved(rebalanceThreshold)
      setRebalanceMessage({ type: 'success', text: 'Drempel opgeslagen!' })
      setTimeout(() => setRebalanceMessage(null), 3000)
    } catch {
      setRebalanceMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setRebalanceSaving(false)
  }, [supabase, rebalanceThreshold])

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

  // ─ Section: Financiële toelichting handler ────────────────────────────────
  const saveFinancialContext = useCallback(async () => {
    setContextSaving(true)
    setContextMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({ financial_context: financialContext || null })
        .eq('id', user.id)
      if (error) throw error
      setFinancialContextSaved(financialContext)
      setContextMessage({ type: 'success', text: 'Toelichting opgeslagen' })
      setTimeout(() => setContextMessage(null), 3000)
    } catch {
      setContextMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setContextSaving(false)
  }, [supabase, financialContext])

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
      <NavStackMeta title="Instellingen" bottomBar={{ kind: 'tabs' }} />
      {/* Editorial header — blueprint Type 8 (Settings) */}
      <header className="mb-5 sm:mb-8 space-y-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Identiteit · voorkeuren
        </div>
        <h1
          className="font-bold text-[28px] tracking-[-0.02em]"
          style={{ fontFamily: 'var(--font-playfair, serif)', letterSpacing: '-0.03em' }}
        >
          Maak het{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            jouw
          </em>{' '}
          TriFinity
        </h1>
        <p
          className="italic text-[14px] leading-snug max-w-[60ch] text-[var(--ink-2)] pl-4 mt-2"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Modules, notificaties, berekeningen, weergave en gegevensbeheer.
        </p>
      </header>

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

      {/* ── Financiële toelichting ────────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <button
          type="button"
          onClick={() => setToelichtingOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Financiële toelichting</h2>
            {!toelichtingOpen && (
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {financialContext ? `${financialContext.length} tekens` : 'Nog niet ingevuld'}
              </p>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${toelichtingOpen ? 'rotate-180' : ''}`} />
        </button>

        {toelichtingOpen && (
          <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 pb-6 pt-4 space-y-4">
            <p className="text-xs text-[var(--ink-3)] leading-relaxed">
              Beschrijf je financiële situatie in eigen woorden. Deze tekst wordt gebruikt als extra context voor het personaliseren van je nieuws.
            </p>

            <div>
              <textarea
                value={financialContext}
                onChange={e => {
                  if (e.target.value.length <= 1000) setFinancialContext(e.target.value)
                }}
                placeholder="Bijv. ik ben zzp'er in de IT, spaar maandelijks ~€1.500, heb een hypotheek op mijn appartement en beleg via DeGiro..."
                rows={5}
                className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-y"
              />
              <div className="mt-1 flex justify-end">
                <span className={`text-xs tabular-nums ${financialContext.length >= 950 ? 'text-amber-600' : 'text-[var(--ink-4)]'}`}>
                  {financialContext.length} / 1.000
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveFinancialContext}
                disabled={contextSaving || financialContext === financialContextSaved}
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {contextSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              {contextMessage && (
                <span className={`text-sm ${contextMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {contextMessage.text}
                </span>
              )}
              {financialContext !== financialContextSaved && !contextMessage && (
                <span className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── C: FIRE Instellingen — verplaatst naar /horizon ────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <Link
          href="/horizon"
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">FIRE Instellingen</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              Verplaatst naar Horizon — wijzig rendement, inflatie en strategie direct bij je projectie.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        </Link>
      </section>

      {/* Old Section C removed — FIRE settings now on /horizon. See horizon-fire-params-panel.tsx */}
      {/* @dead-code-start: original accordion with sliders, kassabon, strategy, withdrawal
          All this functionality moved to HorizonFireParamsPanel on the /horizon page.
          Variables still declared above (fireOpen, expectedReturn, etc.) kept for TS compat. */}
      {false && (<button
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

        {/* Box 3 berekeningsmethode */}
        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Box 3 berekeningsmethode</p>
          <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
            Hoe wordt Box 3 belasting berekend in je vermogensprognose?
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              {
                value: 'forfaitair' as const,
                label: 'Forfaitair rendement',
                subtitle: 'Wettelijk fictief rendement per vermogenscategorie (standaard)',
              },
              {
                value: 'werkelijk' as const,
                label: 'Werkelijk rendement',
                subtitle: 'Belasting op je daadwerkelijke verwacht rendement per asset',
              },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBox3Method(opt.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
                  box3Method === opt.value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-[var(--border-md)] text-[var(--ink-2)] hover:border-zinc-400'
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className={`text-xs mt-0.5 ${box3Method === opt.value ? 'text-zinc-300' : 'text-[var(--ink-3)]'}`}>
                  {opt.subtitle}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
            {box3Method === 'forfaitair'
              ? 'Bij forfaitair rendement gebruikt de Belastingdienst een vast percentage (1,28% spaargeld, 6,00% beleggingen in 2026). Dit kan hoger of lager zijn dan je werkelijke rendement.'
              : 'Bij werkelijk rendement wordt je daadwerkelijke rendement per asset gebruikt. Dit is nauwkeuriger maar nog niet wettelijk ingevoerd — gebruik dit voor vergelijking.'
            }
          </p>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Marginaal IB-tarief */}
        <div className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Marginaal belastingtarief</p>
          <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
            Je marginale IB-tarief bepaalt het voordeel van hypotheekrenteaftrek en andere Box 1-aftrekposten.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              {
                value: 'auto' as const,
                label: 'Automatisch',
                subtitle: 'Afgeleid uit je netto maandinkomen',
              },
              {
                value: '0.3697' as const,
                label: '36,97%',
                subtitle: 'Schijf 1 — t/m €75.518 bruto',
              },
              {
                value: '0.4950' as const,
                label: '49,50%',
                subtitle: 'Schijf 2 — boven €75.518 bruto',
              },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMarginaalTarief(opt.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
                  marginaalTarief === opt.value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-[var(--border-md)] text-[var(--ink-2)] hover:border-zinc-400'
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className={`text-xs mt-0.5 ${marginaalTarief === opt.value ? 'text-zinc-300' : 'text-[var(--ink-3)]'}`}>
                  {opt.subtitle}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3 font-sans text-[11px] text-[var(--ink-3)]">
            {marginaalTarief === 'auto'
              ? 'Het tarief wordt automatisch bepaald op basis van je netto maandinkomen. Netto > €4.200/mnd = 49,50%, anders 36,97%.'
              : marginaalTarief === '0.3697'
                ? 'Schijf 1-tarief (36,97%) geldt voor belastbaar inkomen tot €75.518 per jaar (2025).'
                : 'Schijf 2-tarief (49,50%) geldt voor belastbaar inkomen boven €75.518 per jaar (2025).'
            }
          </p>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Retirement expense method — herbruikt als FireRetirementExpensePanel
            in components/horizon/. Synchroniseert lokale state via adapter. */}
        <FireRetirementExpensePanel
          value={{ method: retirementMethod, customAmount: retirementCustomAmount }}
          onChange={next => {
            setRetirementMethod(next.method)
            setRetirementCustomAmount(next.customAmount)
          }}
        />

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* FIRE Eindstrategie — herbruikt als FireEndStrategyPanel in
            components/horizon/. Synchroniseert lokale state via adapter. */}
        <FireEndStrategyPanel
          value={{ strategy: fireEndStrategy, endAge: fireEndAge, legacyAmount: fireLegacyAmount }}
          onChange={next => {
            setFireEndStrategy(next.strategy)
            setFireEndAge(next.endAge)
            setFireLegacyAmount(next.legacyAmount)
          }}
        />

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

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Eigen woning in FIRE-pot — strategie + parameters */}
        <HousingStrategySection />

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Onttrekkingsstrategie */}
        <div id="onttrekking" className="mb-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Onttrekkingsstrategie</p>
          <p className="mb-4 font-sans text-sm text-[var(--ink-3)]">
            Hoe neem je vermogen op na FIRE? Dit bepaalt hoe je jaarlijkse opname reageert op marktschommelingen.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              {
                value: 'static' as WithdrawalStrategyType,
                label: 'Vast (SWR)',
                subtitle: 'Vaste jaarlijkse opname op basis van je SWR — de klassieke 4%-regel.',
              },
              {
                value: 'guardrails' as WithdrawalStrategyType,
                label: 'Guardrails',
                subtitle: 'Guyton-Klinger: verlaag of verhoog je opname binnen grenzen, afhankelijk van portfolioprestatie.',
              },
              {
                value: 'vpw' as WithdrawalStrategyType,
                label: 'VPW',
                subtitle: 'Variable Percentage Withdrawal: elk jaar herberekend op basis van levensverwachting en vermogen.',
              },
              {
                value: 'bucket' as WithdrawalStrategyType,
                label: 'Bucket',
                subtitle: 'Drie-emmer strategie: cash (1-2 jaar), obligaties (3-5 jaar), groei (6+ jaar). Hervulling vanuit groei-emmer.',
              },
            ]).map(opt => {
              const isSelected = withdrawalStrategy === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWithdrawalStrategy(opt.value)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    isSelected ? 'border-zinc-900 bg-zinc-50' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                  }`}
                >
                  <span className={`text-sm font-semibold ${isSelected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                    {opt.label}
                  </span>
                  <p className="mt-1 text-xs text-[var(--ink-3)]">{opt.subtitle}</p>
                </button>
              )
            })}
          </div>

          {/* Guardrails extra velden */}
          {withdrawalStrategy === 'guardrails' && (
            <div className="mt-4 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Guardrail parameters</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Floor (%)</label>
                  <input
                    type="number" min={50} max={200} step={1} value={guardrailFloor}
                    onChange={e => setGuardrailFloor(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-white px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
                  />
                  <p className="mt-1 text-[10px] text-[var(--ink-4)]">Minimale opname als % van basis</p>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Ceiling (%)</label>
                  <input
                    type="number" min={50} max={200} step={1} value={guardrailCeiling}
                    onChange={e => setGuardrailCeiling(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-white px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
                  />
                  <p className="mt-1 text-[10px] text-[var(--ink-4)]">Maximale opname als % van basis</p>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Verlagingsstap (%)</label>
                  <input
                    type="number" min={1} max={50} step={1} value={guardrailCutStep}
                    onChange={e => setGuardrailCutStep(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-white px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
                  />
                  <p className="mt-1 text-[10px] text-[var(--ink-4)]">Stap omlaag bij slechte returns</p>
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Verhogingsstap (%)</label>
                  <input
                    type="number" min={1} max={50} step={1} value={guardrailRaiseStep}
                    onChange={e => setGuardrailRaiseStep(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-white px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-zinc-500"
                  />
                  <p className="mt-1 text-[10px] text-[var(--ink-4)]">Stap omhoog bij goede returns</p>
                </div>
              </div>
            </div>
          )}

          {/* VPW info */}
          {withdrawalStrategy === 'vpw' && (
            <div className="mt-4 rounded-xl border border-dashed border-horizon-300 bg-horizon-50/50 p-4">
              <p className="font-sans text-sm text-horizon-700">
                <strong>Variable Percentage Withdrawal</strong> herberekent elk jaar je opnamepercentage op basis van je resterende levensverwachting en actuele portfoliowaarde. Je neemt relatief meer op naarmate je ouder wordt, waardoor je vermogen efficiënter wordt benut.
              </p>
            </div>
          )}

          {/* Bucket info */}
          {withdrawalStrategy === 'bucket' && (
            <div className="mt-4 rounded-xl border border-dashed border-horizon-300 bg-horizon-50/50 p-4">
              <p className="font-sans text-sm text-horizon-700">
                <strong>Bucket-strategie</strong> verdeelt je vermogen over drie emmers: <strong>cash</strong> (1-2 jaar levenskosten), <strong>obligaties</strong> (3-5 jaar), en <strong>groei</strong> (aandelen, 6+ jaar). Je leeft van de cash-emmer en vult die periodiek aan vanuit de groei-emmer bij gunstige markten.
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button" onClick={saveWithdrawalStrategy} disabled={wsSaving}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {wsSaving ? 'Opslaan...' : 'Strategie opslaan'}
            </button>
            {wsMessage && (
              <span className={`text-sm ${wsMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {wsMessage.text}
              </span>
            )}
          </div>
        </div>
          </div>
        )}
      </section>)}

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

        {/* Achtergrondkleur — palet-thema */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-[var(--ink-3)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Achtergrondkleur</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.entries(PALETTE_THEMES) as [PaletteTheme, typeof PALETTE_THEMES[PaletteTheme]][]).map(([id, theme]) => {
              const active = paletteTheme === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaletteTheme(id)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    active ? 'border-zinc-900' : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                  }`}
                  style={{ background: theme.bg }}
                  aria-pressed={active}
                >
                  {/* Voorbeeld: page + paper-kaart + accent-streep */}
                  <div className="flex items-start gap-2">
                    <div
                      className="h-12 w-16 shrink-0 border"
                      style={{ background: theme.paper, borderColor: theme.borderEd }}
                    >
                      <div className="h-1 w-full" style={{ background: theme.borderMd }} />
                      <div className="px-1.5 py-1">
                        <div className="h-1 w-8 rounded-sm" style={{ background: theme.borderEd }} />
                        <div className="mt-1 h-1 w-10 rounded-sm" style={{ background: theme.subtle }} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm font-bold tracking-tight text-[var(--ink)]"
                        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                      >
                        {theme.label}
                      </p>
                      <p
                        className="mt-0.5 italic text-[11px] text-[var(--ink-3)] leading-tight"
                        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                      >
                        {theme.description}
                      </p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] font-mono text-[var(--ink-4)] tabular-nums">
                        {theme.bg}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <p
            className="mt-3 italic text-[12px] text-[var(--ink-3)] leading-snug"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Wijziging gaat direct in en wordt lokaal opgeslagen op dit apparaat.
          </p>
        </div>

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

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

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        {/* Categorie-kaart tinten — twee zones rond de breuklijn op /core */}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Categoriekaart-tinten</p>
          <p className="mb-3 text-[11px] italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
            Kleuren van de twee zones rond de breuklijn op de Kern-categoriekaarten. Boven en onder de lijn krijgen elk een eigen tint; de breuklijn zelf blijft papierkleurig.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ColorPickerCard
              label="Bezittingen — boven"
              sublabel={`${categoryTintPercents.assetAbove}% over papier`}
              value={categoryTints.assetAbove}
              defaultValue={DEFAULT_CATEGORY_TINTS.assetAbove}
              onChange={(hex) => setCategoryTints({ ...categoryTints, assetAbove: hex })}
            />
            <ColorPickerCard
              label="Bezittingen — onder"
              sublabel={`${categoryTintPercents.assetBelow}% over papier`}
              value={categoryTints.assetBelow}
              defaultValue={DEFAULT_CATEGORY_TINTS.assetBelow}
              onChange={(hex) => setCategoryTints({ ...categoryTints, assetBelow: hex })}
            />
            <ColorPickerCard
              label="Schulden — boven"
              sublabel={`${categoryTintPercents.debtAbove}% over papier`}
              value={categoryTints.debtAbove}
              defaultValue={DEFAULT_CATEGORY_TINTS.debtAbove}
              onChange={(hex) => setCategoryTints({ ...categoryTints, debtAbove: hex })}
            />
            <ColorPickerCard
              label="Schulden — onder"
              sublabel={`${categoryTintPercents.debtBelow}% over papier`}
              value={categoryTints.debtBelow}
              defaultValue={DEFAULT_CATEGORY_TINTS.debtBelow}
              onChange={(hex) => setCategoryTints({ ...categoryTints, debtBelow: hex })}
            />
          </div>

          {/* Transparantie-sliders per zone */}
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Transparantie per zone</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['assetAbove', 'Bezittingen — boven'],
                ['assetBelow', 'Bezittingen — onder'],
                ['debtAbove', 'Schulden — boven'],
                ['debtBelow', 'Schulden — onder'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
                  <span className="flex-1 text-xs text-[var(--ink-2)]">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.5}
                    value={categoryTintPercents[key]}
                    onChange={(e) =>
                      setCategoryTintPercents({
                        ...categoryTintPercents,
                        [key]: Number(e.target.value),
                      })
                    }
                    className="h-1 flex-1 cursor-pointer accent-[var(--ink-2)]"
                  />
                  <span className="w-10 text-right font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                    {categoryTintPercents[key].toFixed(1)}%
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCategoryTints(DEFAULT_CATEGORY_TINTS)
                setCategoryTintPercents(DEFAULT_CATEGORY_TINT_PERCENTS)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Standaard
            </button>
            <span className="text-[11px] italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
              Direct opgeslagen — verschijnen meteen op /core.
            </span>
          </div>
        </div>
          </div>
        )}
      </section>

      {/* ── Rebalancing (verplaatst naar /core/assets) ────────────────── */}
      {hasTargetAllocations && (
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <Link
          href="/core/assets"
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">Rebalancing</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">Verplaatst naar Bezittingen — open de rebalancing-sectie daar</p>
          </div>
          <ArrowLeftRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        </Link>
      </section>
      )}

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
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">Transparantie over hoe je gegevens worden gebruikt</p>
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

            {/* Normalizing intro */}
            <div className="flex items-start gap-3 rounded-xl bg-wil-50/40 p-4">
              <Shield className="mt-0.5 h-5 w-5 text-wil-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">Jij bent eigenaar van je data</p>
                <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
                  TriFinity gebruikt AI om je financiële inzichten te geven. Hieronder zie je
                  precies welke informatie wordt gedeeld — en wat altijd privé blijft.
                  Je kunt AI op elk moment uitschakelen.
                </p>
              </div>
            </div>

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
                <h3 className="text-sm font-semibold text-[var(--ink)]">Wat altijd privé blijft</h3>
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

      {/* ── F: Externe koppelingen ─────────────────────────────────── */}
      <section className="mb-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <Link
          href="/identity/koppelingen"
          className="flex w-full items-center justify-between px-4 sm:px-8 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] text-[var(--ink-2)]">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="label-editorial text-[var(--ink-2)]">Externe koppelingen</h2>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">Crypto-exchanges, wallets, brokers en bankrekeningen — beheer op de Koppelingen-pagina</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        </Link>
      </section>

      {/* ── Data Export ─────────────────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 card-editorial overflow-hidden">
        <div className="px-4 sm:px-8 py-4">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">Data Export</h2>
          <p className="mt-1 text-xs text-[var(--ink-4)]">Download je financiële gegevens als CSV-bestand</p>
          <div className="mt-3">
            <ExportDropdown />
          </div>
        </div>
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
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">Samen financieel, eigen grenzen</p>
                      <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
                        Ieder huishouden is anders — het is heel normaal om niet alles te delen.
                        Stel per categorie in wat je partner kan zien. Je kunt dit altijd aanpassen.
                      </p>
                    </div>
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
                      { key: 'vermogen', label: 'Vermogen', description: 'Bezittingen en beleggingen', icon: Wallet },
                      { key: 'schulden', label: 'Schulden', description: 'Leningen en schulden', icon: CreditCard },
                      { key: 'budgetten', label: 'Budgetten', description: 'Maandbudgetten en bestedingen', icon: Receipt },
                      { key: 'transacties', label: 'Transacties', description: 'Individuele transacties', icon: ArrowLeftRight },
                      { key: 'inkomen', label: 'Inkomen', description: 'Salaris en overig inkomen', icon: Banknote },
                    ] as const).map(cat => {
                      const currentLevel = householdPrivacy[cat.key] || 'totalen'
                      const CatIcon = cat.icon
                      return (
                        <div key={cat.key} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-wil-50">
                                <CatIcon className="h-3.5 w-3.5 text-wil-600" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-[var(--ink)]">{cat.label}</h3>
                                <p className="text-xs text-[var(--ink-3)]">{cat.description}</p>
                              </div>
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
