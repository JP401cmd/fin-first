'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
        <span className="ml-2.5 hidden font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-4)] sm:inline">
          TriFinity
        </span>
      </Link>

      <div className="flex items-center gap-6 md:gap-8">
        <a
          href="#domeinen"
          className="hidden font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] md:block"
        >
          Domeinen
        </a>
        <a
          href="#coach"
          className="hidden font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] md:block"
        >
          AI Coach
        </a>
        <a
          href="#voor-wie"
          className="hidden font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] md:block"
        >
          Voor wie
        </a>

        {user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
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
                  href="/will"
                  className="block px-4 py-2 font-sans text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                  onClick={() => setMenuOpen(false)}
                >
                  De Wil
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
          <Link
            href="/login"
            className="rounded-[var(--r)] border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-2 font-sans text-sm font-medium text-[var(--bg)] transition-all hover:bg-[var(--ink-2)] hover:border-[var(--ink-2)]"
          >
            Start je reis
          </Link>
        )}
      </div>
    </nav>
  )
}
