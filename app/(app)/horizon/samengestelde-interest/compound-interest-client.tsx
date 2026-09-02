'use client'

import { ArrowLeft, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PageOpening, PullQuote, HL, GlossaryTerm, PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'
import { CompoundInterestChart } from '@/components/app/horizon/compound-interest-chart'

export function CompoundInterestPage({
  defaultMonthlyDeposit,
  defaultAnnualReturn,
}: {
  defaultMonthlyDeposit: number
  defaultAnnualReturn: number
}) {
  const pathname = usePathname()
  // /toekomst/samengestelde-interest krijgt nieuwe info; legacy fallback
  const pageInfoText =
    getPageInfo(pathname, '/toekomst/samengestelde-interest')
  // Back-link wijst naar canonieke route /toekomst (was /horizon)
  const backHref = pathname?.startsWith('/toekomst') ? '/toekomst' : '/horizon'
  const backLabel = pathname?.startsWith('/toekomst') ? 'De Toekomst' : 'Toekomst'
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

      {/* Editorial pagina-opening — module-accent via --module-active-* (horizon) */}
      <PageOpening
        className="mb-8"
        kicker={
          <>
            <TrendingUp size={12} className="inline -mt-0.5 mr-1" />
            Samengestelde interest
          </>
        }
        titleBefore="Het "
        emphasis="sneeuwbaleffect"
        titleAfter=" van tijd"
        deck={
          <>
            Samengestelde interest is de krachtigste kracht in persoonlijke financiering.
            Een klein maandelijks bedrag groeit exponentieel &mdash; niet lineair.
            Het <GlossaryTerm term="rendement">rendement</GlossaryTerm> dat je verdient, verdient weer rendement.
          </>
        }
      />

      {/* Chart */}
      <CompoundInterestChart
        defaultMonthlyDeposit={defaultMonthlyDeposit}
        defaultAnnualReturn={defaultAnnualReturn}
      />

      {/* Educational pull-quote */}
      <div className="mt-10">
        <PullQuote>
          Albert Einstein noemde samengestelde interest het{' '}
          <HL>achtste wereldwonder</HL>. Wie het begrijpt, verdient het.
          Wie het niet begrijpt, betaalt het.
        </PullQuote>
      </div>

      {/* Explanation section */}
      <div className="mt-8 space-y-4 text-sm text-[var(--ink-2)] leading-relaxed" style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}>
        <h3
          className="text-base font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Hoe werkt het?
        </h3>
        <p>
          <GlossaryTerm term="compounding">Samengestelde interest</GlossaryTerm> betekent dat je niet alleen rendement verdient op je inleg,
          maar ook op het rendement dat je al eerder verdiend hebt. In de eerste jaren
          lijkt de groei bescheiden, maar na verloop van tijd versnelt het dramatisch.
        </p>
        <p>
          Stel je legt maandelijks &euro;500 in tegen 7% rendement. Na 10 jaar heb je
          &euro;60.000 ingelegd, maar je vermogen is al ruim &euro;86.000. Na 20 jaar
          heb je &euro;120.000 ingelegd, maar het rendement alleen al is meer dan
          &euro;140.000 &mdash; meer dan je totale inleg.
        </p>
        <p>
          Dit is het <strong className="text-[var(--ink)] not-italic">sneeuwbaleffect</strong>:
          hoe langer je belegd blijft, hoe groter het effect. Daarom is de belangrijkste factor
          niet hoeveel je inlegt, maar <em>hoe lang</em> je belegd blijft.
        </p>
      </div>
    </div>
  )
}
