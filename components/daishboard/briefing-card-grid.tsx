'use client'

import { useMemo } from 'react'
import type { BriefingCardSpec, ModuleGuideCardSpec, CardModule } from '@/lib/briefing/types'
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
import { QuoteCard } from './cards/quote-card'
import { RecurringCard } from './cards/recurring-card'
import { LifeEventCard } from './cards/life-event-card'
import { NextStepBriefingCard } from './cards/next-step-card'
import { DiscoverCard } from './cards/discover-card'
import { ModuleGuideCard } from './cards/module-guide-card'
import { CardFeedbackProvider, type CardFeedbackFn } from './card-feedback-context'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { useModuleGuideState } from '@/lib/hooks/use-module-guide-state'
import { MODULE_GUIDE_DISPLAY_ORDER, getModuleGuideSteps } from '@/lib/briefing/module-guide-steps'
import { MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

interface BriefingCardGridProps {
  cards: BriefingCardSpec[]
  data: DashboardData
  onCardEngage?: (cardType: string, module: string | undefined) => void
  onFeedback?: CardFeedbackFn
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
    case 'quote': return <QuoteCard spec={card} />
    case 'recurring': return <RecurringCard spec={card} />
    case 'lifeEvent': return <LifeEventCard spec={card} />
    case 'nextStep': return <NextStepBriefingCard spec={card} />
    case 'discover': return <DiscoverCard spec={card} />
    case 'moduleGuide': return <ModuleGuideCard spec={card} />
  }
}

// ── Module → card accent mapping ──────────────────────────────

const MODULE_CARD_MODULE: Record<ModuleId, CardModule> = {
  budgetteren: 'kern',
  vermogensregistratie: 'kern',
  aandelenregistratie: 'kern',
  inzicht_acties: 'wil',
  toekomstplannen: 'horizon',
  nieuws: 'cross',
}

export function BriefingCardGrid({ cards, data, onCardEngage, onFeedback }: BriefingCardGridProps) {
  const { activeModules } = useModuleAccess()
  const { isCardVisible, hasOnboardingIntent } = useModuleGuideState()
  const guideSteps = getModuleGuideSteps()

  // Fallback step for inzicht_acties when AI pre-generation didn't produce recommendations
  const hasRecommendations = data.recommendations > 0

  // Build module-guide cards: only for users who went through intent-based onboarding
  const guideCards = useMemo<ModuleGuideCardSpec[]>(() => {
    // Users without onboarding_intent (existing users) don't see guide cards
    if (!hasOnboardingIntent) return []

    return MODULE_GUIDE_DISPLAY_ORDER
      .filter((moduleId) => {
        // Only active modules
        if (!activeModules.includes(moduleId)) return false
        // Skip modules still in development
        const def = MODULE_CATALOG.find((m) => m.id === moduleId)
        if (def?.inDevelopment) return false
        // Not dismissed and not all steps completed
        if (!isCardVisible(moduleId)) return false
        return true
      })
      .map((moduleId): ModuleGuideCardSpec => {
        const def = MODULE_CATALOG.find((m) => m.id === moduleId)
        let steps = guideSteps[moduleId] ?? []

        // When AI pre-generation failed (no recommendations), prepend a fallback step
        // so the user can manually trigger generation from /will
        if (moduleId === 'inzicht_acties' && !hasRecommendations) {
          const fallbackStep = {
            key: 'inzicht_genereer',
            label: 'Genereer je eerste voorstellen',
            href: '/will',
          }
          steps = [fallbackStep, ...steps]
        }

        return {
          type: 'moduleGuide',
          moduleId,
          module: MODULE_CARD_MODULE[moduleId],
          title: def?.label ?? moduleId,
          steps,
        }
      })
  }, [activeModules, isCardVisible, guideSteps, hasRecommendations, hasOnboardingIntent])

  // Merge: guide cards first, then AI-generated cards
  const allCards: BriefingCardSpec[] = [...guideCards, ...cards]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 grid-flow-dense">
      {allCards.map((card, i) => {
        const module = 'module' in card ? card.module : undefined
        const rendered = renderCard(card, data)
        const wrapped = onFeedback
          ? <CardFeedbackProvider index={i} cardType={card.type} handler={onFeedback}>{rendered}</CardFeedbackProvider>
          : rendered
        return (
          <div
            key={card.type === 'moduleGuide' ? `guide-${card.moduleId}` : `${card.type}-${i}`}
            className={SPAN_CLASSES[CARD_SPAN[card.type]] ?? 'col-span-1'}
            style={{ '--stagger': `${i * 80}ms` } as React.CSSProperties}
            onClick={onCardEngage ? () => onCardEngage(card.type, module) : undefined}
          >
            {wrapped}
          </div>
        )
      })}
    </div>
  )
}
