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
import { useRondleidingActive } from '@/lib/rondleiding/signal'
import { CoachMelding } from './coach-melding'
import {
  DEFAULT_COACH_TIMING, DEFAULT_COACH_HEADER,
  type CoachDataGaps, type DeferredField, type CoachOverrides,
  type GuideSuggestionInput,
} from '@/lib/coach-suggestions'
import { GUIDE_SUGGESTION_KEY_PREFIX, type CoachState } from '@/lib/coach-state'
import type { ModuleId } from '@/lib/module-registry'
import { inflight } from '@/lib/inflight'

const THINK_MS = 400
const POSTPONED_PROMPT =
  'Ik wil opnieuw kijken naar tips die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met de belangrijkste.'

export type FinHomeProps = {
  /**
   * Server-seed van de meldingstaat (`profiles.module_guide_state['coach:state']`).
   * Zonder deze prop valt de hook terug op de lege staat en zou elke al
   * weggeklikte tip opnieuw verschijnen — zie `lib/coach-state.ts`. Bewust
   * VERPLICHT: een vergeten prop zou stil de cross-device-belofte breken.
   */
  coachState: CoachState
  /**
   * Open stappen uit de welkomstgids (ADR 0130, fase 2). Ontbreekt de prop, dan
   * bestaat de gids-laag simpelweg niet en gedraagt de coach zich als voorheen.
   */
  guide?: GuideSuggestionInput
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
  autoDismissMs?: number
  headerLabel?: string
}

export function FinHome({
  coachState,
  guide,
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  autoDismissMs = DEFAULT_COACH_TIMING.autoDismissMs,
  headerLabel = DEFAULT_COACH_HEADER,
}: FinHomeProps) {
  const { isOpen, toggle, open, openWithMessage, openGids } = useChatContext()
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

  // ── Zwijgen zolang Fin toch niet te zien is (M15 / ADR 0130) ──────────────
  //
  // Dezelfde unie als `hideFloating` verderop (overlay open, of een immersieve
  // taakflow), plús de rondleiding. `hideFloating` verbergt alleen de WEERGAVE;
  // `paused` houdt óók de hook stil, zodat een tip achter een open modal niet
  // stilletjes als "gezien" wordt gestempeld en dus ongezien verdwijnt.
  //
  // De rondleiding zit hier wél in maar in `hideFloating` bewust NIET: de tour
  // licht Fins eigen knop uit als laatste stap, dus die knop moet zichtbaar
  // blijven — alleen zijn mond gaat dicht (`lib/rondleiding/signal.ts`).
  //
  // `isOpen` hoort er óók bij: met de chat open rendert dit component `null`
  // (zie `if (isOpen) return null` verderop), en een GEPINDE chat claimt bewust
  // géén overlay-signaal (chat-panel.tsx) — zonder deze term koos de hook dan
  // een tip, typte 'm uit en schreef 'm na acht seconden als gezien weg terwijl
  // niemand hem te zien kreeg. Voor een gidsstap verbruikte dat bovendien de dag.
  const rondleidingActive = useRondleidingActive()
  const paused = overlayOpen || isOpen || isImmersiveRoute(pathname) || rondleidingActive

  const { suggestion, dismiss } = useCoachSuggestion({
    coachState, dataGaps, deferredFields, overrides, activeModules, delayMs, paused, guide,
  })

  // Tijdens de rondleiding gaat ook een melding die al openstond dicht — niet
  // weggeschreven (de hook is gepauzeerd, dus hij komt na afloop gewoon terug),
  // alleen niet gerenderd. Anders stond hij bevroren onder de scrim en lichtte
  // de slotstap "hier vind je mij" de meldkaart uit in plaats van Fins knop.
  const mode: 'bubble' | 'melding' = suggestion && !rondleidingActive ? 'melding' : 'bubble'

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
    const t = setTimeout(() => dismiss('auto'), autoDismissMs)
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
    // Een gids-bubbel ZONDER bestemming wijst naar de pagina waar je al staat
    // (de route-match is exact). De zinvolle vervolgstap is dan de gidsweergave
    // in Fin, waar de stap staat die de bubbel noemde — vandaar `openGids()`
    // i.p.v. een navigatie. Mét bestemming (een deeplink die een paneel opent)
    // heeft CoachMelding al een <Link> gerenderd en hoeven we alleen op te ruimen.
    const key = suggestion?.key ?? ''
    const naarDeGids =
      key.startsWith(GUIDE_SUGGESTION_KEY_PREFIX) && !suggestion?.ctaHref
    dismiss('user')
    if (naarDeGids) {
      openGids()
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [dismiss, openGids, suggestion?.key, suggestion?.ctaHref, searchParams, router, pathname])

  const handleOpenChatFromMelding = useCallback(() => {
    dismiss('user')
    open()
  }, [dismiss, open])

  // Eigen wrapper i.p.v. `onClose={dismiss}`: `dismiss` neemt sinds ADR 0130 een
  // reden, en een rechtstreeks doorgegeven handler zou het klik-event als reden
  // meegeven — dan is geen enkele tak meer voorspelbaar.
  const handleCloseMelding = useCallback(() => { dismiss('user') }, [dismiss])

  // ── De meldingstrook eist op mobiel haar eigen band op (UR2-08) ────────────
  //
  // Onder lg dokt de melding over de volle breedte boven de nav-pill (zie
  // fin-home.css). Zonder reservering lag ze dáár bovenop pagina-inhoud en was
  // een link eronder onbereikbaar. We publiceren daarom de gemeten hoogte als
  // `--fin-melding-height`; `--fin-melding-clearance` (app/globals.css) telt de
  // pill-clearance erbij op en de mobiele `<main>` maakt zich net zoveel korter
  // (components/app/shell/mobile-stack-shell.tsx). Content schuift dus boven de
  // strook uit i.p.v. eronder te verdwijnen — en er is géén sprong: de
  // scrollport wordt alleen ónderaan korter, de zichtbare inhoud verschuift niet.
  //
  // Een ref-callback (met React 19-cleanup) i.p.v. een effect: die vuurt exact
  // op mount/unmount van de strook zelf, dus hij hoeft de vijf condities die
  // bepalen óf de melding rendert (chat open, overlay, immersieve route, modus,
  // suggestie) niet te dupliceren in een dependency-lijst.
  const meldingRef = useCallback((el: HTMLDivElement | null) => {
    const root = document.documentElement
    const reset = () => root.style.setProperty('--fin-melding-height', '0px')
    if (!el) { reset(); return }
    // `offsetHeight`, niet getBoundingClientRect: de entree-animatie schaalt de
    // strook, en een geschaalde hoogte zou de band laten meeademen.
    const publish = () => root.style.setProperty('--fin-melding-height', `${el.offsetHeight}px`)
    publish()
    // De strook groeit terwijl de typemachine loopt; zonder observer klopt de
    // band alleen op het eerste frame. jsdom kent geen ResizeObserver — daar
    // blijft het bij de eenmalige meting.
    if (typeof ResizeObserver === 'undefined') return reset
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => { ro.disconnect(); reset() }
  }, [])

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
          data-tour="fin"
          className={`willhome willhome--${mode}${mode === 'bubble' ? ' hidden lg:block' : ''}`}
        >
          {mode === 'melding' && suggestion ? (
            <>
              <div className="wh-melding-face" ref={meldingRef}>
                <CoachMelding
                  headerLabel={headerLabel}
                  shown={shown}
                  showCursor={!done}
                  done={done}
                  cta={suggestion.cta}
                  ctaHref={suggestion.ctaHref}
                  onClose={handleCloseMelding}
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
