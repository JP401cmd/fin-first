'use client'

import { useState, useCallback, useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import type { IdentityData } from './onboarding-identity'

/**
 * Stap 3 — Inkomen & uitgaven.
 *
 * Vraagt twee schattingen uit die samen de spaarquote bepalen:
 * geschat netto-jaarinkomen en geschatte maandelijkse uitgaven. Beide
 * landen als handmatige bron ("eigen bedrag") in het blok
 * "Instellingen & toekomst" op /overzicht/cashflow en voeden via
 * `resolveSavingsSource` de FIRE-prognose — zo heeft een verse gebruiker
 * zonder transacties direct een werkende spaarquote in de toekomst-views.
 *
 * Huishoudens-type en pensioen-upload (UPO) zijn bewust uit deze stap
 * verwijderd (jun 2026): huishouden loopt via de partner-koppeling op
 * /mijn/profiel, pensioen via /toekomst.
 *
 * **Data-shape**: hergebruikt `IdentityData` via `Pick<>` zodat de
 * orchestrator één state-object blijft hanteren.
 *
 * **Validatie**: beide velden optioneel ("Later invullen" blijft een
 * expliciet defer-pad); wanneer ingevuld moet het bedrag geldig en
 * realistisch zijn.
 *
 * **Facts-paneel**: mediaan netto inkomen NL = €3.350/mnd ≈ €40.200/jaar
 * (CBS, 2024).
 */
type IncomeData = Pick<
  IdentityData,
  'estimated_yearly_income' | 'estimated_monthly_expenses'
>

type FieldKey = 'estimated_yearly_income' | 'estimated_monthly_expenses'

const FIELD_IDS: Record<FieldKey, string> = {
  estimated_yearly_income: 'ob-income',
  estimated_monthly_expenses: 'ob-expenses',
}

/**
 * Parse een NL-invoerstring ("45.000" / "2.150,50") naar een Number.
 * Zelfde cleaning als de orchestrator gebruikt bij het opbouwen van de
 * save-payload — punt/komma als duizendtal-separator strippen, komma als
 * decimaal accepteren.
 */
export function parseBedragInput(s: string): number {
  const cleaned = s.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
  return Number(cleaned)
}

function getFieldErrors(data: IncomeData): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}

  // Beide velden zijn optioneel — de gebruiker mag ze later invullen via
  // /overzicht/cashflow. Wel valideren wanneer er iets is ingevuld.
  if (data.estimated_yearly_income) {
    const income = parseBedragInput(data.estimated_yearly_income)
    if (isNaN(income)) {
      errors.estimated_yearly_income = 'Voer een geldig bedrag in'
    } else if (income < 0) {
      errors.estimated_yearly_income = 'Inkomen kan niet negatief zijn'
    } else if (income > 2000000) {
      errors.estimated_yearly_income = 'Voer een realistisch jaarinkomen in'
    }
  }

  if (data.estimated_monthly_expenses) {
    const expenses = parseBedragInput(data.estimated_monthly_expenses)
    if (isNaN(expenses)) {
      errors.estimated_monthly_expenses = 'Voer een geldig bedrag in'
    } else if (expenses < 0) {
      errors.estimated_monthly_expenses = 'Uitgaven kunnen niet negatief zijn'
    } else if (expenses > 1000000) {
      errors.estimated_monthly_expenses = 'Voer realistische maanduitgaven in'
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
   * "Later invullen" — wist beide velden en gaat naar de volgende stap.
   * Explicit defer-pad zodat de gebruiker duidelijk ziet dat overslaan OK is.
   * Indien niet meegegeven, valt terug op `onNext()` (puur doorgaan zonder
   * clear — backward-compat).
   */
  onSkipIncome?: () => void
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
  currentStep = 2,
  totalSteps = 5,
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
    const fieldOrder: FieldKey[] = ['estimated_yearly_income', 'estimated_monthly_expenses']
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

  // Live spaarquote-preview: zodra beide velden valide zijn ingevuld tonen
  // we wat de schattingen betekenen — directe feedback dat deze twee
  // getallen samen het tempo naar vrijheid bepalen.
  const previewRate = useMemo(() => {
    if (!data.estimated_yearly_income || !data.estimated_monthly_expenses) return null
    if (Object.keys(errors).length > 0) return null
    const yearly = parseBedragInput(data.estimated_yearly_income)
    const monthlyExpenses = parseBedragInput(data.estimated_monthly_expenses)
    if (!isFinite(yearly) || yearly <= 0 || !isFinite(monthlyExpenses)) return null
    const monthlyIncome = yearly / 12
    return Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
  }, [data.estimated_yearly_income, data.estimated_monthly_expenses, errors])

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
      romanNum="ii."
      title={headline}
      deck="Je inkomen en uitgaven bepalen samen je spaarquote — het tempo waarin je vrijheid opbouwt. Schat gerust; je past het later aan."
      factsPanel={
        <FactsPanel
          stat="€3.350"
          sub="mediaan netto-inkomen NL per maand (≈ €40.200 per jaar)"
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

        {/* Geschat jaarinkomen (netto) — DM Mono input met EUR-prefix.
            Optioneel: gebruiker kan later invullen via /overzicht/cashflow. */}
        <div>
          <label
            htmlFor="ob-income"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Geschat jaarinkomen (netto){' '}
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
              value={data.estimated_yearly_income}
              onChange={(e) => {
                // Sta alleen cijfers + scheidingstekens toe. We bewaren
                // de raw string; validatie parse't bij submit.
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                onChange({ ...data, estimated_yearly_income: val })
              }}
              onBlur={() => markTouched('estimated_yearly_income')}
              placeholder="0"
              autoComplete="off"
              aria-invalid={!!showError('estimated_yearly_income')}
              aria-describedby={
                showError('estimated_yearly_income') ? 'ob-income-error' : 'ob-income-hint'
              }
              className={`w-full bg-[var(--subtle)] py-2.5 pr-3 pl-7 text-base text-[var(--ink)] outline-none border focus:ring-1 font-mono tabular-nums sm:text-sm ${inputErrorClass('estimated_yearly_income')}`}
            />
          </div>
          {showError('estimated_yearly_income') ? (
            <p
              id="ob-income-error"
              className="mt-1 text-xs text-red-500"
              role="alert"
            >
              {showError('estimated_yearly_income')}
            </p>
          ) : (
            <p
              id="ob-income-hint"
              className="mt-1 text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Netto per jaar, inclusief vakantiegeld. Later aanpasbaar.
            </p>
          )}
        </div>

        {/* Geschatte maandelijkse uitgaven — zelfde patroon. Samen met het
            jaarinkomen bepaalt dit de spaarquote op /overzicht/cashflow en
            in de toekomst-prognose. */}
        <div>
          <label
            htmlFor="ob-expenses"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Geschatte maandelijkse uitgaven{' '}
            <span className="text-xs font-normal italic text-[var(--ink-3)]">(optioneel)</span>
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
              &euro;
            </span>
            <input
              id="ob-expenses"
              type="text"
              inputMode="decimal"
              value={data.estimated_monthly_expenses}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '')
                onChange({ ...data, estimated_monthly_expenses: val })
              }}
              onBlur={() => markTouched('estimated_monthly_expenses')}
              placeholder="0"
              autoComplete="off"
              aria-invalid={!!showError('estimated_monthly_expenses')}
              aria-describedby={
                showError('estimated_monthly_expenses') ? 'ob-expenses-error' : 'ob-expenses-hint'
              }
              className={`w-full bg-[var(--subtle)] py-2.5 pr-3 pl-7 text-base text-[var(--ink)] outline-none border focus:ring-1 font-mono tabular-nums sm:text-sm ${inputErrorClass('estimated_monthly_expenses')}`}
            />
          </div>
          {showError('estimated_monthly_expenses') ? (
            <p
              id="ob-expenses-error"
              className="mt-1 text-xs text-red-500"
              role="alert"
            >
              {showError('estimated_monthly_expenses')}
            </p>
          ) : (
            <p
              id="ob-expenses-hint"
              className="mt-1 text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Alles bij elkaar: wonen, boodschappen, abonnementen. Later aanpasbaar.
            </p>
          )}
        </div>

        {/* Spaarquote-preview — verschijnt zodra beide schattingen er staan.
            Maakt direct zichtbaar waarom we deze twee getallen vragen. */}
        {previewRate !== null && (
          <div className="border border-[var(--border-ed)] bg-[var(--module-active-50)]/40 px-4 py-3">
            <p className="text-sm text-[var(--ink-2)]">
              Je spaarquote komt hiermee op{' '}
              <span className="font-mono font-bold tabular-nums text-[var(--module-active-700)]">
                {previewRate}%
              </span>
              {' '}— dit drijft je toekomst-prognose.
            </p>
          </div>
        )}

        {/* "Later invullen" defer-link — expliciet signaal dat de velden
            optioneel zijn en dat overslaan volledig OK is. Alleen tonen als
            beide velden nog leeg zijn — zodra de gebruiker iets typt, is de
            primary "Verder"-knop de natuurlijke flow (feature #829). */}
        {onSkipIncome && !data.estimated_yearly_income && !data.estimated_monthly_expenses && (
          <button
            type="button"
            onClick={onSkipIncome}
            className="min-h-8 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Later invullen &rarr;
          </button>
        )}
      </div>
    </OnboardingShell>
  )
}
