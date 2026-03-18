/**
 * Withdrawal Strategy types and resolver — single source of truth.
 *
 * Vier strategieën:
 * 1. static  — Vaste onttrekking (klassieke SWR, bijv. 4% regel)
 * 2. guardrails — Guyton-Klinger guardrails: verlaag/verhoog onttrekking
 *    op basis van portfolioprestatie, begrensd door floor en ceiling
 * 3. vpw  — Variable Percentage Withdrawal: jaarlijks herberekend %
 *    op basis van resterende levensverwachting en portfoliowaarde
 * 4. bucket — Bucket-strategie: 3 emmers (cash/bonds/equity) met
 *    hervulling vanuit groei-emmer
 *
 * Dit bestand bevat ALLEEN types, defaults en een resolver.
 * Geen simulatie- of berekeningslogica.
 */

// ── Types ────────────────────────────────────────────────────────────

export type WithdrawalStrategyType = 'static' | 'guardrails' | 'vpw' | 'bucket'

export interface WithdrawalStrategyConfig {
  strategy: WithdrawalStrategyType
  /** Minimale onttrekking als fractie van basis (alleen guardrails) */
  guardrailFloor: number
  /** Maximale onttrekking als fractie van basis (alleen guardrails) */
  guardrailCeiling: number
  /** Verlagingsstap bij slechte returns (alleen guardrails) */
  guardrailCutStep: number
  /** Verhogingsstap bij goede returns (alleen guardrails) */
  guardrailRaiseStep: number
}

// ── Defaults ─────────────────────────────────────────────────────────

export const WITHDRAWAL_DEFAULTS: WithdrawalStrategyConfig = {
  strategy: 'static',
  guardrailFloor: 0.80,
  guardrailCeiling: 1.20,
  guardrailCutStep: 0.10,
  guardrailRaiseStep: 0.10,
} as const

// ── Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve withdrawal strategy config from user profile.
 * Falls back to WITHDRAWAL_DEFAULTS for any missing/null field.
 */
export function resolveWithdrawalStrategy(profile: {
  withdrawal_strategy?: string | null
  guardrail_floor?: number | null
  guardrail_ceiling?: number | null
  guardrail_cut_step?: number | null
  guardrail_raise_step?: number | null
}): WithdrawalStrategyConfig {
  const validStrategies: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']

  const strategy: WithdrawalStrategyType =
    validStrategies.includes(profile.withdrawal_strategy as WithdrawalStrategyType)
      ? (profile.withdrawal_strategy as WithdrawalStrategyType)
      : WITHDRAWAL_DEFAULTS.strategy

  return {
    strategy,
    guardrailFloor: profile.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrailCeiling: profile.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrailCutStep: profile.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrailRaiseStep: profile.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  }
}
