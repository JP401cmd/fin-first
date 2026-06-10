'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const NAV_LINKS = [
  { label: 'Functies', href: '/functies' },
  { label: 'Prijzen', href: '/prijzen' },
  { label: 'Veiligheid', href: '/veiligheid' },
]

export function Header() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-300 md:px-12 ${
        scrolled
          ? 'bg-[var(--bg)]/95 backdrop-blur-xl border-b-2 border-[var(--ink)] shadow-[var(--s0)]'
          : ''
      }`}
    >
      {/* Wordmark: tf. */}
      <Link href="/" className="flex items-center">
        <span className="font-display text-[26px] font-bold leading-none text-[var(--ink)]">t</span>
        <span className="font-display text-[26px] font-bold leading-none text-kern-600">f.</span>
        <span className="ml-2.5 hidden font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] sm:inline">
          TriFinity
        </span>
      </Link>

      <div className="flex items-center gap-6 md:gap-8">
        {NAV_LINKS.map((link) => {
          const active = isActive(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`hidden font-sans text-[11px] font-medium uppercase tracking-[0.08em] transition-colors md:block ${
                active
                  ? 'border-b-2 border-[var(--ink)] pb-0.5 text-[var(--ink)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
              }`}
            >
              {link.label}
            </Link>
          )
        })}

        {/* Hamburger — alleen mobiel */}
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] text-[var(--ink-2)] transition-all hover:border-[var(--ink-3)] hover:text-[var(--ink)] hover:shadow-[var(--s0)] md:hidden"
        >
          {mobileOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
        </button>

        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Accountmenu"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 transition-all hover:border-[var(--ink-3)] hover:shadow-[var(--s0)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] font-sans text-xs font-medium text-[var(--bg)]">
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="hidden max-w-[140px] truncate font-sans text-[11px] text-[var(--ink-2)] sm:inline">
                {user.email}
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] py-1 shadow-[var(--s2)]">
                <Link
                  href="/overzicht"
                  className="block px-4 py-2 font-sans text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Overzicht
                </Link>
                <Link
                  href="/logout"
                  className="block px-4 py-2 font-sans text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Uitloggen
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link
              href="/login"
              className="hidden font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] md:block"
            >
              Inloggen
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--r)] border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-2 font-sans text-sm font-medium text-[var(--bg)] transition-all hover:bg-[var(--ink-2)] hover:border-[var(--ink-2)]"
            >
              Begin gratis
            </Link>
          </>
        )}
      </div>

      {/* Mobiele navigatie — volle breedte strook onder de header-balk */}
      {mobileOpen && (
        <div
          id="mobile-nav"
          className="absolute left-0 right-0 top-full border-b-2 border-t border-[var(--ink)] border-t-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)] md:hidden"
        >
          <div className="flex flex-col px-6 py-3">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b border-[var(--border-ed)] py-3 font-sans text-[12px] font-medium uppercase tracking-[0.08em] transition-colors ${
                    active ? 'text-[var(--ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
            {user ? (
              <Link
                href="/overzicht"
                onClick={() => setMobileOpen(false)}
                className="mt-3 rounded-[var(--r)] border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-center font-sans text-sm font-medium text-[var(--bg)] transition-all hover:border-[var(--ink-2)] hover:bg-[var(--ink-2)]"
              >
                Overzicht
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-[var(--border-ed)] py-3 font-sans text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                >
                  Inloggen
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3 rounded-[var(--r)] border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-center font-sans text-sm font-medium text-[var(--bg)] transition-all hover:border-[var(--ink-2)] hover:bg-[var(--ink-2)]"
                >
                  Begin gratis
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
