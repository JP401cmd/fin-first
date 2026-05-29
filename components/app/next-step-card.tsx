'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, X, Lightbulb, Zap, Target, PiggyBank, ShoppingCart, Building2, Receipt, Compass, BarChart3, CheckCircle2 } from 'lucide-react'

export type NextStepSuggestion = {
  title: string
  description: string
  href: string
  key?: string
  icon?: 'lightbulb' | 'zap' | 'target' | 'piggybank' | 'cart' | 'building' | 'receipt' | 'compass' | 'chart'
  moduleColor?: 'amber' | 'teal' | 'purple'
}

const ICON_MAP = {
  lightbulb: Lightbulb,
  zap: Zap,
  target: Target,
  piggybank: PiggyBank,
  cart: ShoppingCart,
  building: Building2,
  receipt: Receipt,
  compass: Compass,
  chart: BarChart3,
} as const

const MODULE_STYLES = {
  amber: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/50',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    hoverBorder: 'hover:border-amber-300',
    hoverShadow: 'hover:shadow-amber-100/50',
    ctaText: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    dismissHover: 'hover:bg-amber-100 hover:text-amber-600',
  },
  teal: {
    border: 'border-wil-200',
    bg: 'bg-wil-50/50',
    iconBg: 'bg-wil-100',
    iconText: 'text-wil-600',
    hoverBorder: 'hover:border-wil-300',
    hoverShadow: 'hover:shadow-wil-100/50',
    ctaText: 'text-wil-600',
    badge: 'bg-wil-100 text-wil-700',
    dismissHover: 'hover:bg-wil-100 hover:text-wil-600',
  },
  purple: {
    border: 'border-horizon-200',
    bg: 'bg-horizon-50/50',
    iconBg: 'bg-horizon-100',
    iconText: 'text-horizon-600',
    hoverBorder: 'hover:border-horizon-300',
    hoverShadow: 'hover:shadow-horizon-100/50',
    ctaText: 'text-horizon-600',
    badge: 'bg-horizon-100 text-horizon-700',
    dismissHover: 'hover:bg-horizon-100 hover:text-horizon-600',
  },
} as const

interface NextStepCardProps {
  step: NextStepSuggestion
  onDismiss?: (step: NextStepSuggestion) => void
  dismissDisabled?: boolean
}

export function NextStepCard({ step, onDismiss, dismissDisabled }: NextStepCardProps) {
  const color = step.moduleColor ?? 'amber'
  const styles = MODULE_STYLES[color]
  const IconComponent = ICON_MAP[step.icon ?? 'lightbulb']

  return (
    <div data-testid="next-step-card" data-step-key={step.key || step.title} className={`group relative flex items-center gap-4 rounded-[var(--r-lg)] border ${styles.border} ${styles.bg} p-3 sm:p-4 transition-all ${styles.hoverBorder} hover:shadow-md ${styles.hoverShadow}`}>
      <Link href={step.href} className="absolute inset-0 z-0 rounded-[var(--r-lg)]" aria-label={step.title} />
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}>
        <IconComponent className={`h-5 w-5 ${styles.iconText}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>
            Volgende Stap
          </span>
        </div>
        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{step.title}</p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">{step.description}</p>
      </div>
      <div className="flex items-center gap-2">
        {onDismiss && (
          <button
            type="button"
            data-testid="dismiss-next-step"
            disabled={dismissDisabled}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!dismissDisabled) {
                onDismiss(step)
              }
            }}
            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-3)] transition-colors ${styles.dismissHover} ${dismissDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Negeren"
            aria-label="Suggestie negeren"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className={`flex items-center gap-1 text-xs font-medium ${styles.ctaText} opacity-0 transition-opacity group-hover:opacity-100`}>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state when no next steps are available.
 */
export function NextStepEmptyCard({ moduleColor }: { moduleColor?: 'amber' | 'teal' | 'purple' }) {
  const color = moduleColor ?? 'amber'
  const styles = MODULE_STYLES[color]

  return (
    <div className={`flex items-center gap-4 rounded-[var(--r-lg)] border ${styles.border} ${styles.bg} p-3 sm:p-4`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}>
        <CheckCircle2 className={`h-5 w-5 ${styles.iconText}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ink)]">Alles bij!</p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">Geen openstaande suggesties meer. Goed bezig!</p>
      </div>
    </div>
  )
}

