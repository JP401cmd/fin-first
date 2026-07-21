/**
 * Test persona definitions for superadmin testdata seeding.
 *
 * 5 personas at different financial life stages:
 * 1. Daan Bakker — "De starter" (young professional starting out)
 * 2. Lisa de Groot — "De gezinsverdeler" (family, complex wealth across 13 assets + 10 debts)
 * 3. Willem Jansen — "Bijna binnen" (near financial independence)
 * 4. Marijke Vermeer — "De gepensioneerde" (retired, pensioen strategy + legacy planning)
 * 5. Tessa Compleet — "De complete tester" (every asset/debt type + all in-depth apps;
 *    bron voor de horizon-strategie-regressietest)
 */

import { BUDGET_SLUGS } from '@/lib/budget-data'
import type { ModuleId } from '@/lib/module-registry'
import { ALL_MODULES } from '@/lib/module-registry'
import type { WithdrawalStrategyType } from '@/lib/withdrawal-strategy'
import type { SaleConfig } from '@/lib/sale-config'
import { getCurrentWeek, getNextWeek } from '@/lib/week-utils'

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

export type PersonaKey = 'daan' | 'lisa' | 'willem' | 'marijke' | 'compleet'

export type SovereigntyPhase = 'recovery' | 'stability' | 'momentum' | 'mastery'

export interface PersonaMeta {
  name: string
  subtitle: string
  description: string
  color: string
  avatarColor: string
  netWorth: number
  income: number
  expenses: number
  backgroundStory: string
  challenges: string[]
  currentSituation: string
  firstGoal: string
  sovereignty: SovereigntyPhase
  modules: ModuleId[]
}

export interface PersonaProfile {
  full_name: string
  date_of_birth: string
  household_type: string
  temporal_balance: number
  // FIRE parameters
  expected_return?: number        // bijv. 0.07
  inflation_rate?: number         // bijv. 0.02
  fire_end_strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
  fire_end_age?: number           // 60–120
  fire_legacy_amount?: number     // alleen bij 'legacy'
  retirement_expense_method?: 'essential_budgets' | 'custom_amount' | 'current_income'
  retirement_expense_custom_amount?: number
  // Withdrawal strategy
  withdrawal_strategy?: WithdrawalStrategyType
  guardrail_floor?: number
  guardrail_ceiling?: number
  guardrail_cut_step?: number
  guardrail_raise_step?: number
  // Profile income/expense estimates (for users without budgets/transactions)
  net_monthly_income?: number
  estimated_monthly_expenses?: number
  // Arbitrary feature preferences (JSONB)
  feature_preferences?: Record<string, unknown>
  // Marginaal tarief (IB Box 1)
  marginaal_tarief?: number | null // expliciete override (fractie 0–1) of null = auto (jaar-afgeleid)
  // Rebalancing
  rebalance_threshold?: number // drift threshold 1-20%, default 5
  // Widget dashboard
  widget_prefs?: { widgets: { id: string; enabled: boolean; size: 'mini' | 'quarter' | 'half' | 'full'; order: number }[] }
  // Active modules (module system)
  active_modules: ModuleId[]
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
  has_holdings_tracking?: boolean
  /** Deelneming (asset_type='deelneming'): KvK-nummer van de vennootschap. */
  kvk_number?: string
  /** Deelneming: eigendomspercentage in de vennootschap (0-100). */
  ownership_percentage?: number
  /**
   * Deelneming: verwacht jaarlijks dividend in EUR. Voedt de Box 2-aanslag
   * (aanmerkelijk belang) via app/api/household/box2 → calculateBox2().
   */
  annual_dividend?: number
  /** Voor real_estate-assets: verhuur-app tracking actief. */
  has_rental_tracking?: boolean
  /** Voor eigen_huis-assets: woonbalans-app tracking actief. */
  has_woonbalans_tracking?: boolean
  /**
   * Verkoop-/liquidatie-config voor niet-liquide bezittingen (zie lib/sale-config.ts).
   * SSoT voor het of/wanneer van verkoop in de v2-grootboek-engine. Wordt als JSONB
   * op `assets.sale_config` geseed (seed-persona.ts).
   */
  sale_config?: SaleConfig
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
  /** Voor mortgage-debts: hypotheekplanner-app tracking actief. */
  has_hypotheekplanner_tracking?: boolean
}

export interface PersonaBudget {
  name: string
  slug: string
  icon: string
  description: string
  default_limit: number
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
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
  accountIndex?: number // which bank account to use (default 0)
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
  is_indexed?: boolean
  /**
   * Naam van het asset dat dit verkoop-event liquideert. Wordt na de insert via
   * `assetNameToId` omgezet naar `life_events.linked_asset_id` (seed-persona.ts),
   * waarna de v2-grootboek-engine de generieke niet-liquide asset-liquidatie
   * aanstuurt (zie `buildGenericAssetLiquidations`).
   */
  linked_asset_name?: string
  metadata?: Record<string, unknown>
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
    scheduled_week?: string
  }[]
}

export interface PersonaNetWorthSnapshot {
  monthsAgo: number
  total_assets: number
  total_debts: number
  net_worth: number
}

export interface PersonaValuation {
  assetName: string // matched to inserted asset name
  entity_type: string // 'asset'
  monthsAgo: number
  value: number
}

export interface PersonaBalanceSnapshot {
  monthsAgo: number
  entity_type: 'asset' | 'debt'
  // Resolves to entity_id via name lookup. Match against bank_account name
  // (cash assets), persona.assets[].name, or persona.debts[].name depending
  // on entity_type. Names that don't resolve are skipped silently.
  entityName: string
  balance: number
}

export interface PersonaHolding {
  assetName: string // parent asset name for FK
  ticker: string | null
  isin: string | null
  name: string
  units: number
  avg_purchase_price: number
  current_price: number
  purchase_date_monthsAgo: number
  asset_class?: string
  sector?: string | null
  geography?: string
  is_favorite?: boolean
  currency?: string
  ter?: number | null        // Total Expense Ratio as decimal (e.g. 0.0050 = 0.50%)
  ter_source?: string | null // 'manual' | 'lookup' | null
  transactions: {
    type: 'buy' | 'sell' | 'dividend'
    units: number
    price_per_unit: number
    total_amount: number
    monthsAgo: number
    notes: string | null
  }[]
}

export interface PersonaTargetAllocation {
  view_mode: 'asset_class' | 'sector' | 'geography'
  category: string
  target_pct: number
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
  valuations?: PersonaValuation[]
  /**
   * Per-entity maandsnapshots over de afgelopen maanden, gevoed naar de
   * `balance_snapshots`-tabel. Vereist voor de categorie-sparkline op
   * `/core` en de detail-sparkline per asset/debt-card. Naam wordt aan
   * entity_id gekoppeld via de naam van de bankrekening (cash), het asset
   * of de schuld.
   */
  balance_snapshots?: PersonaBalanceSnapshot[]
  holdings?: PersonaHolding[]
  target_allocations?: PersonaTargetAllocation[]
  appSettings?: Record<string, unknown>
}

// ── Shared budget structures ──────────────────────────────────

export function makeBudgets(overrides: Record<string, number>): PersonaBudget[] {
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
    {
      name: 'Eigen rekening', slug: S.EIGEN_REKENING, icon: 'ArrowLeftRight', description: 'Overboekingen tussen eigen rekeningen — geen invloed op resultaten',
      default_limit: 0, budget_type: 'archive', is_essential: false, priority_score: 1, sort_order: 99,
      children: [
        { name: 'Eigen rekening', slug: S.EIGEN_REKENING_SUB, icon: 'ArrowLeftRight', description: 'Overboekingen tussen eigen rekeningen', default_limit: 0 },
      ],
    },
  ]
  return base
}

// ── Helper: generate widget preferences ───────────────────────

