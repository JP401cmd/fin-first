/**
 * Horizon-kernel — publieke API (barrel).
 *
 * Consumenten (de FASE 3-adapter, beheer-oppervlakken, hooks) importeren hiér;
 * de tabel-modules (`tables/*`) zijn intern — hun contract is de parity-suite
 * (ADR 0032), niet de app. `input-from-fixture` en `parity/*` zijn bewust NIET
 * geëxporteerd: dat is test-/oracle-gereedschap (node-only).
 */

// Kern: integrale forward-recursie + solver.
export { runKernelProjection } from './engine'
export type {
  KernelProjection,
  KernelProjectionOptions,
  KernelRunSummary,
} from './engine'
export { solveFire } from './solver'
export type { SolveFireResult, SolverStatus } from './solver'

// Gedeeld doelblok (P!B35–B38) — ook voor beheer-weergaven.
export {
  computeDoelblok,
  computeGap,
  eindMaandVan,
  eindleeftijdVan,
  prognoseI,
  prognoseJ,
} from './gap'
export type { Doelblok } from './gap'

// Onzekerheids-wrappers (scenarioband, deterministische Monte-Carlo, hist-stub).
export * from './wrappers/band'
export * from './wrappers/mc'
export * from './wrappers/hist'

// Input-contract (alle P/TS/bens/Geb/Auto-gebeurtenissen/PT/Werk/onzekerheid-blokken).
export type * from './types'
