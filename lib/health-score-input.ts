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
import { BOX3_PARAMS, CURRENT_TAX_YEAR, classifyAsset } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import { emergencyTargetBasis, resolveEmergencyFundFromRows } from '@/lib/emergency-fund'

// ── Box 3 (educatief "kans"-inzicht; sinds v2 geen score-pijler, ADR 0010) ───

/**
 * Of deze bezitting als Box 3-bezit telt — via de canonieke `classifyAsset`.
 *
 * Tot M23 stond hier een DERDE eigen type-set (`cash`/`savings`/`checking`/
 * `investment`/`crypto`) naast die in `box3-taxable-input.ts` en naast
 * `classifyAsset` zelf. Ze spraken elkaar tegen: deze set miste `real_estate`
 * en `vordering` (wél Box 3) en bevatte `'checking'`, dat geen geldig
 * `AssetType` is en dus nooit iets matchte — een dode entry die suggereerde dat
 * betaalrekeningen apart werden gedekt. Op dezelfde persona gaf deze set
 * €55.200 waar de canonieke bron €84.500 zag.
 */
function isBox3Asset(asset: HealthScoreAsset): boolean {
  if (!asset.asset_type) return false
  return classifyAsset(asset as unknown as Asset).category !== null
}

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
  // ── Velden die de canonieke `classifyAsset` leest (Box 3-kans-inzicht) ──
  // Optioneel: ontbreken ze in een smallere rij-select, dan valt de indeling
  // terug op de type-afleiding.
  subtype?: string | null
  tax_benefit?: boolean | null
  box3_vrijgesteld?: boolean | null
  box3_vrijstelling_reden?: string | null
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
      .filter(isBox3Asset)
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
 * Aantal maanden noodfondsdekking op de NORM-grondslag: de canonieke
 * INCLUSION-gewogen liquide pot (spaar/betaal/cash × inclusie-% +
 * niet-gekoppelde bankrekeningen), gedeeld door het netto maandsalaris.
 *
 * Sinds 29 jul 2026 is de norm 3 × netto maandsalaris (`resolveEmergencyFund`);
 * teller en doel staan dus op dezelfde grondslag. Alleen wanneer er géén salaris
 * bekend is valt de meting terug op de maanduitgaven met de 6-maands default.
 *
 * D1-fix: weegt via `computeLiquidPot` (dezelfde gedeelde weging als de
 * loader-bundel `emergencyFund`), zodat een deel-getelde spaarrekening
 * (net_worth_inclusion_pct < 100) op de gezondheidsscore precies zo zwaar telt
 * als in de bundel — geen drift meer tussen "gezondheid" en de noodfonds-widget.
 *
 * @param netMonthlySalary effectief netto maandsalaris; 0 → uitgaven-terugval.
 * @param avgMonthlyExpenses 6-maands gemiddelde maanduitgaven (terugval-noemer).
 */
