'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Zap, Compass } from 'lucide-react'
import type { ComponentType } from 'react'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { getActiveNavModules } from '@/lib/module-registry'

// Static config per nav module — label, path, icon, and color token
const tabConfig: Record<string, { label: string; href: string; icon: ComponentType<{ className?: string }>; color: string }> = {
  kern:    { label: 'Kern',    href: '/core',    icon: Wallet,  color: 'amber'  },
  wil:     { label: 'Wil',     href: '/will',    icon: Zap,     color: 'teal'   },
  horizon: { label: 'Horizon', href: '/horizon', icon: Compass, color: 'purple' },
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

export function BottomNav() {
  const { activeModules } = useModuleAccess()

  // Derive which tabs to show from active modules.
  const activeNavModules = getActiveNavModules(activeModules)
  const visibleTabs = activeNavModules.map(m => tabConfig[m])

  // Hide tab bar when only 1 tab — user is already on that module's page
  if (visibleTabs.length <= 1) return null

  return (
    <nav className="fixed bottom-0 left-0 z-40 border-t-2 border-[var(--border-md)] bg-[var(--paper)]/90 backdrop-blur-md transition-[right] duration-300 md:hidden" style={{ right: 'var(--chat-sidebar-width, 0px)' }}>
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
 * Geëxporteerd zodat `MobileBottomBar` (kind='tabs') deze kan gebruiken zonder
 * dubbele bottom-nav in de DOM.
 */
export function BottomNavTabs() {
  const pathname = usePathname()
  const { activeModules } = useModuleAccess()

  const activeNavModules = getActiveNavModules(activeModules)
  const visibleTabs = activeNavModules.map(m => tabConfig[m])

  if (visibleTabs.length <= 1) return null

  return (
    <div className="flex items-stretch justify-around w-full pb-[var(--safe-area-bottom)]">
      {visibleTabs.map((tab) => {
        // tab may be undefined if tabConfig lookup fails (defensive guard)
        if (!tab) return null
        const isActive = pathname.startsWith(tab.href)
        const Icon = tab.icon
        // Non-kern tabs are added dynamically when the user activates a
        // module, so they receive the reveal animation.
        const isNonKern = tab.href !== '/core'
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
          </Link>
        )
      })}
    </div>
  )
}
