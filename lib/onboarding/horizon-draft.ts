import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { FireEndStrategy, StopAnchorKind } from '@/lib/fire-strategy'

/**
 * Het horizon-deel van de onboarding-state: het concept-plan dat de orchestrator
 * (`app/(onboarding)/onboarding/page.tsx`) bijhoudt, de stap "Jouw plan"
 * (`components/onboarding/onboarding-eindstrategie.tsx`) invult en de
 * draft-persistentie bewaart.
 *
 * Verhuisd uit het niet meer gemounte `components/onboarding/onboarding-horizon.tsx`
 * (TPR-13): het component verdween, de vorm van de state niet. Puur types en
 * de beginwaarde — geen UI, geen berekening.
 */

export interface LifeEventEntry {
  name: string
  event_type: string
  target_age: number
  monthly_income_change?: number
  monthly_cost_change?: number
  one_time_cost?: number
  duration_months?: number
  is_active: boolean
}

export interface HorizonData {
  /**
   * De EIND-VORM van het plan (ADR 0129). De stap "Jouw plan" schrijft hier
   * uitsluitend `deplete` · `legacy` · `perpetual`; de legacy-labels
   * `pensioen`/`nu-stoppen` zijn ankers en komen uit de onboarding niet meer
   * (de draft-persistentie vertaalt een oud concept naar `fire_stop_anchor`).
   * Het type blijft de brede enum zodat een oud bewaard concept nog leesbaar is.
   */
  fire_end_strategy: FireEndStrategy
  fire_end_age: number                // 50-120, default 90
  fire_legacy_amount: string
  /** Het STOP-ANKER (ADR 0129): wanneer stopt het werken. Default `solved`. */
  fire_stop_anchor: StopAnchorKind
  /** Alleen bij `fire_stop_anchor === 'age'`; halve jaren, 18–100. Anders `null`. */
  fire_stop_age: number | null
  retirement_expense_method: RetirementExpenseMethod
  retirement_custom_amount: string
  temporal_balance: number            // 1-5, default 3
  life_events: LifeEventEntry[]
}

export const INITIAL_HORIZON_DATA: HorizonData = {
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: '',
  fire_stop_anchor: 'solved',
  fire_stop_age: null,
  retirement_expense_method: 'current_income',
  retirement_custom_amount: '',
  temporal_balance: 3,
  life_events: [],
}
