/**
 * Canonieke input-bouw voor de financiële gezondheidsscore.
 *
 * Eén bron van waarheid voor het samenstellen van `HealthScoreInput`, gedeeld
 * door de live loader (`lib/dashboard-data-loader.ts`) én de snapshot-routes
 * (`app/api/snapshots[/auto|/cron]`). Vóór deze module bouwden de routes
 * proxy-inputs (noodfonds = assets×0.3, lege budgetCategories, geen taxData,
 * freedomPct uit een tweede berekenpad). Dat liet de opgeslagen
 * `resilience_score` divergeren van de live score op /overzicht en de
 * kassabon-receipts. (Defect A/B — SSoT-fix.)
 *
 * Variant a (bindend, architect): het "huidige" gezondheidsgetal is overal de
 * live score; `resilience_score` is uitsluitend historie voor de trendlijn;
 * de snapshot-routes hergebruiken DEZE functies met canonieke inputs zodat
 * loader en routes letterlijk hetzelfde pad delen.
 *
 * Deze module bevat alléén pure functies — geen Supabase, geen I/O — zodat ze
 * triviaal testbaar zijn en in zowel user- als service-role/cron-context
 * draaien.
 */

import type { HealthScoreInput } from '@/lib/financial-health'
import { hasPartner } from '@/lib/household-type'
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { computeLiquidPot } from '@/lib/dashboard-wealth-weighting'
import { DEFAULT_EMERGENCY_TARGET_MONTHS } from '@/lib/emergency-fund'

// ── Box 3 (educatief "kans"-inzicht; sinds v2 geen score-pijler, ADR 0010) ───

/** Vermogenstypes die als Box 3-bezit tellen (spaargeld + beleggingen). */
const BOX3_ASSET_TYPES = new Set(['cash', 'savings', 'checking', 'investment', 'crypto'])

/** Budgettypes die in de budget-discipline-pijler meewegen. */
const HEALTH_BUDGET_TYPES = ['income', 'expense', 'savings', 'debt'] as const
type HealthBudgetType = (typeof HEALTH_BUDGET_TYPES)[number]

/** Minimale assetvorm: type + waarde + inclusie-percentage voor de score-inputs. */
export interface HealthScoreAsset {
  asset_type?: string | null
  current_value?: number | string | null
  /**
   * `net_worth_inclusion_pct` (0..100). Bepaalt hoe zwaar de bezitting in de
   * INCLUSION-gewogen liquide pot meetelt (D1-fix); ontbreekt → 100%.
   */
  net_worth_inclusion_pct?: number | null
}

/** Minimale budgetvorm (parent of child). */
export interface HealthScoreBudget {
  id: string
  parent_id?: string | null
  budget_type?: string | null
  default_limit?: number | string | null
  interval?: string | null
}

/** Minimale transactievorm met budgetkoppeling. */
export interface HealthScoreTransaction {
  amount?: number | string | null
  budget_id?: string | null
}

/**
 * Box 3-context voor het educatieve "kans"-inzicht (sinds gezondheidsscore v2
 * geen score-pijler meer, ADR 0010). Woont hier zodat alle call-sites dezelfde
 * berekening delen.
 *
 * @returns null wanneer Box 3-bezit < €1.000.
 */
export function buildTaxData(
  assets: ReadonlyArray<HealthScoreAsset>,
  unlinkedCash: number,
  householdType: string | null | undefined,
): HealthScoreInput['taxData'] {
  const box3Bezittingen =
    assets
      .filter((a) => a.asset_type && BOX3_ASSET_TYPES.has(a.asset_type))
      .reduce((s, a) => s + Number(a.current_value ?? 0), 0) + unlinkedCash
  if (box3Bezittingen < 1_000) return null
  // Bug-fix: voorheen tegen de verouderde woordenschat ('samenwonend'/'getrouwd')
  // die householdType nooit is → altijd false. Nu via canonieke helper.
  // Vermogensvrijstelling én forfait/tarief uit de canonieke jaartabel
  // (BOX3_PARAMS[CURRENT_TAX_YEAR]) i.p.v. losse hardcoded 2025-waarden.
  const p = BOX3_PARAMS[CURRENT_TAX_YEAR]
  const heffingsvrijVermogen = hasPartner(householdType) ? p.heffingsvrijPartner : p.heffingsvrijSingle
  const rendementsgrondslag = Math.max(0, box3Bezittingen - heffingsvrijVermogen)
  const box3Tax = Math.round(rendementsgrondslag * p.forfaitBeleggingen * p.tarief)
  return { box3Bezittingen, box3Tax, heffingsvrijVermogen, rendementsgrondslag }
}

// ── Noodfonds (emergency_fund-pillar) ────────────────────────────────────────

/**
 * Aantal maanden noodfondsdekking: de canonieke INCLUSION-gewogen liquide pot
 * (spaar/betaal/cash × inclusie-% + niet-gekoppelde bankrekeningen), gedeeld
 * door de gemiddelde maanduitgaven.
 *
 * D1-fix: weegt nu via `computeLiquidPot` (dezelfde gedeelde weging als de
 * loader-bundel `emergencyFund`), zodat een deel-getelde spaarrekening
 * (net_worth_inclusion_pct < 100) op de gezondheidsscore precies zo zwaar telt
 * als in de bundel — geen drift meer tussen "gezondheid" en de noodfonds-widget.
 *
 * @param avgMonthlyExpenses 6-maands gemiddelde maanduitgaven; 0 → 0 maanden.
 */
