'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Zap, Compass, ChevronUp } from 'lucide-react'
import { useRef, type ComponentType } from 'react'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { getActiveNavModules } from '@/lib/module-registry'
import { useMobileAppStripState } from '@/components/app/shell/mobile-app-strip-state'
import { useCategoryAppLinks } from '@/components/app/shell/responsive-shell'

// Static config per nav module — label, path, icon, and color token.
// Module-IDs blijven `kern`/`wil`/`horizon` (interne registry) maar de UI
// gebruikt de nieuwe Overzicht/Toekomst-namen + URLs uit de navigatie-
// architectuur. Will-tab blijft tijdelijk staan tot Will-domein verhuist.
const tabConfig: Record<string, { label: string; href: string; icon: ComponentType<{ className?: string }>; color: string }> = {
  kern:    { label: 'Overzicht', href: '/overzicht', icon: Wallet,  color: 'amber'  },
  wil:     { label: 'Wil',       href: '/will',      icon: Zap,     color: 'teal'   },
  horizon: { label: 'Toekomst',  href: '/toekomst',  icon: Compass, color: 'purple' },
}

const activeColors: Record<string, string> = {
  amber:  'text-kern-600',
  teal:   'text-wil-600',
  purple: 'text-horizon-600',
}

const activeBg: Record<string, string> = {
  amber:  'bg-kern-50/40',
  teal:   'bg-wil-50/40',
  purple: 'bg-horizon-50/40',
}

const activeBorder: Record<string, string> = {
  amber:  'border-kern-500',
  teal:   'border-wil-500',
  purple: 'border-horizon-500',
}

// Long-press configuratie. 450ms is bewust iets onder de iOS-standaard
// (~500ms) zodat de gesture goed voelt zonder dat de gebruiker het gevoel
// krijgt te lang te moeten wachten. 8px move-drempel matcht de
// HORIZONTAL_DECISION_PX uit lib/hooks/use-swipe-back.ts — daarboven
// behandelen we het als scroll-gesture en cancelen we de long-press.
const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 8

export function BottomNav() {
  const { activeModules } = useModuleAccess()

  // Derive which tabs to show from active modules.
  const activeNavModules = getActiveNavModules(activeModules)
  const visibleTabs = activeNavModules.map(m => tabConfig[m])

  // Hide tab bar when only 1 tab — user is already on that module's page
  if (visibleTabs.length <= 1) return null

  return (
    <nav className="fixed bottom-0 left-0 z-40 border-t-2 border-[var(--border-md)] bg-[var(--paper)]/90 backdrop-blur-md transition-[right] duration-300 md:hidden" data-mobile-bottom-nav="true" style={{ right: 'var(--chat-sidebar-width, 0px)' }}>
      <BottomNavTabs />
    </nav>
  )
}

/**
 * Content-only versie van de BottomNav. Rendert ALLEEN de tab-rij zonder
 * `fixed bottom-0`-positionering of safe-area-padding — bedoeld om
 * geëmbed te worden in een ander shell-element (bv. de tray-of-three van
 * MobileStackShell, plan §4.4). De wrapping `<nav>` met fixed-styling blijft
 * de verantwoordelijkheid van de aanroeper.
 *
 * Long-press-toggle voor de apps-strip leeft op de Kern-tab: 450ms ingedrukt
 * houden (zonder >8px beweging) toggelt de strip — vanaf elke module, als
 * overlay over de huidige page. Korte tap blijft pure navigatie naar /core.
 * Discoverability via de chevron-affordance onder het label zodra er actieve
 * category-apps zijn.
 *
 * Geëxporteerd zodat `MobileBottomBar` (kind='tabs') deze kan gebruiken zonder
 * dubbele bottom-nav in de DOM.
 */
