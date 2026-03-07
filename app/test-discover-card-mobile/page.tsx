'use client'

import { DiscoverCard } from '@/components/daishboard/cards/discover-card'
import type { DiscoverCardSpec } from '@/lib/briefing/types'

const SAMPLE_CARDS: DiscoverCardSpec[] = [
  {
    type: 'discover',
    label: 'Budgetoverzicht met 4 weergavemodi',
    teaser: 'Wist je dat je budgetten op 4 manieren kunt bekijken?',
    description: 'Schakel tussen lijst, grid, donut en vergelijkingsweergave voor een compleet beeld van je uitgaven.',
    href: '/core/budgets',
    module: 'kern',
    featureId: 'budget-modes',
  },
  {
    type: 'discover',
    label: 'FIRE-scenario simulator',
    teaser: 'Wat als je eerder stopt met werken?',
    description: 'Simuleer verschillende scenario\'s met variabele rendementen, inflatie en levensstijlen om je FIRE-datum te berekenen.',
    href: '/horizon',
    module: 'horizon',
    featureId: 'fire-simulator',
  },
  {
    type: 'discover',
    label: 'Slimme aanbevelingen',
    teaser: 'De AI coach heeft nieuwe tips voor je',
    description: 'Ontvang gepersonaliseerde financiele aanbevelingen op basis van jouw uitgavenpatronen en doelen.',
    href: '/will',
    module: 'wil',
    featureId: 'smart-recs',
  },
  {
    type: 'discover',
    label: 'Cross-module inzicht',
    teaser: 'Alles hangt samen',
    description: 'Bekijk hoe je vermogen, schulden en budgetten samen je vrijheidstijd bepalen.',
    href: '/dashboard',
    module: 'cross',
    featureId: 'cross-insight',
  },
]

export default function TestDiscoverCardMobile() {
  return (
    <div className="min-h-screen bg-[var(--subtle)] p-4">
      <h1 className="text-lg font-bold mb-4">Discover Card — Mobile Test (375px)</h1>
      <p className="text-sm text-[var(--ink-3)] mb-6">
        Resize viewport to 375px to verify mobile layout.
      </p>
      <div className="max-w-[375px] mx-auto flex flex-col gap-4">
        {SAMPLE_CARDS.map((card) => (
          <DiscoverCard key={card.featureId} spec={card} />
        ))}
      </div>
      <h2 className="text-lg font-bold mt-8 mb-4">Desktop width (natural)</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {SAMPLE_CARDS.map((card) => (
          <DiscoverCard key={card.featureId} spec={card} />
        ))}
      </div>
    </div>
  )
}
