'use client'

import type { ReactNode } from 'react'
import { OnboardingProgressBar } from './progress-bar'
import {
  OnboardingFreedomTickerRow,
  useOnboardingFreedomTicker,
} from './freedom-ticker'

/**
 * Editorial-split layout-shell voor de onboarding-stappen.
 *
 * Verantwoordelijkheid: levert de chrome rond een individuele stap —
 *   1. Sticky 1px voortgangsbalk top (met optionele back-affordance)
 *   2. Twee-koloms grid op desktop (≥lg) — links form, rechts facts-paneel
 *   3. Single-column fallback op mobile — facts-paneel verschijnt als
 *      border-l-callout onder de input (het FactsPanel zelf regelt z'n eigen
 *      mobile-styling met breakpoint-classes; hier kiezen we alleen de
 *      grid-layout)
 *   4. Sticky bottom CTA-bar op mobile (safe-area-aware), inline footer-row
 *      op desktop — verzorgd via de `footer` slot
 *   5. Editorial header (kicker met streep + romeinse num + headline-em +
 *      deck) bovenaan de form-kolom — alle drie via props zodat de stappen
 *      zelf geen layout-werk doen
 *
 * Niet-verantwoordelijk: stap-specifieke validatie, data, of state.
 * De stap-componenten leveren `children` (form-velden) + `footer` (CTAs).
 *
 * **Module-tinten**: scope is bewust onaangetast — het is de
 * verantwoordelijkheid van de onboarding-page (één laag hoger) om
 * `--module-active-*` op kern-shades te zetten via een wrapper-style.
 * Dit shell-component leest alleen die tokens.
 *
 * **Layout-tokens**:
 * - Grid `lg:grid-cols-[1fr_360px]` — matches plan §"Visuele blueprint"
 * - Vertical divider via `lg:border-r border-[var(--rule-soft)]` op links
 * - Padding asymmetrisch: links `lg:pr-10`, rechts `lg:pl-10` — geeft de
 *   visuele "kolomscheiding" zonder een eigen divider-element
 * - Max-width 1080px op outer-wrapper zodat de split op brede schermen
 *   gecentreerd blijft (editorial krant-feel, geen full-bleed)
 */
export interface OnboardingShellProps {
  /** Kicker-tekst zonder streep — bv. "DOEL", "PROFIEL", "INKOMEN". */
  kicker: string
  /** Romeinse num — bv. "i.", "ii.", "iii.", "iv.", "v.". Optioneel: zonder
   *  rendert de kicker zonder romeins cijfer (compact, voor stappen zonder nummering). */
  romanNum?: string
  /** Headline — kan plain string of JSX bevatten (bv. `<>Waar help ik je <em>mee</em>?</>`).
   *  Aanbevolen: ReactNode met inline italic-em in `--module-active-700`,
   *  zie ui-ux skill patroon-kaart *Headline-emphasis*. */
  title: ReactNode
  /** Editorial deck-tekst onder de headline. */
  deck: string
  /** Facts-paneel content — meestal `<FactsPanel ... />`. */
  factsPanel: ReactNode
  /** Stap-specifieke form-content. */
  children: ReactNode
  /** CTA-bar content (Verder/Terug-knoppen). Wordt sticky op mobile, inline
   *  op desktop. Caller levert de knoppen zelf — shell wrapt alleen styling. */
  footer: ReactNode
  /** Huidige 1-indexed stap-nummer voor de voortgangsbalk. */
  currentStep: number
  /** Totaal aantal content-stappen voor de voortgangsbalk. */
  totalSteps: number
  /** Optionele back-handler — verschijnt als "← Terug" tekstlink links van
   *  de voortgangsbalk. Niet renderen op stap 1 (geen vorige stap). */
  onBack?: () => void
}

