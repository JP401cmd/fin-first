/**
 * Test persona definitions for superadmin testdata seeding.
 *
 * 4 personas at different financial life stages:
 * 1. Roos van Dijk — "In de rode cijfers" (deep in debt)
 * 2. Daan Bakker — "De starter" (young professional starting out)
 * 3. Lisa de Groot — "De 100K milestone" (family, hit 100K net worth)
 * 4. Willem Jansen — "Bijna binnen" (near financial independence)
 */

import { BUDGET_SLUGS } from '@/lib/budget-data'

const S = BUDGET_SLUGS

// ── Helper: relative date from today ──────────────────────────

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function monthsAgo(months: number, day = 1): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  d.setDate(day)
  return d.toISOString().split('T')[0]
}

// ── Types ─────────────────────────────────────────────────────

export type PersonaKey = 'roos' | 'daan' | 'lisa' | 'willem'

export interface PersonaMeta {
  name: string
  subtitle: string
  description: string
  color: string
  avatarColor: string
  netWorth: number
  income: number
  expenses: number
}

export interface PersonaProfile {
  full_name: string
  date_of_birth: string
  household_type: string
  temporal_balance: number
}

export interface PersonaBankAccount {
  name: string
  iban: string
  bank_name: string
  account_type: string
  balance: number
  is_active: boolean
  sort_order: number
}

export interface PersonaAsset {
  name: string
  asset_type: string
  current_value: number
  purchase_value: number
  purchase_date: string
  expected_return: number
  monthly_contribution: number
  institution: string
  // Type-specific fields (all optional)
  subtype?: string
  risk_profile?: string
  tax_benefit?: boolean
  is_liquid?: boolean
  lock_end_date?: string
  ticker_symbol?: string
  rental_income?: number
  woz_value?: number
  retirement_provider_type?: string
  depreciation_rate?: number
  address_postcode?: string
  address_house_number?: string
}

export interface PersonaDebt {
  name: string
  debt_type: string
  original_amount: number
  current_balance: number
  interest_rate: number
  minimum_payment: number
  monthly_payment: number
  start_date: string
  creditor: string
  // Type-specific fields (all optional)
  subtype?: string
  is_tax_deductible?: boolean
  fixed_rate_end_date?: string
  nhg?: boolean
  credit_limit?: number
  repayment_type?: string
  draagkrachtmeting_date?: string
  linked_asset_name?: string
}

