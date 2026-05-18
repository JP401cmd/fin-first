'use client'

import { useEffect, useState } from 'react'
import { saveBriefingToLocalHistory } from '@/components/dashboard/briefing-history'
import type { BriefingCardSpec } from '@/lib/briefing/types'

const TEST_BRIEFINGS: { composedAt: string; cards: BriefingCardSpec[] }[] = [
  {
    composedAt: '2026-05-18T08:30:00.000Z',
    cards: [
      { type: 'insight', text: 'Je vermogen is deze maand met 2.3% gestegen. Dat zijn 4 extra vrijheidsdagen.', emphasis: 'observation', module: 'kern' },
      { type: 'metric', label: 'Netto vermogen', value: '€ 142.500', module: 'kern' },
      { type: 'action', icon: 'TrendingUp', kicker: 'Actie', title: 'Herbalanceer je portfolio', description: 'Je obligatie-allocatie wijkt 5% af van je target.', href: '/core/assets', module: 'kern' },
    ],
  },
  {
    composedAt: '2026-05-17T09:15:00.000Z',
    cards: [
      { type: 'insight', text: 'Gisteren heb je 12 dagen vrijheid bespaard door je abonnement op te zeggen.', emphasis: 'celebration', module: 'wil' },
      { type: 'metric', label: 'Spaarquote', value: '34%', module: 'wil' },
    ],
  },
  {
    composedAt: '2026-05-15T07:45:00.000Z',
    cards: [
      { type: 'insight', text: 'Op basis van je huidige tempo bereik je financiële vrijheid over 8 jaar en 3 maanden.', emphasis: 'tip', module: 'horizon' },
      { type: 'metric', label: 'FIRE voortgang', value: '62%', module: 'horizon' },
      { type: 'progressRing', label: 'Budget benut', value: '€ 1.250', percentage: 65, module: 'kern' },
    ],
  },
]

export default function TestBriefingHistoryPage() {
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    // Seed test data (oldest first so newest ends up at top)
    for (const briefing of [...TEST_BRIEFINGS].reverse()) {
      saveBriefingToLocalHistory(briefing.cards, briefing.composedAt)
    }
    setSeeded(true)
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold mb-4">Briefing History Test Seed</h1>
      {seeded ? (
        <div>
          <p className="text-green-600 font-medium">
            {TEST_BRIEFINGS.length} test briefings seeded to localStorage!
          </p>
          <a href="/will" className="mt-4 inline-block text-blue-600 underline">
            Ga naar /will om de geschiedenis te bekijken
          </a>
        </div>
      ) : (
        <p>Seeding...</p>
      )}
    </div>
  )
}
