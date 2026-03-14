// ── Unified Feature Registry ─────────────────────────────────────────────────
// 16 consolidated features that replace the old 67-feature + 31-tier system.
// Each feature controls widgets + page sections + old feature IDs.

export type PhaseId = 'recovery' | 'stability' | 'momentum' | 'mastery'
export type CommercialTier = 'gratis' | 'connected' | 'ai'
export type FeatureModule = 'kern' | 'wil' | 'horizon' | 'bank' | 'ai'

export interface UnifiedFeature {
  id: string
  label: string
  description: string
  module: FeatureModule
  requiredTier: CommercialTier
  defaultPhase: PhaseId
  /** Widget IDs controlled by this feature */
  widgets: string[]
  /** Old feature IDs that map to this consolidated feature (for migration) */
  legacyIds: string[]
}

// ── 16 Unified Features ──────────────────────────────────────────────────────

export const UNIFIED_FEATURES: UnifiedFeature[] = [
  // ── GRATIS tier (11 features) ──────────────────────────────────────────────

  {
    id: 'vermogensbeheer',
    label: 'Vermogensbeheer',
    description: 'Vermogen bijhouden, verloop, snapshots, allocatie, prognose',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'recovery',
    widgets: ['assets', 'holdings'],
    legacyIds: [
      'widget_assets', 'widget_holdings',
      'vermogensverloop', 'snapshot_vergelijking',
      'vermogensprognose_kern', 'asset_allocatie',
    ],
  },
  {
    id: 'schuldenbeheer',
    label: 'Schuldenbeheer',
    description: 'Schulden overzicht, aflosplan en strategieën',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'recovery',
    widgets: [],
    legacyIds: ['schulden_aflosplan'],
  },
  {
    id: 'budgetbeheer',
    label: 'Budgetbeheer',
    description: 'Budgetcategorieën, optimalisatie, NIBUD benchmark',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'recovery',
    widgets: ['budgetten', 'nibud_benchmark', 'spaarquote', 'noodfonds'],
    legacyIds: ['budget_optimalisatie', 'nibud_benchmark'],
  },
  {
    id: 'cashflow',
    label: 'Cashflow Analyse',
    description: 'Cashflow diagram, maandoverzicht, prognose, vaste lasten',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'stability',
    widgets: ['cash_flow', 'maandoverzicht', 'terugkerende_transacties'],
    legacyIds: ['cashflow_sankey', 'cashflow_forecast'],
  },
  {
    id: 'belasting',
    label: 'Box 3 Belasting',
    description: 'Vermogensbelasting berekening en belastingdrag analyse',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'stability',
    widgets: ['belasting_box3', 'box3_drag'],
    legacyIds: ['widget_belasting', 'widget_box3_drag', 'box3_belasting'],
  },
  {
    id: 'doelen',
    label: 'Doelen',
    description: 'Financiële doelen instellen, voortgang volgen, ETA-berekening',
    module: 'wil',
    requiredTier: 'gratis',
    defaultPhase: 'recovery',
    widgets: ['doelen'],
    legacyIds: ['doelen_systeem'],
  },
  {
    id: 'fire_projecties',
    label: 'FIRE Projecties',
    description: "FIRE berekening, vrijheidsmijlpalen, scenario's, vermogenspad, passief inkomen",
    module: 'horizon',
    requiredTier: 'gratis',
    defaultPhase: 'stability',
    widgets: ['fire_prognose', 'vrijheidsmijlpalen', 'vrijheidsscenarios', 'sim_vermogenspad', 'passief_inkomen'],
    legacyIds: [
      'fire_projecties',
      'widget_vrijheidsmijlpalen', 'widget_vrijheidsscenarios',
      'widget_sim_vermogenspad', 'widget_passief_inkomen',
      'vermogensprojectie_chart',
    ],
  },
  {
    id: 'simulaties',
    label: 'Simulaties & Analyse',
    description: 'Monte Carlo simulaties, scenario analyse, veerkracht score, backtesting',
    module: 'horizon',
    requiredTier: 'gratis',
    defaultPhase: 'momentum',
    widgets: ['monte_carlo', 'veerkracht_score', 'backtesting_score'],
    legacyIds: [
      'widget_monte_carlo', 'monte_carlo',
      'fire_scenario_analyse', 'veerkracht_score',
      'widget_backtesting_score',
    ],
  },
  {
    id: 'fire_planning',
    label: 'FIRE Planning',
    description: 'Levensgebeurtenissen, withdrawal strategieën, geavanceerde FIRE parameters',
    module: 'horizon',
    requiredTier: 'gratis',
    defaultPhase: 'mastery',
    widgets: ['levensgebeurtenissen'],
    legacyIds: [
      'levensgebeurtenissen', 'withdrawal_strategie',
      'fire_geavanceerde_params',
    ],
  },
  {
    id: 'trends',
    label: 'Trends & Patronen',
    description: 'Inkomsten/uitgaven/spaar/schuld trends, beslissingspatronen',
    module: 'wil',
    requiredTier: 'gratis',
    defaultPhase: 'stability',
    widgets: ['trend_inkomen', 'trend_uitgaven', 'trend_sparen', 'trend_schulden', 'beslissingspatronen'],
    legacyIds: ['beslissingspatronen'],
  },
  {
    id: 'data_export',
    label: 'Data Export',
    description: 'CSV export van alle financiële data',
    module: 'kern',
    requiredTier: 'gratis',
    defaultPhase: 'momentum',
    widgets: [],
    legacyIds: ['data_export'],
  },

  // ── CONNECTED tier (1 feature) ─────────────────────────────────────────────

  {
    id: 'bankintegratie',
    label: 'Bankintegratie',
    description: 'TrueLayer bankverbinding, automatische import, realtime saldo',
    module: 'bank',
    requiredTier: 'connected',
    defaultPhase: 'recovery',
    widgets: [],
    legacyIds: [
      'bank_connection', 'auto_import', 'realtime_balance',
      'multi_account', 'auto_account_recognition',
    ],
  },

  // ── AI tier (4 features) ───────────────────────────────────────────────────

  {
    id: 'ai_assistent',
    label: 'AI Assistent',
    description: 'AI Chat met persoonlijkheden (Will/FHIN/FFIN), AI tools',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'recovery',
    widgets: ['ai_inzicht'],
    legacyIds: [
      'widget_ai_inzicht', 'ai_chat', 'ai_personalities',
      'ai_suggest_action', 'ai_freedom_calc', 'ai_lookup',
    ],
  },
  {
    id: 'ai_analyse',
    label: 'AI Analyse',
    description: 'Automatische categorisatie, uitgavenpatronen, abonnementenanalyse',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'stability',
    widgets: ['abonnementen'],
    legacyIds: [
      'ai_categorize', 'spending_patterns', 'ai_subscriptions',
      'ai_spending_patterns', 'ai_budget_insights',
    ],
  },
  {
    id: 'ai_aanbevelingen',
    label: 'AI Aanbevelingen',
    description: 'Persoonlijke aanbevelingen genereren, volgende stappen engine',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'recovery',
    widgets: ['voorstellen', 'volgende_stap'],
    legacyIds: [
      'widget_voorstellen', 'ai_recommendations', 'ai_next_steps',
    ],
  },
  {
    id: 'ai_rapportage',
    label: 'AI Rapportage',
    description: 'Financiële rapporten genereren',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'momentum',
    widgets: [],
    legacyIds: ['ai_report'],
  },
  {
    id: 'ai_briefing',
    label: 'AI Briefing',
    description: 'Dagelijkse gepersonaliseerde financiële briefing',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'recovery',
    widgets: [],
    legacyIds: [],
  },
  {
    id: 'ai_nieuws',
    label: 'AI Nieuws',
    description: 'Gepersonaliseerd financieel nieuws en inzichten',
    module: 'ai',
    requiredTier: 'ai',
    defaultPhase: 'recovery',
    widgets: [],
    legacyIds: [],
  },
]