/**
 * NextStepSection — Manages a list of steps with dismiss and complete functionality.
 * Shows the first non-dismissed step, or an empty state if all are dismissed/completed.
 */
export function NextStepSection({ steps, moduleColor }: { steps: NextStepSuggestion[]; moduleColor?: 'amber' | 'teal' | 'purple' }) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set())
  const [dismissingKeys, setDismissingKeys] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  // Load previously dismissed AND completed keys from database on mount
  useEffect(() => {
    let cancelled = false
    async function loadDismissedAndCompleted() {
      try {
        const res = await fetch('/api/next-steps')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            if (Array.isArray(data.dismissed_steps) && data.dismissed_steps.length > 0) {
              setDismissedKeys(prev => {
                const merged = new Set(prev)
                for (const key of data.dismissed_steps) {
                  merged.add(key)
                }
                return merged
              })
            }
            if (Array.isArray(data.completed_steps) && data.completed_steps.length > 0) {
              setCompletedKeys(prev => {
                const merged = new Set(prev)
                for (const key of data.completed_steps) {
                  merged.add(key)
                }
                return merged
              })
            }
          }
        }
      } catch {
        // Silent fail — component still works with session-only dismissals
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    loadDismissedAndCompleted()
    return () => { cancelled = true }
  }, [])

  const handleDismiss = useCallback(async (step: NextStepSuggestion) => {
    const key = step.key || step.title

    // Guard: if already dismissed or currently dismissing, silently ignore (double-click safety)
    if (dismissedKeys.has(key) || dismissingKeys.has(key)) {
      return
    }

    // Mark as dismissing to prevent concurrent double-clicks
    setDismissingKeys(prev => new Set([...prev, key]))
    // Immediately update UI (optimistic)
    setDismissedKeys(prev => new Set([...prev, key]))

    // Persist dismiss to API (best-effort — if it fails, the dismiss still works in the UI session)
    try {
      await fetch('/api/next-steps/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: key }),
      })
    } catch {
      // Silent fail — UI already updated
    } finally {
      setDismissingKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [dismissedKeys, dismissingKeys])

  const visibleSteps = steps.filter(s => {
    const key = s.key || s.title
    return !dismissedKeys.has(key) && !completedKeys.has(key)
  })
  const currentStep = visibleSteps.length > 0 ? visibleSteps[0] : null

  // While loading dismissed state, show nothing to avoid flash of dismissed content
  if (!loaded) {
    return null
  }

  if (!currentStep) {
    return <NextStepEmptyCard moduleColor={moduleColor} />
  }

  return <NextStepCard step={currentStep} onDismiss={handleDismiss} dismissDisabled={dismissingKeys.has(currentStep.key || currentStep.title)} />
}

/**
 * Compute the next step suggestion for Overzicht module based on financial data.
 *
 * Smart prioritization (Feature #255):
 * 1. No transactions (import first)
 * 2. No assets (add wealth)
 * 3. Budget alerts (needs attention)
 * 4. No goals (set goals)
 * 5. FIRE unreachable (try scenarios)
 * Then: budgets, debts, snapshots, tax
 */
