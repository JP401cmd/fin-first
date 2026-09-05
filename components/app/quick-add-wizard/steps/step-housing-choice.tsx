'use client'

import type { ReactNode } from 'react'
import { Home, KeyRound, Loader2 } from 'lucide-react'
import { StrategyTile } from '@/components/onboarding/strategy-tile'
import {
  HOUSING_CHOICE_INTRO,
  HOUSING_CHOICE_OPTIONS,
  HOUSING_CHOICE_QUESTION,
  type HousingChoice,
} from '@/lib/housing-choice'

/**
 * Afsluitende stap — "Telt je woning mee voor je vrijheid?" (ADR 0133).
 *
 * De tweeling van `components/onboarding/onboarding-woning-keuze.tsx`, maar dan
 * BUITEN de onboarding: wie zijn eigen woning via de quick-add-wizard toevoegt
 * krijgt exact dezelfde vraag, direct ná de hypotheek-vraag (`StepLinkDebt`).
 * Zonder die vraag telt de app de overwaarde stilzwijgend mee alsof je die
 * vandaag kunt uitgeven — je kunt je huis niet opeten.
 *
 * ALLE kopij komt letterlijk uit `lib/housing-choice.ts`; dit bestand bevat geen
 * eigen formulering van de vraag, de intro of de twee opties. Zo leest de
 * gebruiker in de onboarding, hier en later in Voorkeuren dezelfde woorden.
 *
 * De keuze is OVERSLAANBAAR. De bezitting is op dit punt al opgeslagen; deze
 * stap mag die opslag nooit alsnog laten mislukken. "Overslaan" en een mislukte
 * PUT leiden daarom allebei gewoon naar het success-scherm — de fout wordt
 * getoond, niet als blokkade gebruikt.
 *
 * Vorm: identiek aan de zusterstap `StepLinkDebt` — een `<h4>`-vraag met
 * toelichting, de keuze, dan een primaire knop met een tekstuele overslaan-knop
 * eronder. De tegels zijn de gedeelde `StrategyTile` (aria-pressed, geen radio);
 * de `role="group"` wijst met `aria-labelledby` naar de vraagkop.
 *
 * Module-identiteit loopt volledig via `--module-active-*` binnen `StrategyTile`
 * (CLAUDE.md) — geen Tailwind-standaardkleur, geen losse hex.
 */

/** Icoon per keuze — sleutel = verzilveren, huis = erin blijven wonen. */
const CHOICE_ICONS: Record<HousingChoice, ReactNode> = {
  sell: <KeyRound className="h-4 w-4" strokeWidth={2} />,
  exclude: <Home className="h-4 w-4" strokeWidth={2} />,
}

const QUESTION_ID = 'quick-add-woning-keuze-vraag'

export interface StepHousingChoiceProps {
  /** De gemaakte keuze, of `null` zolang de gebruiker nog niets koos. */
  value: HousingChoice | null
  onChange: (choice: HousingChoice) => void
  /** Bevestigen — schrijft de keuze weg en rondt de wizard af. */
  onConfirm: () => void
  /** Overslaan — rondt af zonder keuze; de bezitting blijft staan. */
  onSkip: () => void
  isSaving: boolean
  /** Tekst van een mislukte opslag; blokkeert het afronden niet. */
  error: string | null
}

export function StepHousingChoice({
  value,
  onChange,
  onConfirm,
  onSkip,
  isSaving,
  error,
}: StepHousingChoiceProps) {
  return (
    <div className="flex flex-col gap-5 py-1">
      <div className="space-y-2">
        <h4
          id={QUESTION_ID}
          tabIndex={-1}
          className="font-serif text-xl italic leading-snug text-[var(--ink)]"
        >
          {HOUSING_CHOICE_QUESTION}
        </h4>
        <p className="text-sm leading-relaxed text-[var(--ink-3)]">
          {HOUSING_CHOICE_INTRO}
        </p>
      </div>

      <div
        role="group"
        aria-labelledby={QUESTION_ID}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {HOUSING_CHOICE_OPTIONS.map((opt) => (
          <StrategyTile
            key={opt.choice}
            icon={CHOICE_ICONS[opt.choice]}
            label={opt.name}
            sublabel={opt.subtitle}
            active={value === opt.choice}
            onClick={() => onChange(opt.choice)}
          />
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm leading-relaxed text-[var(--color-debt-700)]"
        >
          {error}
        </p>
      )}

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          // Geen keuze = geen "Verder": de app mag hier geen kant kiezen namens
          // de gebruiker. Wie niets wil kiezen, gebruikt "Overslaan" eronder —
          // dat is de expliciete uitweg, dus dit is geen doodlopende weg.
          disabled={value === null || isSaving}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
        >
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {isSaving ? 'Opslaan…' : error ? 'Opnieuw proberen' : 'Verder'}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={isSaving}
          className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 text-sm text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:opacity-40"
        >
          Overslaan
        </button>
      </div>
    </div>
  )
}