// ── Legacy Feature ID → Unified Feature ID Mapping ──────────────────────────
// Allows old feature IDs (from FeatureGate calls, WIDGET_FEATURE_MAP, etc.)
// to resolve to the new unified feature ID.

export const LEGACY_FEATURE_MAP: Record<string, string> = {}
for (const feat of UNIFIED_FEATURES) {
  for (const legacyId of feat.legacyIds) {
    LEGACY_FEATURE_MAP[legacyId] = feat.id
  }
}

// ── Widget ID → Unified Feature ID Mapping ──────────────────────────────────
// Replaces the old WIDGET_FEATURE_MAP that pointed to legacy feature IDs.

export const WIDGET_TO_FEATURE: Record<string, string> = {}
for (const feat of UNIFIED_FEATURES) {
  for (const widgetId of feat.widgets) {
    WIDGET_TO_FEATURE[widgetId] = feat.id
  }
}

// ── Subscription helper ──────────────────────────────────────────────────────
// Subscriptions are independent add-ons, NOT hierarchical.
// 'gratis' = no subscription needed, 'connected' and 'ai' are separate add-ons.

export type ActiveSubscriptions = string[]

/**
 * Check if user has the required subscription.
 * 'gratis' features are always accessible.
 * 'connected' and 'ai' require the specific subscription in the user's array.
 */
export function hasSubscription(active: ActiveSubscriptions, required: CommercialTier): boolean {
  if (required === 'gratis') return true
  return active.includes(required)
}

/** @deprecated Use hasSubscription instead — kept for backward compat during transition */
export function isTierSufficient(userTier: CommercialTier, requiredTier: CommercialTier): boolean {
  // Legacy: treat single tier as array
  if (requiredTier === 'gratis') return true
  return userTier === requiredTier
}

/** @deprecated Use tierIndex with caution — subscriptions are no longer hierarchical */
export function tierIndex(tier: CommercialTier): number {
  const order: CommercialTier[] = ['gratis', 'connected', 'ai']
  return order.indexOf(tier)
}

// ── Phase ordering helper ────────────────────────────────────────────────────

const PHASE_ORDER: PhaseId[] = ['recovery', 'stability', 'momentum', 'mastery']

export function phaseIndex(phase: PhaseId): number {
  return PHASE_ORDER.indexOf(phase)
}

export function isPhaseSufficient(userPhase: PhaseId, requiredPhase: PhaseId): boolean {
  return phaseIndex(userPhase) >= phaseIndex(requiredPhase)
}
