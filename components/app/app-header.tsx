'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Bell, Newspaper, Users } from 'lucide-react'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { getActiveNavModules, getHomePath } from '@/lib/module-registry'
import { PerspectiveSwitcher } from '@/components/app/perspective-switcher'
import { usePerspective } from '@/components/app/perspective-provider'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import { PrivacyToggle } from '@/components/app/privacy-toggle'
import { LeverCompassDots } from '@/components/app/shell/lever-compass'
import { useLeverScores } from '@/components/app/shell/responsive-shell'
import { GlobalSyncButton } from '@/components/sync/global-sync-button'
import { SyncReportModal } from '@/components/sync/sync-report-modal'
import { ShellFlagToggle } from '@/components/app/shell/shell-flag-toggle'

// Static config for each nav module — label, path, and color token
const navConfig: Record<string, { label: string; href: string; color: string }> = {
  kern:    { label: 'De Kern',     href: '/core',    color: 'amber'  },
  wil:     { label: 'De Wil',      href: '/will',    color: 'teal'   },
  horizon: { label: 'De Horizon',  href: '/horizon', color: 'purple' },
}

const activeClasses: Record<string, string> = {
  amber:  'text-kern-600 border-kern-500 bg-kern-50/40',
  teal:   'text-wil-600 border-wil-500 bg-wil-50/40',
  purple: 'text-horizon-600 border-horizon-500 bg-horizon-50/40',
}

const hoverClasses: Record<string, string> = {
  amber:  'hover:text-kern-600',
  teal:   'hover:text-wil-600',
  purple: 'hover:text-horizon-600',
}

export function AppHeader({ email, role }: { email: string; role?: string }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { activeModules } = useModuleAccess()
  const { perspective, isHousehold, partnerName } = usePerspective()
  const { unreadCount, openModal } = useNotifications()
  const leverScores = useLeverScores()

  // Derive which nav tabs to show from active modules. Memoized: getActiveNavModules
  // builds a Set + array each call, and the result only changes when the set of
  // active modules changes — not on every parent re-render (e.g. notification poll).
  const navItems = useMemo(
    () => getActiveNavModules(activeModules).map(m => navConfig[m]),
    [activeModules],
  )

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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 md:px-6 md:py-3">
        <div className="flex items-center gap-8">
          <Link href={getHomePath(activeModules)} className="font-display text-[28px] font-bold tracking-tight text-[var(--ink)]">
            <span className="lowercase">t</span>ri<span className="lowercase">f</span>inity<span className="text-kern-500">.</span>
          </Link>

          {/* Hide tab bar when only 1 tab — user is already on that module's page */}
          {navItems.length > 1 && (
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                // item may be undefined if navConfig lookup fails (defensive guard)
                if (!item) return null
                const isActive = pathname.startsWith(item.href)
                // Non-kern tabs are added dynamically when the user activates a
                // module, so they receive the reveal animation.
                const isNonKern = item.href !== '/core'
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors border-b-3 rounded-t-sm ${
                      isNonKern ? 'animate-nav-reveal' : ''
                    } ${
                      isActive
                        ? `${activeClasses[item.color]}`
                        : `text-[var(--ink-3)] border-transparent ${hoverClasses[item.color]}`
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-3">
          {/* Vier-hefbomen-kompas — compact indicator */}
          <LeverCompassDots scores={leverScores} />

          <PerspectiveSwitcher />

          {/* Privacy toggle — mask/unmask monetary amounts across the app */}
          <PrivacyToggle />

          {/* News shortcut — navigates to TriFinity Post */}
          <Link
            href="/nieuws"
            className="relative flex h-7 w-7 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] md:h-11 md:w-11"
            aria-label="Nieuws"
            title="Nieuws"
          >
            <Newspaper className="h-3 w-3 md:h-5 md:w-5" aria-hidden="true" />
          </Link>

          {/* Notification bell — opens modal */}
          <button
            onClick={() => {
              setMenuOpen(false)
              openModal()
            }}
            className="relative rounded-[var(--r)] p-1 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] md:p-2"
            aria-label="Meldingen"
          >
            <Bell className="h-3 w-3 md:h-5 md:w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white md:h-4 md:min-w-4 md:text-[10px]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Global sync — desktop only; on mobile it lives in the account dropdown */}
          <div className="hidden md:flex">
            <GlobalSyncButton onOpenReport={() => setReportOpen(true)} />
          </div>

          {/* Profile dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--subtle)] md:h-11 md:w-11"
              aria-label="Account"
              title={email}
            >
              <span className="relative">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[9px] font-medium text-[var(--paper)] md:h-7 md:w-7 md:text-xs">
                  {email[0]?.toUpperCase() ?? '?'}
                </span>
                {isHousehold && perspective !== 'personal' && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-kern-500 ring-2 ring-[var(--paper)]"
                    aria-hidden="true"
                  />
                )}
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)]">
                {/* Header: signed-in identity + perspective context */}
                <div className="px-4 py-3 border-b border-[var(--border-ed)]">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] mb-1">Ingelogd als</div>
                  <div className="text-sm font-medium text-[var(--ink)] truncate">{email}</div>
                  {isHousehold && perspective !== 'personal' && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-kern-50 px-2 py-0.5 text-[10px] font-medium text-kern-700">
                      <Users className="h-3 w-3" /> {perspective === 'partner' ? (partnerName ?? 'Partner') : 'Huishouden'}
                    </span>
                  )}
                </div>
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
                {/* Mobile: sync trigger + sync-rapport side-by-side */}
                <div className="grid grid-cols-2 border-y border-[var(--border-ed)] md:hidden">
                  <div className="flex flex-col items-center justify-center gap-1 py-2 hover:bg-[var(--subtle)]">
                    <GlobalSyncButton
                      onOpenReport={() => {
                        setMenuOpen(false)
                        setReportOpen(true)
                      }}
                    />
                    <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--ink-3)]">
                      Sync nu
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setReportOpen(true)
                    }}
                    className="flex flex-col items-center justify-center gap-1 border-l border-[var(--border-ed)] py-2 text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                  >
                    <span className="flex h-7 w-7 items-center justify-center">
                      <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.06em]">
                      Rapport
                    </span>
                  </button>
                </div>

                {/* Desktop: standard sync-rapport menu item (sync trigger lives in header) */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setReportOpen(true)
                  }}
                  className="hidden w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] md:flex"
                >
                  <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Sync-rapport
                </button>

                {/* Beta-toggle naar de nieuwe shell. Plaatsing onder de sync-
                    opties zodat hij in mobile + desktop dropdown vlak naast
                    "Sync-rapport" / "Sync nu" zit. Klik wisselt + reload. */}
                <ShellFlagToggle
                  variant="dropdown-row"
                  onAfterToggle={() => setMenuOpen(false)}
                />
                {/* News-only users: subtle upgrade link to discover the full app */}
                {activeModules.length === 1 && activeModules[0] === 'nieuws' && (
                  <>
                    <div className="my-1 border-t border-[var(--border-ed)]" />
                    <Link
                      href="/identity/instellingen"
                      className="block px-4 py-2 text-sm text-wil-600 font-medium hover:bg-wil-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      Ontdek meer
                    </Link>
                  </>
                )}
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
      <SyncReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </header>
  )
}
