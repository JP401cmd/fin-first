/**
 * Goal types, labels, and progress helpers for the Will module.
 */

export type GoalType = 'savings' | 'debt_payoff' | 'net_worth' | 'freedom_days'

export type Goal = {
  id: string
  user_id: string
  name: string
  description: string | null
  goal_type: GoalType
  target_value: number
  current_value: number
  target_date: string | null
  linked_asset_id: string | null
  linked_debt_id: string | null
  icon: string
  color: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: 'Spaardoel',
  debt_payoff: 'Schuld aflossen',
  net_worth: 'Netto vermogen',
  freedom_days: 'Vrijheidsdagen',
}

export const GOAL_TYPE_ICONS: Record<GoalType, string> = {
  savings: 'PiggyBank',
  debt_payoff: 'CreditCard',
  net_worth: 'TrendingUp',
  freedom_days: 'Sun',
}

export const GOAL_COLORS = [
  { value: 'teal', label: 'Teal', class: 'bg-teal-500' },
  { value: 'amber', label: 'Amber', class: 'bg-amber-500' },
  { value: 'purple', label: 'Paars', class: 'bg-purple-500' },
  { value: 'emerald', label: 'Groen', class: 'bg-emerald-500' },
  { value: 'red', label: 'Rood', class: 'bg-red-500' },
  { value: 'blue', label: 'Blauw', class: 'bg-blue-500' },
]

/**
 * Compute goal progress.
 * For debt_payoff, progress = how much has been paid off.
 * For freedom_days, current value is free days per year.
 */
export function computeGoalProgress(goal: Goal): {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
} {
  const current = Number(goal.current_value)
  const target = Number(goal.target_value)

  if (target <= 0) return { current, target, pct: 0, onTrack: false, eta: null }

  const pct = Math.min(Math.round((current / target) * 100), 100)

  // Estimate ETA based on target_date
  let onTrack = true
  let eta: string | null = null

  if (goal.target_date) {
    const targetDate = new Date(goal.target_date)
    const now = new Date()
    const daysLeft = Math.max(0, (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const totalDays = (targetDate.getTime() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24)

    if (totalDays > 0 && daysLeft > 0) {
      const expectedPct = ((totalDays - daysLeft) / totalDays) * 100
      onTrack = pct >= expectedPct * 0.9 // 10% tolerance
    }

    eta = targetDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  }

  return { current, target, pct, onTrack, eta }
}

/**
 * Get the color classes for a goal color string.
 */
export function getGoalColorClasses(color: string): {
  bg: string
  bgLight: string
  text: string
  border: string
  bar: string
} {
  switch (color) {
    case 'amber':
      return { bg: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', bar: 'bg-amber-500' }
    case 'purple':
      return { bg: 'bg-purple-500', bgLight: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', bar: 'bg-purple-500' }
    case 'emerald':
      return { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', bar: 'bg-emerald-500' }
    case 'red':
      return { bg: 'bg-red-500', bgLight: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', bar: 'bg-red-500' }
    case 'blue':
      return { bg: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', bar: 'bg-blue-500' }
    case 'teal':
    default:
      return { bg: 'bg-teal-500', bgLight: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200', bar: 'bg-teal-500' }
  }
}
