'use client'

import { useState, useCallback, useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'

type HouseholdType = 'solo' | 'samen' | 'gezin'

/**
 * Canonieke shape voor de identity-data die de orchestrator opslaat.
 * Wordt in deze stap alleen voor `full_name` en `date_of_birth` gebruikt;
 * huishoudens-, inkomens- en uitgaven-velden komen pas in stap 3
 * (`OnboardingInkomen`) aan bod. We houden de shape bewust gelijk zodat de
 * orchestrator één state-object kan blijven gebruiken — dat scheelt
 * migraties van localStorage-drafts.
 */
export interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: HouseholdType
  number_of_children: number
  net_monthly_income: string
  estimated_monthly_expenses: string
}

type FieldKey = 'full_name' | 'date_of_birth'

const FIELD_IDS: Record<FieldKey, string> = {
  full_name: 'ob-name',
  date_of_birth: 'ob-dob',
}

/**
 * Validatie alleen op naam + DOB (income verhuist naar
 * `OnboardingInkomen`). Behoudt dezelfde regels als de oude implementatie
 * zodat server-zod (full_name min-2, dob ≥18 ≤100 jaar) blijft kloppen.
 */
function getFieldErrors(data: Pick<IdentityData, 'full_name' | 'date_of_birth'>): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  if (!data.full_name.trim()) {
    errors.full_name = 'Naam is verplicht'
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Naam moet minimaal 2 tekens bevatten'
  }

  if (!data.date_of_birth) {
    errors.date_of_birth = 'Geboortedatum is verplicht'
  } else {
    const dob = new Date(data.date_of_birth)
    const now = new Date()
    const age =
      now.getFullYear() -
      dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    if (isNaN(dob.getTime())) {
      errors.date_of_birth = 'Ongeldige datum'
    } else if (dob > now) {
      errors.date_of_birth = 'Geboortedatum kan niet in de toekomst liggen'
    } else if (age > 100) {
      errors.date_of_birth = 'Ongeldige geboortedatum (max 100 jaar)'
    } else if (age < 18) {
      errors.date_of_birth = 'Je moet minimaal 18 jaar oud zijn'
    }
  }

  return errors
}

/**
 * Bereken huidige leeftijd uit een DOB-string. Voor de dynamische tekst
 * in het facts-paneel. Returns `null` voor een ongeldige of lege DOB —
 * caller toont dan de fallback-copy.
 */
function deriveAge(dob: string): number | null {
  if (!dob) return null
  const date = new Date(dob)
  if (isNaN(date.getTime())) return null
  const now = new Date()
  const age =
    now.getFullYear() -
    date.getFullYear() -
    (now < new Date(now.getFullYear(), date.getMonth(), date.getDate()) ? 1 : 0)
  return age >= 0 && age <= 120 ? age : null
}

export interface OnboardingIdentityProps {
  data: IdentityData
  onChange: (data: IdentityData) => void
  onNext: () => void
  onBack: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 2). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingIdentity({
  data,
  onChange,
  onNext,
  onBack,
  currentStep = 2,
  totalSteps = 6,
}: OnboardingIdentityProps) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const errors = useMemo(() => getFieldErrors(data), [data])
  const isValid = Object.keys(errors).length === 0
  const disableNext = submitted && !isValid

  const showError = (field: FieldKey) =>
    touched[field] || submitted ? errors[field] : undefined
  const markTouched = (field: FieldKey) =>
    setTouched((prev) => ({ ...prev, [field]: true }))

  const inputErrorClass = (field: FieldKey) =>
    showError(field)
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-[var(--border-ed)] focus:border-[var(--module-active-500)] focus:ring-[var(--module-active-500)]'

  const scrollToFirstError = useCallback(() => {
    const fieldOrder: FieldKey[] = ['full_name', 'date_of_birth']
    for (const field of fieldOrder) {
      if (errors[field]) {
        const el = document.getElementById(FIELD_IDS[field])
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus()
        }
        break
      }
    }
  }, [errors])

  function handleNext() {
    setSubmitted(true)
    if (isValid) {
      onNext()
    } else {
      requestAnimationFrame(scrollToFirstError)
    }
  }

  // Headline-em: italic Playfair op "voorstellen" in --module-active-700.
  const headline = (
    <>
      Even{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        voorstellen
      </em>
    </>
  )

  // Dynamic facts-copy: zodra DOB valide is, toon leeftijd-aware tekst.
  // Anders fallback uit het plan (CBS Levensverwachting).
  const age = deriveAge(data.date_of_birth)
  const factsSub = age
    ? `Op je ${age}e staan de meeste mensen nog 25 tot 30 jaar voor hun pensioendoel.`
    : 'gemiddelde levensverwachting in Nederland'
  const factsStat = age ? `${age}` : '81'
  const factsSource = age ? 'CBS Levensverwachting, 2024' : 'CBS Levensverwachting, 2024'

  return (
    <OnboardingShell
      kicker="Profiel"
      romanNum="ii."
      title={headline}
      deck="Zo vertaal ik je bedragen naar jouw vrijheid in tijd — op maat van je situatie."
      factsPanel={
        <FactsPanel stat={factsStat} sub={factsSub} source={factsSource} />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={handleNext}
          disabled={disableNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Verder
        </button>
      }
    >
      <div className="space-y-6">
        {submitted && !isValid && (
          <div
            className="border border-red-200 bg-red-50 px-4 py-3"
            role="alert"
          >
            <p className="text-sm font-medium text-red-700">
              Vul alle verplichte velden correct in om door te gaan
            </p>
          </div>
        )}

        {/* Volledige naam */}
        <div>
          <label
            htmlFor="ob-name"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Volledige naam <span className="text-red-400">*</span>
          </label>
          <input
            id="ob-name"
            type="text"
            value={data.full_name}
            onChange={(e) => onChange({ ...data, full_name: e.target.value })}
            onBlur={() => markTouched('full_name')}
            placeholder="Je naam"
            autoComplete="name"
            aria-invalid={!!showError('full_name')}
            aria-describedby={showError('full_name') ? 'ob-name-error' : undefined}
            className={`w-full bg-[var(--subtle)] px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('full_name')}`}
          />
          {showError('full_name') && (
            <p
              id="ob-name-error"
              className="mt-1 text-xs text-red-500"
              role="alert"
            >
              {showError('full_name')}
            </p>
          )}
        </div>

        {/* Geboortedatum */}
        <div>
          <label
            htmlFor="ob-dob"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Geboortedatum <span className="text-red-400">*</span>
          </label>
          <input
            id="ob-dob"
            type="date"
            value={data.date_of_birth}
            onChange={(e) =>
              onChange({ ...data, date_of_birth: e.target.value })
            }
            onBlur={() => markTouched('date_of_birth')}
            autoComplete="bday"
            aria-invalid={!!showError('date_of_birth')}
            aria-describedby={showError('date_of_birth') ? 'ob-dob-error' : undefined}
            className={`w-full bg-[var(--subtle)] px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('date_of_birth')}`}
          />
          {showError('date_of_birth') && (
            <p
              id="ob-dob-error"
              className="mt-1 text-xs text-red-500"
              role="alert"
            >
              {showError('date_of_birth')}
            </p>
          )}
        </div>
      </div>
    </OnboardingShell>
  )
}
