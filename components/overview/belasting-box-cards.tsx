import Link from 'next/link'
import { ArrowRight, Briefcase, Building2, PiggyBank, Receipt, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
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

export function BelastingBoxCards({
  cards,
  totalNote,
}: {
  cards: BelastingBoxCard[]
  /**
   * Optionele kanttekening onder "Geschatte druk" — bv. "excl. Box 2" wanneer
   * een box (Box 2/DGA) wel relevant is maar zijn bedrag niet in het
   * jaartotaal is meegerekend. Houdt het totaal eerlijk i.p.v. stil onvolledig.
   */
  totalNote?: string
}) {
  const totalDruk = cards.reduce((sum, c) => sum + (c.tax ?? 0), 0)

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2">
      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Belasting — overzicht
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Drie boxen, één jaartotaal
          </h2>
        </div>
        {totalDruk > 0 && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Geschatte druk
            </div>
            <div className="font-serif font-semibold text-[var(--ink)] tabular-nums">
              {formatCurrency(Math.round(totalDruk))}/jr
            </div>
            {totalNote && (
              <div className="text-[10px] text-[var(--ink-4)] italic">{totalNote}</div>
            )}
          </div>
        )}
      </header>

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
  const hasValue = tax != null && tax > 0

  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <span
        className={`absolute right-2.5 top-2.5 sm:right-3 sm:top-3 w-2 h-2 rounded-full ${LEVERAGE_STATUS_DOT[status]}`}
        aria-hidden="true"
        title={LEVERAGE_STATUS_LABEL[status]}
      />
      <header className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-violet-50 text-violet-700"
          aria-hidden="true"
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Box {number}
        </div>
      </header>
      <div className="text-sm font-semibold text-[var(--ink)] mb-0.5">{label}</div>
      <div className="font-serif text-lg sm:text-xl font-semibold text-[var(--ink)] tabular-nums">
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
