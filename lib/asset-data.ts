/**
 * Asset types, default seed data, and projection calculations.
 */

// ── Types ────────────────────────────────────────────────────

export type AssetType =
  | 'cash'
  | 'savings'
  | 'investment'
  | 'retirement'
  | 'eigen_huis'
  | 'real_estate'
  | 'crypto'
  | 'vehicle'
  | 'physical'
  | 'deelneming'
  | 'levensverzekering'
  | 'vordering'
  | 'other'

export type RiskProfile = 'laag' | 'middel' | 'hoog'
export type RetirementProviderType = 'bedrijfspensioenfonds' | 'verzekeraar' | 'ppi'

export type CashSubtype = 'checking' | 'savings_account' | 'joint' | 'business' | 'contant_geld' | 'other_cash'
export type SavingsSubtype = 'vrij_opneembaar' | 'deposito' | 'termijndeposito'
export type InvestmentSubtype = 'etf' | 'indexfonds' | 'aandelen' | 'obligaties' | 'mixed'
export type RetirementSubtype = 'uitkeringsregeling' | 'premieregeling' | 'lijfrente'
export type RealEstateSubtype = 'beleggingspand' | 'grond' | 'recreatiewoning'
export type CryptoSubtype = 'bitcoin' | 'ethereum' | 'altcoins' | 'stablecoins' | 'defi'
export type VehicleSubtype = 'auto_eigendom' | 'auto_financial_lease' | 'motor' | 'camper'
export type PhysicalSubtype = 'kunst' | 'sieraden' | 'inboedel' | 'verzameling'
export type DeelnemingSubtype = 'holding_bv' | 'familie_bv' | 'startup' | 'overig_belang'
export type LevensverzekeringSubtype = 'kapitaalverzekering' | 'uitvaartverzekering' | 'gemengde_polis' | 'overig_verzekering'
export type VorderingSubtype = 'lening_derden' | 'dga_lening' | 'familielening' | 'overig_vordering'

export type AssetSubtype =
  | CashSubtype
  | SavingsSubtype
  | InvestmentSubtype
  | RetirementSubtype
  | RealEstateSubtype
  | CryptoSubtype
  | VehicleSubtype
  | PhysicalSubtype
  | DeelnemingSubtype
  | LevensverzekeringSubtype
  | VorderingSubtype

