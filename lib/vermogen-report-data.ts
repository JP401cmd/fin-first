/**
 * Vermogensoverzicht (Kern-rapport) — data-types.
 *
 * Server-data shape voor `GET /api/report/vermogen?date=YYYY-MM-DD` zoals
 * geconsumeerd door `app/(app)/rapportages/vermogen/page.tsx`. Patroon
 * conform `lib/budget-report-data.ts` — types-only module, geen runtime-
 * dependencies.
 *
 * Verschil met `lib/balans-...` (de bestaande Balansstaat):
 * - Balans = boekhoudkundige scontrovorm (vaste activa / vlottende activa /
 *   liquide middelen versus lang / kort vreemd vermogen). Focus op getallen.
 * - Vermogensoverzicht = inventaris-rapport. Gegroepeerd op `asset_type` /
 *   `debt_type` (Spaargeld, Beleggingen, …) i.p.v. liquiditeitsklasse, met
 *   alle type-specifieke kenmerken per item.
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import type { AssetGroup, AssetType, AssetSubtype, RiskProfile, RetirementProviderType } from './asset-data'
import type { DebtType, RepaymentType } from './debt-data'

// ── Asset-sectie ─────────────────────────────────────────────────────

/**
 * Eén regel in een asset-categorie. Bevat alle algemene velden (naam,
 * waarde, rendement, eigendom) plus een `details` blok met alle type-
 * specifieke kenmerken zoals omschreven in spec sectie 2.2 iv.
 *
 * Type-specifieke velden zijn `null`/`undefined` als ze niet op de rij
 * staan (de Supabase-query selecteert ze allemaal, maar bv. WOZ-waarde is
 * alleen ingevuld op `eigen_huis` / `real_estate`).
 */
export interface VermogenAssetItem {
  id: string
  name: string
  /** Subtype-label in NL (uit `ASSET_SUBTYPE_LABELS`), of `null` als geen subtype. */
  subtypeLabel: string | null
  /** Raw subtype key — handig voor specifieke renderkeuzes (bv. holding-BV badge). */
  subtype: AssetSubtype | string | null
  /** Marktwaarde op peildatum, ongewogen (`current_value`). */
  currentValue: number
  /** Inclusie-pct (0–100). UI toont alleen als <100. */
  inclusionPct: number
  /** `current_value × inclusionPct/100` — netto-vermogen bijdrage. */
  weightedValue: number
  /** Jaarrendement als percent (0.07 in DB → 7 hier). `null` als niet ingevuld. */
  expectedReturnPct: number | null
  /** Maandelijkse inleg (`monthly_contribution`). */
  monthlyContribution: number
  /** `'personal'` of `'shared'`. */
  ownership: 'personal' | 'shared'

  // ── Type-specifieke details ──
  /** WOZ-waarde — alleen voor `eigen_huis` / `real_estate`. */
  wozValue: number | null
  /** Adres — alleen voor `eigen_huis`. Stringgebouwd uit postcode + huisnummer. */
  addressLine: string | null
  /** Jaarlijks verhuurinkomen — alleen relevant bij `real_estate` / `eigen_huis` met verhuur. */
  rentalIncomeYearly: number | null
  /** Risicoprofiel — `investment` / `crypto` / `retirement` / `levensverzekering` / `deelneming`. */
  riskProfile: RiskProfile | null
  /** Ticker-symbool — `investment` / `crypto`. */
  tickerSymbol: string | null
  /** Pensioenaanbieder-type — alleen `retirement`. */
  retirementProvider: RetirementProviderType | null
  /** Bewaarder / instelling (`institution`) — vooral relevant voor crypto / deelneming. */
  institution: string | null
  /** KvK-nummer — alleen `deelneming`. */
  kvkNumber: string | null
  /** Belang in % (0–100) — alleen `deelneming`. */
  ownershipPercentage: number | null
  /** Jaarlijks dividend — alleen `deelneming`. */
  annualDividend: number | null
  /** Afschrijvingstempo (% per jaar) — alleen `vehicle` / `physical`. */
  depreciationRate: number | null
  /** Vervaldatum — alleen `levensverzekering`. ISO YYYY-MM-DD. */
  expiryDate: string | null
  /** Begunstigde — alleen `levensverzekering`. */
  beneficiary: string | null
  /** Naam van gekoppelde asset — alleen `vordering` (lening u/g aan andere asset). */
  linkedAssetName: string | null
  /** Bezit dit item budgetteren-tracking aan? Voor app-deepening telling. */
  hasBudgetTracking: boolean
  /** Bezit dit item holdings-tracking aan? Voor app-deepening telling. */
  hasHoldingsTracking: boolean
  /** Bezit dit item woonbalans-tracking aan? (eigen_huis). */
  hasWoonbalansTracking: boolean
  /** Bezit dit item rental-tracking aan? (real_estate). */
  hasRentalTracking: boolean
}

