'use client'

import { useState, useCallback } from 'react'
import { User, Users, Baby } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'

type HouseholdType = 'solo' | 'samen' | 'gezin'

export interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: HouseholdType
  number_of_children: number
  net_monthly_income: string
  estimated_monthly_expenses: string
}

type FieldKey = 'full_name' | 'date_of_birth' | 'net_monthly_income' | 'number_of_children'

/** Field ID mapping for scroll-to-error */
const FIELD_IDS: Record<FieldKey, string> = {
  full_name: 'ob-name',
  date_of_birth: 'ob-dob',
  net_monthly_income: 'ob-income',
  number_of_children: 'ob-children',
}

function getFieldErrors(data: IdentityData): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  // Name: min 2 characters
  if (!data.full_name.trim()) {
    errors.full_name = 'Naam is verplicht'
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Naam moet minimaal 2 tekens bevatten'
  }

  // Date of birth: 18-100 years old
  if (!data.date_of_birth) {
    errors.date_of_birth = 'Geboortedatum is verplicht'
  } else {
    const dob = new Date(data.date_of_birth)
    const now = new Date()
    const age = now.getFullYear() - dob.getFullYear() -
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

  // Income: > 0
  if (!data.net_monthly_income) {
    errors.net_monthly_income = 'Maandinkomen is verplicht'
  } else {
    const income = Number(data.net_monthly_income)
    if (isNaN(income)) {
      errors.net_monthly_income = 'Voer een geldig bedrag in'
    } else if (income <= 0) {
      errors.net_monthly_income = 'Inkomen moet hoger dan \u20AC0 zijn'
    } else if (income > 1000000) {
      errors.net_monthly_income = 'Voer een realistisch maandinkomen in'
    }
  }

  // Children: required if gezin
  if (data.household_type === 'gezin') {
    if (data.number_of_children < 1) {
      errors.number_of_children = 'Minimaal 1 kind bij huishoudtype gezin'
    } else if (data.number_of_children > 20) {
      errors.number_of_children = 'Voer een realistisch aantal in'
    }
  }

  return errors
}

