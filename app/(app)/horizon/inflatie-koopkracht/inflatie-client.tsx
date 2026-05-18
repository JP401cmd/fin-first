'use client'

import { ArrowLeft, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Kicker, EditorialHeadline, EditorialDeck, PullQuote, HL, HLNeg, GlossaryTerm } from '@/components/editorial'
import { InflationErosionChart } from '@/components/app/horizon/inflation-erosion-chart'

export function InflatieKoopkrachtClient({
  defaultInflationRate,
  defaultDailyExpenses,
}: {
  defaultInflationRate: number
  defaultDailyExpenses: number
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Back link */}
      <Link
        href="/horizon"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        De Horizon
      </Link>

      {/* Editorial header */}
      <div className="space-y-4 mb-8">
        <Kicker>
          <TrendingDown size={12} className="inline -mt-0.5 mr-1" />
          Inflatie en koopkracht
        </Kicker>

        <EditorialHeadline emphasis="onzichtbare" size="lg">
          De onzichtbare belasting op je spaargeld
        </EditorialHeadline>

        <EditorialDeck>
          <GlossaryTerm term="inflatie">Inflatie</GlossaryTerm> vreet stilletjes aan je <GlossaryTerm term="koopkracht">koopkracht</GlossaryTerm>. Wat je vandaag kunt
          kopen voor &euro;1.000, kost over twintig jaar aanzienlijk meer.
          Elke euro die stil op je rekening staat, verliest elke dag een
          beetje vrijheid.
        </EditorialDeck>
      </div>

      {/* Chart */}
      <InflationErosionChart
        defaultInflationRate={defaultInflationRate}
        defaultDailyExpenses={defaultDailyExpenses}
      />

      {/* Educational pull-quote */}
      <div className="mt-10">
        <PullQuote>
          Sparen voelt veilig, maar stilstand is achteruitgang. Bij 2%
          inflatie verlies je in 20 jaar bijna <HLNeg>een derde</HLNeg> van
          je koopkracht. Beleggen is geen luxe &mdash; het is{' '}
          <HL>verdediging tegen de tijd</HL>.
        </PullQuote>
      </div>

      {/* Explanation section */}
      <div
        className="mt-8 space-y-4 text-sm text-[var(--ink-2)] leading-relaxed"
        style={{
          fontFamily: 'var(--font-source-serif, Georgia, serif)',
        }}
      >
        <h3
          className="text-base font-bold text-[var(--ink)]"
          style={{
            fontFamily: 'var(--font-playfair, Georgia, serif)',
          }}
        >
          Waarom beleggen vs. sparen?
        </h3>
        <p>
          Inflatie is de stille belasting op cash. De Europese Centrale Bank
          streeft naar 2% inflatie per jaar. Dat klinkt bescheiden, maar het
          compound-effect is genadeloos: na 20 jaar is &euro;1.000 nog maar
          &euro;672 waard in koopkracht. Na 30 jaar slechts &euro;552.
        </p>
        <p>
          Historisch gezien levert de aandelenmarkt circa 7% bruto <GlossaryTerm term="rendement">rendement</GlossaryTerm>{' '}
          per jaar op. Na aftrek van <GlossaryTerm term="inflatie">inflatie</GlossaryTerm> (2%) houd je zo&apos;n 5% re&euml;el
          rendement over. Dat is het verschil tussen{' '}
          <strong className="text-[var(--ink)] not-italic">
            koopkracht opbouwen
          </strong>{' '}
          en{' '}
          <strong style={{ color: 'var(--negative)' }} className="not-italic">
            koopkracht verliezen
          </strong>
          .
        </p>
        <p>
          Sparen is essentieel voor je <GlossaryTerm term="noodreserve">noodfonds</GlossaryTerm> &mdash; 3 tot 6 maanden
          uitgaven op een toegankelijke rekening. Maar al het geld daarboven
          verdient het om belegd te worden. Niet om snel rijk te worden, maar
          om je vrijheidstijd te beschermen tegen erosie.
        </p>
      </div>

      {/* Sparen vs beleggen comparison */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className="bg-[var(--paper)] border border-[var(--border-ed)] p-4"
          style={{
            borderLeftWidth: '3px',
            borderLeftColor: 'var(--negative)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-2">
            Spaarrekening (0,5% rente)
          </div>
          <div className="text-sm" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
            <p className="text-[var(--ink-2)] italic">
              Re&euml;el rendement: <span style={{ color: 'var(--negative)' }} className="font-semibold not-italic">-1,5%</span> per jaar
            </p>
            <p className="text-[var(--ink-3)] text-xs mt-1">
              Je geld krimpt stilletjes &mdash; elk jaar koopt het minder.
            </p>
          </div>
        </div>
        <div
          className="bg-[var(--paper)] border border-[var(--border-ed)] p-4"
          style={{
            borderLeftWidth: '3px',
            borderLeftColor: 'var(--module-active-500)',
          }}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-2">
            Beleggingsportefeuille (7% bruto)
          </div>
          <div className="text-sm" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
            <p className="text-[var(--ink-2)] italic">
              Re&euml;el rendement: <span style={{ color: 'var(--module-active-700)' }} className="font-semibold not-italic">+5%</span> per jaar
            </p>
            <p className="text-[var(--ink-3)] text-xs mt-1">
              Je koopkracht groeit &mdash; elk jaar koopt het meer.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
