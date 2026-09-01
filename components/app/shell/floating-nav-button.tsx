'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, LayoutGrid, X, Home } from 'lucide-react'
import { useCommandPalette } from '@/components/command-palette/command-palette-provider'
import { useOverlayOpen } from '@/lib/overlay-signal'
import { isImmersiveRoute } from '@/lib/shell/immersive-routes'
import { useFinSlot } from '@/lib/shell/fin-slot'
import { useHomeScreen } from '@/lib/hooks/use-home-screen'
import { NavMenuSheet } from './nav-menu-sheet'

// Long-press-configuratie voor de waffle-knop: 1000 ms vasthouden = direct
// naar het gekozen homescherm (useHomeScreen). Bewust boven de
// systeem-long-press (~500 ms) zodat de gesture nooit botst met een gewone
// tik; de 8px-move-drempel matcht HORIZONTAL_DECISION_PX uit
// lib/hooks/use-swipe-back.ts — daarboven is het een scroll/swipe en cancelen
// we. Patroon gespiegeld op de (inmiddels dode) long-press in bottom-nav-tabs.tsx.
//
// Druk-registratie (huisje-icoon + groei) verschijnt pas ná
// PRESS_VISUAL_DELAY_MS: een gewone korte tik (menu-toggle) mag nooit een
// huisje flitsen — dat las als "de knop blijft hangen" (bug-melding 1 sep
// 2026). De groei-animatie overbrugt daarna de rést van de drempel; de
// CSS-transition op de icon-wrapper is dus LONG_PRESS_HOME_MS −
// PRESS_VISUAL_DELAY_MS = duration-[750ms] — houd die drie in sync.
const LONG_PRESS_HOME_MS = 1000
const PRESS_VISUAL_DELAY_MS = 250
const MOVE_CANCEL_PX = 8

/**
 * FloatingNavButton — Vercel-style mobile nav-control.
 *
 * Een floating pill onderaan het scherm met twee acties:
 *  - 🔍 Zoeken (vergrootglas) → opent command-palette voor fuzzy-zoek
 *    door pagina's, doelen, transacties en acties
 *  - ⊞ Waffle/grid (toggle) → opent NavMenuSheet met de complete nav-
 *    structuur. Wanneer menu open is, verandert het waffle-icoon in een
 *    kruisje (✕) en sluit een klik het menu — geen dubbele dismiss-area.
 *    LONG-PRESS (1 s, touch-only): direct naar het gekozen homescherm; het
 *    icoon wisselt tijdens het vasthouden naar een meegroeiend huisje —
 *    een verrijking, geen enige weg (home blijft via het menu en de
 *    top-bar-← bereikbaar, dus geen apart SR-/toetsenbord-equivalent nodig).
 *
 * Eén centrale knop = één mentale instap. Sub-routes en globale items
 * leven in het sheet-menu (Vercel-stijl).
 *
 * Visueel: ~33% schermbreed, midden-gecentreerd, 12px boven safe-area.
 * Zichtbaar zolang het eigen NavMenuSheet open is (z-index boven die sheet,
 * zodat de toggle-knop blijft staan en het menu eenvoudig dicht kan). Maar
 * VERBORGEN zodra er een andere overlay open is (BottomSheet/SlideInPane
 * melden zich via lib/overlay-signal.ts) — een modale overlay dekt de pill
 * niet langer af, hij verdwijnt eronder vandaan. Zie CLAUDE.md §Modal-conventie.
 */
