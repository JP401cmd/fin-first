'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Lock, Sparkles, LayoutGrid } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { PerspectiveSwitcher } from '@/components/app/perspective-switcher'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { useDashboardType } from '@/components/app/dashboard-type-provider'

const staticNavItems = [
  { label: 'De Kern', href: '/core', color: 'amber', requiresActivation: false },
  { label: 'De Wil', href: '/will', color: 'teal', requiresActivation: true },
  { label: 'De Horizon', href: '/horizon', color: 'purple', requiresActivation: true },
] as const

const activeClasses: Record<string, string> = {
  zinc: 'text-[var(--ink)] border-[var(--ink)]',
  amber: 'text-kern-600 border-kern-500',
  teal: 'text-wil-600 border-wil-500',
  purple: 'text-horizon-600 border-horizon-500',
}

const hoverClasses: Record<string, string> = {
  zinc: 'hover:text-[var(--ink)]',
  amber: 'hover:text-kern-600',
  teal: 'hover:text-wil-600',
  purple: 'hover:text-horizon-600',
}

export function AppHeader({ email, role }: { email: string; role?: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { needsActivation } = useFeatureAccess()
  const { unreadCount, openModal } = useNotifications()
  const { dashboardType } = useDashboardType()

  const dashboardHref = dashboardType === 'briefing' ? '/daishboard' : '/dashboard'
  const altDashboardHref = dashboardType === 'briefing' ? '/dashboard' : '/daishboard'
  const isDashboard = pathname === '/dashboard' || pathname === '/daishboard'

  const navItems = [
    { label: 'Dashboard', href: dashboardHref, color: 'zinc' as const, requiresActivation: false },
    ...staticNavItems,
  ]

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 border-b-2 border-[var(--ink)] bg-[var(--paper)] shadow-[var(--s0)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/will" className="font-display text-[28px] font-bold tracking-tight text-[var(--ink)]">
            <span className="lowercase">t</span>ri<span className="lowercase">f</span>inity<span className="text-kern-500">.</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const isItemDashboard = item.label === 'Dashboard'
              const isActive = isItemDashboard ? isDashboard : pathname.startsWith(item.href)
              const isLocked = item.requiresActivation && needsActivation
              return (
                <div key={item.label} className="flex items-center">
                  <Link
                    href={item.href}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border-b-3 ${
                      isActive
                        ? `${activeClasses[item.color]}`
                        : isLocked
                          ? 'text-[var(--ink-4)] border-transparent hover:text-[var(--ink-3)]'
                          : `text-[var(--ink-3)] border-transparent ${hoverClasses[item.color]}`
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {item.label}
                      {isLocked && <Lock className="h-2.5 w-2.5 opacity-50" />}
                    </span>
                  </Link>
                  {isItemDashboard && isDashboard && (
                    <Link
                      href={altDashboardHref}
                      className="ml-0.5 rounded-md p-1.5 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                      title={pathname === '/daishboard' ? 'Widgets dashboard' : 'AI Briefing'}
                    >
                      {pathname === '/daishboard' ? (
                        <LayoutGrid className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </Link>
                  )}
                </div>
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
            className="relative rounded-[var(--r)] p-2 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
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
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full bg-[var(--subtle)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--border-ed)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-medium text-[var(--paper)]">
                {email[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline">
                {email}
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)]">
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
                  className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Identiteit
                </Link>
                <Link
                  href="/rapportages"
                  className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Rapportages
                </Link>
                <div className="my-1 border-t border-[var(--border-ed)]" />
                <Link
                  href="/logout"
                  className="block px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
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
