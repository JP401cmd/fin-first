'use client'

import { useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import {
  computeRetirementPrefill,
  type RetirementPrefillMethod,
} from '@/lib/onboarding/retirement-prefill'

/**
 * Stap — Uitgaven na pensioen (optioneel).
 *
 * Maakt de tot nu toe ONZICHTBARE 80%-default (`resolveRetirementExpenseDefaults`
 * op de server) expliciet: de gebruiker ziet een **prefill (tip)** afgeleid van
 * de net-ingevoerde maanduitgaven (of het inkomen als fallback) en kan die met
 * één tik accepteren of bijstellen.
 *
 * Dit gaat over UITGAVEN later — niet over pensioen-INKOMEN (dat is de aparte
 * pensioen-stap). De copy maakt dat onderscheid expliciet zodat de gebruiker
 * niet denkt dat hij pensioen dubbel invult.
 *
 * **Consume-only:** het scherm legt alleen bedrag + methode vast. Het FIRE-doel
 * en de pensioenuitgave worden NIET hier herberekend — dat blijft van
 * `computeRetirementExpenses` + de horizon-kernel. De 80%-suggestie komt uit de
 * pure, geteste helper `computeRetirementPrefill`.
 *
 * Skipbaar via "Kan altijd later nog →" (consistent met pensioen/spaardoel):
 * bij skip stuurt de orchestrator niets mee → de impliciete server-default
 * (80%) blijft werken.
 *
 * "Geld is opgeslagen tijd": dit getal is de vrijheid die je later per jaar
 * inwisselt — in prijspeil van vandaag.
 */

export type RetirementExpenseMethodChoice = RetirementPrefillMethod

export interface RetirementExpenseState {
  /** Gekozen methode — `custom_amount` (een jaarbedrag) of `current_income` ("zelfde als nu"). */
  method: RetirementExpenseMethodChoice
  /** Bewerkbaar jaarbedrag als raw invoerstring (prijspeil vandaag). Leeg bij `current_income`. */
  customAmount: string
  /** True wanneer de gebruiker bewust heeft overgeslagen — gating voor de save-payload. */
  skipped: boolean
}

export const INITIAL_RETIREMENT_EXPENSE: RetirementExpenseState = {
  method: 'custom_amount',
  customAmount: '',
  skipped: false,
}

export interface OnboardingUitgavenPensioenProps {
  data: RetirementExpenseState
  onChange: (data: RetirementExpenseState) => void
  /** Net-ingevoerde maanduitgaven (€/maand) — primaire prefill-bron. */
  monthlyExpenses: number
  /** Netto maandinkomen (€/maand) — fallback-prefill-bron. */
  monthlyIncome: number
  onNext: () => void
  onBack: () => void
  /** "Kan altijd later nog" — markeert skipped en gaat door (impliciete default wint). */
  onSkip: () => void
  currentStep?: number
  totalSteps?: number
}

/** Format een heel-euro-bedrag als NL-display ("32.400") voor de prefill-input. */
function formatYearAmount(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(amount)
}

export function OnboardingUitgavenPensioen({
  data,
  onChange,
  monthlyExpenses,
  monthlyIncome,
  onNext,
  onBack,
  onSkip,
  currentStep = 2,
  totalSteps = 7,
}: OnboardingUitgavenPensioenProps) {
  // Pure, geteste prefill-suggestie. Géén recompute van het FIRE-doel.
  const prefill = useMemo(
    () => computeRetirementPrefill({ monthlyExpenses, monthlyIncome }),
    [monthlyExpenses, monthlyIncome],
  )

  // Het bedrag dat in de input staat: de gebruiker-bewerking (data.customAmount)
  // wint; anders de prefill-suggestie als startwaarde. Zo blijft het veld
  // bewerkbaar zonder de suggestie te overschrijven bij elke render.
  const displayAmount =
    data.customAmount !== ''
      ? data.customAmount
      : prefill.amount != null
        ? formatYearAmount(prefill.amount)
        : ''

  const tipCopy =
    prefill.basis === 'expenses'
      ? 'De meeste mensen geven na hun pensioen ≈ 80% van nu uit — woon-werkverkeer en pensioenopbouw vallen weg. Pas gerust aan.'
      : prefill.basis === 'income'
        ? 'We schatten op basis van je inkomen, omdat je je uitgaven nog niet hebt ingevuld. Pas gerust aan, of kies “zelfde als nu”.'
        : 'Je hebt je uitgaven en inkomen nog niet ingevuld. Kies “zelfde als nu” of bepaal het later.'

  // "Verder" mag altijd: bij `current_income` is geen bedrag nodig, bij
  // `custom_amount` valt een leeg veld terug op de impliciete server-default
  // (we sturen 'm dan niet als expliciet bedrag mee). Geen harde blokkade.
  const headline = (
    <>
      Wat denk je straks{' '}
      <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
        per jaar
      </em>{' '}
      nodig te hebben?
    </>
  )

  function selectAmountMethod() {
    // Terug naar bedrag-modus: herstel de prefill als startwaarde wanneer er
    // nog niets bewerkt is.
    onChange({
      ...data,
      method: 'custom_amount',
      skipped: false,
    })
  }

  function selectSameAsNow() {
    // "Zelfde als nu" → current_income, geen bedrag.
    onChange({
      method: 'current_income',
      customAmount: '',
      skipped: false,
    })
  }

  return (
    <OnboardingShell
      // Groep ii (`STEP_GROUP.uitgaven_pensioen = 2`) draagt drie schermen:
      // verdienen, uitgeven en uitgeven-later. Het cijfer noemt de GROEP, dus
      // alle drie voeren dezelfde kicker — een eigen naam onder hetzelfde
      // cijfer leest als een nieuwe categorie terwijl de teller stilstaat
      // (UR2-07). Bewaakt door `onboarding-kicker-taxonomie.test.ts`.
      kicker="Inkomen & uitgaven"
      romanNum="ii."
      title={headline}
      deck="Dit gaat over je uitgaven straks, na je pensioen — niet over je pensioeninkomen. Geef een bedrag in prijspeil van vandaag; inflatie rekenen wij er later overheen."
      factsPanel={
        <FactsPanel
          stat="≈ 80%"
          sub="van je huidige uitgaven is een veelgebruikte vuistregel voor na je pensioen"
          source="Indicatief · Nibud/CBS"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onNext}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            Verder
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Kan altijd later nog &rarr;
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Methode-chips: ≈80%/zelf een bedrag vs. zelfde als nu. */}
        <div className="flex flex-wrap gap-2">
          <MethodChip
            label={prefill.basis === 'expenses' ? '≈ 80% van nu' : 'Een bedrag per jaar'}
            active={data.method === 'custom_amount'}
            onClick={selectAmountMethod}
          />
          <MethodChip
            label="Zelfde als nu"
            active={data.method === 'current_income'}
            onClick={selectSameAsNow}
          />
        </div>

        {/* Bedrag-input — alleen bij custom_amount. */}
        {data.method === 'custom_amount' && (
          <div className="space-y-2 border-l-2 border-[var(--module-active-500)] pl-4">
            <label
              htmlFor="ob-retirement-amount"
              className="block text-sm font-medium text-[var(--ink-2)]"
            >
              Geschatte uitgaven per jaar{' '}
              <span className="text-xs font-normal italic text-[var(--ink-3)]">
                (in euro&apos;s van nu)
              </span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-4)]">
                &euro;
              </span>
              <input
                id="ob-retirement-amount"
                type="text"
                inputMode="decimal"
                value={displayAmount}
                onChange={(e) =>
                  onChange({
                    ...data,
                    method: 'custom_amount',
                    customAmount: e.target.value.replace(/[^0-9.,]/g, ''),
                    skipped: false,
                  })
                }
                placeholder="0"
                autoComplete="off"
                className="w-full border border-[var(--border-ed)] bg-[var(--subtle)] py-2.5 pr-3 pl-7 font-mono text-base tabular-nums text-[var(--ink)] outline-none focus:border-[var(--module-active-500)] focus:ring-1 focus:ring-[var(--module-active-500)] sm:text-sm"
              />
            </div>
            <p
              className="text-xs italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {tipCopy}
            </p>
          </div>
        )}

        {/* "Zelfde als nu"-toelichting. */}
        {data.method === 'current_income' && (
          <div className="border-l-2 border-[var(--module-active-500)] pl-4">
            <p
              className="text-sm italic text-[var(--ink-2)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              We houden je huidige levensstijl aan als uitgavenpatroon na je
              pensioen. Je kunt dit later altijd verfijnen.
            </p>
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

// ── Subcomponent ───────────────────────────────────────────────────────

function MethodChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 border-2 px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        active
          ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/50 text-[var(--ink)]'
          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-[var(--module-active-400)] hover:bg-[var(--module-active-50)]/30'
      }`}
    >
      {label}
    </button>
  )
}
