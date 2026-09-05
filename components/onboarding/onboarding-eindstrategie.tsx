'use client'

import { useState, type ReactNode } from 'react'
import { CalendarClock, Flame, Gift, Hourglass, Infinity as InfinityIcon, Landmark } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import { parseBedragInput } from './onboarding-inkomen'
import type { HorizonData } from './onboarding-horizon'
import {
  DEFAULT_FIRE_STRATEGY,
  isFireEndForm,
  type FireEndForm,
  type StopAnchorKind,
} from '@/lib/fire-strategy'
import {
  END_AGE_MAX,
  END_AGE_MIN,
  END_AGE_QUESTION,
  END_FORM_OPTIONS,
  END_FORM_QUESTION,
  END_REMAINDER_QUESTION,
  PERPETUAL_NO_END_AGE_NOTE,
  STOP_AGE_MAX,
  STOP_AGE_MIN,
  STOP_ANCHOR_OPTIONS,
  STOP_ANCHOR_QUESTION,
  defaultStopAge,
  endAgeHint,
  endFormShowsEndAge,
  validatePlanDraft,
  withEndForm,
  type PlanDraft,
  type PlanDraftErrors,
} from '@/lib/horizon/plan-draft'

/**
 * Stap vii — "Jouw plan" (laatste inhoudelijke vraag). Eén scherm, twee vragen,
 * gewone taal (ADR 0129, eigenaar-besluit 5 sep 2026):
 *
 *   1. Wanneer wil je stoppen met werken?  → het STOP-ANKER
 *      · Zo vroeg als het kan          (`solved`)
 *      · Op mijn AOW-leeftijd          (`aow`)
 *      · Op een leeftijd die ik kies   (`age` + leeftijdveld, halve jaren)
 *      Het anker `now` wordt hier bewust NIET aangeboden — een nieuwe gebruiker
 *      zonder plan hoort daar niet mee te beginnen; het blijft in Voorkeuren.
 *
 *   2. Tot welke leeftijd moet je geld reiken, en wat moet er dan nog over zijn?
 *      → éérst het eindleeftijd-veld (default 90), dán de EIND-VORM:
 *      · Niets, het mag op zijn                    (`deplete`, standaard)
 *      · Een bedrag voor later of voor anderen     (`legacy` + bedragveld, > 0)
 *      · Mijn vermogen mag niet slinken            (`perpetual`, verbergt de
 *        eindleeftijd — de app rekent dan zonder eindleeftijd)
 *
 * De kopij komt letterlijk uit `lib/horizon/plan-draft.ts` — dezelfde bron als
 * Voorkeuren en de strategie-modal, zodat de gebruiker later dezelfde woorden
 * terugziet. Beschrijvend, nooit aansporend: geen "je kunt stoppen", geen advies.
 *
 * Dit scherm rapporteert alleen z'n keuze terug aan de orchestrator (SET_HORIZON
 * via `onChange`-patches op de vijf plan-velden van `HorizonData`); het schrijft
 * uitsluitend eind-vormen in `fire_end_strategy`, nooit meer de labels
 * 'pensioen'/'nu-stoppen' (die zijn ankers). Validatie vóór "Verder" via
 * `validatePlanDraft` — zonder AOW-toets: de onboarding kent de AOW-tabel niet.
 * Grenzen (`END_AGE_MIN` 60 = DB-CHECK) komen via plan-draft uit lib/fire-strategy.
 *
 * Toegankelijkheid: één `role="alert"` (de samenvattingsbanner na "Verder");
 * veldfouten en hints hangen via `aria-describedby` aan hun invoer; de tegelrijen
 * zijn een `role="group"` met `aria-labelledby` naar hun vraagkop.
 *
 * "Geld is opgeslagen tijd": deze twee keuzes bepalen hoe de app je toekomst
 * doorrekent — vanaf wanneer werken een keuze wordt, en tot wanneer je geld
 * moet reiken.
 */

/** De vijf plan-velden van `HorizonData` die deze stap bewerkt. */
export type OnboardingPlanValue = Pick<
  HorizonData,
  'fire_end_strategy' | 'fire_end_age' | 'fire_legacy_amount' | 'fire_stop_anchor' | 'fire_stop_age'
