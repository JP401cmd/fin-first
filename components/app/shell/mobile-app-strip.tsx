'use client'

/**
 * MobileAppStrip — icon-only secundaire balk direct boven de bottom-nav,
 * alleen zichtbaar op mobile (binnen de tray-of-three van MobileStackShell)
 * en alleen onder `/core/**`. Toont één tegel per actieve "category-app"
 * (Budgetteren, Aandelen holdings, Crypto holdings, Hypotheekplanner,
 * Verhuurrendement).
 *
 * Bron-van-waarheid is dezelfde server-builder die het Will-dashboard voedt:
 * `buildCategoryAppLinks` in `lib/category-app-nav.ts`. De iconen komen via
 * `iconMap` uit `components/app/budget-shared`, gevoed door
 * `ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS`. Visueel template gespiegeld op de
 * mobile-variant van `CategoryAppNavBar` (`category-app-nav-bar.tsx:138-198`)
 * — `h-11 w-11` square tegels met linker accent-streep — uitgebreid met een
 * active-state via pathname + `?tab=`.
 *
 * Gating:
 *  - kind === 'tabs' in MobileBottomBar (bij action-bar / context-actions
 *    / hidden komt de strip niet aan bod).
 *  - pathname startsWith '/core' (Kern). Andere modules: render null.
 *  - visibleLinks.length > 0 (geen orphan-strip).
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Circle } from 'lucide-react'
import { iconMap } from '@/components/app/budget-shared'
import { useCategoryAppLinks } from './responsive-shell'
import type { CategoryAppLink } from '@/lib/category-app-nav'

type NavModule = 'kern' | 'wil' | 'horizon'

function resolveIcon(name: string) {
  return iconMap[name] ?? Circle
}

function detectActiveModule(pathname: string): NavModule | null {
  if (pathname.startsWith('/core')) return 'kern'
  if (pathname.startsWith('/will')) return 'wil'
  if (pathname.startsWith('/horizon')) return 'horizon'
  return null
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

export function MobileAppStrip() {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const tab = searchParams?.get('tab') ?? null
  const links = useCategoryAppLinks()
  const navModule = detectActiveModule(pathname)

  // Filter naar links binnen de huidige module. Vandaag zijn alle
  // category-apps Kern-apps; toekomstvast: zodra `buildCategoryAppLinks`
  // Wil/Horizon-entries gaat opleveren, laat deze filter ze automatisch
  // door zonder code-wijziging hier.
  const visibleLinks = navModule === 'kern' ? links : []
  if (!navModule || visibleLinks.length === 0) return null

  // Inject module-active-* shades op de wrapper zodat onderliggende tegels
  // de juiste module-kleur erven, ongeacht of de strip onder core/layout
  // valt (dat is niet zo — MobileBottomBar zit boven de page-tree).
  const moduleVars = Object.fromEntries(
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map(
      (s) => [`--module-active-${s}`, `var(--color-${navModule}-${s})`],
    ),
  ) as React.CSSProperties

  return (
    <nav
      role="navigation"
      aria-label="Kern-apps"
      data-testid="mobile-app-strip"
      className="flex items-center justify-around gap-1.5 px-3 py-1 border-b border-[var(--rule-soft,var(--border-ed))] bg-[var(--paper)]/90 backdrop-blur-md overflow-x-auto"
      style={moduleVars}
    >
      {visibleLinks.map((link) => {
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
