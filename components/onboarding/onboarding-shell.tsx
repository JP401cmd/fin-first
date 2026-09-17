'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  DATA_NOTE_LINK_LABEL,
  DATA_NOTE_PRIVACY_HREF,
} from '@/lib/onboarding/data-note-copy'
import { OnboardingProgressBar } from './progress-bar'
import {
  OnboardingFreedomTickerRow,
  useOnboardingFreedomTicker,
} from './freedom-ticker'

/**
 * Editorial-split layout-shell voor de onboarding-stappen.
 *
 * Verantwoordelijkheid: levert de chrome rond een individuele stap —
 *   1. Editorial header bovenaan (kicker + vraag + deck), daar direct ONDER
 *      de voortgangsrij (terug-knop + balk + stand + vrijheidsteller)
 *   2. Twee-koloms grid op desktop (≥lg) — links form, rechts facts-paneel
 *   3. Single-column fallback op mobile — facts-paneel verschijnt als
 *      border-l-callout onder de input (het FactsPanel zelf regelt z'n eigen
 *      mobile-styling met breakpoint-classes; hier kiezen we alleen de
 *      grid-layout)
 *   4. Sticky bottom CTA-bar op mobile (safe-area-aware), inline footer-row
 *      op desktop — verzorgd via de `footer` slot
 *   5. De vraag is het eerste wat op het scherm staat (eigenaarswens
 *      17 sep 2026): kicker met streep + romeinse num + headline-em + deck,
 *      alle via props zodat de stappen zelf geen layout-werk doen
 *
 * Niet-verantwoordelijk: stap-specifieke validatie, data, of state.
 * De stap-componenten leveren `children` (form-velden) + `footer` (CTAs).
 *
 * **Module-tinten**: scope is bewust onaangetast — het is de
 * verantwoordelijkheid van de onboarding-page (één laag hoger) om
 * `--module-active-*` te zetten via een wrapper-style. Sinds 17 sep 2026 is
 * dat niet langer vast `kern`, maar het accent van de hefboom waar de stap
 * over gaat (`STEP_ACCENT` in de page). Dit shell-component leest alleen die
 * tokens en hoeft daar dus niets voor te doen.
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
  /**
   * Optionele gegevensregel onder het deck: wat er met dit antwoord gebeurt.
   * Kleiner en rustiger dan de deck, met een vaste link naar de publieke
   * privacyverklaring erachter. Levert de tekst uit
   * `lib/onboarding/data-note-copy.ts` — nooit een eigen formulering, anders
   * ontstaat opnieuw de spreiding die UR3-15 opruimde.
   */
  dataNote?: string
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
  dataNote,
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

  // Elke nieuwe vraag begint bovenaan. De pagina scrollt op de body, en die
  // positie bleef staan bij een stapwissel (nieuwe shell-mount) én bij een
  // micro-vraag binnen dezelfde stap (bv. "Heb je een spaargeldrekening?" na de
  // betaalrekening — zelfde shell, andere kop). Beide vangen we hier: bij mount,
  // en wanneer de koptekst verandert. Alleen als er daadwerkelijk gescrold is,
  // zodat een render zonder wissel niets doet.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousHeading = useRef<string | null>(null)
  useLayoutEffect(() => {
    const text = headingRef.current?.textContent ?? ''
    if (previousHeading.current !== text && typeof window !== 'undefined' && window.scrollY > 0) {
      // `instant`: de html draagt `scroll-behavior: smooth`; een nieuwe vraag
      // hoort er meteen bovenaan te staan, niet zichtbaar omhoog te glijden.
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    previousHeading.current = text
  })

  return (
    <div className="w-full">
      {/* Main grid: 1-col mobile, 2-col desktop. Padding-bottom op mobile
          reserveert ruimte voor de sticky CTA-bar (h≈80px + safe-area). */}
      <div className="mx-auto max-w-[1080px] px-4 sm:px-6 pb-32 lg:pb-12">
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
              ref={headingRef}
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

            {/* Gegevensregel: wat er met dit antwoord gebeurt. Bewust een
                tweede, kleinere regel in plaats van een derde deck-zin — op
                360 px wordt een deck van drie zinnen een muur, en de uitleg
                moet juist rustig naast de vraag staan. De link opent de
                PUBLIEKE privacyverklaring in een nieuw tabblad; /mijn/privacy
                kaatst tijdens de onboarding terug naar /onboarding. */}
            {dataNote && (
              <p className="mt-2.5 pl-4 text-[12px] leading-snug text-[var(--ink-3)] max-w-[60ch]">
                {dataNote} —{' '}
                <a
                  href={DATA_NOTE_PRIVACY_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors hover:text-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                >
                  {DATA_NOTE_LINK_LABEL}
                </a>
              </p>
            )}

            {/* Voortgangsrij — sinds 17 sep 2026 ONDER de vraag in plaats van
                erboven (eigenaarswens). De vraag is waar het scherm om draait;
                de voortgang is de voetnoot erbij. De terug-knop verhuisde mee:
                hij hoort bij de stap-navigatie, dus bij de balk die de stand
                toont — niet los bovenaan.

                De rij blijft wél sticky, en dat is geen detail: deze `backSlot`
                is de ENIGE stap-terug die de gebruiker heeft (de sticky
                CTA-bar onderaan draagt alleen de vooruit-knop). Zonder sticky
                scrolde hij bij een lange stap — bezittingen of schulden met een
                paar ingevulde regels — samen met de kop uit beeld, en zat de
                gebruiker in een scherm zonder zichtbare uitgang. Hij plakt nu
                aan de bovenkant van de formulierkolom zodra de vraag erboven
                wegscrolt; in rust staat hij gewoon onder het deck. */}
            <OnboardingProgressBar
              className="sticky top-0 z-30 mt-6 bg-[var(--subtle)]/95 py-2 backdrop-blur-sm"
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
