'use client'

/**
 * LeverageCard — gedeelde hefboom-kaart-shell. Geëxtraheerd uit HefbomenNav
 * (components/overview/overzicht-hero/hefbomen-nav.tsx) zodat de vier-hefbomen-
 * rij op /overzicht én de cashflow-landingskaarten op /overzicht/cashflow
 * exact hetzelfde uiterlijk delen en niet uit-sync raken.
 *
 * Anatomie (identiek aan de hefboomkaarten):
 *  - Kaart-shell met scherpe-genoeg rounded-2xl, paper-bg, ink-border.
 *  - Heel-kaart `<Link>` (navigatie) + een sibling absolute chevron-`<button>`
 *    (uitklap-toggle) — siblings, niet genest, zodat chevron-klik niet
 *    navigeert.
 *  - Status-dot rechtsboven + gekleurde status-substext onder de KPI.
 *  - Getinte icon-chip als accent (géén linker accent-streep).
 *  - Uitklap-paneel (children) verschijnt onderaan wanneer `expanded`.
 *
 * Accordeon-state (één kaart open per keer) leeft in de parent, net als bij
 * HefbomenNav. De ENIGE animatie is de chevron-rotatie (200ms) — conform de
 * template, geen height/opacity-transitie op het paneel zelf.
 */

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'

export function LeverageCard({
  Icon,
  tint,
  label,
  kpi,
  status,
  subText,
  subAmount,
  href,
  tooltip,
  compact = false,
  expandable = false,
  expanded = false,
  onToggleExpand,
  children,
}: {
  Icon: LucideIcon
  /** Tailwind text+bg-tint voor de icon-chip, bv. 'text-sky-700 bg-sky-50'. */
  tint: string
  label: string
  /** Hoofdcijfer (al geformatteerd). Niet getoond wanneer leeg/null. */
  kpi?: string | null
  status: LeverageStatus
  /** Gekleurde substext-regel onder de KPI. */
  subText?: string | null
  /**
   * Optionele subtiele extra regel direct onder de KPI (gedempt, `--ink-3`) —
   * bv. de "excl. eigen woning · €X"-grondslag op de bezittingen-/schulden-
   * hefboom. Alleen de hefbomen-rij op /overzicht vult dit; de cashflow-
   * landingskaarten geven het niet mee → byte-identiek.
   */
  subAmount?: React.ReactNode
  href: string
  tooltip?: string
  /**
   * Compacte 1-regel-variant: alleen icon-chip + label, heel de kaart een link —
   * géén KPI, substext, status-dot of chevron. Gebruikt door de /toekomst-
   * navkaarten in de Eenvoudig-weergave; /overzicht geeft dit niet mee →
   * byte-identiek default-gedrag.
   */
  compact?: boolean
  /** Toont de chevron-toggle wanneer true. */
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  /** Uitklap-content — alleen gerenderd wanneer `expanded`. */
  children?: React.ReactNode
}) {
  if (compact) {
    return (
      <div className="group relative rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-all hover:border-[var(--ink-3)] hover:shadow-sm">
        <Link href={href} title={tooltip} className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${tint}`}
          >
            <Icon className="w-4 h-4" />
          </div>
          <span className="truncate text-sm sm:text-base font-semibold text-[var(--ink)]">
            {label}
          </span>
        </Link>
      </div>
    )
  }

  return (
    <div
      className={[
        'group relative flex flex-col rounded-2xl border bg-[var(--paper)] p-3 sm:p-4 transition-all',
        expanded
          ? 'border-[var(--ink-3)] shadow-sm row-span-2 sm:row-span-1'
          : 'border-[var(--border-ed)] hover:border-[var(--ink-3)] hover:shadow-sm',
      ].join(' ')}
    >
      <Link href={href} title={tooltip} className="flex flex-col">
        <span
          className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${LEVERAGE_STATUS_DOT[status]}`}
          aria-hidden="true"
          title={LEVERAGE_STATUS_LABEL[status]}
        />
        <div
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center ${tint}`}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="mt-2 text-sm sm:text-base font-semibold text-[var(--ink)]">
          {label}
        </div>
        {kpi && (
          <div className="mt-0.5 text-base sm:text-lg font-serif font-semibold text-[var(--ink)] tabular-nums">
            {kpi}
          </div>
        )}
        {subAmount && (
          <div className="mt-0.5 text-[11px] leading-tight text-[var(--ink-3)] tabular-nums">
            {subAmount}
          </div>
        )}
        {/* Subtext + chevron op één rij — chevron rechts naast de
            status-substext zodat de kaart niet hoger wordt en de primaire
            link (heel kaartje) intact blijft. */}
        <div className="mt-1 flex items-end justify-between gap-2 min-h-[16px]">
          {subText ? (
            <span className={`text-[11px] font-medium ${leverageStatusTextClass(status)}`}>
              {subText}
            </span>
          ) : (
            <span />
          )}
        </div>
      </Link>

      {/* Chevron-toggle — kleine icon-only knop in rechter-onderhoek,
          absolute-gepositioneerd binnen de kaart. Kaart-klik navigeert;
          alleen chevron-klik toggelt de drill-down hieronder. */}
      {expandable && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? `Verberg detail ${label}` : `Toon detail ${label}`}
          className="absolute right-2 bottom-2 sm:right-2.5 sm:bottom-2.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}

      {expanded && children}
    </div>
  )
}
