'use client'

import Link from 'next/link'
import { Circle } from 'lucide-react'
import { iconMap } from '@/components/app/budget-shared'
import type { CategoryAppLink } from '@/lib/category-app-nav'

// ── Public props ─────────────────────────────────────────────

interface CategoryAppNavBarProps {
  /**
   * Geordende set links (asset- en debt-categorieën met een actieve app).
   * Lege array → component rendert niets, zodat de balk-positie automatisch
   * verdwijnt als de gebruiker geen actieve apps heeft.
   */
  links: CategoryAppLink[]
}

// ── Helpers ──────────────────────────────────────────────────

function resolveIcon(name: string) {
  return iconMap[name] ?? Circle
}

function formatItemMeta(count: number): string {
  if (count === 1) return '1 item'
  return `${count} items`
}

// ── Component ────────────────────────────────────────────────

/**
 * Editorial nav-balk bovenaan het Will-dashboard. Toont één klikbare kaart
 * per actieve "kern-app" (cash → Budgetteren, investment → Holdings, etc.).
 *
 * Een kaart leidt naar `/core/{assets|debts}/[type]?tab=<slug>` zodat de
 * gebruiker direct in de bijbehorende app-tab landt — de Kern-categorie blijft
 * één klik weg via de back-link op die pagina.
 *
 * Visuele stijl (UX-skill blueprint):
 * - Mini-artikel-blueprint light variant: type-icon + categorie-label (mono
 *   UPPERCASE 9px) + app-naam (Playfair italic-em is reserved for headlines —
 *   hier de app-naam in font-serif normal voor warmte) + meta-regel italic.
 * - Twee secties: BEZITTINGEN / SCHULDEN met romeinse-streep-headers.
 * - Scherpe hoeken, hover lift, accent-streep links per kaart in module-500
 *   (assets = kern-500 via --module-active, schulden = negative-tinted ink).
 * - Mobile: horizontaal scroll-x met snap, zodat de balk de widget-grid niet
 *   omhoog duwt.
 */
export function CategoryAppNavBar({ links }: CategoryAppNavBarProps) {
  if (links.length === 0) return null

  const assetLinks = links.filter((l) => l.kind === 'asset')
  const debtLinks = links.filter((l) => l.kind === 'debt')

  return (
    <nav
      aria-label="Open apps in je categorieën"
      data-testid="category-app-nav-bar"
      className="mb-3 border-y border-[var(--border-ed)] bg-[var(--paper)]"
    >
      {/* Bovenstreep in Wil-500 om de balk visueel aan de huidige module
          te koppelen — krant-masthead-aesthetiek, één regel hoog. */}
      <div
        aria-hidden
        className="h-px"
        style={{ background: 'var(--module-active-500)' }}
      />

      <div className="flex flex-col gap-2 px-2.5 py-2 sm:px-4 sm:py-2.5">
        {assetLinks.length > 0 && (
          <CategorySection title="Bezittingen apps" variant="asset" links={assetLinks} />
        )}
        {debtLinks.length > 0 && (
          <CategorySection title="Schulden apps" variant="debt" links={debtLinks} />
        )}
      </div>
    </nav>
  )
}

// ── Sub-component: section ───────────────────────────────────

interface CategorySectionProps {
  title: string
  variant: 'asset' | 'debt'
  links: CategoryAppLink[]
}

function CategorySection({ title, variant, links }: CategorySectionProps) {
  return (
    <div>
      {/* Section-label: kicker-met-streepje conform editorial blueprint. */}
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
        <span
          aria-hidden
          className="inline-block h-px w-5 shrink-0"
          style={{
            background:
              variant === 'asset'
                ? 'var(--module-active-500)'
                : 'var(--negative)',
          }}
        />
        <span>{title}</span>
        <span className="ml-auto text-[var(--ink-4)] tracking-[0.12em]">
          {links.length}
        </span>
      </div>

      {/* Mobile: rij van vierkante icon-tegels (geen tekst). Desktop: brede
          kaarten met label en meta. Mobile gebruikt `flex-wrap` zodat de balk
          niet horizontaal scrollt en compact blijft. */}
      <ul
        role="list"
        className="flex flex-wrap gap-1.5 sm:gap-2"
      >
        {links.map((link) => (
          <li
            key={`${link.kind}-${link.type}-${link.appLabel}`}
            className="shrink-0 sm:shrink"
          >
            <CategoryAppCard link={link} variant={variant} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Sub-component: card ──────────────────────────────────────

interface CategoryAppCardProps {
  link: CategoryAppLink
  variant: 'asset' | 'debt'
}

function CategoryAppCard({ link, variant }: CategoryAppCardProps) {
  const Icon = resolveIcon(link.iconName)
  const accentColor =
    variant === 'asset' ? 'var(--module-active-500)' : 'var(--negative)'
  // Toegankelijke naam voor de icon-only weergave op mobile — combineert
  // categorie + app-naam zodat screenreaders niet alleen "Wallet" horen.
  const accessibleLabel = `${link.appLabel} — ${link.categoryLabel}, ${formatItemMeta(link.itemCount)}`

  return (
    <Link
      href={link.href}
      data-testid={`category-app-link-${link.kind}-${link.type}`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      className="group relative flex h-11 w-11 sm:h-auto sm:w-auto sm:min-h-0 sm:min-w-[200px] items-center justify-center sm:justify-start gap-0 sm:gap-2.5 border border-[var(--border-ed)] bg-[var(--paper)] px-0 sm:px-3 py-0 sm:py-1.5 transition-all hover:-translate-y-px hover:shadow-[var(--s1)] hover:border-[var(--ink-4)]"
    >
      {/* Linker accent-streep — 2px in module/negative kleur. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: accentColor }}
      />

      {/* iconMap-types accepteren alleen `className` (geen `style`); we
          kleuren daarom de wrapper-span en laten het icon `currentColor`
          erven via Lucide-defaults. */}
      <span
        aria-hidden
        className="shrink-0"
        style={{
          color:
            variant === 'asset'
              ? 'var(--module-active-700)'
              : 'var(--negative)',
        }}
      >
        <Icon className="h-4 w-4" />
      </span>

      {/* Tekst-kolom — verborgen op mobile (icon-only), zichtbaar vanaf sm. */}
      <div className="hidden sm:block min-w-0 flex-1">
        {/* Kicker: categorie-naam in mono UPPERCASE — geeft scancontext. */}
        <div className="truncate text-[9px] uppercase tracking-[0.12em] font-mono text-[var(--ink-3)]">
          {link.categoryLabel}
        </div>
        {/* App-naam in serif voor krant-warmte. Truncates op smalle viewport. */}
        <div
          className="truncate text-[13px] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {link.appLabel}
        </div>
      </div>

      {/* Meta-regel rechts: aantal items, italic Source Serif. Alleen desktop. */}
      <span className="hidden sm:inline shrink-0 text-[10px] italic text-[var(--ink-4)] group-hover:text-[var(--ink-3)] transition-colors">
        {formatItemMeta(link.itemCount)}
      </span>
    </Link>
  )
}
