'use client'

import { InsightCard } from '@/components/daishboard/cards/insight-card'
import type { InsightCardSpec } from '@/lib/briefing/types'

/**
 * Test page for InsightCard CTA links.
 * Verifies that insight cards with ctaLabel + href render
 * a clickable CTA link that navigates to the target visualization.
 */
export default function TestInsightCtaPage() {
  const feeInsight: InsightCardSpec = {
    type: 'insight',
    text: 'Je fondsbeheer van € 420/jaar (0,45% TER) kost je 3 jaar en 11 maanden vrijheid. Lagere kosten maken een dramatisch verschil over 30 jaar.',
    emphasis: 'tip',
    module: 'kern',
    href: '/core/assets',
    ctaLabel: 'Bekijk fee-erosie',
  }

  const observationInsight: InsightCardSpec = {
    type: 'insight',
    text: 'Je fondskosten bedragen € 1.200/jaar (1,50% TER). Bekijk hoe zelfs kleine kostenverschillen oplopen over 30 jaar.',
    emphasis: 'observation',
    module: 'kern',
    href: '/core/assets',
    ctaLabel: 'Bekijk fee-erosie',
  }

  const noCtaInsight: InsightCardSpec = {
    type: 'insight',
    text: 'Je vermogen vertegenwoordigt 4 jaar en 2 maanden aan vrijheid.',
    emphasis: 'greeting',
  }

  const celebrationInsight: InsightCardSpec = {
    type: 'insight',
    text: 'Je hebt deze maand 3 acties afgerond. Goed bezig.',
    emphasis: 'celebration',
  }

  return (
    <div className="mx-auto max-w-xl p-8 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--ink)]">
        Insight Card CTA test
      </h1>
      <p className="text-sm text-[var(--ink-3)]">
        Verifieer dat insight-cards met een CTA-link correct navigeren naar de fee-erosie visualisatie.
      </p>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--ink)]">1. Tip met fee-erosie CTA</h2>
        <InsightCard spec={feeInsight} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--ink)]">2. Observatie met fee-erosie CTA</h2>
        <InsightCard spec={observationInsight} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--ink)]">3. Greeting zonder CTA (ongewijzigd)</h2>
        <InsightCard spec={noCtaInsight} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--ink)]">4. Celebration zonder CTA (ongewijzigd)</h2>
        <InsightCard spec={celebrationInsight} />
      </section>
    </div>
  )
}