export interface Asset {
  id: string
  user_id: string
  name: string
  asset_type: AssetType
  current_value: number
  purchase_value: number
  purchase_date: string | null
  expected_return: number // annual %
  monthly_contribution: number
  institution: string | null
  account_number: string | null
  notes: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Type-specific fields
  subtype: string | null
  risk_profile: RiskProfile | null
  tax_benefit: boolean | null
  is_liquid: boolean | null
  lock_end_date: string | null
  ticker_symbol: string | null
  rental_income: number | null
  woz_value: number | null
  retirement_provider_type: RetirementProviderType | null
  depreciation_rate: number | null
  address_postcode: string | null
  address_house_number: string | null
  expiry_date: string | null
  beneficiary: string | null
  // Deelneming fields
  kvk_number: string | null
  ownership_percentage: number | null
  annual_dividend: number | null
  // Vordering fields
  linked_asset_id: string | null
  // Household fields
  ownership: 'personal' | 'shared'
  household_id: string | null
  // Net worth inclusion
  net_worth_inclusion_pct: number // 0–100, default 100
  // ── Verkoop-/liquidatie-configuratie (zie lib/sale-config.ts) ──
  // Per niet-liquide bezitting (vehicle/physical/other/deelneming/real_estate):
  // het of/wanneer van verkoop in de horizon v2-grootboek-engine. JSONB; NULL →
  // resolve-time default `wanneer_nodig` (parseSaleConfig). De ENIGE bron voor
  // niet-liquide verkoop (SSoT) — prevaleert boven life-event `linked_asset_id`.
  // eigen_huis valt hier nooit onder (eigen downsize-pad, housing_strategy_config).
  sale_config?: unknown
  // Budget tracking (cash assets)
  has_budget_tracking: boolean
  // Holdings tracking (investment assets managed by portfolio tracker)
  has_holdings_tracking?: boolean
  // ── App-koppelingen (zie components/core/category-deepening-registry.ts) ──
  // Hypotheekplanner + Woonbalans op `eigen_huis`-asset; default false zodat
  // bestaande gebruikers geen app-tracking krijgen zonder dat ze die hebben
  // geactiveerd.
  has_woonbalans_tracking: boolean
  // Verhuurrendement-app op `real_estate`-asset; default false.
  has_rental_tracking: boolean
  // ── Verhuur-overrides (alleen relevant bij has_rental_tracking) ──
  // Override op de 1%-schatting voor onderhoudskosten per maand. 0 (default)
  // betekent: gebruik de schatting (1% × marktwaarde / 12).
  monthly_maintenance_cost: number
  // VVE-bijdrage / verzekering per maand voor verhuur-vastgoed.
  vva_fee: number
  // Bezet/leegstand-log per maand. Max 24 entries (rolling window). Lege
  // array betekent dat de gebruiker nog niets heeft gelogd — Verhuurrendement
  // toont dan een aanmoediging om te beginnen met loggen.
  vacancy_log: Array<{ month: string; occupied: boolean }>
  // ── Provenance (zie supabase/migrations/<...>_add_aangifte_source.sql) ──
  // Herkomst van deze rij. Optioneel in TS — de DB heeft NOT NULL DEFAULT
  // 'manual' dus elke rij die uit Supabase komt heeft een waarde, maar
  // bestaande factories en tests die `Asset`-literals construeren hoeven
  // dit veld niet te kennen. Pas wanneer code provenance-bewust is (bv.
  // bulk-delete van aangifte-imports, "Verifieer"-pill op stale data),
  // wordt het expliciet uitgelezen.
  source?: AssetSource
  // Peildatum van de bron (bv. 1 januari van het belastingjaar voor
  // aangifte_import). NULL voor manueel ingevoerde rijen.
  imported_peildatum?: string | null
}

/**
 * Provenance tag voor een asset/debt-rij. Houdt synchroon met de CHECK
 * constraint `assets_source_check` in
 * `supabase/migrations/<...>_add_aangifte_source.sql`.
 */
export type AssetSource = 'manual' | 'aangifte_import' | 'broker_csv' | 'bank_psd2'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  cash: 'Cash / Bankrekeningen',
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  eigen_huis: 'Eigen woning',
  real_estate: 'Vastgoed (belegging)',
  crypto: 'Crypto',
  vehicle: 'Voertuig',
  physical: 'Fysieke bezittingen',
  deelneming: 'Deelneming / Aanmerkelijk belang',
  levensverzekering: 'Levensverzekering',
  vordering: 'Vordering / Lening u/g',
  other: 'Overig',
}

// ── Asset Groups ─────────────────────────────────────────────
//
// Eigen woning gedraagt zich anders dan portfolio-assets (illiquide,
// niet-compounding, sterk gekoppeld aan hypotheek). Daarom verdient
// het een eigen sectie op `/core` naast Bezittingen en Schulden.
//
// `real_estate` (beleggingsvastgoed) blijft bij Bezittingen — het is een
// belegging, niet "wonen". Toekomstige uitbreiding mogelijk.

export type AssetGroup = 'bezittingen' | 'wonen'

export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
  bezittingen: 'Bezittingen',
  wonen: 'Wonen',
}

export const ASSET_GROUP_FOR_TYPE: Record<AssetType, AssetGroup> = {
  cash: 'bezittingen',
  savings: 'bezittingen',
  investment: 'bezittingen',
  retirement: 'bezittingen',
  eigen_huis: 'wonen',
  real_estate: 'bezittingen',
  crypto: 'bezittingen',
  vehicle: 'bezittingen',
  physical: 'bezittingen',
  deelneming: 'bezittingen',
  levensverzekering: 'bezittingen',
  vordering: 'bezittingen',
  other: 'bezittingen',
}

