'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Segmented control voor /overzicht/bezittingen — capsule-style filter
 * tussen alle asset-categorieën. Pattern volgt AI-Categorize-sheet:
 * flex container met rounded border, active-state via bg-paper + shadow.
 *
 * "Alles" → /overzicht/bezittingen (geen filter)
 * "Cash" / "Beleggen" / "Huis" / "Pensioen" → /overzicht/bezittingen/<type>
 *
 * Mobile (375px): flex-wrap zorgt voor 2-rijige layout zonder horizontal
 * scroll. Tap-targets ≥44px via py-2.5.
 */
const SEGMENTS = [
  { label: 'Alles', href: '/overzicht/bezittingen' },
  { label: 'Cash', href: '/overzicht/bezittingen/cash' },
  { label: 'Beleggen', href: '/overzicht/bezittingen/investment' },
  { label: 'Huis', href: '/overzicht/bezittingen/eigen_huis' },
  { label: 'Pensioen', href: '/overzicht/bezittingen/retirement' },
] as const

export function BezittingenSegmented() {
  const pathname = usePathname() ?? '/overzicht/bezittingen'
  return (
    <nav
      aria-label="Filter bezittingen op categorie"
      className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
    >
      {SEGMENTS.map(({ label, href }) => {
        const active =
          href === '/overzicht/bezittingen'
            ? pathname === href
            : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex-1 min-w-[64px] text-center text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors',
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
