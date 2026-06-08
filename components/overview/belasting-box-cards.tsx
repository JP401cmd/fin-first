import Link from 'next/link'
import { ArrowRight, Briefcase, Building2, PiggyBank, Receipt, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { Kicker } from '@/components/editorial'
import {
  LEVERAGE_STATUS_DOT,
  LEVERAGE_STATUS_LABEL,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'

/**
 * BelastingBoxCards — drie klikbare box-kaarten op de Belasting-landing
 * (/overzicht/belasting). Spiegelt visueel de vier-hefbomen-rij op
 * /overzicht (zie components/overview/overzicht-hero/hefbomen-nav.tsx):
 * per kaart een icoon-tegel, "Box N"-kicker, label, KPI (€/jr), een
 * status-dot rechtsboven en een status-substext. De héle kaart linkt door
 * naar de bijbehorende box-subpagina (box1/box2/box3) — geen #anchor-scroll
 * meer.
 *
 * Bewust presentationeel/dom: de pagina berekent de KPI's en statussen
 * server-side (Box 1 ← jaarruimte, Box 3 ← tax_optimization-pillar, Box 2 ←
 * aanwezigheid deelneming) en geeft een kant-en-klare `cards`-array door.
 * Zo blijft de component triviaal testbaar en kan hij een server-component
 * blijven (geen hooks).
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
  /** Eén-zin beschrijving onder de KPI. */
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
const BOX_TILE: Record<string, { bg: string; fg: string }> = {
  '1': { bg: 'bg-[var(--color-box1-50)]', fg: 'text-[var(--color-box1-700)]' },
  '2': { bg: 'bg-[var(--color-box2-50)]', fg: 'text-[var(--color-box2-700)]' },
  '3': { bg: 'bg-[var(--color-box3-50)]', fg: 'text-[var(--color-box3-700)]' },
}

export function BelastingBoxCards({ cards }: { cards: BelastingBoxCard[] }) {
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
        {cards.map((card) => (
          <BoxCard key={card.number} {...card} />
        ))}
      </nav>
    </section>
  )
}

function BoxCard({ number, label, href, tax, status, statusText, subtitle }: BelastingBoxCard) {
  const Icon = BOX_ICON[number] ?? Receipt
  // Per-box coderingskleur voor de icoon-tegel (val terug op Box 3 bij onbekend).
  const tile = BOX_TILE[number] ?? BOX_TILE['3']
  const hasValue = tax != null && tax > 0

  return (
    <Link
      href={href}
      className="group relative flex flex-col border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <span
        className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${LEVERAGE_STATUS_DOT[status]}`}
        aria-hidden="true"
        title={LEVERAGE_STATUS_LABEL[status]}
      />
      <header className="flex items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 ${tile.bg} ${tile.fg}`}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Box {number}
        </div>
      </header>
      <div className="text-sm font-semibold text-[var(--ink)] mb-0.5">{label}</div>
      <div className="font-mono text-lg sm:text-xl font-semibold text-[var(--ink)] tabular-nums">
        {hasValue ? `${formatCurrency(Math.round(tax))}/jr` : '—'}
      </div>
      <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug">{subtitle}</p>
      <div className="mt-2 flex items-end justify-between gap-2 min-h-[16px]">
        {statusText ? (
          <span className={`text-[11px] font-medium ${leverageStatusTextClass(status)}`}>
            {statusText}
          </span>
        ) : (
          <span />
        )}
        <ArrowRight
          className="w-3.5 h-3.5 text-[var(--ink-3)] group-hover:text-[var(--ink-2)] transition-colors shrink-0"
          aria-hidden="true"
        />
      </div>
    </Link>
  )
}