export function getAssetGroup(type: AssetType): AssetGroup {
  return ASSET_GROUP_FOR_TYPE[type] ?? 'bezittingen'
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  cash: 'Wallet',
  savings: 'Landmark',
  investment: 'LineChart',
  retirement: 'Hourglass',
  eigen_huis: 'Home',
  real_estate: 'Warehouse',
  crypto: 'Coins',
  vehicle: 'Car',
  physical: 'Gem',
  deelneming: 'Briefcase',
  levensverzekering: 'Shield',
  vordering: 'FileText',
  other: 'CircleDot',
}

/**
 * Kleur-palet voor asset-typen — monochroom kern-bruin met intensiteit-laddertje.
 *
 * Differentiatie loopt langs de **liquiditeits-as**: hoe donkerder, hoe meer
 * direct beschikbaar het vermogen is. Cash en savings staan op kern-700,
 * beleggingen en pensioen op kern-500, vastgoed/levensverzekering op kern-400,
 * en kortdurende of overige bezittingen lopen af naar kern-200/300.
 *
 * Eén module-tint familie houdt de Kern-pagina visueel rustig en in lijn met
 * de krant-esthetiek (zie `CLAUDE.md` Design Language). Differentiatie tussen
 * categorieën gebeurt verder via icon, label en bedrag — niet via een
 * regenboog van willekeurige Tailwind hex-waardes.
 */
export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  // Klasse I — direct liquide
  cash: 'oklch(0.345 0.0571 34.7)', // kern-700
  savings: 'oklch(0.345 0.0571 34.7)', // kern-700
  // Klasse II — belegd / groei
  investment: 'oklch(0.427 0.0584 34.7)', // kern-500
  crypto: 'oklch(0.427 0.0584 34.7)', // kern-500
  retirement: 'oklch(0.427 0.0584 34.7)', // kern-500
  // Klasse III — vast / illiquide
  eigen_huis: 'oklch(0.538 0.0467 34.7)', // kern-400
  real_estate: 'oklch(0.538 0.0467 34.7)', // kern-400
  levensverzekering: 'oklch(0.538 0.0467 34.7)', // kern-400
  deelneming: 'oklch(0.538 0.0467 34.7)', // kern-400
  // Klasse IV — kortdurend / persoonlijk
  vehicle: 'oklch(0.666 0.0311 34.7)', // kern-300
  physical: 'oklch(0.666 0.0311 34.7)', // kern-300
  vordering: 'oklch(0.666 0.0311 34.7)', // kern-300
  other: 'oklch(0.771 0.0175 34.7)', // kern-200
}

/** Typical annual return expectations per asset type (for default suggestions) */
export const TYPICAL_RETURNS: Record<AssetType, number> = {
  cash: 0,
  savings: 2.5,
  investment: 7,
  retirement: 6,
  eigen_huis: 3.5,
  real_estate: 3.5,
  crypto: 0, // too volatile to estimate
  vehicle: 0, // uses depreciation_rate for linear depreciation
  physical: 0,
  deelneming: 0, // waarde is intrinsiek — handmatige waardering
  levensverzekering: 1.5, // conservatief rendement op opbouwwaarde
  vordering: 3, // rente op uitstaande leningen (typisch 2-4%)
  other: 0,
}

// ── Subtypes ─────────────────────────────────────────────────