>

/** De ankers die de onboarding aanbiedt — `now` bewust niet (blijft in Voorkeuren). */
export const ONBOARDING_STOP_ANCHORS: readonly StopAnchorKind[] = ['solved', 'aow', 'age']

const IDS = {
  vraag1: 'ob-plan-vraag-1',
  vraag2: 'ob-plan-vraag-2',
  vraag2Rest: 'ob-plan-vraag-2-rest',
  stopAge: 'ob-plan-stop-age',
  endAge: 'ob-plan-end-age',
  legacyAmount: 'ob-plan-legacy-amount',
} as const

/**
 * Onboarding-waarde → het plan-concept dat `validatePlanDraft` toetst. Het
 * bedragveld is een string en loopt door dezelfde `parseBedragInput` als de
 * save-body in page.tsx (één bedrag-parser: "100.000" → 100000, "2500,50" →
 * 2500,5). Leeg wordt NaN, zodat de validatie 'm als "geen bedrag" afwijst i.p.v.
 * stil €0 aan te nemen.
 */
export function planDraftFromOnboarding(value: OnboardingPlanValue): PlanDraft {
  const raw = value.fire_legacy_amount.trim()
  return {
    anchor: value.fire_stop_anchor,
    stopAge: value.fire_stop_age,
    endForm: isFireEndForm(value.fire_end_strategy) ? value.fire_end_strategy : 'deplete',
    endAge: value.fire_end_age,
    legacyAmount: raw === '' ? NaN : parseBedragInput(raw),
  }
}

export interface OnboardingEindstrategieProps {
  /** De vijf plan-velden uit de horizon-state. */
  value: OnboardingPlanValue
  /** Rapporteert een deel-wijziging terug; de orchestrator merget 'm in `HorizonData`. */
  onChange: (patch: Partial<OnboardingPlanValue>) => void
  /** Huidige leeftijd uit de geboortedatum (hele jaren); `null` = onbekend. Alleen voor de standaard-stopleeftijd. */
  currentAge?: number | null
  onNext: () => void
  onBack: () => void
  currentStep?: number
  totalSteps?: number
}