export function OnboardingShell({
  kicker,
  romanNum,
  title,
  deck,
  factsPanel,
  children,
  footer,
  currentStep,
  totalSteps,
  onBack,
}: OnboardingShellProps) {
  // Meelopende vrijheidstijd-teller. De orchestrator zet 'm in de context
  // (zie `OnboardingFreedomTickerProvider`); elke stap krijgt 'm daardoor
  // zonder eigen prop-plumbing. `null` = nog niets eerlijks te tonen.
  const freedomTicker = useOnboardingFreedomTicker()

  return (
    <div className="w-full">
      {/* Sticky top: voortgangsbalk + back-affordance.
          De balk hangt aan de wrapper z'n top — sticky positioning is
          relatief aan de scrollable parent (in de page is dat de body). */}
      <OnboardingProgressBar
        current={currentStep}
        total={totalSteps}
        tickerSlot={
          freedomTicker ? <OnboardingFreedomTickerRow label={freedomTicker} /> : undefined
        }
        backSlot={
          onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 min-w-[44px] items-center gap-1 px-1 text-xs uppercase tracking-[0.18em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              aria-label="Vorige stap"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline font-mono">Terug</span>
            </button>
          )
        }
      />

      {/* Main grid: 1-col mobile, 2-col desktop. Padding-bottom op mobile
          reserveert ruimte voor de sticky CTA-bar (h≈80px + safe-area). */}
      <div className="mx-auto max-w-[1080px] px-4 sm:px-6 pt-8 sm:pt-12 pb-32 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] lg:gap-0">
          {/* ── Linker kolom: editorial form ───────────────────────── */}
          <div className="lg:pr-10 lg:border-r lg:border-[var(--rule-soft)]">
            {/* Kicker-rij: 28×1px module-streep + UPPERCASE kicker + romeinse num rechts */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block w-7 h-px shrink-0"
                  style={{ background: 'var(--module-active-500)' }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]">
                  {kicker}
                </span>
              </div>
              {romanNum && (
                <span
                  className="italic text-sm text-[var(--module-active-700)]"
                  style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
                >
                  {romanNum}
                </span>
              )}
            </div>

            {/* Headline: Playfair black, narratief. Caller mag inline
                italic-em in --module-active-700 plaatsen voor de signature-em. */}
            <h1
              className="font-black leading-[1.05] tracking-[-0.025em] text-[28px] sm:text-[36px] md:text-[44px] text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              {title}
            </h1>

            {/* Editorial deck: italic Source Serif met linker module-border.
                Beperkt tot 60ch zodat de regel-lengte krant-leesbaar blijft. */}
            <p
              className="mt-4 pl-4 italic text-[15px] sm:text-base leading-snug text-[var(--ink-2)] max-w-[60ch]"
              style={{
                fontFamily: 'var(--font-source-serif, Georgia, serif)',
                borderLeft: '2px solid var(--module-active-500)',
              }}
            >
              {deck}
            </p>

            {/* Stap-specifieke form-velden — caller bepaalt eigen spacing. */}
            <div className="mt-8">{children}</div>

            {/* Mobile-only: facts-panel verschijnt onder de input als
                border-l-callout. Op desktop is hij verborgen — daar leeft
                hij in de rechter kolom. */}
            <div className="mt-8 lg:hidden">{factsPanel}</div>

            {/* Desktop-inline footer (op mobile vervangen we dit door
                een sticky-bottom-bar buiten de grid). */}
            <div className="hidden lg:block mt-10">{footer}</div>
          </div>

          {/* ── Rechter kolom: facts-paneel (desktop only) ─────────── */}
          <aside className="hidden lg:block lg:pl-10 lg:pt-2 bg-[var(--paper)]/40">
            <div className="sticky top-16">{factsPanel}</div>
          </aside>
        </div>
      </div>

      {/* Mobile-only sticky CTA-bar onderaan. Safe-area-aware via
          env(safe-area-inset-bottom) zodat iPhone-notch + Android gesture-bar
          de knop niet afsnijden. */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 backdrop-blur-sm">
        <div
          className="mx-auto max-w-[1080px] px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}
