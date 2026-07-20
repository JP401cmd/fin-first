'use client'

/**
 * MobileAppStrip — icon-only secundaire balk direct boven de bottom-nav,
 * alleen zichtbaar op mobile (binnen de tray-of-three van MobileStackShell).
 * Toont één tegel per actieve "category-app" (Budgetteren, Aandelen holdings,
 * Crypto holdings, Hypotheekplanner, Verhuurrendement).
 *
 * De strip is module-agnostisch: long-press op de Kern-tab kan hem vanaf
 * elke module openen als overlay over de huidige page (zonder eerst naar
 * /core te navigeren). Pas wanneer je daadwerkelijk op een tegel tikt,
 * volgt de navigatie naar de Kern-sub-app.
 *
 * Toggle: open/dicht-state komt uit `useMobileAppStripState()`
 * (sessionStorage-backed). Default dicht; long-press op de Kern-tab toggelt.
 * Bij dicht krijgt de strip `pointer-events: none` + `aria-hidden` zodat
 * tap-targets en screen-readers de tegels overslaan, en `max-height: 0 +
 * overflow: hidden` clipt de inhoud volledig zonder de bottom-nav-positie
 * te verschuiven.
 *
 * Auto-close (drie kanalen, alle sluiten dezelfde state):
 *  1. Klik binnen de strip (tegel of lege ruimte) — bubbelt naar het
 *     document-level click-listener.
 *  2. Klik ergens anders op de pagina (behalve de bottom-nav) — zelfde
 *     listener vangt het op. Click i.p.v. touchstart zodat horizontaal
 *     scrollen door de tegels de strip niet onbedoeld sluit.
 *  3. Navigatie naar een andere route — path-change useEffect sluit zodra
 *     `pathname` verandert (= tegel-tap, andere tab, browser-back, etc.).
 *
 * Bron-van-waarheid is dezelfde server-builder die het Fin-dashboard voedt:
 * `buildCategoryAppLinks` in `lib/category-app-nav.ts`. De iconen komen via
 * `iconMap` uit `components/app/budget-shared`, gevoed door
 * `ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS`.
 *
 * Gating (rendert `null` als niet van toepassing):
 *  - kind === 'tabs' in MobileBottomBar (bij action-bar / context-actions
 *    / hidden komt de strip niet aan bod).
 *  - `links.length > 0` (geen orphan-strip wanneer er nog geen apps zijn).
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Circle } from 'lucide-react'
import { iconMap } from '@/components/app/budget-shared'
import { useCategoryAppLinks } from './responsive-shell'
import { useMobileAppStripState } from './mobile-app-strip-state'
import type { CategoryAppLink } from '@/lib/category-app-nav'

function resolveIcon(name: string) {
  return iconMap[name] ?? Circle
}

/**
 * Bepaal of een link "active" is op basis van het huidige pad + tab-param.
 * Strict: pathname moet starten met de href-base EN het tab-param moet exact
 * matchen met de tab-slug uit de link. Zonder strict match zou een gebruiker
 * op `/core/assets/cash` (zonder ?tab=) een onterecht "current"-aria krijgen
 * op de Budgetteren-tegel.
 */
function isLinkActive(
  link: CategoryAppLink,
  pathname: string,
  tab: string | null,
): boolean {
  const [base, query] = link.href.split('?')
  if (!base || !pathname.startsWith(base)) return false
  const expected = new URLSearchParams(query ?? '').get('tab')
  if (expected && tab !== expected) return false
  return true
}

// Live-reactive prefers-reduced-motion match. Bij `reduce` schakelen we de
// max-height/opacity-transitie uit (instant swap), conform plan §a11y.
// useSyncExternalStore i.p.v. useState+useEffect: SSR-safe en geen
// setState-in-effect cascade.
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function getReducedMotionServerSnapshot(): boolean {
  return false
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )
}

