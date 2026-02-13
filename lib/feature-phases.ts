// ── Feature-Phase Matrix ─────────────────────────────────────
// Defines which app features are available per sovereignty phase.

export interface Phase {
  id: string
  label: string
  color: string       // Tailwind color name
  levels: number[]
}

export interface FeatureDef {
  id: string
  label: string
  description: string
}

export type FeaturePhaseMatrix = Record<string, Record<string, boolean>>

export const PHASES: Phase[] = [
  { id: 'recovery',  label: 'Recovery',  color: 'rose',  levels: [-2, -1, 0] },
  { id: 'stability', label: 'Stability', color: 'blue',  levels: [1, 2] },
  { id: 'momentum',  label: 'Momentum',  color: 'teal',  levels: [3, 4] },
  { id: 'mastery',   label: 'Mastery',   color: 'amber', levels: [5, 6] },
]

export const FEATURES: FeatureDef[] = [
  { id: 'nibud_benchmark',      label: 'NIBUD Benchmark',        description: 'Vergelijking met NIBUD richtlijnen' },
  { id: 'box3_belasting',       label: 'Box 3 Belasting',        description: 'Vermogensbelasting berekening' },
  { id: 'budget_optimalisatie', label: 'Budget Optimalisatie',    description: 'Slimmer omgaan met uitgaven' },
  { id: 'schulden_aflosplan',   label: 'Schulden Aflosplan',     description: 'Strategisch schulden aflossen' },
  { id: 'asset_allocatie',      label: 'Asset Allocatie',        description: 'Beleggingsportfolio verdeling' },
  { id: 'fire_projecties',      label: 'FIRE Projecties',        description: 'Financiele onafhankelijkheid berekenen' },
  { id: 'monte_carlo',          label: 'Monte Carlo Simulaties', description: 'Scenario-analyse met kansverdelingen' },
  { id: 'levensgebeurtenissen', label: 'Levensgebeurtenissen',   description: 'Impact van life events op plan' },
  { id: 'withdrawal_strategie', label: 'Withdrawal Strategieen', description: 'Onttrekkingsplan bij/na FIRE' },
  // Horizon
  { id: 'veerkracht_score',         label: 'Veerkracht Analyse',          description: 'Resilience score 0-100 met breakdown' },
  { id: 'vermogensprojectie_chart', label: 'Vermogensprojectie',          description: '30-jaar netto vermogensgroei grafiek' },
  { id: 'fire_scenario_analyse',    label: 'Scenario Analyse',            description: 'Divergerende paden (drifter/koers/optimizer) + marktweerselectie' },
  { id: 'fire_geavanceerde_params', label: 'Geavanceerde FIRE Parameters', description: 'SWR, rendement, inflatie sliders in ProjectionsModal' },
  // Kern
  { id: 'vermogensverloop',         label: 'Vermogensverloop',            description: 'Net worth snapshots + historische grafiek' },
  { id: 'snapshot_vergelijking',    label: 'Snapshot Vergelijking',       description: 'Side-by-side vergelijking laatste 2 snapshots' },
  { id: 'cashflow_sankey',          label: 'Cashflow Diagram',            description: 'Sankey inkomen→budget flow visualisatie' },
  { id: 'data_export',              label: 'Data Export',                 description: 'CSV export van transacties, budgetten, vermogen, assets, schulden, doelen' },
  // Wil
  { id: 'doelen_systeem',           label: 'Doelen Systeem',              description: 'Financiele doelen instellen, voortgang volgen, ETA-berekening' },
  { id: 'beslissingspatronen',      label: 'Beslissingspatronen',         description: 'Bar chart met vrijheidsdagen per actie-type + impact-analyse' },
]

/**
 * Compute sovereignty level from financial data.
 * Levels range from -2 (Time Deficit) to 6 (Timeless).
 */
export function computeSovereigntyLevel(
  netWorth: number,
  monthlyExpenses: number,
  freedomPercentage: number,
  hasConsumerDebt: boolean,
): number {
  if (monthlyExpenses <= 0) return 0

  const monthsCovered = netWorth / monthlyExpenses

  // Negative net worth
  if (netWorth < 0) {
    return hasConsumerDebt ? -2 : -1
  }

  // Around zero (less than 1 month covered)
  if (monthsCovered < 1) return 0

  // Positive but less than 3 months (no emergency fund yet)
  if (monthsCovered < 3) return 1

  // Emergency fund built (3-6 months)
  if (monthsCovered < 6 || freedomPercentage < 10) return 2

  // Investments growing, freedom 10-25%
  if (freedomPercentage < 25) return 3

  // Coast FIRE territory, freedom 25-75%
  if (freedomPercentage < 75) return 4

  // Near independence, freedom 75-100%
  if (freedomPercentage < 100) return 5

  // Full financial independence
  return 6
}

/**
 * Map a sovereignty level (-2..6) to a phase id (recovery/stability/momentum/mastery).
 */
export function levelToPhaseId(level: number): string {
  for (const phase of PHASES) {
    if (phase.levels.includes(level)) return phase.id
  }
  return PHASES[0].id
}

export const DEFAULT_MATRIX: FeaturePhaseMatrix = {
  nibud_benchmark:      { recovery: true,  stability: true,  momentum: true,  mastery: false },
  box3_belasting:       { recovery: false, stability: true,  momentum: true,  mastery: true },
  budget_optimalisatie: { recovery: true,  stability: true,  momentum: true,  mastery: true },
  schulden_aflosplan:   { recovery: true,  stability: true,  momentum: false, mastery: false },
  asset_allocatie:      { recovery: false, stability: false, momentum: true,  mastery: true },
  fire_projecties:      { recovery: false, stability: true,  momentum: true,  mastery: true },
  monte_carlo:          { recovery: false, stability: false, momentum: true,  mastery: true },
  levensgebeurtenissen: { recovery: false, stability: true,  momentum: true,  mastery: true },
  withdrawal_strategie:      { recovery: false, stability: false, momentum: false, mastery: true },
  // Horizon
  veerkracht_score:          { recovery: false, stability: true,  momentum: true,  mastery: true },
  vermogensprojectie_chart:  { recovery: false, stability: true,  momentum: true,  mastery: true },
  fire_scenario_analyse:     { recovery: false, stability: false, momentum: true,  mastery: true },
  fire_geavanceerde_params:  { recovery: false, stability: false, momentum: true,  mastery: true },
  // Kern
  vermogensverloop:          { recovery: false, stability: true,  momentum: true,  mastery: true },
  snapshot_vergelijking:     { recovery: false, stability: false, momentum: true,  mastery: true },
  cashflow_sankey:           { recovery: false, stability: true,  momentum: true,  mastery: true },
  data_export:               { recovery: false, stability: false, momentum: true,  mastery: true },
  // Wil
  doelen_systeem:            { recovery: false, stability: true,  momentum: true,  mastery: true },
  beslissingspatronen:       { recovery: false, stability: false, momentum: true,  mastery: true },
}
