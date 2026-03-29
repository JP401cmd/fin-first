'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Zap, Compass } from 'lucide-react'
import type { ComponentType } from 'react'
import { useFeatureAccess, useModuleAccess } from '@/components/app/feature-access-provider'
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
  const pathname = usePathname()
  const { needsActivation } = useFeatureAccess()
  const { activeModules } = useModuleAccess()

  // Derive which tabs to show from active modules.
  // During the invulfase (needsActivation), only De Kern is shown so the user
  // can complete onboarding before accessing the other modules.
  const activeNavModules = getActiveNavModules(activeModules)
  const visibleTabs = needsActivation
    ? activeNavModules.filter(m => m === 'kern').map(m => tabConfig[m])
    : activeNavModules.map(m => tabConfig[m])

  return (
    <nav className="fixed bottom-0 left-0 z-40 border-t-2 border-[var(--border-md)] bg-[var(--paper)]/90 backdrop-blur-md safe-bottom transition-[right] duration-300 md:hidden" style={{ right: 'var(--chat-sidebar-width, 0px)' }}>
      <div className="flex items-center justify-around" style={{ height: 'var(--bottom-nav-height)' }}>
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
              className={`tap-highlight relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors border-t-3 ${
                isNonKern ? 'animate-nav-reveal' : ''
              } ${
                isActive
                  ? `${activeColors[tab.color]} ${activeBorder[tab.color]} ${activeBg[tab.color]} rounded-b-sm`
                  : 'text-[var(--ink-3)] border-transparent'
              }`}
            >
              <Icon className="relative h-5 w-5" />
              <span className="relative">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