export function MobileAppStrip() {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const tab = searchParams?.get('tab') ?? null
  const links = useCategoryAppLinks()
  const { isOpen, setOpen } = useMobileAppStripState()
  const reducedMotion = useReducedMotion()
  const previousPathRef = useRef<string | null>(null)

  // Sluit de strip zodra de gebruiker daadwerkelijk ergens naartoe navigeert
  // (tegel-tap, andere bottom-nav-tab, browser-back, etc.). Long-press die
  // alleen de strip opent zonder navigatie raakt deze effect niet — pathname
  // blijft hetzelfde, dus prev === pathname op de eerste re-render.
  useEffect(() => {
    const prev = previousPathRef.current
    previousPathRef.current = pathname
    if (prev === null || prev === pathname) return
    if (isOpen) setOpen(false)
  }, [pathname, isOpen, setOpen])

  // Document-level click-listener: sluit de strip bij ELK click behalve
  // klikken op de bottom-nav (Kern-tab mag de strip niet via dit pad sluiten
  // — die heeft zijn eigen long-press/korte-tap-logica). Clicks binnen de
  // strip (op een tegel of de container) sluiten ook — bubble naar document.
  // 'click' i.p.v. 'touchstart' voorkomt dat horizontale scroll-gestures
  // binnen de tegel-rij de strip onbedoeld sluiten.
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target) return
      if (target.closest('[data-mobile-bottom-nav]')) return
      setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [isOpen, setOpen])

  // Geen apps geregistreerd voor deze gebruiker → strip is een orphan.
  // Niet renderen scheelt DOM-cost en voorkomt een lege balk-flits bij
  // een per ongeluk getriggerde toggle.
  if (links.length === 0) return null

  // Strip toont altijd Kern-apps (de enige categorie-deepening-apps
  // momenteel). De module-active-* shades blijven dus Kern-amber, ook
  // wanneer de strip als overlay op /will of /horizon verschijnt.
  const moduleVars = Object.fromEntries(
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map(
      (s) => [`--module-active-${s}`, `var(--color-kern-${s})`],
    ),
  ) as React.CSSProperties

  // iOS-spring easing voor de open/dicht-transitie, dezelfde curve als
  // nav-stack-provider.tsx (TRANSITION_DURATION_MS = 240). 200ms is luchtiger
  // voor een lokale toggle dan een full tray-push.
  const transition = reducedMotion
    ? 'none'
    : 'max-height 200ms cubic-bezier(0.32, 0.72, 0, 1), opacity 150ms ease'

  return (
    <nav
      role="navigation"
      aria-label="Kern-apps"
      aria-hidden={!isOpen}
      id="mobile-app-strip"
      data-testid="mobile-app-strip"
      className="flex items-center justify-around gap-1.5 px-3 py-1 border-b border-[var(--rule-soft,var(--border-ed))] bg-[var(--paper)]/90 backdrop-blur-md overflow-x-auto overflow-y-hidden"
      style={{
        ...moduleVars,
        maxHeight: isOpen ? '72px' : '0px',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition,
      }}
    >
      {links.map((link) => {
        const Icon = resolveIcon(link.iconName)
        const active = isLinkActive(link, pathname, tab)
        // Asset = module-kleur (kern-amber); debt = negative-tinted ink —
        // spiegelt dezelfde variant-keuze als CategoryAppCard op het dashboard.
        const accent =
          link.kind === 'asset' ? 'var(--module-active-500)' : 'var(--negative)'
        const iconColor =
          link.kind === 'asset' ? 'var(--module-active-700)' : 'var(--negative)'
        const itemLabel = link.itemCount === 1 ? '1 item' : `${link.itemCount} items`
        const accessibleLabel = `${link.appLabel} — ${link.categoryLabel}, ${itemLabel}`
        return (
          <Link
            key={`${link.kind}-${link.type}-${link.appLabel}`}
            href={link.href}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            aria-current={active ? 'page' : undefined}
            tabIndex={isOpen ? 0 : -1}
            data-testid={`mobile-app-link-${link.kind}-${link.type}`}
            className={`tap-highlight relative shrink-0 flex h-11 w-11 items-center justify-center border border-[var(--border-ed)] transition-colors duration-150 ${
              active
                ? 'bg-[var(--module-active-100)]'
                : 'bg-[var(--paper)] hover:bg-[var(--subtle)]'
            }`}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0"
              style={{ width: active ? '3px' : '2px', background: accent }}
            />
            <span aria-hidden style={{ color: iconColor }}>
              <Icon className="h-4 w-4" />
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
