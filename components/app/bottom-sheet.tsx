'use client'

import { useState, useEffect, useCallback, useRef, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/use-scroll-lock'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { useSwipeToDismiss, SPRING_CURVE } from '@/lib/hooks/use-swipe-to-dismiss'
import { acquireOverlay } from '@/lib/overlay-signal'
import { pushOverlayHistory } from '@/lib/overlay-history'
import { scrimColor } from '@/lib/overlay-scrim'

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Desktop max-width: 'sm' (448px) | 'md' (512px, default) | 'lg' (640px) | 'xl' (768px) | 'full' (1024px) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** Initial mobile height (e.g. '60vh'). Drag up expands to full 92vh. Desktop ignores this. */
  initialMobileHeight?: string
  /**
   * Optionele sticky footer-slot, gerenderd buiten de scroll-content als
   * niet-scrollend blok met bovenrand en safe-area-padding — de canonieke
   * plek voor primaire acties (Opslaan/Annuleren e.d.), ook op klein scherm.
   * De content-container blijft scrollen; de footer blijft altijd zichtbaar.
   *
   * Gebruikt door `<ShellOverlay>`: kind="pane" voor de mobile-fallback (zelfde
   * primary/secondary action-bar als de desktop SlideInPane-footer) én
   * kind="sheet"/"confirm" via de `footer`-prop. Slot leeft binnen de tray
   * (niet `position: fixed`), zodat de detent-strategie (peek/mid/full) intact
   * blijft. Wanneer leeggelaten: geen footer (backwards-compatible — niets
   * verandert voor bestaande sheets zonder footer).
   */
  footerSlot?: ReactNode
  /**
   * Header-action elementen rechts naast de titel (vóór de close-knop).
   * Gebruikt door `<ShellOverlay kind="pane">` voor de mobile-fallback zodat
   * delete-/share-icons die op desktop in de SlideInPane-header-rij staan,
   * ook op mobile zichtbaar zijn. Wanneer leeggelaten: alleen close-knop.
   */
  actions?: ReactNode
  /**
   * STANDAARD rendert elke BottomSheet BOVEN de zwevende mobiele nav-pill
   * (FloatingNavButton, z-[60]): de modal dekt de pill af, zodat content en
   * (sticky) knoppen onderin de volle hoogte hebben i.p.v. achter/onder de
   * pill te verdwijnen. Footer-clearance valt daardoor terug op enkel de iOS
   * safe-area (de 76px nav-clearance is overbodig als de pill is afgedekt).
   *
   * Zet `belowFloatingNav` ALLEEN voor de NavMenuSheet zelf: die wordt door de
   * pill-toggle ge(de)opend, dus de pill moet er bovenop blijven (z-50 <
   * z-[60]) en de footer behoudt de nav-clearance. Voor alle andere modals
   * laat je dit `false` — dat is de app-brede standaard.
   */
  belowFloatingNav?: boolean
  /**
   * STANDAARD sluit een klik op de gedimde achtergrond (backdrop) de modal
   * NIET (`false`). Dit is bewust de app-brede modal-standaard: een onbedoelde
   * klik naast een modal — zeker in een modal met een invulformulier — mag geen
   * getypte invoer wissen zonder waarschuwing. Sluiten blijft altijd mogelijk
   * via de X-knop, de Escape-toets en (mobiel) de swipe-down-gebaar; er is dus
   * altijd een expliciete, opzettelijke exit.
   *
   * Zet `closeOnBackdropClick` ALLEEN op `true` voor lichte, read-only modals
   * (bv. een puur informatief overzicht) waar een klik-buiten-om als snelle,
   * onschadelijke dismiss gewenst is en er niets verloren kan gaan.
   */
  closeOnBackdropClick?: boolean
  /**
   * STANDAARD (`true`) duwt een open sheet één entry op de browser-history, zodat
   * de mobiele terug-knop de MODAL sluit i.p.v. de onderliggende pagina weg te
   * navigeren — en bij gestapelde modals in omgekeerde volgorde terugloopt. Zie
   * `lib/overlay-history.ts`.
   *
   * Zet 'm op `false` voor een overlay waarvan de OPEN-STAAT UIT DE URL komt
   * (`?holding=<id>`, `?planEditor=true`). Die schrijft bij sluiten zelf de URL
   * met `router.replace`; twee partijen die dezelfde history-entry claimen levert
   * een modal op die na terug opnieuw opent. `<ShellOverlay kind="pane">` zet
   * dit daarom voor de hele pane-familie uit.
   */
  manageHistory?: boolean
  /**
   * TERUGTREDEN ZONDER TE SLUITEN. De sheet blijft gemonteerd maar verdwijnt
   * van het scherm (`display: none`) en geeft focus-trap en Escape op, zodat
   * een overlay die ÍN zijn children opent het scherm alleen bezit — de
   * één-overlay-tegelijk-regel van ADR 0039, zonder de boom af te breken.
   *
   * Waarom niet gewoon `open={false}`: een gesloten BottomSheet rendert `null`,
   * dus zijn children en alle React-state daarin verdwijnen. Leeft de geneste
   * overlay ín die children — zoals het bewerkscherm ín de rekeningdetail
   * (M35) — dan neemt de ouder het kind mee weg en blijft er niets over. Het
   * kind zelf blijft bij suspenderen gewoon zichtbaar, want élke BottomSheet
   * hangt via `createPortal` in `document.body`, buiten dit verborgen paneel.
   *
   * Alleen voor dat geval. Is de geneste overlay een SIBLING van de ouder —
   * zoals `components/future/doel-bewerken-sheet.tsx` het opzet — dan is
   * `open={false}` de eenvoudiger en juiste weg.
   */
  suspended?: boolean
}

