'use client'

import { useState, useCallback, useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import type { IdentityData } from './onboarding-identity'

/**
 * Stap 3 — Inkomen & uitgaven.
 *
 * Vraagt twee schattingen uit die samen de spaarquote bepalen: geschat
 * netto-MAANDinkomen en geschatte maandelijkse uitgaven. Beide velden zijn
 * nu per maand uitgevraagd (jun 2026) zodat de gebruiker twee vergelijkbare
 * grootheden invult. De orchestrator converteert het maandinkomen bij save
 * naar `estimated_yearly_income` (×12) — dat blijft de canonieke opgeslagen
 * waarde, zodat alle downstream (resolveSavingsSource / FIRE-prognose /
 * check-intake) ongewijzigd op een jaarinkomen blijft rekenen. Beide landen
 * als handmatige bron ("eigen bedrag") in het blok "Instellingen & toekomst"
 * op /overzicht/cashflow en voeden via `resolveSavingsSource` de
 * FIRE-prognose — zo heeft een verse gebruiker zonder transacties direct een
 * werkende spaarquote in de toekomst-views.
 *
 * Huishoudens-type en pensioen-upload (UPO) zijn bewust uit deze stap
 * verwijderd (jun 2026): huishouden loopt via de partner-koppeling op
 * /mijn/profiel, pensioen via /toekomst.
 *
 * **Data-shape**: hergebruikt `IdentityData` via `Pick<>` zodat de
 * orchestrator één state-object blijft hanteren. Het inkomensveld is
 * `net_monthly_income` (maandbedrag); de orchestrator leidt het jaarinkomen
 * daaruit af.
 *
 * **Validatie**: beide velden optioneel ("Later invullen" blijft een
 * expliciet defer-pad); wanneer ingevuld moet het bedrag geldig en
 * realistisch zijn.
 *
 * **Facts-paneel**: mediaan netto inkomen NL = €3.350/mnd (CBS, 2024) —
 * directe maand-vergelijking met het uitgevraagde maandinkomen.
 */
type IncomeData = Pick<
  IdentityData,
  'net_monthly_income' | 'estimated_monthly_expenses'
>

type FieldKey = 'net_monthly_income' | 'estimated_monthly_expenses'

const FIELD_IDS: Record<FieldKey, string> = {
  net_monthly_income: 'ob-income',
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
  // Drempel is een MAANDbedrag (~€170.000/mnd is ruim boven elk realistisch
  // netto maandinkomen) sinds het inkomen per maand wordt uitgevraagd.
  if (data.net_monthly_income) {
    const income = parseBedragInput(data.net_monthly_income)
    if (isNaN(income)) {
      errors.net_monthly_income = 'Voer een geldig bedrag in'
    } else if (income < 0) {
      errors.net_monthly_income = 'Inkomen kan niet negatief zijn'
    } else if (income > 170000) {
      errors.net_monthly_income = 'Voer een realistisch maandinkomen in'
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
   * "Later invullen" — wist beide velden en slaat de hele inkomen-groep over.
   * Explicit defer-pad zodat de gebruiker duidelijk ziet dat overslaan OK is.
   * Indien niet meegegeven, valt terug op `onNext()` (puur doorgaan zonder
   * clear — backward-compat).
   */
  onSkipIncome?: () => void
  /**
   * Welk veld dit scherm uitvraagt (begeleide flow — één vraag per scherm,
   * jun 2026). `'inkomen'` toont alleen het maandinkomen, `'uitgaven'` alleen
   * de uitgaven (met de spaarquote-preview die "onthult" zodra beide bekend
   * zijn). Default (undefined) = beide velden op één scherm (backward-compat).
   */
  field?: 'inkomen' | 'uitgaven'
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 2). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingInkomen({
  data,
  onChange,
  onNext,
  onBack,
  onSkipIncome,
  field,
  currentStep = 2,
  totalSteps = 7,
}: OnboardingInkomenProps) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  // Welke velden dit scherm toont/valideert.
  const activeFields: FieldKey[] =
    field === 'inkomen'
      ? ['net_monthly_income']
      : field === 'uitgaven'
        ? ['estimated_monthly_expenses']
        : ['net_monthly_income', 'estimated_monthly_expenses']
  const showIncome = activeFields.includes('net_monthly_income')
  const showExpenses = activeFields.includes('estimated_monthly_expenses')

  const allErrors = useMemo(() => getFieldErrors(data), [data])
  const errors = useMemo(() => {
    const e: Partial<Record<FieldKey, string>> = {}
    for (const f of activeFields) if (allErrors[f]) e[f] = allErrors[f]
    return e
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allErrors, field])
  const isValid = Object.keys(errors).length === 0
  const disableNext = submitted && !isValid

  const showError = (f: FieldKey) =>
    touched[f] || submitted ? errors[f] : undefined
  const markTouched = (f: FieldKey) =>
    setTouched((prev) => ({ ...prev, [f]: true }))

  const inputErrorClass = (f: FieldKey) =>
    showError(f)
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-[var(--border-ed)] focus:border-[var(--module-active-500)] focus:ring-[var(--module-active-500)]'

  const scrollToFirstError = useCallback(() => {
    for (const f of activeFields) {
      if (errors[f]) {
        const el = document.getElementById(FIELD_IDS[f])
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus()
        }
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, field])

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
  // getallen samen het tempo naar vrijheid bepalen. In de gesplitste flow
  // "onthult" de preview op het uitgaven-scherm (beide waarden bekend).
  const previewRate = useMemo(() => {
    if (!data.net_monthly_income || !data.estimated_monthly_expenses) return null
    if (allErrors.net_monthly_income || allErrors.estimated_monthly_expenses) return null
    // Het inkomensveld is nu al een MAANDbedrag — geen /12 meer (anders zou
    // de spaarquote dubbel gedeeld en daardoor fout zijn).
    const monthlyIncome = parseBedragInput(data.net_monthly_income)
    const monthlyExpenses = parseBedragInput(data.estimated_monthly_expenses)
    if (!isFinite(monthlyIncome) || monthlyIncome <= 0 || !isFinite(monthlyExpenses)) return null
    return Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
  }, [data.net_monthly_income, data.estimated_monthly_expenses, allErrors])
  // Preview tonen op het uitgaven-scherm én op het gecombineerde scherm.
  const showPreview = previewRate !== null && field !== 'inkomen'

  const headline =
    field === 'uitgaven' ? (
      <>
        Wat{' '}
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          geef
        </em>{' '}
        je uit?
      </>
    ) : (
      <>
        Wat{' '}
        <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
          verdien
        </em>{' '}
        je?
      </>
    )
  const deck =
    field === 'inkomen'
      ? 'Je netto maandinkomen is het startpunt — het tempo waarin je vrijheid kunt opbouwen. Schat gerust; je kunt het later aanpassen.'
      : field === 'uitgaven'
        ? 'Je uitgaven bepalen samen met je inkomen je spaarquote. Zo zie je direct hoe snel je vrijheid groeit.'
        : 'Je inkomen en uitgaven bepalen samen je spaarquote — het tempo waarin je vrijheid opbouwt. Schat gerust; je past het later aan.'

  return (
    <OnboardingShell
      kicker="Inkomen"
      romanNum="ii."
      title={headline}
      deck={deck}
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

        {/* Geschat netto maandinkomen — DM Mono input met EUR-prefix.
            Optioneel: gebruiker kan later invullen via /overzicht/cashflow.
            De orchestrator converteert dit maandbedrag bij save naar het
            canonieke jaarinkomen (×12). */}
        {showIncome && (
        <div>
          <label
            htmlFor="ob-income"
            className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]"
          >
            Geschat netto maandinkomen{' '}
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
                // Sta alleen cijfers + scheidingstekens toe. We bewaren
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
              Netto per maand, inclusief vakantiegeld naar rato. Later aanpasbaar.
            </p>
          )}
        </div>
        )}

        {/* Geschatte maandelijkse uitgaven — zelfde patroon. Samen met het
            jaarinkomen bepaalt dit de spaarquote op /overzicht/cashflow en
            in de toekomst-prognose. */}
        {showExpenses && (
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
        )}

        {/* Spaarquote-preview — verschijnt zodra beide schattingen er staan.
            "Onthult" op het uitgaven-scherm in de gesplitste flow. */}
        {showPreview && (
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
        {onSkipIncome && field !== 'uitgaven' && !data.net_monthly_income && !data.estimated_monthly_expenses && (
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