/** Which asset types have subtypes */
export const ASSET_SUBTYPE_LABELS: Partial<Record<AssetType, Record<string, string>>> = {
  cash: {
    checking: 'Betaalrekening',
    savings_account: 'Spaarrekening',
    joint: 'En/of-rekening',
    business: 'Zakelijke rekening',
    contant_geld: 'Contant geld',
    other_cash: 'Overig',
  },
  savings: {
    vrij_opneembaar: 'Vrij opneembaar',
    deposito: 'Deposito',
    termijndeposito: 'Termijndeposito',
  },
  investment: {
    etf: 'ETF',
    indexfonds: 'Indexfonds',
    aandelen: 'Aandelen',
    obligaties: 'Obligaties',
    mixed: 'Mixed',
  },
  retirement: {
    uitkeringsregeling: 'Uitkeringsregeling (DB)',
    premieregeling: 'Premieregeling (DC)',
    lijfrente: 'Lijfrente',
  },
  real_estate: {
    beleggingspand: 'Beleggingspand',
    grond: 'Grond',
    recreatiewoning: 'Recreatiewoning',
  },
  crypto: {
    bitcoin: 'Bitcoin',
    ethereum: 'Ethereum',
    altcoins: 'Altcoins',
    stablecoins: 'Stablecoins',
    defi: 'DeFi',
  },
  vehicle: {
    auto_eigendom: 'Auto (eigendom)',
    auto_financial_lease: 'Auto (financial lease)',
    motor: 'Motor',
    camper: 'Camper',
  },
  physical: {
    kunst: 'Kunst',
    sieraden: 'Sieraden',
    inboedel: 'Inboedel',
    verzameling: 'Verzameling',
  },
  deelneming: {
    holding_bv: 'Eigen holding BV',
    familie_bv: 'Familie-BV',
    startup: 'Startup deelneming',
    overig_belang: 'Overig aanmerkelijk belang',
  },
  levensverzekering: {
    kapitaalverzekering: 'Kapitaalverzekering',
    uitvaartverzekering: 'Uitvaartverzekering met opbouwwaarde',
    gemengde_polis: 'Gemengde polis',
    overig_verzekering: 'Overige levensverzekering',
  },
  vordering: {
    lening_derden: 'Lening aan derden',
    dga_lening: 'DGA-lening aan eigen BV',
    familielening: 'Familielening',
    overig_vordering: 'Overige vordering',
  },
}

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  laag: 'Laag',
  middel: 'Middel',
  hoog: 'Hoog',
}

export const RETIREMENT_PROVIDER_LABELS: Record<RetirementProviderType, string> = {
  bedrijfspensioenfonds: 'Bedrijfspensioenfonds',
  verzekeraar: 'Verzekeraar',
  ppi: 'PPI',
}

/** Default values applied when a subtype is selected */
export const ASSET_SUBTYPE_DEFAULTS: Record<string, Partial<{
  expected_return: number
  risk_profile: RiskProfile
  is_liquid: boolean
  tax_benefit: boolean
}>> = {
  // Cash
  checking: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  savings_account: { risk_profile: 'laag', is_liquid: true, expected_return: 2.5 },
  joint: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  business: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  contant_geld: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  other_cash: { risk_profile: 'laag', is_liquid: true, expected_return: 0 },
  // Savings
  vrij_opneembaar: { risk_profile: 'laag', is_liquid: true, expected_return: 2.5 },
  deposito: { risk_profile: 'laag', is_liquid: false, expected_return: 3.5 },
  termijndeposito: { risk_profile: 'laag', is_liquid: false, expected_return: 3.0 },
  // Investment
  etf: { risk_profile: 'middel', expected_return: 7 },
  indexfonds: { risk_profile: 'middel', expected_return: 7 },
  aandelen: { risk_profile: 'hoog', expected_return: 8 },
  obligaties: { risk_profile: 'laag', expected_return: 3.5 },
  mixed: { risk_profile: 'middel', expected_return: 5.5 },
  // Retirement
  uitkeringsregeling: { risk_profile: 'laag', tax_benefit: true, expected_return: 5 },
  premieregeling: { risk_profile: 'middel', tax_benefit: true, expected_return: 6 },
  lijfrente: { risk_profile: 'laag', tax_benefit: true, expected_return: 4 },
  // Crypto
  bitcoin: { risk_profile: 'hoog', expected_return: 0 },
  ethereum: { risk_profile: 'hoog', expected_return: 0 },
  altcoins: { risk_profile: 'hoog', expected_return: 0 },
  stablecoins: { risk_profile: 'laag', expected_return: 3 },
  defi: { risk_profile: 'hoog', expected_return: 0 },
  // Deelneming
  holding_bv: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  familie_bv: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  startup: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  overig_belang: { risk_profile: 'hoog', is_liquid: false, expected_return: 0 },
  // Levensverzekering
  kapitaalverzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1.5 },
  uitvaartverzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1 },
  gemengde_polis: { risk_profile: 'middel', is_liquid: false, expected_return: 1.5 },
  overig_verzekering: { risk_profile: 'laag', is_liquid: false, expected_return: 1.5 },
  // Vordering
  lening_derden: { risk_profile: 'middel', is_liquid: false, expected_return: 4 },
  dga_lening: { risk_profile: 'middel', is_liquid: false, expected_return: 2.5 },
  familielening: { risk_profile: 'middel', is_liquid: false, expected_return: 2 },
  overig_vordering: { risk_profile: 'middel', is_liquid: false, expected_return: 3 },
}

