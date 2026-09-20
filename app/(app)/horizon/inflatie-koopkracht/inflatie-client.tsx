'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PageVerdictOpening, PullQuote, HL, HLNeg, GlossaryTerm, PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { resolveRouteTitle } from '@/lib/nav-config'
import { InflationErosionChart } from '@/components/app/horizon/inflation-erosion-chart'

export function InflatieKoopkrachtClient({
  defaultInflationRate,
  defaultDailyExpenses,
}: {
  defaultInflationRate: number
  defaultDailyExpenses: number
}) {
  const pathname = usePathname()
  // /toekomst/inflatie-koopkracht krijgt nieuwe info; legacy /horizon-pad valt terug
  const pageInfoText =
    getPageInfo(pathname, '/toekomst/inflatie-koopkracht')
  // Back-link wijst naar canonieke route /toekomst (was /horizon)
  const backHref = pathname?.startsWith('/toekomst') ? '/toekomst' : '/horizon'
  const backLabel = pathname?.startsWith('/toekomst') ? 'De Toekomst' : 'Toekomst'
  // Paginanaam altijd uit de canonieke titel-resolver — dezelfde bron als de
  // shell-`h1` en de mobiele TopBar. Deze component draait op twee paden (de
  // /toekomst-route is een re-export van de /horizon-page); het legacy
  // /horizon-pad staat niet in de resolver en valt terug op de canonieke naam.
  const pageName =
    resolveRouteTitle(pathname ?? '') ??
    resolveRouteTitle('/toekomst/inflatie-koopkracht') ??
    'Inflatie & koopkracht'
  // KERNCIJFER in de titel, géén oordeel: dit is een rekenvoorbeeld, geen
  // beoordeling van jouw situatie. Het getal is de inflatie waarmee de app voor
  // jou rekent (`resolveFireParams`, server-geladen) — dezelfde waarde die de
  // grafiek hieronder als startstand krijgt. Neutrale inkt.
  const inflatieLabel = `${new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(defaultInflationRate)} inflatie per jaar`
  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <PageInfoButton
        content={pageInfoText}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />
      {/* Back link */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </Link>

      {/* Pagina-aanhef met het kerncijfer in de titel (kop-herziening sep 2026).
          De kicker is vervallen; de paginanaam staat op mobiel in de TopBar en
          op desktop in de titel zelf — zie `PageVerdictOpening`. */}
      <PageVerdictOpening
        className="mb-8"
        gutterClassName="pr-12 sm:pr-14"
        pageName={pageName}
        verdict={inflatieLabel}
        deck={
          <>
            <GlossaryTerm term="inflatie">Inflatie</GlossaryTerm> vreet stilletjes aan je{' '}
            <GlossaryTerm term="koopkracht">koopkracht</GlossaryTerm>. Elke euro die stilstaat,
            levert elk jaar minder tijd op.
          </>
        }
      />

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
          Sparen is essentieel voor je <GlossaryTerm term="noodfonds">noodfonds</GlossaryTerm> &mdash; 3 tot 6 maanden
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