export function computeKernNextStep(data: {
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  budgetCount: number
  snapshotCount: number
  hasTransactions: boolean
  alertBudgetCount?: number
  hasGoals?: boolean
  fireUnreachable?: boolean
  /** PSD2 bank connection exists (#813) */
  hasBankConnection?: boolean
}): NextStepSuggestion {
  // Priority 0: No PSD2 bank connection — recommend connecting for automatic insight (#813)
  if (data.hasBankConnection === false) {
    return {
      key: 'connect_bank_psd2',
      title: 'Koppel je bank voor automatisch inzicht',
      description: 'Verbind je bankrekening via PSD2 en je transacties worden automatisch geïmporteerd.',
      href: '/core/cash/connect',
      icon: 'zap',
      moduleColor: 'amber',
    }
  }

  // Priority 1: No transactions (import first)
  if (!data.hasTransactions) {
    return {
      key: 'import_transactions',
      title: 'Importeer je eerste bankafschrift',
      description: 'Upload je bankafschriften om inzicht te krijgen in je inkomsten en uitgaven.',
      href: '/core/cash/import',
      icon: 'receipt',
      moduleColor: 'amber',
    }
  }

  // Priority 2: No assets (add wealth)
  if (data.totalAssets === 0) {
    return {
      key: 'add_assets',
      title: 'Voeg je vermogen toe',
      description: 'Registreer je bezittingen voor een compleet vermogensoverzicht.',
      href: '/core/assets',
      icon: 'piggybank',
      moduleColor: 'amber',
    }
  }

  // Priority 3: Budget attention alerts when budgets are over their limit
  if ((data.alertBudgetCount ?? 0) > 0) {
    const count = data.alertBudgetCount!
    return {
      key: 'budget_attention',
      title: `${count} budget${count > 1 ? 'ten' : ''} ${count > 1 ? 'hebben' : 'heeft'} aandacht nodig`,
      description: `${count} van je budgetten ${count > 1 ? 'overschrijden' : 'overschrijdt'} de limiet. Bekijk je uitgaven.`,
      href: '/core/budgets',
      icon: 'cart',
      moduleColor: 'amber',
    }
  }

  // Priority 4: No goals set
  if (data.hasGoals === false) {
    return {
      key: 'set_goals',
      title: 'Stel een financieel doel',
      description: 'Definieer een concreet doel om naartoe te werken.',
      href: '/will',
      icon: 'target',
      moduleColor: 'amber',
    }
  }

  // Priority 5: FIRE target unreachable (try scenarios)
  if (data.fireUnreachable === true) {
    return {
      key: 'fire_unreachable',
      title: 'FIRE-doel niet haalbaar',
      description: 'Je huidige spaarquote is onvoldoende. Verken scenario\'s om je plan te verbeteren.',
      href: '/horizon',
      icon: 'compass',
      moduleColor: 'amber',
    }
  }

  // Lower priority: budgets, debts, snapshots, tax
  if (data.budgetCount === 0) {
    return {
      key: 'set_budgets',
      title: 'Stel je budgetten in',
      description: 'Maak budgetten aan om grip te krijgen op je uitgaven.',
      href: '/core/budgets',
      icon: 'cart',
      moduleColor: 'amber',
    }
  }

  if (data.totalDebts > 0) {
    return {
      key: 'register_debts',
      title: 'Bekijk je schulden',
      description: 'Analyseer je schulden en maak een aflosplan.',
      href: '/core/debts',
      icon: 'building',
      moduleColor: 'amber',
    }
  }

  if (data.snapshotCount === 0) {
    return {
      key: 'create_snapshot',
      title: 'Maak je eerste snapshot',
      description: 'Leg je vermogenspositie vast om je voortgang te volgen.',
      href: '/core',
      icon: 'chart',
      moduleColor: 'amber',
    }
  }

  return {
    key: 'check_tax',
    title: 'Bekijk je belastingpositie',
    description: 'Bereken je Box 3 vermogensbelasting en ontdek optimalisatiemogelijkheden.',
    href: '/core/debts',
    icon: 'receipt',
    moduleColor: 'amber',
  }
}

/**
 * Compute ALL remaining kern steps (not just the first one).
 *
 * Smart prioritization (Feature #255):
 * 1. No transactions (import first)
 * 2. No assets (add wealth)
 * 3. Budget alerts (needs attention)
 * 4. No goals (set goals)
 * 5. FIRE unreachable (try scenarios)
 * Then: budgets, debts, snapshots, tax
 */
