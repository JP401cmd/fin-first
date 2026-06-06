'use client'

import { useState, useCallback, useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { OnboardingUpoSection, type PensionParseData } from './onboarding-upo-section'
import type { IdentityData } from './onboarding-identity'

/**
 * Stap 3 — Inkomen & huishouden.
 *
 * Pakt het uit `OnboardingIdentity` gestripte stuk op: huishoudens-type
 * (segmented control), aantal kinderen (conditional bij 'gezin'), en
 * netto-maandinkomen (currency, DM Mono input). `estimated_monthly_expenses`
 * komt **niet** terug — die wordt later afgeleid uit budget-defaults bij
 * eerste `/core/budgets`-bezoek.
 *
 * **Data-shape**: hergebruikt `IdentityData` via `Pick<>` zodat de
 * orchestrator één state-object blijft hanteren. Het component leeft naast
 * `OnboardingIdentity` en wijzigt alleen de drie velden hier.
 *
 * **Validatie**: huishouden altijd ingevuld (default 'solo' uit reducer);
 * netto-inkomen > 0 en ≤ €1.000.000; aantal kinderen 0..15 bij 'gezin'.
 *
 * **Facts-paneel**: mediaan netto inkomen NL = €3.350/mnd (CBS, 2024). Geen
 * dynamische evolution-slot — die is voorbehouden aan stap 4.
 */
type HouseholdType = 'solo' | 'samen' | 'gezin'

type IncomeData = Pick<
  IdentityData,
  'household_type' | 'number_of_children' | 'net_monthly_income'
>

type FieldKey = 'net_monthly_income' | 'number_of_children'

const FIELD_IDS: Record<FieldKey, string> = {
  net_monthly_income: 'ob-income',
  number_of_children: 'ob-kids',
}

const HOUSEHOLD_OPTIONS: readonly { value: HouseholdType; label: string; sub: string }[] = [
  { value: 'solo', label: 'Solo', sub: 'Ik woon alleen' },
  { value: 'samen', label: 'Samen', sub: 'Met partner' },
  { value: 'gezin', label: 'Gezin', sub: 'Met kinderen' },
] as const

function getFieldErrors(data: IncomeData): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  // Inkomen is optioneel — de gebruiker mag het later invullen via
  // Instellingen. Wel valideren wanneer er iets is ingevuld.
  if (data.net_monthly_income) {
    const cleaned = data.net_monthly_income.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    const income = Number(cleaned)
    if (isNaN(income)) {
      errors.net_monthly_income = 'Voer een geldig bedrag in'
    } else if (income < 0) {
      errors.net_monthly_income = 'Inkomen kan niet negatief zijn'
    } else if (income > 1000000) {
      errors.net_monthly_income = 'Voer een realistisch maandinkomen in'
    }
  }

  if (data.household_type === 'gezin') {
    if (data.number_of_children < 1) {
      errors.number_of_children = 'Vul minimaal 1 kind in'
    } else if (data.number_of_children > 15) {
      errors.number_of_children = 'Maximum is 15 kinderen'
    }
  }

  return errors
}

