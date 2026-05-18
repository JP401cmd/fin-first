'use client'

import { useMemo } from 'react'
import { OnboardingShell } from './onboarding-shell'
import { GOAL_CATALOG } from '@/lib/goals/catalog'
import type { GoalSlug } from '@/lib/goals/types'
import type { SpaardoelPresetKey } from '@/lib/onboarding-presets'
import { formatCurrency } from '@/lib/format'

/**
 * Stap 5 — Klaar (recap-figures-strip + primaire CTA).
 *
 * Boldin "almost-done"-moment. Drie elementen:
 *   1. Editorial header (kicker "KLAAR · v." + headline + deck)
 *   2. Figures-strip met 4 cellen (recap):
 *        - Doel(en) → kicker `DOEL`, body italic Playfair labels
 *        - Inkomen → kicker `NETTO/MND`, body DM Mono €
 *        - Bezit  → kicker `NETTO VERMOGEN`, body DM Mono €
 *        - Voortgang → kicker `VOORTGANG`, body italic Playfair "100%" met
 *          highlight-marker (ui-ux skill: `--module-active-200` gradient)
 *   3. Primaire CTA `Begin met TriFinity` (orchestrator hangt save+redirect
 *      eraan; component noemt de save niet rechtstreeks).
 *   4. Secundaire tekstlink `Voeg nog iets toe →` (terug naar stap 4).
 *
 * **Niet hetzelfde als `onboarding-success.tsx`**: dat blijft het post-save
 * scherm (toont module-kaarten, Will-avatar, philosophical closing). Deze
 * stap leeft tussen stap 4 en de save-call.
 *
 * **Geen facts-paneel** — stap 5 vervangt het facts-paneel door de recap
 * zelf. We renderen daarom een lege placeholder voor de aside-kolom van de
 * shell (zodat de grid niet uit balans valt op desktop). De caller kan
 * later kiezen om hier alsnog een "tip"-paneel in te zetten.
 */
/**
 * Compact spaardoel-recap voor cel 4 van de figures-strip. Wanneer aanwezig
 * vervangt deze de standaard "Voortgang 100%"-cel met de gekozen label en
 * het streefbedrag. Skip-flow zet deze prop op `null` — dan blijft de
 * voortgangs-cel zichtbaar zoals altijd.
 */
export interface OnboardingKlaarSpaardoelRecap {
  presetKey: SpaardoelPresetKey
  /** Uiteindelijke label die de gebruiker invulde (na trim). */
  label: string
  /** Streefbedrag in euro's. */
  amount: number
}

export interface OnboardingKlaarProps {
  selectedGoals: GoalSlug[]
  netMonthlyIncome: number
  netWorth: number | null
  /**
   * Spaardoel-recap van stap v. — `null` wanneer de gebruiker geskipt of
   * niets ingevuld heeft. Caller (orchestrator) bepaalt deze gating.
   */
  spaardoel?: OnboardingKlaarSpaardoelRecap | null
  /** "Voeg nog iets toe →" — terug naar stap 4. */
  onAddMore: () => void
  /** Primaire CTA — orchestrator triggert save + redirect. */
  onFinish: () => void
  onBack: () => void
  /** 1-indexed stap-nummer voor de voortgangsbalk (default 6 sinds stap v.). */
  currentStep?: number
  totalSteps?: number
}

