import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { Reveal } from '@/components/landing/reveal'

/**
 * PricingTiers — twee-kaarten-grid (Gratis / Pro) voor de /prijzen-pagina,
 * zonder eigen sectie-titel of voetnoot: MarketingPageHero levert de kop,
 * de Footer de afsluitende SlotCta, en de "blijft gratis gratis"-belofte
 * leeft in FAQ_PRIJZEN.
 *
 * Freemium-model (productowner-beslissingen 31 mei + jun 2026): geen
 * creditcard bij signup, geen trial-countdowns; gratis = de publieke
 * rekenhulp-bibliotheek, eigen AI-rekenhulpen op maat = Pro (€9/mnd).
 */

interface Tier {
  name: string
  kicker: string
  price: string
  priceSuffix?: string
  description: string
  features: string[]
  cta: string
  highlighted: boolean
}

const tiers: Tier[] = [
  {
    name: 'Gratis',
    kicker: 'Om mee te beginnen',
    price: '€0',
    priceSuffix: 'voor altijd',
    description:
      'Het volledige Overzicht, doelen en tijdas, plus de publieke rekenhulp-bibliotheek. Genoeg om er werkelijk grip mee te krijgen.',
    features: [
      'Overzicht-module: bezittingen, schulden, cashflow, briefing',
      'Doelen + tijdas met levensgebeurtenissen',
      'Publieke rekenhulp-bibliotheek: 12 kant-en-klare rekenhulpen',
      'Kennismaken met Fin, je AI-coach',
      'Data-export van je kerngegevens (CSV)',
      'Single-user',
    ],
    cta: 'Begin gratis',
    highlighted: false,
  },
  {
    name: 'Pro',
    kicker: 'Om verder te gaan',
    price: '€9',
    priceSuffix: 'per maand',
    description:
      'Voor wie eigen rekenhulpen op maat wil, de fiscale specialist-rekenhulpen en de huishouden-modus.',
    features: [
      'Alles uit Gratis',
      'Eigen AI-rekenhulpen op maat: beschrijf je dilemma, Fin bouwt de rekenhulp',
      'Specialist-rekenhulpen (BV agio vs. privé, box 3 werkelijk rendement, kamerverhuur-regimes)',
      'Huishouden-modus (privé / samen / partner-perspectief)',
      'Publiceren naar de bibliotheek',
      'Priority-support',
    ],
    cta: 'Start gratis — Pro in de app',
    highlighted: true,
  },
]

export function PricingTiers() {
  return (
    <Reveal className="mx-auto max-w-5xl">
      {/* Twee kaarten naast elkaar */}
      <div className="grid gap-6 md:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`overflow-hidden rounded-[var(--r-lg)] border ${
              tier.highlighted
                ? 'border-[var(--ink)] shadow-[var(--s1)]'
                : 'border-[var(--border-ed)]'
            } bg-[var(--paper)]`}
          >
            {/* Kaart-header */}
            <div
              className={`border-b-2 px-6 py-4 ${
                tier.highlighted ? 'border-[var(--ink)] bg-kern-50' : 'border-[var(--border-ed)] bg-[var(--subtle)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${
                      tier.highlighted ? 'text-kern-700' : 'text-[var(--ink-3)]'
                    }`}
                  >
                    {tier.kicker}
                  </p>
                  {/* h2, niet h3: op /prijzen is de hero-titel de enige h1 en
                      staat er geen tussenkop boven dit grid — een h3 sloeg een
                      niveau over (Lighthouse `heading-order`). */}
                  <h2 className="font-display text-2xl font-bold leading-none text-[var(--ink)]">
                    {tier.name}
                  </h2>
                </div>
                {tier.highlighted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ink)] px-2.5 py-1 font-sans text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--bg)]">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Aanrader
                  </span>
                )}
              </div>
            </div>

            {/* Prijs + beschrijving */}
            <div className="border-b border-dashed border-[var(--border-ed)] px-6 py-6">
              <p className="font-display text-[2.4rem] font-bold leading-none tabular-nums text-[var(--ink)]">
                {tier.price}
                {tier.priceSuffix && (
                  <span className="ml-2 font-serif text-base font-normal italic text-[var(--ink-3)]">
                    {tier.priceSuffix}
                  </span>
                )}
              </p>
              <p className="mt-3 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
                {tier.description}
              </p>
            </div>

            {/* Features */}
            <ul className="space-y-3 px-6 py-6">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 font-serif text-sm leading-relaxed text-[var(--ink-2)]"
                >
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      tier.highlighted ? 'text-kern-600' : 'text-[var(--ink-3)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="px-6 pb-6">
              <Link
                href={tier.highlighted ? '/signup?plan=pro' : '/signup'}
                className={`block w-full rounded-[var(--r)] px-4 py-3 text-center font-sans text-sm font-medium transition-all ${
                  tier.highlighted
                    ? 'bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-2)] hover:shadow-[var(--s1)]'
                    : 'border border-[var(--border-md)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:shadow-[var(--s0)]'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Reveal>
  )
}
