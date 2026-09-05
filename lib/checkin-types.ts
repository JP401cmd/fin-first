/**
 * Type definitions for the Check-in system.
 *
 * These types are extracted from the API route files so they can be safely
 * imported by client-side code (regression tests, components) without pulling
 * in server-only dependencies.
 */

export interface CheckinSnapshot {
  reflection: string
  monthKey: string
  savedAt: string
  userId: string
  userName: string | null
  householdId: string | null
  metrics: {
    netWorth: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlySavings: number
    completedActions: number
    activeGoals: number
    fireAge: number | null
  }
  details?: {
    netWorthChange?: number
    freedomDaysWon?: number
    /** De maand waar de terugblik van deze check-in over ging, met zijn eigen
     *  vergelijkingsbasis. `metrics` hierboven draagt de LOPENDE maand op het
     *  moment van opslaan; deze velden de afgeronde maand ervoor (B-016). */
    prevMonthIncome?: number
    prevMonthExpenses?: number
    prevMonthSavings?: number
    monthBeforePrevExpenses?: number
    assets?: { name: string; type: string; value: number }[]
    debts?: { name: string; type: string; balance: number }[]
    goals?: { name: string; current: number; target: number; completed: boolean; icon?: string | null }[]
    budgets?: { name: string; icon: string | null; limit: number; spent: number }[]
  }
}

export interface Aandachtspunt {
  id: string
  type: 'budget_over' | 'unexpected_expense' | 'goal_overdue' | 'goal_behind'
  title: string
  description: string
  /** Impact in freedom days (optional) */
  freedomDays?: number
  /** Severity: high = needs immediate attention, medium = worth discussing */
  severity: 'high' | 'medium'
}

export interface GesprekStarterData {
  id: string
  /** The conversation starter question */
  vraag: string
  /** Short context explaining the data trend behind this starter */
  context: string
  /** A concrete action suggestion */
  actie: string
  /** Sentiment: positive / neutral / alert */
  sentiment: 'positive' | 'neutral' | 'alert'
  /** The freedom-time framing (optional) */
  vrijheidstijd?: string
}