export function BottomNavTabs() {
  const pathname = usePathname() ?? '/'
  const { activeModules } = useModuleAccess()
  const { isOpen: stripOpen, toggle: toggleStrip } = useMobileAppStripState()
  const categoryAppLinks = useCategoryAppLinks()

  // Long-press refs leven op tab-niveau maar worden alleen door de Kern-tab
  // gelezen. Eén ref-set is genoeg omdat alleen één tab tegelijk getouched
  // kan worden (single-touch flow).
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const activeNavModules = getActiveNavModules(activeModules)
  const visibleTabs = activeNavModules.map(m => tabConfig[m])

  if (visibleTabs.length <= 1) return null

  const hasKernApps = categoryAppLinks.length > 0

  // Long-press handler. Toggle de strip ongeacht huidige module — vanaf
  // /will of /horizon verschijnt hij als overlay over de huidige page,
  // zodat de gebruiker direct naar een app kan tikken zonder eerst een
  // tussenstop op /core te laden. Vibration is no-op op iOS Safari +
  // privacy modes, try/catch om SSR/legacy-browsers af te vangen.
  const triggerLongPress = () => {
    longPressTriggeredRef.current = true
    try {
      navigator.vibrate?.(10)
    } catch {
      // ignore — vibration not supported
    }
    toggleStrip()
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLAnchorElement>) => {
    if (!hasKernApps) return
    // Multi-touch (twee+ vingers) cancelt de long-press direct — voorkomt
    // dat een pinch/zoom-gesture op de Kern-tab per ongeluk de strip toggelt.
    if (e.touches.length !== 1) {
      clearLongPressTimer()
      return
    }
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    longPressTriggeredRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      triggerLongPress()
    }, LONG_PRESS_MS)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLAnchorElement>) => {
    if (!touchStartRef.current || longPressTimerRef.current === null) return
    const touch = e.touches[0]
    if (!touch) return
    const dx = touch.clientX - touchStartRef.current.x
    const dy = touch.clientY - touchStartRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > MOVE_CANCEL_PX) {
      clearLongPressTimer()
    }
  }

  const handleTouchEnd = () => {
    clearLongPressTimer()
    touchStartRef.current = null
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Click vuurt automatisch na touchend op mobile. Als de long-press
    // getriggerd was, voorkomen we hier dat de Link ook nog naar /core
    // navigeert (toggle / setOpen+push hebben het werk al gedaan).
    if (longPressTriggeredRef.current) {
      e.preventDefault()
      longPressTriggeredRef.current = false
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Onderdrukt iOS Safari long-press text-menu / Android save-image-menu.
    // Alleen als er apps zijn — zonder apps is er geen long-press-gesture
    // dus geen reden om het systeem-menu te blokkeren.
    if (hasKernApps) {
      e.preventDefault()
    }
  }

  return (
    <div className="flex items-stretch justify-around w-full pb-[var(--safe-area-bottom)]">
      {visibleTabs.map((tab) => {
        // tab may be undefined if tabConfig lookup fails (defensive guard)
        if (!tab) return null
        const isActive = pathname.startsWith(tab.href)
        const Icon = tab.icon
        // Non-kern tabs are added dynamically when the user activates a
        // module, so they receive the reveal animation.
        const isNonKern = tab.href !== '/overzicht'
        const isKern = tab.href === '/overzicht'
        // Chevron blijft persistent zichtbaar zodra er apps zijn (ook vanaf
        // /will of /toekomst) zodat gebruikers ook elders weten dat Overzicht een
        // apps-drawer heeft. Rotatie volgt de strip-state direct — de strip
        // is module-agnostisch en kan over elke page openen.
        const showChevron = isKern && hasKernApps
        const chevronRotated = stripOpen
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onTouchStart={isKern ? handleTouchStart : undefined}
            onTouchMove={isKern ? handleTouchMove : undefined}
            onTouchEnd={isKern ? handleTouchEnd : undefined}
            onTouchCancel={isKern ? handleTouchEnd : undefined}
            onClick={isKern ? handleClick : undefined}
            onContextMenu={isKern ? handleContextMenu : undefined}
            aria-expanded={showChevron ? stripOpen : undefined}
            aria-controls={showChevron ? 'mobile-app-strip' : undefined}
            style={{ height: 'var(--bottom-nav-height)' }}
            className={`tap-highlight relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors border-t-3 ${
              isNonKern ? 'animate-nav-reveal' : ''
            } ${
              isActive
                ? `${activeColors[tab.color]} ${activeBorder[tab.color]} ${activeBg[tab.color]} rounded-b-sm`
                : 'text-[var(--ink-3)] border-transparent'
            }`}
          >
            <Icon className="relative h-3.5 w-3.5" />
            <span className="relative">{tab.label}</span>
            {showChevron ? (
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2"
              >
                <ChevronUp
                  className={`h-2.5 w-2.5 transition-transform duration-200 motion-reduce:transition-none ${
                    chevronRotated ? 'rotate-180' : ''
                  }`}
                />
              </span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}
