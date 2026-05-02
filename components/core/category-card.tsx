'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Circle } from 'lucide-react'
import { iconMap } from '@/components/app/budget-shared'
import { formatCurrency } from '@/lib/format'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { CategoryCardAppStrip } from './category-card-app-strip'
import { CardKpiStrip } from './card-kpi-strip'
import type { KpiPair } from '@/lib/asset-kpi'

// ── Types ────────────────────────────────────────────────────

export interface CategorySegment {
  /** Stabiele key (bv. asset id of subtype) — gebruikt voor React keys. */
  key: string
  /** Bedrag van dit segment in EUR. Negatief wordt bewust gefilterd in de bar. */
  value: number
  /**
   * Hex/oklch kleur voor het segment. Komt uit `ASSET_TYPE_COLORS[type]`
   * of een eigen lichte tint als de gebruiker daarmee meer differentiatie wil.
   * Alleen in de bar gebruikt — niet in tekst (krant-discipline).
   */
  color: string
}

export interface CategoryCardProps {
  /** Lucide icon-naam (matcht `ASSET_TYPE_ICONS` / `DEBT_TYPE_ICONS` strings). */
  iconName: string
  /** Categorie-label, bv. "Cash & Spaargeld". */
  label: string
  /** Totaalbedrag in EUR (assets: positief, schulden: positief getoond). */
  total: number
  /** Aantal items binnen de categorie. */
  count: number
  /**
   * Detailregel onder het bedrag (bv. "4 rekeningen", "1 huis").
   * Optional — als leeg vervalt de meta-regel.
   */
  meta?: string
  /**
   * Segmenten voor de mini stacked-bar. Lege array of undefined = geen bar.
   * Volgorde wordt aangehouden (links-naar-rechts).
   */
  segments?: CategorySegment[]
  /**
   * Samengesteld KPI-paar voor de categorie. Wordt gerenderd direct onder
   * het totaalbedrag, vóór de mini-bar. Lege paar (beide slots `undefined`)
   * vervalt automatisch dankzij `<CardKpiStrip>`.
   */
  categoryKpis?: KpiPair
  /** Doel-URL bij klik — opent de categorie-pagina. */
  href: string
  /** Stagger-index voor sequentiele fade-in (0 = eerste kaart). */
  staggerIndex?: number
  /**
   * Visuele variant — `asset` gebruikt kern-bruin als accent-streep,
   * `debt` gebruikt het rood-rosy palet. Standaard `asset`.
   */
  variant?: 'asset' | 'debt'
  /**
   * Optionele app-strip onderaan de kaart. Wordt alleen gerenderd voor
   * categorieën met een gekoppelde app (cash → Budgetteren, investment →
   * Holdings). Wanneer afwezig blijft de kaart in zijn pure vorm.
   */
  appStrip?: {
    appLabel: string
    moduleActive: boolean
    trackedCount: number
    totalCount: number
    tabHref: string
  }
}

// ── Helpers ──────────────────────────────────────────────────

function resolveIcon(name: string) {
  return iconMap[name] ?? Circle
}

/**
 * Bereken de relatieve breedte (0-100) per segment voor de mini-bar.
 * Negatieve of 0-waardes worden overgeslagen zodat de bar altijd correct
 * van 100% optelt. Wanneer de som 0 is retourneert de helper een lege array
 * en valt de bar weg.
 */
function buildSegmentWidths(segments: CategorySegment[] | undefined) {
  if (!segments || segments.length === 0) return []
  const positive = segments.filter((s) => s.value > 0)
  const total = positive.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return []
  return positive.map((s) => ({
    ...s,
    width: (s.value / total) * 100,
  }))
}

// ── Component ────────────────────────────────────────────────