export function OnboardingIdentity({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: IdentityData
  onChange: (data: IdentityData) => void
  onNext: () => void
  onBack: () => void
}) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const errors = getFieldErrors(data)
  const isValid = Object.keys(errors).length === 0

  const showError = (field: FieldKey) => (touched[field] || submitted) ? errors[field] : undefined
  const markTouched = (field: FieldKey) => setTouched((prev) => ({ ...prev, [field]: true }))

  const inputErrorClass = (field: FieldKey) =>
    showError(field)
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-[var(--border-ed)] focus:border-wil-500 focus:ring-wil-500'

  // After first submit, disable button while errors exist
  const disableNext = submitted && !isValid

  const scrollToFirstError = useCallback(() => {
    const fieldOrder: FieldKey[] = ['full_name', 'date_of_birth', 'number_of_children', 'net_monthly_income']
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
      // Scroll to first error on mobile
      requestAnimationFrame(scrollToFirstError)
    }
  }

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="gegevens" />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Jouw gegevens</p>

      {/* Will question */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>Om je pad naar vrijheid te berekenen, moet ik je eerst leren kennen. Je inkomen bepaalt hoeveel vrijheidstijd je elke maand opbouwt &mdash; en je leeftijd helpt me inschatten hoeveel tijd er nog voor je ligt.</SpeechBubble>
      </div>

      <div className="space-y-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-sm p-5 sm:p-6">
        {submitted && !isValid && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-sm font-medium text-red-700">
              Vul alle verplichte velden correct in om door te gaan
            </p>
          </div>
        )}

        {/* Full name */}
        <div>
          <label htmlFor="ob-name" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Volledige naam <span className="text-red-400">*</span>
          </label>
          <input
            id="ob-name"
            type="text"
            value={data.full_name}
            onChange={(e) => onChange({ ...data, full_name: e.target.value })}
            onBlur={() => markTouched('full_name')}
            placeholder="Je naam"
            aria-invalid={!!showError('full_name')}
            aria-describedby={showError('full_name') ? 'ob-name-error' : undefined}
            className={`w-full rounded-xl bg-[var(--subtle)]px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('full_name')}`}
          />
          {showError('full_name') && (
            <p id="ob-name-error" className="mt-1 text-xs text-red-500" role="alert">{showError('full_name')}</p>
          )}
        </div>

        {/* Date of birth */}
        <div>
          <label htmlFor="ob-dob" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Geboortedatum <span className="text-red-400">*</span>
          </label>
          <input
            id="ob-dob"
            type="date"
            value={data.date_of_birth}
            onChange={(e) => onChange({ ...data, date_of_birth: e.target.value })}
            onBlur={() => markTouched('date_of_birth')}
            aria-invalid={!!showError('date_of_birth')}
            aria-describedby={showError('date_of_birth') ? 'ob-dob-error' : undefined}
            className={`w-full rounded-xl bg-[var(--subtle)]px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('date_of_birth')}`}
          />
          {showError('date_of_birth') && (
            <p id="ob-dob-error" className="mt-1 text-xs text-red-500" role="alert">{showError('date_of_birth')}</p>
          )}
        </div>

        {/* Household type — large clickable cards */}
        <div>
          <span className="mb-2 block text-sm font-medium text-[var(--ink-2)]">
            Huishouden <span className="text-red-400">*</span>
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {([
              { type: 'solo' as const, label: 'Solo', desc: 'Ik woon alleen', Icon: User },
              { type: 'samen' as const, label: 'Samen', desc: 'Samen / getrouwd', Icon: Users },
              { type: 'gezin' as const, label: 'Gezin', desc: 'Samen met kinderen', Icon: Baby },
            ]).map(({ type, label, desc, Icon }) => {
              const isSelected = data.household_type === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChange({ ...data, household_type: type, number_of_children: type === 'gezin' ? Math.max(1, data.number_of_children) : 0 })}
                  className={`flex min-h-[56px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-wil-500 bg-wil-50 shadow-sm'
                      : 'border-[var(--border-ed)] bg-[var(--subtle)] hover:border-[var(--border-md)] hover:bg-[var(--paper)]'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-wil-100 text-wil-600' : 'bg-[var(--border-ed)] text-[var(--ink-3)]'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isSelected ? 'text-wil-700' : 'text-[var(--ink-2)]'}`}>{label}</p>
                    <p className={`text-xs ${isSelected ? 'text-wil-600' : 'text-[var(--ink-3)]'}`}>{desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Number of children (if gezin) */}
        {data.household_type === 'gezin' && (
          <div>
            <label htmlFor="ob-children" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Aantal kinderen</label>
            <input
              id="ob-children"
              type="number"
              min={1}
              max={20}
              value={data.number_of_children}
              onChange={(e) => onChange({ ...data, number_of_children: Math.max(0, Number(e.target.value)) })}
              onBlur={() => markTouched('number_of_children')}
              aria-invalid={!!showError('number_of_children')}
              aria-describedby={showError('number_of_children') ? 'ob-children-error' : undefined}
              className={`w-full sm:w-24 min-h-[44px] rounded-xl bg-[var(--subtle)]px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('number_of_children')}`}
            />
            {showError('number_of_children') && (
              <p id="ob-children-error" className="mt-1 text-xs text-red-500" role="alert">{showError('number_of_children')}</p>
            )}
          </div>
        )}

        {/* Net monthly income */}
        <div>
          <label htmlFor="ob-income" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Netto maandinkomen <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
            <input
              id="ob-income"
              type="text"
              inputMode="decimal"
              value={data.net_monthly_income}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                onChange({ ...data, net_monthly_income: val })
              }}
              onBlur={() => markTouched('net_monthly_income')}
              placeholder="0"
              autoComplete="off"
              aria-invalid={!!showError('net_monthly_income')}
              aria-describedby={showError('net_monthly_income') ? 'ob-income-error' : 'ob-income-hint'}
              className={`w-full rounded-xl bg-[var(--subtle)]py-2.5 pr-3 pl-7 text-base text-[var(--ink)] outline-none border focus:ring-1 sm:text-sm ${inputErrorClass('net_monthly_income')}`}
            />
          </div>
          {showError('net_monthly_income') ? (
            <p id="ob-income-error" className="mt-1 text-xs text-red-500" role="alert">{showError('net_monthly_income')}</p>
          ) : (
            <p id="ob-income-hint" className="mt-1 text-xs text-[var(--ink-4)]">Huishouden netto-inkomen (samen als je samenwoont).</p>
          )}
        </div>

        {/* Estimated monthly expenses (optional) */}
        <div>
          <label htmlFor="ob-estimated-expenses" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
            Geschatte maandelijkse uitgaven
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
            <input
              id="ob-estimated-expenses"
              type="text"
              inputMode="decimal"
              value={data.estimated_monthly_expenses}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                onChange({ ...data, estimated_monthly_expenses: val })
              }}
              placeholder="0"
              autoComplete="off"
              className="w-full rounded-xl bg-[var(--subtle)] py-2.5 pr-3 pl-7 text-base text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-wil-500 focus:ring-1 focus:ring-wil-500 sm:text-sm"
            />
          </div>
          <p className="mt-1 text-xs text-[var(--ink-4)]">Een ruwe schatting is voldoende — dit helpt bij het berekenen van je vrijheidsdoel</p>
        </div>
      </div>

      {/* Sticky nav on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,8px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={handleNext}
          disabled={disableNext}
          className="w-full min-h-[44px] rounded-xl bg-wil-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Volgende
        </button>
      </div>
    </div>
  )
}
