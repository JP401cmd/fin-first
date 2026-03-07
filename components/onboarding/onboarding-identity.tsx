'use client'

import { useState } from 'react'
import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'

type HouseholdType = 'solo' | 'samen' | 'gezin'

export interface IdentityData {
  full_name: string
  date_of_birth: string
  household_type: HouseholdType
  number_of_children: number
  net_monthly_income: string
}

type FieldKey = 'full_name' | 'date_of_birth' | 'net_monthly_income' | 'number_of_children'

function getFieldErrors(data: IdentityData): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  // Full name validation
  if (!data.full_name.trim()) {
    errors.full_name = 'Naam is verplicht'
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Naam moet minimaal 2 tekens bevatten'
  }

  // Date of birth validation
  if (!data.date_of_birth) {
    errors.date_of_birth = 'Geboortedatum is verplicht'
  } else {
    const dob = new Date(data.date_of_birth)
    const now = new Date()
    const age = now.getFullYear() - dob.getFullYear()
    if (isNaN(dob.getTime())) {
      errors.date_of_birth = 'Ongeldige datum'
    } else if (dob > now) {
      errors.date_of_birth = 'Geboortedatum kan niet in de toekomst liggen'
    } else if (age > 120) {
      errors.date_of_birth = 'Ongeldige geboortedatum'
    } else if (age < 16) {
      errors.date_of_birth = 'Je moet minimaal 16 jaar oud zijn'
    }
  }

  // Net monthly income validation
  if (!data.net_monthly_income) {
    errors.net_monthly_income = 'Maandinkomen is verplicht'
  } else {
    const income = Number(data.net_monthly_income)
    if (isNaN(income)) {
      errors.net_monthly_income = 'Voer een geldig bedrag in'
    } else if (income <= 0) {
      errors.net_monthly_income = 'Inkomen moet hoger dan €0 zijn'
    } else if (income > 1000000) {
      errors.net_monthly_income = 'Voer een realistisch maandinkomen in'
    }
  }

  // Number of children validation (only when gezin)
  if (data.household_type === 'gezin') {
    if (data.number_of_children < 1) {
      errors.number_of_children = 'Minimaal 1 kind bij huishoudtype gezin'
    } else if (data.number_of_children > 20) {
      errors.number_of_children = 'Voer een realistisch aantal in'
    }
  }

  return errors
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-xs text-red-500" role="alert">
      {message}
    </p>
  )
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

  // Show error for a field if it's been touched or the form was submitted
  const showError = (field: FieldKey) => (touched[field] || submitted) ? errors[field] : undefined

  const markTouched = (field: FieldKey) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const inputErrorClass = (field: FieldKey) =>
    showError(field)
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500'

  function handleNext() {
    setSubmitted(true)
    if (isValid) {
      onNext()
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-6">
        <StepProgress current="profiel" />
      </div>

      {/* FINN question */}
      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>Laten we beginnen met de basis. Wie ben je en wat verdien je?</SpeechBubble>
      </div>

      <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6">
        {/* Summary error banner when submitted with errors */}
        {submitted && !isValid && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-sm font-medium text-red-700">
              Vul alle verplichte velden correct in om door te gaan
            </p>
          </div>
        )}

        {/* Full name */}
        <div>
          <label htmlFor="ob-name" className="mb-1.5 block text-sm font-medium text-zinc-700">
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
            className={`w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none border focus:ring-1 ${inputErrorClass('full_name')}`}
          />
          {showError('full_name') && (
            <p id="ob-name-error" className="mt-1 text-xs text-red-500" role="alert">
              {showError('full_name')}
            </p>
          )}
        </div>

        {/* Date of birth */}
        <div>
          <label htmlFor="ob-dob" className="mb-1.5 block text-sm font-medium text-zinc-700">
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
            className={`w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none border focus:ring-1 ${inputErrorClass('date_of_birth')}`}
          />
          {showError('date_of_birth') && (
            <p id="ob-dob-error" className="mt-1 text-xs text-red-500" role="alert">
              {showError('date_of_birth')}
            </p>
          )}
        </div>

        {/* Household type */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-zinc-700">
            Huishouden <span className="text-red-400">*</span>
          </span>
          <div className="flex gap-2">
            {(['solo', 'samen', 'gezin'] as const).map((type) => (
              <button
                key={type}
                onClick={() => onChange({ ...data, household_type: type, number_of_children: type === 'gezin' ? Math.max(1, data.number_of_children) : 0 })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  data.household_type === type
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400'
                }`}
              >
                {type === 'solo' ? 'Solo' : type === 'samen' ? 'Samen' : 'Gezin'}
              </button>
            ))}
          </div>
        </div>

        {/* Number of children (if gezin) */}
        {data.household_type === 'gezin' && (
          <div>
            <label htmlFor="ob-children" className="mb-1.5 block text-sm font-medium text-zinc-700">
              Aantal kinderen
            </label>
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
              className={`w-24 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none border focus:ring-1 ${inputErrorClass('number_of_children')}`}
            />
            {showError('number_of_children') && (
              <p id="ob-children-error" className="mt-1 text-xs text-red-500" role="alert">
                {showError('number_of_children')}
              </p>
            )}
          </div>
        )}

        {/* Net monthly income */}
        <div>
          <label htmlFor="ob-income" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Netto maandinkomen <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
            <input
              id="ob-income"
              type="number"
              min={0}
              step={50}
              value={data.net_monthly_income}
              onChange={(e) => onChange({ ...data, net_monthly_income: e.target.value })}
              onBlur={() => markTouched('net_monthly_income')}
              placeholder="0"
              aria-invalid={!!showError('net_monthly_income')}
              aria-describedby={showError('net_monthly_income') ? 'ob-income-error' : undefined}
              className={`w-full rounded-lg bg-zinc-50 py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none border focus:ring-1 ${inputErrorClass('net_monthly_income')}`}
            />
          </div>
          {showError('net_monthly_income') ? (
            <p id="ob-income-error" className="mt-1 text-xs text-red-500" role="alert">
              {showError('net_monthly_income')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">
              Huishouden netto-inkomen (samen als je samenwoont).
            </p>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          className="w-full rounded-lg bg-wil-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Volgende
        </button>
      </div>
    </div>
  )
}