export interface PersonaBudget {
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

export interface PersonaTransactionTemplate {
  dayOffset: number // days ago from today
  amount: number
  description: string
  counterparty_name: string
  counterparty_iban: string | null
  budgetSlug: string
  is_income: boolean
}

export interface PersonaGoal {
  name: string
  description: string
  goal_type: string
  target_value: number
  current_value: number
  target_date: string
  icon: string
  color: string
  is_completed: boolean
}

export interface PersonaLifeEvent {
  name: string
  event_type: string
  target_age: number | null
  target_date: string | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  icon: string
  is_active: boolean
  sort_order: number
}

export interface PersonaRecommendation {
  title: string
  description: string
  recommendation_type: string
  euro_impact_monthly: number
  euro_impact_yearly: number
  freedom_days_per_year: number
  related_budget_slug: string | null
  priority_score: number
  status: string
  suggested_actions: { title: string; description?: string; freedom_days_impact: number; euro_impact_monthly?: number }[]
  actions: {
    source: string
    title: string
    description: string
    freedom_days_impact: number
    euro_impact_monthly: number
    status: string
    priority_score: number
  }[]
}

export interface PersonaNetWorthSnapshot {
  monthsAgo: number
  total_assets: number
  total_debts: number
  net_worth: number
}

export interface PersonaData {
  meta: PersonaMeta
  profile: PersonaProfile
  bank_accounts: PersonaBankAccount[]
  assets: PersonaAsset[]
  debts: PersonaDebt[]
  budgets: PersonaBudget[]
  transactions: PersonaTransactionTemplate[]
  goals: PersonaGoal[]
  life_events: PersonaLifeEvent[]
  recommendations: PersonaRecommendation[]
  net_worth_snapshots: PersonaNetWorthSnapshot[]
}

// ── Shared budget structures ──────────────────────────────────

function makeBudgets(overrides: Record<string, number>): PersonaBudget[] {
  const base: PersonaBudget[] = [
    {
      name: 'Inkomen', slug: S.INKOMEN, icon: 'Wallet', description: 'Alle inkomstenbronnen',
      default_limit: overrides[S.INKOMEN] ?? 3367, budget_type: 'income', is_essential: true, priority_score: 5, sort_order: 0,
      children: [
        { name: 'Salaris & uitkering', slug: S.SALARIS_UITKERING, icon: 'Banknote', description: 'Netto salaris of uitkering', default_limit: overrides[S.SALARIS_UITKERING] ?? 2800 },
        { name: 'Toeslagen & kinderbijslag', slug: S.TOESLAGEN_KINDERBIJSLAG, icon: 'Baby', description: 'Overheidstoeslagen en kinderbijslag', default_limit: overrides[S.TOESLAGEN_KINDERBIJSLAG] ?? 200 },
        { name: 'Teruggave belasting', slug: S.TERUGGAVE_BELASTING, icon: 'Receipt', description: 'Belastingteruggave', default_limit: overrides[S.TERUGGAVE_BELASTING] ?? 0 },
        { name: 'Overige inkomsten', slug: S.OVERIGE_INKOMSTEN, icon: 'HandCoins', description: 'Bijverdiensten en overig', default_limit: overrides[S.OVERIGE_INKOMSTEN] ?? 0 },
      ],
    },
    {
      name: 'Vaste lasten wonen & energie', slug: S.VASTE_LASTEN_WONEN, icon: 'Home', description: 'Alle vaste woonlasten',
      default_limit: overrides[S.VASTE_LASTEN_WONEN] ?? 1150, budget_type: 'expense', is_essential: true, priority_score: 5, sort_order: 1,
      children: [
        { name: 'Huur / hypotheek', slug: S.HUUR_HYPOTHEEK, icon: 'Building2', description: 'Maandelijkse woonkosten', default_limit: overrides[S.HUUR_HYPOTHEEK] ?? 750 },
        { name: 'Gas, water, licht', slug: S.GAS_WATER_LICHT, icon: 'Zap', description: 'Energie en waterrekening', default_limit: overrides[S.GAS_WATER_LICHT] ?? 200 },
        { name: 'Verzekeringen wonen & gezondheid', slug: S.VERZEKERINGEN_WONEN, icon: 'ShieldCheck', description: 'Zorg-, woon- en inboedelverzekering', default_limit: overrides[S.VERZEKERINGEN_WONEN] ?? 150 },
        { name: 'Gemeentelijke & overige vaste lasten', slug: S.GEMEENTELIJKE_LASTEN, icon: 'Landmark', description: 'OZB, afvalstoffenheffing, rioolheffing', default_limit: overrides[S.GEMEENTELIJKE_LASTEN] ?? 50 },
      ],
    },
    {
      name: 'Dagelijkse uitgaven', slug: S.DAGELIJKSE_UITGAVEN, icon: 'ShoppingCart', description: 'Dagelijkse boodschappen en huishouden',
      default_limit: overrides[S.DAGELIJKSE_UITGAVEN] ?? 550, budget_type: 'expense', is_essential: true, priority_score: 5, sort_order: 2,
      children: [
        { name: 'Boodschappen', slug: S.BOODSCHAPPEN, icon: 'Store', description: 'Supermarkt en voeding', default_limit: overrides[S.BOODSCHAPPEN] ?? 400 },
        { name: 'Huishouden & verzorging', slug: S.HUISHOUDEN_VERZORGING, icon: 'SprayCan', description: 'Schoonmaak en persoonlijke verzorging', default_limit: overrides[S.HUISHOUDEN_VERZORGING] ?? 60 },
        { name: 'Kinderen & school/opvang', slug: S.KINDEREN_SCHOOL, icon: 'Baby', description: 'Schoolgeld, opvang, kinderkosten', default_limit: overrides[S.KINDEREN_SCHOOL] ?? 50 },
        { name: 'Medische kosten', slug: S.MEDISCHE_KOSTEN, icon: 'HeartPulse', description: 'Eigen risico, medicijnen, tandarts', default_limit: overrides[S.MEDISCHE_KOSTEN] ?? 40 },
      ],
    },
    {
      name: 'Vervoer', slug: S.VERVOER, icon: 'Car', description: 'Alle vervoerskosten',
      default_limit: overrides[S.VERVOER] ?? 200, budget_type: 'expense', is_essential: true, priority_score: 4, sort_order: 3,
      children: [
        { name: 'Brandstof / laden & OV', slug: S.BRANDSTOF_OV, icon: 'Fuel', description: 'Benzine, elektrisch laden, OV', default_limit: overrides[S.BRANDSTOF_OV] ?? 80 },
        { name: 'Auto vaste lasten', slug: S.AUTO_VASTE_LASTEN, icon: 'CarFront', description: 'Wegenbelasting, verzekering, leasekosten', default_limit: overrides[S.AUTO_VASTE_LASTEN] ?? 70 },
        { name: 'Auto onderhoud & parkeren', slug: S.AUTO_ONDERHOUD, icon: 'Wrench', description: 'APK, reparaties, parkeren', default_limit: overrides[S.AUTO_ONDERHOUD] ?? 30 },
        { name: 'Fiets / deelvervoer', slug: S.FIETS_DEELVERVOER, icon: 'Bike', description: 'Fietsonderhoud, deelscooter', default_limit: overrides[S.FIETS_DEELVERVOER] ?? 20 },
      ],
    },
    {
      name: 'Leuke dingen & lifestyle', slug: S.LEUKE_DINGEN, icon: 'PartyPopper', description: 'Ontspanning, hobby\'s en plezier',
      default_limit: overrides[S.LEUKE_DINGEN] ?? 350, budget_type: 'expense', is_essential: false, priority_score: 2, sort_order: 4,
      children: [
        { name: 'Uit eten, horeca & afhalen', slug: S.UIT_ETEN_HORECA, icon: 'UtensilsCrossed', description: 'Restaurants, cafes, bezorging', default_limit: overrides[S.UIT_ETEN_HORECA] ?? 100 },
        { name: 'Vrije tijd, hobby\'s & sport', slug: S.VRIJE_TIJD_SPORT, icon: 'Dumbbell', description: 'Sport, streaming, hobby\'s', default_limit: overrides[S.VRIJE_TIJD_SPORT] ?? 80 },
        { name: 'Vakantie & weekendjes weg', slug: S.VAKANTIE, icon: 'Palmtree', description: 'Vakanties en uitstapjes', default_limit: overrides[S.VAKANTIE] ?? 100 },
        { name: 'Kleding & overige', slug: S.KLEDING_OVERIGE, icon: 'Shirt', description: 'Kleding, schoenen, accessoires', default_limit: overrides[S.KLEDING_OVERIGE] ?? 70 },
      ],
    },
    {
      name: 'Sparen & investeren', slug: S.SPAREN_SCHULDEN, icon: 'PiggyBank', description: 'Vermogensopbouw en buffer',
      default_limit: overrides[S.SPAREN_SCHULDEN] ?? 180, budget_type: 'savings', is_essential: true, priority_score: 4, sort_order: 5,
      children: [
        { name: 'Sparen & noodbuffer', slug: S.SPAREN_NOODBUFFER, icon: 'Vault', description: 'Noodfonds en spaargeld', default_limit: overrides[S.SPAREN_NOODBUFFER] ?? 100 },
        { name: 'Investeren / FIRE / pensioen', slug: S.INVESTEREN_FIRE, icon: 'TrendingUp', description: 'Beleggingen en pensioenopbouw', default_limit: overrides[S.INVESTEREN_FIRE] ?? 80 },
      ],
    },
    {
      name: 'Schulden & aflossingen', slug: S.SCHULDEN_AFLOSSINGEN_PARENT, icon: 'CreditCard', description: 'Schulden aflossen en hypotheek',
      default_limit: overrides[S.SCHULDEN_AFLOSSINGEN_PARENT] ?? 60, budget_type: 'debt', is_essential: true, priority_score: 4, sort_order: 6,
      children: [
        { name: 'Schulden & aflossingen', slug: S.SCHULDEN_AFLOSSINGEN, icon: 'CreditCard', description: 'Leningen en schulden aflossen', default_limit: overrides[S.SCHULDEN_AFLOSSINGEN] ?? 60 },
        { name: 'Extra aflossing hypotheek', slug: S.EXTRA_AFLOSSING_HYPOTHEEK, icon: 'HomeIcon', description: 'Vrijwillige extra hypotheekaflossing', default_limit: overrides[S.EXTRA_AFLOSSING_HYPOTHEEK] ?? 0 },
      ],
    },
  ]
  return base
}

// ── Helper: generate monthly recurring transactions ───────────

function generateMonthlyTransactions(
  monthCount: number,
  templates: {
    day: number
    amount: number
    description: string
    counterparty_name: string
    counterparty_iban: string | null
    budgetSlug: string
    is_income: boolean
  }[],
): PersonaTransactionTemplate[] {
  const result: PersonaTransactionTemplate[] = []
  const today = new Date()

  for (let m = 0; m < monthCount; m++) {
    for (const t of templates) {
      const d = new Date(today.getFullYear(), today.getMonth() - m, t.day)
      if (d > today) continue
      const diffTime = today.getTime() - d.getTime()
      const dayOffset = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      result.push({
        dayOffset,
        amount: t.amount,
        description: `${t.description} ${d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`,
        counterparty_name: t.counterparty_name,
        counterparty_iban: t.counterparty_iban,
        budgetSlug: t.budgetSlug,
        is_income: t.is_income,
      })
    }
  }
  return result
}

function generateGroceryTransactions(
  monthCount: number,
  avgPerWeek: number,
  variance: number,
): PersonaTransactionTemplate[] {
  const result: PersonaTransactionTemplate[] = []
  const today = new Date()
  const shops = [
    { name: 'Albert Heijn', desc: 'Albert Heijn' },
    { name: 'Jumbo', desc: 'Jumbo' },
    { name: 'Lidl', desc: 'Lidl' },
    { name: 'Aldi', desc: 'Aldi' },
  ]

  for (let m = 0; m < monthCount; m++) {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() - m + 1, 0).getDate()
    // ~4 shopping trips per month
    for (let trip = 0; trip < 4; trip++) {
      const tripDay = Math.min(3 + trip * 7 + Math.floor(Math.random() * 3), daysInMonth)
      const d = new Date(today.getFullYear(), today.getMonth() - m, tripDay)
      if (d > today) continue
      const diffTime = today.getTime() - d.getTime()
      const dayOffset = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      const shop = shops[trip % shops.length]
      const amount = -(avgPerWeek + (Math.random() - 0.5) * 2 * variance)

      result.push({
        dayOffset,
        amount: Math.round(amount * 100) / 100,
        description: `${shop.desc} boodschappen`,
        counterparty_name: shop.name,
        counterparty_iban: null,
        budgetSlug: S.BOODSCHAPPEN,
        is_income: false,
      })
    }
  }
  return result
}

