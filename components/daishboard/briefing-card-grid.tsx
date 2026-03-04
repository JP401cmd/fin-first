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
import { GoalProgressCard } from './cards/goal-progress-card'
import { BudgetBarCard } from './cards/budget-bar-card'
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

function renderCard(card: BriefingCardSpec, data: DashboardData) {
  switch (card.type) {
    case 'metric': return <MetricCard spec={card} />
    case 'action': return <ActionCard spec={card} />
    case 'alert': return <AlertCard spec={card} />
    case 'progressRing': return <ProgressRingCard spec={card} />
    case 'sparkline': return <SparklineCard spec={card} data={data} />
    case 'milestone': return <MilestoneCard spec={card} />
    case 'insight': return <InsightCard spec={card} />
    case 'checklist': return <ChecklistCard spec={card} />
    case 'comparison': return <ComparisonCard spec={card} />
    case 'countdown': return <CountdownCard spec={card} />
    case 'goalProgress': return <GoalProgressCard spec={card} />
    case 'budgetBar': return <BudgetBarCard spec={card} />
  }
}

export function BriefingCardGrid({ cards, data }: BriefingCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card, i) => (
        <div key={`${card.type}-${i}`} className={SPAN_CLASSES[CARD_SPAN[card.type]] ?? 'col-span-1'}>
          {renderCard(card, data)}
        </div>
      ))}
    </div>
  )
}