export function FloatingNavButton() {
  const [menuOpen, setMenuOpen] = useState(false)
  const cmd = useCommandPalette()
  const router = useRouter()
  // Verberg de pill zodra er een overlay open is (BottomSheet/SlideInPane melden
  // zich via lib/overlay-signal.ts). NavMenuSheet meldt zich bewust NIET
  // (`belowFloatingNav`) — de pill is dáár de toggle — dus `menuOpen` houdt de
  // pill zichtbaar. Zie CLAUDE.md §Modal-conventie.
  const overlayOpen = useOverlayOpen()
  // …en op een immersieve taakflow (bv. de check-in-wizard), die zijn eigen
  // sticky primaire actie onderaan zet. Zie lib/shell/immersive-routes.ts.
  const pathname = usePathname()
  const hidden = overlayOpen || isImmersiveRoute(pathname)
  // Gekozen homescherm — het doel van de long-press op de waffle.
  const { homeHref } = useHomeScreen()

  // Long-press-administratie (touch-only, zie de constanten bovenaan).
  const pressTimerRef = useRef<number | null>(null)
  const pressVisualTimerRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  // Zichtbare druk-registratie: waar tijdens het vasthouden het huisje-icoon
  // meegroeit. Gaat aan ná PRESS_VISUAL_DELAY_MS écht vasthouden (een korte
  // tik toont dus nooit een huisje) en uit bij loslaten, cancelen,
  // wegbewegen, de menu-toggle, verbergen van de pill of het afgaan van de
  // navigatie.
  const [pressing, setPressing] = useState(false)

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    if (pressVisualTimerRef.current !== null) {
      window.clearTimeout(pressVisualTimerRef.current)
      pressVisualTimerRef.current = null
    }
  }

  // De pill blijft gemount wanneer hij verborgen wordt (visibility:hidden bij
  // overlay/immersive) — een nog lopende press-timer mag dan niet alsnog
  // onder de overlay door navigeren. Zelfde opruiming bij unmount.
  useEffect(() => {
    if (!hidden) return
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    setPressing(false)
  }, [hidden])
  useEffect(
    () => () => {
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current)
      if (pressVisualTimerRef.current !== null) window.clearTimeout(pressVisualTimerRef.current)
    },
    [],
  )


  // Fin portalt zijn idle-bubbel in het slot hiernaast (zie lib/shell/fin-slot.tsx).
  // Registratie loopt via een effect, NIET rechtstreeks vanuit de ref-callback:
  // een ref-callback vuurt tijdens de commit-fase, óók tijdens hydration — een
  // synchrone `registerSlot()` daar liet FinHome (elders in de boom, later
  // gehydrateerd) al met een niet-lege `slotEl` hydrateren terwijl de server 'm
  // nooit kende, wat React als hydration-mismatch markeerde. Een effect draait
  // pas ná de volledige commit, dus de eerste hydration-pass blijft overal
  // consistent met de server (slotEl start null); de portal-swap volgt daarna
  // als gewone client-render.
  const { registerSlot } = useFinSlot()
  const slotRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    registerSlot(slotRef.current)
    return () => registerSlot(null)
  }, [registerSlot])

  const handleAction = (action: 'open-chat' | 'open-account' | 'open-search') => {
    if (action === 'open-search') {
      cmd.open()
      return
    }
    if (action === 'open-account') {
      setMenuOpen(false)
      router.push('/mijn/account')
      return
    }
    // open-chat wordt later gekoppeld aan de Fin-coach-pane. Voor nu no-op
    // zodat de knop niet crasht.
  }

  // ── Long-press op de waffle: 1,5 s vasthouden → gekozen homescherm ────────
  const goHomeFromLongPress = () => {
    longPressFiredRef.current = true
    setPressing(false)
    try {
      navigator.vibrate?.(10)
    } catch {
      // ignore — vibration not supported
    }
    // Zelfde volgorde als handleAction: eerst het menu dicht, dan navigeren.
    // router.push naar een tab-root volstaat — de nav-stack reset zichzelf.
    setMenuOpen(false)
    router.push(homeHref)
  }

  const handleWaffleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    // Multi-touch (twee+ vingers) cancelt de long-press direct — voorkomt dat
    // een pinch-gesture per ongeluk naar home navigeert.
    if (e.touches.length !== 1) {
      clearPressTimer()
      setPressing(false)
      return
    }
    const touch = e.touches[0]
    if (!touch) return
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    longPressFiredRef.current = false
    clearPressTimer()
    // Druk-registratie pas ná de vertraging: een korte tik blijft visueel een
    // gewone menu-toggle (zie de constanten bovenaan).
    pressVisualTimerRef.current = window.setTimeout(() => {
      pressVisualTimerRef.current = null
      setPressing(true)
    }, PRESS_VISUAL_DELAY_MS)
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null
      goHomeFromLongPress()
    }, LONG_PRESS_HOME_MS)
  }

  const handleWaffleTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!touchStartPosRef.current || pressTimerRef.current === null) return
    const touch = e.touches[0]
    if (!touch) return
    const dx = touch.clientX - touchStartPosRef.current.x
    const dy = touch.clientY - touchStartPosRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > MOVE_CANCEL_PX) {
      clearPressTimer()
      setPressing(false)
    }
  }

  const handleWaffleTouchEnd = () => {
    clearPressTimer()
    setPressing(false)
    touchStartPosRef.current = null
  }

  const handleWaffleClick = () => {
    // Vangnet (bug 1 sep 2026): op sommige toestellen komt de click door
    // terwijl de touchend de knop nooit bereikte — de druk-registratie bleef
    // dan hangen (huisje-icoon terwijl het menu open stond) en de nog lopende
    // timer kon 1 s later alsnog naar home navigeren. De click zelf is het
    // bewijs dat de tik voorbij is: wis timer + state, altijd.
    clearPressTimer()
    setPressing(false)
    // Click vuurt automatisch ná touchend. Was de long-press al afgegaan, dan
    // mag diezelfde aanraking het menu niet alsnog togglen. (Geen
    // preventDefault nodig: een <button type="button"> heeft geen
    // default-actie — de suppressie ís de vroege return.)
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    setMenuOpen((prev) => !prev)
  }

  const handleWaffleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Onderdrukt het iOS/Android-systeemmenu tijdens de long-press.
    e.preventDefault()
  }

  return (
    <>
      <div
        // z-[60] zit tussen de NavMenuSheet (z-50, `belowFloatingNav`) en de
        // gewone content-modals (z-[70], standaard BOVEN de pill). Zo blijft de
        // toggle-knop tappbaar wanneer hét nav-menu open is, terwijl een gewone
        // modal de pill juist afdekt (volle hoogte voor content/knoppen onderin).
        // `lg:hidden` (niet md:hidden) zodat de pill zichtbaar blijft in de
        // band 768–1023px — daar is de Sidebar (`hidden lg:flex`) nog verborgen
        // én draait de mobiele tray-shell (`lg:hidden`), dus zonder de pill zou
        // er geen navigatie-affordance zijn. Houd de breakpoint in sync met de
        // `--mobile-nav-clearance`-media-query in globals.css.
        className="fixed left-1/2 -translate-x-1/2 z-[60] lg:hidden"
        style={{
          bottom: `calc(var(--safe-area-bottom, 0px) + 12px)`,
          // `visibility: hidden` (niet unmount): de pill is `position: fixed`,
          // dus verbergen geeft géén layout-sprong, en de knop verdwijnt netjes
          // uit tab-order + pointer-events zolang een overlay open is. NavMenu
          // (belowFloatingNav) meldt zich niet aan, dus blijft de pill zichtbaar.
          visibility: hidden ? 'hidden' : undefined,
        }}
        aria-hidden={hidden || undefined}
        data-mobile-floating-nav="true"
      >
        <div className="flex items-stretch gap-px rounded-full bg-stone-900 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.25),0_2px_8px_rgba(0,0,0,0.15)]">
          <button
            type="button"
            onClick={() => cmd.open()}
            aria-label="Zoeken"
            className="flex items-center justify-center rounded-full px-5 py-2.5 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--paper)]"
          >
            <Search size={18} strokeWidth={2.25} />
          </button>
          <div className="w-px self-stretch bg-white/15" aria-hidden="true" />
          <button
            type="button"
            onClick={handleWaffleClick}
            onTouchStart={handleWaffleTouchStart}
            onTouchMove={handleWaffleTouchMove}
            onTouchEnd={handleWaffleTouchEnd}
            onTouchCancel={handleWaffleTouchEnd}
            /* Redundant einde-signaal: op toestellen waar de touchend de knop
               niet bereikt (browser-gesture-heuristiek) ruimt de pointerup
               dezelfde press-state op. Idempotent — dubbel wissen is gratis. */
            onPointerUp={handleWaffleTouchEnd}
            onPointerCancel={handleWaffleTouchEnd}
            onContextMenu={handleWaffleContextMenu}
            aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={menuOpen}
            data-pressing={pressing || undefined}
            className="flex items-center justify-center rounded-full px-5 py-2.5 text-white/90 hover:bg-white/10 active:bg-white/15 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--paper)]"
          >
            {/* Druk-registratie: verschijnt ná PRESS_VISUAL_DELAY_MS en groeit
                dan over de resterende drempel mee (duration-[750ms] =
                LONG_PRESS_HOME_MS − PRESS_VISUAL_DELAY_MS); bij loslaten/
                cancel springt het snel terug (duration-150). */}
            <span
              className={`flex items-center justify-center transition-transform ease-linear ${
                pressing ? 'duration-[750ms] scale-125' : 'duration-150 scale-100'
              }`}
            >
              {pressing ? (
                <Home size={18} strokeWidth={2.25} />
              ) : menuOpen ? (
                <X size={18} strokeWidth={2.5} />
              ) : (
                <LayoutGrid size={18} strokeWidth={2.25} />
              )}
            </span>
          </button>

          {/* Fin — derde segment van dezelfde capsule, geen apart element meer.
              De scheidingslijn verbergt zichzelf (`has-[+div:empty]`) zolang
              Fin niets portalt (chat open / overlay), anders bleef er een kier
              met een kaal streepje over. */}
          <div className="w-px self-stretch bg-white/15 has-[+div:empty]:hidden" aria-hidden="true" />
          <div ref={slotRef} className="flex items-center justify-center empty:hidden" />
        </div>
      </div>

      <NavMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAction={handleAction}
      />
    </>
  )
}
