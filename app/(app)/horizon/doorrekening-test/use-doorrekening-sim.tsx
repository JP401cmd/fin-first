'use client'

/**
 * Reference-implementation — runSimulation-wrapper voor de doorrekening-test-sub-pages.
 *
 * **Gebruik alleen voor vergelijking of in sub-pagina's die nog niet op
 * `calc/` zijn overgestapt.** Overzicht gebruikt sinds Fase 2c
 * `calc/opbouw-projection` + `calc/afbouw-projection` (+ `calc/intersection`)
 * als canonical, en opbouw-client leunt sinds Fase 4 op
 * `computeOpbouwProjection` voor de netto-totalen (de "Fase D"-override van
 * `netTotals` is daar verwijderd). Deze hook blijft beschikbaar voor:
 *
 *  1. Gebeurtenissen-client + afbouw-client — nog niet gemigreerd naar de
 *     eigen calc-modules.
 *  2. Het (optionele) dev-diff-panel op overzicht dat de aggregatie kan
 *     vergelijken met productie-runSimulation om divergenties te spotten.
 *  3. Het kruispunt (`sim.fireAge`) in opbouw-client, totdat daar een eigen
 *     `findIntersection`-wiring is toegevoegd (TODO-comment bij de
 *     aanroepsite).
 *
 * Geen gedragswijziging aan de hook zelf — alleen status-wijziging qua rol.
 * Draait `runSimulation()` met de instellingen uit de layout-Context en alle
 * canonieke inputs (profile, life events, weighted return, retirement-uitgaven).
 */

import { useMemo } from 'react'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimCashflow,
  type SimResult,
} from '@/lib/fire-simulation'
import type { FireParams } from '@/lib/fire-params'
import type { LifeEvent } from '@/lib/horizon-data'
import type { WithdrawalStrategyType } from '@/lib/withdrawal-strategy'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { useDoorrekeningSettings, type WithdrawalStrategy } from './settings-context'

export interface DoorrekeningSimInputs {
  currentAge: number
  netWorth: number
  monthlyIncome: number
  /** Spaarquote in procenten (0-100). */
  savingsRate: number
  /** Jaarlijkse essentiële budgetten — input voor computeRetirementExpenses. */
  yearlyMustExpenses: number
  /** Geschat jaarinkomen uit core — gebruikt bij retirement-methode 'current_income'. */
  estimatedYearlyIncome: number
  /** Gewogen portfolio-return (bijv. 0.06). */
  weightedGrossReturn: number
  fireParams: FireParams
  lifeEvents: LifeEvent[]
  /** Optioneel: vooraf berekende cashflows. Als leeg, worden ze afgeleid uit lifeEvents. */
  cashflows?: SimCashflow[]
  /** Fractionele AOW-leeftijd uit `lookupAowAge`. */
  userAowAge: number
  profile: Record<string, unknown>
}

/** UI-key naar canonieke lib/withdrawal-strategy-key. */
function mapWithdrawalKey(ui: WithdrawalStrategy): WithdrawalStrategyType {
  return ui === 'swr' ? 'static' : ui
}

export function useDoorrekeningSim(inputs: DoorrekeningSimInputs): SimResult {
  const s = useDoorrekeningSettings()

  return useMemo(() => {
    const retirementMethod = (inputs.profile?.retirement_expense_method as RetirementExpenseMethod | undefined)
      ?? 'essential_budgets'
    const retirementCustomAmount = Number(inputs.profile?.retirement_expense_custom_amount ?? 0)
    const estimatedMonthlyExpenses = Number(inputs.profile?.estimated_monthly_expenses ?? 0)

    const yearlyRetirementExpenses = computeRetirementExpenses(
      retirementMethod,
      inputs.yearlyMustExpenses,
      inputs.monthlyIncome * 12,
      retirementCustomAmount,
      estimatedMonthlyExpenses * 12,
    )

    // Pensioen-modus: display tot 100 zodat onttrekking na AOW zichtbaar blijft.
    // Andere strategieën: user-eindleeftijd is de horizon.
    const displayEndAge = s.endStrategy === 'pensioen' ? 100 : s.endAge
    const annualSavings = inputs.monthlyIncome * (inputs.savingsRate / 100) * 12

    const cashflows = inputs.cashflows && inputs.cashflows.length > 0
      ? inputs.cashflows
      : lifeEventsToCashflows(inputs.lifeEvents)

    return runSimulation(
      inputs.currentAge,
      displayEndAge,
      inputs.netWorth,
      yearlyRetirementExpenses,
      annualSavings,
      inputs.weightedGrossReturn,
      'nl_box3',
      inputs.fireParams.inflationRate,
      cashflows,
      { strategy: s.endStrategy, endAge: s.endAge, legacyAmount: s.legacyAmount },
      {
        strategy: mapWithdrawalKey(s.withdrawalStrategy),
        guardrailFloor: 0.8,
        guardrailCeiling: 1.2,
        guardrailCutStep: 0.1,
        guardrailRaiseStep: 0.1,
      },
      s.endStrategy === 'pensioen' ? inputs.userAowAge : undefined,
    )
  }, [
    s.endStrategy,
    s.endAge,
    s.legacyAmount,
    s.withdrawalStrategy,
    inputs.currentAge,
    inputs.netWorth,
    inputs.monthlyIncome,
    inputs.savingsRate,
    inputs.yearlyMustExpenses,
    inputs.weightedGrossReturn,
    inputs.fireParams.inflationRate,
    inputs.lifeEvents,
    inputs.cashflows,
    inputs.userAowAge,
    inputs.profile,
  ])
}