const sizeClasses = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-xl',
  xl: 'md:max-w-3xl',
  full: 'md:max-w-5xl',
} as const

export function BottomSheet({ open, onClose, title, children, size = 'md', initialMobileHeight, footerSlot, actions, belowFloatingNav = false, closeOnBackdropClick = false, manageHistory = true, suspended = false }: BottomSheetProps) {
  const [visible, setVisible] = useState(false)
  const [expandedToFull, setExpandedToFull] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Scroll-container — voedt zowel de scroll-vs-drag beslissing van het
  // swipe-gebaar als de expand-on-scroll van `initialMobileHeight`.
  const contentRef = useRef<HTMLDivElement>(null)

  // Animation state machine
  const phaseRef = useRef<'idle' | 'entering' | 'open' | 'closing'>('idle')
  const exitAnimationInProgress = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Zie `handleProgrammaticClose`: de suspend-guard moet op event-tijd gelden.
  const suspendedRef = useRef(suspended)
  suspendedRef.current = suspended

  // Reduced-motion preference
  const prefersReducedMotion = useRef(false)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    prefersReducedMotion.current = mql.matches
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // ── Animation helpers ──────────────────────────────────────

  /** Exit animation for programmatic close (X / Escape / backdrop) */
  const animateExit = useCallback(() => {
    if (exitAnimationInProgress.current) return
    exitAnimationInProgress.current = true
    phaseRef.current = 'closing'

    const sheet = sheetRef.current
    const backdrop = backdropRef.current

    if (prefersReducedMotion.current || !sheet) {
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
      return
    }

    // Cancel entry animation if still running
    sheet.style.animation = 'none'
    sheet.style.transition = 'transform 250ms ease-out, opacity 250ms ease-out'
    sheet.style.transform = 'translateY(16px)'
    sheet.style.opacity = '0'

    if (backdrop) {
      backdrop.style.transition = 'background-color 200ms ease-out'
      backdrop.style.backgroundColor = scrimColor(0)
    }

    const cleanup = () => {
      if (!exitAnimationInProgress.current) return
      setVisible(false)
      exitAnimationInProgress.current = false
      phaseRef.current = 'idle'
    }
    sheet.addEventListener('transitionend', cleanup, { once: true })
    // Safety fallback if transitionend doesn't fire
    setTimeout(cleanup, 300)
  }, [])

  // ── Swipe-to-dismiss (gedeeld gebaar) ──────────────────────
  //
  // Het gebaar zelf (velocity, scroll-vs-drag, rubber-band, drempels, exit- en
  // terugveer-animatie) leeft in `useSwipeToDismiss`. Hier blijft alleen wat
  // BottomSheet-eigen is: de sluit-bookkeeping van de state machine en het
  // uitklappen naar volle hoogte bij een opwaartse drag.

  const handleSwipeDismissStart = useCallback(() => {
    if (exitAnimationInProgress.current) return false
    exitAnimationInProgress.current = true
    phaseRef.current = 'closing'
    return true
  }, [])

  const handleSwipeDismissed = useCallback(() => {
    // Guard op de vlag: een heropening midden in de exit zet 'm op false,
    // waarna deze (al ingeplande) afronding niets meer mag doen.
    if (!exitAnimationInProgress.current) return
    setVisible(false)
    exitAnimationInProgress.current = false
    phaseRef.current = 'idle'
    onCloseRef.current()
  }, [])

  /**
   * Expand-to-full: sheets met `initialMobileHeight` starten op een deelhoogte;
   * een opwaartse drag klapt ze uit i.p.v. te rubber-banden. Bewust
   * BottomSheet-only — een paneel dat al volledige hoogte heeft (chat) kent dit
   * niet.
   */
  const handleDragUpExpand = useCallback((rawDelta: number) => {
    if (rawDelta >= -30 || !initialMobileHeight || expandedToFull) return false
    setExpandedToFull(true)
    if (sheetRef.current) {
      sheetRef.current.style.transition = `max-height 350ms ${SPRING_CURVE}`
      sheetRef.current.style.transform = ''
      sheetRef.current.style.willChange = ''
    }
    return true
  }, [initialMobileHeight, expandedToFull])

  const { handleSheetTouchStart } = useSwipeToDismiss({
    sheetRef,
    backdropRef,
    contentRef,
    onDismiss: handleSwipeDismissed,
    onDismissStart: handleSwipeDismissStart,
    onDragMove: handleDragUpExpand,
  })

  // ── Programmatic close (X / Escape / backdrop click) ───────

  const handleProgrammaticClose = useCallback(() => {
    // Een teruggetreden sheet sluit NOOIT zichzelf: het venster erbovenop
    // bezit de interactie. De guard leest een ref, zodat hij geldt op het
    // moment van de gebeurtenis en niet op het moment dat de listener werd
    // opgehangen — een handler die één render achterloopt (of een die na een
    // fast-refresh blijft hangen) sluit anders de hele host weg terwijl de
    // gebruiker alleen het bovenste venster wilde verlaten.
    if (suspendedRef.current) return
    if (phaseRef.current === 'closing') return
    animateExit()
    onCloseRef.current()
  }, [animateExit])

  // Via een ref, zodat het history-effect alleen op `open` hangt: zou het op de
  // callback-identiteit hangen, dan pushte elke re-render een nieuwe entry.
  const handleProgrammaticCloseRef = useRef(handleProgrammaticClose)
  handleProgrammaticCloseRef.current = handleProgrammaticClose

  // ── State machine: open prop → visible state ───────────────

  useEffect(() => {
    if (open) {
      // (Re-)opening — cancel any in-progress exit
      exitAnimationInProgress.current = false
      phaseRef.current = 'entering'
      setVisible(true)
      setExpandedToFull(false)

      // Reset leftover inline styles from previous exit/drag
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform = ''
        sheetRef.current.style.opacity = ''
        sheetRef.current.style.willChange = ''
        sheetRef.current.style.animation = ''
      }
      if (backdropRef.current) {
        backdropRef.current.style.backgroundColor = scrimColor()
        backdropRef.current.style.transition = ''
      }

      const timer = setTimeout(() => {
        if (phaseRef.current === 'entering') phaseRef.current = 'open'
      }, 280)
      return () => clearTimeout(timer)
    }

    // open went false — start exit if we haven't already
    if (phaseRef.current === 'idle' || phaseRef.current === 'closing') return
    if (exitAnimationInProgress.current) return
    animateExit()
  }, [open, animateExit])

  // ── Body scroll lock (tied to visible) ─────────────────────

  useScrollLock(visible)

  // ── FloatingNavButton verbergen zolang deze modal open is ──
  // We haken op de `open`-prop (niet `visible`): het signaal komt zo DIRECT bij
  // close-start vrij, waardoor de pill soepel terugkomt tijdens de exit-animatie
  // i.p.v. pas ná de unmount. NavMenuSheet (`belowFloatingNav`) is de bewuste
  // uitzondering — dáár IS de pill de toggle en mag die niet verdwijnen; we
  // gaten het acquire daarom op `!belowFloatingNav`. Zie lib/overlay-signal.ts.
  useEffect(() => {
    if (belowFloatingNav || !open) return
    return acquireOverlay()
  }, [open, belowFloatingNav])

  // ── Terug-knop sluit de modal, niet de pagina ──────────────
  // Eén history-entry per open sheet; `popstate` sluit langs dezelfde weg als
  // de X-knop (exit-animatie + onClose), en de cleanup consumeert de eigen
  // entry weer zodat er geen weesentry achterblijft. Zie lib/overlay-history.ts.
  useEffect(() => {
    if (!manageHistory || !open) return
    return pushOverlayHistory(() => handleProgrammaticCloseRef.current())
  }, [open, manageHistory])

  // ── Focus management + trap ────────────────────────────────

  // Een teruggetreden sheet vangt geen focus meer: de geneste overlay heeft
  // zijn eigen trap, en twee traps die om dezelfde focus vechten trekken de
  // cursor uit het bovenste venster terug naar het onzichtbare eronder.
  useFocusTrap({ active: visible && !suspended, containerRef: sheetRef })

  // ── Escape key ─────────────────────────────────────────────

  useEffect(() => {
    // Escape hoort bij het BOVENSTE venster. Zou de teruggetreden ouder
    // meeluisteren, dan sloot één toetsaanslag beide lagen tegelijk.
    if (!visible || suspended) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleProgrammaticClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, suspended, handleProgrammaticClose])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) handleProgrammaticClose()
  }, [closeOnBackdropClick, handleProgrammaticClose])

  if (!visible) return null

  return createPortal(
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${belowFloatingNav ? 'z-50' : 'z-[70]'} flex items-end justify-center md:items-center`}
      // `display: none` en niet unmounten: de children — en de geneste overlay
      // die erin leeft — blijven zo gemonteerd mét hun state. Ook de scrim
      // verdwijnt daarmee, zodat de geneste sheet niet door twee lagen dimming
      // heen wordt gekeken. `aria-hidden` haalt de teruggetreden laag uit de
      // toegankelijkheidsboom; die kent immers maar één modaal venster tegelijk.
      style={{ backgroundColor: scrimColor(), display: suspended ? 'none' : undefined }}
      aria-hidden={suspended || undefined}
      onClick={handleBackdrop}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // Eén touchstart voor het HELE paneel — de hook routeert zelf naar
        // "slepen" (greepje/header/footer/tussenruimte) of "eerst scroll-vs-drag
        // beslissen" (binnen de scroll-content). Vóórheen droeg alleen het
        // greepje een handler, waardoor de strook eronder niet sleepte én de
        // browser het gebaar als pull-to-refresh oppakte. `touchmove`/`touchend`
        // hangen niet-passief aan `document` (zie use-swipe-to-dismiss.ts).
        onTouchStart={handleSheetTouchStart}
        className={`flex w-full flex-col bg-[var(--paper)] rounded-t-[var(--r-lg)] shadow-[var(--s2)] md:mx-4 ${sizeClasses[size]} md:rounded-[var(--r-lg)] safe-bottom animate-sheet-enter`}
        style={{
          maxHeight: initialMobileHeight && !expandedToFull
            ? `min(${initialMobileHeight}, 92vh)`
            : '92vh',
          transition: expandedToFull ? `max-height 350ms ${SPRING_CURVE}` : undefined,
        }}
      >
        {/* Drag handle — mobile only (44px touch target). `touch-action: none`
            blijft staan: op precies deze strook mag de browser het gebaar nooit
            claimen, ook niet vóór onze eerste touchmove. De handler zelf komt
            van de paneel-brede `onTouchStart` hierboven. */}
        <div
          className="flex shrink-0 justify-center py-5 cursor-grab md:hidden"
          style={{ touchAction: 'none' }}
        >
          <div className="h-1 w-10 rounded-full bg-[var(--border-md)]" />
        </div>

        {/* Header — blueprint Type 5 (Modal) met kicker-streep + Playfair titel.
            Actions-slot (rechts van titel, vóór close-knop) ontvangt
            header-icons zoals de delete-knop van entity-panes; mirror van
            de desktop SlideInPane-header zodat dezelfde affordances op
            mobile bereikbaar blijven. */}
        {(title || actions) && (
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span
                aria-hidden
                className="inline-block h-px w-7 shrink-0"
                style={{ background: 'var(--module-active-500)' }}
              />
              {title && (
                <h3
                  id={titleId}
                  className="font-bold text-[var(--ink)] truncate"
                  style={{ fontFamily: 'var(--font-playfair, serif)' }}
                >
                  {title}
                </h3>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-1 ml-2">
                {actions}
              </div>
            )}
            <button
              onClick={handleProgrammaticClose}
              aria-label="Sluiten"
              className="touch-target rounded-md text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] shrink-0 ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div
          ref={contentRef}
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ overscrollBehaviorY: 'contain' }}
          onScroll={initialMobileHeight && !expandedToFull ? (e) => {
            const el = e.currentTarget
            // Expand when user scrolls near bottom of initial height
            if (el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
              setExpandedToFull(true)
            }
          } : undefined}
        >
          {children}
        </div>

        {/* Optionele sticky footer-slot — staat buiten de scroll-content zodat
            primary/secondary acties altijd zichtbaar blijven. Border-top en
            paper-bg zijn consistent met de desktop SlideInPane-footer, zodat
            beide rendermodi visueel uitwisselbaar zijn.
            Standaard (modal boven de pill) gebruikt de footer enkel de iOS
            safe-area als bodempadding — de pill is immers afgedekt. Alleen in
            `belowFloatingNav` (NavMenuSheet) staat de pill nog bovenop en is
            `--mobile-nav-clearance` nodig zodat sticky knoppen er niet achter
            verdwijnen. Op lg+ is die var 0 (pill verborgen). */}
        {footerSlot && (
          <div className={`shrink-0 border-t border-[var(--border-ed)] bg-[var(--paper)] px-5 pt-3 lg:pb-3 ${belowFloatingNav ? 'pb-[var(--mobile-nav-clearance)]' : 'pb-[calc(var(--safe-area-bottom,0px)+0.75rem)]'}`}>
            {footerSlot}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
