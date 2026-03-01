'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Zap, Compass, Lock } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'

const tabs = [
  { label: 'Kern', href: '/core', icon: Wallet, color: 'amber', requiresActivation: false },
  { label: 'Wil', href: '/will', icon: Zap, color: 'teal', requiresActivation: true },
  { label: 'Horizon', href: '/horizon', icon: Compass, color: 'purple', requiresActivation: true },
] as const

const activeColors: Record<string, string> = {
  amber: 'text-kern-600',
  teal: 'text-wil-600',
  purple: 'text-horizon-600',
}

const pillColors: Record<string, string> = {
  amber: 'bg-kern-100',
  teal: 'bg-wil-100',
  purple: 'bg-horizon-100',
}

export function BottomNav() {
  const pathname = usePathname()
  const { needsActivation } = useFeatureAccess()

  // Always show all tabs for discoverability
  const visibleTabs = tabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-[var(--border-md)] bg-[var(--paper)]/90 backdrop-blur-md safe-bottom md:hidden">
      <div className="flex items-center justify-around" style={{ height: 'var(--bottom-nav-height)' }}>
        {visibleTabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href)
          const isLocked = tab.requiresActivation && needsActivation
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tap-highlight relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors ${
                isActive ? activeColors[tab.color] : isLocked ? 'text-[var(--ink-4)] opacity-70' : 'text-[var(--ink-3)]'
              }`}
            >
              <span className={`absolute top-1.5 h-4 w-12 rounded-full transition-opacity duration-200 ${pillColors[tab.color]} ${isActive ? 'opacity-40' : 'opacity-0'}`} />
              <Icon className="relative h-5 w-5" />
              <span className="relative flex items-center gap-0.5">
                {tab.label}
                {isLocked && <Lock className="h-2.5 w-2.5 opacity-50" />}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
