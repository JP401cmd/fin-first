'use client'

import './fin-home.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FinDots } from '@/components/app/fin-dots'
import { AlertTriangle } from 'lucide-react'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { usePrivacyMode } from '@/components/app/use-privacy-mode'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useOverlayOpen } from '@/lib/hooks/use-scroll-lock'
import { isImmersiveRoute } from '@/lib/shell/immersive-routes'
import { useCoachSuggestion } from '@/lib/hooks/use-coach-suggestion'
import { useTypewriter } from '@/lib/hooks/use-typewriter'
import { CoachMelding } from './coach-melding'
import {
  DEFAULT_COACH_TIMING, DEFAULT_COACH_HEADER,
  type CoachDataGaps, type DeferredField, type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'
import { inflight } from '@/lib/inflight'

const THINK_MS = 400
const POSTPONED_PROMPT =
  'Ik wil opnieuw kijken naar tips die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met de belangrijkste.'

export type FinHomeProps = {
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
  autoDismissMs?: number
  headerLabel?: string
}

export function FinHome({
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  autoDismissMs = DEFAULT_COACH_TIMING.autoDismissMs,
  headerLabel = DEFAULT_COACH_HEADER,
}: FinHomeProps) {
  const { isOpen, toggle, open, openWithMessage } = useChatContext()
  // Zwevende bottom-FAB: verberg de Fin-bubbel zolang er een modal/overlay
  // open is (scroll-lock actief). Anders bloedt de halftransparante z-[70]-
  // backdrop door en lijkt de FAB bovenop de primaire actieknop onderin de
  // sheet te staan — net zoals de nav-pill door zo'n overlay wordt afgedekt.
  const overlayOpen = useOverlayOpen()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { suggestion, dismiss } = useCoachSuggestion({ dataGaps, deferredFields, overrides, activeModules, delayMs })

  const mode: 'bubble' | 'melding' = suggestion ? 'melding' : 'bubble'

  // thinking: true for THINK_MS after a new suggestion appears (skipped when reduced-motion)
  const [thinking, setThinking] = useState(false)
  const prevSuggestionKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (mode !== 'melding') { setThinking(false); return }
    // On new suggestion key → start thinking phase (unless reduced-motion)
    if (suggestion?.key !== prevSuggestionKey.current) {
      prevSuggestionKey.current = suggestion?.key
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) {
        setThinking(false)
        return
      }
      setThinking(true)
      const t = setTimeout(() => setThinking(false), THINK_MS)
      return () => clearTimeout(t)
    }
  }, [mode, suggestion?.key])

  const { shown, done } = useTypewriter(suggestion?.message ?? '', { start: mode === 'melding' && !thinking })

  useEffect(() => {
    if (mode !== 'melding') return
    const t = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(t)
  }, [mode, suggestion?.key, autoDismissMs, dismiss])

  const [postponedReady, setPostponedReady] = useState(0)
  const fetchPostponedReady = useCallback(async () => {
    try {
      // Dedupe (perf fase 1): op mount vuren BEIDE effecten hieronder (de
      // onvoorwaardelijke + de `!isOpen`-variant, want isOpen start false) →
      // 2× dezelfde fetch. `inflight` vouwt gelijktijdige calls samen tot één
      // roundtrip; een latere ververs (bij chat-sluiten) fetcht gewoon vers.
      const count = await inflight('postponed-ready', async () => {
        const res = await fetch('/api/ai/recommendations/postponed-ready', { cache: 'no-store' })
        if (!res.ok) return null
        return ((await res.json()) as { count: number }).count
      })
      if (count != null) setPostponedReady(count)
    } catch { /* informatief — stil falen */ }
  }, [])
  useEffect(() => { void fetchPostponedReady() }, [fetchPostponedReady])
  useEffect(() => { if (!isOpen) void fetchPostponedReady() }, [isOpen, fetchPostponedReady])

  const finState = mode === 'bubble' ? 'idle' : thinking ? 'thinking' : done ? 'listening' : 'talking'

  const handleBubbleClick = useCallback(() => {
    if (postponedReady > 0) openWithMessage(POSTPONED_PROMPT)
    else toggle()
  }, [postponedReady, openWithMessage, toggle])

  const handleCta = useCallback(() => {
    dismiss()
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [dismiss, searchParams, router, pathname])

  const handleOpenChatFromMelding = useCallback(() => {
    dismiss()
    open()
  }, [dismiss, open])

  // ── Waarschuwing: lokaal gekozen, maar hier niet bruikbaar ──────────────────
  //
  // Wie op één toestel lokaal aanzet, staat op ÉLK toestel op lokaal — die keuze
  // hoort bij zijn profiel, terwijl de modelbundel in één browser staat. Op dat
  // tweede toestel gebeurde er in de chat niets herkenbaars, en dat las als
  // "geen reactie". Nu is het al aan de knop te zien, vóór je hem opent.
  //
  // De GPU-probe kost iets, dus hij draait alleen wanneer privé-modus
  // daadwerkelijk aanstaat; op cloud (de standaard) verandert er niets.
  const privacyMode = usePrivacyMode()
  const exec = useExecutionMode('gesprek', privacyMode === true)
  const localBlocked = exec.status === 'blocked'

  if (isOpen) return null
  // Verberg zodra een overlay/modal open is — de FAB mag niet door de
  // halftransparante backdrop heen over de sheet-CTA verschijnen.
  if (overlayOpen) return null
  // Idem op een immersieve taakflow (bv. de check-in-wizard): die zet zijn
  // eigen primaire actie sticky onderaan, waar de bubbel er pal bovenop stond.
  // Zie lib/shell/immersive-routes.ts.
  if (isImmersiveRoute(pathname)) return null

  const fabAria = localBlocked
    ? 'Open chat met Fin — let op: lokale AI werkt niet op dit toestel'
    : postponedReady > 0
      ? `Open chat met Fin — ${postponedReady} uitgestelde tip${postponedReady === 1 ? '' : 's'} klaar`
      : 'Open chat met Fin'

  return (
    <div className={`willhome willhome--${mode}`}>
      {mode === 'melding' && suggestion ? (
        <div className="wh-melding-face">
          <CoachMelding
            headerLabel={headerLabel}
            shown={shown}
            showCursor={!done}
            done={done}
            cta={suggestion.cta}
            ctaHref={suggestion.ctaHref}
            onClose={dismiss}
            onCtaActivate={handleCta}
            onOpenChat={handleOpenChatFromMelding}
          />
        </div>
      ) : (
        <button type="button" onClick={handleBubbleClick} className="wh-bubble" aria-label={fabAria}>
          {postponedReady > 0 && (
            <span className="wh-badge" aria-hidden>{postponedReady > 9 ? '9+' : postponedReady}</span>
          )}
        </button>
      )}

      <div className={`wh-avatar wh-avatar--${mode}`} aria-hidden>
        <FinDots size={36} state={finState} />
      </div>

      {/* Eén plek rechtsboven: normaal het privacy-schildje, maar zodra lokaal
          hier niet kán, wint de waarschuwing — dat is het dringender bericht. */}
      {mode === 'bubble' &&
        (localBlocked ? (
          <span className="wh-warning" title={exec.message ?? 'Lokale AI werkt niet op dit toestel'}>
            <AlertTriangle size={10} aria-hidden />
          </span>
        ) : (
          <AiPrivacyIndicator size={12} className="wh-privacy" />
        ))}
    </div>
  )
}