export function computeEmergencyFundMonths(
  assets: ReadonlyArray<HealthScoreAsset>,
  unlinkedCash: number,
  avgMonthlyExpenses: number,
): number {
  const liquidPot = computeLiquidPot(
    assets.map((a) => ({
      current_value: a.current_value ?? 0,
      asset_type: a.asset_type,
      net_worth_inclusion_pct: a.net_worth_inclusion_pct,
    })),
    unlinkedCash,
  )
  return avgMonthlyExpenses > 0 ? liquidPot / avgMonthlyExpenses : 0
}

// ── Diversificatie (legacy, niet langer een pijler) ──────────────────────────

/**
 * @deprecated Voedt sinds gezondheidsscore v2 geen pijler meer (ADR 0010); de
 * `diversification`-pijler is vervangen door `asset_concentration`
 * (computeLargestAssetTypeShare). Blijft als helper voor backward-compat.
 *
 * Aantal distinct asset_types; telt `cash` mee zodra er niet-gekoppeld cash is.
 */
export function computeAssetTypeCount(
  assets: ReadonlyArray<HealthScoreAsset>,
  unlinkedCash: number,
): number {
  const assetTypes = new Set(
    assets.map((a) => a.asset_type).filter((t): t is string => Boolean(t)),
  )
  if (unlinkedCash > 0) assetTypes.add('cash')
  return assetTypes.size
}

// ── Vermogensconcentratie (asset_concentration-pillar) ────────────────────────

/** Eigen woning telt niet mee in de spreidings-grondslag (ADR 0010 / FR-3). */
const CONCENTRATION_EXCLUDED_TYPES = new Set(['eigen_huis'])

/** Onder deze drempel (grootste type) is de pijler inactief — starters. */
const CONCENTRATION_MIN_LARGEST = 10_000

/**
 * Grootste `asset_type` als fractie (0–1) van het totale vermogen, exclusief de
 * eigen woning (`asset_type === 'eigen_huis'`; `'real_estate'` =
 * beleggingsvastgoed telt WÉL mee). Niet-gekoppeld cash telt als type `'cash'`.
 *
 * @returns null wanneer het grootste type < €10.000 is (starter) of het totaal
 *   excl. eigen woning ≤ 0 — de concentratie-pijler valt dan inactief.
 */
export function computeLargestAssetTypeShare(
  assets: ReadonlyArray<HealthScoreAsset>,
  unlinkedCash: number,
): number | null {
  const byType = new Map<string, number>()
  for (const a of assets) {
    const type = a.asset_type
    if (!type || CONCENTRATION_EXCLUDED_TYPES.has(type)) continue
    byType.set(type, (byType.get(type) ?? 0) + Number(a.current_value ?? 0))
  }
  if (unlinkedCash > 0) {
    byType.set('cash', (byType.get('cash') ?? 0) + unlinkedCash)
  }

  const total = Array.from(byType.values()).reduce((s, v) => s + v, 0)
  if (total <= 0) return null

  const largest = Math.max(0, ...byType.values())
  if (largest < CONCENTRATION_MIN_LARGEST) return null

  return largest / total
}

// ── Budget-discipline (budget_discipline-pillar) ─────────────────────────────

/**
 * Bouwt de `budgetCategories` (limit/spent per type: expense, savings, debt)
 * exact zoals de loader dat doet: maandlimieten uit parent/child-budgetten
 * (kinderen sommeren over parent), interval genormaliseerd naar maand, en
 * besteed bedrag per type uit transacties via hun budget_id.
 *
 * Een lege array (geen budgetten) maakt de budget-discipline-pijler inactief
 * (ADR 0010 / FR-5; geen neutrale 70-dummy meer) — het gewicht wordt herverdeeld.
 */