export function computeEmergencyFundMonths(
  assets: ReadonlyArray<HealthScoreAsset>,
  unlinkedCash: number,
  netMonthlySalary: number,
  avgMonthlyExpenses: number,
): number {
  // DELEGATIE, geen tweede som (H4 punt 1): dezelfde kern die de noodfonds-
  // bundel voor widget en briefing bouwt. Voorheen stond hier een eigen
  // computeLiquidPot + deling, waardoor de gezondheidsmodal en de noodfonds-
  // widget op twee onafhankelijke paden konden gaan lopen.
  return resolveEmergencyFundFromRows(
    assets,
    unlinkedCash,
    netMonthlySalary,
    avgMonthlyExpenses,
  ).monthsCovered
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
 * Bouwt de `budgetCategories` voor de budget-discipline-pijler: één entry per
 * INDIVIDUELE budgetcategorie (limiet + besteed deze maand).
 *
 * ## Granulariteit — eigenaar-besluit 26 aug 2026 (bevinding H4, punt 3)
 * Tot dit besluit sommeerde deze functie álle budgetten tot precies DRIE
 * type-aggregaten (expense-totaal, savings-totaal, debt-totaal). De pijler
 * meldde dan "3/3 — alles binnen de limiet" terwijl de uitgaven-heatmap op
 * hetzelfde scherm "Gas, water, licht 107%" toonde: één overschrijding werd
 * weggemiddeld tegen categorieën die onder hun limiet bleven. Geen rekenfout,
 * wel een pijler die iets anders mat dan zijn eigen omschrijving ("Hoeveel van
 * je budgetcategorieën blijven binnen de limiet?") belooft.
 *
 * Gekozen richting: **optie A — echt per individuele categorie tellen**.
 *
 * ## Welke rij is een "categorie"?
 * Exact dezelfde populatie als de uitgaven-heatmap
 * (`heatmapExpenseGroups` in lib/dashboard-data-loader.ts): per parent geldt
 * `kinderen.length > 0 ? kinderen : [parent]`. Een parent mét kinderen is een
 * GROEP, geen categorie — anders zou zijn limiet (de som van de kinderen) naast
 * die kinderen nog een keer meetellen. Zo tellen modal en heatmap dezelfde
 * dingen, en kan "32/33" nooit meer naast een rode tegel staan.
 *
 * Het maandelijkse interval van de PARENT normaliseert ook de kinderlimieten
 * (`quarterly` ÷3, alles wat niet `monthly`/`quarterly` is ÷12) — kinderen
 * dragen geen eigen periodiciteit in deze grondslag, net als voorheen.
 *
 * ## Bewust ONGEWIJZIGD
 *  - Alle drie de types (expense/savings/debt) blijven meedoen; `income` niet.
 *  - De `spent`-pass heeft géén transfer-filter en telt absoluut — hetzelfde
 *    gedrag als élke andere budget-surface (zie `deriveBudgetTotals`).
 *  - Een transactie die rechtstreeks aan een parent MÉT kinderen hangt telt niet
 *    mee, precies zoals in de heatmap. Zo'n koppeling ontstaat niet via de UI
 *    (die kiest altijd een blad) en zou anders bij een limietloze groep landen.
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

  const isHealthType = (t: string | null | undefined): t is HealthBudgetType =>
    !!t && (HEALTH_BUDGET_TYPES as readonly string[]).includes(t)

  // Besteed per budget_id (deze maand) — één pass, daarna per blad opgevraagd.
  const spentByBudget = new Map<string, number>()
  for (const tx of transactions) {
    const budgetId = tx.budget_id
    if (!budgetId) continue
    spentByBudget.set(budgetId, (spentByBudget.get(budgetId) ?? 0) + Math.abs(Number(tx.amount ?? 0)))
  }

  const categories: { limit: number; spent: number }[] = []
  for (const parent of parents) {
    const type = parent.budget_type
    // `income` en onbekende types tellen niet mee in de discipline-pijler.
    if (!isHealthType(type) || type === 'income') continue
    const ownChildren = children.filter((c) => c.parent_id === parent.id)
    const leaves = ownChildren.length > 0 ? ownChildren : [parent]
    // Periodiciteit staat op de parent; kinderen erven 'm (zie doc hierboven).
    const toMonthly = (limit: number) =>
      parent.interval === 'monthly' ? limit
      : parent.interval === 'quarterly' ? limit / 3
      : limit / 12
    for (const leaf of leaves) {
      categories.push({
        limit: toMonthly(Number(leaf.default_limit ?? 0)),
        spent: spentByBudget.get(leaf.id) ?? 0,
      })
    }
  }
  return categories
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
  /** 6-maands gemiddelde maanduitgaven — terugval-noemer van de noodbuffer. */
  avgMonthlyExpenses: number
  /**
   * Effectief netto maandsalaris (`resolveEffectiveIncomeExpenses(...).income` —
   * handmatige invoer wint over het transactiegemiddelde). Grondslag van de
   * noodbuffer-norm: doel = 3 × dit bedrag, dekking = pot ÷ dit bedrag. Dit is
   * bewust NIET `netMonthlyIncome` hierboven (dat is het 6-maands transactie-
   * gemiddelde dat de DSTI-pijler voedt) — de gebruiker herkent zijn eigen
   * ingevoerde salaris, niet een gemiddelde over een grillige transactiereeks.
   */
  netMonthlySalary: number
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
    emergencyFundMonths: computeEmergencyFundMonths(
      rows.assets,
      rows.unlinkedCash,
      scalars.netMonthlySalary,
      scalars.avgMonthlyExpenses,
    ),
    // Norm en dekking komen uit DEZELFDE grondslagkeuze — nooit een target uit
    // de ene bron met een dekking uit de andere.
    emergencyTargetMonths: emergencyTargetBasis(
      scalars.netMonthlySalary,
      scalars.avgMonthlyExpenses,
    ).targetMonths,
    largestAssetTypeShare: computeLargestAssetTypeShare(rows.assets, rows.unlinkedCash),
    budgetCategories: buildBudgetCategories(rows.budgets, rows.transactions),
    // Backward-compat-velden (voeden geen pijler meer, ADR 0010) — voor het
    // educatieve Box 3-/diversificatie-inzicht buiten de score.
    assetTypeCount: computeAssetTypeCount(rows.assets, rows.unlinkedCash),
    taxData: buildTaxData(rows.assets, rows.unlinkedCash, rows.householdType),
  }
}
