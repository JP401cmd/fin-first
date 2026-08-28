'use client'

import Link from 'next/link'
import { X, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { GuideScreenView } from './guide-screen-view'
import { useWelcomeGuide } from './welcome-guide-provider'
import {
  getVisibleScreens,
  hasMoreScreens,
  countScreenProgress,
} from '@/lib/welcome-guide'

/**
 * WelcomeGuideBanner — de UITGEKLAPTE welkomstkaart op /overzicht. Pure consumer
 * van `WelcomeGuideProvider`: die haalt config + per-user staat op (of krijgt ze
 * als server-seed van de pagina) en deelt ze met deze banner én met het
 * geminimaliseerde punt (`WelcomeGuideDot`). Eén bron, twee vormen — de
 * meldingen-conventie uit CLAUDE.md.
 *
 * - Toont één scherm tegelijk; required-schermen eerst, optionele schermen
 *   ontgrendelt de gebruiker zelf.
 * - Stappen handmatig afvinken → groen, blijven staan.
 * - Het kruisje MINIMALISEERT direct (L11 blijft: geen tussenvraag). De gids
 *   klapt in tot het punt naast de pagina-'i' en blijft daar staan tot je 'm
 *   weer opent — server-side onthouden, dus ook op een ander apparaat (S13).
 *   Waar hier ooit een blokkerende twee-keuze-dialoog stond en daarna een
 *   sessie-only sluitvlag, is er nu één uitgang die niets weggooit.
 * - Voorgoed verbergen (`dismissForever`, server-state) blijft een kleine link
 *   ondér in de gids; zie ook M38, waar dezelfde regel voor de tips-tour op
 *   /toekomst geldt.
 *
 * POSITIE (H20/S13): de gids rendert in het `banners`-slot van
 * `OverzichtHeroPrimary`, dus NÁ de begroeting. Het eerste dat de app zegt is
 * "hoe je ervoor staat", niet een takenlijst. Bewaakt door
 * `overzicht-hero.block-order.test.ts`.
 *
 * EENVOUDIGE WEERGAVE (APP-6): in 'simple' comprimeert de gids — de stappen
 * worden afvinkregels i.p.v. grote proceskaarten, de "Scherm N van M"-teller
 * verdwijnt (de stippen dragen die informatie al) en de schermintro +
 * stapomschrijvingen blijven weg. In 'full' is de gids ongewijzigd. De
 * uitlegzin over de weergavekeuze zelf (APP-2) staat er in BEIDE modi onder:
 * dat is precies de vindbaarheid die ontbrak.
 *
 * De audit vroeg om "mobiel max ~⅓ viewport". Dat is hier een GEMETEN UITKOMST,
 * geen afgedwongen grens: op 390×844 (iPhone 12/13/14-klasse) meet de
 * gecomprimeerde gids 282px = 33,4% (schermronde 9 aug 2026). Er staat bewust
 * GEEN `max-h`/`vh`-regel omheen — een harde kap zou de afvinkregels of de
 * sluit-/navigatieknoppen afsnijden zodra een scherm één stap meer draagt, en
 * dan verliest de gebruiker functionaliteit i.p.v. drukte. De compressie komt
 * dus van mínder inhoud, niet van een schaar. Groeit het aantal stappen per
 * scherm, hermeet dan hier in plaats van een grens toe te voegen.
 */

export function WelcomeGuideBanner() {
  const { data, display, mutate, minimize, dismissForever } = useWelcomeGuide()
  // SINGLE SOURCE OF TRUTH voor de weergavemodus — één read, net als de rest
  // van /overzicht. Stuurt alleen de compressie hieronder, nooit de data.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // Geminimaliseerd: de gids zelf is weg, maar de aria-live-regio blijft staan
  // zodat een screenreader de toestandswissel hoort én weet waar de gids heen
  // ging (spiegel van `PageStatusBanner`).
  if (display === 'minimized') {
    return (
      <section aria-label="Welkomstgids" role="status" aria-live="polite">
        <span className="sr-only">
          Welkomstgids geminimaliseerd. Activeer de knop met het lijstje naast de
          informatie-knop om de gids opnieuw te tonen.
        </span>
      </section>
    )
  }

  if (display !== 'expanded' || !data) return null

  const { config, state, derived } = data
  const visible = getVisibleScreens(config, state)
  if (visible.length === 0) return null

  const totalEnabled = config.screens.filter((s) => s.enabled).length
  const idx = Math.min(state.currentScreen, visible.length - 1)
  const screen = visible[idx]
  const isLast = idx === visible.length - 1
  const canReveal = hasMoreScreens(config, state)
  // Voortgang telt afgeleid + handmatig; niet-van-toepassing-stappen vallen uit
  // de noemer (anders wordt de teller onhaalbaar).
  const progress = countScreenProgress(screen, state.completedStepIds, derived)

  // ── Acties ──
  const toggle = (stepId: string) =>
    mutate({ action: 'toggleStep', stepId }, (s) => {
      const ids = s.completedStepIds.includes(stepId)
        ? s.completedStepIds.filter((i) => i !== stepId)
        : [...s.completedStepIds, stepId]
      return { ...s, completedStepIds: ids }
    })

  const goNext = () =>
    mutate({ action: 'nextScreen' }, (s) => ({
      ...s,
      currentScreen: Math.min(s.currentScreen + 1, visible.length - 1),
    }))

  const goPrev = () =>
    mutate({ action: 'prevScreen' }, (s) => ({
      ...s,
      currentScreen: Math.max(0, s.currentScreen - 1),
    }))

  const reveal = () =>
    mutate({ action: 'revealScreen' }, (s) => ({
      ...s,
      revealedScreens: s.revealedScreens + 1,
      currentScreen: visible.length, // nieuw ontgrendeld scherm
    }))

  return (
    // H20: de gids rendert sinds 28-08-2026 IN de hero-sectie van /overzicht
    // (slot `banners`, ná de begroeting) en erft daar de `max-w-6xl`-breedte en
    // de horizontale padding. Een eigen container zou die verdubbelen — vandaar
    // alleen nog verticale ruimte.
    <section aria-label="Welkomstgids" role="status" aria-live="polite" className="mb-6">
      <div className="overflow-hidden rounded-2xl border border-[var(--border-ed)] bg-[var(--color-kern-50)]/40">
        <div aria-hidden className="h-[3px] w-full" style={{ background: 'var(--color-kern-500)' }} />
        <div className={simple ? 'p-2.5 sm:p-4' : 'p-4 sm:p-5'}>
          {/* Kop: kicker + scherm-positie + sluiten. In Eenvoudig staan de
              stippen op dezelfde regel als de kicker en vervalt de tekstteller
              (APP-6) — de stippen zeggen "scherm 2 van 5" al. */}
          <div
            className={`flex justify-between gap-3 ${
              simple ? 'mb-2 items-center' : 'mb-4 items-start'
            }`}
          >
            <div
              className={
                simple ? 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1' : 'min-w-0'
              }
            >
              <Kicker>{config.kicker}</Kicker>
              {simple ? (
                <ScreenDots
                  total={totalEnabled}
                  revealedCount={visible.length}
                  activeIndex={idx}
                  canReveal={canReveal}
                />
              ) : (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                  Scherm {idx + 1} van {totalEnabled}
                  {progress.total > 0 && (
                    <>
                      {' · '}
                      {progress.done}/{progress.total} afgevinkt
                    </>
                  )}
                  {progress.notApplicable > 0 && (
                    <>
                      {' · '}
                      {progress.notApplicable} n.v.t.
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={minimize}
              aria-label="Welkomstgids minimaliseren"
              title="Minimaliseren"
              className={`inline-flex shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] ${
                simple ? 'h-7 w-7' : 'h-8 w-8'
              }`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Scherm-stippen — in Eenvoudig staan ze al naast de kicker. */}
          {!simple && (
            <div className="mb-4">
              <ScreenDots
                total={totalEnabled}
                revealedCount={visible.length}
                activeIndex={idx}
                canReveal={canReveal}
              />
            </div>
          )}

          {/* Sluiten sluit direct (L11) — er stond hier een tussenvraag die
              het scherm verving en drie keuzes maakte van één kruisje. */}
          <>
              <GuideScreenView
                screen={screen}
                completedStepIds={state.completedStepIds}
                derived={derived}
                onToggle={toggle}
                compact={simple}
              />

              {/* Navigatie-footer */}
              <div
                className={`flex items-center justify-between gap-3 ${simple ? 'mt-2' : 'mt-5'}`}
              >
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={idx === 0}
                  className={`inline-flex items-center gap-1.5 rounded-xl font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] disabled:invisible ${
                    simple ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-2 text-sm'
                  }`}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Vorige
                </button>

                <div className="flex items-center gap-2">
                  {!isLast ? (
                    <PrimaryButton onClick={goNext} compact={simple}>
                      {simple ? 'Volgende' : 'Volgende scherm'}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </PrimaryButton>
                  ) : canReveal ? (
                    <>
                      <GhostButton onClick={minimize} compact={simple}>
                        Nee, klap in
                      </GhostButton>
                      <PrimaryButton onClick={reveal} compact={simple}>
                        Ja, toon meer
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </PrimaryButton>
                    </>
                  ) : (
                    <PrimaryButton onClick={minimize} compact={simple}>
                      Gids inklappen
                    </PrimaryButton>
                  )}
                </div>
              </div>

              {/* APP-2 — de enige plek waar de app zelf vertelt dát er een
                  weergavekeuze is. Eén regel, in beide modi, met de tegen-
                  overgestelde stand als aanbod. Bewust géén per-sectie-hint op
                  de pagina's zelf: die keuze uit ADR 0026 blijft staan. */}
              <p className="mt-2 text-[11px] leading-snug text-[var(--ink-4)]">
                {simple
                  ? 'Je kijkt in de eenvoudige weergave. Meer detail zet je aan bij '
                  : 'Je kijkt in de volledige weergave. Rustiger kan bij '}
                <Link
                  href="/mijn/uiterlijk"
                  className="font-semibold text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline"
                >
                  Mijn → Uiterlijk
                </Link>
                .
              </p>

              {/* "Definitief verbergen" als kleine, niet-blokkerende link (L11).
                  Inklappen gebeurt direct en gooit niets weg; wie de gids nooit
                  meer wil zien, kiest dat hier ter plekke — niet via een vraag
                  die het inklappen ophoudt (S13: één uitgang, geen dialoog). */}
              <p className="mt-1 text-[11px] leading-snug text-[var(--ink-4)]">
                Inklappen bewaart je plek: de gids gaat verder als klein lijstje
                naast de informatie-knop rechtsboven.{' '}
                <button
                  type="button"
                  onClick={dismissForever}
                  className="font-semibold text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline"
                >
                  Verberg de gids voorgoed
                </button>
                .
              </p>
          </>
        </div>
      </div>
    </section>
  )
}

// ── Scherm-stippen ──────────────────────────────────────────────────────────

/**
 * Stappen-stippen: één stip per ingeschakeld scherm, de actieve als streepje,
 * nog-niet-ontgrendelde schermen lichter, met een slotje als er nog schermen
 * achter zitten. Sinds APP-6 draagt dit rijtje in de eenvoudige weergave in
 * z'n eentje de positie-informatie (de "Scherm N van M"-teller vervalt daar).
 */
function ScreenDots({
  total,
  revealedCount,
  activeIndex,
  canReveal,
}: {
  total: number
  revealedCount: number
  activeIndex: number
  canReveal: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const revealed = i < revealedCount
        const active = i === activeIndex
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              active
                ? 'w-6 bg-[var(--ink-2)]'
                : revealed
                  ? 'w-1.5 bg-[var(--border-md)]'
                  : 'w-1.5 bg-[var(--border-ed)]'
            }`}
            aria-hidden
          />
        )
      })}
      {canReveal && <Lock className="ml-1 h-3 w-3 text-[var(--ink-4)]" aria-hidden />}
    </span>
  )
}

// ── Knoppen ───────────────────────────────────────────────────────────────

function PrimaryButton({
  children,
  onClick,
  compact = false,
}: {
  children: React.ReactNode
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] ${
        compact ? 'px-3 py-1 text-[13px]' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
    </button>
  )
}

function GhostButton({
  children,
  onClick,
  compact = false,
}: {
  children: React.ReactNode
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] ${
        compact ? 'px-3 py-1 text-[13px]' : 'px-4 py-2 text-sm'
      }`}
    >
      {children}
    </button>
  )
}
