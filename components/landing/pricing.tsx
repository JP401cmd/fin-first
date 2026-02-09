import Link from 'next/link'

const tiers = [
  {
    name: 'Free',
    price: '$0',
    description: 'For individuals getting started.',
    features: [
      '1 bank account',
      'Basic budgeting',
      'Monthly reports',
      'Email support',
    ],
    cta: 'Get started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$12',
    description: 'For power users who want more.',
    features: [
      'Unlimited accounts',
      'Advanced analytics',
      'Investment tracking',
      'Bill reminders',
      'Priority support',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For teams and organizations.',
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Choose the plan that works for you. Upgrade anytime.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl p-8 ${
                tier.highlighted
                  ? 'ring-2 ring-zinc-900 bg-white shadow-lg'
                  : 'border border-zinc-200 bg-white'
              }`}
            >
              <h3 className="text-lg font-semibold text-zinc-900">{tier.name}</h3>
              <p className="mt-1 text-sm text-zinc-600">{tier.description}</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-zinc-900">{tier.price}</span>
                {tier.price !== 'Custom' && (
                  <span className="text-sm text-zinc-500">/month</span>
                )}
              </div>
              <ul className="mt-8 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-zinc-600">
                    <svg
                      className="h-4 w-4 shrink-0 text-zinc-900"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium ${
                  tier.highlighted
                    ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                    : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
