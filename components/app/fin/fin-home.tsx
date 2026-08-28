'use client'

import './fin-home.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FinDots } from '@/components/app/fin-dots'
import { AlertTriangle } from 'lucide-react'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import { usePrivacyMode } from '@/components/app/use-privacy-mode'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useOverlayOpen } from '@/lib/hooks/use-scroll-lock'
import { useOverlayOpen as useOverlaySignalOpen } from '@/lib/overlay-signal'
import { isImmersiveRoute } from '@/lib/shell/immersive-routes'
import { useFinSlot } from '@/lib/shell/fin-slot'
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
  // Zwevende bottom-FAB: verberg de Fin-bubbel én de melding zolang er een
  // modal/overlay open is. Anders bloedt de halftransparante z-[70]-backdrop
  // door en lijkt de FAB bovenop de primaire actieknop onderin de sheet te
  // staan — net zoals de nav-pill door zo'n overlay wordt afgedekt.
  //
  // TWEE tellers, bewust allebei (M15). `use-scroll-lock` telt alles wat de
  // body vergrendelt (sheets, command-palette, share-dialog, sleepmodus);
  // `overlay-signal` telt alles wat zich als pill-verbergende overlay meldt.
  // Die twee vallen meestal samen — BottomSheet doet allebei — maar niet
  // altijd: een full-page uitleglaag die pagina-inhoud blijft (de tips-tour op
  // /toekomst) claimt bewust géén scroll-lock. Alleen op de lock-teller kijken
  // liet de coach-melding dan dwars door de tourtekst heen typen.
  const scrollLockOpen = useOverlayOpen()
  const overlaySignalOpen = useOverlaySignalOpen()
  const overlayOpen = scrollLockOpen || overlaySignalOpen
  // Mobiel woont de idle-bubbel ín de nav-pill: FloatingNavButton rendert daar
  // een slot, wij portalen onze bubbel erin. Zie lib/shell/fin-slot.tsx.
  //
  // `mounted` is GEEN overbodige voorzichtigheid: FinHome hangt in zijn eigen
  // <Suspense>-grens, los van waar FloatingNavButton hydrateert. React
  // garandeert alleen "effects ná de volledige commit" BINNEN één
  // hydration-boundary — over twee onafhankelijke Suspense-grenzen heen kan
  // FloatingNavButton's slot-registratie-effect al gevuurd zijn vóórdat
  // FinHome's eigen hydration-pass start. Zonder deze vlag zou FinHome dan
  // met een niet-lege `slotEl` hydrateren terwijl de server 'm nooit kende
  // (server rendert altijd met slotEl=null) → hydration-mismatch. Door de
  // portal-tak te gaten op FinHome's EIGEN mount-effect (dat pas ná FinHome's
  // eigen hydratie vuurt, onafhankelijk van andere boundaries) is de eerste
  // render overal gegarandeerd gelijk aan de server; de portal-swap volgt
  // daarna als gewone client-only update.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const { slotEl: rawSlotEl } = useFinSlot()
  const slotEl = mounted ? rawSlotEl : null
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

  // Auto-dismiss telt pas vanaf `done` — dus ná de typemachine. Vanaf mount
  // tellen zou met de korte termijn (8s) een lange boodschap wegknippen
  // vóórdat hij is uitgetypt. Bij prefers-reduced-motion is er geen
  // typemachine en is `done` meteen waar; de timer start dan direct.
  useEffect(() => {
    if (mode !== 'melding' || !done) return
    const t = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(t)
  }, [mode, done, suggestion?.key, autoDismissMs, dismiss])

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

  // Alleen de zwevende hoek-instantie verbergt zich hier. De geslotte bubbel
  // erft dit gratis: het slot leeft in FloatingNavButton, die bij een open
  // overlay of immersieve route al `visibility: hidden` + `aria-hidden` krijgt.
  //  - overlay: de FAB mag niet door de halftransparante backdrop heen over de
  //    sheet-CTA verschijnen.
  //  - immersieve taakflow (bv. de check-in-wizard): die zet zijn eigen primaire
  //    actie sticky onderaan, waar de bubbel er pal bovenop stond.
  const hideFloating = overlayOpen || isImmersiveRoute(pathname)

  const fabAria = localBlocked
    ? 'Open chat met Fin — let op: lokale AI werkt niet op dit toestel'
    : postponedReady > 0
      ? `Open chat met Fin — ${postponedReady} uitgestelde tip${postponedReady === 1 ? '' : 's'} klaar`
      : 'Open chat met Fin'

  // De bubbel is drie lagen die absoluut aan hun eigen context hangen: knop
  // (met badge), avatar erover, en het privacy-/waarschuwingsteken. Eén bron,
  // twee plekken — in het nav-pill-slot (mobiel) en zwevend in de hoek (desktop).
  const renderBubble = (variant: 'floating' | 'slot') => (
    <>
      <button
        type="button"
        onClick={handleBubbleClick}
        className={variant === 'slot' ? 'wh-bubble wh-bubble--slot' : 'wh-bubble'}
        aria-label={fabAria}
      >
        {/* Onzichtbare spacer, exact het icoonformaat van de zoek-/menuknop
            (size=18) — de echte avatar is een los overlay-element (zie
            hieronder) en telt dus niet vanzelf mee voor de knopmaat; zonder
            dit zou het slot-segment smaller ogen dan de andere twee. */}
        {variant === 'slot' && <span aria-hidden className="block h-[18px] w-[18px]" />}
        {postponedReady > 0 && (
          <span className="wh-badge" aria-hidden>{postponedReady > 9 ? '9+' : postponedReady}</span>
        )}
      </button>

      <div className="wh-avatar wh-avatar--bubble" aria-hidden>
        <FinDots size={variant === 'slot' ? 28 : 36} state={finState} />
      </div>

      {/* Eén plek rechtsboven: normaal het privacy-schildje, maar zodra lokaal
          hier niet kán, wint de waarschuwing — dat is het dringender bericht. */}
      {localBlocked ? (
        <span className="wh-warning" title={exec.message ?? 'Lokale AI werkt niet op dit toestel'}>
          <AlertTriangle size={10} aria-hidden />
        </span>
      ) : (
        <AiPrivacyIndicator size={12} className="wh-privacy" />
      )}
    </>
  )

  return (
    <>
      {/* Mobiel/tablet: de bubbel staat in de nav-pill-rij en blijft dáár staan,
          óók terwijl een melding in de hoek openstaat — de melding is het grote
          signaal, dit de vaste ingang (net als de badge, die ook niet meebeweegt
          met de modus). Boven lg verbergt de pill zichzelf en valt alles terug
          op de zwevende instantie hieronder.

          `!hideFloating` is hier VERPLICHT, niet optioneel: de pill verbergt
          zichzelf alleen op lib/overlay-signal.ts (BottomSheet/SlideInPane +
          de tips-tour). `hideFloating` leest de UNIE van die teller en
          lib/hooks/use-scroll-lock.ts, die ook command-palette, share-dialog,
          notification-panel en sleepmodus meetelt. Zonder deze check bleef de
          bubbel in die gevallen zichtbaar én tikbaar terwijl hij vóór de
          samenvoeging altijd verdween. */}
      {!hideFloating && slotEl && createPortal(<div className="wh-slot">{renderBubble('slot')}</div>, slotEl)}

      {!hideFloating && (
        <div
          className={`willhome willhome--${mode}${mode === 'bubble' ? ' hidden lg:block' : ''}`}
        >
          {mode === 'melding' && suggestion ? (
            <>
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

              <div className="wh-avatar wh-avatar--melding" aria-hidden>
                <FinDots size={36} state={finState} />
              </div>
            </>
          ) : (
            renderBubble('floating')
          )}
        </div>
      )}
    </>
  )
}
