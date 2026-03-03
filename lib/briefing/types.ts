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

export interface SparklineCardSpec {
  type: 'sparkline'
  label: string
  value: string
  dataKey: 'netWorthHistory'
  module: CardModule
}

export interface MilestoneCardSpec {
  type: 'milestone'
  target: string
  current: string
  percentage: number
  label: string
  freedomStr?: string
}

export type InsightEmphasis = 'greeting' | 'observation' | 'celebration' | 'tip'

export interface InsightCardSpec {
  type: 'insight'
  text: string
  emphasis?: InsightEmphasis
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
}

export interface CountdownCardSpec {
  type: 'countdown'
  label: string
  days: number
  sublabel?: string
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

// ── API Types ───────────────────────────────────────────────

export interface BriefingComposeRequest {
  dataSummary: string
  temporal: TemporalContext
  phase: string
  level: number
}

export interface BriefingComposeResponse {
  cards: BriefingCardSpec[]
  composedAt: string
  source: 'ai' | 'fallback'
}

// ── Card Grid Sizing ────────────────────────────────────────

export const CARD_SPAN: Record<BriefingCardSpec['type'], number> = {
  metric: 1,
  progressRing: 1,
  countdown: 1,
  sparkline: 1,
  action: 2,
  alert: 2,
  checklist: 2,
  comparison: 2,
  insight: 2,
  milestone: 4,
}
