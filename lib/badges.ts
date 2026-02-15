/**
 * Badge definitions for the TriFinity badge system.
 * These define all possible badges a user can earn.
 * Used both client-side (for display) and server-side (for evaluation).
 */

export type BadgeCategory =
  | 'onboarding'
  | 'consistency'
  | 'financial_health'
  | 'fire_milestones'
  | 'actions'
  | 'budget'
  | 'exploration'
  | 'sovereignty'

export type BadgeDefinition = {
  slug: string
  name: string
  description: string
  icon: string
  color: string
  category: BadgeCategory
  sort_order: number
}

export type BadgeWithStatus = BadgeDefinition & {
  id?: string
  earned: boolean
  earned_at?: string | null
}

/**
 * All badge definitions (30 badges across 8 categories).
 * Ordered by sort_order for consistent display.
 */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Onboarding (4 badges) ──────────────────────────────
  {
    slug: 'first_login',
    name: 'Eerste Stap',
    description: 'Je hebt voor het eerst ingelogd bij TriFinity.',
    icon: '🚀',
    color: 'teal',
    category: 'onboarding',
    sort_order: 1,
  },
  {
    slug: 'profile_complete',
    name: 'Identiteit Bekend',
    description: 'Je profiel is volledig ingevuld.',
    icon: '🪪',
    color: 'teal',
    category: 'onboarding',
    sort_order: 2,
  },
  {
    slug: 'first_account',
    name: 'Eerste Rekening',
    description: 'Je hebt je eerste bankrekening toegevoegd.',
    icon: '🏦',
    color: 'teal',
    category: 'onboarding',
    sort_order: 3,
  },
  {
    slug: 'first_budget',
    name: 'Budgetmeester',
    description: 'Je hebt je eerste budget aangemaakt.',
    icon: '📊',
    color: 'teal',
    category: 'onboarding',
    sort_order: 4,
  },

  // ── Consistency (4 badges) ─────────────────────────────
  {
    slug: 'streak_4_weeks',
    name: '4 Weken Streak',
    description: '4 weken achter elkaar ingelogd.',
    icon: '🔥',
    color: 'amber',
    category: 'consistency',
    sort_order: 10,
  },
  {
    slug: 'streak_12_weeks',
    name: '12 Weken Streak',
    description: '12 weken achter elkaar actief geweest.',
    icon: '⚡',
    color: 'amber',
    category: 'consistency',
    sort_order: 11,
  },
  {
    slug: 'streak_26_weeks',
    name: 'Halfjaar Held',
    description: '26 weken onafgebroken actief.',
    icon: '💪',
    color: 'amber',
    category: 'consistency',
    sort_order: 12,
  },
  {
    slug: 'streak_52_weeks',
    name: 'Jaarveteraan',
    description: 'Een heel jaar lang elke week actief geweest.',
    icon: '👑',
    color: 'amber',
    category: 'consistency',
    sort_order: 13,
  },

  // ── Financial Health (4 badges) ────────────────────────
  {
    slug: 'debt_free',
    name: 'Schuldenvrij',
    description: 'Geen consumptieve schulden meer. Vrijheid teruggewonnen!',
    icon: '🎉',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 20,
  },
  {
    slug: 'emergency_fund',
    name: 'Noodfondshouder',
    description: 'Je hebt minimaal 3 maanden aan uitgaven als buffer.',
    icon: '🛡️',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 21,
  },
  {
    slug: 'positive_net_worth',
    name: 'In de Plus',
    description: 'Je netto vermogen is positief.',
    icon: '📈',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 22,
  },
  {
    slug: 'savings_rate_25',
    name: 'Kwartspaarder',
    description: 'Je spaart minstens 25% van je inkomen.',
    icon: '💰',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 23,
  },

  // ── FIRE Milestones (4 badges) ─────────────────────────
  {
    slug: 'fire_10_pct',
    name: '10% Vrijheid',
    description: 'Je hebt 10% van je FIRE-target bereikt.',
    icon: '🌱',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 30,
  },
  {
    slug: 'fire_25_pct',
    name: '25% Vrijheid',
    description: 'Een kwart van je FIRE-target is bereikt.',
    icon: '🌿',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 31,
  },
  {
    slug: 'fire_50_pct',
    name: 'Halverwege',
    description: 'De helft van je FIRE-target bereikt!',
    icon: '🌳',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 32,
  },
  {
    slug: 'fire_100_pct',
    name: 'Financieel Vrij',
    description: 'Je hebt volledige financiële onafhankelijkheid bereikt!',
    icon: '∞',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 33,
  },

  // ── Actions (3 badges) ─────────────────────────────────
  {
    slug: 'first_action',
    name: 'Doener',
    description: 'Je hebt je eerste actie voltooid.',
    icon: '✅',
    color: 'teal',
    category: 'actions',
    sort_order: 40,
  },
  {
    slug: 'actions_10',
    name: 'Actie-expert',
    description: '10 acties voltooid. Je maakt echt verschil.',
    icon: '🎯',
    color: 'teal',
    category: 'actions',
    sort_order: 41,
  },
  {
    slug: 'actions_50',
    name: 'Meester van Actie',
    description: '50 acties voltooid. Niets houdt je tegen.',
    icon: '🏆',
    color: 'teal',
    category: 'actions',
    sort_order: 42,
  },

  // ── Budget (3 badges) ──────────────────────────────────
  {
    slug: 'budget_month_green',
    name: 'Groene Maand',
    description: 'Alle budgetten binnen de limiet deze maand.',
    icon: '✨',
    color: 'emerald',
    category: 'budget',
    sort_order: 50,
  },
  {
    slug: 'budget_3_months_green',
    name: 'Kwartaal Kampioen',
    description: '3 maanden achter elkaar binnen budget.',
    icon: '🏅',
    color: 'emerald',
    category: 'budget',
    sort_order: 51,
  },
  {
    slug: 'budget_optimizer',
    name: 'Budget Optimist',
    description: 'Je hebt een budget verlaagd en het gehaald.',
    icon: '📉',
    color: 'emerald',
    category: 'budget',
    sort_order: 52,
  },

  // ── Exploration (4 badges) ─────────────────────────────
  {
    slug: 'explored_kern',
    name: 'Kern Ontdekt',
    description: 'Je hebt alle paginas in De Kern bezocht.',
    icon: '🧭',
    color: 'amber',
    category: 'exploration',
    sort_order: 60,
  },
  {
    slug: 'explored_wil',
    name: 'Wil Ontdekt',
    description: 'Je hebt alle paginas in De Wil bezocht.',
    icon: '⚡',
    color: 'teal',
    category: 'exploration',
    sort_order: 61,
  },
  {
    slug: 'explored_horizon',
    name: 'Horizon Ontdekt',
    description: 'Je hebt alle paginas in De Horizon bezocht.',
    icon: '🔭',
    color: 'purple',
    category: 'exploration',
    sort_order: 62,
  },
  {
    slug: 'explored_all',
    name: 'Volledig Verkend',
    description: 'Je hebt elke hoek van TriFinity ontdekt.',
    icon: '🗺️',
    color: 'zinc',
    category: 'exploration',
    sort_order: 63,
  },

  // ── Sovereignty (4 badges — one per phase) ─────────────
  {
    slug: 'sovereignty_recovery',
    name: 'Herstel Begonnen',
    description: 'Je bent begonnen aan de Recovery-fase.',
    icon: '🌅',
    color: 'rose',
    category: 'sovereignty',
    sort_order: 70,
  },
  {
    slug: 'sovereignty_stability',
    name: 'Stabiel Fundament',
    description: 'Je hebt de Stability-fase bereikt.',
    icon: '🏗️',
    color: 'blue',
    category: 'sovereignty',
    sort_order: 71,
  },
  {
    slug: 'sovereignty_momentum',
    name: 'Momentum',
    description: 'Je vermogen groeit en versnelt.',
    icon: '🚄',
    color: 'teal',
    category: 'sovereignty',
    sort_order: 72,
  },
  {
    slug: 'sovereignty_mastery',
    name: 'Meesterschap',
    description: 'Je hebt volledige financiële soevereiniteit bereikt.',
    icon: '👑',
    color: 'amber',
    category: 'sovereignty',
    sort_order: 73,
  },
]