function makeWidgetPrefs(
  enabled: (string | { id: string; size: 'mini' | 'quarter' | 'half' | 'full' })[],
): { widgets: { id: string; enabled: boolean; size: 'mini' | 'quarter' | 'half' | 'full'; order: number }[] } {
  return {
    widgets: enabled.map((w, i) => {
      const id = typeof w === 'string' ? w : w.id
      const size = typeof w === 'string' ? 'half' as const : w.size
      return { id, enabled: true, size, order: i }
    }),
  }
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
    jitterPct?: number // e.g. 0.20 for ±20% variation
    accountIndex?: number
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

      let amount = t.amount
      if (t.jitterPct) {
        const jitter = 1 + (Math.random() * 2 - 1) * t.jitterPct
        amount = Math.round(amount * jitter * 100) / 100
      }

      result.push({
        dayOffset,
        amount,
        description: `${t.description} ${d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`,
        counterparty_name: t.counterparty_name,
        counterparty_iban: t.counterparty_iban,
        budgetSlug: t.budgetSlug,
        is_income: t.is_income,
        ...(t.accountIndex !== undefined ? { accountIndex: t.accountIndex } : {}),
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
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const calMonth = monthDate.getMonth() // 0=jan, 11=dec
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() - m + 1, 0).getDate()

    // Seasonal multiplier: december +25%, august -15%
    let seasonMultiplier = 1.0
    if (calMonth === 11) seasonMultiplier = 1.25 // december
    else if (calMonth === 7) seasonMultiplier = 0.85 // august

    // ~4 shopping trips per month
    for (let trip = 0; trip < 4; trip++) {
      const tripDay = Math.min(3 + trip * 7 + Math.floor(Math.random() * 3), daysInMonth)
      const d = new Date(today.getFullYear(), today.getMonth() - m, tripDay)
      if (d > today) continue
      const diffTime = today.getTime() - d.getTime()
      const dayOffset = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      const shop = shops[trip % shops.length]
      const amount = -(avgPerWeek + (Math.random() - 0.5) * 2 * variance) * seasonMultiplier

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

// ── Helper: generate irregular/seasonal transactions ──────────

function generateIrregularTransactions(
  items: {
    monthsAgo: number
    day: number
    amount: number
    description: string
    counterparty_name: string
    counterparty_iban: string | null
    budgetSlug: string
    is_income: boolean
    accountIndex?: number
  }[],
): PersonaTransactionTemplate[] {
  const result: PersonaTransactionTemplate[] = []
  const today = new Date()

  for (const item of items) {
    const d = new Date(today.getFullYear(), today.getMonth() - item.monthsAgo, item.day)
    if (d > today) continue
    const diffTime = today.getTime() - d.getTime()
    const dayOffset = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    result.push({
      dayOffset,
      amount: item.amount,
      description: item.description,
      counterparty_name: item.counterparty_name,
      counterparty_iban: item.counterparty_iban,
      budgetSlug: item.budgetSlug,
      is_income: item.is_income,
      ...(item.accountIndex !== undefined ? { accountIndex: item.accountIndex } : {}),
    })
  }
  return result
}

/**
 * Bouw 6-maandse balans-snapshots per entiteit (asset of debt) op basis van
 * een huidige waarde + maandelijkse delta. Wordt geseed naar de
 * `balance_snapshots`-tabel om de categorie-sparkline op `/core` en de
 * detail-sparkline op asset/debt-cards van data te voorzien.
 *
 * - `monthlyDelta` positief = groei (asset) of toename schuld; negatief =
 *   afname (asset depreciation, schuld aflossing).
 * - `jitterPct` voegt deterministische ruis toe (alleen historische
 *   maanden, m=0 blijft exact `currentValue`). Per-entiteit-naam-gebaseerde
 *   pseudo-random zorgt dat het seedresultaat reproduceerbaar is.
 */
function generateBalanceSnapshots(
  entries: {
    name: string
    entity_type: 'asset' | 'debt'
    currentValue: number
    monthlyDelta?: number
    jitterPct?: number
  }[],
): PersonaBalanceSnapshot[] {
  const out: PersonaBalanceSnapshot[] = []
  for (const e of entries) {
    const delta = e.monthlyDelta ?? 0
    // Deterministische seed per entiteit-naam (mulberry32 op string-hash).
    let seed = 0
    for (let i = 0; i < e.name.length; i++) seed = (seed * 31 + e.name.charCodeAt(i)) >>> 0
    const rng = () => {
      seed = (seed + 0x6D2B79F5) >>> 0
      let t = seed
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    for (let m = 5; m >= 0; m--) {
      let value = e.currentValue - m * delta
      if (e.jitterPct && m > 0) {
        const jitter = 1 + (rng() * 2 - 1) * e.jitterPct
        value = Math.round(value * jitter)
      } else {
        value = Math.round(value)
      }
      // Schulden mogen niet negatief gaan; assets niet onder 0.
      if (value < 0) value = 0
      out.push({
        monthsAgo: m,
        entity_type: e.entity_type,
        entityName: e.name,
        balance: value,
      })
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════
// PERSONA 1: Daan Bakker — "De starter"
// ══════════════════════════════════════════════════════════════

const daanTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(15, [
    // Inkomen
    { day: 25, amount: 3400, description: 'Salaris', counterparty_name: 'TechFlow BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    // Vaste lasten (eigen studio Amsterdam)
    { day: 1, amount: -950, description: 'Huur studio', counterparty_name: 'Woningcorporatie De Alliantie', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -150, description: 'Energie', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false },
    { day: 1, amount: -130, description: 'Zorgverzekering', counterparty_name: 'Zilveren Kruis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 5, amount: -20, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Amsterdam', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -60, description: 'NS Flex abonnement', counterparty_name: 'NS Reizigers', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { day: 1, amount: -19.50, description: 'Swapfiets', counterparty_name: 'Swapfiets', counterparty_iban: null, budgetSlug: S.FIETS_DEELVERVOER, is_income: false },
    // Huishouden
    { day: 10, amount: -35, description: 'Kruidvat', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, jitterPct: 0.20 },
    { day: 25, amount: -25, description: 'HEMA', counterparty_name: 'HEMA', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, jitterPct: 0.25 },
    // Uit eten & horeca (groot deel van budget)
    { day: 5, amount: -100, description: 'Uit eten met vrienden', counterparty_name: 'Restaurant De Buren', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.25 },
    { day: 12, amount: -85, description: 'Uit eten', counterparty_name: 'Wagamama', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.25 },
    { day: 20, amount: -80, description: 'Borrel en snacks', counterparty_name: 'Cafe Thijssen', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.30 },
    { day: 27, amount: -65, description: 'Uber Eats bestelling', counterparty_name: 'Uber Eats', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.30 },
    // Vrije tijd & sport
    { day: 7, amount: -15.99, description: 'Netflix', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 7, amount: -10.99, description: 'Spotify', counterparty_name: 'Spotify', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -44.90, description: 'Basic-Fit', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 22, amount: -14.99, description: 'PlayStation Plus', counterparty_name: 'Sony PlayStation', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 18, amount: -45, description: 'Padel met collega\'s', counterparty_name: 'Padel City Amsterdam', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false, jitterPct: 0.20 },
    // Kleding & lifestyle
    { day: 20, amount: -95, description: 'Kleding', counterparty_name: 'Zara', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false, jitterPct: 0.30 },
    { day: 8, amount: -55, description: 'Sneakers & accessoires', counterparty_name: 'JD Sports', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false, jitterPct: 0.30 },
    // Sparen (minimaal)
    { day: 1, amount: -140, description: 'Sparen noodfonds', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -100, description: 'Meesman indexbeleggen', counterparty_name: 'Meesman', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { day: 1, amount: -100, description: 'Aflossing studielening DUO', counterparty_name: 'DUO', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.SCHULDEN_AFLOSSINGEN, is_income: false },
  ]),
  ...generateGroceryTransactions(15, 95, 20), // Hogere boodschappen, kookt weinig
  // Irregular/seasonal transactions
  ...generateIrregularTransactions([
    // Bonus + declaratie (dual-direction: werkgever is zowel inkomst als uitgave)
    { monthsAgo: 1, day: 15, amount: 1700, description: 'Bonus Q4 TechFlow', counterparty_name: 'TechFlow BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    { monthsAgo: 6, day: 20, amount: 250, description: 'Declaratie thuiswerkkosten Q2', counterparty_name: 'TechFlow BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    // Vakantie (groot deel van uitgaven)
    { monthsAgo: 7, day: 1, amount: -480, description: 'Vlucht Ibiza', counterparty_name: 'Transavia', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 7, day: 5, amount: -520, description: 'Airbnb Ibiza', counterparty_name: 'Airbnb', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 7, day: 8, amount: -350, description: 'Uitgaan Ibiza', counterparty_name: 'iDEAL betaling buitenland', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 3, day: 12, amount: -280, description: 'Skiweekend Oostenrijk bus', counterparty_name: 'SnowExpress', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 3, day: 14, amount: -320, description: 'Skiweekend Oostenrijk accommodatie', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 10, day: 18, amount: -200, description: 'Weekendje Brussel', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 5, day: 20, amount: -180, description: 'Weekendje Antwerpen', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 9, day: 5, amount: -250, description: 'Lowlands festival ticket', counterparty_name: 'Lowlands', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    // Vrije tijd (concerts, events)
    { monthsAgo: 2, day: 8, amount: -95, description: 'Concert Ziggo Dome', counterparty_name: 'Ticketmaster', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 6, day: 15, amount: -65, description: 'Concert Paradiso', counterparty_name: 'Paradiso', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 4, day: 22, amount: -45, description: 'Escape room met vrienden', counterparty_name: 'Escape Room Amsterdam', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 11, day: 10, amount: -35, description: 'Bioscoop IMAX', counterparty_name: 'Pathe', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 8, day: 25, amount: -55, description: 'F1 kijken kroeg + eten', counterparty_name: 'Sports Bar Amsterdam', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    // Kleding & shopping (extra naast maandelijks)
    { monthsAgo: 4, day: 8, amount: -180, description: 'Nike Air Max', counterparty_name: 'Nike', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 2, day: 20, amount: -250, description: 'Winterjas', counterparty_name: 'Scotch & Soda', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 8, day: 12, amount: -120, description: 'Festival outfit', counterparty_name: 'Weekday', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 12, day: 15, amount: -160, description: 'Sneakers', counterparty_name: 'JD Sports', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    // Medisch
    { monthsAgo: 10, day: 25, amount: -45, description: 'Tandarts controle', counterparty_name: 'Tandarts Amsterdam', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 4, day: 15, amount: -35, description: 'Fysiotherapie', counterparty_name: 'FysioFit Amsterdam', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    // Vervoer (incidenteel)
    { monthsAgo: 9, day: 20, amount: -25, description: 'Uber rit', counterparty_name: 'Uber', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { monthsAgo: 6, day: 28, amount: -35, description: 'Uber rit festival', counterparty_name: 'Uber', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false },
    { monthsAgo: 1, day: 18, amount: -18, description: 'Nieuwe binnenband fiets', counterparty_name: 'Halfords', counterparty_iban: null, budgetSlug: S.FIETS_DEELVERVOER, is_income: false },
    // Cadeaus & diversen
    { monthsAgo: 2, day: 20, amount: -65, description: 'Kerstcadeau ouders', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 3, day: 28, amount: -45, description: 'Sinterklaas cadeautjes', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 13, day: 14, amount: -35, description: 'Valentijnsdag cadeau vriendin', counterparty_name: 'Rituals', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    // Ongekoppelde transacties — bewust een niet-bestaande slug zodat
    // seedPersonaData ze met budget_id = NULL inserteert. Stelt de combined-view
    // (`/core/cash`) in staat om de scope-toggle te tonen voor Daan.
    { monthsAgo: 0, day: 6, amount: -29.99, description: 'STEAM*GAME PURCHASE', counterparty_name: 'Steam', counterparty_iban: null, budgetSlug: '__none__', is_income: false },
    { monthsAgo: 1, day: 12, amount: -52.40, description: 'PIN BETALING ONBEKEND', counterparty_name: '', counterparty_iban: null, budgetSlug: '__none__', is_income: false },
    { monthsAgo: 2, day: 8, amount: -18.50, description: 'iDEAL ONBEKENDE WINKEL', counterparty_name: 'Niche Webshop', counterparty_iban: null, budgetSlug: '__none__', is_income: false },
    { monthsAgo: 3, day: 20, amount: -75.00, description: 'OVERBOEKING NAAR VRIEND', counterparty_name: 'M. de Vries', counterparty_iban: 'NL22RABO0987654321', budgetSlug: '__none__', is_income: false },
    { monthsAgo: 3, day: 5, amount: -14.99, description: 'SEPA INCASSO ONBEKEND', counterparty_name: 'XYZ Services', counterparty_iban: 'NL66INGB0001122334', budgetSlug: '__none__', is_income: false },
  ]),
]

const daanData: PersonaData = {
  meta: {
    name: 'Daan Bakker',
    subtitle: 'De starter',
    description: 'Software developer, 2 jaar aan het werk. Geniet van het leven in Amsterdam, spaart minimaal. Bouwt elke maand 3 vrijheidsdagen op.',
    color: 'teal',
    avatarColor: '#14B8A6',
    netWorth: -4200,
    income: 3400,
    expenses: 3060,
    backgroundStory: 'Daan werkt twee jaar als developer bij een startup in Amsterdam. Hij woont in een eigen studio en geniet volop van het stadsleven — uit eten, festivals, weekendjes weg. Hij kent het FIRE-concept via Reddit maar vindt het nu nog te vroeg om agressief te sparen. Met slechts €340/mnd aan sparen en aflossingen gaat 90% van zijn inkomen naar uitgaven. Zijn enige schuld — een DUO-lening — lost hij minimaal af.',
    challenges: ['90% van inkomen gaat naar uitgaven — nauwelijks spaarbuffer', 'Noodfonds nog mager (€2.000) — minder dan 1 maand buffer', 'Studielening van €13.900 bij DUO — wordt nauwelijks afgelost'],
    currentSituation: 'Leeft van salaris tot salaris — €340/mnd cashflow voor sparen en schulden. Geniet nu van het leven maar bouwt weinig vrijheid op.',
    firstGoal: 'Noodfonds van €5.000 opbouwen voor 2 maanden buffer',
    sovereignty: 'stability',
    modules: ['budgetteren', 'vermogensregistratie'],
  },
  profile: {
    full_name: 'Daan Bakker',
    date_of_birth: '2000-01-22',
    household_type: 'solo',
    temporal_balance: 1,
    expected_return: 0.07,
    inflation_rate: 0.02,
    fire_end_strategy: 'perpetual',
    fire_end_age: 90,
    retirement_expense_method: 'essential_budgets',
    withdrawal_strategy: 'static',
    rebalance_threshold: 3, // conservatief — lage drempel, snel signaal
    widget_prefs: makeWidgetPrefs([
      'netto_vermogen', 'cash_flow', 'spaarquote', 'doelen',
      { id: 'fire_prognose', size: 'full' }, 'acties', 'trend_sparen', 'jouw_pad',
    ]),
    active_modules: ['budgetteren', 'vermogensregistratie'],
  },
  bank_accounts: [
    { name: 'Betaalrekening ING', iban: 'NL91INGB0001234567', bank_name: 'ING', account_type: 'checking', balance: 850, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening ING', iban: 'NL11INGB0001234568', bank_name: 'ING', account_type: 'savings', balance: 2000, is_active: true, sort_order: 1 },
  ],
  assets: [
    { name: 'Meesman Wereldwijd Totaal', asset_type: 'investment', current_value: 2350, purchase_value: 2100, purchase_date: '2024-09-01', expected_return: 7, monthly_contribution: 100, institution: 'Meesman', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'MEESMAN-WWT', has_holdings_tracking: true },
    { name: 'Brand New Day Pensioen', asset_type: 'retirement', current_value: 4500, purchase_value: 4141, purchase_date: '2024-06-01', expected_return: 5, monthly_contribution: 125, institution: 'Brand New Day', subtype: 'pensioen', risk_profile: 'middel', retirement_provider_type: 'ppi', has_holdings_tracking: true },
  ],
  debts: [
    { name: 'Studielening DUO', debt_type: 'student_loan', original_amount: 14000, current_balance: 13900, interest_rate: 0.46, minimum_payment: 0, monthly_payment: 100, start_date: '2024-01-01', creditor: 'DUO', subtype: 'nieuw_stelsel', draagkrachtmeting_date: '2026-09-01', repayment_type: 'annuiteit' },
  ],
  budgets: makeBudgets({
    [S.INKOMEN]: 3400, [S.SALARIS_UITKERING]: 3400,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 0,
    [S.VASTE_LASTEN_WONEN]: 1250, [S.HUUR_HYPOTHEEK]: 950, [S.GAS_WATER_LICHT]: 150,
    [S.VERZEKERINGEN_WONEN]: 130, [S.GEMEENTELIJKE_LASTEN]: 20,
    [S.DAGELIJKSE_UITGAVEN]: 500, [S.BOODSCHAPPEN]: 380, [S.HUISHOUDEN_VERZORGING]: 60,
    [S.KINDEREN_SCHOOL]: 0, [S.MEDISCHE_KOSTEN]: 60,
    [S.VERVOER]: 110, [S.BRANDSTOF_OV]: 60, [S.AUTO_VASTE_LASTEN]: 0,
    [S.AUTO_ONDERHOUD]: 0, [S.FIETS_DEELVERVOER]: 50,
    [S.LEUKE_DINGEN]: 1200, [S.UIT_ETEN_HORECA]: 400, [S.VRIJE_TIJD_SPORT]: 300,
    [S.VAKANTIE]: 250, [S.KLEDING_OVERIGE]: 250,
    [S.SPAREN_SCHULDEN]: 240, [S.SPAREN_NOODBUFFER]: 140, [S.INVESTEREN_FIRE]: 100,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 100, [S.SCHULDEN_AFLOSSINGEN]: 100, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: daanTransactions,
  goals: [
    { name: 'Noodfonds 5.000', description: 'Een noodfonds van 5.000 opbouwen voor 2 maanden buffer', goal_type: 'savings', target_value: 5000, current_value: 2000, target_date: monthsAgo(-20), icon: 'ShieldCheck', color: 'teal', is_completed: false },
    { name: 'Eerste 10K belegd', description: 'Een beleggingsportefeuille van 10.000 opbouwen', goal_type: 'net_worth', target_value: 10000, current_value: 2350, target_date: monthsAgo(-60), icon: 'TrendingUp', color: 'emerald', is_completed: false },
  ],
  life_events: [
    { name: 'Eerste baan gestart', event_type: 'career_change', target_age: 24, target_date: '2024-02-01', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 3400, duration_months: 0, icon: 'Briefcase', is_active: false, sort_order: 0 },
    { name: 'Eigen woning kopen', event_type: 'move', target_age: 32, target_date: '2032-01-01', one_time_cost: 25000, monthly_cost_change: 200, monthly_income_change: 0, duration_months: 0, icon: 'Home', is_active: true, sort_order: 1, metadata: { koopsom: 350000, hypotheek: 315000 } },
    { name: 'AOW', event_type: 'aow', target_age: 70, target_date: '2070-01-22', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1380, duration_months: 0, icon: 'Landmark', is_active: true, sort_order: 2, is_indexed: true, metadata: { leefsituatie: 'alleenstaand' } },
  ],
  recommendations: [
    {
      title: 'Verlaag je uitgavenratio naar 80%',
      description: 'Je geeft momenteel 90% van je inkomen uit. Door 10% te verschuiven van lifestyle naar sparen bouw je 5x sneller een buffer op en koop je 8 extra vrijheidsdagen per maand.',
      recommendation_type: 'expense_reduction',
      euro_impact_monthly: 340,
      euro_impact_yearly: 4080,
      freedom_days_per_year: 45,
      related_budget_slug: S.LEUKE_DINGEN,
      priority_score: 5,
      status: 'pending',
      suggested_actions: [
        { title: 'Halveer uit-eten budget', description: 'Kook vaker zelf — bespaar €200/mnd op horeca', freedom_days_impact: 22, euro_impact_monthly: 200 },
        { title: 'Beperk impulsaankopen kleding', description: 'Stel een wachtperiode van 48 uur in voor aankopen >€50', freedom_days_impact: 11, euro_impact_monthly: 100 },
      ],
      actions: [
        { source: 'ai', title: 'Stel een maandelijks uitgavenplafond in', description: 'Zet een automatische waarschuwing bij 80% van je budget', freedom_days_impact: 45, euro_impact_monthly: 340, status: 'open', priority_score: 5, scheduled_week: getCurrentWeek() },
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
    // Assets groeien ~€475/mnd (140 sparen + 100 Meesman + 125 BND + rendement), DUO daalt ~€95/mnd
    { monthsAgo: 14, total_assets: 300, total_debts: 14000, net_worth: -13700 },
    { monthsAgo: 13, total_assets: 650, total_debts: 14000, net_worth: -13350 },
    { monthsAgo: 12, total_assets: 2500, total_debts: 14000, net_worth: -11500 },
    { monthsAgo: 11, total_assets: 3000, total_debts: 13990, net_worth: -10990 },
    { monthsAgo: 10, total_assets: 3500, total_debts: 13980, net_worth: -10480 },
    { monthsAgo: 9, total_assets: 4000, total_debts: 13970, net_worth: -9970 },
    { monthsAgo: 8, total_assets: 5000, total_debts: 13960, net_worth: -8960 },
    { monthsAgo: 7, total_assets: 5550, total_debts: 13950, net_worth: -8400 },
    { monthsAgo: 6, total_assets: 6100, total_debts: 13940, net_worth: -7840 },
    { monthsAgo: 5, total_assets: 6650, total_debts: 13935, net_worth: -7285 },
    { monthsAgo: 4, total_assets: 7400, total_debts: 13930, net_worth: -6530 },
    { monthsAgo: 3, total_assets: 7950, total_debts: 13920, net_worth: -5970 },
    { monthsAgo: 2, total_assets: 8550, total_debts: 13910, net_worth: -5360 },
    { monthsAgo: 1, total_assets: 9100, total_debts: 13900, net_worth: -4800 },
    { monthsAgo: 0, total_assets: 9700, total_debts: 13900, net_worth: -4200 },
  ],
  valuations: [
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 14, value: 200 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 12, value: 500 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 8, value: 1000 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 6, value: 1350 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 4, value: 1700 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 2, value: 2050 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 0, value: 2350 },
    // Brand New Day Pensioen valuations
    { assetName: 'Brand New Day Pensioen', entity_type: 'asset', monthsAgo: 12, value: 1500 },
    { assetName: 'Brand New Day Pensioen', entity_type: 'asset', monthsAgo: 8, value: 2600 },
    { assetName: 'Brand New Day Pensioen', entity_type: 'asset', monthsAgo: 0, value: 4500 },
  ],
  holdings: [
    {
      assetName: 'Meesman Wereldwijd Totaal',
      ticker: 'MEESMAN-WWT',
      isin: null,
      name: 'Meesman Wereldwijd Totaal',
      units: 18.5,
      avg_purchase_price: 113.51,
      current_price: 127.03,
      purchase_date_monthsAgo: 14,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      currency: 'EUR',
      ter: 0.0050,           // Meesman Wereldwijd Totaal TER 0.50%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 1.5, price_per_unit: 105, total_amount: 157.50, monthsAgo: 14, notes: 'Eerste inleg' },
        { type: 'buy', units: 3.5, price_per_unit: 108, total_amount: 378, monthsAgo: 11, notes: null },
        { type: 'buy', units: 5, price_per_unit: 112, total_amount: 560, monthsAgo: 8, notes: null },
        { type: 'buy', units: 4.5, price_per_unit: 116, total_amount: 522, monthsAgo: 5, notes: null },
        { type: 'buy', units: 4, price_per_unit: 120, total_amount: 480, monthsAgo: 2, notes: null },
      ],
    },
    {
      assetName: 'Brand New Day Pensioen',
      ticker: 'BND-PENSIOEN',
      isin: null,
      name: 'Brand New Day Pensioen',
      units: 35,
      avg_purchase_price: 118.31,
      current_price: 128.57,
      purchase_date_monthsAgo: 12,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      currency: 'EUR',
      ter: 0.0059,           // Brand New Day TER 0.59%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 10, price_per_unit: 110, total_amount: 1100, monthsAgo: 12, notes: 'Eerste inleg pensioen' },
        { type: 'buy', units: 12, price_per_unit: 118, total_amount: 1416, monthsAgo: 8, notes: null },
        { type: 'buy', units: 13, price_per_unit: 125, total_amount: 1625, monthsAgo: 4, notes: null },
      ],
    },
  ],
  // Conservatief target: 40% aandelen, 40% obligaties, 20% cash
  // Bewuste drift: Daan is 100% equity — ver boven zijn target
  target_allocations: [
    { view_mode: 'asset_class', category: 'equity', target_pct: 40 },
    { view_mode: 'asset_class', category: 'bonds', target_pct: 40 },
    { view_mode: 'asset_class', category: 'cash', target_pct: 20 },
  ],
}

// ══════════════════════════════════════════════════════════════
// PERSONA 2: Lisa de Groot — "De gezinsverdeler"
// ══════════════════════════════════════════════════════════════

const lisaTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(15, [
    // Inkomen
    { day: 25, amount: 4200, description: 'Salaris', counterparty_name: 'ProjectHuis BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 5, amount: 400, description: 'Kinderbijslag', counterparty_name: 'SVB', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.TOESLAGEN_KINDERBIJSLAG, is_income: true },
    { day: 20, amount: 600, description: 'Freelance opdracht', counterparty_name: 'Diverse opdrachtgevers', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true, accountIndex: 2, jitterPct: 0.30 },
    // Vaste lasten (gezamenlijke rekening = 0)
    { day: 1, amount: -1100, description: 'Hypotheek', counterparty_name: 'Rabobank Hypotheken', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -180, description: 'Energie', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false, jitterPct: 0.15 },
    { day: 1, amount: -165, description: 'Zorgverzekering gezin', counterparty_name: 'Menzis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -45, description: 'Opstal + inboedelverzekering', counterparty_name: 'Interpolis', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -65, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Utrecht', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Kinderen
    { day: 1, amount: -350, description: 'Kinderopvang', counterparty_name: 'Kinderopvang De Boomhut', counterparty_iban: 'NL55RABO0150000001', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    // Medisch
    { day: 12, amount: -35, description: 'Apotheek', counterparty_name: 'Apotheek Utrecht', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false, jitterPct: 0.40 },
    // Vervoer
    { day: 1, amount: -85, description: 'Autoverzekering', counterparty_name: 'FBTO', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 8, amount: -65, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false, jitterPct: 0.20 },
    { day: 22, amount: -45, description: 'Brandstof', counterparty_name: 'TotalEnergies', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false, jitterPct: 0.20 },
    // Leuke dingen
    { day: 10, amount: -65, description: 'Uit eten gezin', counterparty_name: 'Restaurant La Cucina', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.25 },
    { day: 7, amount: -15.99, description: 'Netflix gezinsabonnement', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -34.90, description: 'Basic-Fit duo', counterparty_name: 'Basic-Fit', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 18, amount: -45, description: 'Kleding kinderen', counterparty_name: 'H&M', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false, jitterPct: 0.30 },
    // Huishouden
    { day: 8, amount: -35, description: 'Kruidvat', counterparty_name: 'Kruidvat', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, jitterPct: 0.20 },
    { day: 20, amount: -25, description: 'Action', counterparty_name: 'Action', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, jitterPct: 0.25 },
    // Sparen & beleggen
    { day: 1, amount: -200, description: 'Spaarrekening gezin', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -400, description: 'Meesman gezamenlijk', counterparty_name: 'Meesman', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { day: 1, amount: -50, description: 'Extra aflossing hypotheek', counterparty_name: 'Rabobank', counterparty_iban: 'NL02ABNA0450884701', budgetSlug: S.EXTRA_AFLOSSING_HYPOTHEEK, is_income: false },
  ]),
  ...generateGroceryTransactions(15, 120, 30), // Family grocery spending
  // Irregular/seasonal transactions
  ...generateIrregularTransactions([
    { monthsAgo: 3, day: 5, amount: -320, description: 'Sinterklaas cadeaus kinderen', counterparty_name: 'Intertoys', counterparty_iban: null, budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    { monthsAgo: 3, day: 18, amount: -185, description: 'Kerstinkopen gezin', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 4, day: 10, amount: -45, description: 'Schoolreis oudste kind', counterparty_name: 'Basisschool De Ster', counterparty_iban: null, budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    { monthsAgo: 9, day: 15, amount: -285, description: 'APK auto + kleine reparatie', counterparty_name: 'Autogarage Jansen', counterparty_iban: null, budgetSlug: S.AUTO_ONDERHOUD, is_income: false },
    { monthsAgo: 8, day: 1, amount: -1450, description: 'Zomervakantie Frankrijk huisje', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 8, day: 8, amount: -380, description: 'Zomervakantie Frankrijk benzine + tolwegen', counterparty_name: 'Shell Frankrijk', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 8, day: 12, amount: -290, description: 'Zomervakantie Frankrijk restaurants', counterparty_name: 'iDEAL betaling buitenland', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 7, day: 25, amount: -165, description: 'Schoolspullen nieuw schooljaar', counterparty_name: 'Bruna', counterparty_iban: null, budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    { monthsAgo: 10, day: 20, amount: -89, description: 'Tandarts kinderen controle', counterparty_name: 'Tandarts Utrecht', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 7, day: 14, amount: -55, description: 'Zwemles kinderen kwartaal', counterparty_name: 'Zwembad De Krommerijn', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 1, day: 5, amount: -78, description: 'Nieuwjaarsbrunch restaurant', counterparty_name: 'Restaurant De Buren', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 5, day: 20, amount: 850, description: 'Freelance factuur extra project', counterparty_name: 'Klant B.V.', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true, accountIndex: 2 },
    { monthsAgo: 6, day: 28, amount: -120, description: 'Kinderkleding wintercollectie', counterparty_name: 'Zeeman', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 11, day: 12, amount: -145, description: 'Verjaardagsfeestje kind', counterparty_name: 'Speeltuin De Ballebak', counterparty_iban: null, budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    // Uitgebreide periode (jan–mrt 2025)
    { monthsAgo: 12, day: 22, amount: -95, description: 'Voorjaarskleding kinderen', counterparty_name: 'H&M', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 13, day: 14, amount: -65, description: 'Valentijnsdag diner met partner', counterparty_name: 'Restaurant De Buren', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 14, day: 10, amount: -75, description: 'Schoolboeken 2e semester', counterparty_name: 'Bruna', counterparty_iban: null, budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
  ]),
]

const lisaData: PersonaData = {
  meta: {
    name: 'Lisa de Groot',
    subtitle: 'De 100K milestone',
    description: 'Projectmanager, getrouwd, 2 kinderen. Na jaren discipline net de magische €100K grens doorbroken — 3 jaar en 4 maanden vrijheid opgebouwd.',
    color: 'amber',
    avatarColor: '#D4A843',
    netWorth: 130000,
    income: 5200,
    expenses: 4000,
    backgroundStory: 'Lisa werkt als projectmanager bij de gemeente en is getrouwd met een leraar. Na tien jaar spaardiscipline hebben zij en haar man net de €100K grens doorbroken — het magische omslagpunt waar compound interest merkbaar wordt. Met twee kinderen balanceert ze kinderopvang en schoolkosten met €400/mnd Meesman-beleggingen. Naast de Meesman-beleggingen heeft het gezin een kleine, brede dwarsdoorsnede van bezittingen (parkeerplaats verhuurd, BTC-spaarpot, sieraden, klein belang in familie BV, oude spaarpolis) en wat resterende kleine schulden (afbetaling, kortlopende leningen, lening van ouders).',
    challenges: ['Balanceren van gezinskosten met beleggingsgroei — kinderopvang kost €350/mnd', 'Studiefonds voor kinderen opbouwen (€8K van €40K doel)', 'Hypotheek optioneel versneld aflossen vs. meer beleggen'],
    currentSituation: 'Solide momentum — netto vermogen €100.000, investeert €400/mnd. Het compounding effect begint zichtbaar te worden.',
    firstGoal: 'Netto vermogen naar €250.000 en studiefonds starten',
    sovereignty: 'momentum',
    modules: ['budgetteren', 'vermogensregistratie', 'inzicht_acties', 'toekomstplannen'],
  },
  profile: {
    full_name: 'Lisa de Groot',
    date_of_birth: '1981-07-08',
    household_type: 'gezin',
    temporal_balance: 3,
    expected_return: 0.07,
    inflation_rate: 0.02,
    fire_end_strategy: 'legacy',
    fire_end_age: 90,
    fire_legacy_amount: 100000,
    retirement_expense_method: 'essential_budgets',
    // 'bucket' is verwijderd (DB genormaliseerd → static, migratie 20260703115225).
    withdrawal_strategy: 'static',
    marginaal_tarief: null, // modaal inkomen → auto (laagste schijf, jaar-afgeleid uit BOX1_PARAMS)
    feature_preferences: { _welcome_seen: true },
    widget_prefs: makeWidgetPrefs([
      'netto_vermogen', 'cash_flow', { id: 'fire_prognose', size: 'full' }, 'doelen',
      'assets', 'holdings', 'budgetten', { id: 'uitgaven_heatmap', size: 'half' },
      'monte_carlo', 'trend_sparen', 'acties', { id: 'inflatie_impact', size: 'mini' },
    ]),
    active_modules: ['budgetteren', 'vermogensregistratie', 'inzicht_acties', 'toekomstplannen'],
  },
  bank_accounts: [
    { name: 'Gezamenlijke rekening Rabo', iban: 'NL39RABO0300065264', bank_name: 'Rabobank', account_type: 'checking', balance: 3200, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening gezin', iban: 'NL11RABO0100000002', bank_name: 'Rabobank', account_type: 'savings', balance: 15000, is_active: true, sort_order: 1 },
    { name: 'Eigen betaalrekening', iban: 'NL91INGB0001234567', bank_name: 'ING', account_type: 'checking', balance: 850, is_active: true, sort_order: 2 },
  ],
  assets: [
    // Bestaande kern-assets
    { name: 'Meesman Wereldwijd Totaal', asset_type: 'investment', current_value: 42000, purchase_value: 33600, purchase_date: '2020-03-01', expected_return: 7, monthly_contribution: 400, institution: 'Meesman', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'MEESMAN-WWT', has_holdings_tracking: true },
    { name: 'NT World Custom ESG Kinderbelegging', asset_type: 'investment', current_value: 8000, purchase_value: 7140, purchase_date: '2023-12-01', expected_return: 7, monthly_contribution: 0, institution: 'Northern Trust', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'NL0011225305', has_holdings_tracking: true },
    { name: 'Woning Utrecht', asset_type: 'eigen_huis', current_value: 385000, purchase_value: 285000, purchase_date: '2015-06-01', expected_return: 3.5, monthly_contribution: 0, institution: '', woz_value: 385000, address_postcode: '3581 KP', address_house_number: '24' },
    { name: 'Auto Toyota Corolla', asset_type: 'vehicle', current_value: 8000, purchase_value: 24000, purchase_date: '2022-03-01', expected_return: 0, monthly_contribution: 0, institution: '', subtype: 'auto_eigendom', depreciation_rate: 12 },
    // Volledige typen-dekking — kleine/realistische bedragen voor visuele
    // testdekking van alle categoriekaarten op /core (asset_type-as).
    { name: 'Spaardeposito Rabo 3-jaar', asset_type: 'savings', current_value: 4000, purchase_value: 4000, purchase_date: '2024-01-15', expected_return: 2.5, monthly_contribution: 0, institution: 'Rabobank', subtype: 'deposito', risk_profile: 'laag', is_liquid: false, lock_end_date: '2027-01-15' },
    { name: 'Pensioenfonds ABP Lisa', asset_type: 'retirement', current_value: 8000, purchase_value: 0, purchase_date: '2010-01-01', expected_return: 5.5, monthly_contribution: 0, institution: 'ABP', subtype: 'uitkeringsregeling', risk_profile: 'laag', tax_benefit: true, retirement_provider_type: 'bedrijfspensioenfonds' },
    { name: 'Parkeerplaats Utrecht (verhuurd)', asset_type: 'real_estate', current_value: 12000, purchase_value: 9500, purchase_date: '2021-04-01', expected_return: 3, monthly_contribution: 0, institution: '', subtype: 'beleggingspand', rental_income: 95 },
    { name: 'Bitcoin spaarpot', asset_type: 'crypto', current_value: 1200, purchase_value: 800, purchase_date: '2023-06-01', expected_return: 0, monthly_contribution: 0, institution: 'Bitvavo', subtype: 'bitcoin', risk_profile: 'hoog' },
    { name: 'Trouwringen + sieraden', asset_type: 'physical', current_value: 2500, purchase_value: 2200, purchase_date: '2008-08-15', expected_return: 0, monthly_contribution: 0, institution: '', subtype: 'sieraden' },
    { name: 'Belang familie BV (5%)', asset_type: 'deelneming', current_value: 2000, purchase_value: 1500, purchase_date: '2018-03-01', expected_return: 0, monthly_contribution: 0, institution: 'Familie De Groot Holding BV', subtype: 'familie_bv' },
    { name: 'Spaarpolis Aegon (oud)', asset_type: 'levensverzekering', current_value: 4500, purchase_value: 3200, purchase_date: '2005-09-01', expected_return: 1.5, monthly_contribution: 0, institution: 'Aegon', subtype: 'kapitaalverzekering' },
    { name: 'Lening aan zus', asset_type: 'vordering', current_value: 1500, purchase_value: 2500, purchase_date: '2024-03-01', expected_return: 2, monthly_contribution: 0, institution: '', subtype: 'familielening' },
    { name: 'Boot (gedeeld met zwager)', asset_type: 'other', current_value: 800, purchase_value: 1500, purchase_date: '2019-05-01', expected_return: 0, monthly_contribution: 0, institution: '' },
  ],
  debts: [
    // Bestaande hoofdschuld
    { name: 'Hypotheek woning Utrecht', debt_type: 'mortgage', original_amount: 385000, current_balance: 350000, interest_rate: 2.9, minimum_payment: 1100, monthly_payment: 1100, start_date: '2015-06-01', creditor: 'Rabobank', subtype: 'annuiteit', is_tax_deductible: true, nhg: false, linked_asset_name: 'Woning Utrecht', repayment_type: 'annuiteit' },
    // Volledige typen-dekking — symbolische restschulden, voor visuele
    // testdekking van alle categoriekaarten op /core (debt_type-as).
    { name: 'Persoonlijke lening keukenrenovatie', debt_type: 'personal_loan', original_amount: 8000, current_balance: 2800, interest_rate: 6.5, minimum_payment: 165, monthly_payment: 165, start_date: '2022-09-01', creditor: 'Santander', subtype: 'aflopend', repayment_type: 'annuiteit' },
    { name: 'DUO studielening (oud)', debt_type: 'student_loan', original_amount: 18500, current_balance: 4500, interest_rate: 0.46, minimum_payment: 95, monthly_payment: 95, start_date: '2006-09-01', creditor: 'DUO', subtype: 'oud_stelsel', repayment_type: 'annuiteit' },
    { name: 'Restant autolening Toyota', debt_type: 'car_loan', original_amount: 15000, current_balance: 2000, interest_rate: 4.5, minimum_payment: 220, monthly_payment: 220, start_date: '2022-03-01', creditor: 'Toyota Financial Services', repayment_type: 'annuiteit', linked_asset_name: 'Auto Toyota Corolla' },
    { name: 'Visa creditcard saldo', debt_type: 'credit_card', original_amount: 0, current_balance: 250, interest_rate: 14.0, minimum_payment: 25, monthly_payment: 25, start_date: '2024-11-01', creditor: 'ICS Visa', subtype: 'regulier', credit_limit: 2500, repayment_type: 'aflossingsvrij' },
    { name: 'ICS doorlopend krediet', debt_type: 'revolving_credit', original_amount: 5000, current_balance: 800, interest_rate: 8.9, minimum_payment: 50, monthly_payment: 50, start_date: '2020-05-01', creditor: 'ICS', subtype: 'doorlopend_krediet', credit_limit: 5000, repayment_type: 'aflossingsvrij' },
    { name: 'Afbetaling tandartsbehandeling', debt_type: 'payment_plan', original_amount: 1200, current_balance: 320, interest_rate: 0, minimum_payment: 80, monthly_payment: 80, start_date: '2025-08-01', creditor: 'Tandartspraktijk Utrecht', repayment_type: 'lineair' },
    { name: 'Belastingaanslag IB 2024', debt_type: 'belastingschuld', original_amount: 1850, current_balance: 1200, interest_rate: 4.0, minimum_payment: 150, monthly_payment: 150, start_date: '2025-09-01', creditor: 'Belastingdienst', subtype: 'inkomstenbelasting', repayment_type: 'lineair' },
    { name: 'Lening van ouders', debt_type: 'familielening', original_amount: 10000, current_balance: 6000, interest_rate: 0, minimum_payment: 100, monthly_payment: 100, start_date: '2020-06-01', creditor: 'Ouders De Groot', subtype: 'ouders', repayment_type: 'lineair' },
    { name: 'Rekening-courant familie BV', debt_type: 'dga_schuld', original_amount: 800, current_balance: 200, interest_rate: 5.0, minimum_payment: 50, monthly_payment: 50, start_date: '2024-01-01', creditor: 'Familie De Groot Holding BV', repayment_type: 'aflossingsvrij' },
    { name: 'Achterstallige factuur klusbedrijf', debt_type: 'other', original_amount: 450, current_balance: 200, interest_rate: 0, minimum_payment: 100, monthly_payment: 100, start_date: '2025-10-15', creditor: 'Klusbedrijf Van Dam', repayment_type: 'lineair' },
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
    { name: 'Sabbatical jaar', event_type: 'sabbatical', target_age: 50, target_date: '2031-07-01', one_time_cost: 5000, monthly_cost_change: 500, monthly_income_change: -4200, duration_months: 6, icon: 'Palmtree', is_active: true, sort_order: 1, metadata: { nettoInkomen: 4200, doorbetalingsPct: 0, extraKosten: 5000 } },
    { name: 'AOW', event_type: 'aow', target_age: 69, target_date: '2050-01-08', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 940, duration_months: 0, icon: 'Landmark', is_active: true, sort_order: 2, is_indexed: true, metadata: { leefsituatie: 'samenwonend' } },
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
        { source: 'ai', title: 'Plan Meesman verhoging', description: 'Zet een reminder om de Meesman inleg te verhogen zodra de kinderopvangkosten wegvallen', freedom_days_impact: 45, euro_impact_monthly: 350, status: 'open', priority_score: 4, scheduled_week: getNextWeek() },
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
    // Assets +€2.700/mnd (sparen + beleggen + rendement + woningwaarde)
    // Hypotheek -€300/mnd principal (annuiteit 2.9%)
    // Plus brede 'lange staart' van extra bezittingen/schulden (~+€18K NW
    // tov het oorspronkelijke verhaal) — uniform doorgetrokken zodat de
    // historische curve stabiel blijft.
    { monthsAgo: 14, total_assets: 454250, total_debts: 372270, net_worth: 81980 },
    { monthsAgo: 13, total_assets: 456900, total_debts: 371970, net_worth: 84930 },
    { monthsAgo: 12, total_assets: 459550, total_debts: 371670, net_worth: 87880 },
    { monthsAgo: 11, total_assets: 462200, total_debts: 371370, net_worth: 90830 },
    { monthsAgo: 10, total_assets: 464850, total_debts: 371070, net_worth: 93780 },
    { monthsAgo: 9, total_assets: 467550, total_debts: 370770, net_worth: 96780 },
    { monthsAgo: 8, total_assets: 470250, total_debts: 370470, net_worth: 99780 },
    { monthsAgo: 7, total_assets: 473350, total_debts: 370170, net_worth: 103180 },
    { monthsAgo: 6, total_assets: 476650, total_debts: 369870, net_worth: 106780 },
    { monthsAgo: 5, total_assets: 479950, total_debts: 369570, net_worth: 110380 },
    { monthsAgo: 4, total_assets: 483150, total_debts: 369270, net_worth: 113880 },
    { monthsAgo: 3, total_assets: 486250, total_debts: 368970, net_worth: 117280 },
    { monthsAgo: 2, total_assets: 492950, total_debts: 368670, net_worth: 124280 },
    { monthsAgo: 1, total_assets: 495550, total_debts: 368470, net_worth: 127080 },
    { monthsAgo: 0, total_assets: 498500, total_debts: 368270, net_worth: 130230 },
  ],
  valuations: [
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 14, value: 31500 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 12, value: 33600 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 10, value: 35200 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 8, value: 36800 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 6, value: 38500 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 4, value: 39800 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 2, value: 41000 },
    { assetName: 'Meesman Wereldwijd Totaal', entity_type: 'asset', monthsAgo: 0, value: 42000 },
    // NT World Custom ESG valuations
    { assetName: 'NT World Custom ESG Kinderbelegging', entity_type: 'asset', monthsAgo: 14, value: 5800 },
    { assetName: 'NT World Custom ESG Kinderbelegging', entity_type: 'asset', monthsAgo: 10, value: 6400 },
    { assetName: 'NT World Custom ESG Kinderbelegging', entity_type: 'asset', monthsAgo: 6, value: 7200 },
    { assetName: 'NT World Custom ESG Kinderbelegging', entity_type: 'asset', monthsAgo: 0, value: 8000 },
    { assetName: 'Woning Utrecht', entity_type: 'asset', monthsAgo: 14, value: 360000 },
    { assetName: 'Woning Utrecht', entity_type: 'asset', monthsAgo: 12, value: 365000 },
    { assetName: 'Woning Utrecht', entity_type: 'asset', monthsAgo: 6, value: 375000 },
    { assetName: 'Woning Utrecht', entity_type: 'asset', monthsAgo: 0, value: 385000 },
  ],
  holdings: [
    {
      assetName: 'Meesman Wereldwijd Totaal',
      ticker: 'MEESMAN-WWT',
      isin: null,
      name: 'Meesman Wereldwijd Totaal',
      units: 310,
      avg_purchase_price: 108.31,
      current_price: 135.48,
      purchase_date_monthsAgo: 72,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      is_favorite: true,
      currency: 'EUR',
      ter: 0.0050,           // Meesman Wereldwijd Totaal TER 0.50%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 95, price_per_unit: 98.00, total_amount: 9310, monthsAgo: 72, notes: 'Initiële gezamenlijke inleg' },
        { type: 'buy', units: 60, price_per_unit: 104.00, total_amount: 6240, monthsAgo: 60, notes: null },
        { type: 'buy', units: 55, price_per_unit: 108.00, total_amount: 5940, monthsAgo: 48, notes: null },
        { type: 'buy', units: 45, price_per_unit: 115.00, total_amount: 5175, monthsAgo: 36, notes: null },
        { type: 'buy', units: 30, price_per_unit: 122.00, total_amount: 3660, monthsAgo: 24, notes: null },
        { type: 'buy', units: 25, price_per_unit: 130.00, total_amount: 3250, monthsAgo: 12, notes: 'Jaarlijkse bijstorting' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 480, monthsAgo: 6, notes: 'Halfjaarlijks dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 520, monthsAgo: 0, notes: 'Halfjaarlijks dividend' },
      ],
    },
    {
      assetName: 'NT World Custom ESG Kinderbelegging',
      ticker: 'NL0011225305',
      isin: 'NL0011225305',
      name: 'NT World Custom ESG Kinderbelegging',
      units: 220,
      avg_purchase_price: 32.45,
      current_price: 36.36,
      purchase_date_monthsAgo: 14,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      currency: 'EUR',
      ter: 0.0018,           // Northern Trust World Custom ESG TER 0.18%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 80, price_per_unit: 30.00, total_amount: 2400, monthsAgo: 14, notes: 'Kinderbelegging startkapitaal' },
        { type: 'buy', units: 50, price_per_unit: 32.00, total_amount: 1600, monthsAgo: 10, notes: null },
        { type: 'buy', units: 50, price_per_unit: 34.00, total_amount: 1700, monthsAgo: 6, notes: null },
        { type: 'buy', units: 40, price_per_unit: 36.00, total_amount: 1440, monthsAgo: 2, notes: null },
      ],
    },
  ],
  balance_snapshots: [
    // ── Cash assets (afgeleid van bank_accounts via gelijke naam) ──
    ...generateBalanceSnapshots([
      { name: 'Gezamenlijke rekening Rabo', entity_type: 'asset', currentValue: 3200, monthlyDelta: 50, jitterPct: 0.18 },
      { name: 'Spaarrekening gezin', entity_type: 'asset', currentValue: 15000, monthlyDelta: 200, jitterPct: 0.02 },
      { name: 'Eigen betaalrekening', entity_type: 'asset', currentValue: 850, jitterPct: 0.25 },
    ]),
    // ── Reguliere assets ──
    ...generateBalanceSnapshots([
      { name: 'Meesman Wereldwijd Totaal', entity_type: 'asset', currentValue: 42000, monthlyDelta: 500, jitterPct: 0.015 },
      { name: 'NT World Custom ESG Kinderbelegging', entity_type: 'asset', currentValue: 8000, monthlyDelta: 250, jitterPct: 0.02 },
      { name: 'Woning Utrecht', entity_type: 'asset', currentValue: 385000, monthlyDelta: 600 },
      { name: 'Auto Toyota Corolla', entity_type: 'asset', currentValue: 8000, monthlyDelta: -85 },
      { name: 'Spaardeposito Rabo 3-jaar', entity_type: 'asset', currentValue: 4000, monthlyDelta: 8 },
      { name: 'Pensioenfonds ABP Lisa', entity_type: 'asset', currentValue: 8000, monthlyDelta: 60 },
      { name: 'Parkeerplaats Utrecht (verhuurd)', entity_type: 'asset', currentValue: 12000, monthlyDelta: 30 },
      { name: 'Bitcoin spaarpot', entity_type: 'asset', currentValue: 1200, jitterPct: 0.18 },
      { name: 'Trouwringen + sieraden', entity_type: 'asset', currentValue: 2500 },
      { name: 'Belang familie BV (5%)', entity_type: 'asset', currentValue: 2000 },
      { name: 'Spaarpolis Aegon (oud)', entity_type: 'asset', currentValue: 4500, monthlyDelta: 6 },
      { name: 'Lening aan zus', entity_type: 'asset', currentValue: 1500, monthlyDelta: -100 },
      { name: 'Boot (gedeeld met zwager)', entity_type: 'asset', currentValue: 800, monthlyDelta: -10 },
    ]),
    // ── Schulden ──
    ...generateBalanceSnapshots([
      { name: 'Hypotheek woning Utrecht', entity_type: 'debt', currentValue: 350000, monthlyDelta: -300 },
      { name: 'Persoonlijke lening keukenrenovatie', entity_type: 'debt', currentValue: 2800, monthlyDelta: -160 },
      { name: 'DUO studielening (oud)', entity_type: 'debt', currentValue: 4500, monthlyDelta: -90 },
      { name: 'Restant autolening Toyota', entity_type: 'debt', currentValue: 2000, monthlyDelta: -210 },
      { name: 'Visa creditcard saldo', entity_type: 'debt', currentValue: 250, jitterPct: 0.30 },
      { name: 'ICS doorlopend krediet', entity_type: 'debt', currentValue: 800, monthlyDelta: -50 },
      { name: 'Afbetaling tandartsbehandeling', entity_type: 'debt', currentValue: 320, monthlyDelta: -80 },
      { name: 'Belastingaanslag IB 2024', entity_type: 'debt', currentValue: 1200, monthlyDelta: -150 },
      { name: 'Lening van ouders', entity_type: 'debt', currentValue: 6000, monthlyDelta: -100 },
      { name: 'Rekening-courant familie BV', entity_type: 'debt', currentValue: 200, monthlyDelta: -50 },
      { name: 'Achterstallige factuur klusbedrijf', entity_type: 'debt', currentValue: 200 },
    ]),
  ],
  appSettings: {
    'whatif_scenarios:PLACEHOLDER': {
      scenarios: [{
        id: 'sample-lisa-1',
        name: 'Tweede kind op 38',
        createdAt: '2026-02-15T10:00:00Z',
        overrides: {
          monthlyIncome: 4200,
          workDaysPerWeek: 4,
          savingsRate: 25,
          expectedReturn: 7,
          extraContribution: 0,
        },
        events: [{
          id: 'lisa-evt-1',
          name: 'Tweede kind',
          event_type: 'children',
          target_age: 38,
          one_time_cost: 3000,
          monthly_cost_change: 400,
          monthly_income_change: 0,
          duration_months: 216,
          whatIfDisabled: false,
          metadata: { aantalKinderen: 2 },
        }],
        fireAge: 58,
        colorIndex: 0,
      }],
    },
  },
}

// ══════════════════════════════════════════════════════════════
// PERSONA 3: Willem Jansen — "Bijna binnen"
// ══════════════════════════════════════════════════════════════

const willemTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(15, [
    // Inkomen
    { day: 25, amount: 5500, description: 'Salaris', counterparty_name: 'Consultancy Partners BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 5, amount: 500, description: 'Dividenduitkering', counterparty_name: 'DEGIRO', counterparty_iban: 'NL86INGB0002445588', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true, jitterPct: 0.15 },
    { day: 10, amount: 500, description: 'Huurinkomsten garage', counterparty_name: 'Huurder J. Smit', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    // Vaste lasten (hypotheek afbetaald!)
    { day: 1, amount: -120, description: 'Energie', counterparty_name: 'Eneco', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false, jitterPct: 0.15 },
    { day: 1, amount: -155, description: 'Zorgverzekering', counterparty_name: 'CZ', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -85, description: 'Opstal + inboedelverzekering', counterparty_name: 'Interpolis', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -95, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Wassenaar', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -95, description: 'Autoverzekering BMW', counterparty_name: 'Allianz', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 10, amount: -75, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false, jitterPct: 0.20 },
    // Leuke dingen (bewust genieten)
    { day: 8, amount: -95, description: 'Restaurant met partner', counterparty_name: 'Restaurant Basiliek', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.25 },
    { day: 7, amount: -15.99, description: 'Netflix', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 15, amount: -49.90, description: 'Golfclub contributie', counterparty_name: 'Golfclub Wassenaar', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    // Huishouden (gezamenlijke rekening)
    { day: 10, amount: -40, description: 'Etos', counterparty_name: 'Etos', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, accountIndex: 2, jitterPct: 0.20 },
    // Sparen & beleggen (agressief)
    { day: 1, amount: -500, description: 'Overboeking spaarrekening', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
    { day: 1, amount: -2500, description: 'DEGIRO maandelijkse inleg', counterparty_name: 'DEGIRO', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
  ]),
  ...generateGroceryTransactions(15, 85, 20), // Moderate grocery spending
  // Irregular/seasonal transactions
  ...generateIrregularTransactions([
    { monthsAgo: 2, day: 24, amount: -350, description: 'Kerstdiner restaurant De Librije', counterparty_name: 'Restaurant De Librije', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 4, day: 12, amount: -680, description: 'BMW groot onderhoud', counterparty_name: 'BMW Dealer Den Haag', counterparty_iban: null, budgetSlug: S.AUTO_ONDERHOUD, is_income: false },
    { monthsAgo: 6, day: 1, amount: -2800, description: 'Vakantie Toscane villa', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 6, day: 10, amount: -450, description: 'Vakantie Toscane restaurants', counterparty_name: 'iDEAL betaling buitenland', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 6, day: 8, amount: -320, description: 'Vakantie Toscane vliegtickets', counterparty_name: 'KLM', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 9, day: 15, amount: -890, description: 'Golfretreat weekend', counterparty_name: 'Golf & Country Resort', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 3, day: 8, amount: -245, description: 'Wijncursus 5 avonden', counterparty_name: 'Wijnacademie Den Haag', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { monthsAgo: 1, day: 14, amount: -185, description: 'Valentijnsdag diner + cadeau', counterparty_name: 'Restaurant Basiliek', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 8, day: 20, amount: -95, description: 'Nieuw golfshirt + handschoenen', counterparty_name: 'Golfshop Wassenaar', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 10, day: 5, amount: -155, description: 'Tandarts + gebitsreiniging', counterparty_name: 'Tandarts Wassenaar', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 9, day: 18, amount: -65, description: 'Vaderdag cadeau van partner', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false, accountIndex: 2 },
    { monthsAgo: 7, day: 25, amount: -42, description: 'Zomerborrel golfclub', counterparty_name: 'Golfclub Wassenaar', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 11, day: 10, amount: -125, description: 'Nieuwe hardloopschoenen', counterparty_name: 'Runners World', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 1, day: 3, amount: -88, description: 'Nieuwjaarsbrunch hotel', counterparty_name: 'Hotel Des Indes', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    // Uitgebreide periode (jan–mrt 2025)
    { monthsAgo: 12, day: 20, amount: -145, description: 'Voorjaarsonderhoud tuin', counterparty_name: 'Tuincentrum Wassenaar', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { monthsAgo: 13, day: 14, amount: -195, description: 'Valentijnsdag diner + cadeau', counterparty_name: 'Restaurant Basiliek', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 14, day: 5, amount: -78, description: 'Nieuwjaarsreceptie golfclub', counterparty_name: 'Golfclub Wassenaar', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
  ]),
]

const willemData: PersonaData = {
  meta: {
    name: 'Willem Jansen',
    subtitle: 'Bijna binnen',
    description: 'Senior consultant, hypotheek afbetaald, kinderen het huis uit. Netto vermogen €1,62M — zijn investeerbaar vermogen nadert het infinity-punt.',
    color: 'purple',
    avatarColor: '#8B5CB8',
    netWorth: 1620000,
    income: 6500,
    expenses: 3000,
    backgroundStory: 'Willem werkt al 30 jaar als senior consultant en heeft in 2024 zijn hypotheek volledig afgelost. Zijn kinderen staan op eigen benen. Met een beleggingsportefeuille van €420.000, ABP-pensioen van €285.000 en een afbetaalde woning van €650.000 is zijn totale vermogen €1,46M. Maar het gaat hem om de vraag: dekt zijn investeerbaar vermogen (€705K) zijn jaarlijkse uitgaven van €36K? Bij de Nederlandse SWR is hij op ~78%. Nog even doorzetten richting 2028.',
    challenges: ['Asset allocatie optimaliseren voor de pensioenovergang', 'Opnamestrategie bepalen — deplete vs. perpetual portfolio', 'Investeerbaar vermogen naar €900K voor volledige FIRE'],
    currentSituation: 'Aan de rand van volledige vrijheid — investeerbaar vermogen €705K van de benodigde €900K. Vroegpensioen gepland in 2028.',
    firstGoal: 'Volledige financiële onafhankelijkheid (365 vrijheidsdagen)',
    sovereignty: 'mastery',
    modules: ALL_MODULES,
  },
  profile: {
    full_name: 'Willem Jansen',
    date_of_birth: '1968-11-30',
    household_type: 'samen',
    temporal_balance: 4,
    expected_return: 0.06,
    inflation_rate: 0.02,
    fire_end_strategy: 'deplete',
    fire_end_age: 95,
    retirement_expense_method: 'custom_amount',
    retirement_expense_custom_amount: 36000, // JAARbedrag (€3.000/mnd x 12); canoniek jaarbasis, zie computeRetirementExpenses (lib/budget-utils.ts)
    // 'vpw' is verwijderd (DB genormaliseerd → static, migratie 20260703115225).
    withdrawal_strategy: 'guardrails',
    rebalance_threshold: 10, // agressief — hoge tolerantie, minder herbalanceren
    feature_preferences: { _welcome_seen: true },
    widget_prefs: makeWidgetPrefs([
      'netto_vermogen', { id: 'fire_prognose', size: 'full' }, 'monte_carlo',
      'holdings', 'backtesting_score', 'vrijheidsmijlpalen', 'box3_drag', 'acties', 'gezondheids_score',
      { id: 'beleggingsrendement', size: 'mini' }, { id: 'rebalancing', size: 'mini' },
    ]),
    active_modules: ALL_MODULES,
  },
  bank_accounts: [
    { name: 'Betaalrekening ABN AMRO', iban: 'NL02ABNA0450884700', bank_name: 'ABN AMRO', account_type: 'checking', balance: 8500, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening ABN AMRO', iban: 'NL11ABNA0450884701', bank_name: 'ABN AMRO', account_type: 'savings', balance: 45000, is_active: true, sort_order: 1 },
    { name: 'Gezamenlijke rekening', iban: 'NL39RABO0300065264', bank_name: 'Rabobank', account_type: 'checking', balance: 4200, is_active: true, sort_order: 2 },
  ],
  assets: [
    { name: 'DEGIRO beleggingsportefeuille', asset_type: 'investment', current_value: 570000, purchase_value: 420000, purchase_date: '2008-01-01', expected_return: 7, monthly_contribution: 2500, institution: 'DEGIRO', subtype: 'etf', risk_profile: 'middel', ticker_symbol: 'VWRL', has_holdings_tracking: true },
    { name: 'Pensioenfonds ABP', asset_type: 'retirement', current_value: 285000, purchase_value: 0, purchase_date: '1995-01-01', expected_return: 5.5, monthly_contribution: 0, institution: 'ABP', subtype: 'uitkeringsregeling', risk_profile: 'laag', tax_benefit: true, retirement_provider_type: 'bedrijfspensioenfonds' },
    { name: 'Woning Wassenaar', asset_type: 'eigen_huis', current_value: 650000, purchase_value: 380000, purchase_date: '2002-06-01', expected_return: 3.5, monthly_contribution: 0, institution: '', woz_value: 720000, address_postcode: '2242 PJ', address_house_number: '8' },
    { name: 'Garage (verhuurd)', asset_type: 'real_estate', current_value: 35000, purchase_value: 18000, purchase_date: '2010-01-01', expected_return: 3, monthly_contribution: 0, institution: '', subtype: 'beleggingspand', rental_income: 500 },
    { name: 'BMW 3-serie', asset_type: 'vehicle', current_value: 22000, purchase_value: 45000, purchase_date: '2023-01-01', expected_return: 0, monthly_contribution: 0, institution: '', subtype: 'auto_eigendom', depreciation_rate: 15 },
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
    { name: 'Portefeuille 500K', description: 'Beleggingsportefeuille naar 500.000 brengen', goal_type: 'net_worth', target_value: 500000, current_value: 570000, target_date: monthsAgo(-18), icon: 'TrendingUp', color: 'emerald', is_completed: true },
  ],
  life_events: [
    { name: 'Hypotheek afgelost', event_type: 'custom', target_age: 56, target_date: '2024-06-01', one_time_cost: 0, monthly_cost_change: -1200, monthly_income_change: 0, duration_months: 0, icon: 'PartyPopper', is_active: false, sort_order: 0 },
    { name: 'Vervroegd pensioen', event_type: 'early_retirement', target_age: 60, target_date: '2028-11-30', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: -5500, duration_months: 0, icon: 'Sunset', is_active: true, sort_order: 1, metadata: { gewensteMaandinkomen: 3000, pensioenUitkering: 0 } },
    { name: 'AOW', event_type: 'aow', target_age: 68, target_date: '2036-05-30', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 940, duration_months: 0, icon: 'Landmark', is_active: true, sort_order: 2, is_indexed: true, metadata: { leefsituatie: 'samenwonend' } },
    { name: 'Bedrijfspensioen ABP', event_type: 'custom', target_age: 62, target_date: '2030-11-30', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 2200, duration_months: 72, icon: 'Building2', is_active: true, sort_order: 3, metadata: { reden: 'Aanvullend pensioen via werkgever tot AOW-leeftijd' } },
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
        { source: 'ai', title: 'Analyseer huidige asset allocatie', description: 'Bekijk je DEGIRO portefeuille en bepaal de huidige verdeling over aandelen, obligaties en overig', freedom_days_impact: 8, euro_impact_monthly: 0, status: 'open', priority_score: 4, scheduled_week: getCurrentWeek() },
        { source: 'ai', title: 'Koop Vanguard Global Aggregate Bond ETF', description: 'Verschuif 20% van je aandelenposities naar een breed obligatie-ETF', freedom_days_impact: 7, euro_impact_monthly: 0, status: 'open', priority_score: 4 },
      ],
    },
    {
      title: 'Bereken je exacte FIRE-getal',
      description: 'Met 3.000/mnd uitgaven en de 4%-regel heb je 900.000 nodig. Je beleggingen staan op 570.000 plus 285.000 pensioen. Je bent dichterbij dan je denkt.',
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
    // Schuldenvrij — net_worth = total_assets
    // DEGIRO portefeuille ~570K (VWRL+IEAG+TDIV+EMIM), groei ~€9K/mnd
    { monthsAgo: 14, total_assets: 1483000, total_debts: 0, net_worth: 1483000 },
    { monthsAgo: 13, total_assets: 1492000, total_debts: 0, net_worth: 1492000 },
    { monthsAgo: 12, total_assets: 1505000, total_debts: 0, net_worth: 1505000 },
    { monthsAgo: 11, total_assets: 1515000, total_debts: 0, net_worth: 1515000 },
    { monthsAgo: 10, total_assets: 1522000, total_debts: 0, net_worth: 1522000 },
    { monthsAgo: 9, total_assets: 1533000, total_debts: 0, net_worth: 1533000 },
    { monthsAgo: 8, total_assets: 1540000, total_debts: 0, net_worth: 1540000 },
    { monthsAgo: 7, total_assets: 1550000, total_debts: 0, net_worth: 1550000 },
    { monthsAgo: 6, total_assets: 1557000, total_debts: 0, net_worth: 1557000 },
    { monthsAgo: 5, total_assets: 1568000, total_debts: 0, net_worth: 1568000 },
    { monthsAgo: 4, total_assets: 1578000, total_debts: 0, net_worth: 1578000 },
    { monthsAgo: 3, total_assets: 1590000, total_debts: 0, net_worth: 1590000 },
    { monthsAgo: 2, total_assets: 1605000, total_debts: 0, net_worth: 1605000 },
    { monthsAgo: 1, total_assets: 1612000, total_debts: 0, net_worth: 1612000 },
    { monthsAgo: 0, total_assets: 1619700, total_debts: 0, net_worth: 1619700 },
  ],
  valuations: [
    // DEGIRO totaal: VWRL (~420K) + IEAG (~80K) + TDIV (~45K) + EMIM (~25K) = ~570K
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 14, value: 468000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 12, value: 485000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 10, value: 502000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 8, value: 518000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 6, value: 532000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 4, value: 548000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 2, value: 560000 },
    { assetName: 'DEGIRO beleggingsportefeuille', entity_type: 'asset', monthsAgo: 0, value: 570000 },
    { assetName: 'Woning Wassenaar', entity_type: 'asset', monthsAgo: 14, value: 615000 },
    { assetName: 'Woning Wassenaar', entity_type: 'asset', monthsAgo: 12, value: 620000 },
    { assetName: 'Woning Wassenaar', entity_type: 'asset', monthsAgo: 6, value: 635000 },
    { assetName: 'Woning Wassenaar', entity_type: 'asset', monthsAgo: 0, value: 650000 },
  ],
  holdings: [
    {
      assetName: 'DEGIRO beleggingsportefeuille',
      ticker: 'VWRL',
      isin: 'IE00B3RBWM25',
      name: 'Vanguard FTSE All-World ETF',
      units: 3800,
      avg_purchase_price: 73.68,
      current_price: 110.53,
      purchase_date_monthsAgo: 48,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      is_favorite: true,
      currency: 'EUR',
      ter: 0.0022,           // Vanguard FTSE All-World TER 0.22%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 1500, price_per_unit: 68.00, total_amount: 102000, monthsAgo: 48, notes: 'Initiële grote inleg' },
        { type: 'buy', units: 800, price_per_unit: 72.50, total_amount: 58000, monthsAgo: 36, notes: 'Bijkoop na dip' },
        { type: 'buy', units: 700, price_per_unit: 78.00, total_amount: 54600, monthsAgo: 24, notes: null },
        { type: 'buy', units: 800, price_per_unit: 82.00, total_amount: 65600, monthsAgo: 12, notes: 'Jaarlijkse herbalancering' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 4200, monthsAgo: 9, notes: 'Q2 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 4500, monthsAgo: 3, notes: 'Q4 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 4800, monthsAgo: 0, notes: 'Q1 dividend' },
      ],
    },
    {
      assetName: 'DEGIRO beleggingsportefeuille',
      ticker: 'IEAG',
      isin: 'IE00B3DKXQ41',
      name: 'iShares Euro Aggregate Bond ETF',
      units: 800,
      avg_purchase_price: 93.75,
      current_price: 100.00,
      purchase_date_monthsAgo: 36,
      asset_class: 'bonds',
      sector: null,
      geography: 'europe',
      currency: 'EUR',
      ter: 0.0009,           // iShares Euro Aggregate Bond TER 0.09%
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 300, price_per_unit: 90.00, total_amount: 27000, monthsAgo: 36, notes: 'Initiële obligatiepositie' },
        { type: 'buy', units: 250, price_per_unit: 94.00, total_amount: 23500, monthsAgo: 24, notes: 'Bijkoop obligaties' },
        { type: 'buy', units: 250, price_per_unit: 98.00, total_amount: 24500, monthsAgo: 12, notes: 'Herbalancering naar obligaties' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1200, monthsAgo: 6, notes: 'Halfjaarlijkse coupon' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1250, monthsAgo: 0, notes: 'Halfjaarlijkse coupon' },
      ],
    },
    {
      assetName: 'DEGIRO beleggingsportefeuille',
      ticker: 'TDIV',
      isin: 'NL0011683594',
      name: 'VanEck Morningstar Developed Markets Dividend Leaders ETF',
      units: 180,
      avg_purchase_price: 228.47,
      current_price: 250.00,
      purchase_date_monthsAgo: 30,
      asset_class: 'equity',
      sector: 'dividend',
      geography: 'europe',
      currency: 'EUR',
      ter: 0.0120,           // Actief beheerd dividendfonds TER 1.20% — demonstreert kostenverschil
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 50, price_per_unit: 215.00, total_amount: 10750, monthsAgo: 30, notes: 'Start dividendstrategie' },
        { type: 'buy', units: 40, price_per_unit: 225.00, total_amount: 9000, monthsAgo: 24, notes: null },
        { type: 'buy', units: 45, price_per_unit: 235.00, total_amount: 10575, monthsAgo: 18, notes: null },
        { type: 'buy', units: 45, price_per_unit: 240.00, total_amount: 10800, monthsAgo: 8, notes: 'Bijkoop dividendstrategie' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1800, monthsAgo: 9, notes: 'Q2 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1900, monthsAgo: 3, notes: 'Q4 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 2000, monthsAgo: 0, notes: 'Q1 dividend' },
      ],
    },
    {
      assetName: 'DEGIRO beleggingsportefeuille',
      ticker: 'EMIM',
      isin: 'IE00BKM4GZ66',
      name: 'iShares Core MSCI Emerging Markets IMI ETF',
      units: 900,
      avg_purchase_price: 26.11,
      current_price: 27.78,
      purchase_date_monthsAgo: 24,
      asset_class: 'equity',
      sector: null,
      geography: 'emerging_markets',
      currency: 'EUR',
      transactions: [
        { type: 'buy', units: 500, price_per_unit: 25.00, total_amount: 12500, monthsAgo: 24, notes: 'Diversificatie opkomende markten' },
        { type: 'buy', units: 400, price_per_unit: 27.50, total_amount: 11000, monthsAgo: 10, notes: 'Bijkoop EM' },
      ],
    },
  ],
  // Agressief target: 80% aandelen, 10% obligaties, 5% vastgoed, 5% crypto
  // Bewuste drift: Willem is 86% equity (6% boven target) en 14% bonds (4% boven target),
  // maar heeft 0% vastgoed en 0% crypto — drift op die categorieën is 5% (triggert bij threshold 10% NIET)
  target_allocations: [
    { view_mode: 'asset_class', category: 'equity', target_pct: 80 },
    { view_mode: 'asset_class', category: 'bonds', target_pct: 10 },
    { view_mode: 'asset_class', category: 'real_estate', target_pct: 5 },
    { view_mode: 'asset_class', category: 'crypto', target_pct: 5 },
  ],
  appSettings: {
    'whatif_scenarios:PLACEHOLDER': {
      scenarios: [{
        id: 'sample-willem-1',
        name: 'Vroeg stoppen op 50',
        createdAt: '2026-03-01T10:00:00Z',
        overrides: {
          monthlyIncome: 6500,
          workDaysPerWeek: 5,
          savingsRate: 55,
          expectedReturn: 6.5,
          extraContribution: 500,
        },
        events: [{
          id: 'willem-evt-1',
          name: 'Vroegpensioen',
          event_type: 'early_retirement',
          target_age: 50,
          one_time_cost: 0,
          monthly_cost_change: 0,
          monthly_income_change: -6500,
          duration_months: 0,
          whatIfDisabled: false,
          metadata: {},
        }],
        fireAge: 50,
        colorIndex: 1,
      }],
    },
  },
}

// ══════════════════════════════════════════════════════════════
// PERSONA 4: Marijke Vermeer — "De gepensioneerde"
// Uniek: al met pensioen, uitkeringsfase, pensioen strategie
// ══════════════════════════════════════════════════════════════

const marijkeTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(15, [
    // Inkomen — AOW + ABP pensioen + dividend
    { day: 22, amount: 1200, description: 'AOW uitkering', counterparty_name: 'SVB', counterparty_iban: 'NL86INGB0002445500', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 24, amount: 1800, description: 'ABP pensioen', counterparty_name: 'ABP', counterparty_iban: 'NL91ABNA0585647300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 5, amount: 400, description: 'Dividenduitkering', counterparty_name: 'Rabobank Beleggen', counterparty_iban: 'NL44RABO0100056789', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true, jitterPct: 0.15 },
    // Vaste lasten (hypotheekvrij!)
    { day: 1, amount: -95, description: 'Energie', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false, jitterPct: 0.15 },
    { day: 1, amount: -175, description: 'Zorgverzekering', counterparty_name: 'Menzis', counterparty_iban: 'NL93ABNA0585927836', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 1, amount: -65, description: 'Opstal + inboedelverzekering', counterparty_name: 'Univ\u00e9', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -55, description: 'Gemeentelijke belasting', counterparty_name: 'Gemeente Zwolle', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer (lager — geen woon-werkverkeer meer)
    { day: 1, amount: -45, description: 'Autoverzekering', counterparty_name: 'ANWB Verzekeringen', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 10, amount: -40, description: 'Brandstof', counterparty_name: 'Shell', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false, jitterPct: 0.25 },
    // Medische kosten (hoger op 68-jarige leeftijd)
    { day: 18, amount: -85, description: 'Apotheek', counterparty_name: 'Apotheek Zwolle', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false, jitterPct: 0.30 },
    // Leuke dingen (vrije tijd focus)
    { day: 12, amount: -65, description: 'Restaurant met vriendinnen', counterparty_name: 'Restaurant De Librije', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.20 },
    { day: 20, amount: -35, description: 'Bridgeclub', counterparty_name: 'Bridgeclub Zwolle', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    { day: 7, amount: -15.99, description: 'NPO Start Plus', counterparty_name: 'NPO', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    // Sparen (bescheiden, focus op behoud)
    { day: 1, amount: -200, description: 'Overboeking spaarrekening', counterparty_name: 'Rabobank Spaar', counterparty_iban: 'NL33RABO0300056790', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
  ]),
  ...generateGroceryTransactions(15, 65, 15), // Lagere boodschappenkosten (1-2 personen)
  // Irregular/seasonal transactions — gepensioneerden-patroon
  ...generateIrregularTransactions([
    { monthsAgo: 1, day: 20, amount: -45, description: 'Cadeaus kleinkinderen', counterparty_name: 'Intertoys', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 2, day: 10, amount: -320, description: 'Kerstdiner familie', counterparty_name: 'Restaurant De Librije', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false },
    { monthsAgo: 3, day: 5, amount: -155, description: 'Tandarts + gebitsreiniging', counterparty_name: 'Tandarts Zwolle', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 4, day: 15, amount: -1800, description: 'Wintervakantie Canarische Eilanden', counterparty_name: 'TUI', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 5, day: 8, amount: -210, description: 'Tuinonderhoud voorjaar', counterparty_name: 'Tuincentrum Zwolle', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { monthsAgo: 6, day: 12, amount: -1200, description: 'Stacaravan seizoensplaats', counterparty_name: 'Camping De Ree\u00ebnwissel', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 7, day: 3, amount: -185, description: 'ANWB wegenwacht + reisverzekering', counterparty_name: 'ANWB', counterparty_iban: null, budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { monthsAgo: 8, day: 22, amount: -95, description: 'Verjaardagscadeau echtgenoot', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 9, day: 14, amount: -280, description: 'Fysiotherapie (10 behandelingen)', counterparty_name: 'Fysiotherapie Zwolle', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 10, day: 25, amount: -65, description: 'Sinterklaas kleinkinderen', counterparty_name: 'Bol.com', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 11, day: 18, amount: -420, description: 'APK + kleine beurt auto', counterparty_name: 'Garage Van Dijk', counterparty_iban: null, budgetSlug: S.AUTO_ONDERHOUD, is_income: false },
    { monthsAgo: 12, day: 5, amount: -2200, description: 'Zomervakantie Dordogne', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 13, day: 10, amount: -125, description: 'Nieuwe wandelschoenen', counterparty_name: 'Bever', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
    { monthsAgo: 14, day: 20, amount: -350, description: 'Oogarts + nieuwe bril', counterparty_name: 'Specsavers', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
  ]),
]

const marijkeData: PersonaData = {
  meta: {
    name: 'Marijke Vermeer',
    subtitle: 'De Gepensioneerde',
    description: 'Al 3 jaar met pensioen, geniet van het leven met \u20ac820K netto vermogen. AOW + ABP pensioen + dividend vormen een comfortabel passief inkomen van \u20ac3.400/maand.',
    color: 'emerald',
    avatarColor: '#6B8E6B',
    netWorth: 820000,
    income: 3400,
    expenses: 2800,
    backgroundStory: 'Marijke was 35 jaar verpleegkundig specialist bij Isala Zwolle. Samen met haar man Henk (70) heeft ze een hypotheekvrij huis in Zwolle-Zuid. Sinds haar pensioen op 65 geniet ze van bridgen, wandelen met vriendinnen en de kleinkinderen. Hun stacaravan in Drenthe is hun zomerse uitvalsbasis. Financieel zijn ze comfortabel: AOW, ABP-pensioen en een degelijke beleggingsportefeuille met focus op dividend en obligaties. Marijke wil een deel nalaten aan de kinderen \u2014 de rest is voor genieten.',
    challenges: ['Legacy-planning: hoeveel nalaten vs. zelf uitgeven', 'Portefeuille verschuiven naar meer obligaties/minder risico', 'Stijgende zorgkosten plannen', 'Stacaravan verkopen op het juiste moment'],
    currentSituation: 'Comfortabel met pensioen met \u20ac600/maand surplus. Portefeuille in uitkeringsfase, focus op kapitaalbehoud en dividend-inkomsten.',
    firstGoal: 'Wereldcruise met Henk',
    sovereignty: 'mastery',
    modules: ALL_MODULES,
  },
  profile: {
    full_name: 'Marijke Vermeer',
    date_of_birth: '1957-06-20',
    household_type: 'samen',
    temporal_balance: 5,
    expected_return: 0.05,
    inflation_rate: 0.02,
    fire_end_strategy: 'pensioen',
    fire_legacy_amount: 200000,
    retirement_expense_method: 'custom_amount',
    retirement_expense_custom_amount: 33600, // JAARbedrag (€2.800/mnd x 12); canoniek jaarbasis, zie computeRetirementExpenses (lib/budget-utils.ts)
    withdrawal_strategy: 'guardrails',
    guardrail_floor: 0.80,
    guardrail_ceiling: 1.20,
    guardrail_cut_step: 0.10,
    guardrail_raise_step: 0.10,
    marginaal_tarief: 0.4950, // hoog inkomen — hoogste schijf
    net_monthly_income: 3400,
    estimated_monthly_expenses: 2800,
    feature_preferences: { _welcome_seen: true },
    widget_prefs: makeWidgetPrefs([
      'netto_vermogen', { id: 'fire_prognose', size: 'full' }, 'box3_drag',
      'holdings', 'vrijheidsmijlpalen', 'acties', 'gezondheids_score',
    ]),
    active_modules: ALL_MODULES,
  },
  bank_accounts: [
    { name: 'Betaalrekening Rabobank', iban: 'NL22RABO0300056788', bank_name: 'Rabobank', account_type: 'checking', balance: 5200, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening Rabobank', iban: 'NL33RABO0300056790', bank_name: 'Rabobank', account_type: 'savings', balance: 35000, is_active: true, sort_order: 1 },
    { name: 'Spaarrekening ASN', iban: 'NL55ASNB0708956432', bank_name: 'ASN Bank', account_type: 'savings', balance: 15000, is_active: true, sort_order: 2 },
  ],
  assets: [
    { name: 'Beleggingsportefeuille Rabobank', asset_type: 'investment', current_value: 320000, purchase_value: 260000, purchase_date: '2005-01-01', expected_return: 5, monthly_contribution: 0, institution: 'Rabobank', subtype: 'etf', risk_profile: 'laag', has_holdings_tracking: true },
    { name: 'Eigen woning Zwolle', asset_type: 'eigen_huis', current_value: 420000, purchase_value: 180000, purchase_date: '1992-03-01', expected_return: 3, monthly_contribution: 0, institution: '', woz_value: 440000, address_postcode: '8024 AA', address_house_number: '12' },
    { name: 'Stacaravan Drenthe', asset_type: 'physical', current_value: 25000, purchase_value: 35000, purchase_date: '2018-06-01', expected_return: -5, monthly_contribution: 0, institution: '', depreciation_rate: 5, sale_config: { stand: 'vast_moment', triggerAge: 73 } },
  ],
  debts: [], // Hypotheekvrij
  budgets: makeBudgets({
    [S.INKOMEN]: 3400, [S.SALARIS_UITKERING]: 3000,
    [S.TOESLAGEN_KINDERBIJSLAG]: 0, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 400,
    [S.VASTE_LASTEN_WONEN]: 390, [S.HUUR_HYPOTHEEK]: 0, [S.GAS_WATER_LICHT]: 95,
    [S.VERZEKERINGEN_WONEN]: 240, [S.GEMEENTELIJKE_LASTEN]: 55,
    [S.DAGELIJKSE_UITGAVEN]: 430, [S.BOODSCHAPPEN]: 260, [S.HUISHOUDEN_VERZORGING]: 50,
    [S.KINDEREN_SCHOOL]: 0, [S.MEDISCHE_KOSTEN]: 120,
    [S.VERVOER]: 130, [S.BRANDSTOF_OV]: 40, [S.AUTO_VASTE_LASTEN]: 45,
    [S.AUTO_ONDERHOUD]: 35, [S.FIETS_DEELVERVOER]: 10,
    [S.LEUKE_DINGEN]: 350, [S.UIT_ETEN_HORECA]: 80, [S.VRIJE_TIJD_SPORT]: 60,
    [S.VAKANTIE]: 150, [S.KLEDING_OVERIGE]: 60,
    [S.SPAREN_SCHULDEN]: 200, [S.SPAREN_NOODBUFFER]: 200, [S.INVESTEREN_FIRE]: 0,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 0, [S.SCHULDEN_AFLOSSINGEN]: 0, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: marijkeTransactions,
  goals: [
    { name: 'Wereldcruise met Henk', description: 'Een 3-weekse cruise door de Middellandse Zee \u2014 het droomavontuur na een leven hard werken', goal_type: 'savings', target_value: 12000, current_value: 8500, target_date: monthsAgo(-12), icon: 'Ship', color: 'teal', is_completed: false },
    { name: 'Erfenis structureren', description: 'Minimaal \u20ac200.000 nalaten aan de kinderen, fiscaal optimaal verdeeld', goal_type: 'net_worth', target_value: 200000, current_value: 850000, target_date: monthsAgo(-120), icon: 'Heart', color: 'purple', is_completed: false },
  ],
  life_events: [
    { name: 'Pensioen', event_type: 'early_retirement', target_age: 65, target_date: '2022-06-20', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0, icon: 'Sunset', is_active: false, sort_order: 0, metadata: { gewensteMaandinkomen: 3400, pensioenUitkering: 1800 } },
    { name: 'Stacaravan verkopen', event_type: 'custom', target_age: 73, target_date: '2030-06-20', one_time_cost: 0, monthly_cost_change: -100, monthly_income_change: 0, duration_months: 0, icon: 'Home', is_active: true, sort_order: 1, linked_asset_name: 'Stacaravan Drenthe', metadata: { verkoopprijs: 20000, reden: 'Te oud om te onderhouden' } },
    { name: 'AOW partner Henk', event_type: 'aow', target_age: null, target_date: '2025-03-15', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0, icon: 'Landmark', is_active: true, sort_order: 2, is_indexed: true, metadata: { leefsituatie: 'samenwonend' } },
    { name: 'Lijfrente-uitkering', event_type: 'custom', target_age: 70, target_date: '2027-06-20', one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 400, duration_months: 180, icon: 'Banknote', is_active: true, sort_order: 3, metadata: { reden: 'Opgebouwde lijfrente komt tot uitkering, 15 jaar looptijd' } },
    { name: 'Verbouwing badkamer', event_type: 'custom', target_age: 69, target_date: '2026-09-01', one_time_cost: -8500, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0, icon: 'Wrench', is_active: true, sort_order: 4, metadata: { reden: 'Senioren-aanpassing badkamer met inloopdouche' } },
  ],
  recommendations: [
    {
      title: 'Verschuif naar defensievere allocatie',
      description: 'Op 68 is een defensievere portefeuille verstandig. Overweeg meer obligaties en minder aandelen om je vermogen te beschermen.',
      recommendation_type: 'asset_reallocation',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 0,
      related_budget_slug: null,
      priority_score: 4,
      status: 'pending',
      suggested_actions: [
        { title: 'Verhoog obligatie-positie naar 40%', freedom_days_impact: 0 },
        { title: 'Overweeg deposito-ladder voor voorspelbaar inkomen', freedom_days_impact: 0 },
      ],
      actions: [
        { source: 'ai', title: 'Analyseer huidige risicoverdeling', description: 'Bekijk de verdeling over aandelen, obligaties en deposito\'s en vergelijk met je risicoprofiel', freedom_days_impact: 0, euro_impact_monthly: 0, status: 'open', priority_score: 4, scheduled_week: getNextWeek() },
        { source: 'ai', title: 'Plan een herbalancering', description: 'Verschuif geleidelijk 10% van aandelen-ETFs naar obligatie-ETFs of een deposito-ladder', freedom_days_impact: 0, euro_impact_monthly: 0, status: 'open', priority_score: 3 },
      ],
    },
    {
      title: 'Plan je erfenis fiscaal slim',
      description: 'Met \u20ac850K vermogen en een legacy-doel van \u20ac200K kun je jaarlijks schenken om erfbelasting te minimaliseren. De vrijstelling is ~\u20ac6.600 per kind per jaar.',
      recommendation_type: 'savings_boost',
      euro_impact_monthly: 0,
      euro_impact_yearly: 6600,
      freedom_days_per_year: 0,
      related_budget_slug: null,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Start jaarlijkse schenking aan kinderen', freedom_days_impact: 0, euro_impact_monthly: 550 },
      ],
      actions: [
        { source: 'ai', title: 'Maak een schenkingsplan', description: 'Gebruik de jaarlijkse vrijstelling van ~\u20ac6.600 per kind om erfbelasting te voorkomen. Bij 2 kinderen is dat \u20ac13.200/jaar belastingvrij.', freedom_days_impact: 0, euro_impact_monthly: 0, status: 'open', priority_score: 3 },
      ],
    },
    {
      title: 'Stijgende zorgkosten voorbereiden',
      description: 'Zorgkosten stijgen gemiddeld met 5% per jaar na je 65e. Reserveer een buffer voor onverwachte medische kosten en eventuele thuiszorg.',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: -50,
      euro_impact_yearly: -600,
      freedom_days_per_year: 0,
      related_budget_slug: S.MEDISCHE_KOSTEN,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Verhoog medisch budget naar \u20ac170/maand', freedom_days_impact: 0, euro_impact_monthly: -50 },
      ],
      actions: [
        { source: 'ai', title: 'Verhoog je medische kostenbudget', description: 'Op basis van je leeftijd en huidige uitgaven adviseren we \u20ac170/mnd te reserveren voor medische kosten.', freedom_days_impact: 0, euro_impact_monthly: -50, status: 'open', priority_score: 3 },
      ],
    },
  ],
  net_worth_snapshots: [
    // Stabiel vermogen, lichte groei door dividend + waardevermeerdering woning
    // total_assets = woning (~420K) + beleggingen (~320K) + stacaravan (~25K) + spaar (~50K) + checking (~5K) = ~820K
    // total_debts = 0 (hypotheekvrij)
    { monthsAgo: 14, total_assets: 798000, total_debts: 0, net_worth: 798000 },
    { monthsAgo: 13, total_assets: 802000, total_debts: 0, net_worth: 802000 },
    { monthsAgo: 12, total_assets: 806000, total_debts: 0, net_worth: 806000 },
    { monthsAgo: 11, total_assets: 810000, total_debts: 0, net_worth: 810000 },
    { monthsAgo: 10, total_assets: 814000, total_debts: 0, net_worth: 814000 },
    { monthsAgo: 9, total_assets: 818000, total_debts: 0, net_worth: 818000 },
    { monthsAgo: 8, total_assets: 822000, total_debts: 0, net_worth: 822000 },
    { monthsAgo: 7, total_assets: 826000, total_debts: 0, net_worth: 826000 },
    { monthsAgo: 6, total_assets: 830000, total_debts: 0, net_worth: 830000 },
    { monthsAgo: 5, total_assets: 834000, total_debts: 0, net_worth: 834000 },
    { monthsAgo: 4, total_assets: 838000, total_debts: 0, net_worth: 838000 },
    { monthsAgo: 3, total_assets: 842000, total_debts: 0, net_worth: 842000 },
    { monthsAgo: 2, total_assets: 845000, total_debts: 0, net_worth: 845000 },
    { monthsAgo: 1, total_assets: 848000, total_debts: 0, net_worth: 848000 },
    { monthsAgo: 0, total_assets: 820200, total_debts: 0, net_worth: 820200 },
  ],
  valuations: [
    // Beleggingsportefeuille: stabiele groei door dividend herbelegging (\u20ac295K \u2192 \u20ac320K)
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 14, value: 295000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 12, value: 300000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 10, value: 304000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 8, value: 308000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 6, value: 312000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 4, value: 315000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 2, value: 318000 },
    { assetName: 'Beleggingsportefeuille Rabobank', entity_type: 'asset', monthsAgo: 0, value: 320000 },
    // Woning: lichte stijging (\u20ac400K \u2192 \u20ac420K)
    { assetName: 'Eigen woning Zwolle', entity_type: 'asset', monthsAgo: 12, value: 400000 },
    { assetName: 'Eigen woning Zwolle', entity_type: 'asset', monthsAgo: 6, value: 410000 },
    { assetName: 'Eigen woning Zwolle', entity_type: 'asset', monthsAgo: 0, value: 420000 },
  ],
  holdings: [
    {
      assetName: 'Beleggingsportefeuille Rabobank',
      ticker: 'TDIV',
      isin: 'NL0011683594',
      name: 'VanEck Morningstar Developed Markets Dividend Leaders ETF',
      units: 720,
      avg_purchase_price: 195.83,
      current_price: 250.00,
      purchase_date_monthsAgo: 60,
      asset_class: 'equity',
      sector: 'dividend',
      geography: 'europe',
      is_favorite: true,
      currency: 'EUR',
      transactions: [
        { type: 'buy', units: 300, price_per_unit: 180.00, total_amount: 54000, monthsAgo: 60, notes: 'Initi\u00eble dividendstrategie bij pensioen' },
        { type: 'buy', units: 200, price_per_unit: 195.00, total_amount: 39000, monthsAgo: 48, notes: 'Bijkoop na herbeleggen' },
        { type: 'buy', units: 120, price_per_unit: 210.00, total_amount: 25200, monthsAgo: 36, notes: null },
        { type: 'buy', units: 100, price_per_unit: 225.00, total_amount: 22500, monthsAgo: 24, notes: 'Laatste bijkoop' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 3600, monthsAgo: 9, notes: 'Q2 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 3800, monthsAgo: 3, notes: 'Q4 dividend' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 3900, monthsAgo: 0, notes: 'Q1 dividend' },
      ],
    },
    {
      assetName: 'Beleggingsportefeuille Rabobank',
      ticker: 'IEAG',
      isin: 'IE00B3DKXQ41',
      name: 'iShares Euro Aggregate Bond ETF',
      units: 1000,
      avg_purchase_price: 95.00,
      current_price: 100.00,
      purchase_date_monthsAgo: 48,
      asset_class: 'bonds',
      sector: null,
      geography: 'europe',
      currency: 'EUR',
      transactions: [
        { type: 'buy', units: 500, price_per_unit: 92.00, total_amount: 46000, monthsAgo: 48, notes: 'Opbouw obligatiepositie' },
        { type: 'buy', units: 300, price_per_unit: 96.00, total_amount: 28800, monthsAgo: 30, notes: 'Bijkoop obligaties' },
        { type: 'buy', units: 200, price_per_unit: 99.00, total_amount: 19800, monthsAgo: 12, notes: 'Herbalancering' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1500, monthsAgo: 6, notes: 'Halfjaarlijkse coupon' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1600, monthsAgo: 0, notes: 'Halfjaarlijkse coupon' },
      ],
    },
    {
      assetName: 'Beleggingsportefeuille Rabobank',
      ticker: null,
      isin: null,
      name: 'Deposito-ladder (3 tranches)',
      units: 1,
      avg_purchase_price: 40000,
      current_price: 40000,
      purchase_date_monthsAgo: 24,
      asset_class: 'bonds',
      sector: null,
      geography: 'europe',
      currency: 'EUR',
      transactions: [
        { type: 'buy', units: 1, price_per_unit: 40000, total_amount: 40000, monthsAgo: 24, notes: '3x \u20ac13.333 deposito: 1jr, 2jr, 3jr looptijd' },
      ],
    },
  ],
}

// ══════════════════════════════════════════════════════════════
// PERSONA 5: Tessa Compleet — "De complete tester"
// ══════════════════════════════════════════════════════════════
//
// Bewust maximaal-volledige persona: élk asset-type, élk schuld-type, een
// volledige cashflow én alle in-depth apps (holdings, woonbalans, verhuur,
// hypotheekplanner) aan. Dient twee doelen:
//   1. Visuele/seed-dekking op /beheer/testdata (alle categoriekaarten gevuld).
//   2. Bron voor de horizon-strategie-regressietest (zie
//      lib/regression-tests/horizon-strategie/persona-fixture.ts) — een
//      DGA-huishouden met genoeg belegbaar vermogen dat FIRE binnen de horizon
//      bereikbaar is, ook nadat het eigen huis uit de FIRE-pot valt.

const tessaTransactions: PersonaTransactionTemplate[] = [
  ...generateMonthlyTransactions(15, [
    // Inkomen
    { day: 25, amount: 5200, description: 'Salaris (DGA)', counterparty_name: 'Volkert Compleet Holding BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.SALARIS_UITKERING, is_income: true },
    { day: 25, amount: 1450, description: 'Salaris partner', counterparty_name: 'Onderwijsgroep Midden BV', counterparty_iban: 'NL39RABO0300065264', budgetSlug: S.SALARIS_UITKERING, is_income: true, accountIndex: 0 },
    { day: 10, amount: 950, description: 'Huurinkomsten appartement', counterparty_name: 'Huurder M. de Wit', counterparty_iban: null, budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    // Vaste lasten wonen
    { day: 1, amount: -1280, description: 'Hypotheek', counterparty_name: 'ABN AMRO Hypotheken', counterparty_iban: 'NL26ABNA0123456789', budgetSlug: S.HUUR_HYPOTHEEK, is_income: false },
    { day: 1, amount: -210, description: 'Energie', counterparty_name: 'Vattenfall', counterparty_iban: 'NL20INGB0001234567', budgetSlug: S.GAS_WATER_LICHT, is_income: false, jitterPct: 0.15 },
    { day: 1, amount: -195, description: 'Verzekeringen wonen', counterparty_name: 'Interpolis', counterparty_iban: 'NL75ABNA0500100200', budgetSlug: S.VERZEKERINGEN_WONEN, is_income: false },
    { day: 15, amount: -110, description: 'Gemeentelijke lasten', counterparty_name: 'Gemeente Amersfoort', counterparty_iban: 'NL45BNGH0285000522', budgetSlug: S.GEMEENTELIJKE_LASTEN, is_income: false },
    // Vervoer
    { day: 1, amount: -125, description: 'Autoverzekering', counterparty_name: 'Allianz', counterparty_iban: 'NL02ABNA0450884700', budgetSlug: S.AUTO_VASTE_LASTEN, is_income: false },
    { day: 12, amount: -95, description: 'Laden + brandstof', counterparty_name: 'Fastned', counterparty_iban: null, budgetSlug: S.BRANDSTOF_OV, is_income: false, jitterPct: 0.20 },
    // Dagelijks / huishouden
    { day: 8, amount: -55, description: 'Drogist + huishoudelijk', counterparty_name: 'Etos', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false, jitterPct: 0.20 },
    { day: 5, amount: -340, description: 'Kinderopvang', counterparty_name: 'KDV De Vlinder', counterparty_iban: 'NL68INGB0009988776', budgetSlug: S.KINDEREN_SCHOOL, is_income: false },
    // Leuke dingen
    { day: 14, amount: -85, description: 'Uit eten', counterparty_name: 'Restaurant Blok', counterparty_iban: null, budgetSlug: S.UIT_ETEN_HORECA, is_income: false, jitterPct: 0.25 },
    { day: 7, amount: -17.99, description: 'Streaming', counterparty_name: 'Netflix', counterparty_iban: null, budgetSlug: S.VRIJE_TIJD_SPORT, is_income: false },
    // Sparen & beleggen
    { day: 2, amount: -1500, description: 'Meesman maandinleg', counterparty_name: 'Meesman', counterparty_iban: 'NL15RABO0300000003', budgetSlug: S.INVESTEREN_FIRE, is_income: false },
    { day: 2, amount: -200, description: 'Spaarrekening storting', counterparty_name: 'Spaarrekening', counterparty_iban: 'NL11RABO0100000002', budgetSlug: S.SPAREN_NOODBUFFER, is_income: false },
  ]),
  ...generateGroceryTransactions(15, 130, 30),
  ...generateIrregularTransactions([
    { monthsAgo: 2, day: 22, amount: -1850, description: 'Zomervakantie Italië', counterparty_name: 'Booking.com', counterparty_iban: null, budgetSlug: S.VAKANTIE, is_income: false },
    { monthsAgo: 5, day: 12, amount: -640, description: 'Onderhoud verhuurd appartement', counterparty_name: 'Klusbedrijf Van Dam', counterparty_iban: null, budgetSlug: S.HUISHOUDEN_VERZORGING, is_income: false },
    { monthsAgo: 8, day: 3, amount: -420, description: 'Tandarts gezin', counterparty_name: 'Tandartspraktijk Amersfoort', counterparty_iban: null, budgetSlug: S.MEDISCHE_KOSTEN, is_income: false },
    { monthsAgo: 1, day: 18, amount: 2400, description: 'Dividenduitkering eigen BV', counterparty_name: 'Volkert Compleet Holding BV', counterparty_iban: 'NL91ABNA0417164300', budgetSlug: S.OVERIGE_INKOMSTEN, is_income: true },
    { monthsAgo: 4, day: 9, amount: -310, description: 'Winterkleding gezin', counterparty_name: 'De Bijenkorf', counterparty_iban: null, budgetSlug: S.KLEDING_OVERIGE, is_income: false },
  ]),
]

const tessaData: PersonaData = {
  meta: {
    name: 'Tessa Compleet',
    subtitle: 'De complete tester',
    description: 'DGA-huishouden met élk type bezitting en schuld, volledige cashflow en alle in-depth apps actief. Referentie-persona voor de horizon-strategie-regressietest.',
    color: 'amber',
    avatarColor: '#C98A3C',
    netWorth: 1180000,
    income: 7600,
    expenses: 4100,
    backgroundStory: 'Tessa is DGA van een klein adviesbureau en woont met haar partner en twee jonge kinderen in Amersfoort. Over de jaren heeft het huishouden een brede dwarsdoorsnede van vermogen opgebouwd: een eigen woning met hypotheek, een verhuurd appartement, een fors beleggingsportefeuille bij Meesman, een belang in de eigen BV, crypto, pensioen, een oude spaarpolis en wat vorderingen. Daar staan diverse kleine en grote schulden tegenover. Deze persona is bewust ontworpen om élk scherm, élke categoriekaart én alle strategie-combinaties van de horizon-grafiek te raken.',
    challenges: ['Eigen woning wel of niet meetellen in de FIRE-pot', 'Optimale eindstrategie kiezen (opmaken vs. nalaten)', 'Belegbaar vermogen vs. niet-liquide BV-belang en vastgoed'],
    currentSituation: 'Ruim belegbaar vermogen, stabiele DGA-cashflow en een verhuurd appartement. FIRE is binnen de horizon bereikbaar, óók wanneer de eigen woning buiten de FIRE-pot blijft.',
    firstGoal: 'Volledige vrijheid (FIRE) vóór 55 — en bepalen wat er daarna met het vermogen gebeurt',
    sovereignty: 'mastery',
    modules: ALL_MODULES,
  },
  profile: {
    full_name: 'Tessa Compleet',
    date_of_birth: '1984-05-20',
    household_type: 'gezin',
    temporal_balance: 4,
    expected_return: 0.07,
    inflation_rate: 0.02,
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    fire_legacy_amount: 0,
    retirement_expense_method: 'essential_budgets',
    withdrawal_strategy: 'static',
    net_monthly_income: 7600,
    estimated_monthly_expenses: 4100,
    marginaal_tarief: 0.4950,
    feature_preferences: { _welcome_seen: true },
    widget_prefs: makeWidgetPrefs([
      'netto_vermogen', 'cash_flow', { id: 'fire_prognose', size: 'full' }, 'doelen',
      'assets', 'holdings', 'budgetten', { id: 'uitgaven_heatmap', size: 'half' },
      'monte_carlo', 'trend_sparen', 'acties', { id: 'inflatie_impact', size: 'mini' },
    ]),
    active_modules: ALL_MODULES,
  },
  bank_accounts: [
    { name: 'Gezamenlijke rekening ABN', iban: 'NL26ABNA0123456789', bank_name: 'ABN AMRO', account_type: 'checking', balance: 8200, is_active: true, sort_order: 0 },
    { name: 'Spaarrekening gezin', iban: 'NL11RABO0100000002', bank_name: 'Rabobank', account_type: 'savings', balance: 21500, is_active: true, sort_order: 1 },
    { name: 'Zakelijke buffer', iban: 'NL68INGB0009988776', bank_name: 'ING', account_type: 'business', balance: 4300, is_active: true, sort_order: 2 },
  ],
  assets: [
    // Belegbaar / liquide
    { name: 'Spaargeld direct opneembaar', asset_type: 'cash', current_value: 30000, purchase_value: 30000, purchase_date: '2022-01-01', expected_return: 0, monthly_contribution: 0, institution: 'ABN AMRO', subtype: 'savings_account' },
    { name: 'Spaardeposito 3-jaar', asset_type: 'savings', current_value: 45000, purchase_value: 45000, purchase_date: '2024-01-15', expected_return: 3, monthly_contribution: 200, institution: 'Rabobank', subtype: 'deposito', risk_profile: 'laag', is_liquid: false, lock_end_date: '2027-01-15' },
    { name: 'Meesman Wereldwijd Totaal', asset_type: 'investment', current_value: 300000, purchase_value: 210000, purchase_date: '2016-03-01', expected_return: 7, monthly_contribution: 1500, institution: 'Meesman', subtype: 'indexfonds', risk_profile: 'middel', ticker_symbol: 'MEESMAN-WWT', has_holdings_tracking: true },
    { name: 'Pensioenfonds ABP', asset_type: 'retirement', current_value: 120000, purchase_value: 0, purchase_date: '2008-01-01', expected_return: 5, monthly_contribution: 0, institution: 'ABP', subtype: 'uitkeringsregeling', risk_profile: 'laag', tax_benefit: true, retirement_provider_type: 'bedrijfspensioenfonds' },
    { name: 'Crypto portefeuille', asset_type: 'crypto', current_value: 20000, purchase_value: 9000, purchase_date: '2021-02-01', expected_return: 0, monthly_contribution: 0, institution: 'Bitvavo', subtype: 'bitcoin', risk_profile: 'hoog' },
    // Niet-liquide / overig
    { name: 'Eigen woning Amersfoort', asset_type: 'eigen_huis', current_value: 560000, purchase_value: 410000, purchase_date: '2014-06-01', expected_return: 3, monthly_contribution: 0, institution: '', woz_value: 540000, address_postcode: '3811 AA', address_house_number: '12', has_woonbalans_tracking: true },
    { name: 'Verhuurd appartement Utrecht', asset_type: 'real_estate', current_value: 185000, purchase_value: 150000, purchase_date: '2019-09-01', expected_return: 3, monthly_contribution: 0, institution: '', subtype: 'beleggingspand', rental_income: 950, has_rental_tracking: true },
    { name: 'Auto (elektrisch)', asset_type: 'vehicle', current_value: 28000, purchase_value: 46000, purchase_date: '2023-03-01', expected_return: 0, monthly_contribution: 0, institution: '', subtype: 'auto_eigendom', depreciation_rate: 12 },
    { name: 'Kunst + sieraden', asset_type: 'physical', current_value: 14000, purchase_value: 11000, purchase_date: '2017-08-15', expected_return: 0, monthly_contribution: 0, institution: '', subtype: 'kunst' },
    { name: 'Belang Volkert Compleet Holding BV', asset_type: 'deelneming', current_value: 180000, purchase_value: 18000, purchase_date: '2012-01-01', expected_return: 6, monthly_contribution: 0, institution: 'Volkert Compleet Holding BV', subtype: 'eigen_bv', kvk_number: '30112233', ownership_percentage: 100, annual_dividend: 90000 },
    { name: 'Kapitaalverzekering (oud)', asset_type: 'levensverzekering', current_value: 28000, purchase_value: 19000, purchase_date: '2004-09-01', expected_return: 2, monthly_contribution: 0, institution: 'Nationale-Nederlanden', subtype: 'kapitaalverzekering' },
    { name: 'Rekening-courant vordering BV', asset_type: 'vordering', current_value: 35000, purchase_value: 35000, purchase_date: '2023-01-01', expected_return: 3, monthly_contribution: 0, institution: 'Volkert Compleet Holding BV', subtype: 'dga_lening' },
    { name: 'Aanhangwagen + gereedschap', asset_type: 'other', current_value: 6000, purchase_value: 9000, purchase_date: '2020-05-01', expected_return: 0, monthly_contribution: 0, institution: '' },
  ],
  debts: [
    { name: 'Hypotheek eigen woning', debt_type: 'mortgage', original_amount: 360000, current_balance: 300000, interest_rate: 3.1, minimum_payment: 1280, monthly_payment: 1280, start_date: '2014-06-01', creditor: 'ABN AMRO', subtype: 'annuiteit', is_tax_deductible: true, nhg: false, linked_asset_name: 'Eigen woning Amersfoort', repayment_type: 'annuiteit', has_hypotheekplanner_tracking: true },
    { name: 'Beleggingshypotheek appartement', debt_type: 'mortgage', original_amount: 130000, current_balance: 110000, interest_rate: 3.6, minimum_payment: 330, monthly_payment: 330, start_date: '2019-09-01', creditor: 'RNHB', subtype: 'aflossingsvrij', is_tax_deductible: false, nhg: false, linked_asset_name: 'Verhuurd appartement Utrecht', repayment_type: 'aflossingsvrij' },
    { name: 'Persoonlijke lening verbouwing', debt_type: 'personal_loan', original_amount: 12000, current_balance: 5200, interest_rate: 6.2, minimum_payment: 210, monthly_payment: 210, start_date: '2022-09-01', creditor: 'Santander', subtype: 'aflopend', repayment_type: 'annuiteit' },
    { name: 'DUO studielening', debt_type: 'student_loan', original_amount: 22000, current_balance: 3800, interest_rate: 0.46, minimum_payment: 90, monthly_payment: 90, start_date: '2004-09-01', creditor: 'DUO', subtype: 'oud_stelsel', repayment_type: 'annuiteit' },
    { name: 'Autolening (restant)', debt_type: 'car_loan', original_amount: 20000, current_balance: 6500, interest_rate: 4.2, minimum_payment: 280, monthly_payment: 280, start_date: '2023-03-01', creditor: 'Alphabet', repayment_type: 'annuiteit', linked_asset_name: 'Auto (elektrisch)' },
    { name: 'Creditcard saldo', debt_type: 'credit_card', original_amount: 0, current_balance: 420, interest_rate: 14.0, minimum_payment: 40, monthly_payment: 40, start_date: '2025-11-01', creditor: 'ICS Visa', subtype: 'regulier', credit_limit: 5000, repayment_type: 'aflossingsvrij' },
    { name: 'Doorlopend krediet', debt_type: 'revolving_credit', original_amount: 8000, current_balance: 1500, interest_rate: 8.5, minimum_payment: 75, monthly_payment: 75, start_date: '2020-05-01', creditor: 'ICS', subtype: 'doorlopend_krediet', credit_limit: 8000, repayment_type: 'aflossingsvrij' },
    { name: 'Betalingsregeling zonnepanelen', debt_type: 'payment_plan', original_amount: 6000, current_balance: 2400, interest_rate: 0, minimum_payment: 150, monthly_payment: 150, start_date: '2024-08-01', creditor: 'Solar Totaal BV', repayment_type: 'lineair' },
    { name: 'Belastingaanslag IB', debt_type: 'belastingschuld', original_amount: 4200, current_balance: 2800, interest_rate: 4.0, minimum_payment: 200, monthly_payment: 200, start_date: '2025-09-01', creditor: 'Belastingdienst', subtype: 'inkomstenbelasting', repayment_type: 'lineair' },
    { name: 'Lening van ouders', debt_type: 'familielening', original_amount: 25000, current_balance: 12000, interest_rate: 1.5, minimum_payment: 200, monthly_payment: 200, start_date: '2018-06-01', creditor: 'Ouders Compleet', subtype: 'ouders', repayment_type: 'lineair' },
    { name: 'Rekening-courant schuld BV', debt_type: 'dga_schuld', original_amount: 15000, current_balance: 9000, interest_rate: 5.0, minimum_payment: 125, monthly_payment: 125, start_date: '2023-01-01', creditor: 'Volkert Compleet Holding BV', repayment_type: 'lineair' },
    { name: 'Openstaande factuur leverancier', debt_type: 'other', original_amount: 900, current_balance: 400, interest_rate: 0, minimum_payment: 100, monthly_payment: 100, start_date: '2025-10-15', creditor: 'Leverancier Bouwmaat', repayment_type: 'lineair' },
  ],
  budgets: makeBudgets({
    [S.INKOMEN]: 7600, [S.SALARIS_UITKERING]: 6650,
    [S.TOESLAGEN_KINDERBIJSLAG]: 280, [S.TERUGGAVE_BELASTING]: 0, [S.OVERIGE_INKOMSTEN]: 950,
    [S.VASTE_LASTEN_WONEN]: 1795, [S.HUUR_HYPOTHEEK]: 1280, [S.GAS_WATER_LICHT]: 210,
    [S.VERZEKERINGEN_WONEN]: 195, [S.GEMEENTELIJKE_LASTEN]: 110,
    [S.DAGELIJKSE_UITGAVEN]: 1080, [S.BOODSCHAPPEN]: 560, [S.HUISHOUDEN_VERZORGING]: 130,
    [S.KINDEREN_SCHOOL]: 340, [S.MEDISCHE_KOSTEN]: 50,
    [S.VERVOER]: 345, [S.BRANDSTOF_OV]: 95, [S.AUTO_VASTE_LASTEN]: 125,
    [S.AUTO_ONDERHOUD]: 65, [S.FIETS_DEELVERVOER]: 60,
    [S.LEUKE_DINGEN]: 420, [S.UIT_ETEN_HORECA]: 150, [S.VRIJE_TIJD_SPORT]: 90,
    [S.VAKANTIE]: 130, [S.KLEDING_OVERIGE]: 50,
    [S.SPAREN_SCHULDEN]: 1700, [S.SPAREN_NOODBUFFER]: 200, [S.INVESTEREN_FIRE]: 1500,
    [S.SCHULDEN_AFLOSSINGEN_PARENT]: 0, [S.SCHULDEN_AFLOSSINGEN]: 0, [S.EXTRA_AFLOSSING_HYPOTHEEK]: 0,
  }),
  transactions: tessaTransactions,
  goals: [
    { name: 'Volledige vrijheid (FIRE)', description: 'Belegbaar vermogen naar het FIRE-doel — volledige vrijheid vóór 55', goal_type: 'net_worth', target_value: 1650000, current_value: 960000, target_date: monthsAgo(-156), icon: 'Target', color: 'amber', is_completed: false },
    { name: 'Hypotheek appartement aflossen', description: 'Aflossingsvrije beleggingshypotheek terugbrengen naar nul', goal_type: 'debt_payoff', target_value: 110000, current_value: 20000, target_date: monthsAgo(-120), icon: 'Home', color: 'purple', is_completed: false },
  ],
  life_events: [
    { name: 'Kinderen naar middelbare school', event_type: 'children', target_age: 48, target_date: null, one_time_cost: 2000, monthly_cost_change: -250, monthly_income_change: 0, duration_months: 84, icon: 'GraduationCap', is_active: true, sort_order: 0 },
    { name: 'Verbouwing eigen woning', event_type: 'renovation', target_age: 50, target_date: null, one_time_cost: 45000, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0, icon: 'Hammer', is_active: true, sort_order: 1 },
    { name: 'Schenking aan kinderen', event_type: 'schenking', target_age: 60, target_date: null, one_time_cost: 30000, monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0, icon: 'Gift', is_active: true, sort_order: 2 },
    { name: 'Aanvullend pensioen', event_type: 'pension', target_age: 67, target_date: null, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1100, duration_months: 0, icon: 'PiggyBank', is_active: true, sort_order: 3, is_indexed: true },
    { name: 'AOW', event_type: 'aow', target_age: 67, target_date: null, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1050, duration_months: 0, icon: 'Landmark', is_active: true, sort_order: 4, is_indexed: true, metadata: { leefsituatie: 'samenwonend' } },
  ],
  recommendations: [
    {
      title: 'Eigen woning bewust uit de FIRE-pot houden',
      description: 'Je woning telt nu volledig mee in je FIRE-pot, maar je hebt het geld pas liquide na verkoop of opeethypotheek. Overweeg de strategie "uitsluiten" of "verkopen op leeftijd" voor een realistischer beeld.',
      recommendation_type: 'budget_optimization',
      euro_impact_monthly: 0,
      euro_impact_yearly: 0,
      freedom_days_per_year: 0,
      related_budget_slug: null,
      priority_score: 3,
      status: 'pending',
      suggested_actions: [
        { title: 'Vergelijk de vier eigen-woning-strategieën op /toekomst', freedom_days_impact: 0 },
      ],
      actions: [
        { source: 'ai', title: 'Kies een eigen-woning-strategie', description: 'Open de Huis-strategie-modal op /toekomst en vergelijk include_full vs. exclude vs. downsize', freedom_days_impact: 0, euro_impact_monthly: 0, status: 'open', priority_score: 3, scheduled_week: getNextWeek() },
      ],
    },
  ],
  net_worth_snapshots: [
    { monthsAgo: 14, total_assets: 1505000, total_debts: 470000, net_worth: 1035000 },
    { monthsAgo: 13, total_assets: 1512000, total_debts: 467500, net_worth: 1044500 },
    { monthsAgo: 12, total_assets: 1519000, total_debts: 465000, net_worth: 1054000 },
    { monthsAgo: 11, total_assets: 1526500, total_debts: 462500, net_worth: 1064000 },
    { monthsAgo: 10, total_assets: 1534000, total_debts: 460000, net_worth: 1074000 },
    { monthsAgo: 9, total_assets: 1542000, total_debts: 457500, net_worth: 1084500 },
    { monthsAgo: 8, total_assets: 1550000, total_debts: 455000, net_worth: 1095000 },
    { monthsAgo: 7, total_assets: 1559000, total_debts: 452500, net_worth: 1106500 },
    { monthsAgo: 6, total_assets: 1568000, total_debts: 450000, net_worth: 1118000 },
    { monthsAgo: 5, total_assets: 1577500, total_debts: 447500, net_worth: 1130000 },
    { monthsAgo: 4, total_assets: 1587000, total_debts: 445000, net_worth: 1142000 },
    { monthsAgo: 3, total_assets: 1597000, total_debts: 442500, net_worth: 1154500 },
    { monthsAgo: 2, total_assets: 1607500, total_debts: 440000, net_worth: 1167500 },
    { monthsAgo: 1, total_assets: 1618000, total_debts: 437500, net_worth: 1180500 },
    { monthsAgo: 0, total_assets: 1626000, total_debts: 435000, net_worth: 1191000 },
  ],
  holdings: [
    {
      assetName: 'Meesman Wereldwijd Totaal',
      ticker: 'MEESMAN-WWT',
      isin: null,
      name: 'Meesman Wereldwijd Totaal',
      units: 2215,
      // Transactie-afgeleide gewogen gemiddelde kostprijs: Σ inleg / Σ units =
      // 226.140 / 2.215 = 102,0948. MOET gelijk blijven aan
      // computePositionFromTransactions(transactions).avgCost — anders toont de
      // holding-detail een inconsistente kostenbasis (ingelegd + koerswinst ≠
      // marktwaarde). Bewaakt door holdings-aggregation.test.ts. (Was 94,81 —
      // een structureel stale seed-veld, €7,28/eenheid naast de historie.)
      avg_purchase_price: 102.0948,
      current_price: 135.48,
      purchase_date_monthsAgo: 120,
      asset_class: 'equity',
      sector: null,
      geography: 'global',
      is_favorite: true,
      currency: 'EUR',
      ter: 0.0050,
      ter_source: 'manual',
      transactions: [
        { type: 'buy', units: 700, price_per_unit: 84.00, total_amount: 58800, monthsAgo: 120, notes: 'Initiële inleg' },
        { type: 'buy', units: 520, price_per_unit: 96.00, total_amount: 49920, monthsAgo: 84, notes: null },
        { type: 'buy', units: 430, price_per_unit: 108.00, total_amount: 46440, monthsAgo: 48, notes: null },
        { type: 'buy', units: 360, price_per_unit: 122.00, total_amount: 43920, monthsAgo: 24, notes: null },
        { type: 'buy', units: 205, price_per_unit: 132.00, total_amount: 27060, monthsAgo: 6, notes: 'Bijstorting' },
        { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1850, monthsAgo: 6, notes: 'Halfjaarlijks dividend' },
      ],
    },
  ],
  target_allocations: [
    { view_mode: 'asset_class', category: 'equity', target_pct: 80 },
    { view_mode: 'asset_class', category: 'bonds', target_pct: 10 },
    { view_mode: 'asset_class', category: 'cash', target_pct: 10 },
  ],
  balance_snapshots: [
    ...generateBalanceSnapshots([
      { name: 'Gezamenlijke rekening ABN', entity_type: 'asset', currentValue: 8200, monthlyDelta: 80, jitterPct: 0.20 },
      { name: 'Spaarrekening gezin', entity_type: 'asset', currentValue: 21500, monthlyDelta: 200, jitterPct: 0.02 },
      { name: 'Zakelijke buffer', entity_type: 'asset', currentValue: 4300, jitterPct: 0.25 },
    ]),
    ...generateBalanceSnapshots([
      { name: 'Spaargeld direct opneembaar', entity_type: 'asset', currentValue: 30000, monthlyDelta: 50 },
      { name: 'Spaardeposito 3-jaar', entity_type: 'asset', currentValue: 45000, monthlyDelta: 200 },
      { name: 'Meesman Wereldwijd Totaal', entity_type: 'asset', currentValue: 300000, monthlyDelta: 2200, jitterPct: 0.015 },
      { name: 'Pensioenfonds ABP', entity_type: 'asset', currentValue: 120000, monthlyDelta: 550 },
      { name: 'Crypto portefeuille', entity_type: 'asset', currentValue: 20000, jitterPct: 0.18 },
      { name: 'Eigen woning Amersfoort', entity_type: 'asset', currentValue: 560000, monthlyDelta: 800 },
      { name: 'Verhuurd appartement Utrecht', entity_type: 'asset', currentValue: 185000, monthlyDelta: 250 },
      { name: 'Auto (elektrisch)', entity_type: 'asset', currentValue: 28000, monthlyDelta: -280 },
      { name: 'Kunst + sieraden', entity_type: 'asset', currentValue: 14000 },
      { name: 'Belang Volkert Compleet Holding BV', entity_type: 'asset', currentValue: 180000, monthlyDelta: 600 },
      { name: 'Kapitaalverzekering (oud)', entity_type: 'asset', currentValue: 28000, monthlyDelta: 35 },
      { name: 'Rekening-courant vordering BV', entity_type: 'asset', currentValue: 35000 },
      { name: 'Aanhangwagen + gereedschap', entity_type: 'asset', currentValue: 6000, monthlyDelta: -30 },
    ]),
    ...generateBalanceSnapshots([
      { name: 'Hypotheek eigen woning', entity_type: 'debt', currentValue: 300000, monthlyDelta: -450 },
      { name: 'Beleggingshypotheek appartement', entity_type: 'debt', currentValue: 110000 },
      { name: 'Persoonlijke lening verbouwing', entity_type: 'debt', currentValue: 5200, monthlyDelta: -205 },
      { name: 'DUO studielening', entity_type: 'debt', currentValue: 3800, monthlyDelta: -90 },
      { name: 'Autolening (restant)', entity_type: 'debt', currentValue: 6500, monthlyDelta: -270 },
      { name: 'Creditcard saldo', entity_type: 'debt', currentValue: 420, jitterPct: 0.30 },
      { name: 'Doorlopend krediet', entity_type: 'debt', currentValue: 1500, monthlyDelta: -75 },
      { name: 'Betalingsregeling zonnepanelen', entity_type: 'debt', currentValue: 2400, monthlyDelta: -150 },
      { name: 'Belastingaanslag IB', entity_type: 'debt', currentValue: 2800, monthlyDelta: -200 },
      { name: 'Lening van ouders', entity_type: 'debt', currentValue: 12000, monthlyDelta: -200 },
      { name: 'Rekening-courant schuld BV', entity_type: 'debt', currentValue: 9000, monthlyDelta: -125 },
      { name: 'Openstaande factuur leverancier', entity_type: 'debt', currentValue: 400, monthlyDelta: -100 },
    ]),
  ],
}

// Export
// ══════════════════════════════════════════════════════════════

export const PERSONAS: Record<PersonaKey, PersonaData> = {
  daan: daanData,
  lisa: lisaData,
  willem: willemData,
  marijke: marijkeData,
  compleet: tessaData,
}

export const PERSONA_KEYS: PersonaKey[] = ['daan', 'lisa', 'willem', 'marijke', 'compleet']

// ══════════════════════════════════════════════════════════════
// Landing/test-account seed-set (superadmin /beheer/testdata)
// ══════════════════════════════════════════════════════════════
//
// Dé canonieke bron van de beheerbare test-accounts: welke persona's als
// echte auth.users worden aangemaakt én door de beheerlijst (list/reset/
// wachtwoord) worden herkend. ALLE admin-routes onder
// app/api/admin/test-users/** consumeren deze lijst — zo kunnen 'aanmaken'
// en 'beheren' nooit meer uit elkaar lopen (was de bug: create gebruikte
// daan/lisa/willem/marijke, list/reset filterde nog op de verwijderde set
// ronald/bas/leo/jochen).
//
// Bewust ZONDER 'compleet' (Tessa): dat is de horizon-strategie-regressie-
// fixture, geen beheerbaar landing-testaccount. Naam + persona worden uit
// PERSONAS afgeleid zodat er geen tweede bron van waarheid ontstaat.

/** Persona's die als beheerbaar test-account bestaan (zonder de regressie-fixture 'compleet'). */
export const TEST_USER_PERSONA_KEYS = ['daan', 'lisa', 'willem', 'marijke'] as const satisfies readonly PersonaKey[]

export interface TestUserAccount {
  persona: PersonaKey
  email: string
  name: string
}

/** Canonieke lijst van beheerbare test-accounts, afgeleid van PERSONAS. */
export const TEST_USER_ACCOUNTS: TestUserAccount[] = TEST_USER_PERSONA_KEYS.map((persona) => ({
  persona,
  email: `${persona}@test.trifinity.nl`,
  name: PERSONAS[persona].meta.name,
}))

/** Afgeleide e-mailadressen — de enige set waarop de beheerlijst filtert. */
export const TEST_EMAILS: string[] = TEST_USER_ACCOUNTS.map((u) => u.email)
