import { TaxTimeline, type TaxTimelineItem } from './tax-timeline'
import { Box3SectionHeader } from './box3-section-header'
import { ScenarioCallout } from '@/components/editorial'
import type { TaxYear } from '@/lib/box3-data'

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

/**
 * box3-peildatum (3.5) — Peildatum & arbitragevenster.
 *
 * Box 3 wordt gemeten op de PEILDATUM 1 januari. Rond die datum loopt een
 * arbitragevenster (1 okt – 31 mrt) waarin tijdelijk schuiven tussen
 * spaargeld en beleggingen het vermogen op de peildatum kan beïnvloeden.
 * De antimisbruikregel maakt zulke tijdelijke verschuivingen die binnen drie
 * maanden worden teruggedraaid echter ongedaan.
 *
 * Presentational: caller geeft het belastingjaar door. Box 3-kleur via de
 * `box: 3`-tag van TaxTimeline (teal).
 */

export function Box3Peildatum({ year }: { year: TaxYear }) {
  const items: TaxTimelineItem[] = [
    {
      date: `${year - 1}-10-01`,
      label: 'Start venster',
      sublabel: '3-maands antimisbruik begint',
      box: 3,
    },
    {
      date: `${year}-01-01`,
      label: 'Peildatum',
      sublabel: 'meetmoment vermogen',
      box: 3,
      highlight: true,
    },
    {
      date: `${year}-03-31`,
      label: 'Einde venster',
      sublabel: '3-maands antimisbruik eindigt',
      box: 3,
    },
  ]

  return (
    <div className="border-t border-[var(--ink)] px-4 py-5 sm:px-7">
      <Box3SectionHeader num="3.5">Peildatum &amp; arbitragevenster</Box3SectionHeader>

      <TaxTimeline items={items} />

      <p
        className="mt-4 text-sm italic leading-snug text-[var(--ink-2)]"
        style={{ fontFamily: SOURCE_SERIF }}
      >
        Je Box 3-vermogen wordt gemeten op{' '}
        <span className="not-italic font-semibold text-[var(--ink)]">1 januari {year}</span>.
        Beleggingen tellen zwaarder mee dan spaargeld, dus rond de jaarwisseling
        spaargeld aanhouden in plaats van beleggen verlaagt tijdelijk je heffing.
      </p>

      <ScenarioCallout title="Antimisbruikregel." className="mt-4 text-xs">
        Schuif je binnen het venster van 1 oktober tot 31 maart vermogen heen en
        weer en draai je dat binnen drie maanden terug, dan negeert de
        Belastingdienst die verschuiving — alleen een blijvende wijziging telt.
      </ScenarioCallout>
    </div>
  )
}
