/**
 * Horizon grootboek-engine — publieke API.
 *
 * Tabel-georiënteerde FIRE-rekenmotor (Fase 1). Zie
 * docs/horizon-tabel-rekenmotor-plan.md.
 */

export type {
  Fase,
  AssetBeweging,
  SchuldBeweging,
  LedgerEvent,
  LedgerRow,
  TypeRollup,
  HorizonLedgerResult,
} from './types'
export {
  type SurplusStrategy,
  type ShortfallStrategy,
  type HorizonStrategyOptions,
  DEFAULT_STRATEGY_OPTIONS,
  DEFAULT_WITHDRAWAL_ORDER,
  INVESTABLE_TYPES,
} from './strategies'
export { runHorizonLedger } from './engine'
export { buildChartSeries, keyAges, rollupByType, type ChartSeries } from './views'
export { ledgerToUnifiedResult } from './adapter'
export { runSelectedProjection } from './select'
export { isHorizonV2Enabled, HORIZON_V2_FLAG } from './flag'
export { compareEngines, type EngineDiff, type EngineAgePoint } from './compare'
