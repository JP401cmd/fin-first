'use client'

import { useState, useCallback, useEffect, useId, type ComponentType } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from '@/components/onboarding/speech-bubble'
import { MODULE_CATALOG, getModuleLabel, type ModuleId } from '@/lib/module-registry'
import { createClient } from '@/lib/supabase/client'
import { getDefaultBudgets } from '@/lib/budget-data'
import { BudgetAmountEditor } from '@/components/onboarding/budget-amount-editor'
import { STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import {
  BarChart3,
  Wallet,
  TrendingUp,
  Zap,
  Compass,
  Newspaper,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  List,
  ListTree,
  LayoutTemplate,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = 'bezittingen' | 'budgets' | 'horizon'

/**
 * Maps each module to the onboarding steps it requires before activation.
 * When a user enables a module they haven't gone through onboarding for,
 * we check this map to determine which steps are missing.
 */
export const MODULE_REQUIRED_STEPS: Partial<Record<ModuleId, OnboardingStep[]>> = {
  budgetteren: ['bezittingen', 'budgets'],
  vermogensregistratie: ['bezittingen'],
  aandelenregistratie: ['bezittingen'],
  toekomstplannen: ['horizon'],
  inzicht_acties: [],
}

// ── Module visual info ──────────────────────────────────────────────────────

interface ModuleInfo {
  icon: ComponentType<{ className?: string }>
  summary: string
  iconColor: string
  circleBg: string
  accentColor: string
  willText: string
}

const MODULE_INFO: Record<ModuleId, ModuleInfo> = {
  budgetteren: {
    icon: BarChart3,
    summary: 'Budgetten, cashflow en spaarquote bijhouden',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
    accentColor: 'bg-kern-400',
    willText:
      'Een budget vertaalt je inkomen naar bewuste keuzes. Elke euro die je bespaart is opgeslagen vrijheidstijd \u2014 tijd die je later kunt besteden aan wat jij echt belangrijk vindt.',
  },
  vermogensregistratie: {
    icon: Wallet,
    summary: 'Vermogen, bezittingen en schulden registreren',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
    accentColor: 'bg-kern-400',
    willText:
      'Als je je rekeningen en bezittingen toevoegt, kan ik meteen je netto vermogen en vrijheidspercentage berekenen. Heb je schulden? Dan laat ik zien hoeveel vrijheid je terugkoopt als je die aflost.',
  },
  aandelenregistratie: {
    icon: TrendingUp,
    summary: 'Beleggingsportefeuille en koersen volgen',
    iconColor: 'text-kern-600',
    circleBg: 'bg-kern-50',
    accentColor: 'bg-kern-400',
    willText:
      'Met een beleggingsrekening kan ik je portefeuille volgen, rendement berekenen en allocatie in kaart brengen.',
  },
  toekomstplannen: {
    icon: Compass,
    summary: 'FIRE-projecties, simulaties en levensgebeurtenissen',
    iconColor: 'text-horizon-600',
    circleBg: 'bg-horizon-50',
    accentColor: 'bg-horizon-400',
    willText:
      'Stel je financi\u00eble horizon in. Ik bereken wanneer je genoeg vermogen hebt voor financi\u00eble vrijheid.',
  },
  inzicht_acties: {
    icon: Zap,
    summary: 'Doelen, trends en gepersonaliseerde aanbevelingen',
    iconColor: 'text-wil-600',
    circleBg: 'bg-wil-50',
    accentColor: 'bg-wil-400',
    willText:
      'Ik analyseer je gegevens en geef gepersonaliseerde aanbevelingen om je financi\u00eble doelen te bereiken.',
  },
  nieuws: {
    icon: Newspaper,
    summary: 'Gepersonaliseerd financieel nieuws',
    iconColor: 'text-[var(--ink-2)]',
    circleBg: 'bg-[var(--subtle)]',
    accentColor: 'bg-[var(--ink-3)]',
    willText:
      'Je persoonlijke financi\u00eble krant staat klaar. Nieuws wordt automatisch gefilterd op basis van je situatie.',
  },
}

// ── Button color helpers ────────────────────────────────────────────────────

function getButtonColors(moduleId: ModuleId): string {
  switch (moduleId) {
    case 'budgetteren':
    case 'vermogensregistratie':
    case 'aandelenregistratie':
      return 'bg-kern-600 hover:bg-kern-700'
    case 'inzicht_acties':
      return 'bg-wil-600 hover:bg-wil-700'
    case 'toekomstplannen':
      return 'bg-horizon-600 hover:bg-horizon-700'
    case 'nieuws':
      return 'bg-[var(--ink)] hover:bg-[var(--ink-2)]'
    default:
      return 'bg-[var(--ink)] hover:bg-[var(--ink-2)]'
  }
}

// ── Budget template definitions ─────────────────────────────────────────────

type BudgetTemplate = 'minimalistisch' | 'nibud' | 'uitgebreid'

const BUDGET_TEMPLATES: {
  id: BudgetTemplate
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  /** Multiplier applied to default budget amounts */
  multiplier: number
}[] = [
  {
    id: 'minimalistisch',
    label: 'Minimalistisch',
    description: 'Alleen hoofdcategorie\u00ebn, geen subcategorie\u00ebn',
    icon: List,
    multiplier: 0.85,
  },
  {
    id: 'nibud',
    label: 'Nibud-standaard',
    description: 'Gebaseerd op Nibud-richtbedragen',
    icon: ListTree,
    multiplier: 1.0,
  },
  {
    id: 'uitgebreid',
    label: 'Uitgebreid',
    description: 'Alle categorie\u00ebn met subcategorie\u00ebn',
    icon: LayoutTemplate,
    multiplier: 1.15,
  },
]

// ── Life event type options ─────────────────────────────────────────────────

const LIFE_EVENT_TYPES = [
  { value: 'career', label: 'Carri\u00e8re' },
  { value: 'family', label: 'Gezin' },
  { value: 'housing', label: 'Woning' },
  { value: 'retirement', label: 'Pensioen' },
  { value: 'other', label: 'Overig' },
] as const

// ── Form state types ────────────────────────────────────────────────────────

interface BankAccountForm {
  name: string
  bank_name: string
  account_type: string
  balance: string
  has_budget_tracking: boolean
}

interface AssetForm {
  name: string
  asset_type: string
  current_value: string
  purchase_value: string
  expected_return: string
  monthly_contribution: string
  institution: string
}

interface DebtForm {
  name: string
  debt_type: string
  original_amount: string
  current_balance: string
  interest_rate: string
  monthly_payment: string
}

interface LifeEventForm {
  name: string
  event_type: string
  target_age: string
  monthly_income_change: string
  is_active: boolean
}

interface HorizonForm {
  fire_end_strategy: FireEndStrategy
  fire_end_age: string
  fire_legacy_amount: string
  retirement_expense_method: RetirementExpenseMethod
  retirement_custom_amount: string
  temporal_balance: number
  life_events: LifeEventForm[]
}

// ── Default form factories ──────────────────────────────────────────────────

function createBankAccount(overrides?: Partial<BankAccountForm>): BankAccountForm {
  return {
    name: '',
    bank_name: '',
    account_type: 'checking',
    balance: '',
    has_budget_tracking: false,
    ...overrides,
  }
}

function createAsset(overrides?: Partial<AssetForm>): AssetForm {
  return {
    name: '',
    asset_type: 'savings',
    current_value: '',
    purchase_value: '',
    expected_return: '',
    monthly_contribution: '',
    institution: '',
    ...overrides,
  }
}

function createDebt(): DebtForm {
  return {
    name: '',
    debt_type: 'personal_loan',
    original_amount: '',
    current_balance: '',
    interest_rate: '',
    monthly_payment: '',
  }
}

function createLifeEvent(): LifeEventForm {
  return {
    name: '',
    event_type: 'career',
    target_age: '',
    monthly_income_change: '',
    is_active: true,
  }
}

function createHorizonDefaults(): HorizonForm {
  return {
    fire_end_strategy: 'deplete',
    fire_end_age: '90',
    fire_legacy_amount: '',
    retirement_expense_method: 'essential_budgets',
    retirement_custom_amount: '',
    temporal_balance: 3,
    life_events: [],
  }
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  moduleId: ModuleId
  completedSteps: string[]
  open: boolean
  onClose: () => void
  onComplete: (newSteps: string[]) => void
  /** Active modules for the current user (needed for expense method availability) */
  activeModules?: ModuleId[]
  /** User's net monthly income (for budget amount calculations). Falls back to 2500. */
  netIncome?: number
}

// ── Component ───────────────────────────────────────────────────────────────

export function ModuleActivationModal({
  moduleId,
  completedSteps,
  open,
  onClose,
  onComplete,
  activeModules = [],
  netIncome = 2500,
}: Props) {
  const requiredSteps = MODULE_REQUIRED_STEPS[moduleId] ?? []
  const missingSteps = requiredSteps.filter((s) => !completedSteps.includes(s))

  // Nothing missing — immediately complete
  if (missingSteps.length === 0) {
    if (open) {
      queueMicrotask(() => onComplete([]))
    }
    return null
  }

  const info = MODULE_INFO[moduleId]
  const moduleDef = MODULE_CATALOG.find((m) => m.id === moduleId)
  const moduleLabel = getModuleLabel(moduleId)
  const buttonColors = getButtonColors(moduleId)

  return (
    <BottomSheet open={open} onClose={onClose} title={moduleLabel} size="lg">
      {/* Content flows directly inside BottomSheet's own scroll container */}
      <div className="px-5 py-5 space-y-5">
        {/* Header: icon + module name + summary */}
        <ModuleHeader info={info} label={moduleLabel} inDevelopment={moduleDef?.inDevelopment} />

        {/* Will's speech bubble */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <WillDots size={32} state="talking" />
          </div>
          <SpeechBubble>{info.willText}</SpeechBubble>
        </div>

        {/* Form content for missing steps */}
        <StepForms
          moduleId={moduleId}
          missingSteps={missingSteps}
          activeModules={activeModules}
          buttonColors={buttonColors}
          onComplete={onComplete}
          netIncome={netIncome}
        />
      </div>
    </BottomSheet>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function ModuleHeader({ info, label, inDevelopment }: { info: ModuleInfo; label: string; inDevelopment?: boolean }) {
  const Icon = info.icon
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center ${info.circleBg}`}
      >
        <Icon className={`h-5 w-5 ${info.iconColor}`} />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-[var(--ink)] truncate">
          {label}
          {inDevelopment && (
            <span className="ml-1.5 inline-flex align-middle text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              In ontwikkeling
            </span>
          )}
        </h3>
        <p className="text-xs text-[var(--ink-3)] leading-snug">{info.summary}</p>
      </div>
    </div>
  )
}

// ── Step forms dispatcher ───────────────────────────────────────────────────

function StepForms({
  moduleId,
  missingSteps,
  activeModules,
  buttonColors,
  onComplete,
  netIncome,
}: {
  moduleId: ModuleId
  missingSteps: OnboardingStep[]
  activeModules: ModuleId[]
  buttonColors: string
  onComplete: (newSteps: string[]) => void
  netIncome: number
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Bezittingen state (only initialized when step is present) ──
  const hasBezittingen = missingSteps.includes('bezittingen')

  // ── Existing bank accounts (for budgetteren: select or create) ──
  const [existingAccounts, setExistingAccounts] = useState<
    { id: string; name: string; bank_name: string | null; account_type: string; balance: number; linked_asset_id: string | null }[]
  >([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  useEffect(() => {
    if (!hasBezittingen || moduleId !== 'budgetteren') return
    const supabase = createClient()
    supabase
      .from('bank_accounts')
      .select('id, name, bank_name, account_type, balance, linked_asset_id')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setExistingAccounts(data)
          // Pre-select first checking account
          const checking = data.find((a) => a.account_type === 'checking')
          if (checking) setSelectedAccountId(checking.id)
        } else {
          // No accounts — go straight to create form
          setCreatingNew(true)
        }
      })
  }, [hasBezittingen, moduleId])

  const [bankAccounts, setBankAccounts] = useState<BankAccountForm[]>(() => {
    if (!hasBezittingen) return []
    if (moduleId === 'budgetteren') {
      return [createBankAccount({ account_type: 'checking' })]
    }
    if (moduleId === 'vermogensregistratie') {
      return [createBankAccount()]
    }
    // aandelenregistratie has no bank account form
    return []
  })
  const [assets, setAssets] = useState<AssetForm[]>(() => {
    if (!hasBezittingen) return []
    if (moduleId === 'aandelenregistratie') {
      return [createAsset({ asset_type: 'investment' })]
    }
    if (moduleId === 'vermogensregistratie') {
      return [createAsset()]
    }
    return []
  })
  const [debts, setDebts] = useState<DebtForm[]>(() => {
    if (!hasBezittingen) return []
    if (moduleId === 'vermogensregistratie') {
      return [createDebt()]
    }
    return []
  })

  // ── Accordion state for vermogensregistratie ──
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    bank: true,
    assets: false,
    debts: false,
  })

  // ── Budget state (only for budgetteren) ──
  const hasBudgets = missingSteps.includes('budgets')
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null)
  const [budgetAmounts, setBudgetAmounts] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {}
    const budgets = getDefaultBudgets()
    for (const b of budgets) {
      defaults[b.slug] = b.default_limit
      if (b.children) {
        for (const c of b.children) {
          defaults[c.slug] = c.default_limit
        }
      }
    }
    return defaults
  })

  // ── Horizon state (only for toekomstplannen) ──
  const hasHorizon = missingSteps.includes('horizon')
  const [horizon, setHorizon] = useState<HorizonForm>(createHorizonDefaults)

  // Whether the essential_budgets method is available (needs budgetteren module active)
  const hasBudgetModule = activeModules.includes('budgetteren')

  // ── Toggle accordion sections ──
  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  // ── Handle template selection ──
  const handleTemplateSelect = useCallback(
    (template: BudgetTemplate) => {
      setSelectedTemplate(template)
      const multiplier = BUDGET_TEMPLATES.find((t) => t.id === template)?.multiplier ?? 1
      const newAmounts: Record<string, number> = {}
      const budgets = getDefaultBudgets()
      for (const b of budgets) {
        newAmounts[b.slug] = Math.round(b.default_limit * multiplier)
        if (b.children) {
          for (const c of b.children) {
            newAmounts[c.slug] = Math.round(c.default_limit * multiplier)
          }
        }
      }
      setBudgetAmounts(newAmounts)
    },
    [],
  )

  // ── Save handler ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    // Validate required fields before saving
    if (hasBudgets && !selectedTemplate) {
      setError('Kies eerst een budgettemplate.')
      return
    }
    if (hasBezittingen && moduleId === 'budgetteren') {
      if (!selectedAccountId && !creatingNew) {
        setError('Selecteer een rekening of maak een nieuwe aan.')
        return
      }
      if (creatingNew && !bankAccounts.some((b) => b.name.trim())) {
        setError('Vul de naam van je nieuwe rekening in.')
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      // ── Save bezittingen ──
      if (hasBezittingen) {
        // Budgetteren: either select existing or create new account
        if (moduleId === 'budgetteren') {
          if (selectedAccountId && !creatingNew) {
            // Enable budget tracking on the selected account's companion asset
            // Use ensure_companion_cash_asset to guarantee the link + tracking
            const { error: rpcErr } = await supabase.rpc('ensure_companion_cash_asset', {
              p_bank_account_id: selectedAccountId,
              p_has_budget_tracking: true,
            })
            if (rpcErr) throw rpcErr
          } else if (creatingNew) {
            // Insert new bank accounts and create companion cash assets
            const validBanks = bankAccounts.filter((b) => b.name.trim())
            if (validBanks.length > 0) {
              const { data: newBanks, error: bankErr } = await supabase
                .from('bank_accounts')
                .insert(
                  validBanks.map((b) => ({
                    user_id: user.id,
                    name: b.name.trim(),
                    bank_name: b.bank_name.trim() || null,
                    account_type: b.account_type,
                    balance: parseFloat(b.balance) || 0,
                  })),
                )
                .select('id')
              if (bankErr) throw bankErr
              // Create companion cash assets with budget tracking via DB function
              await Promise.all(
                (newBanks ?? []).map((bank) =>
                  supabase.rpc('ensure_companion_cash_asset', {
                    p_bank_account_id: bank.id,
                    p_has_budget_tracking: true,
                  }),
                ),
              )
            }
          }
        } else {
          // Other modules: insert bank accounts and create companion cash assets
          const validBanks = bankAccounts.filter((b) => b.name.trim())
          if (validBanks.length > 0) {
            const { data: newBanks, error: bankErr } = await supabase
              .from('bank_accounts')
              .insert(
                validBanks.map((b) => ({
                  user_id: user.id,
                  name: b.name.trim(),
                  bank_name: b.bank_name.trim() || null,
                  account_type: b.account_type,
                  balance: parseFloat(b.balance) || 0,
                })),
              )
              .select('id')
            if (bankErr) throw bankErr
            await Promise.all(
              (newBanks ?? []).map((bank) =>
                supabase.rpc('ensure_companion_cash_asset', {
                  p_bank_account_id: bank.id,
                  p_has_budget_tracking: false,
                }),
              ),
            )
          }
        }

        // Assets (non-budgetteren modules)
        const validAssets = assets.filter((a) => a.name.trim())
        if (validAssets.length > 0) {
          const { error: assetErr } = await supabase.from('assets').insert(
            validAssets.map((a) => ({
              user_id: user.id,
              name: a.name.trim(),
              asset_type: a.asset_type,
              current_value: parseFloat(a.current_value) || 0,
              purchase_value: parseFloat(a.purchase_value) || 0,
              expected_return: parseFloat(a.expected_return) || 0,
              monthly_contribution: parseFloat(a.monthly_contribution) || 0,
              institution: a.institution.trim() || null,
            })),
          )
          if (assetErr) throw assetErr
        }

        // Debts
        const validDebts = debts.filter((d) => d.name.trim())
        if (validDebts.length > 0) {
          const { error: debtErr } = await supabase.from('debts').insert(
            validDebts.map((d) => ({
              user_id: user.id,
              name: d.name.trim(),
              debt_type: d.debt_type,
              original_amount: parseFloat(d.original_amount) || 0,
              current_balance: parseFloat(d.current_balance) || 0,
              interest_rate: parseFloat(d.interest_rate) || 0,
              monthly_payment: parseFloat(d.monthly_payment) || 0,
            })),
          )
          if (debtErr) throw debtErr
        }
      }

      // ── Save budgets ──
      if (hasBudgets && selectedTemplate) {
        // Skip if user already has budgets (e.g. from prior setup)
        const { count } = await supabase
          .from('budgets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)

        if (!count) {
          const budgets = getDefaultBudgets()
          const multiplier =
            BUDGET_TEMPLATES.find((t) => t.id === selectedTemplate)?.multiplier ?? 1
          const now = new Date().toISOString()
          const rows: {
            user_id: string
            name: string
            slug: string
            icon: string
            description: string
            default_limit: number
            budget_type: string
            is_essential: boolean
            priority_score: number
            sort_order: number
            parent_id: null
            created_at: string
            updated_at: string
          }[] = []

          for (const b of budgets) {
            const amount = budgetAmounts[b.slug] ?? Math.round(b.default_limit * multiplier)
            rows.push({
              user_id: user.id,
              name: b.name,
              slug: b.slug,
              icon: b.icon,
              description: b.description,
              default_limit: amount,
              budget_type: b.budget_type,
              is_essential: b.is_essential,
              priority_score: b.priority_score,
              sort_order: b.sort_order,
              parent_id: null,
              created_at: now,
              updated_at: now,
            })
          }

          const { error: budgetErr } = await supabase.from('budgets').insert(rows)
          if (budgetErr) throw budgetErr
        }
      }

      // ── Save horizon settings ──
      if (hasHorizon) {
        // Save FIRE strategy + expense method via API
        const res = await fetch('/api/fire-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fire_end_strategy: horizon.fire_end_strategy,
            fire_end_age: parseInt(horizon.fire_end_age) || 90,
            fire_legacy_amount:
              horizon.fire_end_strategy === 'legacy'
                ? parseFloat(horizon.fire_legacy_amount) || null
                : null,
            retirement_expense_method: horizon.retirement_expense_method,
            retirement_expense_custom_amount:
              horizon.retirement_expense_method === 'custom_amount'
                ? parseFloat(horizon.retirement_custom_amount) || null
                : null,
          }),
        })
        if (!res.ok) throw new Error('Fout bij opslaan FIRE-instellingen')

        // Save life events
        const validEvents = horizon.life_events.filter((e) => e.name.trim() && e.target_age)
        if (validEvents.length > 0) {
          const { error: evtErr } = await supabase.from('life_events').insert(
            validEvents.map((evt) => ({
              user_id: user.id,
              name: evt.name.trim(),
              event_type: evt.event_type,
              target_age: parseInt(evt.target_age) || 65,
              monthly_income_change: parseFloat(evt.monthly_income_change) || 0,
              is_active: evt.is_active,
            })),
          )
          if (evtErr) throw evtErr
        }

        // Save temporal balance
        const { error: profErr } = await supabase
          .from('profiles')
          .update({ temporal_balance: horizon.temporal_balance })
          .eq('id', user.id)
        if (profErr) throw profErr
      }

      // All saves succeeded — mark steps as complete
      onComplete(missingSteps)
    } catch (err) {
      console.error('Module activation save error:', JSON.stringify(err, null, 2), err)
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? (err as { message: string }).message
            : 'Er ging iets mis bij het opslaan',
      )
    } finally {
      setSaving(false)
    }
  }, [
    moduleId,
    hasBezittingen,
    hasBudgets,
    hasHorizon,
    bankAccounts,
    assets,
    debts,
    selectedTemplate,
    budgetAmounts,
    horizon,
    missingSteps,
    onComplete,
    selectedAccountId,
    creatingNew,
    existingAccounts,
  ])

  // ── Skip handler ──
  const handleSkip = useCallback(() => {
    onComplete(missingSteps)
  }, [missingSteps, onComplete])

  return (
    <>
      {/* Step forms */}
      <div className="space-y-6">
        {/* ── Bezittingen step ── */}
        {hasBezittingen && (
          <BezittingenStep
            moduleId={moduleId}
            bankAccounts={bankAccounts}
            setBankAccounts={setBankAccounts}
            assets={assets}
            setAssets={setAssets}
            debts={debts}
            setDebts={setDebts}
            openSections={openSections}
            toggleSection={toggleSection}
            existingAccounts={existingAccounts}
            selectedAccountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
            creatingNew={creatingNew}
            onSetCreatingNew={setCreatingNew}
          />
        )}

        {/* ── Budgets step ── */}
        {hasBudgets && (
          <BudgetsStep
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleTemplateSelect}
            netIncome={netIncome}
            budgetAmounts={budgetAmounts}
            onChangeBudgetAmounts={setBudgetAmounts}
          />
        )}

        {/* ── Horizon step ── */}
        {hasHorizon && (
          <HorizonStep
            horizon={horizon}
            setHorizon={setHorizon}
            hasBudgetModule={hasBudgetModule}
          />
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Footer buttons */}
      <div className="border-t border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4 pb-[env(safe-area-inset-bottom,12px)] flex gap-3 mt-4">
        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="flex-1 min-h-[44px] border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50"
        >
          Later instellen
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`flex-1 min-h-[44px] px-4 py-2.5 text-sm font-medium text-white transition-colors ${buttonColors} disabled:opacity-50`}
        >
          {saving ? 'Opslaan\u2026' : 'Opslaan & activeren'}
        </button>
      </div>
    </>
  )
}

// ── Bezittingen step ────────────────────────────────────────────────────────

function BezittingenStep({
  moduleId,
  bankAccounts,
  setBankAccounts,
  assets,
  setAssets,
  debts,
  setDebts,
  openSections,
  toggleSection,
  existingAccounts = [],
  selectedAccountId,
  onSelectAccount,
  creatingNew = false,
  onSetCreatingNew,
}: {
  moduleId: ModuleId
  bankAccounts: BankAccountForm[]
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccountForm[]>>
  assets: AssetForm[]
  setAssets: React.Dispatch<React.SetStateAction<AssetForm[]>>
  debts: DebtForm[]
  setDebts: React.Dispatch<React.SetStateAction<DebtForm[]>>
  openSections: Record<string, boolean>
  toggleSection: (section: string) => void
  existingAccounts?: { id: string; name: string; bank_name: string | null; account_type: string; balance: number; linked_asset_id: string | null }[]
  selectedAccountId?: string | null
  onSelectAccount?: (id: string | null) => void
  creatingNew?: boolean
  onSetCreatingNew?: (v: boolean) => void
}) {
  const accountTypeLabel = (t: string) =>
    t === 'checking' ? 'Betaalrekening' : t === 'savings' ? 'Spaarrekening' : t === 'joint' ? 'Gezamenlijk' : t

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold text-[var(--ink)]">Bezittingen & schulden</h4>

      {/* budgetteren: select existing or create new */}
      {moduleId === 'budgetteren' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--ink-3)]">
            Kies een rekening voor budgettracking, of maak een nieuwe aan.
          </p>

          {/* Existing account cards */}
          {existingAccounts.length > 0 && !creatingNew && (
            <div className="space-y-2">
              {existingAccounts.map((acc) => {
                const selected = selectedAccountId === acc.id
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onSelectAccount?.(acc.id)}
                    className={`w-full flex items-center gap-3 border p-3 text-left transition-colors ${
                      selected
                        ? 'border-kern-500 bg-kern-50 ring-1 ring-kern-500'
                        : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        selected ? 'bg-kern-600 text-white' : 'bg-[var(--subtle)] text-[var(--ink-3)]'
                      }`}
                    >
                      {selected ? <Check className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--ink)] truncate">{acc.name}</p>
                      <p className="text-xs text-[var(--ink-3)]">
                        {acc.bank_name ? `${acc.bank_name} · ` : ''}{accountTypeLabel(acc.account_type)}
                      </p>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-[var(--ink-2)]">
                      €{acc.balance.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                    </span>
                  </button>
                )
              })}

              {/* Option to create new instead */}
              <button
                type="button"
                onClick={() => {
                  onSelectAccount?.(null)
                  onSetCreatingNew?.(true)
                }}
                className="flex w-full min-h-[44px] items-center justify-center gap-1.5 border border-dashed border-[var(--border-ed)] py-2 text-xs font-medium text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)] active:bg-[var(--subtle)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nieuwe rekening aanmaken
              </button>
            </div>
          )}

          {/* Create new form */}
          {creatingNew && (
            <div className="space-y-2">
              {existingAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onSetCreatingNew?.(false)
                    // Re-select first checking account
                    const checking = existingAccounts.find((a) => a.account_type === 'checking')
                    onSelectAccount?.(checking?.id ?? existingAccounts[0]?.id ?? null)
                  }}
                  className="text-xs text-kern-600 hover:text-kern-700 transition-colors"
                >
                  ← Bestaande rekening kiezen
                </button>
              )}
              {bankAccounts.map((ba, i) => (
                <MiniBankForm
                  key={i}
                  value={ba}
                  onChange={(updated) => {
                    setBankAccounts((prev) => prev.map((b, j) => (j === i ? updated : b)))
                  }}
                  showBudgetTracking={false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* vermogensregistratie: collapsible accordion */}
      {moduleId === 'vermogensregistratie' && (
        <div className="space-y-2">
          {/* Bank accounts section */}
          <AccordionSection
            title="Bankrekeningen"
            open={openSections.bank}
            onToggle={() => toggleSection('bank')}
          >
            {bankAccounts.map((ba, i) => (
              <div key={i} className="relative">
                <MiniBankForm
                  value={ba}
                  onChange={(updated) => {
                    setBankAccounts((prev) => prev.map((b, j) => (j === i ? updated : b)))
                  }}
                  showBudgetTracking
                />
                {bankAccounts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBankAccounts((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-2.5 text-[var(--ink-4)] hover:text-red-500 transition-colors"
                    aria-label="Verwijder rekening"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBankAccounts((prev) => [...prev, createBankAccount()])}
              className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors min-h-[44px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Rekening toevoegen
            </button>
          </AccordionSection>

          {/* Assets section */}
          <AccordionSection
            title="Bezittingen"
            open={openSections.assets}
            onToggle={() => toggleSection('assets')}
          >
            {assets.map((a, i) => (
              <div key={i} className="relative">
                <MiniAssetForm
                  value={a}
                  onChange={(updated) => {
                    setAssets((prev) => prev.map((x, j) => (j === i ? updated : x)))
                  }}
                />
                {assets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAssets((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-2.5 text-[var(--ink-4)] hover:text-red-500 transition-colors"
                    aria-label="Verwijder bezitting"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAssets((prev) => [...prev, createAsset()])}
              className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors min-h-[44px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Bezitting toevoegen
            </button>
          </AccordionSection>

          {/* Debts section */}
          <AccordionSection
            title="Schulden"
            open={openSections.debts}
            onToggle={() => toggleSection('debts')}
          >
            {debts.map((d, i) => (
              <div key={i} className="relative">
                <MiniDebtForm
                  value={d}
                  onChange={(updated) => {
                    setDebts((prev) => prev.map((x, j) => (j === i ? updated : x)))
                  }}
                />
                {debts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDebts((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 p-2.5 text-[var(--ink-4)] hover:text-red-500 transition-colors"
                    aria-label="Verwijder schuld"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDebts((prev) => [...prev, createDebt()])}
              className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors min-h-[44px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Schuld toevoegen
            </button>
          </AccordionSection>
        </div>
      )}

      {/* aandelenregistratie: single asset form defaulting to investment */}
      {moduleId === 'aandelenregistratie' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--ink-3)]">
            Voeg je beleggingsrekening toe om je portefeuille te volgen.
          </p>
          {assets.map((a, i) => (
            <MiniAssetForm
              key={i}
              value={a}
              onChange={(updated) => {
                setAssets((prev) => prev.map((x, j) => (j === i ? updated : x)))
              }}
              lockType="investment"
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Budgets step ────────────────────────────────────────────────────────────

function BudgetsStep({
  selectedTemplate,
  onSelectTemplate,
  budgetAmounts,
  onChangeBudgetAmounts,
  netIncome,
}: {
  selectedTemplate: BudgetTemplate | null
  onSelectTemplate: (t: BudgetTemplate) => void
  budgetAmounts: Record<string, number>
  onChangeBudgetAmounts: (amounts: Record<string, number>) => void
  netIncome: number
}) {
  return (
    <section className="space-y-4">
      <h4 className="text-sm font-semibold text-[var(--ink)]">Budgetten instellen</h4>
      <p className="text-xs text-[var(--ink-3)]">
        Kies een template als startpunt. Je kunt bedragen daarna aanpassen.
      </p>

      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {BUDGET_TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon
          const isSelected = selectedTemplate === tmpl.id
          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onSelectTemplate(tmpl.id)}
              className={`flex flex-col items-start gap-2 border p-3 text-left transition-all min-h-[44px] ${
                isSelected
                  ? 'border-kern-400 bg-kern-50 ring-1 ring-kern-400'
                  : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 ${isSelected ? 'text-kern-600' : 'text-[var(--ink-3)]'}`}
                />
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-kern-700' : 'text-[var(--ink)]'
                  }`}
                >
                  {tmpl.label}
                </span>
              </div>
              <span className="text-[11px] text-[var(--ink-3)] leading-snug">
                {tmpl.description}
              </span>
            </button>
          )
        })}
      </div>

      {/* Budget fine-tuning (shown after template selection) */}
      {selectedTemplate && (
        <div className="pt-2">
          <p className="text-xs text-[var(--ink-3)] mb-3">
            Pas de bedragen aan naar jouw situatie.
          </p>
          <BudgetAmountEditor
            amounts={budgetAmounts}
            onChange={onChangeBudgetAmounts}
            netIncome={netIncome}
          />
        </div>
      )}
    </section>
  )
}