/**
 * Which type-specific fields to show per asset_type.
 *
 * `sale_config` (verkoop-instelling) staat bij de niet-liquide types die de
 * v2-grootboek-engine kan liquideren — vehicle/physical/other/deelneming/
 * real_estate. eigen_huis NIET (eigen downsize-pad via housing_strategy_config);
 * liquide types NIET (worden direct als pot besteed). De UI-agent rendert het blok;
 * de engine leest het via build-input (`buildGenericAssetLiquidations`).
 */
export const ASSET_TYPE_FIELDS: Record<AssetType, string[]> = {
  cash: ['subtype', 'is_liquid'],
  savings: ['subtype', 'is_liquid', 'lock_end_date'],
  investment: ['subtype', 'risk_profile', 'ticker_symbol'],
  retirement: ['subtype', 'risk_profile', 'tax_benefit', 'retirement_provider_type'],
  eigen_huis: ['woz_value', 'rental_income', 'address_postcode', 'address_house_number'],
  real_estate: ['subtype', 'rental_income', 'woz_value', 'sale_config'],
  crypto: ['subtype', 'risk_profile', 'ticker_symbol'],
  vehicle: ['subtype', 'depreciation_rate', 'sale_config'],
  physical: ['subtype', 'depreciation_rate', 'sale_config'],
  deelneming: ['subtype', 'institution', 'kvk_number', 'ownership_percentage', 'annual_dividend', 'risk_profile', 'sale_config'],
  levensverzekering: ['subtype', 'risk_profile', 'is_liquid', 'expiry_date', 'beneficiary'],
  vordering: ['subtype', 'institution', 'lock_end_date'],
  other: ['sale_config'],
}

// ── Projection calculations ──────────────────────────────────

export interface ProjectionMonth {
  month: number
  date: string
  value: number
  contribution: number
  growth: number
}

/**
 * Resolve depreciation info for an asset. Returns a depreciation descriptor
 * when linear depreciation should be used, or null for standard compound growth.
 *
 * Handles migration: vehicles with negative expected_return and no depreciation_rate
 * are treated as if depreciation_rate = |expected_return|.
 */
export function resolveDepreciation(a: Asset): { rate: number; baseValue: number } | null {
  const depRate = Number(a.depreciation_rate)
  const hasNegReturn = Number(a.expected_return) < 0 && a.asset_type === 'vehicle'
  const effectiveDepRate = depRate > 0 ? depRate : (hasNegReturn ? Math.abs(Number(a.expected_return)) : 0)
  return effectiveDepRate > 0
    ? { rate: effectiveDepRate, baseValue: Number(a.purchase_value) || Number(a.current_value) }
    : null
}