export function OnboardingEindstrategie({
  value,
  onChange,
  currentAge = null,
  onNext,
  onBack,
  currentStep = 7,
  totalSteps = 8,
}: OnboardingEindstrategieProps) {
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState<ReadonlySet<keyof PlanDraftErrors>>(() => new Set())

  const draft = planDraftFromOnboarding(value)
  const validatie = validatePlanDraft(draft)
  const showError = (key: keyof PlanDraftErrors): string | undefined =>
    submitted || touched.has(key) ? validatie.errors[key] : undefined
  const touch = (key: keyof PlanDraftErrors) =>
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  /** `aria-describedby`: de fout (als die er is) én de hint, in die volgorde. */
  const describedBy = (id: string, error: string | undefined) =>
    error ? `${id}-error ${id}-hint` : `${id}-hint`

  const kiesAnker = (kind: StopAnchorKind) => {
    if (kind === 'age') {
      onChange({
        fire_stop_anchor: 'age',
        fire_stop_age:
          value.fire_stop_age ?? defaultStopAge({ currentAge, endAge: value.fire_end_age }),
      })
      return
    }
    onChange({ fire_stop_anchor: kind, fire_stop_age: null })
  }

  // Via `withEndForm`: `perpetual` zet de (verborgen) eindleeftijd op 100, terug naar
  // een vorm mét eindleeftijd herstelt de standaard — zelfde regel als Voorkeuren.
  const kiesEindVorm = (form: FireEndForm) => {
    const next = withEndForm(draft, form)
    onChange({ fire_end_strategy: form, fire_end_age: next.endAge })
  }

  function handleNext() {
    setSubmitted(true)
    if (validatie.ok) onNext()
  }

  const headline = (
    <>
      Jouw{' '}
      <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
        plan
      </em>
    </>
  )

  const toontEindleeftijd = endFormShowsEndAge(draft.endForm)
  const stopAgeError = showError('stopAge')
  const endAgeError = showError('endAge')
  const legacyError = showError('legacyAmount')

  return (
    <OnboardingShell
      kicker="Toekomst"
      romanNum="vii."
      title={headline}
      deck="Twee keuzes waarmee de app je toekomst doorrekent: wanneer je wilt stoppen met werken, en tot welke leeftijd je geld moet reiken. Je past ze later altijd aan."
      factsPanel={
        <FactsPanel
          stat={`${DEFAULT_FIRE_STRATEGY.endAge} jaar`}
          sub="is de eindleeftijd waarmee de app standaard rekent: tot dan moet je geld reiken. Je kiest zelf een andere leeftijd als die beter bij je past."
          source="TriFinity · standaardinstelling van je plan"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={handleNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Verder
        </button>
      }
    >
      <div className="space-y-8">
        {/* De ENE alert op dit scherm — de veldfouten eronder zijn gewone tekst,
            gekoppeld via aria-describedby. */}
        {submitted && !validatie.ok && (
          <div className="border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
            <p className="text-sm font-medium text-amber-800">
              Controleer de gemarkeerde velden om door te gaan
            </p>
          </div>
        )}

        {/* ── Vraag 1: wanneer stoppen ──────────────────────────────────── */}
        <section aria-labelledby={IDS.vraag1} className="space-y-3">
          <VraagKop id={IDS.vraag1}>{STOP_ANCHOR_QUESTION}</VraagKop>
          <div role="group" aria-labelledby={IDS.vraag1} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STOP_ANCHOR_OPTIONS.filter((opt) => ONBOARDING_STOP_ANCHORS.includes(opt.kind)).map(
              (opt) => (
                <StrategyTile
                  key={opt.kind}
                  icon={ANCHOR_ICONS[opt.kind]}
                  label={opt.name}
                  sublabel={opt.subtitle}
                  active={value.fire_stop_anchor === opt.kind}
                  onClick={() => kiesAnker(opt.kind)}
                />
              ),
            )}
          </div>

          {value.fire_stop_anchor === 'age' && (
            <Veld
              id={IDS.stopAge}
              label="Stopleeftijd (halve jaren)"
              error={stopAgeError}
              hint="Jij kiest het moment; de app laat zien hoe het dan loopt."
            >
              <input
                id={IDS.stopAge}
                type="number"
                inputMode="decimal"
                min={STOP_AGE_MIN}
                max={STOP_AGE_MAX}
                step={0.5}
                value={value.fire_stop_age ?? ''}
                aria-invalid={stopAgeError ? true : undefined}
                aria-describedby={describedBy(IDS.stopAge, stopAgeError)}
                onChange={(e) => {
                  touch('stopAge')
                  onChange({
                    fire_stop_age: e.target.value === '' ? null : Number(e.target.value),
                  })
                }}
                className={INPUT_CLASS}
              />
            </Veld>
          )}
        </section>

        {/* ── Vraag 2: tot welke leeftijd, en wat blijft er over ─────────── */}
        <section aria-labelledby={IDS.vraag2} className="space-y-3">
          <VraagKop id={IDS.vraag2}>{END_FORM_QUESTION}</VraagKop>

          {toontEindleeftijd ? (
            <Veld
              id={IDS.endAge}
              label={END_AGE_QUESTION}
              error={endAgeError}
              hint={endAgeHint(draft.endForm)}
            >
              <input
                id={IDS.endAge}
                type="number"
                inputMode="numeric"
                min={END_AGE_MIN}
                max={END_AGE_MAX}
                step={1}
                value={value.fire_end_age}
                aria-invalid={endAgeError ? true : undefined}
                aria-describedby={describedBy(IDS.endAge, endAgeError)}
                onChange={(e) => {
                  touch('endAge')
                  onChange({ fire_end_age: Number(e.target.value) || 0 })
                }}
                className={INPUT_CLASS}
              />
            </Veld>
          ) : (
            <p
              className="text-sm italic leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {PERPETUAL_NO_END_AGE_NOTE}
            </p>
          )}

          <p id={IDS.vraag2Rest} className="pt-1 text-sm font-medium text-[var(--ink-2)]">
            {END_REMAINDER_QUESTION}
          </p>
          <div role="group" aria-labelledby={IDS.vraag2Rest} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {END_FORM_OPTIONS.map((opt) => (
              <StrategyTile
                key={opt.form}
                icon={END_FORM_ICONS[opt.form]}
                label={opt.name}
                sublabel={opt.subtitle}
                active={draft.endForm === opt.form}
                onClick={() => kiesEindVorm(opt.form)}
              />
            ))}
          </div>

          {draft.endForm === 'legacy' && (
            <Veld
              id={IDS.legacyAmount}
              label="Bedrag dat over moet blijven"
              error={legacyError}
              hint="In euro's van vandaag. Dit bedrag blijft over — de rest mag opraken."
              prefix="€"
            >
              <input
                id={IDS.legacyAmount}
                type="text"
                inputMode="decimal"
                value={value.fire_legacy_amount}
                placeholder="0"
                autoComplete="off"
                aria-invalid={legacyError ? true : undefined}
                aria-describedby={describedBy(IDS.legacyAmount, legacyError)}
                onChange={(e) => {
                  touch('legacyAmount')
                  onChange({ fire_legacy_amount: e.target.value.replace(/[^0-9.,]/g, '') })
                }}
                className={`${INPUT_CLASS} pl-7`}
              />
            </Veld>
          )}
        </section>
      </div>
    </OnboardingShell>
  )
}

