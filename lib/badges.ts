/**
 * Badge definitions for the TriFinity badge system.
 * These define all possible badges a user can earn.
 * Used both client-side (for display) and server-side (for evaluation).
 *
 * 35 badges across 8 categories:
 * - onboarding (3)
 * - consistency (3)
 * - financial_health (5)
 * - fire_milestones (4)
 * - actions (4)
 * - budget (3)
 * - exploration (4)
 * - sovereignty (9, one per level -2..6)
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
  progress?: number | null        // 0-1 progress toward earning (null = no progress tracking)
  progress_label?: string | null  // Human-readable progress label e.g. "€5.000 / €10.000"
}

/**
 * Badge criteria thresholds for progress calculation.
 * Maps badge slug to { current_key, target, unit, label_fn }.
 */
export type BadgeCriteria = {
  target: number
  unit: string
  label: (current: number, target: number) => string
}

export const BADGE_CRITERIA: Record<string, BadgeCriteria> = {
  // Financial Health
  positief_vermogen: {
    target: 0,
    unit: 'EUR',
    label: (c) => `Vermogen: €${Math.round(c).toLocaleString('nl-NL')}`,
  },
  eerste_10k: {
    target: 10000,
    unit: 'EUR',
    label: (c, t) => `€${Math.round(c).toLocaleString('nl-NL')} / €${t.toLocaleString('nl-NL')}`,
  },
  '100k_club': {
    target: 100000,
    unit: 'EUR',
    label: (c, t) => `€${Math.round(c).toLocaleString('nl-NL')} / €${t.toLocaleString('nl-NL')}`,
  },
  // Actions
  eerste_actie: {
    target: 1,
    unit: 'acties',
    label: (c, t) => `${c} / ${t} actie${t === 1 ? '' : 's'}`,
  },
  actieheld_x10: {
    target: 10,
    unit: 'acties',
    label: (c, t) => `${c} / ${t} acties`,
  },
  vrijheidsjager: {
    target: 25,
    unit: 'acties',
    label: (c, t) => `${c} / ${t} acties`,
  },
  beslisser: {
    target: 50,
    unit: 'acties',
    label: (c, t) => `${c} / ${t} acties`,
  },
  // Onboarding
  data_detective: {
    target: 1,
    unit: 'import',
    label: (c) => c > 0 ? 'Geïmporteerd ✓' : 'Nog geen import',
  },
  budgetbouwer: {
    target: 1,
    unit: 'budget',
    label: (c) => c > 0 ? 'Budget aangemaakt ✓' : 'Nog geen budget',
  },
  // FIRE milestones
  fire_10_pct: {
    target: 10,
    unit: '%',
    label: (c, t) => `${Math.round(c)}% / ${t}% vrijheid`,
  },
  fire_halftime: {
    target: 50,
    unit: '%',
    label: (c, t) => `${Math.round(c)}% / ${t}% vrijheid`,
  },
  fire_bereikt: {
    target: 100,
    unit: '%',
    label: (c, t) => `${Math.round(c)}% / ${t}% vrijheid`,
  },
}

