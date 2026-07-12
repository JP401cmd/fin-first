'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import { Kicker } from '@/components/editorial'
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
 */

const SESSION_CLOSED_KEY = 'welcome_guide_closed'

type Payload = { config: WelcomeGuideConfig; state: WelcomeGuideState }

export function WelcomeGuideBanner() {
  const [data, setData] = useState<Payload | null>(null)
  const [hidden, setHidden] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // ── Mount: sessie-flag → niet fetchen (data blijft null → render niets);
  // anders config + staat ophalen. Alleen de `cancelled`-flag gebruiken (geen
  // fetchedRef-guard) zodat de dubbele StrictMode-mount in dev de tweede fetch
  // gewoon laat winnen — setState gebeurt enkel async in callbacks. ──
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_CLOSED_KEY) === '1') return
    } catch {
      /* sessionStorage onbeschikbaar — ga door */
    }
    let cancelled = false
    fetch('/api/welcome-guide')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Payload | null) => {
        if (cancelled || !d) return
        if (!d.config?.enabled || d.state?.status === 'dismissed') {
          setHidden(true)
          return
        }
        setData(d)
      })
      .catch(() => {
        if (!cancelled) setHidden(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
        <div className="p-4 sm:p-5">
          {/* Kop: kicker + scherm-positie + sluiten */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Kicker>{config.kicker}</Kicker>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
                Scherm {idx + 1} van {totalEnabled}
                {totalOnScreen > 0 && (
                  <>
                    {' · '}
                    {doneOnScreen}/{totalOnScreen} afgevinkt
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Welkomstgids sluiten"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* Scherm-stippen */}
          <div className="mb-4 flex items-center gap-1.5">
            {Array.from({ length: totalEnabled }).map((_, i) => {
              const revealed = i < visible.length
              const active = i === idx
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
            {canReveal && (
              <Lock className="ml-1 h-3 w-3 text-[var(--ink-4)]" aria-hidden />
            )}
          </div>

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
              />

              {/* Navigatie-footer */}
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={idx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] disabled:invisible"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Vorige
                </button>

                <div className="flex items-center gap-2">
                  {!isLast ? (
                    <PrimaryButton onClick={goNext}>
                      Volgende scherm
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </PrimaryButton>
                  ) : canReveal ? (
                    <>
                      <GhostButton onClick={() => setConfirming(true)}>Nee, sluit gids</GhostButton>
                      <PrimaryButton onClick={reveal}>
                        Ja, toon meer
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </PrimaryButton>
                    </>
                  ) : (
                    <PrimaryButton onClick={() => setConfirming(true)}>Gids sluiten</PrimaryButton>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
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

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
    >
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
    >
      {children}
    </button>
  )
}
