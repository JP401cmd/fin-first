'use client'

import { Flame, Landmark } from 'lucide-react'
import { OnboardingShell } from './onboarding-shell'
import { FactsPanel } from './facts-panel'
import type { FireEndStrategy } from '@/lib/fire-strategy'

/**
 * Stap — Eindstrategie (laatste inhoudelijke vraag). Boldin-stijl: één vraag,
 * twee wegen. Bepaalt hoe TriFinity de toekomst voor je berekent.
 *
 * "Hoe wil je naar de toekomst kijken?" met twee A/B-uitkomsten:
 *   (i)  FIRE / financiële onafhankelijkheid — 'deplete': zien vanaf wanneer
 *        werken een keuze wordt; je vermogen mag richting een gekozen leeftijd
 *        opraken.
 *   (ii) Pensioenleeftijd — 'pensioen': werken tot aan de AOW ("to whatever
 *        end"), vermogen opbouwen tot je met pensioen gaat.
 *
 * Het scherm rapporteert alleen z'n keuze terug aan de orchestrator via de
 * bestaande `HorizonData.fire_end_strategy` (SET_HORIZON) — geen nieuwe
 * state-slice. `fire_end_age` blijft de bestaande default (90); niet functioneel
 * voor de pensioen-modus, dus onaangeroerd.
 *
 * "Geld is opgeslagen tijd": deze keuze bepaalt of we je vrijheid tonen als
 * *het moment waarop werken een keuze wordt*, of als *de weg naar je pensioen*.
 */

export interface OnboardingEindstrategieProps {
  /** Huidige eindstrategie uit de horizon-state (default 'deplete'). */
  strategy: FireEndStrategy
  /** Rapporteert de gekozen strategie terug — mapt de tegel op 'deplete'/'pensioen'. */
  onChange: (strategy: FireEndStrategy) => void
  onNext: () => void
  onBack: () => void
  currentStep?: number
  totalSteps?: number
}

export function OnboardingEindstrategie({
  strategy,
  onChange,
  onNext,
  onBack,
  currentStep = 7,
  totalSteps = 8,
}: OnboardingEindstrategieProps) {
  // Elke andere waarde dan 'pensioen' (perpetual/legacy/deplete) valt onder het
  // FIRE-beeld — de tegel is dan actief. Zo blijft een herstelde draft met een
  // afwijkende strategie coherent zonder de keuze te verliezen.
  const isPensioen = strategy === 'pensioen'

  const headline = (
    <>
      Hoe wil je naar de{' '}
      <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
        toekomst
      </em>{' '}
      kijken?
    </>
  )

  return (
    <OnboardingShell
      kicker="Toekomst"
      romanNum="vii."
      title={headline}
      deck="Twee manieren om vooruit te kijken. De ene toont vanaf wanneer werken een keuze wordt; de andere de weg tot je pensioen. Je kunt dit later altijd omzetten."
      factsPanel={
        <FactsPanel
          stat="67 jaar"
          sub="de AOW-leeftijd in 2025 — het moment waarop werken 'moet' ophoudt. Financiële onafhankelijkheid draait om de vraag: hoeveel eerder kan het een keuze worden?"
          source="Indicatief · SVB, AOW-leeftijd 2025"
        />
      }
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <button
          type="button"
          onClick={onNext}
          className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Verder
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StrategyTile
          icon={<Flame className="h-4 w-4" strokeWidth={2} />}
          label="Vanaf wanneer is werken een keuze?"
          sublabel="Financiële onafhankelijkheid — je vermogen mag richting een gekozen leeftijd opraken."
          active={!isPensioen}
          onClick={() => onChange('deplete')}
        />
        <StrategyTile
          icon={<Landmark className="h-4 w-4" strokeWidth={2} />}
          label="Werken tot pensioenleeftijd"
          sublabel="De klassieke weg: opbouwen tot de AOW, en zien wat dat je oplevert."
          active={isPensioen}
          onClick={() => onChange('pensioen')}
        />
      </div>
    </OnboardingShell>
  )
}

// ── Subcomponent ───────────────────────────────────────────────────────
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
  icon: React.ReactNode
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
