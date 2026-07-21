/**
 * Horizon calculation engine — BARREL (re-export).
 *
 * De implementatie is opgesplitst in cohesieve modules onder lib/horizon/:
 *  - life-events-catalog.ts  catalogi, cashflow-catalog, per-event metadata, marktweer
 *  - schenk-erf-belasting.ts  Nederlandse schenk- & erfbelasting
 *  - fire-format.ts           leeftijd-/FIRE-formatteringshelpers
 *  - fire-scalar.ts           LIVE scalar FIRE-helpers (hergebruikt door de horizon-kernel)
 *  - fire-sim-legacy.ts       losse simulatie-motoren (forward/scenario/MC/withdrawal/backtest)
 *
 * Dit bestand blijft een dunne barrel zodat alle bestaande importers van
 * '@/lib/horizon-data' ongewijzigd werken (pure move — zie Notion "horizon-data splitsen").
 * Voeg hier geen rekenlogica toe; die hoort in de modules hierboven.
 */

// Constants (canonieke bron: lib/constants.ts) — re-export voor backward compat.
export {
  SWR,
  DEFAULT_RETURN,
  DEFAULT_VOLATILITY,
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  INFLATION,
  NL_FICTIEF_BELEGGINGEN,
  BOX3_TARIEF,
  BOX3_DRAG,
  NL_INFLATIE,
  NL_SWR,
  NL_MULTIPLIER,
  CLASSIC_MULTIPLIER,
} from './constants'

export type { FinancialInput } from './core-metrics'

export * from './horizon/life-events-catalog'
export * from './horizon/schenk-erf-belasting'
export * from './horizon/fire-format'
export * from './horizon/fire-scalar'
export * from './horizon/fire-sim-legacy'
