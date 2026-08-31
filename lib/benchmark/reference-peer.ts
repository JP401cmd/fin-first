/**
 * Gemodelleerde referentie-peer — de kern van de benchmark voor de twee maten
 * waarvoor géén officiële statistiek bestaat: de **gezondheidsscore** (app-eigen
 * samengestelde maat) en de **vrijheidsleeftijd** (modeluitkomst).
 *
 * Aanpak: stel uit de cohort-mediane CBS/Nibud-invoer (vermogen, inkomen, spaarquote,
 * leeftijd) een synthetische "typische peer" samen en draai die door **dezelfde
 * canonieke rekenmotoren** als de gebruiker zelf — `computeFireProjection` en
 * `computeHealthScoreFromInputs`. Zo is de vergelijking appels-met-appels en herrekenen
 * we niets: één bron van waarheid voor de formules (CLAUDE.md: *consume, don't recompute*).
 *
 * De uitkomst is bewust `tier: 'modelled'` — een typische peer, geen gemeten gemiddelde
 * score. Sommige invoer (noodfonds-maanden, schuldlast) is een transparante aanname.
 */

import type { FinancialInput } from '@/lib/horizon-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { computeHealthScoreFromInputs, type HealthScoreInput } from '@/lib/financial-health'
import type { CohortReference } from './nl-reference'

/** Aannames voor de peer die niet uit CBS komen (transparant, indicatief). */
const PEER_EMERGENCY_FUND_MONTHS = 3 // plausibele NL-buffer; concentratie/budget blijven inactief

/**
 * Eind-leeftijd voor de vrijheidsleeftijd van de peer. Een typisch huishouden
 * bouwt zijn vermogen af over de pensioenjaren (spend-down) i.p.v. het eeuwig
 * in stand te houden — dat is realistischer dan de eeuwigdurende (perpetual)
 * default, die voor een mediaan huishouden een onhaalbaar groot doel (≈34×
 * uitgaven) oplevert en de leeftijd richting de 80 duwt. 90 = de app-default
 * (`DEFAULT_FIRE_STRATEGY.endAge` / `profiles.fire_end_age`). Géén AOW/pensioen
 * in het spel — puur een afbouw-aanname.
 */
const PEER_FIRE_END_AGE = 90

export interface ReferencePeerResult {
  /** Gemodelleerde gezondheidsscore (0–100) van een typische peer. */
  healthScoreTotal: number
  /** Gemodelleerde vrijheidsleeftijd (fractioneel), of null als niet bereikbaar/zonder leeftijd. */
  fireAge: number | null
  /** Bijbehorend vrijheids-% (consistent met de FIRE-projectie). */
  freedomPct: number
}

/**
 * Bouw en evalueer de referentie-peer.
 * @param ref       cohort-referentiewaarden (mediaan vermogen/inkomen, spaarquote)
 * @param midAge    midden-leeftijd van de cohort-band (voor synthetische geboortedatum)
 * @param now       injecteerbaar "vandaag" voor deterministische tests
 */
export function computeReferencePeer(
  ref: CohortReference,
  midAge: number,
  now: Date = new Date(),
): ReferencePeerResult {
  const monthlyIncome = ref.incomeMedian / 12
  const monthlySavings = monthlyIncome * (ref.savingsRatePct / 100)
  const monthlyExpenses = Math.max(0, monthlyIncome - monthlySavings)

  // Synthetische geboortedatum zodat de motor currentAge = midAge afleidt.
  const dob = new Date(now.getFullYear() - midAge, now.getMonth(), now.getDate())
  const dateOfBirth = dob.toISOString().split('T')[0]

  const fin: FinancialInput = {
    totalAssets: ref.netWorthMedian,
    totalDebts: 0,
    monthlyIncome,
    monthlyExpenses,
    yearlyMustExpenses: 0,
    monthlyContributions: monthlySavings,
    dateOfBirth,
  }

  // Canonieke FIRE-projectie met de app-default-aannames (rendement/SWR/inflatie),
  // mét spend-down tot eind-leeftijd (deplete) i.p.v. eeuwigdurend — zie PEER_FIRE_END_AGE.
  // Via de scalar-router (kernel-only; de tijd-velden komen uit de horizon-kernel).
  const proj = computeScalarFireProjection({
    input: fin,
    strategyOptions: { strategy: 'deplete', endAge: PEER_FIRE_END_AGE },
  }).result

  // Canonieke gezondheidsscore op dezelfde peer-invoer.
  const hsInput: HealthScoreInput = {
    savingsRate6m: ref.savingsRatePct,
    totalAssets: ref.netWorthMedian,
    totalDebts: 0,
    emergencyFundMonths: PEER_EMERGENCY_FUND_MONTHS,
    freedomPct: proj.freedomPercentage,
    // De peer wordt langs dezelfde peer-relatieve fire_progress-maat gelegd
    // als de gebruiker — anders vergelijkt /check twee verschillende scores.
    currentAge: midAge,
    fireAgeFractional: proj.fireAge,
    netMonthlyIncome: monthlyIncome,
    debtMonthlyPayments: 0,
    largestAssetTypeShare: null, // concentratie-pijler inactief voor de peer
    budgetCategories: [],         // budgetdiscipline-pijler inactief voor de peer
  }
  const health = computeHealthScoreFromInputs(hsInput, false)

  return {
    healthScoreTotal: health.total,
    fireAge: proj.fireAge,
    freedomPct: proj.freedomPercentage,
  }
}
