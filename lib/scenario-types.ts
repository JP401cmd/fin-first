// ── Shared scenario types and constants ──────────────────────────────────────
// Extracted from app/api/scenarios/route.ts so client components can import
// without pulling in server-only dependencies (next/headers).

export const WHATIF_SCENARIO_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#10b981', label: 'Smaragd' },
  { hex: '#ef4444', label: 'Robijn' },
  { hex: '#8b5cf6', label: 'Violet' },
] as const

export interface SavedScenario {
  id: string
  name: string
  createdAt: string
  overrides: {
    monthlyIncome: number
    workDaysPerWeek: number
    savingsRate: number
    expectedReturn: number
    extraContribution: number
  }
  events: Array<{
    id: string
    name: string
    event_type: string
    target_age: number | null
    one_time_cost: number | string | null
    monthly_cost_change: number | string | null
    monthly_income_change: number | string | null
    duration_months: number | null
    whatIfDisabled?: boolean
    metadata?: Record<string, unknown>
  }>
  fireAge: number | null
  colorIndex: number
}
