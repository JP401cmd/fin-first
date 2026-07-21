import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

/**
 * Detect if slider changes are significant enough to trigger AI suggestions.
 * Returns true when any threshold is exceeded.
 */
export function isSignificantDelta(
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
  fireAgeDelta: number | null,
): boolean {
  // Primary: FIRE age shifted by 1+ years (measures *effect*)
  if (fireAgeDelta !== null && Math.abs(fireAgeDelta) >= 1.0) return true

  // Income changed >10%
  if (baseline.monthlyIncome > 0) {
    const incomePct = Math.abs(overrides.monthlyIncome - baseline.monthlyIncome) / baseline.monthlyIncome
    if (incomePct > 0.10) return true
  }

  // Work days changed by 1+
  if (Math.abs(overrides.workDaysPerWeek - baseline.workDaysPerWeek) >= 1) return true

  // Savings rate changed by 5+ percentage points
  if (Math.abs(overrides.savingsRate - baseline.savingsRate) >= 5) return true

  // Extra contribution >= 200/month
  if (overrides.extraContribution >= 200) return true

  return false
}

/**
 * Build prompt context for AI suggestion generation.
 */
export function buildSuggestionPrompt(context: {
  overrides: WhatIfOverrides
  baseline: WhatIfOverrides
  fireAgeDelta: number | null
  activeEventNames: string[]
}): string {
  const { overrides, baseline, fireAgeDelta, activeEventNames } = context

  const changes: string[] = []

  const incomeDelta = overrides.monthlyIncome - baseline.monthlyIncome
  if (Math.abs(incomeDelta) > 50) {
    changes.push(`Inkomen: ${incomeDelta > 0 ? '+' : ''}€${Math.round(incomeDelta)}/mnd`)
  }

  if (overrides.workDaysPerWeek !== baseline.workDaysPerWeek) {
    changes.push(`Werkdagen: ${baseline.workDaysPerWeek} → ${overrides.workDaysPerWeek} dagen/week`)
  }

  const savingsRateDelta = overrides.savingsRate - baseline.savingsRate
  if (Math.abs(savingsRateDelta) > 1) {
    changes.push(`Spaarquote: ${savingsRateDelta > 0 ? '+' : ''}${Math.round(savingsRateDelta)}pp`)
  }

  if (overrides.extraContribution > 0) {
    changes.push(`Extra inleg: €${Math.round(overrides.extraContribution)}/mnd`)
  }

  const returnDelta = overrides.expectedReturn - baseline.expectedReturn
  if (Math.abs(returnDelta) > 0.5) {
    changes.push(`Rendement: ${returnDelta > 0 ? '+' : ''}${returnDelta.toFixed(1)}%`)
  }

  if (fireAgeDelta !== null) {
    const months = Math.round(fireAgeDelta * 12)
    changes.push(`FIRE-leeftijd effect: ${months > 0 ? '+' : ''}${months} maanden`)
  }

  return [
    'De gebruiker past een wat-als scenario aan met de volgende wijzigingen:',
    ...changes.map(c => `- ${c}`),
    '',
    activeEventNames.length > 0
      ? `Al actieve events: ${activeEventNames.join(', ')}`
      : 'Geen levensgebeurtenissen actief.',
    '',
    'Suggereer 1-3 levensgebeurtenissen die logisch passen bij deze wijzigingen.',
    'Denk aan: consequenties van de wijzigingen (minder werken → meer vrije tijd → hobby/reizen?),',
    'of events die de gebruiker misschien vergeet mee te nemen.',
    'Gebruik ALLEEN types uit: sabbatical, world_trip, children, renovation, study, career_change,',
    'part_time, early_retirement, house_purchase, house_sale, wedding, move, car_purchase,',
    'inheritance, side_hustle, werkloosheid, schenking, custom.',
    'Geef realistische bedragen in euro voor Nederlandse context.',
  ].join('\n')
}
