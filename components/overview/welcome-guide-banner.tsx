'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { GuideScreenView } from './guide-screen-view'
import {
  getVisibleScreens,
  hasMoreScreens,
  countCompletedOnScreen,
  type WelcomeGuideConfig,
  type WelcomeGuideState,
} from '@/lib/welcome-guide'

/**
 * WelcomeGuideBanner — altijd-open welkomstkaart bovenaan /overzicht. Zelf-
 * fetchend (zoals CheckinBanner): haalt config + per-user staat op uit
 * /api/welcome-guide en muteert die optimistisch.
 *
 * - Toont één scherm tegelijk; required-schermen eerst, optionele schermen
 *   ontgrendelt de gebruiker zelf.
 * - Stappen handmatig afvinken → groen, blijven staan.
 * - Sluiten (X / "sluit gids") → twee-keuze-dialoog: voorgoed verbergen of
 *   volgende keer verder (sessie-flag verbergt 'm alleen deze sessie).
 *
 * SERVER-SEED (perf fase 1): geeft de /overzicht-pagina een `seed`
 * ({ config, state }) mee, dan gebruikt de banner die en slaat de eerste
 * client-fetch naar /api/welcome-guide over. Interacties (afvinken/navigeren/
 * sluiten) blijven via de bestaande PUT-route lopen.
 *
 * EENVOUDIGE WEERGAVE (APP-6): in 'simple' comprimeert de gids tot ~⅓ van een
 * mobiel scherm — de stappen worden afvinkregels i.p.v. grote proceskaarten, de
 * "Scherm N van M"-teller verdwijnt (de stippen dragen die informatie al) en de
 * schermintro + stapomschrijvingen blijven weg. In 'full' is de gids
 * ongewijzigd. De uitlegzin over de weergavekeuze zelf (APP-2) staat er in
 * BEIDE modi onder: dat is precies de vindbaarheid die ontbrak.
 */

const SESSION_CLOSED_KEY = 'welcome_guide_closed'

type Payload = { config: WelcomeGuideConfig; state: WelcomeGuideState }

export function WelcomeGuideBanner({ seed }: { seed?: Payload | null }) {
  const [data, setData] = useState<Payload | null>(null)
  const [hidden, setHidden] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // SINGLE SOURCE OF TRUTH voor de weergavemodus — één read, net als de rest
  // van /overzicht. Stuurt alleen de compressie hieronder, nooit de data.
  const { mode } = useDisplayMode()
  const simple = mode === 'simple'

  // ── Mount: sessie-flag → niet fetchen (data blijft null → render niets);
  // anders de server-seed gebruiken (geen fetch) of config + staat ophalen.
  // Alleen de `cancelled`-flag gebruiken (geen fetchedRef-guard) zodat de dubbele
  // StrictMode-mount in dev de tweede fetch gewoon laat winnen — setState gebeurt
  // enkel async in callbacks. ──
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_CLOSED_KEY) === '1') return
    } catch {
      /* sessionStorage onbeschikbaar — ga door */
    }
    const applyPayload = (d: Payload) => {
      if (!d.config?.enabled || d.state?.status === 'dismissed') {
        setHidden(true)
        return
      }
      setData(d)
    }
    // Server-seed aanwezig → geen fetch; zelfde visibility-logica als de fetch.
    if (seed) {
      applyPayload(seed)
      return
    }
    let cancelled = false
    fetch('/api/welcome-guide')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (cancelled || !d) return
        applyPayload(d)
      })
      .catch(() => {
        if (!cancelled) setHidden(true)
      })
    return () => {
      cancelled = true
    }
  }, [seed])

  // ── Optimistische mutatie + server-sync ──
  const mutate = useCallback(
    async (
      body: Record<string, unknown>,
      optimistic: (prev: WelcomeGuideState) => WelcomeGuideState,
    ) => {
      setData((prev) => (prev ? { ...prev, state: optimistic(prev.state) } : prev))
      try {
        const res = await fetch('/api/welcome-guide', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const json = (await res.json()) as { state: WelcomeGuideState }
          setData((prev) => (prev ? { ...prev, state: json.state } : prev))
        }
      } catch {
        /* stil: optimistische staat blijft staan; volgende load corrigeert */
      }
    },
    [],
  )

  if (hidden || !data) return null

  const { config, state } = data
  const visible = getVisibleScreens(config, state)
  if (visible.length === 0) return null

  const totalEnabled = config.screens.filter((s) => s.enabled).length
  const idx = Math.min(state.currentScreen, visible.length - 1)
  const screen = visible[idx]
  const isLast = idx === visible.length - 1
  const canReveal = hasMoreScreens(config, state)
  const doneOnScreen = countCompletedOnScreen(screen, state.completedStepIds)
  const totalOnScreen = screen.steps.filter((s) => s.enabled).length

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

  const closeForSession = () => {
    try {
      sessionStorage.setItem(SESSION_CLOSED_KEY, '1')
    } catch {
      /* no-op */
    }
    setHidden(true)
  }

  const dismissForever = () => {
    setHidden(true)
    void mutate({ action: 'dismiss' }, (s) => ({ ...s, status: 'dismissed' }))
  }

  return (
    <section aria-label="Welkomstgids" className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
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
                  {totalOnScreen > 0 && (
                    <>
                      {' · '}
                      {doneOnScreen}/{totalOnScreen} afgevinkt
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Welkomstgids sluiten"
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

          {/* Confirm-dialoog of het scherm */}
          {confirming ? (
            <CloseDialog
              onForever={dismissForever}
              onSession={closeForSession}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <>
              <GuideScreenView
                screen={screen}
                completedStepIds={state.completedStepIds}
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
                      <GhostButton onClick={() => setConfirming(true)} compact={simple}>
                        Nee, sluit gids
                      </GhostButton>
                      <PrimaryButton onClick={reveal} compact={simple}>
                        Ja, toon meer
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </PrimaryButton>
                    </>
                  ) : (
                    <PrimaryButton onClick={() => setConfirming(true)} compact={simple}>
                      Gids sluiten
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
            </>
          )}
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

// ── Sluit-dialoog (twee keuzes) ─────────────────────────────────────────────

function CloseDialog({
  onForever,
  onSession,
  onCancel,
}: {
  onForever: () => void
  onSession: () => void
  onCancel: () => void
}) {
  return (
    <div className="py-2">
      <h3
        className="text-lg text-[var(--ink)]"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        Welkomstgids sluiten?
      </h3>
      <p className="mt-1 text-sm text-[var(--ink-3)]">
        Wil je deze schermen niet meer zien, of de volgende keer verdergaan waar je gebleven bent?
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSession}
          className="flex-1 rounded-xl border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
        >
          <span className="block text-sm font-semibold text-[var(--ink)]">Volgende keer verder</span>
          <span className="mt-0.5 block text-xs text-[var(--ink-3)]">
            Verberg nu; bij je volgende bezoek gaat de gids verder.
          </span>
        </button>
        <button
          type="button"
          onClick={onForever}
          className="flex-1 rounded-xl border border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
        >
          <span className="block text-sm font-semibold text-[var(--ink)]">
            Geen onboarding-schermen meer tonen
          </span>
          <span className="mt-0.5 block text-xs text-[var(--ink-3)]">
            Verberg de gids voorgoed.
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-3 text-xs font-medium text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
      >
        Annuleren
      </button>
    </div>
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
