/**
 * Recommendation & action types, labels, and helpers for the Will module.
 */

export type RecommendationType =
  | 'budget_optimization'
  | 'asset_reallocation'
  | 'debt_acceleration'
  | 'income_increase'
  | 'savings_boost'

export type RecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'postponed' | 'expired'
export type ActionStatus = 'open' | 'postponed' | 'completed' | 'rejected'
export type ActionSource = 'ai' | 'manual' | 'chat'
export type FeedbackType = 'accepted' | 'rejected' | 'postponed' | 'action_completed' | 'action_rejected'

export type SuggestedAction = {
  title: string
  description?: string
  freedom_days_impact: number
  euro_impact_monthly?: number
}

export type Recommendation = {
  id: string
  user_id: string
  title: string
  description: string
  recommendation_type: RecommendationType
  euro_impact_monthly: number | null
  euro_impact_yearly: number | null
  freedom_days_per_year: number | null
  related_budget_slug: string | null
  related_asset_id: string | null
  related_debt_id: string | null
  current_value: number | null
  proposed_value: number | null
  status: RecommendationStatus
  rejection_reason: string | null
  postponed_until: string | null
  postpone_feedback: string | null
  ai_generation_id: string | null
  priority_score: number | null
  suggested_actions: SuggestedAction[]
  decided_at: string | null
  created_at: string
  updated_at: string
}

export type Action = {
  id: string
  user_id: string
  recommendation_id: string | null
  source: ActionSource
  title: string
  description: string | null
  freedom_days_impact: number | null
  euro_impact_monthly: number | null
  status: ActionStatus
  scheduled_week: string | null
  due_date: string | null
  postpone_weeks: number | null
  postponed_until: string | null
  rejection_reason: string | null
  sort_order: number
  priority_score: number | null
  completed_at: string | null
  status_changed_at: string | null
  created_at: string
  updated_at: string
  // Joined fields
  recommendation?: Pick<Recommendation, 'title' | 'recommendation_type'> | null
}

export type RecommendationFeedback = {
  id: string
  user_id: string
  recommendation_id: string
  feedback_type: FeedbackType
  reason: string | null
  recommendation_type: string | null
  related_budget_slug: string | null
  freedom_days_impact: number | null
  created_at: string
}

export const RECOMMENDATION_TYPE_LABELS: Record<RecommendationType, string> = {
  budget_optimization: 'Budget optimalisatie',
  asset_reallocation: 'Vermogen herschikken',
  debt_acceleration: 'Schuld versnellen',
  income_increase: 'Inkomen verhogen',
  savings_boost: 'Sparen versnellen',
}

export const RECOMMENDATION_TYPE_ICONS: Record<RecommendationType, string> = {
  budget_optimization: 'Sliders',
  asset_reallocation: 'ArrowRightLeft',
  debt_acceleration: 'Zap',
  income_increase: 'TrendingUp',
  savings_boost: 'PiggyBank',
}

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Open',
  postponed: 'Uitgesteld',
  completed: 'Afgerond',
  rejected: 'Geweigerd',
}

export const ACTION_SOURCE_LABELS: Record<ActionSource, string> = {
  ai: 'AI',
  manual: 'Handmatig',
  chat: 'Chat',
}

export function getRecommendationTypeColor(type: RecommendationType): {
  bg: string
  bgLight: string
  text: string
  border: string
} {
  switch (type) {
    case 'budget_optimization':
      return { bg: 'bg-teal-500', bgLight: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' }
    case 'asset_reallocation':
      return { bg: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' }
    case 'debt_acceleration':
      return { bg: 'bg-red-500', bgLight: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' }
    case 'income_increase':
      return { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' }
    case 'savings_boost':
      return { bg: 'bg-purple-500', bgLight: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' }
    default:
      return { bg: 'bg-teal-500', bgLight: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' }
  }
}

export function getActionStatusColor(status: ActionStatus): string {
  switch (status) {
    case 'open': return 'border-l-teal-500'
    case 'postponed': return 'border-l-amber-500'
    case 'completed': return 'border-l-emerald-500'
    case 'rejected': return 'border-l-red-300'
    default: return 'border-l-teal-500'
  }
}

export function getSourceBadgeClasses(source: ActionSource): string {
  switch (source) {
    case 'ai': return 'bg-teal-100 text-teal-700'
    case 'manual': return 'bg-zinc-100 text-zinc-700'
    case 'chat': return 'bg-teal-50 text-teal-600 ring-1 ring-teal-200'
    default: return 'bg-zinc-100 text-zinc-700'
  }
}
