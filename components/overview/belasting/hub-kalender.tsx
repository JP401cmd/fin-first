import { TaxTimeline, type TaxTimelineItem } from '@/components/overview/belasting/tax-timeline'
import type { TaxDeadline } from '@/lib/tax-calendar'
import { Kicker } from '@/components/editorial'

/**
 * HubKalender (C5) — fiscale kalender: de eerstvolgende deadlines op een
 * horizontale tijdlijn (peildatum Box 3, aangifte IB, voorlopige aanslag,
 * jaarruimte-inleg, DGA-leengrens).
 *
 * De hub levert de deadlines al gesorteerd op `daysUntil` oplopend
 * (`getTaxDeadlines(now)`); wij tonen de eerstvolgende ~5 en markeren de
 * dichtstbijzijnde als highlight. `box: null` (box-overstijgend, bv. aangifte)
 * wordt naar `undefined` gemapt zodat de tijdlijn de neutrale kleur gebruikt.
 *
 * Bewust presentationeel/server-compatible.
 */
export function HubKalender({
  deadlines,
  limit = 5,
}: {
  deadlines: TaxDeadline[]
  /** Aantal eerstvolgende deadlines om te tonen (default 5). */
  limit?: number
}) {
  if (deadlines.length === 0) return null

  const items: TaxTimelineItem[] = deadlines.slice(0, limit).map((d, i) => ({
    date: d.date,
    label: d.label,
    sublabel: d.daysUntil === 0 ? 'vandaag' : `over ${d.daysUntil} dagen`,
    // TaxTimeline accepteert alleen 1|2|3; box-overstijgend (null) → undefined.
    box: d.box ?? undefined,
    highlight: i === 0,
  }))

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Fiscale kalender</Kicker>
      <div className="mt-4">
        <TaxTimeline items={items} />
      </div>
    </article>
  )
}
