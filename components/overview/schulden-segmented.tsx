'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Segmented control voor /overzicht/schulden — capsule-style filter
 * over de drie hoofdtype-schulden. Overige types (auto, creditcard,
 * familielening, etc.) blijven via de "Alles"-view bereikbaar.
 *
 * "Alles" → /overzicht/schulden (geen filter)
 * "Hypotheek" → /overzicht/schulden/mortgage
 * "Persoonlijk" → /overzicht/schulden/personal_loan
 * "Studie" → /overzicht/schulden/student_loan
 */
const SEGMENTS = [
  { label: 'Alles', href: '/overzicht/schulden' },
  { label: 'Hypotheek', href: '/overzicht/schulden/mortgage' },
  { label: 'Persoonlijk', href: '/overzicht/schulden/personal_loan' },
  { label: 'Studie', href: '/overzicht/schulden/student_loan' },
] as const

export function SchuldenSegmented() {
  const pathname = usePathname() ?? '/overzicht/schulden'
  return (
    <nav
      aria-label="Filter schulden op categorie"
      className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
    >
      {SEGMENTS.map(({ label, href }) => {
        const active =
          href === '/overzicht/schulden'
            ? pathname === href
            : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex-1 min-w-[64px] min-h-[44px] text-center text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors',
              active
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
