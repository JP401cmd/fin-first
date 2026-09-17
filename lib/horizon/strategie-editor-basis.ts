/**
 * De basisgegevens van de levensstrategie-editors (AOW, werk, pensioen) — één home voor de
 * twee plekken waar die editors renderen: /toekomst/voorkeuren (sinds 17 sep 2026; de
 * server-opbouw staat in `strategie-editors-data.ts`) en de plan-review-wizard
 * (TPR-15 stap 3). Zo toont hetzelfde formulier op beide plekken dezelfde leeftijd, dezelfde
 * werk-prefill en dezelfde vrijheidstijd-framing. Pure module; de lezing zelf doet de loader.
 */

import { ageAtDate } from '@/lib/horizon-data'
import type { FinancialInput } from '@/lib/core-metrics'

/** Kolommen van de `aow_leeftijd`-tabel die `lookupAowAge` leest. */
export const AOW_LEEFTIJD_KOLOMMEN = 'id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source'

export interface StrategieEditorBasis {
  dateOfBirth: string | null
  /** Huidige leeftijd uit de geboortedatum, afgerond; `null` = onbekend. */
  currentAge: number | null
  /** Netto maandinkomen voor de werk-prefill: 6-maands transactie-inkomen, anders ~65% van het bruto-profiel. */
  currentNetMonthly: number
  /** Must-uitgaven per dag, voor de vrijheidstijd-framing (0 = niet tonen). */
  dailyExpenses: number
}

export function strategieEditorBasis(raw: {
  effectiveInput: Pick<FinancialInput, 'dateOfBirth' | 'monthlyIncome' | 'yearlyMustExpenses'>
  avgIncome6m: number
}): StrategieEditorBasis {
  const ei = raw.effectiveInput
  const dateOfBirth = ei?.dateOfBirth ?? null
  return {
    dateOfBirth,
    currentAge: dateOfBirth ? Math.round(ageAtDate(dateOfBirth)) : null,
    currentNetMonthly: Math.round(raw.avgIncome6m > 0 ? raw.avgIncome6m : (ei.monthlyIncome ?? 0) * 0.65),
    dailyExpenses: ei.yearlyMustExpenses > 0 ? ei.yearlyMustExpenses / 365 : 0,
  }
}