export interface OnboardingInkomenProps {
  data: IncomeData
  onChange: (data: IncomeData) => void
  onNext: () => void
  onBack: () => void
  /**
   * "Later invullen" — wist het inkomensveld en gaat naar de volgende stap.
   * Explicit defer-pad zodat de gebruiker duidelijk ziet dat overslaan OK is.
   * Indien niet meegegeven, valt terug op `onNext()` (puur doorgaan zonder
   * clear — backward-compat).
   */
  onSkipIncome?: () => void
  /** Parsed UPO pension data — null when nothing uploaded. */
  pensionData?: PensionParseData | null
  /** Callback when UPO is successfully parsed. */
  onPensionParsed?: (data: PensionParseData) => void
  /** Callback when UPO file is removed. */
  onPensionRemoved?: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 3). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingInkomen({
  data,
  onChange,
  onNext,
  onBack,
  onSkipIncome,
  pensionData,
  onPensionParsed,
  onPensionRemoved,
  currentStep = 3,
  totalSteps = 6,
}: OnboardingInkomenProps) {
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
    const fieldOrder: FieldKey[] = ['number_of_children', 'net_monthly_income']
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

  function selectHousehold(value: HouseholdType) {
    // Wisselt het type — bij wissel naar/uit 'gezin' resetten we kids zodat
    // we geen stale waarde houden ("samen, 3 kinderen" zou raar leesbaar zijn
    // in serializatie). 'gezin' krijgt default 1 als er nog geen waarde was.
    const next: IncomeData = { ...data, household_type: value }
    if (value === 'gezin') {
      next.number_of_children = data.number_of_children > 0 ? data.number_of_children : 1
    } else {
      next.number_of_children = 0
    }
    onChange(next)
  }

  const headline = (
    <>
      Wat{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        verdien
      </em>{' '}
      je?
    </>
  )

  return (
    <OnboardingShell
      kicker="Inkomen"
      romanNum="iii."
      title={headline}
      deck="Je inkomen bepaalt je tempo naar vrijheid — hoeveel je elke maand opzij kunt zetten. Schat liever te laag; je past het later aan."
      factsPanel={
        <FactsPanel
          stat="€3.350"
          sub="mediaan netto-inkomen NL per maand"
          source="CBS Inkomensstatistiek, 2024"
        />
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
          <div className="border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-sm font-medium text-red-700">
              Controleer de gemarkeerde velden
            </p>
          </div>
        )}

        {/* Huishouden — segmented control (3 grote tiles).
            Touch-target ≥44px gegarandeerd via min-h-[64px] per tile.
            Heeft altijd een default ('solo'), dus geen * nodig. */}
        <div>
          <p
            id="ob-household-label"
            className="mb-2 text-sm font-medium text-[var(--ink-2)]"
          >
            Huishouden
          </p>
          <div
            role="radiogroup"
            aria-labelledby="ob-household-label"
            className="grid grid-cols-3 gap-2"
          >
            {HOUSEHOLD_OPTIONS.map((option) => {
              const isActive = data.household_type === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => selectHousehold(option.value)}
                  className={`min-h-[64px] border-2 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
                    isActive
                      ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/60'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      isActive ? 'text-[var(--module-active-700)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {option.label}
                  </p>
                  <p
                    className="mt-0.5 text-[11px] italic leading-tight text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                  >
                    {option.sub}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Aantal kinderen — alleen bij 'gezin'. Native number-input zodat
            mobile een keypad opent zonder extra JS. */}
        {data.household_type === 'gezin' && (
          <div>
            <label
              htmlFor="ob-kids"
              className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
            >
              Aantal kinderen
            </label>
            <input
              id="ob-kids"
              type="number"
              inputMode="numeric"
              min={1}
              max={15}
              value={data.number_of_children || ''}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)))
                onChange({ ...data, number_of_children: val })
              }}
              onBlur={() => markTouched('number_of_children')}
              aria-invalid={!!showError('number_of_children')}
              aria-describedby={
                showError('number_of_children') ? 'ob-kids-error' : undefined
              }
              className={`w-32 bg-[var(--subtle)] px-3 py-2.5 text-base text-[var(--ink)] outline-none border focus:ring-1 font-mono tabular-nums sm:text-sm ${inputErrorClass('number_of_children')}`}
            />
            {showError('number_of_children') && (
              <p
                id="ob-kids-error"
                className="mt-1 text-xs text-red-500"
                role="alert"
              >
                {showError('number_of_children')}
              </p>
            )}
          </div>
        )}

        {/* Netto maandinkomen — DM Mono input met EUR-prefix. Optioneel
            sinds feature #828: gebruiker kan later invullen via Instellingen. */}
        <div>
          <label
            htmlFor="ob-income"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Netto maandinkomen{' '}
            <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id="ob-income"
              type="text"
              inputMode="decimal"
              value={data.net_monthly_income}
              onChange={(e) => {
                // Sta alleen cijfers + één scheidingsteken toe. We bewaren
                // de raw string; validatie parse't bij submit.
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                onChange({ ...data, net_monthly_income: val })
              }}
              onBlur={() => markTouched('net_monthly_income')}
              placeholder="0"
              autoComplete="off"
              aria-invalid={!!showError('net_monthly_income')}
              aria-describedby={
                showError('net_monthly_income') ? 'ob-income-error' : 'ob-income-hint'
              }
              className={`w-full bg-[var(--subtle)] py-2.5 pr-3 pl-7 text-base text-[var(--ink)] outline-none border focus:ring-1 font-mono tabular-nums sm:text-sm ${inputErrorClass('net_monthly_income')}`}
            />
          </div>
          {showError('net_monthly_income') ? (
            <p
              id="ob-income-error"
              className="mt-1 text-xs text-red-500"
              role="alert"
            >
              {showError('net_monthly_income')}
            </p>
          ) : (
            <p
              id="ob-income-hint"
              className="mt-1 text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Netto per maand voor je hele huishouden. Later aanpasbaar.
            </p>
          )}

          {/* "Later invullen" defer-link — expliciet signaal dat het veld
              optioneel is en dat overslaan volledig OK is. Alleen tonen als
              het veld nog leeg is — zodra de gebruiker iets typt, is de
              primary "Verder"-knop de natuurlijke flow (feature #829). */}
          {onSkipIncome && !data.net_monthly_income && (
            <button
              type="button"
              onClick={onSkipIncome}
              className="mt-2 min-h-8 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Later invullen &rarr;
            </button>
          )}
        </div>

        {/* UPO (Uniform Pensioenoverzicht) upload — optioneel. Gebruiker
            kan een PDF van mijnpensioenoverzicht.nl uploaden om AOW-bedrag
            en werknemerspensioen automatisch in te vullen. Overslaan is
            altijd mogelijk — de sectie is standaard ingeklapt. */}
        {onPensionParsed && (
          <OnboardingUpoSection
            pensionData={pensionData ?? null}
            onParsed={onPensionParsed}
            onRemoved={onPensionRemoved ?? (() => {})}
          />
        )}
      </div>
    </OnboardingShell>
  )
}