export function computeAllKernSteps(data: {
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  budgetCount: number
  snapshotCount: number
  hasTransactions: boolean
  alertBudgetCount?: number
  hasGoals?: boolean
  fireUnreachable?: boolean
  /** PSD2 bank connection exists (#813) */
  hasBankConnection?: boolean
}): NextStepSuggestion[] {
  const steps: NextStepSuggestion[] = []

  // Priority 0: No PSD2 bank connection — recommend connecting for automatic insight (#813)
  if (data.hasBankConnection === false) {
    steps.push({
      key: 'connect_bank_psd2',
      title: 'Koppel je bank voor automatisch inzicht',
      description: 'Verbind je bankrekening via PSD2 en je transacties worden automatisch geïmporteerd.',
      href: '/core/cash/connect',
      icon: 'zap',
      moduleColor: 'amber',
    })
  }

  // Priority 1: No transactions (import first)
  if (!data.hasTransactions) {
    steps.push({
      key: 'import_transactions',
      title: 'Importeer je eerste bankafschrift',
      description: 'Upload je bankafschriften om inzicht te krijgen in je inkomsten en uitgaven.',
      href: '/core/cash/import',
      icon: 'receipt',
      moduleColor: 'amber',
    })
  }

  // Priority 2: No assets (add wealth)
  if (data.totalAssets === 0) {
    steps.push({
      key: 'add_assets',
      title: 'Voeg je vermogen toe',
      description: 'Registreer je bezittingen voor een compleet vermogensoverzicht.',
      href: '/core/assets',
      icon: 'piggybank',
      moduleColor: 'amber',
    })
  }

  // Priority 3: Budget attention alerts when budgets are over their limit
  if ((data.alertBudgetCount ?? 0) > 0) {
    const count = data.alertBudgetCount!
    steps.push({
      key: 'budget_attention',
      title: `${count} budget${count > 1 ? 'ten' : ''} ${count > 1 ? 'hebben' : 'heeft'} aandacht nodig`,
      description: `${count} van je budgetten ${count > 1 ? 'overschrijden' : 'overschrijdt'} de limiet. Bekijk je uitgaven.`,
      href: '/core/budgets',
      icon: 'cart',
      moduleColor: 'amber',
    })
  }

  // Priority 4: No goals set
  if (data.hasGoals === false) {
    steps.push({
      key: 'set_goals',
      title: 'Stel een financieel doel',
      description: 'Definieer een concreet doel om naartoe te werken.',
      href: '/will',
      icon: 'target',
      moduleColor: 'amber',
    })
  }

  // Priority 5: FIRE unreachable (try scenarios)
  if (data.fireUnreachable === true) {
    steps.push({
      key: 'fire_unreachable',
      title: 'FIRE-doel niet haalbaar',
      description: 'Je huidige spaarquote is onvoldoende. Verken scenario\'s om je plan te verbeteren.',
      href: '/horizon',
      icon: 'compass',
      moduleColor: 'amber',
    })
  }

  // Lower priority steps
  if (data.budgetCount === 0) {
    steps.push({
      key: 'set_budgets',
      title: 'Stel je budgetten in',
      description: 'Maak budgetten aan om grip te krijgen op je uitgaven.',
      href: '/core/budgets',
      icon: 'cart',
      moduleColor: 'amber',
    })
  }

  if (data.totalDebts > 0) {
    steps.push({
      key: 'register_debts',
      title: 'Bekijk je schulden',
      description: 'Analyseer je schulden en maak een aflosplan.',
      href: '/core/debts',
      icon: 'building',
      moduleColor: 'amber',
    })
  }

  if (data.snapshotCount === 0) {
    steps.push({
      key: 'create_snapshot',
      title: 'Maak je eerste snapshot',
      description: 'Leg je vermogenspositie vast om je voortgang te volgen.',
      href: '/core',
      icon: 'chart',
      moduleColor: 'amber',
    })
  }

  steps.push({
    key: 'check_tax',
    title: 'Bekijk je belastingpositie',
    description: 'Bereken je Box 3 vermogensbelasting en ontdek optimalisatiemogelijkheden.',
    href: '/core/debts',
    icon: 'receipt',
    moduleColor: 'amber',
  })

  return steps
}

/**
 * Compute ALL remaining wil steps.
 */
export function computeAllWilSteps(data: {
  pendingRecommendations: number
  openActions: number
  goalCount: number
  hasCompletedActions: boolean
}): NextStepSuggestion[] {
  const steps: NextStepSuggestion[] = []

  if (data.pendingRecommendations > 0) {
    steps.push({
      key: 'review_recommendations',
      title: 'Bekijk je aanbevelingen',
      description: `Je hebt ${data.pendingRecommendations} openstaande aanbeveling${data.pendingRecommendations > 1 ? 'en' : ''}. Neem een beslissing.`,
      href: '/will',
      icon: 'lightbulb',
      moduleColor: 'teal',
    })
  }

  if (data.openActions > 0) {
    steps.push({
      key: 'work_on_actions',
      title: 'Werk aan je acties',
      description: `${data.openActions} open actie${data.openActions > 1 ? 's' : ''} wacht${data.openActions === 1 ? '' : 'en'} op jou.`,
      href: '/will',
      icon: 'zap',
      moduleColor: 'teal',
    })
  }

  if (data.goalCount === 0) {
    steps.push({
      key: 'set_goals',
      title: 'Stel je eerste doel in',
      description: 'Definieer een financieel doel om naartoe te werken.',
      href: '/will',
      icon: 'target',
      moduleColor: 'teal',
    })
  }

  steps.push({
    key: 'check_goals',
    title: 'Bekijk je doelen',
    description: 'Check de voortgang van je financiele doelen.',
    href: '/will',
    icon: 'target',
    moduleColor: 'teal',
  })

  return steps
}

