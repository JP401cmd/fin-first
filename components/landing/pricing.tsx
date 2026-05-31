import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'

/**
 * Pricing — freemium model (productowner-beslissing 31 mei 2026).
 *
 * Twee tiers naast elkaar in krantenstijl:
 *  - Gratis: complete Overzicht-module, beperkt rekenhulpen, single-user
 *  - Pro:    onbeperkt rekenhulpen, huishouden-modus, specialist-calcs
 *
 * Geen creditcard bij signup. Geen trial-countdowns of dark patterns.
 * Exact tarief Pro = aparte beslissing — placeholder €X,XX zolang.
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
    kicker: 'Voor wie wil beginnen',
    price: '€0',
    priceSuffix: 'voor altijd',
    description:
      'Volledig Overzicht, doelen, tijdas en een paar rekenhulpen per week. Genoeg om er werkelijk grip mee te krijgen.',
    features: [
      'Overzicht-module: bezittingen, schulden, cashflow, briefing',
      'Doelen + tijdas met levensgebeurtenissen',
      '5 AI-gegenereerde rekenhulpen per week',
      'Toegang tot de publieke bibliotheek',
      'Single-user',
    ],
    cta: 'Begin gratis',
    highlighted: false,
  },
  {
    name: 'Pro',
    kicker: 'Voor wie verder wil',
    price: '€X,XX',
    priceSuffix: 'per maand',
    description:
      'Voor wie de fiscale specialist-rekenhulpen, huishouden-modus en onbeperkte Will-toegang nodig heeft.',
    features: [
      'Alles uit Gratis',
      'Onbeperkt AI-gegenereerde rekenhulpen',
      'Huishouden-modus (privé / samen / partner-perspectief)',
      'Specialist-calcs (BV, box 3 werkelijk, kamerverhuur-regimes)',
      'Publiceren naar de bibliotheek',
      'Priority-support',
    ],
    cta: 'Begin met Pro',
    highlighted: true,
  },
]

export function Pricing() {
  return (
    <>
      {/* Sectie-scheidingsregel — consistent met Features.tsx */}
      <div className="flex items-center gap-4 px-6 py-8 md:px-12">
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
          Prijzen
        </span>
        <div className="h-px flex-1 bg-[var(--border-ed)]" />
      </div>

      <section id="pricing" className="px-6 py-20 md:px-12 md:py-24">
        <div className="mx-auto max-w-5xl">
          {/* Sectie-titel */}
          <div className="mb-12 text-center">
            <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Prijzen
            </p>
            <h2 className="font-display text-[2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)] md:text-[2.6rem]">
              Probeer gratis,{' '}
              <em className="italic text-kern-600">betaal pas als je &apos;m wilt uitbreiden</em>
            </h2>
            <p className="mx-auto mt-5 max-w-xl font-serif text-base leading-relaxed text-[var(--ink-2)]">
              Geen creditcard bij signup. Geen trial-countdowns. Gratis werkt
              altijd, Pro is voor wie meer wil.
            </p>
          </div>

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
                      <h3 className="font-display text-2xl font-bold leading-none text-[var(--ink)]">
                        {tier.name}
                      </h3>
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
                    href="/signup"
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

          {/* Kleine voetnoot */}
          <p className="mx-auto mt-10 max-w-2xl text-center font-serif text-xs italic leading-relaxed text-[var(--ink-4)]">
            Exact Pro-tarief volgt bij de officiële launch. Wie nu begint
            met Gratis houdt &apos;m gratis &mdash; ook na introductie van Pro.
          </p>
        </div>
      </section>
    </>
  )
}
