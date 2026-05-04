'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Circle } from 'lucide-react'
import { iconMap } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { HighlightMark } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'
import { CategoryCardAppStrip } from './category-card-app-strip'
import { CardKpiStrip } from './card-kpi-strip'
import type { KpiPair } from '@/lib/asset-kpi'
import { CardTintOverlay } from './card-tint-overlay'

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
  /**
   * Maandwaarden over de afgelopen 6 maanden (oudste → nieuwste). Wordt
   * gerenderd als achtergrond-sparkline ("breuklijn") in de paper-kleur
   * boven op de getinte bezittingen-/schulden-achtergrond. Lege of te korte
   * series tonen alleen de getinte achtergrond zonder lijn.
   */
  sparklineValues?: number[]
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
  sparklineValues,
}: CategoryCardProps) {
  const Icon = resolveIcon(iconName)
  const segmentBars = useMemo(() => buildSegmentWidths(segments), [segments])
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  // Tinted achtergrond + breuklijn worden afgehandeld door
  // `<CardTintOverlay>`. Beide bezitting/schuld-cards en de categoriekaart
  // delen dezelfde overlay-implementatie, geen lokale duplicatie nodig.

  // Module-active accent voor assets (= Kern-500 op /core), negative voor debts.
  // De variant bepaalt ook of de kicker-streep en het bedrag de module-tint
  // krijgen of een rode tint (debts blijven semantisch los van module-kleur).
  const accentColor =
    variant === 'asset' ? 'var(--module-active-500)' : 'var(--negative)'
  const kickerColor =
    variant === 'asset' ? 'var(--module-active-700)' : 'var(--negative)'

  // Kaart + optionele app-strip wordt in één buitenste kolom gerenderd.
  // De Link kan geen `<button>` als kind hebben (HTML-validatie), dus
  // de strip leeft buiten de Link maar binnen dezelfde flex-column zodat
  // ze visueel als één geheel ogen.
  return (
    <div
      ref={ref as unknown as React.RefObject<HTMLDivElement>}
      className="card-editorial group relative flex flex-col animate-fade-up"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <CardTintOverlay
        variant={variant}
        sparklineValues={sparklineValues}
        hasEntered={hasEntered}
      />

      <Link
        href={href}
        className="relative z-10 flex flex-1 flex-col text-left no-underline aspect-square sm:aspect-[5/4]"
      >
        {/* Accent-streep — module-active voor assets, rood voor schulden. */}
        <div
          className="h-[3px] w-full"
          style={{ background: accentColor }}
          aria-hidden="true"
        />

        <div className="flex h-full flex-col gap-2 p-3 sm:p-4">
          {/* Kicker-regel: 28×1px streep + icon + label.
              Streep krijgt module-active-500 (asset) of negative (debt);
              icon volgt dezelfde kleur voor visuele binding. */}
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: accentColor }}
            />
            <span
              aria-hidden
              className="inline-flex shrink-0"
              style={{ color: kickerColor }}
            >
              <Icon className="h-4 w-4 shrink-0" />
            </span>
            <h3
              className="truncate font-serif text-base font-semibold leading-tight text-[var(--ink)] sm:text-lg"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              {label}
            </h3>
          </div>

          {/* Hoofdbedrag — DM Mono, tabular-nums, met halve transparante streep.
              `<HighlightMark>` gebruikt --module-active-200 als achtergrond, dus
              op /core wordt het Kern-200 (lichtbruin); cross-module fallback = Horizon-200. */}
          <p className="leading-none text-[var(--ink)]">
            <HighlightMark>
              <MaskedAmount
                value={total}
                tone="kern"
                className="text-[18px] font-bold leading-none sm:text-[22px]"
              />
            </HighlightMark>
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

          {/* Meta-regel — italic Source Serif (mini-artikel-blueprint)
              vervangt de oude UPPERCASE-meta. Krant-italic past bij artikel-DNA. */}
          {(meta || count > 0) && (
            <p
              className="text-[11px] italic leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {meta ?? `${count} item${count === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
      </Link>

      {appStrip ? (
        <div className="relative z-10">
          <CategoryCardAppStrip
            appLabel={appStrip.appLabel}
            moduleActive={appStrip.moduleActive}
            trackedCount={appStrip.trackedCount}
            totalCount={appStrip.totalCount}
            tabHref={appStrip.tabHref}
          />
        </div>
      ) : (
        // Alignment-placeholder: kaarten zonder app krijgen dezelfde
        // border-top + footer-hoogte als <CategoryCardAppStrip> zodat
        // het grid op één y-as afsluit.
        <div
          aria-hidden="true"
          className="relative z-10 border-t border-[var(--border-ed)] px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] leading-[1.4]"
        >
          &nbsp;
        </div>
      )}
    </div>
  )
}