/**
 * Een groep van asset-rijen onder hetzelfde `asset_type`. Volgorde van de
 * groepen wordt door `ASSET_TYPE_LABELS` bepaald (Spaargeld, Beleggingen, …).
 * Lege categorieën worden door de loader weggefilterd.
 */
export interface VermogenAssetCategory {
  /** Raw `asset_type` (= key in `ASSET_TYPE_LABELS`). */
  type: AssetType
  /** NL-label uit `ASSET_TYPE_LABELS`. */
  label: string
  /**
   * Asset-groep waaronder deze categorie valt — `'wonen'` voor eigen_huis,
   * `'bezittingen'` voor alle andere types. Optioneel zodat bestaande report-
   * generatoren incrementeel kunnen migreren. Wanneer aanwezig kan het
   * rapport categorieën onder Wonen-/Bezittingen-koppen groeperen.
   */
  group?: AssetGroup
  items: VermogenAssetItem[]
  /** Subtotaal gewogen waarde (som van `weightedValue`). */
  subtotal: number
}

// ── Debt-sectie ──────────────────────────────────────────────────────

/**
 * Eén regel in een schuld-categorie. Spiegelt `VermogenAssetItem` maar
 * met debt-specifieke kenmerken (rente, looptijd, NHG, schuldeiser).
 */
export interface VermogenDebtItem {
  id: string
  name: string
  /** NL-label van `debt_type` (uit `DEBT_TYPE_LABELS`). */
  typeLabel: string
  /** Subtype key indien aanwezig — gebruikt voor stelsel-tag bij studielening / belastingschuld. */
  subtype: string | null
  /** Subtype-label (NL) — `null` als geen subtype. */
  subtypeLabel: string | null
  /** Huidige restschuld (`current_balance`) — niet `original_amount`. */
  currentBalance: number
  /** Jaarrente in % (3.8 = 3,8%). */
  interestRatePct: number
  /**
   * Resterende looptijd in maanden — afgeleid uit `end_date − today`. `null`
   * voor doorlopend krediet / creditcard zonder einddatum.
   */
  remainingMonths: number | null
  /** Maandtermijn (`monthly_payment`). */
  monthlyPayment: number
  /** Aflossings-type (NL-label uit `REPAYMENT_TYPE_LABELS`). `null` als niet gezet. */
  repaymentTypeLabel: string | null
  /** Aflossings-type key — voor type-checks in UI. */
  repaymentType: RepaymentType | null
  /** Heeft NHG? Alleen relevant voor `mortgage`. `null` als niet van toepassing. */
  nhg: boolean | null
  /** Schuldeiser — `null` als niet ingevuld. */
  creditor: string | null

  // ── Type-specifieke details ──
  /** Rente-vast tot — alleen `mortgage`. ISO YYYY-MM-DD. */
  fixedRateEndDate: string | null
  /** Hypotheekrente aftrekbaar? — alleen `mortgage`. */
  isTaxDeductible: boolean | null
  /** Datum draagkrachtmeting — alleen `student_loan`. */
  draagkrachtmetingDate: string | null
  /** Belastingjaar — alleen `belastingschuld`. */
  taxYear: number | null
  /** Loopt er een betalingsregeling? — `belastingschuld`. */
  hasPaymentPlan: boolean
  /** Schriftelijke overeenkomst? — `familielening`. */
  hasWrittenAgreement: boolean
  /** Inclusie-pct (0–100) — analog aan asset-side. */
  inclusionPct: number
  /** Gewogen restschuld — `currentBalance × inclusionPct/100`. */
  weightedBalance: number
  /** Bezit hypotheekplanner-tracking? Voor app-deepening telling. */
  hasHypotheekplannerTracking: boolean
}

export interface VermogenDebtCategory {
  type: DebtType
  label: string
  items: VermogenDebtItem[]
  /** Subtotaal gewogen restschuld. */
  subtotal: number
}

// ── App-deepening secties ────────────────────────────────────────────

/**
 * Budgetteren-app: korte samenvatting van de budgetmodule. Alleen aanwezig
 * als ≥1 cash-asset `has_budget_tracking === true` heeft.
 */
export interface VermogenBudgetterenSection {
  totalCategories: number
  totalBudgetedMonthly: number
  totalSpentThisMonth: number
  topCategories: Array<{
    name: string
    icon: string
    spent: number
    limit: number
  }>
  savingsRateLastMonth: number | null
  monthLabel: string
}

