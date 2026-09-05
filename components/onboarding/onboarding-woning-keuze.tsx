'use client'

import type { ReactNode } from 'react'
import { Home, KeyRound } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { StrategyTile } from './strategy-tile'
import {
  HOUSING_CHOICE_INTRO,
  HOUSING_CHOICE_OPTIONS,
  HOUSING_CHOICE_QUESTION,
  type HousingChoice,
} from '@/lib/housing-choice'

/**
 * Stap iii-a — "Telt je woning mee voor je vrijheid?" (ADR 0133).
 *
 * Verschijnt ÉÉN keer, binnen de bezittingen-sectie, direct nadat de gebruiker
 * zijn eerste eigen woning heeft toegevoegd (dus ná de hypotheek-vraag van de
 * QuickAddWizard). Wie geen woning heeft, ziet dit scherm nooit.
 *
 * Twee keuzes, in de woorden van de gebruiker (`HOUSING_CHOICE_OPTIONS`):
 *   · "Ja — ik verkoop hem ooit"  → `downsize` / `on_depletion` / marktwaarde
 *   · "Nee — hij telt niet mee"   → `exclude_from_fire`
 *
 * ALLE kopij komt letterlijk uit `lib/housing-choice.ts` — dezelfde bron die de
 * save-route naar `profiles.housing_strategy_config` vertaalt en die de
 * strategie-modal in Voorkeuren later hergebruikt, zodat de gebruiker daar
 * exact deze woorden terugziet. Dit bestand bevat daarom geen enkele eigen zin.
 *
 * Dit scherm rekent niets uit: het rapporteert alleen de keuze terug aan de
 * bezittingen-sectie, die 'm doorgeeft aan de orchestrator (CLAUDE.md —
 * consume, don't recompute). De grondslag-gevolgen (vrijheidsteller, eindscherm,
 * profielrij) hangen aan `housingChoiceToConfig`, niet aan deze component.
 *
 * Toegankelijkheid: de twee tegels staan in een `role="group"`. De vraag zelf is
 * de headline van de shell (die draagt de `<h1>` — onboarding valt buiten de
 * app-shell), dus de groep krijgt `aria-label` met diezelfde vraag in plaats van
 * `aria-labelledby` naar een tweede, dubbele vraagkop. Afwijking t.o.v.
 * `onboarding-eindstrategie.tsx` is bewust: dáár draagt de headline een andere
 * tekst ("Jouw plan") en zijn de twee vragen wél eigen `<h2>`-koppen.
 *
 * "Geld is opgeslagen tijd": deze keuze bepaalt of de stenen waarin je woont
 * meetellen als vrijheid die je kunt uitgeven, of pas op het moment dat je ze
 * verzilvert.
 */

/** Icoon per keuze — sleutel = verzilveren, huis = erin blijven wonen. */
const CHOICE_ICONS: Record<HousingChoice, ReactNode> = {
  sell: <KeyRound className="h-4 w-4" strokeWidth={2} />,
  exclude: <Home className="h-4 w-4" strokeWidth={2} />,
}

export interface OnboardingWoningKeuzeProps {
  /** De gemaakte keuze, of `null` zolang de gebruiker nog niets koos. */
  value: HousingChoice | null
  onChange: (choice: HousingChoice) => void
  /** Verder — pas mogelijk zodra er een keuze ligt. */
  onNext: () => void
  onBack: () => void
  /** Kop-taxonomie + voortgang komen van de sectie (groep "Bezit", iii.). */
  kicker: string
  romanNum?: string
  factsPanel: ReactNode
  currentStep: number
  totalSteps: number
}

export function OnboardingWoningKeuze({
  value,
  onChange,
  onNext,
  onBack,
  kicker,
  romanNum,
  factsPanel,
  currentStep,
  totalSteps,
}: OnboardingWoningKeuzeProps) {
  return (
    <OnboardingShell
      kicker={kicker}
      romanNum={romanNum}
      title={HOUSING_CHOICE_QUESTION}
      deck={HOUSING_CHOICE_INTRO}
      factsPanel={factsPanel}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={onNext}
          // Geen keuze = geen "Verder": de app mag hier geen kant kiezen namens
          // de gebruiker. De deck sluit af met de instructie ("Wat wil je dat de
          // app doet?") en de twee tegels zijn de enige andere bedienelementen,
          // dus dit is geen doodlopende weg.
          disabled={value === null}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--ink)]"
        >
          Verder
        </button>
      }
    >
      <div
        role="group"
        aria-label={HOUSING_CHOICE_QUESTION}
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
    </OnboardingShell>
  )
}
