'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { PerspectiveSwitcher } from '@/components/app/perspective-switcher'
import { useNotifications } from '@/components/app/notifications/notification-provider'

const allNavItems = [
  { label: 'Dashboard', href: '/dashboard', color: 'zinc', requiresActivation: false },
  { label: 'De Kern', href: '/core', color: 'amber', requiresActivation: false },
  { label: 'De Wil', href: '/will', color: 'teal', requiresActivation: true },
  { label: 'De Horizon', href: '/horizon', color: 'purple', requiresActivation: true },
] as const

const activeClasses: Record<string, string> = {
  zinc: 'text-zinc-900 border-zinc-500',
  amber: 'text-kern-600 border-kern-500',
  teal: 'text-wil-600 border-wil-500',
  purple: 'text-horizon-600 border-horizon-500',
}

const hoverClasses: Record<string, string> = {
  zinc: 'hover:text-zinc-900',
  amber: 'hover:text-kern-600',
  teal: 'hover:text-wil-600',
  purple: 'hover:text-horizon-600',
}

export function AppHeader({ email, role }: { email: string; role?: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const { needsActivation } = useFeatureAccess()
  const { unreadCount, openModal } = useNotifications()

  // Always show all nav items in desktop nav for discoverability
  const navItems = allNavItems

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-xl font-bold text-zinc-900">
            TriFinity
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const isLocked = item.requiresActivation && needsActivation
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? `${activeClasses[item.color]} bg-zinc-50`
                      : isLocked
                        ? 'text-zinc-400 hover:text-zinc-500'
                        : `text-zinc-600 ${hoverClasses[item.color]}`
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <PerspectiveSwitcher />

          {/* Notification bell — opens modal */}
          <button
            onClick={() => {
              setMenuOpen(false)
              openModal()
            }}
            className="relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Meldingen"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-200"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
                {email[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline">
                {email}
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                {role === 'superadmin' && (
                  <Link
                    href="/beheer"
                    className="block px-4 py-2 text-sm text-kern-700 font-medium hover:bg-kern-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Beheer
                  </Link>
                )}
                <Link
                  href="/identity"
                  className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Identiteit
                </Link>
                <Link
                  href="/logout"
                  className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Uitloggen
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
