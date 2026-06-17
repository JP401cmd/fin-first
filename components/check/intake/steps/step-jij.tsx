'use client'

import { useState, useId } from 'react'
import type { HouseholdComposition } from '@/lib/check/types'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import { primaryBtn, fieldLabel, inputBase, inputError, errorText, hintText } from '../intake-styles'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
}

const HOUSEHOLD_OPTIONS: { value: HouseholdComposition; label: string; sub: string }[] = [
  { value: 'alleen', label: 'Alleen', sub: 'één inkomen, eigen huishouden' },
  { value: 'samen', label: 'Samen', sub: 'partner, gezamenlijk huishouden' },
  { value: 'gezin', label: 'Gezin', sub: 'partner + kinderen' },
]

function calcAge(dob: string): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

export function StepJij({ intake, onChange, onNext }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const dobId = useId()
  const nameId = useId()

  const age = calcAge(intake.dateOfBirth ?? '')

  const dobError =
    submitted && !intake.dateOfBirth
      ? 'Vul je geboortedatum in'
      : submitted && age === null
        ? 'Dat ziet er niet uit als een geldige datum'
        : submitted && age !== null && (age < 16 || age > 100)
          ? 'Vul een realistische geboortedatum in'
          : null

  const householdError =
    submitted && !intake.household ? 'Kies je huishoudtype' : null

  function handleNext() {
    setSubmitted(true)
    if (!intake.dateOfBirth || !intake.household || age === null) return
    if (age < 16 || age > 100) return
    onNext()
  }

  return (
    <div className="space-y-8">
      {/* Geboortedatum */}
      <div>
        <label htmlFor={dobId} className={fieldLabel}>
          Geboortedatum
        </label>
        <input
          id={dobId}
          type="date"
          value={intake.dateOfBirth ?? ''}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          aria-invalid={!!dobError}
          aria-describedby={dobError ? `${dobId}-err` : undefined}
          className={`${inputBase('kern')} px-3 py-2.5 font-mono text-sm tabular-nums ${dobError ? inputError : ''}`}
        />
        {age !== null && !dobError && (
          <p className={hintText}>
            {age} jaar
          </p>
        )}
        {dobError && (
          <p id={`${dobId}-err`} className={errorText} role="alert">
            {dobError}
          </p>
        )}
      </div>

      {/* Huishoudtype */}
      <div>
        <p className="mb-2 font-serif text-sm font-medium text-[var(--ink-2)]">
          Hoe woon en leef je?
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {HOUSEHOLD_OPTIONS.map((opt) => {
            const selected = intake.household === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ household: opt.value })}
                aria-pressed={selected}
                className={`flex flex-col items-start border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-500 ${
                  selected
                    ? 'border-kern-600 bg-kern-50 text-[var(--ink)]'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-kern-400 hover:bg-kern-50/50'
                }`}
              >
                <span className="font-display text-base font-semibold leading-tight">
                  {opt.label}
                </span>
                <span className="mt-0.5 font-serif text-xs italic text-[var(--ink-3)]">
                  {opt.sub}
                </span>
              </button>
            )
          })}
        </div>
        {householdError && (
          <p className={errorText} role="alert">
            {householdError}
          </p>
        )}
      </div>

      {/* Optioneel voornaam */}
      <div>
        <label htmlFor={nameId} className={fieldLabel}>
          Voornaam{' '}
          <span className="text-xs font-normal italic text-[var(--ink-3)]">
            (optioneel — voor de aanhef in je rapport)
          </span>
        </label>
        <input
          id={nameId}
          type="text"
          value={intake.firstName ?? ''}
          autoComplete="given-name"
          placeholder="bijv. Sarah"
          onChange={(e) => onChange({ firstName: e.target.value || null })}
          className={`${inputBase('kern')} px-3 py-2.5 font-serif text-sm`}
        />
      </div>

      {/* Verder-knop */}
      <button type="button" onClick={handleNext} className={primaryBtn('kern')}>
        Verder
      </button>
    </div>
  )
}
