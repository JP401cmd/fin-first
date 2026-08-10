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
  showSubRow = true,
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
   * hefboom, of het venster-label "in augustus tot nu toe" op de cashflow-
   * landingskaart (CF-3).
   *
   * De shell RENDERT hem in beide varianten (ook in `compact`) en beslist er
   * bewust niet over: of een regel past hangt af van wat de kaart verder toont,
   * en dat weet alleen de call-site. Geen gating-prop dus.
   *
   * Reikwijdte in de praktijk: `hefbomen-nav` vult 'm wél maar zet nooit
   * `compact` (volledige tak); `toekomst-nav-cards` laat 'm leeg; en
   * `cashflow-landing-cards` geeft het CF-3-venster sinds de herziening van
   * 10 aug 2026 alleen door in Volledig — in Eenvoudig toont die kaart geen KPI
   * meer (CF-1), dus is er geen cijfer waarvan het venster geduid moet worden.
   * De compacte tak hieronder is daarmee op dit moment ongebruikt maar blijft
   * staan: een compacte kaart die wél een cijfer draagt, mag zijn grondslag
   * kwijt kunnen.
   */
  subAmount?: React.ReactNode
  href: string
  tooltip?: string
  /**
   * Compacte variant: icon-chip + label (+ `subAmount` als die er is), heel de
   * kaart een link — géén KPI, substext, status-dot of chevron. Gebruikt door de
   * /toekomst-navkaarten en de cashflow-landingskaarten in de Eenvoudig-
   * weergave; /overzicht geeft dit niet mee → byte-identiek default-gedrag.
   */
  compact?: boolean
  /**
   * Rendert de substext-rij onder de KPI. Default true — óók zonder `subText`,
   * want de lege `min-h-[16px]`-placeholder houdt tegels met en zonder status-
   * regel in dezelfde rij even hoog.
   *
   * Zet 'm op false wanneer GEEN ENKELE tegel in de rij een substext toont
   * (eenvoudige weergave, OVZ-2): dan is de placeholder pure lege ruimte en
   * blijven de tegels onderling nog steeds gelijk. Nooit per tegel mengen —
   * dat is precies waar de placeholder voor bestaat.
   */
  showSubRow?: boolean
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
          {/* `min-w-0` op de tekstkolom houdt `truncate` werkend binnen de flex-rij. */}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm sm:text-base font-semibold text-[var(--ink)]">
              {label}
            </span>
            {/* Zelfde typografie als de subAmount-regel in de volledige tak, zodat
                het venster-label in beide weergaven hetzelfde gewicht heeft. */}
            {subAmount ? (
              <span className="block truncate text-[11px] leading-tight text-[var(--ink-3)]">
                {subAmount}
              </span>
            ) : null}
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
        {showSubRow && (
          <div className="mt-1 flex items-end justify-between gap-2 min-h-[16px]">
            {subText ? (
              <span className={`text-[11px] font-medium ${leverageStatusTextClass(status)}`}>
                {subText}
              </span>
            ) : (
              <span />
            )}
          </div>
        )}
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