/**
 * Holdings-app: lijst van individuele aandelen / crypto-holdings per
 * tracking-asset. Marktwaarde via `units × current_price` (fallback op
 * `avg_purchase_price` als `current_price` ontbreekt — analog aan
 * `loadHoldingsData`).
 */
export interface VermogenHoldingRow {
  /** Bron-asset naam (bv. "Beleggingsdepot DEGIRO"). */
  parentAssetName: string
  ticker: string
  name: string
  units: number
  avgPurchasePrice: number
  currentPrice: number
  marketValue: number
  bucket: 'investment' | 'crypto'
}

export interface VermogenHoldingsSection {
  totalMarketValue: number
  totalCost: number
  rows: VermogenHoldingRow[]
}

/**
 * Woonbalans-app: per `eigen_huis`-asset met tracking aan.
 * Stille reserve = marktwaarde - WOZ. Bruto overwaarde = marktwaarde -
 * resterende hypotheek.
 */
export interface VermogenWoonbalansItem {
  assetName: string
  marketValue: number
  wozValue: number | null
  /** Restschuld van gekoppelde hypotheek; `null` als geen hypotheek gevonden. */
  mortgageBalance: number | null
  /** marketValue − mortgageBalance; `null` als hypotheek-restschuld onbekend. */
  brutoOverwaarde: number | null
  /** marketValue − wozValue; `null` als WOZ niet ingevuld. */
  stilleReserve: number | null
}

export interface VermogenWoonbalansSection {
  items: VermogenWoonbalansItem[]
}

/**
 * Verhuurrendement-app: per `real_estate`-asset met tracking aan.
 * - Bruto-rendement = huur / marktwaarde × 100
 * - Netto-rendement = (huur − kosten) / marktwaarde × 100
 * - Bezettingsgraad: ratio van occupied-maanden in `vacancy_log` (laatste 12
 *   maanden window); `null` als log leeg is.
 */
export interface VermogenVerhuurItem {
  assetName: string
  marketValue: number
  rentalIncomeYearly: number
  monthlyMaintenanceCost: number
  vvaFee: number
  brutoRendementPct: number
  nettoRendementPct: number
  bezettingsgraadPct: number | null
}

export interface VermogenVerhuurSection {
  items: VermogenVerhuurItem[]
}

/**
 * Hypotheekplanner-app: per `mortgage`-debt met tracking aan. Voor MVP
 * tonen we de maandlast (uit `monthly_payment`), de totaal resterende rente
 * over de looptijd (uit `computeExpectedBalance`), en de eerstkomende 12
 * aflos-rijen + eindstand.
 */
export interface VermogenHypotheekRow {
  month: number
  date: string
  payment: number
  interest: number
  principal: number
  balance: number
}

export interface VermogenHypotheekItem {
  debtName: string
  currentBalance: number
  monthlyPayment: number
  interestRatePct: number
  repaymentTypeLabel: string | null
  totalRemainingInterest: number
  firstYearSchedule: VermogenHypotheekRow[]
  endBalance: number
}

export interface VermogenHypotheekSection {
  items: VermogenHypotheekItem[]
}

// ── Root document ────────────────────────────────────────────────────

/**
 * Volledige response van `GET /api/report/vermogen`.
 *
 * Module-gating (zie CLAUDE.md fallback-regel + spec sectie 5):
 * - Zowel `budgetteren`/`holdings`/etc. zijn allemaal `null` mogelijk. De
 *   loader vult ze alleen als ≥1 row de bijbehorende `has_*_tracking`-vlag
 *   aan heeft staan. De page-laag rendert geen lege secties met
 *   placeholder — gewoon overslaan.
 */
export interface VermogenReportData {
  date: string
  generatedAt: string
  displayName: string | null
  /** Dagelijkse uitgaven (12-mnd rolling, zelfde berekening als balans-rapport). */
  dailyExpenseRate: number

  // ── Inventaris ──
  assets: VermogenAssetCategory[]
  /** Som van alle `weightedValue` over alle asset-categorieën. */
  totalAssets: number
  /** Aantal asset-regels (alle items in alle categorieën). */
  totalAssetCount: number

  debts: VermogenDebtCategory[]
  totalDebts: number
  totalDebtCount: number

  eigenVermogen: number

  // ── App-deepening (allemaal optioneel) ──
  budgetterenSection: VermogenBudgetterenSection | null
  holdingsSection: VermogenHoldingsSection | null
  woonbalansSection: VermogenWoonbalansSection | null
  verhuurSection: VermogenVerhuurSection | null
  hypotheekSection: VermogenHypotheekSection | null
}
