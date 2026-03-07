// ── Feature-Phase Matrix ─────────────────────────────────────
// Defines which app features are available per sovereignty phase.

export interface Phase {
  id: string
  label: string
  color: string       // Tailwind color name (legacy, kept for backward compat)
  cssName: string     // CSS variable key, e.g. 'phase_recovery'
  levels: number[]
}

export interface FeatureDef {
  id: string
  label: string
  description: string
}

export type FeaturePhaseMatrix = Record<string, Record<string, boolean>>

export const PHASES: Phase[] = [
  { id: 'recovery',  label: 'Recovery',  color: 'rose',  cssName: 'phase_recovery',  levels: [-2, -1, 0] },
  { id: 'stability', label: 'Stability', color: 'blue',  cssName: 'phase_stability', levels: [1, 2] },
  { id: 'momentum',  label: 'Momentum',  color: 'teal',  cssName: 'phase_momentum',  levels: [3, 4] },
  { id: 'mastery',   label: 'Mastery',   color: 'amber', cssName: 'phase_mastery',   levels: [5, 6] },
]

export const FEATURES: FeatureDef[] = [
  { id: 'nibud_benchmark',      label: 'NIBUD Benchmark',        description: 'Vergelijking met NIBUD richtlijnen' },
  // Widget sovereignty gates
  { id: 'widget_assets',      label: 'Vermogen Widget',        description: 'Assets widget op dashboard' },
  { id: 'widget_belasting',   label: 'Box 3 Widget',           description: 'Belasting widget op dashboard' },
  { id: 'widget_holdings',    label: 'Beleggingen Widget',     description: 'Holdings widget op dashboard' },
  { id: 'widget_monte_carlo',    label: 'Monte Carlo Widget',     description: 'Monte Carlo widget op dashboard' },
  { id: 'widget_passief_inkomen', label: 'Passief Inkomen Widget', description: 'Passieve inkomsten vs. FIRE-doel widget' },
  { id: 'widget_box3_drag',       label: 'Box 3 Belastingdrag Widget', description: 'Jaarlijkse Box 3-belasting in euro en vrijheidsdagen widget' },
  { id: 'widget_vrijheidsmijlpalen', label: 'Vrijheidsmijlpalen Widget', description: 'Voortgang naar de 4 vrijheidsmijlpalen met datums widget' },
  { id: 'widget_voorstellen', label: 'Voorstellen Widget',    description: 'Persoonlijke aanbevelingen widget op dashboard' },
  { id: 'widget_vrijheidsscenarios', label: "Vrijheidsscenario's Widget", description: 'Pessimistisch/verwacht/optimistisch FIRE-leeftijd widget' },
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
  { id: 'cashflow_forecast',        label: 'Cashflow Prognose',           description: 'Voorspelling banksaldo 3-6 maanden vooruit' },
  { id: 'vermogensprognose_kern',   label: 'Vermogensprognose',           description: 'Korte-termijn (1-5 jaar) netto vermogensprognose op De Kern' },
  { id: 'data_export',              label: 'Data Export',                 description: 'CSV export van transacties, budgetten, vermogen, assets, schulden, doelen' },
  // Wil
  { id: 'doelen_systeem',           label: 'Doelen Systeem',              description: 'Financiele doelen instellen, voortgang volgen, ETA-berekening' },
  { id: 'beslissingspatronen',      label: 'Beslissingspatronen',         description: 'Bar chart met vrijheidsdagen per actie-type + impact-analyse' },
  { id: 'spending_patterns',        label: 'Uitgavenpatronen',            description: 'AI-gestuurde seizoenspatronen en trendanalyse van uitgaven' },
  // Widget sovereignty gates — Horizon
  { id: 'widget_backtesting_score', label: 'Historische Weerbaarheid Widget', description: 'Hoe je plan presteert bij historische marktcrises widget' },
  { id: 'widget_ai_inzicht',       label: 'AI Inzicht Widget',              description: 'Persoonlijke AI-gedreven inzichten widget' },
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
  cashflow_forecast:         { recovery: false, stability: true,  momentum: true,  mastery: true },
  vermogensprognose_kern:    { recovery: false, stability: true,  momentum: true,  mastery: true },
  data_export:               { recovery: false, stability: false, momentum: true,  mastery: true },
  // Wil
  doelen_systeem:            { recovery: false, stability: true,  momentum: true,  mastery: true },
  beslissingspatronen:       { recovery: false, stability: false, momentum: true,  mastery: true },
  // Kern — Spending patterns
  spending_patterns:         { recovery: false, stability: true,  momentum: true,  mastery: true },
  // Widget sovereignty gates
  widget_assets:             { recovery: false, stability: true,  momentum: true,  mastery: true },
  widget_belasting:          { recovery: false, stability: true,  momentum: true,  mastery: true },
  widget_holdings:           { recovery: false, stability: false, momentum: true,  mastery: true },
  widget_monte_carlo:        { recovery: false, stability: false, momentum: true,  mastery: true },
  widget_passief_inkomen:    { recovery: false, stability: true,  momentum: true,  mastery: true },
  widget_box3_drag:          { recovery: false, stability: true,  momentum: true,  mastery: true },
  widget_vrijheidsmijlpalen: { recovery: true,  stability: true,  momentum: true,  mastery: true },
  widget_backtesting_score:  { recovery: false, stability: false, momentum: true,  mastery: true },
  widget_voorstellen:        { recovery: false, stability: true,  momentum: true,  mastery: true },
  widget_ai_inzicht:         { recovery: true,  stability: true,  momentum: true,  mastery: true },
}