/**
 * Klikbare categorie-kaart in het Kern-grid. Toont icon + label + totaal +
 * samengestelde KPI's + mini stacked-bar + meta-regel. Klik leidt naar de
 * categorie-pagina (`/core/assets/[type]` of `/core/debts/[type]`).
 *
 * Design-keuzes (UX-skill):
 * - Module-kleur is **kern-bruin** voor de hele kaart (accent-streep links).
 *   Type-kleur (`ASSET_TYPE_COLORS[type]`) komt alleen terug in de mini-bar.
 * - Scherpe hoeken (`rounded-none`), `card-editorial` hover lift.
 * - Mini-bar animeert in via `useInViewAnimation` — niet decoratief.
 * - Touch-target ≥ 96×96 op mobiel via `aspect-square`.
 */
export function CategoryCard({
  iconName,
  label,
  total,
  count,
  meta,
  segments,
  categoryKpis,
  href,
  staggerIndex = 0,
  variant = 'asset',
  appStrip,
}: CategoryCardProps) {
  const Icon = resolveIcon(iconName)
  const segmentBars = useMemo(() => buildSegmentWidths(segments), [segments])
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  const accentClass =
    variant === 'asset' ? 'bg-kern-500' : 'bg-[var(--negative)]'

  // Kaart + optionele app-strip wordt in één buitenste kolom gerenderd.
  // De Link kan geen `<button>` als kind hebben (HTML-validatie), dus
  // de strip leeft buiten de Link maar binnen dezelfde flex-column zodat
  // ze visueel als één geheel ogen.
  return (
    <div
      ref={ref as unknown as React.RefObject<HTMLDivElement>}
      className="card-editorial group flex flex-col animate-fade-up"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <Link
        href={href}
        className="flex flex-1 flex-col text-left no-underline aspect-square sm:aspect-[5/4]"
      >
        {/* Accent-streep — kern-bruin voor assets, rood voor schulden. */}
        <div className={`h-[3px] w-full ${accentClass}`} aria-hidden="true" />

        <div className="flex h-full flex-col gap-2 p-3 sm:p-4">
          {/* Bovenzijde: icon + label */}
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-kern-700" aria-hidden="true" />
            <h3
              className="truncate font-serif text-base font-semibold leading-tight text-[var(--ink)] sm:text-lg"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              {label}
            </h3>
          </div>

          {/* Bedrag — DM Mono, tabular-nums, 22px desktop / 18px mobile */}
          <p className="font-mono text-[18px] font-bold tabular-nums leading-none text-[var(--ink)] sm:text-[22px]">
            {formatCurrency(total)}
          </p>

          {/* Samengestelde KPI-strip — direct onder het totaalbedrag,
              vóór de mini-bar. Alleen aanwezig als minstens één KPI
              berekenbaar is voor deze categorie. */}
          {categoryKpis && (categoryKpis.primary || categoryKpis.secondary) && (
            <CardKpiStrip pair={categoryKpis} variant="category" />
          )}

          {/* Mini stacked-bar */}
          {segmentBars.length > 0 ? (
            <div
              className="mt-auto flex h-2 w-full overflow-hidden bg-[var(--subtle)]"
              role="img"
              aria-label={`Verdeling ${label}`}
            >
              {segmentBars.map((s, idx) => (
                <span
                  key={s.key}
                  className="block h-full"
                  style={{
                    width: hasEntered ? `${s.width}%` : '0%',
                    backgroundColor: s.color,
                    transition: `width 600ms cubic-bezier(.22,1,.36,1) ${idx * 80}ms`,
                  }}
                />
              ))}
            </div>
          ) : (
            // Lege bar reserveert ruimte zodat het grid uniform blijft.
            <div className="mt-auto h-2 w-full bg-[var(--subtle)]/40" aria-hidden="true" />
          )}

          {/* Meta-regel — items-aantal of toelichting */}
          {(meta || count > 0) && (
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {meta ?? `${count} item${count === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
      </Link>

      {appStrip && (
        <CategoryCardAppStrip
          appLabel={appStrip.appLabel}
          moduleActive={appStrip.moduleActive}
          trackedCount={appStrip.trackedCount}
          totalCount={appStrip.totalCount}
          tabHref={appStrip.tabHref}
        />
      )}
    </div>
  )
}
