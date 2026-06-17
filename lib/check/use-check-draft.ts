'use client'

/**
 * use-check-draft — localStorage-backed draft hook voor de Vrijheidscheck-wizard.
 *
 * Sleutel: `vrijheidscheck_draft`. Slaat de intake-state op per stap zodat
 * de gebruiker bij de eerste onvoltooide stap kan hervatten bij terugkeer.
 *
 * Bevat ook de e-mailpoort-velden (email, voornaam, consent) als aparte laag
 * zodat die niet in de `CheckIntake` zelf terechtkomen vóór submit.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CheckIntake, HouseholdComposition, RiskProfile } from './types'

const DRAFT_KEY = 'vrijheidscheck_draft'

// Stap-enum — numeriek zodat vergelijken/vergelijken eenvoudig is
export type CheckStep =
  | 'jij'           // ① geboortedatum + huishouden + optioneel voornaam
  | 'inkomen'       // ② netto maandinkomen + optioneel bruto jaar
  | 'uitgaven'      // ③ wonen / vaste lasten / vrij + totaal
  | 'buffer'        // ④ noodfonds/buffer-saldo
  | 'bezittingen'   // ⑤ QuickAddWizard collect
  | 'schulden'      // ⑥ schuldenlijst
  | 'pensioen'      // ⑦ AOW + rendement/risico
  | 'doel'          // ⑧ grootste doel (optioneel)
  | 'email'         // e-mailpoort + AVG-consent + Turnstile
  | 'verzenden'     // laad-/successtaat

export const STEP_ORDER: CheckStep[] = [
  'jij', 'inkomen', 'uitgaven', 'buffer',
  'bezittingen', 'schulden', 'pensioen', 'doel', 'email', 'verzenden',
]

export function stepIndex(step: CheckStep): number {
  return STEP_ORDER.indexOf(step)
}

/** Alleen de wizard-stappen (zonder email/verzenden) voor de voortgangsbalk. */
export const INTAKE_STEPS: CheckStep[] = [
  'jij', 'inkomen', 'uitgaven', 'buffer',
  'bezittingen', 'schulden', 'pensioen', 'doel',
]

/** Draft-omhulling — intake + e-mailpoort + huidige stap. */
export interface CheckDraft {
  step: CheckStep
  intake: Partial<CheckIntake> & {
    assets: CheckIntake['assets']
    debts: CheckIntake['debts']
  }
  /** E-mailpoort — apart bewaard, niet in CheckIntake. */
  email: string
  firstName: string   // optioneel voornaam (ook in intake.firstName maar hier als display)
  consentAt: string | null
}

function buildEmptyDraft(): CheckDraft {
  return {
    step: 'jij',
    intake: {
      assets: [],
      debts: [],
      expenses: {
        wonen: 0,
        vasteLasten: 0,
        vrijBesteedbaar: 0,
        totaalMaand: 0,
      },
      pension: {},
    },
    email: '',
    firstName: '',
    consentAt: null,
  }
}

function loadFromStorage(): CheckDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CheckDraft
    // Zorg dat arrays bestaan ook bij oudere opgeslagen versies
    if (!Array.isArray(parsed.intake?.assets)) parsed.intake.assets = []
    if (!Array.isArray(parsed.intake?.debts)) parsed.intake.debts = []
    if (!parsed.intake?.expenses) {
      parsed.intake.expenses = { wonen: 0, vasteLasten: 0, vrijBesteedbaar: 0, totaalMaand: 0 }
    }
    if (!parsed.intake?.pension) parsed.intake.pension = {}
    return parsed
  } catch {
    return null
  }
}

function saveToStorage(draft: CheckDraft): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // QuotaExceededError of private-modus: stil falen
  }
}

export function clearCheckDraft(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(DRAFT_KEY)
  }
}

// ── Helpers voor intake-update ──────────────────────────────────────────

type IntakePatch = Partial<CheckIntake & {
  assets: CheckIntake['assets']
  debts: CheckIntake['debts']
}>

// ── Hook ────────────────────────────────────────────────────────────────

export interface UseCheckDraftReturn {
  draft: CheckDraft
  step: CheckStep
  goTo: (step: CheckStep) => void
  next: () => void
  back: () => void
  patchIntake: (patch: IntakePatch) => void
  setEmail: (email: string) => void
  setFirstName: (name: string) => void
  setConsentAt: (ts: string | null) => void
  /** Wist draft + reset naar begin */
  reset: () => void
  isLoaded: boolean
}

