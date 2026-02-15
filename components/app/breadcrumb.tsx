'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import type { DomainColor } from '@/lib/navigation'

/**
 * Breadcrumb segment type — each crumb in the trail.
 */
type BreadcrumbSegment = {
  label: string
  href: string
}

/**
 * Known route labels for Dutch breadcrumb display.
 * Maps URL path segments to human-readable Dutch labels.
 */
const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  core: 'De Kern',
  will: 'De Wil',
  horizon: 'De Horizon',
  budgets: 'Budgetten',
  cash: 'Cash',
  import: 'Importeren',
  debts: 'Schulden',
  assets: 'Assets',
  belasting: 'Belasting',
  identity: 'Identiteit',
  beheer: 'Beheer',
  onboarding: 'Onboarding',
}

/**
 * Color styles matching the module theme.
 */
const colorAccent: Record<DomainColor, { text: string; hover: string }> = {
  amber: { text: 'text-amber-700', hover: 'hover:text-amber-600' },
  teal: { text: 'text-teal-700', hover: 'hover:text-teal-600' },
  purple: { text: 'text-purple-700', hover: 'hover:text-purple-600' },
}

/**
 * Breadcrumb component — shows the navigation hierarchy.
 *
 * Automatically derives breadcrumbs from the current URL path.
 * Example: /core/cash/import → De Kern / Cash / Importeren
 *
 * Props:
 * - color: Module color theme (amber, teal, purple)
 * - overrideSegments: Optional custom segments (overrides auto-detection)
 */
export function Breadcrumb({
  color = 'amber',
  overrideSegments,
}: {
  color?: DomainColor
  overrideSegments?: BreadcrumbSegment[]
}) {
  const pathname = usePathname()
  const accent = colorAccent[color]

  const segments: BreadcrumbSegment[] = overrideSegments ?? buildBreadcrumbs(pathname)

  // Don't show breadcrumbs for top-level module pages (e.g., /core, /will)
  // They only have 1 segment which would be redundant with the header
  if (segments.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb navigatie"
      className="flex items-center gap-1.5 text-sm"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1

        return (
          <span key={segment.href} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-300" aria-hidden />
            )}
            {isLast ? (
              <span className={`font-medium ${accent.text}`} aria-current="page">
                {segment.label}
              </span>
            ) : (
              <Link
                href={segment.href}
                className={`text-zinc-500 transition-colors ${accent.hover}`}
              >
                {segment.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/**
 * Builds breadcrumb segments from a URL pathname.
 * /core/cash/import → [{ label: 'De Kern', href: '/core' }, { label: 'Cash', href: '/core/cash' }, { label: 'Importeren', href: '/core/cash/import' }]
 */
function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const parts = pathname.split('/').filter(Boolean)
  const segments: BreadcrumbSegment[] = []

  let href = ''
  for (const part of parts) {
    href += `/${part}`
    const label = segmentLabels[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
    segments.push({ label, href })
  }

  return segments
}