/**
 * All badge definitions (35 badges across 8 categories).
 * Ordered by sort_order for consistent display.
 */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Onboarding (3 badges) ──────────────────────────────
  {
    slug: 'eerste_stap',
    name: 'Eerste Stap',
    description: 'Je hebt voor het eerst ingelogd bij TriFinity.',
    icon: '🚀',
    color: 'teal',
    category: 'onboarding',
    sort_order: 1,
  },
  {
    slug: 'data_detective',
    name: 'Data Detective',
    description: 'Je hebt je eerste bankbestand geïmporteerd en data ontdekt.',
    icon: '🔍',
    color: 'teal',
    category: 'onboarding',
    sort_order: 2,
  },
  {
    slug: 'budgetbouwer',
    name: 'Budgetbouwer',
    description: 'Je hebt je eerste budget aangemaakt.',
    icon: '📊',
    color: 'teal',
    category: 'onboarding',
    sort_order: 3,
  },

  // ── Consistency (3 badges) ─────────────────────────────
  {
    slug: 'weekstreak_x4',
    name: 'Weekstreak x4',
    description: '4 weken achter elkaar ingelogd.',
    icon: '🔥',
    color: 'amber',
    category: 'consistency',
    sort_order: 10,
  },
  {
    slug: 'maandmeester',
    name: 'Maandmeester',
    description: 'Een hele maand lang elke week actief geweest.',
    icon: '⚡',
    color: 'amber',
    category: 'consistency',
    sort_order: 11,
  },
  {
    slug: 'dagelijkse_discipline',
    name: 'Dagelijkse Discipline',
    description: '30 dagen achter elkaar ingelogd. Onbreekbare discipline!',
    icon: '💪',
    color: 'amber',
    category: 'consistency',
    sort_order: 12,
  },

  // ── Financial Health (5 badges) ────────────────────────
  {
    slug: 'noodfonds_bereikt',
    name: 'Noodfonds Bereikt',
    description: 'Je hebt minimaal 3 maanden aan uitgaven als noodfonds opgebouwd.',
    icon: '🛡️',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 20,
  },
  {
    slug: 'schuldenvrij',
    name: 'Schuldenvrij',
    description: 'Geen consumptieve schulden meer. Vrijheid teruggewonnen!',
    icon: '🎉',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 21,
  },
  {
    slug: 'positief_vermogen',
    name: 'Positief Vermogen',
    description: 'Je netto vermogen is positief. Je staat in de plus!',
    icon: '📈',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 22,
  },
  {
    slug: 'eerste_10k',
    name: 'Eerste €10K',
    description: 'Je vermogen heeft de €10.000 grens doorbroken.',
    icon: '💰',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 23,
  },
  {
    slug: '100k_club',
    name: '€100K Club',
    description: 'Welkom bij de €100.000 club. Een indrukwekkende mijlpaal!',
    icon: '🏆',
    color: 'emerald',
    category: 'financial_health',
    sort_order: 24,
  },

  // ── FIRE Milestones (4 badges) ─────────────────────────
  {
    slug: 'fire_10_pct',
    name: '10% Vrij',
    description: 'Je hebt 10% van je FIRE-target bereikt.',
    icon: '🌱',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 30,
  },
  {
    slug: 'fire_halftime',
    name: 'Halftime',
    description: 'De helft van je FIRE-target bereikt! Halverwege naar vrijheid.',
    icon: '🌳',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 31,
  },
  {
    slug: 'coast_fire',
    name: 'Coast FIRE',
    description: 'Je kunt stoppen met sparen en toch FIRE bereiken door rendement.',
    icon: '⛵',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 32,
  },
  {
    slug: 'fire_bereikt',
    name: 'FIRE Bereikt!',
    description: 'Je hebt volledige financiële onafhankelijkheid bereikt!',
    icon: '∞',
    color: 'purple',
    category: 'fire_milestones',
    sort_order: 33,
  },

  // ── Actions (4 badges) ─────────────────────────────────
  {
    slug: 'eerste_actie',
    name: 'Eerste Actie',
    description: 'Je hebt je eerste actie voltooid.',
    icon: '✅',
    color: 'teal',
    category: 'actions',
    sort_order: 40,
  },
  {
    slug: 'actieheld_x10',
    name: 'Actieheld x10',
    description: '10 acties voltooid. Je maakt echt verschil.',
    icon: '🎯',
    color: 'teal',
    category: 'actions',
    sort_order: 41,
  },
  {
    slug: 'vrijheidsjager',
    name: 'Vrijheidsjager',
    description: '25 acties voltooid. Je jaagt je vrijheid na met vastberadenheid.',
    icon: '🏹',
    color: 'teal',
    category: 'actions',
    sort_order: 42,
  },
  {
    slug: 'beslisser',
    name: 'Beslisser',
    description: '50 acties voltooid. Elke beslissing brengt je dichter bij vrijheid.',
    icon: '🏆',
    color: 'teal',
    category: 'actions',
    sort_order: 43,
  },

  // ── Budget (3 badges) ──────────────────────────────────
  {
    slug: 'onder_budget',
    name: 'Onder Budget',
    description: 'Alle budgetten binnen de limiet deze maand.',
    icon: '✨',
    color: 'emerald',
    category: 'budget',
    sort_order: 50,
  },
  {
    slug: 'zuinig_kwartaal',
    name: 'Zuinig Kwartaal',
    description: '3 maanden achter elkaar binnen budget gebleven.',
    icon: '🏅',
    color: 'emerald',
    category: 'budget',
    sort_order: 51,
  },
  {
    slug: 'spaarkampioen',
    name: 'Spaarkampioen',
    description: 'Meer dan 30% van je inkomen gespaard deze maand.',
    icon: '💎',
    color: 'emerald',
    category: 'budget',
    sort_order: 52,
  },

  // ── Exploration (4 badges) ─────────────────────────────
  {
    slug: 'ontdekker',
    name: 'Ontdekker',
    description: 'Je hebt alle paginas in De Kern bezocht.',
    icon: '🧭',
    color: 'amber',
    category: 'exploration',
    sort_order: 60,
  },
  {
    slug: 'analist',
    name: 'Analist',
    description: 'Je hebt alle analyse-paginas bezocht en onderzocht.',
    icon: '📊',
    color: 'teal',
    category: 'exploration',
    sort_order: 61,
  },
  {
    slug: 'strateeg',
    name: 'Strateeg',
    description: 'Je hebt alle strategie-paginas in De Horizon ontdekt.',
    icon: '🔭',
    color: 'purple',
    category: 'exploration',
    sort_order: 62,
  },
  {
    slug: 'fiscaal_slim',
    name: 'Fiscaal Slim',
    description: 'Je hebt de belasting- en optimalisatiepaginas ontdekt.',
    icon: '🧮',
    color: 'blue',
    category: 'exploration',
    sort_order: 63,
  },

  // ── Sovereignty (9 badges — one per level -2..6) ──────
  {
    slug: 'sovereignty_level_neg2',
    name: 'Tijdtekort',
    description: 'Level -2: Je bent gestart met schulden. De weg omhoog begint hier.',
    icon: '🌑',
    color: 'rose',
    category: 'sovereignty',
    sort_order: 70,
  },
  {
    slug: 'sovereignty_level_neg1',
    name: 'Eerste Licht',
    description: 'Level -1: Negatief vermogen zonder consumptieve schulden.',
    icon: '🌒',
    color: 'rose',
    category: 'sovereignty',
    sort_order: 71,
  },
  {
    slug: 'sovereignty_level_0',
    name: 'Nulpunt',
    description: 'Level 0: Je staat op het omslagpunt. Vanaf hier bouw je op.',
    icon: '🌓',
    color: 'rose',
    category: 'sovereignty',
    sort_order: 72,
  },
  {
    slug: 'sovereignty_level_1',
    name: 'Buffer Begonnen',
    description: 'Level 1: Je eerste spaargeld groeit. Minder dan 3 maanden buffer.',
    icon: '🌔',
    color: 'blue',
    category: 'sovereignty',
    sort_order: 73,
  },
  {
    slug: 'sovereignty_level_2',
    name: 'Noodfonds Klaar',
    description: 'Level 2: 3-6 maanden buffer opgebouwd. Stabiel fundament.',
    icon: '🌕',
    color: 'blue',
    category: 'sovereignty',
    sort_order: 74,
  },
  {
    slug: 'sovereignty_level_3',
    name: 'Groei Gestart',
    description: 'Level 3: Vermogen groeit, 10-25% vrijheidspercentage.',
    icon: '🚀',
    color: 'teal',
    category: 'sovereignty',
    sort_order: 75,
  },
  {
    slug: 'sovereignty_level_4',
    name: 'Coast Bereikt',
    description: 'Level 4: 25-75% vrijheid. Coast FIRE territorium.',
    icon: '⛵',
    color: 'teal',
    category: 'sovereignty',
    sort_order: 76,
  },
  {
    slug: 'sovereignty_level_5',
    name: 'Bijna Vrij',
    description: 'Level 5: 75-100% vrijheid. De finish is in zicht.',
    icon: '🌟',
    color: 'amber',
    category: 'sovereignty',
    sort_order: 77,
  },
  {
    slug: 'sovereignty_level_6',
    name: 'Tijdloos',
    description: 'Level 6: Volledige financiële soevereiniteit bereikt.',
    icon: '👑',
    color: 'amber',
    category: 'sovereignty',
    sort_order: 78,
  },
]
