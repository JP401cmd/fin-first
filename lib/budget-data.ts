/**
 * Budget types, default seed data, and mock spending/history.
 *
 * 6 hoofdcategorieën + 24 subcategorieën.
 * Totaal uitgaven ~€2.510/mnd — past bij het mock-persona (€3.367/mnd netto, €2.512/mnd uitgaven).
 */

export type Budget = {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  slug: string | null
  icon: string
  description: string | null
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt'
  interval: 'monthly' | 'quarterly' | 'yearly'
  rollover_type: 'reset' | 'carry-over' | 'invest-sweep'
  limit_type: 'soft' | 'hard'
  alert_threshold: number
  max_single_transaction_amount: number
  is_essential: boolean
  priority_score: number
  is_inflation_indexed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Stable budget slugs — use these for matching instead of display names. */
export const BUDGET_SLUGS = {
  // Inkomen
  INKOMEN: 'inkomen',
  SALARIS_UITKERING: 'salaris-uitkering',
  TOESLAGEN_KINDERBIJSLAG: 'toeslagen-kinderbijslag',
  TERUGGAVE_BELASTING: 'teruggave-belasting',
  OVERIGE_INKOMSTEN: 'overige-inkomsten',
  // Vaste lasten
  VASTE_LASTEN_WONEN: 'vaste-lasten-wonen',
  HUUR_HYPOTHEEK: 'huur-hypotheek',
  GAS_WATER_LICHT: 'gas-water-licht',
  VERZEKERINGEN_WONEN: 'verzekeringen-wonen',
  GEMEENTELIJKE_LASTEN: 'gemeentelijke-lasten',
  // Dagelijkse uitgaven
  DAGELIJKSE_UITGAVEN: 'dagelijkse-uitgaven',
  BOODSCHAPPEN: 'boodschappen',
  HUISHOUDEN_VERZORGING: 'huishouden-verzorging',
  KINDEREN_SCHOOL: 'kinderen-school',
  MEDISCHE_KOSTEN: 'medische-kosten',
  // Vervoer
  VERVOER: 'vervoer',
  BRANDSTOF_OV: 'brandstof-ov',
  AUTO_VASTE_LASTEN: 'auto-vaste-lasten',
  AUTO_ONDERHOUD: 'auto-onderhoud',
  FIETS_DEELVERVOER: 'fiets-deelvervoer',
  // Leuke dingen
  LEUKE_DINGEN: 'leuke-dingen',
  UIT_ETEN_HORECA: 'uit-eten-horeca',
  VRIJE_TIJD_SPORT: 'vrije-tijd-sport',
  VAKANTIE: 'vakantie',
  KLEDING_OVERIGE: 'kleding-overige',
  // Sparen
  SPAREN_SCHULDEN: 'sparen-schulden',
  SPAREN_NOODBUFFER: 'sparen-noodbuffer',
  INVESTEREN_FIRE: 'investeren-fire',
  SCHULDEN_AFLOSSINGEN_PARENT: 'schulden-aflossingen-parent',
  SCHULDEN_AFLOSSINGEN: 'schulden-aflossingen',
  EXTRA_AFLOSSING_HYPOTHEEK: 'extra-aflossing-hypotheek',
} as const

export type BudgetAmount = {
  id: string
  budget_id: string
  effective_from: string
  amount: number
  created_at: string
}

export type BudgetWithChildren = Budget & {
  children: Budget[]
}

type SeedBudget = {
  name: string
  slug: string
  icon: string
  description: string
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt'
  is_essential: boolean
  priority_score: number
  sort_order: number
  children?: {
    name: string
    slug: string
    icon: string
    description: string
    default_limit: number
  }[]
}

export function getDefaultBudgets(): SeedBudget[] {
  const S = BUDGET_SLUGS
  return [
    {
      name: 'Inkomen',
      slug: S.INKOMEN,
      icon: 'Wallet',
      description: 'Alle inkomstenbronnen',
      default_limit: 3367,
      budget_type: 'income',
      is_essential: true,
      priority_score: 5,
      sort_order: 0,
      children: [
        { name: 'Salaris & uitkering', slug: S.SALARIS_UITKERING, icon: 'Banknote', description: 'Netto salaris of uitkering', default_limit: 2800 },
        { name: 'Toeslagen & kinderbijslag', slug: S.TOESLAGEN_KINDERBIJSLAG, icon: 'Baby', description: 'Overheidstoeslagen en kinderbijslag', default_limit: 200 },
        { name: 'Teruggave belasting', slug: S.TERUGGAVE_BELASTING, icon: 'Receipt', description: 'Belastingteruggave', default_limit: 167 },
        { name: 'Overige inkomsten', slug: S.OVERIGE_INKOMSTEN, icon: 'HandCoins', description: 'Bijverdiensten en overig', default_limit: 200 },
      ],
    },
    {
      name: 'Vaste lasten wonen & energie',
      slug: S.VASTE_LASTEN_WONEN,
      icon: 'Home',
      description: 'Alle vaste woonlasten',
      default_limit: 1150,
      budget_type: 'expense',
      is_essential: true,
      priority_score: 5,
      sort_order: 1,
      children: [
        { name: 'Huur / hypotheek', slug: S.HUUR_HYPOTHEEK, icon: 'Building2', description: 'Maandelijkse woonkosten', default_limit: 750 },
        { name: 'Gas, water, licht', slug: S.GAS_WATER_LICHT, icon: 'Zap', description: 'Energie en waterrekening', default_limit: 200 },
        { name: 'Verzekeringen wonen & gezondheid', slug: S.VERZEKERINGEN_WONEN, icon: 'ShieldCheck', description: 'Zorg-, woon- en inboedelverzekering', default_limit: 150 },
        { name: 'Gemeentelijke & overige vaste lasten', slug: S.GEMEENTELIJKE_LASTEN, icon: 'Landmark', description: 'OZB, afvalstoffenheffing, rioolheffing', default_limit: 50 },
      ],
    },
    {
      name: 'Dagelijkse uitgaven',
      slug: S.DAGELIJKSE_UITGAVEN,
      icon: 'ShoppingCart',
      description: 'Dagelijkse boodschappen en huishouden',
      default_limit: 550,
      budget_type: 'expense',
      is_essential: true,
      priority_score: 5,
      sort_order: 2,
      children: [
        { name: 'Boodschappen', slug: S.BOODSCHAPPEN, icon: 'Store', description: 'Supermarkt en voeding', default_limit: 400 },
        { name: 'Huishouden & verzorging', slug: S.HUISHOUDEN_VERZORGING, icon: 'SprayCan', description: 'Schoonmaak en persoonlijke verzorging', default_limit: 60 },
        { name: 'Kinderen & school/opvang', slug: S.KINDEREN_SCHOOL, icon: 'Baby', description: 'Schoolgeld, opvang, kinderkosten', default_limit: 50 },
        { name: 'Medische kosten', slug: S.MEDISCHE_KOSTEN, icon: 'HeartPulse', description: 'Eigen risico, medicijnen, tandarts', default_limit: 40 },
      ],
    },
    {
      name: 'Vervoer',
      slug: S.VERVOER,
      icon: 'Car',
      description: 'Alle vervoerskosten',
      default_limit: 200,
      budget_type: 'expense',
      is_essential: true,
      priority_score: 4,
      sort_order: 3,
      children: [
        { name: 'Brandstof / laden & OV', slug: S.BRANDSTOF_OV, icon: 'Fuel', description: 'Benzine, elektrisch laden, OV', default_limit: 80 },
        { name: 'Auto vaste lasten', slug: S.AUTO_VASTE_LASTEN, icon: 'CarFront', description: 'Wegenbelasting, verzekering, leasekosten', default_limit: 70 },
        { name: 'Auto onderhoud & parkeren', slug: S.AUTO_ONDERHOUD, icon: 'Wrench', description: 'APK, reparaties, parkeren', default_limit: 30 },
        { name: 'Fiets / deelvervoer', slug: S.FIETS_DEELVERVOER, icon: 'Bike', description: 'Fietsonderhoud, deelscooter', default_limit: 20 },
      ],
    },
    {
      name: 'Leuke dingen & lifestyle',
      slug: S.LEUKE_DINGEN,
      icon: 'PartyPopper',
      description: 'Ontspanning, hobby\'s en plezier',
      default_limit: 350,
      budget_type: 'expense',
      is_essential: false,
      priority_score: 2,
      sort_order: 4,
      children: [
        { name: 'Uit eten, horeca & afhalen', slug: S.UIT_ETEN_HORECA, icon: 'UtensilsCrossed', description: 'Restaurants, cafés, bezorging', default_limit: 100 },
        { name: 'Vrije tijd, hobby\'s & sport', slug: S.VRIJE_TIJD_SPORT, icon: 'Dumbbell', description: 'Sport, streaming, hobby\'s', default_limit: 80 },
        { name: 'Vakantie & weekendjes weg', slug: S.VAKANTIE, icon: 'Palmtree', description: 'Vakanties en uitstapjes', default_limit: 100 },
        { name: 'Kleding & overige', slug: S.KLEDING_OVERIGE, icon: 'Shirt', description: 'Kleding, schoenen, accessoires', default_limit: 70 },
      ],
    },
    {
      name: 'Sparen & investeren',
      slug: S.SPAREN_SCHULDEN,
      icon: 'PiggyBank',
      description: 'Vermogensopbouw en buffer',
      default_limit: 180,
      budget_type: 'savings',
      is_essential: true,
      priority_score: 4,
      sort_order: 5,
      children: [
        { name: 'Sparen & noodbuffer', slug: S.SPAREN_NOODBUFFER, icon: 'Vault', description: 'Noodfonds en spaargeld', default_limit: 100 },
        { name: 'Investeren / FIRE / pensioen', slug: S.INVESTEREN_FIRE, icon: 'TrendingUp', description: 'Beleggingen en pensioenopbouw', default_limit: 80 },
      ],
    },
    {
      name: 'Schulden & aflossingen',
      slug: S.SCHULDEN_AFLOSSINGEN_PARENT,
      icon: 'CreditCard',
      description: 'Schulden aflossen en hypotheek',
      default_limit: 80,
      budget_type: 'debt',
      is_essential: true,
      priority_score: 4,
      sort_order: 6,
      children: [
        { name: 'Schulden & aflossingen', slug: S.SCHULDEN_AFLOSSINGEN, icon: 'CreditCard', description: 'Leningen en schulden aflossen', default_limit: 60 },
        { name: 'Extra aflossing hypotheek', slug: S.EXTRA_AFLOSSING_HYPOTHEEK, icon: 'HomeIcon', description: 'Vrijwillige extra hypotheekaflossing', default_limit: 20 },
      ],
    },
  ]
}

/**
 * Generates mock spending data for budgets in a given month.
 * Returns a map of budget name -> spent amount.
 */
export function getMockSpending(monthOffset = 0): Record<string, number> {
  const variance = (base: number, seed: number) => {
    const factor = 0.7 + ((seed * 17 + monthOffset * 31) % 60) / 100
    return Math.round(base * factor)
  }

  return {
    // Inkomen
    'Salaris & uitkering': 2800,
    'Toeslagen & kinderbijslag': variance(200, 1),
    'Teruggave belasting': variance(167, 2),
    'Overige inkomsten': variance(200, 3),
    // Vaste lasten
    'Huur / hypotheek': 750,
    'Gas, water, licht': variance(200, 4),
    'Verzekeringen wonen & gezondheid': 150,
    'Gemeentelijke & overige vaste lasten': 50,
    // Dagelijkse uitgaven
    'Boodschappen': variance(400, 5),
    'Huishouden & verzorging': variance(60, 6),
    'Kinderen & school/opvang': variance(50, 7),
    'Medische kosten': variance(40, 8),
    // Vervoer
    'Brandstof / laden & OV': variance(80, 9),
    'Auto vaste lasten': 70,
    'Auto onderhoud & parkeren': variance(30, 10),
    'Fiets / deelvervoer': variance(20, 11),
    // Leuke dingen
    'Uit eten, horeca & afhalen': variance(100, 12),
    "Vrije tijd, hobby's & sport": variance(80, 13),
    'Vakantie & weekendjes weg': variance(100, 14),
    'Kleding & overige': variance(70, 15),
    // Sparen
    'Sparen & noodbuffer': 100,
    'Investeren / FIRE / pensioen': 80,
    'Schulden & aflossingen': 60,
    'Extra aflossing hypotheek': 20,
  }
}

/**
 * Generates 12 months of mock spending history for a budget name.
 */
export function getMockHistory(budgetName: string): { month: string; budget: number; spent: number }[] {
  const now = new Date()
  const months: { month: string; budget: number; spent: number }[] = []

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = date.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
    const spending = getMockSpending(i)
    const defaults = getDefaultBudgets()

    let limit = 0
    for (const parent of defaults) {
      if (parent.name === budgetName) {
        limit = parent.default_limit
        break
      }
      for (const child of parent.children ?? []) {
        if (child.name === budgetName) {
          limit = child.default_limit
          break
        }
      }
      if (limit > 0) break
    }

    months.push({
      month: label,
      budget: limit,
      spent: spending[budgetName] ?? 0,
    })
  }

  return months
}