/**
 * Compute ALL remaining horizon steps.
 */
export function computeAllHorizonSteps(data: {
  hasFireProjection: boolean
  eventCount: number
  freedomPct: number
}): NextStepSuggestion[] {
  const steps: NextStepSuggestion[] = []

  if (!data.hasFireProjection) {
    steps.push({
      key: 'calculate_fire',
      title: 'Bereken je FIRE-datum',
      description: 'Ontdek wanneer je financieel onafhankelijk kunt zijn.',
      href: '/horizon',
      icon: 'compass',
      moduleColor: 'purple',
    })
  }

  if (data.eventCount === 0) {
    steps.push({
      key: 'plan_life_event',
      title: 'Plan een levensgebeurtenis',
      description: 'Voeg een life event toe om de impact op je plan te zien.',
      href: '/horizon',
      icon: 'target',
      moduleColor: 'purple',
    })
  }

  steps.push({
    key: 'explore_scenarios',
    title: 'Verken scenario\'s',
    description: 'Wat als je meer spaart, eerder stopt of de markt daalt?',
    href: '/horizon',
    icon: 'chart',
    moduleColor: 'purple',
  })

  return steps
}

/**
 * Compute the next step suggestion for Overzicht module based on action/recommendation data.
 */
export function computeWilNextStep(data: {
  pendingRecommendations: number
  openActions: number
  goalCount: number
  hasCompletedActions: boolean
}): NextStepSuggestion {
  if (data.pendingRecommendations > 0) {
    return {
      key: 'review_recommendations',
      title: 'Bekijk je aanbevelingen',
      description: `Je hebt ${data.pendingRecommendations} openstaande aanbeveling${data.pendingRecommendations > 1 ? 'en' : ''}. Neem een beslissing.`,
      href: '/will',
      icon: 'lightbulb',
      moduleColor: 'teal',
    }
  }

  if (data.openActions > 0) {
    return {
      key: 'work_on_actions',
      title: 'Werk aan je acties',
      description: `${data.openActions} open actie${data.openActions > 1 ? 's' : ''} wacht${data.openActions === 1 ? '' : 'en'} op jou.`,
      href: '/will',
      icon: 'zap',
      moduleColor: 'teal',
    }
  }

  if (data.goalCount === 0) {
    return {
      key: 'set_goals',
      title: 'Stel je eerste doel in',
      description: 'Definieer een financieel doel om naartoe te werken.',
      href: '/will',
      icon: 'target',
      moduleColor: 'teal',
    }
  }

  return {
    key: 'check_goals',
    title: 'Bekijk je doelen',
    description: 'Check de voortgang van je financiele doelen.',
    href: '/will',
    icon: 'target',
    moduleColor: 'teal',
  }
}

/**
 * Compute the next step suggestion for Toekomst module.
 */
export function computeHorizonNextStep(data: {
  hasFireProjection: boolean
  eventCount: number
  freedomPct: number
}): NextStepSuggestion {
  if (!data.hasFireProjection) {
    return {
      key: 'calculate_fire',
      title: 'Bereken je FIRE-datum',
      description: 'Ontdek wanneer je financieel onafhankelijk kunt zijn.',
      href: '/horizon',
      icon: 'compass',
      moduleColor: 'purple',
    }
  }

  if (data.eventCount === 0) {
    return {
      key: 'plan_life_event',
      title: 'Plan een levensgebeurtenis',
      description: 'Voeg een life event toe om de impact op je plan te zien.',
      href: '/horizon',
      icon: 'target',
      moduleColor: 'purple',
    }
  }

  return {
    key: 'explore_scenarios',
    title: 'Verken scenario\'s',
    description: 'Wat als je meer spaart, eerder stopt of de markt daalt?',
    href: '/horizon',
    icon: 'chart',
    moduleColor: 'purple',
  }
}