export function buildBudgetCategories(
  budgets: ReadonlyArray<HealthScoreBudget>,
  transactions: ReadonlyArray<HealthScoreTransaction>,
): { limit: number; spent: number }[] {
  const parents = budgets.filter((b) => b.parent_id == null)
  const children = budgets.filter((b) => b.parent_id != null)

  // budget_id → type (parents + children erven parent-type)
  // Onvoorwaardelijk setten — gedragsidentiek aan de loader (die schrijft de
  // ruwe budget_type altijd weg). isHealthType filtert later op de geldige
  // types, dus een null/leeg type schaadt de score niet.
  const budgetTypeMap = new Map<string, string>()
  for (const b of parents) budgetTypeMap.set(b.id, b.budget_type as string)
  for (const c of children) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }

  const isHealthType = (t: string | null | undefined): t is HealthBudgetType =>
    !!t && (HEALTH_BUDGET_TYPES as readonly string[]).includes(t)

  // Maandlimieten per type
  const budgetLimits: Record<HealthBudgetType, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const b of parents) {
    const type = b.budget_type
    if (!isHealthType(type)) continue
    const ownChildren = children.filter((c) => c.parent_id === b.id)
    const limit = ownChildren.length > 0
      ? ownChildren.reduce((sum, c) => sum + Number(c.default_limit ?? 0), 0)
      : Number(b.default_limit ?? 0)
    const monthlyLimit = b.interval === 'monthly' ? limit
      : b.interval === 'quarterly' ? limit / 3
      : limit / 12
    budgetLimits[type] += monthlyLimit
  }

  // Besteed per type (deze maand) uit transacties
  const budgetSpent: Record<HealthBudgetType, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const tx of transactions) {
    const budgetId = tx.budget_id
    if (!budgetId) continue
    const type = budgetTypeMap.get(budgetId)
    if (!isHealthType(type)) continue
    budgetSpent[type] += Math.abs(Number(tx.amount ?? 0))
  }

  return [
    { limit: budgetLimits.expense, spent: budgetSpent.expense },
    { limit: budgetLimits.savings, spent: budgetSpent.savings },
    { limit: budgetLimits.debt, spent: budgetSpent.debt },
  ]
}

// ── Assembler ────────────────────────────────────────────────────────────────

/**
 * Reeds berekende canonieke primitieven die per surface verschillen
 * (perspectief-totalen, spaarquote, strategy-adjusted freedomPct).
 */
export interface HealthScoreScalars {
  savingsRate6m: number
  totalAssets: number
  totalDebts: number
  /** Strategy-adjusted FIRE-voortgang (0–100+); persisteer wat hier wordt gebruikt. */
  freedomPct: number
  /** 6-maands gemiddelde maanduitgaven voor de noodfonds-dekking. */
  avgMonthlyExpenses: number
  /**
   * DISPLAY-target voor het noodfonds in maanden (uit het noodfonds-doel via
   * `resolveEmergencyFund`; afwezig → default 6). De score-curve floort deze
   * intern (anti-gaming); zie `lib/emergency-fund.ts`.
   */
  emergencyTargetMonths?: number
  /**
   * Netto maandinkomen — DEZELFDE canonieke bron die `savingsRate6m` voedt
   * (income6m/6 resp. effectiveMonthlyIncome). Noemer van de DSTI-pijler;
   * géén nieuwe/afwijkende inkomensbron introduceren (ADR 0010 / FR-2).
   */
  netMonthlyIncome: number
}

/**
 * Ruwe rijen waaruit de afgeleide pillar-inputs (noodfonds, diversificatie,
 * budget-discipline, tax) canoniek worden opgebouwd.
 */
export interface HealthScoreRows {
  /** Volledige assets (asset_type + current_value). */
  assets: ReadonlyArray<HealthScoreAsset>
  /** Saldo van actieve, niet-aan-een-asset-gekoppelde bankrekeningen. */
  unlinkedCash: number
  /** Alle budgetten (parents + children, alle types). [] → budget-pijler inactief. */
  budgets: ReadonlyArray<HealthScoreBudget>
  /** Transacties van de huidige maand met budget_id. */
  transactions: ReadonlyArray<HealthScoreTransaction>
  /** household_type uit profiel (voor heffingsvrij vermogen, educatief inzicht). */
  householdType: string | null | undefined
  /**
   * Σ maandlasten (monthly_payment) van actieve schulden — teller van de
   * DSTI-pijler. Vooraf gesommeerd in loader/route.
   */
  debtMonthlyPayments: number
}

/**
 * Stelt de complete, canonieke `HealthScoreInput` samen. Dit is hét gedeelde
 * pad: zowel de live loader als de drie snapshot-routes roepen deze functie
 * aan, zodat de opgeslagen `resilience_score` ≈ de live score wordt (±
 * afronding) bij gelijke data — geen tweede berekenpad meer.
 */
export function buildHealthScoreInput(
  scalars: HealthScoreScalars,
  rows: HealthScoreRows,
): HealthScoreInput {
  return {
    savingsRate6m: scalars.savingsRate6m,
    totalAssets: scalars.totalAssets,
    totalDebts: scalars.totalDebts,
    freedomPct: scalars.freedomPct,
    netMonthlyIncome: scalars.netMonthlyIncome,
    debtMonthlyPayments: rows.debtMonthlyPayments,
    emergencyFundMonths: computeEmergencyFundMonths(rows.assets, rows.unlinkedCash, scalars.avgMonthlyExpenses),
    emergencyTargetMonths: scalars.emergencyTargetMonths ?? DEFAULT_EMERGENCY_TARGET_MONTHS,
    largestAssetTypeShare: computeLargestAssetTypeShare(rows.assets, rows.unlinkedCash),
    budgetCategories: buildBudgetCategories(rows.budgets, rows.transactions),
    // Backward-compat-velden (voeden geen pijler meer, ADR 0010) — voor het
    // educatieve Box 3-/diversificatie-inzicht buiten de score.
    assetTypeCount: computeAssetTypeCount(rows.assets, rows.unlinkedCash),
    taxData: buildTaxData(rows.assets, rows.unlinkedCash, rows.householdType),
  }
}