// ══════════════════════════════════════════════════════════════
// PERSONA 1: Roos van Dijk — "In de rode cijfers"
// ══════════════════════════════════════════════════════════════

const rooseTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(6, [
    // Inkomen
    { day: 25, amount: 2800, description: 'Salaris', counterparty_name: 'Logistiek Centrum BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    // Vaste lasten
    { day: 1, amount: -950, description: 'Huur', counterparty_name: 'Vestia Woningen', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -220, description: 'Energie', counterparty_name: 'Eneco', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { day: 1, amount: -135, description: 'Zorgverzekering', counterparty_name: 'CZ', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -40, description: 'Inboedelverzekering', counterparty_name: 'Centraal Beheer', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -55, description: 'Gemeentelijke lasten', counterparty_name: 'Gemeente Rotterdam', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -180, description: 'Private lease auto', counterparty_name: 'LeasePlan', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 10, amount: -85, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { day: 25, amount: -55, description: 'Brandstof', counterparty_name: 'TotalEnergies', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    // Leuke dingen (te veel!)
    { day: 5, amount: -65, description: 'Thuisbezorgd', counterparty_name: 'Thuisbezorgd', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { day: 12, amount: -85, description: 'Uit eten restaurant', counterparty_name: 'Restaurant De Hoek', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { day: 20, amount: -45, description: 'Uber Eats', counterparty_name: 'Uber Eats', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { day: 7, amount: -12.99, description: 'Netflix', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 7, amount: -10.99, description: 'Spotify', counterparty_name: 'Spotify', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 7, amount: -13.99, description: 'Disney+', counterparty_name: 'Disney+', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 18, amount: -75, description: 'Kleding', counterparty_name: 'Zalando', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    // Huishouden
    { day: 8, amount: -25, description: 'Kruidvat', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { day: 22, amount: -30, description: 'Action', counterparty_name: 'Action', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    // Schulden aflossing (minimum)
    { day: 28, amount: -75, description: 'Minimum betaling creditcard', counterparty_name: 'ICS Visa', counterparty_iban: 'NL20INGB0001234568', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
    { day: 1, amount: -200, description: 'Aflossing persoonlijke lening', counterparty_name: 'Santander', counterparty_iban: 'NL86INGB0002445500', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
  ]),
  ...generateGroceryTransactions(6, 95, 25), // High grocery spending
]

const roosData: PersonaData = {
  meta: {
    name: 'Roos van Dijk',
    subtitle: 'In de rode cijfers',
    description: 'Na een scheiding en jarenlang onbewust consumeren zit Roos diep in de schulden. Uitgaven overstijgen zijn inkomen.',
    color: 'red',
    avatarColor: '#EF4444',
    netWorth: -22300,
    income: 2800,
    expenses: 3200,
  },
  profile: {
    full_name: 'Roos van Dijk',
    date_of_birth: '1986-03-15',
    household_type: 'solo',
    temporal_balance: 1,
  },
  bank_accounts: [
    { name: 'Betaalrekening ING', iban: 'NL91INGB0001234567', bank_name: 'ING', account_type: 'checking', balance: 245, is_active: true, sort_order: 0 },
    { name: 'Tweede rekening ABN', iban: 'NL02ABNA0450884700', bank_name: 'ABN AMRO', account_type: 'checking', balance: -180, is_active: true, sort_order: 1 },
  ],
  assets: [
    { name: 'Auto (private lease)', asset_type: 'vehicle', current_value: 0, purchase_value: 0, purchase_date: '2024-01-01', expected_return: 0, monthly_contribution: 0, institution: 'LeasePlan', subtype: 'auto_financial_lease', depreciation_rate: 15 },
    { name: 'Inboedel', asset_type: 'physical', current_value: 3500, purchase_value: 8000, purchase_date: '2020-01-01', expected_return: -10, monthly_contribution: 0, institution: '', subtype: 'inboedel' },
  ],
  debts: [
    { name: 'Creditcard ICS Visa', debt_type: 'credit_card', original_amount: 5000, current_balance: 4800, interest_rate: 14.0, minimum_payment: 75, monthly_payment: 75, start_date: '2024-06-01', creditor: 'ICS', subtype: 'regulier', credit_limit: 5000 },
    { name: 'Persoonlijke lening Santander', debt_type: 'personal_loan', original_amount: 15000, current_balance: 12500, interest_rate: 7.9, minimum_payment: 200, monthly_payment: 200, start_date: '2023-01-01', creditor: 'Santander', subtype: 'aflopend' },
    { name: 'Achterstallige energierekening', debt_type: 'payment_plan', original_amount: 1500, current_balance: 1200, interest_rate: 0, minimum_payment: 50, monthly_payment: 50, start_date: '2025-06-01', creditor: 'Eneco' },
  ],
  budgets: makeBudgets({
    [S.INKOMEN]: 2800, [S.SALARIS_UITKERING]: 2800,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 0,
    [S.VASTE_LASTEN_WONEN]: 1400, [S.HUUR_HYPOTHEEK]: 950, [S.GAS_WATER_LICHT]: 220,
    [S.VERZEKERINGEN_WONEN]: 175, [S.GEMEENTELIJKE_LASTEN]: 55,
    [S.DAGELIJKSE_UITGAVEN]: 530, [S.BOODSCHAPPEN]: 380, [S.HUISHOUDEN_VERZORGING]: 55,
    [S.KINDEREN_SCHOOL]: 0, [S.MEDISCHE_KOSTEN]: 95,
    [S.VERVOER]: 390, [S.BRANDSTOF_OV]: 140, [S.AUTO_VASTE_LASTEN]: 180,
    [S.AUTO_ONDERHOUD]: 50, [S.FIETS_DEELVERVOER]: 20,
    [S.LEUKE_DINGEN]: 555, [S.UIT_ETEN_HORECA]: 195, [S.VRIJE_TIJD_SPORT]: 100,
    [S.VAKANTIE]: 150, [S.KLEDING_OVERIGE]: 110,
    [S.SPAREN_SCHULDEN]: 0, [S.SPAREN_NOODBUFFER]: 0, [S.INVESTEREN_FIRE]: 0,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 325, [S.SCHULDEN_AFLOSSINGEN]: 325, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: rooseTransactions,
  goals: [
    { name: 'Creditcard schuld aflossen', description: 'Creditcard schuld van ICS Visa volledig aflossen', goal_type: 'debt_payoff', target_value: 4800, current_value: 200, target_date: monthsAgo(-24), icon: 'CreditCard', color: 'red', is_completed: false },
    { name: 'Noodfonds opbouwen', description: 'Een noodfonds van 1 maand uitgaven opbouwen', goal_type: 'savings', target_value: 3200, current_value: 0, target_date: monthsAgo(-18), icon: 'ShieldCheck', color: 'amber', is_completed: false },
  ],
  life_events: [
    { name: 'Scheiding afgerond', event_type: 'custom', target_age: 38, target_date: '2024-03-15', one_time_cost: 3500, monthly_cost_change: 400, monthly_income_change: 0, duration_months: 0, icon: 'HeartCrack', is_active: false, sort_order: 0 },
    { name: 'Schuldhulpverlening overwegen', event_type: 'custom', target_age: null, target_date: monthsAgo(-6), one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 12, icon: 'LifeBuoy', is_active: true, sort_order: 1 },
  ],
  recommendations: [
    {
      title: 'Stop onnodige streaming abonnementen',
      description: 'Je betaalt voor Netflix, Spotify en Disney+. Door 2 van de 3 op te zeggen bespaar je direct. Kies 1 dienst en wissel eventueel per kwartaal.',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: 24,
      euro_impact_yearly: 288,
      freedom_days_per_year: 3,
      related_budget_slug: S.VRIJE_TIJD_SPORT,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Zeg Disney+ op', freedom_days_impact: 1, euro_impact_monthly: 14 },
        { title: 'Zeg Spotify op (gebruik gratis versie)', freedom_days_impact: 1, euro_impact_monthly: 11 },
      ],
      actions: [
        { source: 'ai', title: 'Zeg Disney+ op', description: 'Ga naar je Disney+ account en zeg het abonnement op', freedom_days_impact: 1, euro_impact_monthly: 14, status: 'open', priority_score: 3 },
        { source: 'ai', title: 'Zeg Spotify op', description: 'Schakel over naar de gratis versie van Spotify', freedom_days_impact: 1, euro_impact_monthly: 11, status: 'open', priority_score: 3 },
      ],
    },
    {
      title: 'Verminder bezorgmaaltijden',
      description: 'Je geeft gemiddeld 195 per maand uit aan horeca en bezorging. Door zelf te koken en maximaal 1x per week te bestellen kun je dit halveren.',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: 100,
      euro_impact_yearly: 1200,
      freedom_days_per_year: 13,
      related_budget_slug: S.UIT_ETEN_HORECA,
      priority_score: 4,
      status: 'pending',
      suggested_actions: [
        { title: 'Stel een weekmenu samen', freedom_days_impact: 5, euro_impact_monthly: 50 },
        { title: 'Beperk bezorging tot 1x per week', freedom_days_impact: 4, euro_impact_monthly: 50 },
      ],
      actions: [
        { source: 'ai', title: 'Stel een weekmenu samen', description: 'Plan je maaltijden voor de week en doe 1 grote boodschap', freedom_days_impact: 5, euro_impact_monthly: 50, status: 'open', priority_score: 4 },
        { source: 'ai', title: 'Verwijder bezorgapps van je telefoon', description: 'Verwijder Thuisbezorgd en Uber Eats van je telefoon om impulsbestellingen te voorkomen', freedom_days_impact: 4, euro_impact_monthly: 50, status: 'open', priority_score: 4 },
      ],
    },
    {
      title: 'Creditcard schuld prioriteren boven lening',
      description: 'Je creditcard heeft 14% rente versus 7.9% op je persoonlijke lening. Los eerst de creditcard af door elke euro extra daar naartoe te sturen.',
      recommendation_type: 'debt_acceleration',
      euro_impact_monthly: 35,
      euro_impact_yearly: 420,
      freedom_days_per_year: 4,
      related_budget_slug: null,
      priority_score: 5,
      status: 'pending',
      suggested_actions: [
        { title: 'Verhoog creditcard aflossing naar 150/mnd', freedom_days_impact: 4 },
      ],
      actions: [
        { source: 'ai', title: 'Verhoog creditcard aflossing', description: 'Verhoog de maandelijkse aflossing van je ICS Visa creditcard van 75 naar minimaal 150', freedom_days_impact: 4, euro_impact_monthly: 35, status: 'open', priority_score: 5 },
      ],
    },
  ],
  net_worth_snapshots: [
    { monthsAgo: 5, total_assets: 3800, total_debts: 19500, net_worth: -15700 },
    { monthsAgo: 4, total_assets: 3700, total_debts: 20200, net_worth: -16500 },
    { monthsAgo: 3, total_assets: 3600, total_debts: 20800, net_worth: -17200 },
    { monthsAgo: 2, total_assets: 3550, total_debts: 21000, net_worth: -17450 },
    { monthsAgo: 1, total_assets: 3500, total_debts: 21800, net_worth: -18300 },
    { monthsAgo: 0, total_assets: 3500, total_debts: 18500, net_worth: -22300 },
  ],
}

// ══════════════════════════════════════════════════════════════
// PERSONA 2: Daan Bakker — "De starter"
// ══════════════════════════════════════════════════════════════

const daanTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(6, [
    // Inkomen
    { day: 25, amount: 3400, description: 'Salaris', counterparty_name: 'TechFlow BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    // Vaste lasten
    { day: 1, amount: -650, description: 'Huur kamer', counterparty_name: 'Hoofdhuurder M. Peters', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -75, description: 'Energie bijdrage', counterparty_name: 'Hoofdhuurder M. Peters', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { day: 1, amount: -130, description: 'Zorgverzekering', counterparty_name: 'Zilveren Kruis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    // Vervoer (OV)
    { day: 1, amount: -35, description: 'NS Flex abonnement', counterparty_name: 'NS Reizigers', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    // Leuke dingen (zuinig)
    { day: 7, amount: -12.99, description: 'Netflix', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -29.90, description: 'Basic-Fit', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 10, amount: -35, description: 'Uit eten met vrienden', counterparty_name: 'Cafe De Buren', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    // Huishouden
    { day: 15, amount: -20, description: 'Kruidvat', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    // Sparen (bewust)
    { day: 1, amount: -500, description: 'Sparen noodfonds', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -200, description: 'Meesman indexbeleggen', counterparty_name: 'Meesman', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { day: 1, amount: -100, description: 'Aflossing studielening DUO', counterparty_name: 'DUO', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
  ]),
  ...generateGroceryTransactions(6, 55, 15), // Low grocery spending
]

const daanData: PersonaData = {
  meta: {
    name: 'Daan Bakker',
    subtitle: 'De starter',
    description: 'Software developer, 2 jaar aan het werk. Leest over FIRE, spaart bewust. Doel: noodfonds van 10.000 vullen.',
    color: 'teal',
    avatarColor: '#14B8A6',
    netWorth: -2300,
    income: 3400,
    expenses: 2100,
  },
  profile: {
    full_name: 'Daan Bakker',
    date_of_birth: '2000-01-22',
    household_type: 'solo',
    temporal_balance: 3,
  },
  bank_accounts: [
    { name: 'Betaalrekening ING', iban: 'NL91INGB0001234567', bank_name: 'ING', account_type: 'checking', balance: 1850, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening ING', iban: 'NL11INGB0001234568', bank_name: 'ING', account_type: 'savings', balance: 6200, is_active: true, sort_order: 1 },
  ],
  assets: [
    { name: 'Spaarrekening noodfonds', asset_type: 'savings', current_value: 6200, purchase_value: 0, purchase_date: '2024-06-01', expected_return: 2.8, monthly_contribution: 500, institution: 'ING', subtype: 'vrij_opneembaar', risk_profile: 'laag', is_liquid: true },
    { name: 'Meesman Wereldwijd Totaal', asset_type: 'investment', current_value: 5400, purchase_value: 4800, purchase_date: '2024-09-01', expected_return: 7, monthly_contribution: 200, institution: 'Meesman', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'MEESMAN-WWT' },
  ],
  debts: [
    { name: 'Studielening DUO', debt_type: 'student_loan', original_amount: 14000, current_balance: 13900, interest_rate: 0.46, minimum_payment: 0, monthly_payment: 100, start_date: '2024-01-01', creditor: 'DUO', subtype: 'nieuw_stelsel', draagkrachtmeting_date: '2026-09-01' },
  ],
  budgets: makeBudgets({
    [S.INKOMEN]: 3400, [S.SALARIS_UITKERING]: 3400,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 0,
    [S.VASTE_LASTEN_WONEN]: 855, [S.HUUR_HYPOTHEEK]: 650, [S.GAS_WATER_LICHT]: 75,
    [S.VERZEKERINGEN_WONEN]: 130, [S.GEMEENTELIJKE_LASTEN]: 0,
    [S.DAGELIJKSE_UITGAVEN]: 280, [S.BOODSCHAPPEN]: 220, [S.HUISHOUDEN_VERZORGING]: 20,
    [S.KINDEREN_SCHOOL]: 0, [S.MEDISCHE_KOSTEN]: 40,
    [S.VERVOER]: 55, [S.BRANDSTOF_OV]: 35, [S.AUTO_VASTE_LASTEN]: 0,
    [S.AUTO_ONDERHOUD]: 0, [S.FIETS_DEELVERVOER]: 20,
    [S.LEUKE_DINGEN]: 200, [S.UIT_ETEN_HORECA]: 60, [S.VRIJE_TIJD_SPORT]: 50,
    [S.VAKANTIE]: 60, [S.KLEDING_OVERIGE]: 30,
    [S.SPAREN_SCHULDEN]: 700, [S.SPAREN_NOODBUFFER]: 500, [S.INVESTEREN_FIRE]: 200,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 100, [S.SCHULDEN_AFLOSSINGEN]: 100, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: daanTransactions,
  goals: [
    { name: 'Noodfonds 10.000', description: 'Een noodfonds van 10.000 opbouwen voor 6 maanden buffer', goal_type: 'savings', target_value: 10000, current_value: 6200, target_date: monthsAgo(-8), icon: 'ShieldCheck', color: 'teal', is_completed: false },
    { name: 'Eerste 25K belegd', description: 'Een beleggingsportefeuille van 25.000 opbouwen', goal_type: 'net_worth', target_value: 25000, current_value: 5400, target_date: monthsAgo(-60), icon: 'TrendingUp', color: 'emerald', is_completed: false },
  ],
  life_events: [
    { name: 'Eerste baan gestart', event_type: 'career_change', target_age: 24, target_date: '2024-02-01', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 3400, duration_months: 0, icon: 'Briefcase', is_active: false, sort_order: 0 },
    { name: 'Eigen woning kopen', event_type: 'move', target_age: 30, target_date: '2030-01-01', one_time_cost: 25000, monthly_cost_change: 200, monthly_income_change: 0, duration_months: 0, icon: 'Home', is_active: true, sort_order: 1 },
  ],
  recommendations: [
    {
      title: 'Verhoog DUO aflossing strategisch',
      description: 'Je studielening heeft slechts 0.46% rente. Het is slimmer om het minimumbedrag te betalen en extra geld te beleggen voor hoger rendement.',
      recommendation_type: 'debt_acceleration',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 2,
      related_budget_slug: null,
      priority_score: 2,
      status: 'pending',
      suggested_actions: [
        { title: 'Verlaag DUO aflossing naar 0', description: 'Vraag uitstel aan bij DUO en beleg het verschil', freedom_days_impact: 2 },
      ],
      actions: [
        { source: 'ai', title: 'Bekijk DUO aflossingsopties', description: 'Log in op Mijn DUO en bekijk of je de aflossing kunt verlagen', freedom_days_impact: 2, euro_impact_monthly: 100, status: 'open', priority_score: 2 },
      ],
    },
    {
      title: 'Overweeg zakelijke uitgaven via werkgever',
      description: 'Als developer kun je mogelijk een thuiswerkvergoeding en reiskostenvergoeding krijgen. Dit is netto extra inkomen.',
      recommendation_type: 'income_increase',
      euro_impact_monthly: 75,
      euro_impact_yearly: 900,
      freedom_days_per_year: 10,
      related_budget_slug: null,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Vraag thuiswerkvergoeding aan', description: 'Bespreek met HR of je in aanmerking komt', freedom_days_impact: 5, euro_impact_monthly: 40 },
        { title: 'Claim reiskostenvergoeding', description: 'Vraag OV-vergoeding aan als je niet al hebt', freedom_days_impact: 5, euro_impact_monthly: 35 },
      ],
      actions: [
        { source: 'ai', title: 'Mail HR over vergoedingen', description: 'Stuur een mail naar HR met de vraag over thuiswerk- en reiskostenvergoeding', freedom_days_impact: 10, euro_impact_monthly: 75, status: 'open', priority_score: 3 },
      ],
    },
  ],
  net_worth_snapshots: [
    { monthsAgo: 5, total_assets: 7200, total_debts: 14000, net_worth: -6800 },
    { monthsAgo: 4, total_assets: 8000, total_debts: 14000, net_worth: -6000 },
    { monthsAgo: 3, total_assets: 8900, total_debts: 13980, net_worth: -5080 },
    { monthsAgo: 2, total_assets: 9800, total_debts: 13960, net_worth: -4160 },
    { monthsAgo: 1, total_assets: 10700, total_debts: 13940, net_worth: -3240 },
    { monthsAgo: 0, total_assets: 11600, total_debts: 13900, net_worth: -2300 },
  ],
}

// ══════════════════════════════════════════════════════════════
// PERSONA 3: Lisa de Groot — "De 100K milestone"
// ══════════════════════════════════════════════════════════════

const lisaTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(6, [
    // Inkomen
    { day: 25, amount: 4200, description: 'Salaris', counterparty_name: 'ProjectHuis BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 5, amount: 400, description: 'Kinderbijslag', counterparty_name: 'SVB', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, is_income: true },
    { day: 20, amount: 600, description: 'Freelance opdracht', counterparty_name: 'Diverse opdrachtgevers', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    // Vaste lasten
    { day: 1, amount: -1100, description: 'Hypotheek', counterparty_name: 'Rabobank Hypotheken', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -180, description: 'Energie', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { day: 1, amount: -165, description: 'Zorgverzekering gezin', counterparty_name: 'Menzis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -45, description: 'Opstal + inboedelverzekering', counterparty_name: 'Interpolis', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -65, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Utrecht', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Kinderen
    { day: 1, amount: -350, description: 'Kinderopvang', counterparty_name: 'Kinderopvang De Boomhut', counterparty_iban: 'NL55RABO0150000001', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    // Medisch
    { day: 12, amount: -35, description: 'Apotheek', counterparty_name: 'Apotheek Utrecht', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -85, description: 'Autoverzekering', counterparty_name: 'FBTO', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 8, amount: -65, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { day: 22, amount: -45, description: 'Brandstof', counterparty_name: 'TotalEnergies', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    // Leuke dingen
    { day: 10, amount: -65, description: 'Uit eten gezin', counterparty_name: 'Restaurant La Cucina', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { day: 7, amount: -15.99, description: 'Netflix gezinsabonnement', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -34.90, description: 'Basic-Fit duo', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 18, amount: -45, description: 'Kleding kinderen', counterparty_name: 'H&M', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    // Huishouden
    { day: 8, amount: -35, description: 'Kruidvat', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { day: 20, amount: -25, description: 'Action', counterparty_name: 'Action', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    // Sparen & beleggen
    { day: 1, amount: -200, description: 'Spaarrekening gezin', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -400, description: 'Meesman gezamenlijk', counterparty_name: 'Meesman', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { day: 1, amount: -50, description: 'Extra aflossing hypotheek', counterparty_name: 'Rabobank', counterparty_iban: 'NL02ABNA0450884701', budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, is_income: false },
  ]),
  ...generateGroceryTransactions(6, 120, 30), // Family grocery spending
]

const lisaData: PersonaData = {
  meta: {
    name: 'Lisa de Groot',
    subtitle: 'De 100K milestone',
    description: 'Projectmanager, getrouwd, 2 kinderen. Na jaren hard werken net 100K netto vermogen bereikt.',
    color: 'amber',
    avatarColor: '#D4A843',
    netWorth: 100000,
    income: 5200,
    expenses: 4000,
  },
  profile: {
    full_name: 'Lisa de Groot',
    date_of_birth: '1981-07-08',
    household_type: 'gezin',
    temporal_balance: 3,
  },
  bank_accounts: [
    { name: 'Gezamenlijke rekening Rabo', iban: 'NL39RABO0300065264', bank_name: 'Rabobank', account_type: 'checking', balance: 3200, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening gezin', iban: 'NL11RABO0100000002', bank_name: 'Rabobank', account_type: 'savings', balance: 15000, is_active: true, sort_order: 1 },
    { name: 'Eigen betaalrekening', iban: 'NL91INGB0001234567', bank_name: 'ING', account_type: 'checking', balance: 850, is_active: true, sort_order: 2 },
  ],
  assets: [
    { name: 'Spaarrekening gezin', asset_type: 'savings', current_value: 15000, purchase_value: 0, purchase_date: '2019-01-01', expected_return: 2.5, monthly_contribution: 200, institution: 'Rabobank', subtype: 'vrij_opneembaar', risk_profile: 'laag', is_liquid: true },
    { name: 'Meesman Wereldwijd Totaal', asset_type: 'investment', current_value: 42000, purchase_value: 33600, purchase_date: '2020-03-01', expected_return: 7, monthly_contribution: 400, institution: 'Meesman', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'MEESMAN-WWT' },
    { name: 'Woning Utrecht', asset_type: 'eigen_huis', current_value: 385000, purchase_value: 285000, purchase_date: '2015-06-01', expected_return: 3.5, monthly_contribution: 0, institution: '', woz_value: 385000, address_postcode: '3581 KP', address_house_number: '24' },
    { name: 'Auto Toyota Corolla', asset_type: 'vehicle', current_value: 8000, purchase_value: 24000, purchase_date: '2022-03-01', expected_return: -12, monthly_contribution: 0, institution: '', subtype: 'auto_eigendom', depreciation_rate: 12 },
  ],
  debts: [
    { name: 'Hypotheek woning Utrecht', debt_type: 'mortgage', original_amount: 320000, current_balance: 350000, interest_rate: 2.9, minimum_payment: 1100, monthly_payment: 1100, start_date: '2015-06-01', creditor: 'Rabobank', subtype: 'annuiteit', is_tax_deductible: true, nhg: false, linked_asset_name: 'Woning Utrecht' },
  ],
  budgets: makeBudgets({
    [S.INKOMEN]: 5200, [S.SALARIS_UITKERING]: 4200,
    [S.TOESLAGEN_KINDERBIJSLAG]: 400, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 600,
    [S.VASTE_LASTEN_WONEN]: 1455, [S.HUUR_HYPOTHEEK]: 1100, [S.GAS_WATER_LICHT]: 180,
    [S.VERZEKERINGEN_WONEN]: 210, [S.GEMEENTELIJKE_LASTEN]: 65,
    [S.DAGELIJKSE_UITGAVEN]: 900, [S.BOODSCHAPPEN]: 480, [S.HUISHOUDEN_VERZORGING]: 60,
    [S.KINDEREN_SCHOOL]: 350, [S.MEDISCHE_KOSTEN]: 35,
    [S.VERVOER]: 265, [S.BRANDSTOF_OV]: 110, [S.AUTO_VASTE_LASTEN]: 85,
    [S.AUTO_ONDERHOUD]: 50, [S.FIETS_DEELVERVOER]: 20,
    [S.LEUKE_DINGEN]: 300, [S.UIT_ETEN_HORECA]: 80, [S.VRIJE_TIJD_SPORT]: 55,
    [S.VAKANTIE]: 120, [S.KLEDING_OVERIGE]: 45,
    [S.SPAREN_SCHULDEN]: 600, [S.SPAREN_NOODBUFFER]: 200, [S.INVESTEREN_FIRE]: 400,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 50, [S.SCHULDEN_AFLOSSINGEN]: 0, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 50,
  }),
  transactions: lisaTransactions,
  goals: [
    { name: 'Netto vermogen 250K', description: 'Het volgende grote doel: een kwart miljoen netto vermogen', goal_type: 'net_worth', target_value: 250000, current_value: 100000, target_date: monthsAgo(-60), icon: 'Target', color: 'amber', is_completed: false },
    { name: 'Studiefonds kinderen', description: 'Een studiefonds van 20.000 per kind opbouwen', goal_type: 'savings', target_value: 40000, current_value: 8000, target_date: monthsAgo(-120), icon: 'GraduationCap', color: 'purple', is_completed: false },
  ],
  life_events: [
    { name: 'Kinderen naar middelbare school', event_type: 'children', target_age: 48, target_date: '2029-09-01', one_time_cost: 1500, monthly_cost_change: -200, monthly_income_change: 0, duration_months: 72, icon: 'GraduationCap', is_active: true, sort_order: 0 },
    { name: 'Sabbatical jaar', event_type: 'sabbatical', target_age: 50, target_date: '2031-07-01', one_time_cost: 5000, monthly_cost_change: 500, monthly_income_change: -4200, duration_months: 6, icon: 'Palmtree', is_active: true, sort_order: 1 },
  ],
  recommendations: [
    {
      title: 'Verhoog beleggingsinleg na kinderopvangtoeslag',
      description: 'Wanneer de kinderen naar school gaan, valt 350/mnd kinderopvangkosten weg. Plan nu al om dit bedrag naar beleggingen te sturen.',
      recommendation_type: 'savings_boost',
      euro_impact_monthly: 350,
      euro_impact_yearly: 4200,
      freedom_days_per_year: 45,
      related_budget_slug: S.INVESTEREN_FIRE,
      priority_score: 4,
      status: 'pending',
      suggested_actions: [
        { title: 'Stel automatische verhoging Meesman in', freedom_days_impact: 45, euro_impact_monthly: 350 },
      ],
      actions: [
        { source: 'ai', title: 'Plan Meesman verhoging', description: 'Zet een reminder om de Meesman inleg te verhogen zodra de kinderopvangkosten wegvallen', freedom_days_impact: 45, euro_impact_monthly: 350, status: 'open', priority_score: 4 },
      ],
    },
    {
      title: 'Overweeg hypotheek oversluiten',
      description: 'Je huidige hypotheekrente is 2.9%. De markt biedt momenteel lagere tarieven. Bij oversluiting kun je mogelijk 80-120/mnd besparen.',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: 100,
      euro_impact_yearly: 1200,
      freedom_days_per_year: 13,
      related_budget_slug: S.HUUR_HYPOTHEEK,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Vraag offertes op bij 3 hypotheekverstrekkers', freedom_days_impact: 13 },
      ],
      actions: [
        { source: 'ai', title: 'Vergelijk hypotheekrentes', description: 'Gebruik Independer of Hypotheker om actuele rentes te vergelijken met je huidige tarief', freedom_days_impact: 13, euro_impact_monthly: 100, status: 'open', priority_score: 3 },
      ],
    },
    {
      title: 'Start een studiefonds via beleggingen',
      description: 'In plaats van sparen op een spaarrekening, beleg het studiefonds in een breed gespreid indexfonds. Over 10+ jaar levert dit significant meer op.',
      recommendation_type: 'asset_reallocation',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 8,
      related_budget_slug: null,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Open apart beleggingsaccount voor studiefonds', freedom_days_impact: 8 },
      ],
      actions: [
        { source: 'ai', title: 'Open Meesman kindrekening', description: 'Open een aparte Meesman rekening op naam van de kinderen', freedom_days_impact: 8, euro_impact_monthly: 0, status: 'open', priority_score: 3 },
      ],
    },
  ],
  net_worth_snapshots: [
    { monthsAgo: 5, total_assets: 437500, total_debts: 350000, net_worth: 87500 },
    { monthsAgo: 4, total_assets: 440000, total_debts: 350000, net_worth: 90000 },
    { monthsAgo: 3, total_assets: 443000, total_debts: 350000, net_worth: 93000 },
    { monthsAgo: 2, total_assets: 445500, total_debts: 350000, net_worth: 95500 },
    { monthsAgo: 1, total_assets: 447800, total_debts: 350000, net_worth: 97800 },
    { monthsAgo: 0, total_assets: 450000, total_debts: 350000, net_worth: 100000 },
  ],
}

// ══════════════════════════════════════════════════════════════
// PERSONA 4: Willem Jansen — "Bijna binnen"
// ══════════════════════════════════════════════════════════════

const willemTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(6, [
    // Inkomen
    { day: 25, amount: 5500, description: 'Salaris', counterparty_name: 'Consultancy Partners BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 5, amount: 500, description: 'Dividenduitkering', counterparty_name: 'DEGIRO', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    { day: 10, amount: 500, description: 'Huurinkomsten garage', counterparty_name: 'Huurder J. Smit', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    // Vaste lasten (hypotheek afbetaald!)
    { day: 1, amount: -120, description: 'Energie', counterparty_name: 'Eneco', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { day: 1, amount: -155, description: 'Zorgverzekering', counterparty_name: 'CZ', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -85, description: 'Opstal + inboedelverzekering', counterparty_name: 'Interpolis', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -95, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Wassenaar', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -95, description: 'Autoverzekering BMW', counterparty_name: 'Allianz', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 10, amount: -75, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    // Leuke dingen (bewust genieten)
    { day: 8, amount: -95, description: 'Restaurant met partner', counterparty_name: 'Restaurant Basiliek', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { day: 7, amount: -15.99, description: 'Netflix', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -49.90, description: 'Golfclub contributie', counterparty_name: 'Golfclub Wassenaar', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    // Huishouden
    { day: 10, amount: -40, description: 'Etos', counterparty_name: 'Etos', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    // Sparen & beleggen (agressief)
    { day: 1, amount: -500, description: 'Overboeking spaarrekening', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -2500, description: 'DEGIRO maandelijkse inleg', counterparty_name: 'DEGIRO', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
  ]),
  ...generateGroceryTransactions(6, 85, 20), // Moderate grocery spending
]

const willemData: PersonaData = {
  meta: {
    name: 'Willem Jansen',
    subtitle: 'Bijna binnen',
    description: 'Senior consultant, hypotheek afbetaald, kinderen het huis uit. Passief inkomen dekt bijna zijn uitgaven.',
    color: 'purple',
    avatarColor: '#8B5CB8',
    netWorth: 1135000,
    income: 6500,
    expenses: 3000,
  },
  profile: {
    full_name: 'Willem Jansen',
    date_of_birth: '1968-11-30',
    household_type: 'samen',
    temporal_balance: 4,
  },
  bank_accounts: [
    { name: 'Betaalrekening ABN AMRO', iban: 'NL02ABNA0450884700', bank_name: 'ABN AMRO', account_type: 'checking', balance: 8500, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening ABN AMRO', iban: 'NL11ABNA0450884701', bank_name: 'ABN AMRO', account_type: 'savings', balance: 45000, is_active: true, sort_order: 1 },
    { name: 'Gezamenlijke rekening', iban: 'NL39RABO0300065264', bank_name: 'Rabobank', account_type: 'checking', balance: 4200, is_active: true, sort_order: 2 },
  ],
  assets: [
    { name: 'Spaarrekening', asset_type: 'savings', current_value: 45000, purchase_value: 0, purchase_date: '2010-01-01', expected_return: 3.2, monthly_contribution: 500, institution: 'ABN AMRO', subtype: 'vrij_opneembaar', risk_profile: 'laag', is_liquid: true },
    { name: 'DEGIRO beleggingsportefeuille', asset_type: 'investment', current_value: 420000, purchase_value: 280000, purchase_date: '2008-01-01', expected_return: 7, monthly_contribution: 2500, institution: 'DEGIRO', subtype: 'etf', risk_profile: 'middel', ticker_symbol: 'VWRL' },
    { name: 'Pensioenfonds ABP', asset_type: 'retirement', current_value: 285000, purchase_value: 0, purchase_date: '1995-01-01', expected_return: 5.5, monthly_contribution: 0, institution: 'ABP', subtype: 'uitkeringsregeling', risk_profile: 'laag', tax_benefit: true, retirement_provider_type: 'bedrijfspensioenfonds' },
    { name: 'Woning Wassenaar', asset_type: 'eigen_huis', current_value: 650000, purchase_value: 380000, purchase_date: '2002-06-01', expected_return: 3.5, monthly_contribution: 0, institution: '', woz_value: 720000, address_postcode: '2242 PJ', address_house_number: '8' },
    { name: 'Garage (verhuurd)', asset_type: 'real_estate', current_value: 35000, purchase_value: 18000, purchase_date: '2010-01-01', expected_return: 3, monthly_contribution: 0, institution: '', subtype: 'beleggingspand', rental_income: 500 },
    { name: 'BMW 3-serie', asset_type: 'vehicle', current_value: 22000, purchase_value: 45000, purchase_date: '2023-01-01', expected_return: -15, monthly_contribution: 0, institution: '', subtype: 'auto_eigendom', depreciation_rate: 15 },
  ],
  debts: [],
  budgets: makeBudgets({
    [S.INKOMEN]: 6500, [S.SALARIS_UITKERING]: 5500,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 1000,
    [S.VASTE_LASTEN_WONEN]: 455, [S.HUUR_HYPOTHEEK]: 0, [S.GAS_WATER_LICHT]: 120,
    [S.VERZEKERINGEN_WONEN]: 240, [S.GEMEENTELIJKE_LASTEN]: 95,
    [S.DAGELIJKSE_UITGAVEN]: 410, [S.BOODSCHAPPEN]: 340, [S.HUISHOUDEN_VERZORGING]: 40,
    [S.KINDEREN_SCHOOL]: 0, [S.MEDISCHE_KOSTEN]: 30,
    [S.VERVOER]: 230, [S.BRANDSTOF_OV]: 75, [S.AUTO_VASTE_LASTEN]: 95,
    [S.AUTO_ONDERHOUD]: 40, [S.FIETS_DEELVERVOER]: 20,
    [S.LEUKE_DINGEN]: 400, [S.UIT_ETEN_HORECA]: 120, [S.VRIJE_TIJD_SPORT]: 80,
    [S.VAKANTIE]: 150, [S.KLEDING_OVERIGE]: 50,
    [S.SPAREN_SCHULDEN]: 3000, [S.SPAREN_NOODBUFFER]: 500, [S.INVESTEREN_FIRE]: 2500,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 0, [S.SCHULDEN_AFLOSSINGEN]: 0, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: willemTransactions,
  goals: [
    { name: 'Financial Independence', description: 'Passief inkomen dekt volledig de maandelijkse uitgaven: het infinity-punt bereiken', goal_type: 'freedom_days', target_value: 365, current_value: 310, target_date: monthsAgo(-24), icon: 'Infinity', color: 'purple', is_completed: false },
    { name: 'Portefeuille 500K', description: 'Beleggingsportefeuille naar 500.000 brengen', goal_type: 'net_worth', target_value: 500000, current_value: 420000, target_date: monthsAgo(-18), icon: 'TrendingUp', color: 'emerald', is_completed: false },
  ],
  life_events: [
    { name: 'Hypotheek afgelost', event_type: 'custom', target_age: 56, target_date: '2024-06-01', one_time_cost: 0, monthly_cost_change: -1200, monthly_income_change: 0, duration_months: 0, icon: 'PartyPopper', is_active: false, sort_order: 0 },
    { name: 'Vervroegd pensioen', event_type: 'early_retirement', target_age: 60, target_date: '2028-11-30', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: -5500, duration_months: 0, icon: 'Sunset', is_active: true, sort_order: 1 },
  ],
  recommendations: [
    {
      title: 'Optimaliseer je asset allocatie voor pensioen',
      description: 'Met pensioen in zicht is het slim om geleidelijk meer naar obligaties en dividend-ETFs te verschuiven. Dit verlaagt risico en verhoogt cashflow.',
      recommendation_type: 'asset_reallocation',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 15,
      related_budget_slug: null,
      priority_score: 4,
      status: 'pending',
      suggested_actions: [
        { title: 'Verschuif 20% naar obligatie-ETF', freedom_days_impact: 8 },
        { title: 'Voeg dividend-ETF toe aan portefeuille', freedom_days_impact: 7 },
      ],
      actions: [
        { source: 'ai', title: 'Analyseer huidige asset allocatie', description: 'Bekijk je DEGIRO portefeuille en bepaal de huidige verdeling over aandelen, obligaties en overig', freedom_days_impact: 8, euro_impact_monthly: 0, status: 'open', priority_score: 4 },
        { source: 'ai', title: 'Koop Vanguard Global Aggregate Bond ETF', description: 'Verschuif 20% van je aandelenposities naar een breed obligatie-ETF', freedom_days_impact: 7, euro_impact_monthly: 0, status: 'open', priority_score: 4 },
      ],
    },
    {
      title: 'Bereken je exacte FIRE-getal',
      description: 'Met 3.000/mnd uitgaven en de 4%-regel heb je 900.000 nodig. Je beleggingen staan op 420.000 plus 285.000 pensioen. Je bent dichterbij dan je denkt.',
      recommendation_type: 'savings_boost',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 365,
      related_budget_slug: null,
      priority_score: 5,
      status: 'pending',
      suggested_actions: [
        { title: 'Bereken je persoonlijke onttrekkingspercentage', freedom_days_impact: 100 },
        { title: 'Plan je exit-strategie van werk', freedom_days_impact: 265 },
      ],
      actions: [
        { source: 'ai', title: 'Maak een gedetailleerd pensioenplan', description: 'Bereken exact hoeveel je nodig hebt inclusief AOW, pensioen en beleggingen', freedom_days_impact: 365, euro_impact_monthly: 0, status: 'open', priority_score: 5 },
      ],
    },
  ],
  net_worth_snapshots: [
    { monthsAgo: 5, total_assets: 1420000, total_debts: 0, net_worth: 1050000 },
    { monthsAgo: 4, total_assets: 1430000, total_debts: 0, net_worth: 1065000 },
    { monthsAgo: 3, total_assets: 1440000, total_debts: 0, net_worth: 1085000 },
    { monthsAgo: 2, total_assets: 1448000, total_debts: 0, net_worth: 1100000 },
    { monthsAgo: 1, total_assets: 1455000, total_debts: 0, net_worth: 1118000 },
    { monthsAgo: 0, total_assets: 1457000, total_debts: 0, net_worth: 1135000 },
  ],
}

// ══════════════════════════════════════════════════════════════
// Export
// ══════════════════════════════════════════════════════════════

export const PERSONAS: Record<PersonaKey, PersonaData> = {
  roos: roosData,
  daan: daanData,
  lisa: lisaData,
  willem: willemData,
}

export const PERSONA_KEYS: PersonaKey[] = ['roos', 'daan', 'lisa', 'willem']