export function useCheckDraft(): UseCheckDraftReturn {
  const [draft, setDraft] = useState<CheckDraft>(buildEmptyDraft)
  const [isLoaded, setIsLoaded] = useState(false)
  // Ref om bij ieder render de meest recente draft beschikbaar te hebben in callbacks
  const draftRef = useRef(draft)
  draftRef.current = draft

  // Laad uit localStorage zodra de client gereed is (vermijdt SSR-mismatch)
  useEffect(() => {
    const saved = loadFromStorage()
    if (saved) setDraft(saved)
    setIsLoaded(true)
  }, [])

  // Sla op bij elke wijziging (na de eerste load)
  useEffect(() => {
    if (!isLoaded) return
    saveToStorage(draft)
  }, [draft, isLoaded])

  const goTo = useCallback((step: CheckStep) => {
    setDraft((prev) => ({ ...prev, step }))
  }, [])

  const next = useCallback(() => {
    setDraft((prev) => {
      const idx = stepIndex(prev.step)
      const nextStep = STEP_ORDER[idx + 1] ?? prev.step
      return { ...prev, step: nextStep }
    })
  }, [])

  const back = useCallback(() => {
    setDraft((prev) => {
      const idx = stepIndex(prev.step)
      const prevStep = STEP_ORDER[Math.max(0, idx - 1)]
      return { ...prev, step: prevStep }
    })
  }, [])

  const patchIntake = useCallback((patch: IntakePatch) => {
    setDraft((prev) => ({
      ...prev,
      intake: { ...prev.intake, ...patch },
    }))
  }, [])

  const setEmail = useCallback((email: string) => {
    setDraft((prev) => ({ ...prev, email }))
  }, [])

  const setFirstName = useCallback((name: string) => {
    setDraft((prev) => ({
      ...prev,
      firstName: name,
      intake: { ...prev.intake, firstName: name || null },
    }))
  }, [])

  const setConsentAt = useCallback((ts: string | null) => {
    setDraft((prev) => ({ ...prev, consentAt: ts }))
  }, [])

  const reset = useCallback(() => {
    clearCheckDraft()
    setDraft(buildEmptyDraft())
  }, [])

  return {
    draft,
    step: draft.step,
    goTo,
    next,
    back,
    patchIntake,
    setEmail,
    setFirstName,
    setConsentAt,
    reset,
    isLoaded,
  }
}

// ── Typed helpers voor stap-validatie ──────────────────────────────────

export function parseBedrag(s: string | undefined | null): number {
  if (!s) return 0
  const cleaned = s.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
  const n = Number(cleaned)
  return isFinite(n) && n >= 0 ? n : 0
}

/** Stap ① is compleet als we minimaal een geboortedatum hebben. */
export function isStepJijComplete(intake: CheckDraft['intake']): boolean {
  return Boolean(intake.dateOfBirth && intake.household)
}

/** Stap ② is compleet als netto maandinkomen > 0. */
export function isStepInkomenComplete(intake: CheckDraft['intake']): boolean {
  return Boolean(intake.monthlyIncomeNet && intake.monthlyIncomeNet > 0)
}

/** Stap ③ is compleet als totaalMaand > 0. */
export function isStepUitgavenComplete(intake: CheckDraft['intake']): boolean {
  return Boolean(intake.expenses?.totaalMaand && intake.expenses.totaalMaand > 0)
}

/** Stap ④ is compleet als emergencyFund een getal is (ook 0 is OK). */
export function isStepBufferComplete(intake: CheckDraft['intake']): boolean {
  return typeof intake.emergencyFund === 'number'
}

/** Stap ⑤ bezittingen is altijd optioneel. */
export function isStepBezittingenComplete(_intake: CheckDraft['intake']): boolean {
  return true
}

/** Stap ⑥ schulden is altijd optioneel. */
export function isStepSchuldenComplete(_intake: CheckDraft['intake']): boolean {
  return true
}

/** Stap ⑦ pensioen is altijd optioneel. */
export function isStepPensioenComplete(_intake: CheckDraft['intake']): boolean {
  return true
}

/** Stap ⑧ doel is altijd optioneel. */
export function isStepDoelComplete(_intake: CheckDraft['intake']): boolean {
  return true
}
