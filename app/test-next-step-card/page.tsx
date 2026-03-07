'use client'

import { NextStepBriefingCard } from '@/components/daishboard/cards/next-step-card'
import type { NextStepCardSpec } from '@/lib/briefing/types'

const EXAMPLES: NextStepCardSpec[] = [
  {
    type: 'nextStep',
    title: 'Importeer je eerste bankafschrift',
    description: 'Koppel je transacties om automatisch je uitgaven te categoriseren en inzicht te krijgen in je cashflow.',
    href: '/core/cash/import',
    module: 'kern',
    icon: 'upload',
    dismissKey: 'import_transactions',
  },
  {
    type: 'nextStep',
    title: 'Stel je FIRE-doel in',
    description: 'Bereken hoeveel jaar je nog nodig hebt tot financiele vrijheid.',
    href: '/horizon',
    module: 'horizon',
    icon: 'target',
    dismissKey: 'setup_fire',
  },
  {
    type: 'nextStep',
    title: 'Bekijk je aanbevelingen',
    description: 'Will heeft 3 nieuwe suggesties om je financiele situatie te verbeteren.',
    href: '/will',
    module: 'wil',
    icon: 'lightbulb',
    dismissKey: 'check_recommendations',
  },
  {
    type: 'nextStep',
    title: 'Stap zonder dismiss key',
    description: 'Deze stap heeft geen dismiss knop — alleen navigatie.',
    href: '/core',
    module: 'cross',
    icon: 'compass',
  },
]

export default function TestNextStepCard() {
  return (
    <div className="min-h-screen bg-[var(--paper)] p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-[var(--ink)] mb-6">NextStep Card — Mobile Test</h1>
      <p className="text-sm text-[var(--ink-3)] mb-4">Uses the real briefing grid: 2-col mobile, 4-col desktop. NextStep cards span 2 cols (full-width on mobile).</p>

      {/* Real briefing grid layout */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {EXAMPLES.map((spec, i) => (
          <div key={i} className="col-span-2">
            <NextStepBriefingCard spec={spec} />
          </div>
        ))}
      </div>
    </div>
  )
}