// ── Horizon step ────────────────────────────────────────────────────────────

function HorizonStep({
  horizon,
  setHorizon,
  hasBudgetModule,
}: {
  horizon: HorizonForm
  setHorizon: React.Dispatch<React.SetStateAction<HorizonForm>>
  hasBudgetModule: boolean
}) {
  const updateField = useCallback(
    <K extends keyof HorizonForm>(field: K, value: HorizonForm[K]) => {
      setHorizon((prev) => ({ ...prev, [field]: value }))
    },
    [setHorizon],
  )

  // ── Life events helpers ──
  const addLifeEvent = useCallback(() => {
    setHorizon((prev) => ({
      ...prev,
      life_events: [...prev.life_events, createLifeEvent()],
    }))
  }, [setHorizon])

  const removeLifeEvent = useCallback(
    (index: number) => {
      setHorizon((prev) => ({
        ...prev,
        life_events: prev.life_events.filter((_, i) => i !== index),
      }))
    },
    [setHorizon],
  )

  const updateLifeEvent = useCallback(
    (index: number, updated: LifeEventForm) => {
      setHorizon((prev) => ({
        ...prev,
        life_events: prev.life_events.map((e, i) => (i === index ? updated : e)),
      }))
    },
    [setHorizon],
  )

  return (
    <section className="space-y-6">
      <h4 className="text-sm font-semibold text-[var(--ink)]">Toekomstplanning instellen</h4>

      {/* Section A: Eindstrategie */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-[var(--ink-2)]">A. Eindstrategie</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.entries(STRATEGY_LABELS) as [FireEndStrategy, { name: string; subtitle: string }][]).map(
            ([key, meta]) => {
              const isSelected = horizon.fire_end_strategy === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateField('fire_end_strategy', key)}
                  className={`flex flex-col items-start gap-1 border p-3 text-left transition-all min-h-[44px] ${
                    isSelected
                      ? 'border-horizon-400 bg-horizon-50 ring-1 ring-horizon-400'
                      : 'border-[var(--border-ed)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)]/50'
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      isSelected ? 'text-horizon-700' : 'text-[var(--ink)]'
                    }`}
                  >
                    {meta.name}
                  </span>
                  <span className="text-[11px] text-[var(--ink-3)] leading-snug">
                    {meta.subtitle}
                  </span>
                </button>
              )
            },
          )}
        </div>

        {/* Conditional fields based on strategy */}
        <div className="flex gap-3">
          {(horizon.fire_end_strategy === 'deplete' ||
            horizon.fire_end_strategy === 'legacy' ||
            horizon.fire_end_strategy === 'pensioen') && (
            <FormField label="Eindleeftijd" className="flex-1">
              <input
                type="number"
                min={50}
                max={120}
                value={horizon.fire_end_age}
                onChange={(e) => updateField('fire_end_age', e.target.value)}
                className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-horizon-400"
              />
            </FormField>
          )}
          {horizon.fire_end_strategy === 'legacy' && (
            <FormField label="Erfenisbedrag" className="flex-1">
              <input
                type="number"
                min={0}
                step={1000}
                placeholder="0"
                value={horizon.fire_legacy_amount}
                onChange={(e) => updateField('fire_legacy_amount', e.target.value)}
                className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-horizon-400"
              />
            </FormField>
          )}
        </div>
      </div>

      {/* Section B: Pensioenuitgaven — verwijderd uit UI.
          Default: essential_budgets als budgetteren actief, anders current_income.
          Aanpasbaar via Identiteit → Instellingen. */}

      {/* Section B: Levensgebeurtenissen */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-[var(--ink-2)]">C. Levensgebeurtenissen</p>
        <p className="text-[11px] text-[var(--ink-4)]">
          Voeg belangrijke verwachte gebeurtenissen toe die je financi\u00eble situatie be\u00efnvloeden.
        </p>

        {horizon.life_events.map((evt, i) => (
          <div
            key={i}
            className="border border-[var(--border-ed)] p-3 space-y-2 relative"
          >
            <button
              type="button"
              onClick={() => removeLifeEvent(i)}
              className="absolute top-1 right-1 p-2.5 text-[var(--ink-4)] hover:text-red-500 transition-colors"
              aria-label="Verwijder gebeurtenis"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Naam">
                <input
                  type="text"
                  placeholder="bijv. Kind krijgen"
                  value={evt.name}
                  onChange={(e) => updateLifeEvent(i, { ...evt, name: e.target.value })}
                  className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-horizon-400"
                />
              </FormField>
              <FormField label="Type">
                <select
                  value={evt.event_type}
                  onChange={(e) => updateLifeEvent(i, { ...evt, event_type: e.target.value })}
                  className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-horizon-400"
                >
                  {LIFE_EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField label="Op leeftijd">
                <input
                  type="number"
                  min={18}
                  max={120}
                  placeholder="35"
                  value={evt.target_age}
                  onChange={(e) => updateLifeEvent(i, { ...evt, target_age: e.target.value })}
                  className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-horizon-400"
                />
              </FormField>
              <FormField label="Inkomen \u0394/mnd">
                <input
                  type="number"
                  step={100}
                  placeholder="0"
                  value={evt.monthly_income_change}
                  onChange={(e) =>
                    updateLifeEvent(i, { ...evt, monthly_income_change: e.target.value })
                  }
                  className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-horizon-400"
                />
              </FormField>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addLifeEvent}
          className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors min-h-[44px]"
        >
          <Plus className="h-3.5 w-3.5" />
          Gebeurtenis toevoegen
        </button>
      </div>

      {/* Temporaal evenwicht: verwijderd uit UI, standaard niveau 3 (De Architect).
          Aanpasbaar via Identiteit → Instellingen. */}
    </section>
  )
}

// ── Accordion section ───────────────────────────────────────────────────────

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-[var(--border-ed)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]/50 transition-colors min-h-[44px]"
      >
        {title}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--ink-4)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-4)]" />
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-3 border-t border-[var(--border-ed)]">{children}</div>}
    </div>
  )
}