// ── Subcomponenten ─────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full max-w-[12rem] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm'

const ANCHOR_ICONS: Record<StopAnchorKind, ReactNode> = {
  solved: <Flame className="h-4 w-4" strokeWidth={2} />,
  aow: <Landmark className="h-4 w-4" strokeWidth={2} />,
  age: <CalendarClock className="h-4 w-4" strokeWidth={2} />,
  now: null,
}

const END_FORM_ICONS: Record<FireEndForm, ReactNode> = {
  deplete: <Hourglass className="h-4 w-4" strokeWidth={2} />,
  legacy: <Gift className="h-4 w-4" strokeWidth={2} />,
  perpetual: <InfinityIcon className="h-4 w-4" strokeWidth={2} />,
}

/** Vraag-kop binnen de stap: de shell draagt de h1, de twee vragen zijn h2. */
function VraagKop({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="font-serif text-base leading-snug text-[var(--ink)] sm:text-lg"
      style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
    >
      {children}
    </h2>
  )
}

/**
 * Label + invoer + fout + hint — zelfde vorm als de bedragvelden in de pensioenstap.
 * De fout is gewone tekst (geen tweede `role="alert"`; de banner is de alert) en
 * hangt samen met de hint via `aria-describedby` aan de invoer (`{id}-error`,
 * `{id}-hint`). Foutkleur gelijk aan StopPlanVragen (amber).
 */
function Veld({
  id,
  label,
  error,
  hint,
  prefix,
  children,
}: {
  id: string
  label: string
  error?: string
  hint: string
  prefix?: string
  children: ReactNode
}) {
  return (
    <div className="border-l-2 border-[var(--module-active-500)] pl-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
            {prefix}
          </span>
        )}
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-amber-700">
          {error}
        </p>
      )}
      <p
        id={`${id}-hint`}
        className="mt-1 text-xs italic text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {hint}
      </p>
    </div>
  )
}

// Gemodelleerd naar de `ModeTile` in onboarding-pensioen.tsx — zelfde
// editorial A/B-tegel (border-2, module-accent-active, Playfair-label +
// italic Source Serif sublabel).
function StrategyTile({
  icon,
  label,
  sublabel,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-[112px] flex-col items-start gap-2 border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        active
          ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/50'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--module-active-400)] hover:bg-[var(--module-active-50)]/30'
      }`}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center text-[var(--module-active-700)]"
      >
        {icon}
      </span>
      <p
        className="font-serif text-[15px] leading-tight text-[var(--ink)] sm:text-base"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label}
      </p>
      <p
        className="font-serif text-xs italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sublabel}
      </p>
    </button>
  )
}
