'use client'

import type { BriefingCardSpec } from '@/lib/briefing/types'
import { CARD_SPAN } from '@/lib/briefing/types'
import { MetricCard } from './cards/metric-card'
import { ActionCard } from './cards/action-card'
import { AlertCard } from './cards/alert-card'
import { ProgressRingCard } from './cards/progress-ring-card'
import { SparklineCard } from './cards/sparkline-card'
import { MilestoneCard } from './cards/milestone-card'
import { InsightCard } from './cards/insight-card'
import { ChecklistCard } from './cards/checklist-card'
import { ComparisonCard } from './cards/comparison-card'
import { CountdownCard } from './cards/countdown-card'
import type { DashboardData } from '@/components/widgets/widget-renderer'

interface BriefingCardGridProps {
  cards: BriefingCardSpec[]
  data: DashboardData
}

const SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  4: 'col-span-full',
}

function renderCard(card: BriefingCardSpec, index: number, data: DashboardData) {
  const delay = index * 50
  switch (card.type) {
    case 'metric': return <MetricCard key={index} spec={card} delay={delay} />
    case 'action': return <ActionCard key={index} spec={card} delay={delay} />
    case 'alert': return <AlertCard key={index} spec={card} delay={delay} />
    case 'progressRing': return <ProgressRingCard key={index} spec={card} delay={delay} />
    case 'sparkline': return <SparklineCard key={index} spec={card} data={data} delay={delay} />
    case 'milestone': return <MilestoneCard key={index} spec={card} delay={delay} />
    case 'insight': return <InsightCard key={index} spec={card} delay={delay} />
    case 'checklist': return <ChecklistCard key={index} spec={card} delay={delay} />
    case 'comparison': return <ComparisonCard key={index} spec={card} delay={delay} />
    case 'countdown': return <CountdownCard key={index} spec={card} delay={delay} />
  }
}

export function BriefingCardGrid({ cards, data }: BriefingCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card, i) => (
        <div key={i} className={SPAN_CLASSES[CARD_SPAN[card.type]] ?? 'col-span-1'}>
          {renderCard(card, i, data)}
        </div>
      ))}
    </div>
  )
}