// ── Mini form components ────────────────────────────────────────────────────

function MiniBankForm({
  value,
  onChange,
  showBudgetTracking = false,
}: {
  value: BankAccountForm
  onChange: (updated: BankAccountForm) => void
  showBudgetTracking?: boolean
}) {
  const uid = useId()
  return (
    <div className="border border-[var(--border-ed)] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Naam rekening" htmlFor={`${uid}-name`}>
          <input
            id={`${uid}-name`}
            type="text"
            placeholder="bijv. ING Betaalrekening"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Bank" htmlFor={`${uid}-bank`}>
          <input
            id={`${uid}-bank`}
            type="text"
            placeholder="bijv. ING"
            value={value.bank_name}
            onChange={(e) => onChange({ ...value, bank_name: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Type" htmlFor={`${uid}-type`}>
          <select
            id={`${uid}-type`}
            value={value.account_type}
            onChange={(e) => onChange({ ...value, account_type: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          >
            <option value="checking">Betaalrekening</option>
            <option value="savings">Spaarrekening</option>
            <option value="joint">Gezamenlijk</option>
          </select>
        </FormField>
        <FormField label="Saldo" htmlFor={`${uid}-balance`}>
          <input
            id={`${uid}-balance`}
            type="number"
            step={0.01}
            placeholder="0.00"
            value={value.balance}
            onChange={(e) => onChange({ ...value, balance: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
      {showBudgetTracking && (
        <label className="flex items-center gap-2 text-xs text-[var(--ink-2)] min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={value.has_budget_tracking}
            onChange={(e) => onChange({ ...value, has_budget_tracking: e.target.checked })}
            className="h-4 w-4 border-[var(--border-ed)] accent-kern-600"
          />
          Budgettracking inschakelen
        </label>
      )}
    </div>
  )
}

function MiniAssetForm({
  value,
  onChange,
  lockType,
}: {
  value: AssetForm
  onChange: (updated: AssetForm) => void
  /** When set, the asset_type select is locked to this value */
  lockType?: string
}) {
  const uid = useId()
  return (
    <div className="border border-[var(--border-ed)] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Naam">
          <input
            type="text"
            placeholder="bijv. DeGiro"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Type">
          <select
            value={lockType ?? value.asset_type}
            disabled={!!lockType}
            onChange={(e) => onChange({ ...value, asset_type: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400 disabled:opacity-60"
          >
            <option value="savings">Spaargeld</option>
            <option value="investment">Belegging</option>
            <option value="real_estate">Vastgoed</option>
            <option value="pension">Pensioen</option>
            <option value="crypto">Crypto</option>
            <option value="other">Overig</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Huidige waarde">
          <input
            type="number"
            step={100}
            placeholder="0"
            value={value.current_value}
            onChange={(e) => onChange({ ...value, current_value: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Aankoopwaarde">
          <input
            type="number"
            step={100}
            placeholder="0"
            value={value.purchase_value}
            onChange={(e) => onChange({ ...value, purchase_value: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Verwacht rendement %">
          <input
            type="number"
            step={0.1}
            placeholder="7.0"
            value={value.expected_return}
            onChange={(e) => onChange({ ...value, expected_return: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Maandelijkse inleg">
          <input
            type="number"
            step={10}
            placeholder="0"
            value={value.monthly_contribution}
            onChange={(e) => onChange({ ...value, monthly_contribution: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
      <FormField label="Instelling">
        <input
          type="text"
          placeholder="bijv. DeGiro, Meesman"
          value={value.institution}
          onChange={(e) => onChange({ ...value, institution: e.target.value })}
          className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
        />
      </FormField>
    </div>
  )
}

function MiniDebtForm({
  value,
  onChange,
}: {
  value: DebtForm
  onChange: (updated: DebtForm) => void
}) {
  const uid = useId()
  return (
    <div className="border border-[var(--border-ed)] p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Naam">
          <input
            type="text"
            placeholder="bijv. Studielening"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Type">
          <select
            value={value.debt_type}
            onChange={(e) => onChange({ ...value, debt_type: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-kern-400"
          >
            <option value="personal_loan">Persoonlijke lening</option>
            <option value="student_loan">Studielening</option>
            <option value="mortgage">Hypotheek</option>
            <option value="credit_card">Creditcard</option>
            <option value="car_loan">Autolening</option>
            <option value="other">Overig</option>
          </select>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Oorspronkelijk bedrag">
          <input
            type="number"
            step={100}
            placeholder="0"
            value={value.original_amount}
            onChange={(e) => onChange({ ...value, original_amount: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Huidig saldo">
          <input
            type="number"
            step={100}
            placeholder="0"
            value={value.current_balance}
            onChange={(e) => onChange({ ...value, current_balance: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Rente %">
          <input
            type="number"
            step={0.1}
            placeholder="0.0"
            value={value.interest_rate}
            onChange={(e) => onChange({ ...value, interest_rate: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
        <FormField label="Maandelijkse aflossing">
          <input
            type="number"
            step={10}
            placeholder="0"
            value={value.monthly_payment}
            onChange={(e) => onChange({ ...value, monthly_payment: e.target.value })}
            className="w-full min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-kern-400"
          />
        </FormField>
      </div>
    </div>
  )
}

// ── Form field wrapper ──────────────────────────────────────────────────────

function FormField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-[11px] font-medium text-[var(--ink-3)] mb-1">{label}</label>
      {children}
    </div>
  )
}
