/**
 * SANDBOX — sidebar-prototype op /beheer/sidebar-prototype.
 * Tijdelijke preview voor de evaluatie van een persistente verticale shell-navigatie.
 * VERWIJDERBAAR: deze hele directory + components/app/beheer/sidebar-prototype/
 * mag in een keer verwijderd worden zodra het ontwerp is goedgekeurd of
 * verworpen. Geen externe verwijzingen vanuit de echte app.
 */
'use client'

import {
  Wallet,
  Zap,
  Compass,
  Inbox,
  Newspaper,
  BarChart3,
  Search,
  ChevronDown,
  User,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export type SidebarVariant = 'A' | 'B' | 'C'

interface SidebarShellProps {
  variant: SidebarVariant
  collapsed?: boolean
}

interface ModuleEntry {
  /** Module key — drives module-active CSS-vars on the row. */
  key: 'kern' | 'wil' | 'horizon'
  /** Plain label (variant B). */
  label: string
  /** Italic emphasis word for variants A and C (Playfair italic-em). */
  italicEm: string
  /** Plain prefix that comes before the italicEm word. */
  prefix: string
  Icon: LucideIcon
  /** Right-aligned mono metric (mock). */
  metric: string
  /** Inline sub-tags, separated by middle-dot. Only rendered on active module. */
  subTags: string[]
}

const MODULES: ModuleEntry[] = [
  {
    key: 'kern',
    label: 'De Kern',
    italicEm: 'Kern',
    prefix: 'De ',
    Icon: Wallet,
    metric: '€ 142k',
    subTags: ['Bezittingen', 'Schulden', 'Belasting', 'Check-in'],
  },
  {
    key: 'wil',
    label: 'De Wil',
    italicEm: 'Wil',
    prefix: 'De ',
    Icon: Zap,
    metric: '· 4 acties',
    subTags: [],
  },
  {
    key: 'horizon',
    label: 'De Horizon',
    italicEm: 'Horizon',
    prefix: 'De ',
    Icon: Compass,
    metric: '62 jr',
    subTags: [],
  },
]

interface OverigeEntry {
  label: string
  Icon: LucideIcon
  badge?: string
}

const OVERIGE: OverigeEntry[] = [
  { label: 'Berichten', Icon: Inbox, badge: '· 2' },
  { label: 'Nieuws', Icon: Newspaper },
  { label: 'Rapportages', Icon: BarChart3 },
]

interface FooterLink {
  label: string
  Icon: LucideIcon
}

const FOOTER_LINKS: FooterLink[] = [
  { label: 'Identiteit', Icon: User },
  { label: 'Instellingen', Icon: Settings },
  { label: 'Uitloggen', Icon: LogOut },
]

/**
 * Map a module-key to inline CSS-vars so child elements can reference
 * `var(--module-active-500)` etc. and pick up the right palette.
 *
 * Why inline-style: the sidebar lives on a cross-module beheer-page that
 * has no module-active layout above it. We can't hardcode `text-kern-700`
 * — those classes don't exist as Tailwind-utilities, only as CSS-vars.
 */
function moduleVars(module: 'kern' | 'wil' | 'horizon'): React.CSSProperties {
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  return Object.fromEntries(
    shades.map((s) => [`--module-active-${s}`, `var(--color-${module}-${s})`])
  ) as React.CSSProperties
}

/**
 * The Kern row is rendered as the active module so the highlight + accent are
 * directly visible in the preview. Static for the prototype.
 */
const ACTIVE_MODULE_KEY: 'kern' | 'wil' | 'horizon' = 'kern'

export function SidebarShell({ variant, collapsed = false }: SidebarShellProps) {
  const width = collapsed ? 56 : 264
  return (
    <aside
      className="flex flex-col border-r border-[var(--border-ed)] bg-[var(--paper)]"
      style={{ width, minHeight: 600 }}
      aria-label="Prototype sidebar navigatie"
    >
      <BrandingRow variant={variant} collapsed={collapsed} />

      <ModulesSection variant={variant} collapsed={collapsed} />

      {/* Visual separation between primary and secondary nav */}
      <div className="border-t border-[var(--border-ed)]" aria-hidden />

      <OverigeSection variant={variant} collapsed={collapsed} />

      {/* Push footer to the bottom */}
      <div className="flex-1" aria-hidden />

      <FooterSection collapsed={collapsed} />
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────
// Branding-rij
// ─────────────────────────────────────────────────────────────────

function BrandingRow({
  variant,
  collapsed,
}: {
  variant: SidebarVariant
  collapsed: boolean
}) {
  // Kern accent on the period to match app-header.tsx mark.
  const mark = (
    <span
      className="font-black italic tracking-[-0.02em] leading-none"
      style={{ fontFamily: PLAYFAIR, fontSize: collapsed ? 22 : 26, color: 'var(--ink)' }}
    >
      tf
      <span style={{ color: 'var(--color-horizon-500)' }}>.</span>
    </span>
  )

  if (collapsed) {
    return (
      <div className="flex items-center justify-center h-14 border-b border-[var(--border-ed)]">
        {mark}
      </div>
    )
  }

  // Variant A: mark + italic deck "Editie · vandaag"
  // Variant B: mark + ⌘K search (no deck)
  // Variant C: mark + ⌘K search (no deck)
  if (variant === 'A') {
    return (
      <div className="flex flex-col gap-1 px-4 py-4 border-b border-[var(--border-ed)]">
        {mark}
        <div
          className="italic text-[12px] leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Editie · vandaag
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[var(--border-ed)]">
      {mark}
      <button
        type="button"
        // Stop here — preview only, no real ⌘K wiring.
        className="inline-flex items-center gap-1.5 px-2 h-8 border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
        aria-label="Zoeken"
      >
        <Search className="w-3.5 h-3.5" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em]">⌘K</span>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modules-sectie (PRIMAIR)
// ─────────────────────────────────────────────────────────────────

function ModulesSection({
  variant,
  collapsed,
}: {
  variant: SidebarVariant
  collapsed: boolean
}) {
  return (
    <div className="flex flex-col gap-1 px-2 py-3">
      {!collapsed && <ModulesSectionLabel variant={variant} />}
      <div className="flex flex-col gap-0.5">
        {MODULES.map((mod) => (
          <ModuleRow
            key={mod.key}
            module={mod}
            variant={variant}
            collapsed={collapsed}
            isActive={mod.key === ACTIVE_MODULE_KEY}
          />
        ))}
      </div>
    </div>
  )
}

function ModulesSectionLabel({ variant }: { variant: SidebarVariant }) {
  // Variant A: kicker met streepje + UPPERCASE "DRIE MODULES"
  // Variant B: subtle "Modules" Inter, no streepje
  // Variant C: kicker met streepje + UPPERCASE "DRIE MODULES" (zelfde als A)
  if (variant === 'B') {
    return (
      <div className="px-2 mb-2">
        <span className="text-[10px] font-medium tracking-[0.06em] uppercase text-[var(--ink-3)]">
          Modules
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2.5 px-2 mb-2">
      <span
        aria-hidden
        className="inline-block w-7 h-px"
        style={{ background: 'var(--color-horizon-500)' }}
      />
      <span className="text-[10px] font-mono uppercase tracking-[0.20em] text-[var(--ink-2)]">
        Drie modules
      </span>
    </div>
  )
}

function ModuleRow({
  module,
  variant,
  collapsed,
  isActive,
}: {
  module: ModuleEntry
  variant: SidebarVariant
  collapsed: boolean
  isActive: boolean
}) {
  const Icon = module.Icon
  const styleVars = moduleVars(module.key)

  // Active: 3px module-accent left, bg-tint, text-color module-700.
  // Variant A also adds a highlight-marker behind the label.
  const baseRowClass = isActive
    ? 'relative bg-[color-mix(in_oklch,var(--module-active-100)_45%,transparent)] text-[var(--module-active-700)]'
    : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink)]'

  if (collapsed) {
    // Icon-only square 56×56 with module-accent left when active.
    return (
      <div className="relative" style={isActive ? styleVars : undefined}>
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px]"
            style={{ background: 'var(--module-active-500)' }}
          />
        )}
        <button
          type="button"
          aria-label={module.label}
          title={module.label}
          className={`flex items-center justify-center w-full h-12 transition-colors duration-150 ${baseRowClass}`}
          style={isActive ? styleVars : undefined}
        >
          <Icon className="w-5 h-5" aria-hidden />
        </button>
      </div>
    )
  }

  // Expanded — 64-80px tall row with icon + label + metric
  // Variant A: label = Playfair italic-em, with highlight-marker on active label
  // Variant B: label = Inter 13px medium, no italic
  // Variant C: label = Playfair italic-em, no highlight-marker
  const renderLabel = () => {
    if (variant === 'B') {
      return (
        <span className="text-[13px] font-medium leading-snug">
          {module.label}
        </span>
      )
    }

    // A and C use Playfair italic-em
    const labelNode = (
      <span
        className="text-[16px] leading-tight font-bold"
        style={{ fontFamily: PLAYFAIR }}
      >
        {module.prefix}
        <em
          className="font-normal italic"
          style={isActive ? { color: 'var(--module-active-700)' } : undefined}
        >
          {module.italicEm}
        </em>
      </span>
    )

    // Variant A: highlight-marker behind the label on active row
    if (variant === 'A' && isActive) {
      return (
        <span
          className="inline-block px-1"
          style={{
            backgroundImage:
              'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
          }}
        >
          {labelNode}
        </span>
      )
    }
    return labelNode
  }

  // Inline sub-tags (only on active module).
  // Variant A/C: italic Source Serif, separator middle-dot.
  // Variant B: compact mono chip-strip.
  const renderSubTags = () => {
    if (!isActive || module.subTags.length === 0) return null
    if (variant === 'B') {
      return (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {module.subTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 h-[18px] font-mono text-[10px] uppercase tracking-[0.08em] border border-[var(--border-ed)] text-[var(--ink-3)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )
    }
    return (
      <div
        className="italic text-[12px] leading-snug text-[var(--ink-3)] mt-1"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        {module.subTags.map((tag, idx) => (
          <span key={tag}>
            {tag}
            {idx < module.subTags.length - 1 && (
              <span aria-hidden className="mx-1.5 text-[var(--ink-4)]">·</span>
            )}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      className="relative"
      style={isActive ? styleVars : undefined}
    >
      {/* Module-accent — 3px vertical bar on active row */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px]"
          style={{ background: 'var(--module-active-500)' }}
        />
      )}
      <button
        type="button"
        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-150 min-h-[64px] ${baseRowClass}`}
      >
        <Icon
          className="w-[18px] h-[18px] mt-0.5 shrink-0"
          style={isActive ? { color: 'var(--module-active-700)' } : undefined}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          {renderLabel()}
          {renderSubTags()}
        </div>
        <span
          className="font-mono tabular-nums text-[11px] tracking-[0.02em] mt-0.5 shrink-0"
          style={isActive ? { color: 'var(--module-active-700)' } : { color: 'var(--ink-3)' }}
        >
          {module.metric}
        </span>
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Overige-sectie (SECUNDAIR — gedegradeerd)
// ─────────────────────────────────────────────────────────────────

function OverigeSection({
  variant,
  collapsed,
}: {
  variant: SidebarVariant
  collapsed: boolean
}) {
  return (
    <div className="flex flex-col px-2 py-3">
      {!collapsed && <OverigeSectionLabel variant={variant} />}
      <div className="flex flex-col">
        {OVERIGE.map((entry) => (
          <OverigeRow key={entry.label} entry={entry} collapsed={collapsed} />
        ))}
      </div>
    </div>
  )
}

function OverigeSectionLabel({ variant }: { variant: SidebarVariant }) {
  // Variant A/C: lowercase italic, geen streepje, ink-3
  // Variant B: UPPERCASE klein
  if (variant === 'B') {
    return (
      <div className="px-2 mb-1.5">
        <span className="text-[10px] font-medium tracking-[0.08em] uppercase text-[var(--ink-3)]">
          Overige
        </span>
      </div>
    )
  }
  return (
    <div className="px-2 mb-1.5">
      <span
        className="italic text-[12px] text-[var(--ink-3)] lowercase"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        overige
      </span>
    </div>
  )
}

function OverigeRow({
  entry,
  collapsed,
}: {
  entry: OverigeEntry
  collapsed: boolean
}) {
  const Icon = entry.Icon
  if (collapsed) {
    return (
      <button
        type="button"
        aria-label={entry.label}
        title={entry.label}
        className="relative flex items-center justify-center h-9 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
      >
        <Icon className="w-4 h-4" aria-hidden />
        {entry.badge && (
          <span
            className="absolute top-1 right-2 font-mono text-[9px] text-[var(--ink-3)]"
            aria-hidden
          >
            {entry.badge.replace('· ', '')}
          </span>
        )}
      </button>
    )
  }
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-2 px-3 h-8 text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-[14px] h-[14px] shrink-0" aria-hidden />
        <span className="text-[12px] truncate">{entry.label}</span>
      </span>
      {entry.badge && (
        <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">
          {entry.badge}
        </span>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Footer-sectie (TERTIAIR)
// ─────────────────────────────────────────────────────────────────

function FooterSection({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-t border-[var(--border-ed)] py-2">
        <button
          type="button"
          aria-label="Account"
          title="Jan Pieter"
          className="flex items-center justify-center h-10 w-10 hover:bg-[var(--subtle)]/50 transition-colors duration-150"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-medium text-[var(--paper)]">
            JP
          </span>
        </button>
        {FOOTER_LINKS.map((link) => {
          const Icon = link.Icon
          return (
            <button
              key={link.label}
              type="button"
              aria-label={link.label}
              title={link.label}
              className="flex items-center justify-center h-9 w-full text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150"
            >
              <Icon className="w-[14px] h-[14px]" aria-hidden />
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="border-t border-[var(--border-ed)] px-2 py-3">
      {/* Profile pill — clickable mock */}
      <button
        type="button"
        className="flex items-center gap-2.5 w-full px-2 h-10 hover:bg-[var(--subtle)]/50 transition-colors duration-150"
        aria-label="Account-menu"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-medium text-[var(--paper)]">
          JP
        </span>
        <span className="flex-1 text-left text-[13px] font-medium text-[var(--ink-2)] truncate">
          Jan Pieter
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-3)] shrink-0" aria-hidden />
      </button>
      {/* Tertiary mono links — UPPERCASE 10px tracking 0.15em */}
      <div className="flex flex-col mt-1">
        {FOOTER_LINKS.map((link) => (
          <button
            key={link.label}
            type="button"
            className="flex items-center px-2 h-8 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)] hover:bg-[var(--subtle)]/50 hover:text-[var(--ink-2)] transition-colors duration-150 text-left"
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  )
}
