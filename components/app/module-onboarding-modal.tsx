'use client'

import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { ModuleId } from '@/lib/module-registry'
import { Wallet, PiggyBank, Telescope, ArrowRight } from 'lucide-react'

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
  inzicht_acties: [],   // no required setup — purely derived from existing data
}

// ── Step metadata ────────────────────────────────────────────────────────────

interface StepMeta {
  title: string
  description: string
  detail: string
  icon: typeof Wallet
  /** Route to navigate to for full setup */
  setupRoute: string
  setupLabel: string
}

const STEP_META: Record<OnboardingStep, StepMeta> = {
  bezittingen: {
    title: 'Bezittingen & schulden instellen',
    description: 'Deze module werkt met je vermogensgegevens.',
    detail:
      'Voeg je bezittingen (spaargeld, beleggingen, woning) en eventuele schulden toe zodat je vermogen correct berekend wordt.',
    icon: Wallet,
    setupRoute: '/overzicht/bezittingen',
    setupLabel: 'Naar Bezittingen',
  },
  budgets: {
    title: 'Budgetten instellen',
    description: 'Voor budgetteren heb je categoriebudgetten nodig.',
    detail:
      'Op Het Overzicht → Cashflow opent één knop ("Budgetten aanpassen") de hele editor: structuur, maandbedragen en templates (Minimalistisch, Nibud, Uitgebreid) op één plek.',
    icon: PiggyBank,
    setupRoute: '/overzicht/cashflow',
    setupLabel: 'Naar Cashflow',
  },
  horizon: {
    title: 'Toekomstplanning instellen',
    description: 'Stel je financiële horizon in voor projecties en simulaties.',
    detail:
      'In De Toekomst kun je je pensioenleeftijd, verwachte uitgaven en levensgebeurtenissen instellen. Dit vormt de basis voor je vrijheidsberekeningen.',
    icon: Telescope,
    setupRoute: '/toekomst',
    setupLabel: 'Naar De Toekomst',
  },
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  moduleId: ModuleId
  completedSteps: string[]
  open: boolean
  onClose: () => void
  /** Called when the user completes or skips setup. Passes the step names to mark as completed. */
  onComplete: (newSteps: string[]) => void
}

/**
 * Modal shown when a user enables a module that requires onboarding steps
 * they haven't completed yet. Presents an informational overview of what's
 * needed, with a "skip" option and a "go to setup" redirect.
 *
 * Design: lightweight informational modal — no embedded forms, just guidance.
 */
export function ModuleOnboardingModal({ moduleId, completedSteps, open, onClose, onComplete }: Props) {
  const router = useRouter()

  const requiredSteps = MODULE_REQUIRED_STEPS[moduleId] ?? []
  const missingSteps = requiredSteps.filter((s) => !completedSteps.includes(s))

  // Nothing missing — immediately complete (caller handles the toggle)
  if (missingSteps.length === 0) {
    // Use a microtask to avoid calling onComplete during render
    if (open) {
      queueMicrotask(() => onComplete([]))
    }
    return null
  }

  // Show the first missing step; if there are multiple, the user can revisit.
  // For simplicity we mark ALL missing steps as complete on any action,
  // since the user can always configure details later from the relevant page.
  const currentStep = missingSteps[0]
  const meta = STEP_META[currentStep]
  const Icon = meta.icon

  const handleSkip = () => {
    // Mark all missing steps as completed (user chose to skip setup)
    onComplete(missingSteps)
  }

  const handleGoToSetup = () => {
    // Mark steps as completed and navigate to the setup page
    onComplete(missingSteps)
    router.push(meta.setupRoute)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Module instellen" size="sm">
      <div className="px-5 py-5 space-y-5">
        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--subtle)] text-[var(--ink-2)]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--ink)]">{meta.title}</h4>
            <p className="mt-0.5 text-xs text-[var(--ink-3)] leading-snug">{meta.description}</p>
          </div>
        </div>

        {/* Detailed explanation */}
        <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 px-4 py-3">
          <p className="text-xs text-[var(--ink-2)] leading-relaxed">{meta.detail}</p>
        </div>

        {/* Additional missing steps indicator */}
        {missingSteps.length > 1 && (
          <p className="text-[11px] text-[var(--ink-4)]">
            Nog {missingSteps.length - 1} extra {missingSteps.length - 1 === 1 ? 'stap' : 'stappen'} — je kunt dit later instellen.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleGoToSetup}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--ink-2)]"
          >
            {meta.setupLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full rounded-xl border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
          >
            Later instellen
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
