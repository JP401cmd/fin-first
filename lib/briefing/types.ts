// ── Briefing Types ──────────────────────────────────────────
// Types for Will's AI-driven dashboard briefing system.

import type { WidgetModule } from '@/lib/widget-catalog'

// ── Temporal Context ────────────────────────────────────────

export interface TemporalContext {
  date: string              // "2026-03-03"
  dayOfMonth: number        // 1-31
  dayOfWeek: string         // "maandag", "dinsdag", etc.
  dayOfWeekEn: string       // "Monday", etc. (for logic)
  month: number             // 1-12
  monthName: string         // "maart", etc.
  year: number
  timeOfDay: 'ochtend' | 'middag' | 'avond'
  greeting: string          // "Goedemorgen" / "Goedemiddag" / "Goedenavond"
  seasonalNotes: string[]   // e.g. ["Belastingaangifte periode"]
  /** Days until end of month */
  daysUntilMonthEnd: number
  /** Days until next salary (assuming 25th) */
  daysUntilSalary: number
}

// ── Card Spec Types ─────────────────────────────────────────

export type CardModule = WidgetModule | 'wil'

export interface MetricCardSpec {
  type: 'metric'
  label: string
  value: string
  freedomStr?: string
  delta?: string
  deltaLabel?: string
  module: CardModule
  href?: string
}

export interface ActionCardSpec {
  type: 'action'
  icon: string
  kicker: string
  title: string
  description: string
  href: string
  module?: CardModule
}

export interface AlertCardSpec {
  type: 'alert'
  severity: 'warning' | 'urgent'
  title: string
  message: string
  actionLabel?: string
  href?: string
}

export interface ProgressRingCardSpec {
  type: 'progressRing'
  label: string
  value: string
  percentage: number
  total?: string
  module: CardModule
  href?: string
}

export type SparklineDataKey = 'netWorthHistory' | 'savingsHistory' | 'expenseHistory'

export interface SparklineCardSpec {
  type: 'sparkline'
  label: string
  value: string
  dataKey: SparklineDataKey
  module: CardModule
  href?: string
}

export interface MilestoneCardSpec {
  type: 'milestone'
  target: string
  current: string
  percentage: number
  label: string
  freedomStr?: string
  module?: CardModule
}

export type InsightEmphasis = 'greeting' | 'observation' | 'celebration' | 'tip'

export interface InsightCardSpec {
  type: 'insight'
  text: string
  emphasis?: InsightEmphasis
  module?: CardModule
}

export interface ChecklistCardSpec {
  type: 'checklist'
  title: string
  items: { label: string; href?: string; done: boolean }[]
}

export interface ComparisonCardSpec {
  type: 'comparison'
  label: string
  leftLabel: string
  leftValue: string
  rightLabel: string
  rightValue: string
  delta: string
  freedomDays?: number
  href?: string
}

export interface CountdownCardSpec {
  type: 'countdown'
  label: string
  days: number
  sublabel?: string
  module: CardModule
  href?: string
}

export interface GoalProgressCardSpec {
  type: 'goalProgress'
  name: string
  percentage: number
  current: string
  target: string
  targetDate?: string
  onTrack: boolean
  module: CardModule
  href?: string
}

export interface BudgetBarCardSpec {
  type: 'budgetBar'
  name: string
  spent: string
  limit: string
  percentage: number
  remainingDays?: number
  status: 'healthy' | 'warning' | 'over'
  href?: string
}

export interface QuoteCardSpec {
  type: 'quote'
  text: string
  attribution?: string
  module: CardModule
}

export interface StreakCardSpec {
  type: 'streak'
  label: string
  count: number
  unit: 'dagen' | 'weken' | 'maanden'
  description: string
  module: CardModule
  href?: string
}

export interface RecurringCardSpec {
  type: 'recurring'
  title: string
  items: { name: string; amount: string; freedomStr?: string }[]
  totalAmount: string
  totalFreedomStr?: string
  href?: string
}

export interface LifeEventCardSpec {
  type: 'lifeEvent'
  name: string
  daysUntil: number
  amount: string
  amountType: 'eenmalig' | 'maandelijks'
  freedomStr?: string
  module: CardModule
  href?: string
}

// ── Union Type ──────────────────────────────────────────────

export type BriefingCardSpec =
  | MetricCardSpec
  | ActionCardSpec
  | AlertCardSpec
  | ProgressRingCardSpec
  | SparklineCardSpec
  | MilestoneCardSpec
  | InsightCardSpec
  | ChecklistCardSpec
  | ComparisonCardSpec
  | CountdownCardSpec
  | GoalProgressCardSpec
  | BudgetBarCardSpec
  | QuoteCardSpec
  | StreakCardSpec
  | RecurringCardSpec
  | LifeEventCardSpec

// ── SSE Event Types ─────────────────────────────────────────

export interface BriefingSSECardEvent {
  type: 'card'
  spec: BriefingCardSpec
}

export interface BriefingSSEDoneEvent {
  type: 'done'
  composedAt: string
}

export interface BriefingSSEErrorEvent {
  type: 'error'
  message: string
}

export type BriefingSSEEvent =
  | BriefingSSECardEvent
  | BriefingSSEDoneEvent
  | BriefingSSEErrorEvent

// ── API Types ───────────────────────────────────────────────

/** Summary of the previous briefing for continuity */
export interface PreviousBriefingSummary {
  composedAt: string
  cardTypes: string[]
  keyMetrics: Record<string, string>
}

/** Long-term memory that persists across browser sessions via localStorage */
export interface BriefingLongTermMemory {
  lastBriefingDate: string
  lastNetWorth: number
  lastSavingsRate: number
  lastFreedomPct: number
  briefingCount: number
  adviceHistory: string[]  // last 5 insight/tip texts, max 50 chars each
}

export interface PhaseTransitionInfo {
  previousPhase: string
  currentPhase: string
}

export interface BriefingComposeRequest {
  dataSummary: string
  temporal: TemporalContext
  phase: string
  level: number
  previousBriefing?: PreviousBriefingSummary
  longTermMemory?: BriefingLongTermMemory
  phaseTransition?: PhaseTransitionInfo
  briefingFrequency?: 'daily' | 'weekly' | 'monthly' | 'rare'
}

export interface BriefingComposeResponse {
  cards: BriefingCardSpec[]
  composedAt: string
  source: 'ai'
}

// ── Card Grid Sizing ────────────────────────────────────────

export const CARD_SPAN: Record<BriefingCardSpec['type'], number> = {
  metric: 1,
  progressRing: 1,
  countdown: 1,
  sparkline: 1,
  goalProgress: 1,
  budgetBar: 1,
  action: 2,
  alert: 2,
  checklist: 2,
  comparison: 2,
  insight: 2,
  milestone: 4,
  quote: 2,
  streak: 1,
  recurring: 2,
  lifeEvent: 2,
}
