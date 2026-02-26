// ── Commercial Tier Configuration ─────────────────────────────────────────────
// Defines the three commercial tiers: Gratis, Connected, AI.
// This is SEPARATE from the sovereignty-based feature gating in feature-phases.ts.

export type CommercialTier = 'gratis' | 'connected' | 'ai'

export interface TierFeatureDef {
  id: string
  label: string
  description: string
  /** Which tier this feature is first introduced in */
  tier: CommercialTier
  /** API route or component reference */
  ref?: string
}

export type TierFeatureMatrix = Record<string, Record<CommercialTier, boolean>>

export const TIERS: { id: CommercialTier; label: string; description: string }[] = [
  {
    id: 'gratis',
    label: 'Gratis',
    description: 'Basisgebruik, handmatige invoer, core metrics',
  },
  {
    id: 'connected',
    label: 'Connected',
    description: 'Bankverbindingen, automatische import, realtime saldo',
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'Alle AI-functies: chat, aanbevelingen, categorisatie, rapporten',
  },
]

export const TIER_FEATURES: TierFeatureDef[] = [
  // ── Gratis features ──────────────────────────────────────────────────────────
  {
    id: 'dashboard_overview',
    label: 'Dashboard overzicht',
    description: 'Financieel overzicht op het dashboard',
    tier: 'gratis',
  },
  {
    id: 'manual_transactions',
    label: 'Handmatige transacties',
    description: 'Transacties handmatig invoeren en beheren',
    tier: 'gratis',
  },
  {
    id: 'budget_categories',
    label: 'Budget categorieën',
    description: 'Budgetcategorieën aanmaken en beheren',
    tier: 'gratis',
  },
  {
    id: 'asset_tracking_manual',
    label: 'Vermogen bijhouden',
    description: 'Vermogen handmatig bijhouden',
    tier: 'gratis',
  },
  {
    id: 'fire_calculator_basic',
    label: 'FIRE calculator (basis)',
    description: 'Basis FIRE-berekening op basis van handmatige invoer',
    tier: 'gratis',
  },
  {
    id: 'debts_overview',
    label: 'Schulden overzicht',
    description: 'Overzicht van schulden en aflosplan',
    tier: 'gratis',
  },
  {
    id: 'goals_basic',
    label: 'Doelen instellen',
    description: 'Financiële doelen aanmaken en bijhouden',
    tier: 'gratis',
  },

  // ── Connected features ───────────────────────────────────────────────────────
  {
    id: 'bank_connection',
    label: 'GoCardless bankverbinding',
    description: 'Koppeling met bankrekeningen via GoCardless',
    tier: 'connected',
    ref: 'app/api/gocardless/',
  },
  {
    id: 'auto_import',
    label: 'Automatische transactie-import',
    description: 'Automatisch importeren via MT940/CSV/OFX',
    tier: 'connected',
    ref: 'app/(app)/core/cash/import/',
  },
  {
    id: 'realtime_balance',
    label: 'Real-time saldo updates',
    description: 'Actueel banksaldo via bankverbinding',
    tier: 'connected',
  },
  {
    id: 'multi_account',
    label: 'Multi-account overzicht',
    description: 'Meerdere bankrekeningen tegelijk beheren',
    tier: 'connected',
  },
  {
    id: 'auto_account_recognition',
    label: 'Automatische rekening-herkenning',
    description: 'Automatisch herkennen van tegenrekeningen',
    tier: 'connected',
  },

  // ── AI features ───────────────────────────────────────────────────────────────
  {
    id: 'ai_chat',
    label: 'AI Chat (Will/FHIN/FFIN)',
    description: 'Streaming AI-chat met persoonlijkheidsmodules',
    tier: 'ai',
    ref: 'app/api/ai/chat/route.ts',
  },
  {
    id: 'ai_recommendations',
    label: 'Aanbevelingen genereren',
    description: 'AI genereert persoonlijke financiële aanbevelingen',
    tier: 'ai',
    ref: 'app/api/ai/recommendations/route.ts',
  },
  {
    id: 'ai_categorize',
    label: 'Transacties categoriseren',
    description: 'AI categoriseert transacties automatisch',
    tier: 'ai',
    ref: 'app/api/ai/categorize/route.ts',
  },
  {
    id: 'ai_budget_suggestions',
    label: 'Budget-suggesties',
    description: 'AI-gebaseerde budgetsuggesties bij onboarding',
    tier: 'ai',
    ref: 'app/api/onboarding/suggest-budgets/route.ts',
  },
  {
    id: 'ai_subscriptions',
    label: 'Abonnementenanalyse',
    description: 'AI analyseert abonnementen en geeft advies',
    tier: 'ai',
    ref: 'app/api/subscriptions/advice/route.ts',
  },
  {
    id: 'ai_report',
    label: 'Rapportage genereren',
    description: 'AI genereert financiële rapporten',
    tier: 'ai',
    ref: 'app/api/report/route.ts',
  },
  {
    id: 'ai_next_steps',
    label: 'Volgende stappen engine',
    description: 'AI bepaalt prioriteiten voor volgende financiële stappen',
    tier: 'ai',
    ref: 'app/api/next-steps/route.ts',
  },
  {
    id: 'ai_suggest_action',
    label: 'Suggest Action tool',
    description: 'AI-tool in chat: acties voorstellen',
    tier: 'ai',
    ref: 'lib/ai/tools/suggest-action.ts',
  },
  {
    id: 'ai_freedom_calc',
    label: 'Freedom Calculator tool',
    description: 'AI-tool in chat: vrijheidstijd berekenen',
    tier: 'ai',
    ref: 'lib/ai/tools/freedom-calc.ts',
  },
  {
    id: 'ai_lookup',
    label: 'Lookup tool',
    description: 'AI-tool in chat: financiële data opzoeken',
    tier: 'ai',
    ref: 'lib/ai/tools/lookup.ts',
  },
  {
    id: 'ai_personalities',
    label: 'AI Persoonlijkheden',
    description: 'FHIN / Will / FFIN persoonlijkheidsmodules',
    tier: 'ai',
    ref: 'lib/ai/dna/',
  },
  {
    id: 'ai_spending_patterns',
    label: 'Spending Patterns analyse',
    description: 'AI-analyse van uitgavenpatronen en seizoensschommelingen',
    tier: 'ai',
    ref: 'lib/ai/context/spending-patterns-context.ts',
  },
  {
    id: 'ai_budget_insights',
    label: 'Budget Insights',
    description: 'AI-gegenereerde budgetinzichten en context',
    tier: 'ai',
    ref: 'lib/ai/context/budget-insights-context.ts',
  },
]

/** Build the default matrix: feature ON for its own tier and all higher tiers */
function buildDefaultMatrix(): TierFeatureMatrix {
  const tierOrder: CommercialTier[] = ['gratis', 'connected', 'ai']
  const matrix: TierFeatureMatrix = {}
  for (const feat of TIER_FEATURES) {
    const featTierIndex = tierOrder.indexOf(feat.tier)
    matrix[feat.id] = {
      gratis: featTierIndex <= 0,
      connected: featTierIndex <= 1,
      ai: featTierIndex <= 2,
    }
  }
  return matrix
}

export const DEFAULT_TIER_MATRIX: TierFeatureMatrix = buildDefaultMatrix()
