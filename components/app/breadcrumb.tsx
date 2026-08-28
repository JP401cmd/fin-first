'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import type { DomainColor } from '@/lib/navigation'
import { ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS } from '@/lib/debt-data'

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
  core: 'Overzicht',
  overzicht: 'Overzicht',
  toekomst: 'Toekomst',
  mijn: 'Mijn',
  will: 'Overzicht',
  horizon: 'Toekomst',
  budgets: 'Budgetten',
  budget: 'Budget',
  transacties: 'Transacties',
  'vaste-lasten': 'Vaste lasten',
  forecast: 'Forecast',
  cash: 'Cash',
  cashflow: 'Cashflow',
  import: 'Importeren',
  debts: 'Schulden',
  schulden: 'Schulden',
  assets: 'Vermogen',
  bezittingen: 'Bezittingen',
  belasting: 'Belasting',
  identity: 'Mijn',
  profiel: 'Profiel',
  koppelingen: 'Koppelingen',
  delen: 'Delen',
  voortgang: 'Voortgang',
  instellingen: 'Instellingen',
  jaaroverzicht: 'Jaaroverzicht',
  beheer: 'Beheer',
  onboarding: 'Onboarding',
}

/**
 * Color styles matching the module theme.
 */
const colorAccent: Record<DomainColor, { text: string; hover: string }> = {
  amber: { text: 'text-kern-700', hover: 'hover:text-kern-600' },
  teal: { text: 'text-wil-700', hover: 'hover:text-wil-600' },
  purple: { text: 'text-horizon-700', hover: 'hover:text-horizon-600' },
}

/**
 * Breadcrumb component — shows the navigation hierarchy.
 *
 * Automatically derives breadcrumbs from the current URL path.
 * Example: /core/cash/import → Overzicht / Cash / Importeren
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

  // Don't show breadcrumbs for detail pages with dynamic segments (UUIDs)
  // These pages have their own back navigation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (pathname.split('/').some((s) => UUID_RE.test(s))) return null

  return (
    <nav
      aria-label="Breadcrumb navigatie"
      className="flex items-center gap-1.5 pt-4 text-sm"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1

        return (
          <span key={segment.href} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-4)]" aria-hidden />
            )}
            {isLast ? (
              <span className={`font-medium ${accent.text}`} aria-current="page">
                {segment.label}
              </span>
            ) : (
              <Link
                href={segment.href}
                className={`text-[var(--ink-3)] transition-colors ${accent.hover}`}
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
 * Canonieke breadcrumb-trails voor legacy-routes waar de URL-afgeleide trail
 * naar verouderde `/core/*`-links zou wijzen of een tussenlaag mist. De canonieke
 * nav is Overzicht/Toekomst/Mijn; `/core/**` zijn legacy backing-routes.
 */
const CANONICAL_TRAILS: Record<string, BreadcrumbSegment[]> = {
  '/core/cash/import': [
    { label: 'Overzicht', href: '/overzicht' },
    { label: 'Bezittingen', href: '/overzicht/bezittingen' },
    // Zelfde label als de automatisch gebouwde crumb voor dit pad (L3):
    // ASSET_TYPE_LABELS.cash — anders heet dezelfde href hier iets anders.
    { label: ASSET_TYPE_LABELS.cash, href: '/overzicht/bezittingen/cash' },
    { label: 'Importeren', href: '/core/cash/import' },
  ],
}

/** Legacy root-segmenten → canonieke href voor de eerste crumb. */
const CANONICAL_ROOT_HREF: Record<string, string> = {
  '/core': '/overzicht',
  '/will': '/overzicht',
  '/horizon': '/toekomst',
  '/identity': '/mijn',
}

/**
 * CATEGORIE-SEGMENT → CANONIEKE LABELTABEL (bevinding L3).
 *
 * Op `/core/assets/[type]`, `/core/debts/[type]` en hun `/overzicht/*`-tweelingen
 * is het laatste URL-segment de RUWE database-enum (`asset.asset_type` /
 * `debt.debt_type`) — er bestaat geen aparte, al vertaalde slug. Zonder deze
 * lookup viel de breadcrumb terug op de generieke capitalize en lekte de
 * technische sleutel naar het scherm: "Mortgage", "Vehicle", "Personal_loan".
 *
 * De vertaling bestond al en wordt op dezelfde routes al gebruikt voor de
 * paginatitel (`NavStackMeta title={DEBT_TYPE_LABELS[type]}`). Hier wordt
 * DIEZELFDE bron geraadpleegd — geen tweede labeltabel, anders driften titel en
 * kruimelpad uit elkaar zodra er een type bijkomt.
 *
 * Gesleuteld op het OUDER-segment, niet op het typewoord zelf: `other` bestaat in
 * beide enums ("Overig" in allebei, maar dat is toeval, geen garantie).
 */
const TYPE_LABELS_BY_PARENT: Record<string, Record<string, string>> = {
  assets: ASSET_TYPE_LABELS,
  bezittingen: ASSET_TYPE_LABELS,
  debts: DEBT_TYPE_LABELS,
  schulden: DEBT_TYPE_LABELS,
}

/**
 * Val-terug voor een segment zonder bekend label: eerste letter kapitaal én
 * underscores als spatie. Zónder die vervanging lekte een multi-word enum als
 * `personal_loan` letterlijk door als "Personal_loan" (zelfde bevinding L3).
 */
function humanizeSegment(part: string): string {
  const spaced = part.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Builds breadcrumb segments from a URL pathname.
 * /core/cash/import → [Overzicht /overzicht, Bezittingen …, Cash …, Importeren …]
 *
 * Geëxporteerd voor de regressietest die élke asset-/debt-typesleutel langsloopt.
 */
export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const trail = CANONICAL_TRAILS[pathname]
  if (trail) return trail

  const parts = pathname.split('/').filter(Boolean)
  const segments: BreadcrumbSegment[] = []

  let href = ''
  parts.forEach((part, i) => {
    href += `/${part}`
    // Categorie-typen worden op hun OUDER-segment herkend en gaan vóór de
    // generieke `segmentLabels`. Dat is bewust: `cash` staat in beide tabellen,
    // en in de type-positie hoort de crumb hetzelfde te zeggen als de paginatitel
    // ("Cash / Betaalrekeningen"), niet het generieke route-woord.
    const typeLabel = i > 0 ? TYPE_LABELS_BY_PARENT[parts[i - 1]!]?.[part] : undefined
    const label = typeLabel ?? segmentLabels[part] ?? humanizeSegment(part)
    segments.push({ label, href: CANONICAL_ROOT_HREF[href] ?? href })
  })

  return segments
}
