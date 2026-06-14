'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase, Building2, PiggyBank, Receipt, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { Kicker } from '@/components/editorial'
import { LeverageCard } from '@/components/overview/leverage-card'
import {
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'

/**
 * BelastingBoxCards — drie klikbare box-kaarten op de Belasting-landing
 * (/overzicht/belasting). Spiegelt nu visueel én functioneel 1-op-1 de
 * vier-hefbomen-rij op /overzicht (components/overview/overzicht-hero/
 * hefbomen-nav.tsx → HefbomenNav) door dezelfde gedeelde shell te HERGEBRUIKEN
 * (components/overview/leverage-card.tsx → LeverageCard) — net als
 * ToekomstNavCards op /toekomst:
 *  - afgeronde kaart-shell (rounded-2xl), paper-bg, ink-border;
 *  - getinte icon-chip, label, KPI (€/jr of '—'), status-dot rechtsboven +
 *    gekleurde status-substext;
 *  - chevron-toggle rechtsonder die een drilldown-detailpaneel uitklapt.
 *    De hele kaart blijft een <Link> naar de box-subpagina; alleen de
 *    chevron-<button> toggelt het paneel (navigeert niet).
 *
 * De "Box N"-kicker en de één-zin beschrijving (subtitle) die vroeger op de
 * kaartvoorkant stonden, verhuizen naar de drilldown — exact de kernkaart-
 * anatomie (icon + label + kpi + subText + chevron).
 *
 * Client component met accordeon-state (één kaart open per keer), net als
 * HefbomenNav/ToekomstNavCards. De `cards`-prop is plain serializable data
 * (server → client); de pagina berekent KPI's en statussen server-side en geeft
 * een kant-en-klare array door. Geen nieuwe berekening of data-fetch hier.
 */

// Status-semantiek (kleur + tooltip + tekst-kleur) komt uit de gedeelde
// lib/leverage-status.ts zodat de box-kaarten 1-op-1 matchen met de
// vier-hefbomen-rij en het lever-kompas (één bron van waarheid).
export type BelastingBoxStatus = LeverageStatus

export type BelastingBoxCard = {
  /** '1' | '2' | '3' — bepaalt icoon + "Box N"-kicker. */
  number: string
  /** Korte categorie-label, bv. 'Werk + woning'. */
  label: string
  /** Subroute, bv. '/overzicht/belasting/box1'. */
  href: string
  /** Jaarlijkse belasting in EUR voor de KPI. null of 0 → '—'. */
  tax: number | null
  /** Status-dot-kleur + substext-toon. */
  status: BelastingBoxStatus
  /** Korte status-substext, bv. 'Onbenutte jaarruimte'. null → geen substext. */
  statusText: string | null
  /** Eén-zin beschrijving (nu in de drilldown). */
  subtitle: string
}

const BOX_ICON: Record<string, LucideIcon> = {
  '1': Briefcase,
  '2': Building2,
  '3': PiggyBank,
}

// Per-box coderingskleur voor de icoon-tegel. De hub heeft een NEUTRAAL-ink
// context (--module-active is hier ink), dus zetten we de box-kleuren DIRECT
// via de --color-box{n}-* tokens: lichte tegel-achtergrond (50) + ink-streng
// box-kleur voor het icoon (700). Box 1 amber, Box 2 violet, Box 3 teal.
// Dit is een EIGEN kleursysteem (geen module-identiteit), dus expliciet
// toegestaan om te behouden (CLAUDE.md kleurconventie).
const BOX_TILE: Record<string, { bg: string; fg: string }> = {
  '1': { bg: 'bg-[var(--color-box1-50)]', fg: 'text-[var(--color-box1-700)]' },
  '2': { bg: 'bg-[var(--color-box2-50)]', fg: 'text-[var(--color-box2-700)]' },
  '3': { bg: 'bg-[var(--color-box3-50)]', fg: 'text-[var(--color-box3-700)]' },
}

/** KPI-tekst voor de kaartvoorkant: €X/jr of '—'. */
function taxKpi(tax: number | null): string {
  return tax != null && tax > 0 ? `${formatCurrency(Math.round(tax))}/jr` : '—'
}

export function BelastingBoxCards({ cards }: { cards: BelastingBoxCard[] }) {
  // Eén kaart-expand per keer — open/dicht via chevron. Accordeon-state leeft
  // in de parent, exact zoals HefbomenNav/ToekomstNavCards LeverageCard
  // aanstuurt. We sleutelen op `number` ('1' | '2' | '3').
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // De editorial masthead op de hub-pagina is dé hero; deze rij hoeft alleen
  // nog een rustige kicker. Het jaartotaal is bewust verdwenen (het staat als
  // grote uitkomst in Sectie I, en "excl. Box 2" in de Sectie I-callout).
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2">
      <div className="mb-4">
        <Kicker>De drie boxen</Kicker>
      </div>

      <nav
        aria-label="Drie belastingboxen"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
      >
        {cards.map((card) => {
          const { number, label, href, tax, status, statusText } = card
          const Icon = BOX_ICON[number] ?? Receipt
          // Per-box coderingskleur voor de icoon-chip (val terug op Box 3 bij
          // onbekend). LeverageCard verwacht één gecombineerde text+bg-tint.
          const tile = BOX_TILE[number] ?? BOX_TILE['3']
          const tint = `${tile.bg} ${tile.fg}`
          const expanded = expandedKey === number

          return (
            <LeverageCard
              key={number}
              Icon={Icon}
              tint={tint}
              label={label}
              kpi={taxKpi(tax)}
              status={status}
              subText={statusText}
              href={href}
              expandable
              expanded={expanded}
              onToggleExpand={() => setExpandedKey(expanded ? null : number)}
            >
              <BoxDrilldownCard card={card} />
            </LeverageCard>
          )
        })}
      </nav>
    </section>
  )
}

/**
 * Drilldown-detail-content per box-kaart. Analoog aan HefboomDetailCard op
 * /overzicht en NavDrilldownCard op /toekomst: uppercase "Box N"-label + mono
 * tabular value (het belastingbedrag, of een kale streep wanneer er geen
 * heffing is — bv. Box 2, altijd null), een korte tip (de één-zin beschrijving)
 * en een deep-link naar de box-subpagina. Tekst-/achtergrondkleur volgt de
 * status. De status zelf staat al als substext op de kaartvoorkant, dus de
 * waarde-kolom blijft puur numeriek (geen tekst in het mono tabular-veld).
 * Alle waarden komen uit de bestaande `cards`-data — geen nieuwe berekening.
 */
function BoxDrilldownCard({ card }: { card: BelastingBoxCard }) {
  const { number, href, tax, status, subtitle } = card
  const hasValue = tax != null && tax > 0
  // Geen heffing (Box 2 = altijd null) → kale streep in de numerieke kolom; de
  // status ("Geen aanmerkelijk belang") staat al als substext op de voorkant.
  const value = hasValue ? taxKpi(tax) : '—'

  return (
    <div
      className={`mt-2 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 border-t border-[var(--border-ed)] ${leverageStatusBgClass(status)}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
          Box {number}
        </span>
        <span
          className={`text-[11px] font-mono tabular-nums font-semibold ${leverageStatusTextClass(status)}`}
        >
          {value}
        </span>
      </div>
      <p className={`text-xs leading-snug ${leverageStatusTextClass(status)}`}>{subtitle}</p>
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
      >
        {`Bekijk Box ${number}`}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  )
}
