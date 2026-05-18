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
import { GoalGuideCard } from './cards/goal-guide-card'
import { Sparkles, RefreshCw } from 'lucide-react'
import { CardFeedbackProvider, type CardFeedbackFn } from './card-feedback-context'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { useModuleGuideState } from '@/lib/hooks/use-module-guide-state'
import { useGoalGuideState } from '@/lib/hooks/use-goal-guide-state'
import { MODULE_GUIDE_DISPLAY_ORDER, getModuleGuideSteps } from '@/lib/briefing/module-guide-steps'
import { MODULE_CATALOG, getModuleLabel, type ModuleId } from '@/lib/module-registry'

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
    case 'goalGuide': return <GoalGuideCard spec={card} />
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
  // De goal-guide-card wordt sinds de "Stappenplannen-strook" niet meer in de
  // briefing-grid getoond; we lezen alleen nog `primaryGoalSlug` om te bepalen
  // of we de module-guide-fallback voor legacy-gebruikers willen renderen.
  const { primaryGoalSlug } = useGoalGuideState()
  const guideSteps = getModuleGuideSteps()

  // Fallback step for inzicht_acties when AI pre-generation didn't produce recommendations
  const hasRecommendations = data.recommendations > 0

  // Build module-guide cards: only for legacy users (intent-based onboarding zonder primary goal)
  const guideCards = useMemo<ModuleGuideCardSpec[]>(() => {
    // Users met een primair doel zien hun doel-stappenplan in de strook
    // boven het dashboard — geen module-guide-cards in de briefing.
    if (primaryGoalSlug) return []
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
          title: def?.label ?? getModuleLabel(moduleId),
          steps,
        }
      })
  }, [activeModules, isCardVisible, guideSteps, hasRecommendations, hasOnboardingIntent, primaryGoalSlug])

  // Sinds de goal-guide-card is verhuisd naar de "Stappenplannen-strook"
  // boven het dashboard, bestaan in de briefing-grid alleen nog
  // module-guide-cards (voor legacy gebruikers zonder `primary_goal_slug`).
  const allGuideCards: ModuleGuideCardSpec[] = guideCards

  // Split into guide cards (client) and AI cards (server-composed)
  const hasGuides = allGuideCards.length > 0
  const hasAiCards = cards.length > 0

  // Render a single card item with optional feedback wrapper
  const renderCardItem = (card: BriefingCardSpec, index: number) => {
    const cardModule = 'module' in card ? card.module : undefined
    const rendered = renderCard(card, data)
    const wrapped = onFeedback
      ? <CardFeedbackProvider index={index} cardType={card.type} handler={onFeedback}>{rendered}</CardFeedbackProvider>
      : rendered
    const reactKey =
      card.type === 'moduleGuide'
        ? `guide-${card.moduleId}`
        : card.type === 'goalGuide'
          ? `goalguide-${card.goalSlug}`
          : `${card.type}-${index}`
    return (
      <div
        key={reactKey}
        className={SPAN_CLASSES[CARD_SPAN[card.type]] ?? 'col-span-1'}
        style={{ '--stagger': `${index * 80}ms` } as React.CSSProperties}
        onClick={onCardEngage ? () => onCardEngage(card.type, cardModule) : undefined}
      >
        {wrapped}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Goal-guide of module-guide cards (client-generated) */}
      {hasGuides && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 grid-flow-dense">
          {allGuideCards.map((card, i) => renderCardItem(card, i))}
        </div>
      )}

      {/* Briefing explainer — only shown when guides exist but AI cards haven't loaded yet */}
      {hasGuides && !hasAiCards && (
        <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-3.5 sm:px-5">
          <div className="flex gap-3 items-start">
            <div className="mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-wil-100 text-wil-600">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[var(--ink-2)] mb-1">Over je briefing</p>
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Hieronder zie je je persoonlijke financiële briefing — samengesteld door <span className="font-medium text-wil-600">Will</span>, je AI-assistent.
                De briefing werkt met een AI-abonnement en analyseert dagelijks je financiële situatie om je inzichten, tips en actiepunten te geven.
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[var(--ink-4)]">
                <RefreshCw className="h-2.5 w-2.5" />
                <span>Eenmaal per dag te vernieuwen — gebruik de knop onderaan de briefing</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI-generated briefing cards */}
      {(hasAiCards || !hasGuides) && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 grid-flow-dense">
          {hasGuides
            ? cards.map((card, i) => renderCardItem(card, i + allGuideCards.length))
            : [...allGuideCards, ...cards].map((card, i) => renderCardItem(card, i))
          }
        </div>
      )}
    </div>
  )
}
