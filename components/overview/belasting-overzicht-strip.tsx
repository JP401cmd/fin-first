'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/format'
import { GlossaryTerm } from '@/components/editorial/glossary-term'

/**
 * BelastingOverzichtStrip — KPI-tegels-rij voor /overzicht/belasting.
 * Plan-context: backlog "Belasting totaaloverzicht (Box 1-sectie + jaar-
 * ruimte-tracker)". MVP-versie: drie tegels naast elkaar — Box 1, Box 2,
 * Box 3 — die elk een snel KPI tonen plus scroll-target naar de
 * detail-sectie in BelastingPage.
 *
 * Bron-van-waarheid:
 *  - Box 3: echte berekening uit horizonData.healthScoreInput.taxData
 *    (forfaitair 5.88% × 36% over rendementsgrondslag − heffingsvrij)
 *  - Box 1: schatting op basis van bruto-inkomen × geschat marginaal-
 *    tarief. Disclaimer "geschat" zichtbaar zodat user weet dat dit
 *    een vuistregel is, niet een aangifte-berekening
 *  - Box 2: voorlopig 0 (geen deelnemingen-tracking in TriFinity). Toont
 *    "—" wanneer 0, met disclaimer "DGA-tracking komt later"
 *
 * Layout: 3-koloms grid op desktop, single-col op mobile. Per tegel een
 * label + bedrag + beknopte sub-text.
 */
export function BelastingOverzichtStrip({
  box1Tax,
  box2Tax,
  box3Tax,
}: {
  /** Geschatte Box 1-belasting per jaar in EUR. 0 of null = onbekend. */
  box1Tax: number | null
  /** Box 2-belasting per jaar in EUR. Voor MVP altijd 0 (geen tracking). */
  box2Tax: number | null
  /** Werkelijke Box 3-belasting per jaar uit horizonData.taxData. */
  box3Tax: number | null
}) {
  const totalDruk = (box1Tax ?? 0) + (box2Tax ?? 0) + (box3Tax ?? 0)

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
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <BoxTegel
          number="1"
          label="Werk + woning"
          value={box1Tax}
          subtitle="Loon, ondernemerswinst en eigen huis."
          disclaimer="Geschat o.b.v. inkomen × marginaal tarief"
        />
        <BoxTegel
          number="2"
          label="Aanmerkelijk belang"
          value={box2Tax}
          subtitle="DGA / aandeelhouder ≥ 5%."
          disclaimer="DGA-tracking komt later"
          forcePlaceholder={(box2Tax ?? 0) === 0}
        />
        <BoxTegel
          number="3"
          label="Sparen + beleggen"
          value={box3Tax}
          subtitle={
            <>
              Cash, beleggingen, crypto —{' '}
              <GlossaryTerm term="forfaitair_rendement">forfaitair</GlossaryTerm>
              .
            </>
          }
          disclaimer="Berekening uit healthScoreInput"
        />
      </div>
    </section>
  )
}

function BoxTegel({
  number,
  label,
  value,
  subtitle,
  disclaimer,
  forcePlaceholder = false,
}: {
  number: string
  label: string
  value: number | null
  subtitle: React.ReactNode
  disclaimer: string
  forcePlaceholder?: boolean
}) {
  const hasValue = value != null && value > 0 && !forcePlaceholder
  // Plan T-2: KPI-tegels gekoppeld aan een actie. Klik op de tegel
  // scrolt door naar de Box-sectie in /core/belasting (anchor).
  const href = `/core/belasting?box=${number}`
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
    >
      <header className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-50 text-violet-700 text-xs font-mono font-bold"
          aria-hidden="true"
        >
          {number}
        </span>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Box {number}
        </div>
      </header>
      <div className="text-sm font-semibold text-[var(--ink)] mb-0.5">
        {label}
      </div>
      <div className="font-serif text-lg sm:text-xl font-semibold text-[var(--ink)] tabular-nums">
        {hasValue ? `${formatCurrency(Math.round(value))}/jr` : '—'}
      </div>
      <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug">
        {subtitle}
      </p>
      <p className="mt-2 text-[10px] italic text-[var(--ink-4)] leading-snug">
        {disclaimer}
      </p>
    </Link>
  )
}