/**
 * Verwachte jaarlijkse koerswinst (€) over de meegenomen assets — gebruikt door de
 * eerlijker net-worth-delta-spaarquote (koerswinst is geen sparen, dus eraf).
 * BELANGRIJK: `expected_return` is een jaarlijks PERCENTAGE (bv. 7 = 7%), dus /100.
 * Depreciërende assets tellen als 0; gewogen met net_worth_inclusion_pct zodat het
 * aansluit op de (gewogen) netto-vermogen-delta. Eén gedeelde bron voor beide loaders
 * zodat de eenheid niet kan driften.
 */
export function computeExpectedAnnualAppreciation(assets: Asset[]): number {
  let total = 0
  for (const a of assets) {
    if (resolveDepreciation(a)) continue
    const ret = Number(a.expected_return ?? 0) / 100
    if (!(ret > 0)) continue
    const incl = Number((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100
    total += Number(a.current_value ?? 0) * ret * incl
  }
  return total
}

/**
 * Project an asset's value into the future, accounting for:
 * - Monthly compounding of expected return (for appreciating assets)
 * - Linear depreciation based on purchase value (when depreciation param provided)
 * - Monthly contributions
 * Returns month-by-month for `months` months.
 *
 * When `depreciation` is provided with rate > 0, linear depreciation is used:
 * monthly decline = baseValue × (rate / 100) / 12, clamped to 0.
 */
export function projectAsset(
  currentValue: number,
  annualReturn: number,
  monthlyContribution: number,
  months: number,
  startDate: Date = new Date(),
  depreciation?: { rate: number; baseValue: number } | null,
): ProjectionMonth[] {
  const rows: ProjectionMonth[] = []
  let value = currentValue

  const useLinearDepreciation = depreciation && depreciation.rate > 0
  const monthlyDepreciation = useLinearDepreciation
    ? depreciation.baseValue * (depreciation.rate / 100) / 12
    : 0
  const monthlyRate = annualReturn / 100 / 12

  for (let m = 1; m <= months; m++) {
    let growth: number
    if (useLinearDepreciation) {
      growth = value > 0 ? -Math.min(monthlyDepreciation, value) : 0
    } else {
      growth = value * monthlyRate
    }
    value = Math.max(0, value + growth) + monthlyContribution

    const date = new Date(startDate)
    date.setMonth(date.getMonth() + m)

    rows.push({
      month: m,
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
      contribution: monthlyContribution,
      growth: Math.round(growth * 100) / 100,
    })
  }

  return rows
}

/**
 * Project total portfolio value over time.
 */
export function projectPortfolio(
  assets: Asset[],
  months: number,
): { month: number; date: string; total: number; byType: Record<AssetType, number> }[] {
  const activeAssets = assets.filter((a) => a.is_active)
  if (activeAssets.length === 0) return []

  const projections = activeAssets.map((a) => {
    const depreciation = resolveDepreciation(a)
    return {
      asset: a,
      rows: projectAsset(
        // `|| 0` guards against asset-like rows that omit numeric fields — e.g.
        // the column-sparse aggregated partner row from `household_partner_items`
        // (privacy='totals'), which carries only current_value. Without this an
        // undefined expected_return/monthly_contribution becomes NaN and poisons
        // every projected total.
        Number(a.current_value) || 0,
        depreciation ? 0 : Number(a.expected_return) || 0,
        Number(a.monthly_contribution) || 0,
        months,
        undefined,
        depreciation,
      ),
    }
  })

  const now = new Date()
  const result: { month: number; date: string; total: number; byType: Record<AssetType, number> }[] = []

  for (let m = 0; m < months; m++) {
    const byType: Record<AssetType, number> = {
      cash: 0, savings: 0, investment: 0, retirement: 0, eigen_huis: 0, real_estate: 0,
      crypto: 0, vehicle: 0, physical: 0, deelneming: 0, levensverzekering: 0, vordering: 0, other: 0,
    }
    let total = 0
    for (const p of projections) {
      const val = p.rows[m]?.value ?? Number(p.asset.current_value)
      byType[p.asset.asset_type] += val
      total += val
    }

    const date = new Date(now)
    date.setMonth(date.getMonth() + m + 1)

    result.push({
      month: m + 1,
      date: date.toISOString().split('T')[0],
      total: Math.round(total),
      byType,
    })
  }

  return result
}

// ── Quick-add wizard extensions ──────────────────────────────
//
// Alles onder deze scheidingslijn wordt uitsluitend gebruikt door de
// `QuickAddWizard` (`components/app/quick-add-wizard/*`). Bestaande
// ASSET_* constanten hierboven blijven ongewijzigd.

import type { DebtType } from './debt-data'

/** Kortere NL-labels voor de quick-add wizard (minder formeel dan ASSET_TYPE_LABELS). */
export const ASSET_QUICK_ADD_LABELS: Record<AssetType, string> = {
  savings: 'Spaargeld',
  cash: 'Bankrekening',
  eigen_huis: 'Eigen woning',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  vehicle: 'Auto of motor',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  deelneming: 'Eigen BV',
  physical: 'Kunst of sieraden',
  levensverzekering: 'Levensverzekering',
  vordering: 'Lening aan iemand',
  other: 'Overig',
}

/**
 * Default naam per type — prefill in stap 3. Types zonder default
 * beginnen met een leeg naamveld (gebruiker krijgt placeholder + suggesties).
 */
export const ASSET_DEFAULT_NAMES: Partial<Record<AssetType, string>> = {
  savings: 'Spaarrekening',
  cash: 'Betaalrekening',
  eigen_huis: 'Mijn woning',
  investment: 'Beleggingsrekening',
  retirement: 'Pensioen',
  crypto: 'Crypto-portfolio',
}

/**
 * Welk debt-type wordt in stap 4 voorgesteld bij welk asset-type?
 * Types die hier niet in staan skippen stap 4 en gaan direct naar success.
 */
export const LINKED_DEBT_SUGGESTIONS: Partial<Record<AssetType, DebtType>> = {
  eigen_huis: 'mortgage',
  real_estate: 'mortgage',
  vehicle: 'car_loan',
  deelneming: 'dga_schuld',
}

/**
 * Volgorde waarin asset-types in de quick-add type-grid worden getoond.
 * Meest voorkomende eerst zodat gebruikers in <30 sec kunnen kiezen.
 */
export const QUICK_ADD_ASSET_ORDER: readonly AssetType[] = [
  'savings',
  'cash',
  'eigen_huis',
  'investment',
  'retirement',
  'vehicle',
  'real_estate',
  'crypto',
  'deelneming',
  'physical',
  'levensverzekering',
  'vordering',
  'other',
] as const

/** Configuratie voor het (optionele) derde veld in stap 3. `null` = geen derde veld tonen. */
export type AssetField3Kind =
  | null
  | { kind: 'text'; label: string; placeholder?: string; required?: boolean }
  | { kind: 'currency'; label: string; placeholder?: string; required?: boolean }
  | { kind: 'percentage'; label: string; defaultValue?: number; required?: boolean }
  | { kind: 'date'; label: string }

export const ASSET_QUICK_ADD_FIELD3: Record<AssetType, AssetField3Kind> = {
  savings: { kind: 'text', label: 'Bank / instelling' },
  cash: { kind: 'text', label: 'Bank' },
  eigen_huis: { kind: 'currency', label: 'WOZ-waarde' },
  investment: { kind: 'currency', label: 'Maandelijkse inleg' },
  retirement: { kind: 'text', label: 'Uitvoerder' },
  vehicle: { kind: 'currency', label: 'Aankoopprijs' },
  real_estate: { kind: 'currency', label: 'Huurinkomsten per maand' },
  crypto: null,
  deelneming: { kind: 'percentage', label: 'Belang (%)', defaultValue: 100 },
  physical: null,
  levensverzekering: { kind: 'date', label: 'Einddatum' },
  vordering: { kind: 'percentage', label: 'Rente (%)' },
  other: null,
}

