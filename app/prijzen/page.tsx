import type { Metadata } from 'next'
import {
  MarketingWideShell,
  MarketingPageHero,
} from '@/components/landing/marketing-page-shell'
import { PricingTiers } from '@/components/landing/pricing-tiers'
import { FaqSection } from '@/components/landing/faq-section'
import { FAQ_PRIJZEN } from '@/components/landing/faq-data'

const description =
  'Gratis werkt altijd: overzicht, doelen, tijdas en de rekenhulp-bibliotheek. Pro (€9/maand) voegt eigen AI-rekenhulpen, specialist-tools en huishouden-modus toe.'

export const metadata: Metadata = {
  title: 'Prijzen — gratis of Pro voor €9 per maand — TriFinity',
  description,
  alternates: { canonical: '/prijzen' },
  openGraph: {
    title: 'Prijzen — gratis of Pro voor €9 per maand — TriFinity',
    description,
    url: '/prijzen',
  },
}

export default function PrijzenPage() {
  return (
    <MarketingWideShell>
      <MarketingPageHero
        kicker="Prijzen"
        title="Probeer gratis,"
        italics="betaal pas als je 'm wilt uitbreiden"
        intro="Geen creditcard bij signup. Geen trial-countdowns. Gratis werkt altijd, Pro is voor wie meer wil."
        showCta={false}
      />

      <section className="px-6 pb-4 pt-10 md:px-12">
        <PricingTiers />
      </section>

      {/* Wat is het verschil? — kort, smal, editorial */}
      <section className="px-6 pb-4 md:px-12">
        <div className="mx-auto max-w-2xl border-l-[3px] border-kern-400 pl-5">
          <h2 className="mb-3 font-display text-[1.4rem] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] md:text-[1.7rem]">
            Wat is het verschil?
          </h2>
          <p className="font-serif text-base leading-relaxed text-[var(--ink-2)]">
            Gratis is het volledige dagelijkse fundament: weten waar je staat,
            doelen stellen, rekenen met de bibliotheek.
          </p>
          <p className="mt-3 font-serif text-base leading-relaxed text-[var(--ink-2)]">
            Pro voegt de diepte toe: rekenhulpen op maat door Will, fiscale
            specialist-tools en het gezamenlijke huishouden-perspectief — voor
            €9 per maand, maandelijks opzegbaar.
          </p>
        </div>
      </section>

      <FaqSection vragen={FAQ_PRIJZEN} kicker="Over je abonnement" />
    </MarketingWideShell>
  )
}