export function OnboardingKlaar({
  selectedGoals,
  netMonthlyIncome,
  netWorth,
  spaardoel = null,
  onAddMore,
  onFinish,
  onBack,
  currentStep = 6,
  totalSteps = 6,
}: OnboardingKlaarProps) {
  // Doel-labels — bij meerdere doelen voegen we ze samen met komma.
  // De gebruiker ziet de eerste twee in volle; bij ≥3 tonen we "+N" als
  // overflow-indicator om de cel-hoogte beheersbaar te houden.
  const goalLabel = useMemo(() => {
    if (selectedGoals.length === 0) return null
    const labels = selectedGoals.map((g) => GOAL_CATALOG[g]?.label).filter(Boolean)
    if (labels.length === 0) return null
    if (labels.length <= 2) return labels.join(' · ')
    return `${labels.slice(0, 2).join(' · ')} +${labels.length - 2}`
  }, [selectedGoals])

  // Detect minimal-input scenario: user only filled mandatory fields.
  // We adapt messaging to feel encouraging rather than incomplete.
  const hasOptionalData = netMonthlyIncome > 0 || netWorth !== null || spaardoel !== null

  const headline = (
    <>
      Bijna{' '}
      <em
        className="font-normal italic"
        style={{ color: 'var(--module-active-700)' }}
      >
        klaar
      </em>
      .
    </>
  )

  return (
    <OnboardingShell
      kicker="Klaar"
      romanNum="v."
      title={headline}
      deck={
        hasOptionalData
          ? "Een korte samenvatting van wat je hebt ingevuld. Je past alles later aan vanuit je dashboard."
          : "Je hebt de basis gelegd — de rest vul je aan in je eigen tempo vanuit je dashboard."
      }
      // Geen apart facts-paneel — recap zelf is de payoff.
      // We renderen een lege div als placeholder zodat de grid-kolom op
      // desktop niet collapseert.
      factsPanel={<div aria-hidden className="hidden lg:block" />}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onFinish}
            className="w-full min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
          >
            Begin met TriFinity
          </button>
          <button
            type="button"
            onClick={onAddMore}
            className="w-full min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            Voeg nog iets toe &rarr;
          </button>
        </div>
      }
    >
      {/* ── Figures-strip — 4 cellen op desktop, 2×2 op mobile ───────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-b border-[var(--ink)] my-2">
        {/* Cel 1: Doel(en) */}
        <RecapCell
          kicker="Doel"
          mobileBottomBorder
          value={
            goalLabel ? (
              <span
                className="block text-[16px] sm:text-[18px] italic leading-tight"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--ink)' }}
              >
                {goalLabel}
              </span>
            ) : (
              <span
                className="block text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Kies op je dashboard
              </span>
            )
          }
        />

        {/* Cel 2: Inkomen (€/mnd) */}
        <RecapCell
          kicker="Netto/mnd"
          mobileBottomBorder
          value={
            netMonthlyIncome > 0 ? (
              <span
                className="block text-[22px] sm:text-[28px] font-black leading-none tabular-nums tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--ink)' }}
              >
                {formatCurrency(netMonthlyIncome)}
              </span>
            ) : (
              <span
                className="block text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Vul je later aan
              </span>
            )
          }
        />

        {/* Cel 3: Netto vermogen */}
        <RecapCell
          kicker="Netto vermogen"
          value={
            netWorth === null ? (
              <span
                className="block text-[13px] italic leading-snug text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Vul je later aan
              </span>
            ) : (
              <span
                className="block text-[22px] sm:text-[28px] font-black leading-none tabular-nums tracking-[-0.02em]"
                style={{
                  fontFamily: 'var(--font-playfair, Georgia, serif)',
                  color: netWorth < 0 ? 'var(--negative)' : 'var(--ink)',
                }}
              >
                {formatCurrency(netWorth)}
              </span>
            )
          }
        />

        {/* Cel 4: Spaardoel (indien aanwezig) óf Voortgang als fallback. */}
        {spaardoel ? (
          <RecapCell
            kicker="Spaardoel"
            value={
              <span
                className="block text-[16px] sm:text-[18px] italic leading-tight"
                style={{
                  fontFamily: 'var(--font-playfair, Georgia, serif)',
                  color: 'var(--ink)',
                }}
              >
                {spaardoel.label}
                <span className="not-italic text-[var(--ink-3)]"> · </span>
                <span
                  className="tabular-nums px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {formatCurrency(spaardoel.amount)}
                </span>
              </span>
            }
          />
        ) : (
          <RecapCell
            kicker="Voortgang"
            value={
              <span
                className="block text-[22px] sm:text-[28px] font-black leading-none italic tabular-nums tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', color: 'var(--ink)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  100%
                </span>
              </span>
            }
          />
        )}
      </div>

      {/* Subtiele uitleg onder de strip — krant-italic, optioneel. */}
      <p
        className="mt-4 italic text-sm leading-snug text-[var(--ink-3)] max-w-[60ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {hasOptionalData
          ? 'Klopt het? Tik door naar je overzicht — alles is later aanpasbaar.'
          : 'Je bent klaar! Aanvullen kan altijd, vanuit je overzicht.'}
      </p>
    </OnboardingShell>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────

/**
 * Eén cel binnen de recap-figures-strip. Op mobile vormen de cellen een
 * 2×2-grid; de eerste twee cellen krijgen daarom op mobile een onder-rule
 * zodat de horizontale scheiding tussen de twee rijen zichtbaar blijft.
 */
function RecapCell({
  kicker,
  value,
  mobileBottomBorder,
}: {
  kicker: string
  value: React.ReactNode
  mobileBottomBorder?: boolean
}) {
  return (
    <div
      className={`p-3 sm:p-4 border-r border-[var(--rule-soft)] last:border-r-0 ${
        mobileBottomBorder ? 'border-b sm:border-b-0 border-[var(--rule-soft)]' : ''
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.20em] font-mono text-[var(--ink-3)] mb-1.5">
        {kicker}
      </div>
      {value}
    </div>
  )
}
