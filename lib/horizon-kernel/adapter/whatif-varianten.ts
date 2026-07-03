/**
 * Horizon-kernel adapter — **what-if-varianten-mapping** (FASE 5, stap 2a).
 *
 * Zet de rauwe what-if-scenariotoestand (profiel-DB-rij, bezittingen, schulden,
 * event-set, rendement-deltas) om naar een `KernelAdapterInput` die de kernel
 * consumeert. Pure, app-zijdige module — géén React, géén Supabase, géén Date/
 * Math.random. Consumeert de bestaande adapter (`buildKernelInputFromApp`) via de
 * router; deze module levert alleen de INVOER-samenstelling per variant.
 *
 * ## Variant → rauwe kern-expressie (bouwtabel)
 *  - income_change / part_time / lifestyle_adjustment / extra_inleg / sabbatical /
 *    one_time_* / renovation / house_purchase / mortgage_payoff / children /
 *    child_extra_cost / market_shock (alle scenario-`LifeEvent`s):
 *      → DEZELFDE event-set als `KernelAdapterInput.lifeEvents`. De adapter-guard
 *        routeert vrije events → Geb-rijen, beheerde types → param-blokken,
 *        market_shock → potMutaties. Geen per-variant-code nodig.
 *  - rendement-slider (`returnDeltaByAssetType`):
 *      → pre-muteer het `expected_return` van de matchende bezittingen (+delta×100
 *        in procentpunt) VÓÓR de adapter → per-pot `rendement` verschuift.
 *  - vaste (pinned) uniforme rendement-shift (`returnDelta`):
 *      → tel de delta bij ELKE bezitting op vóór de adapter (uniformReturnDelta).
 *  - pot-regels: de kernel leest `profile.pot_rules` zelf → gewoon meegeven op het profiel.
 *  - woning-strategieën (`housing_strategy_config`): kernel-NATIVE — de adapter mapt
 *    ze naar de kernel-woning-params (`buildWoning`). Sinds de v2-verwijdering (FASE 6
 *    stap 5A) is er geen tweede motor meer om op terug te vallen; de vroegere
 *    `detectV2OnlyMachinery`-terugval is vervallen. Generieke (niet-huis) liquidaties die
 *    `buildPotLiquidaties` niet kan mappen worden door de adapter met een `notice` gemeld.
 *
 * ## Bekende afwijkingen (gedocumenteerd, NIET gefixt in 2a)
 *  1. **Spaargrondslag-divergentie (grootste baseline-afwijking, GEEN fallback-trigger).**
 *     De kernel LEIDT sparen af als (netto_jaarinkomen − geschatte_jaaruitgaven); de
 *     what-if-baseline gebruikt `resolveSavingsSource`/spaarquote-override
 *     (`baseAnnualSavingsFromCashflow`, `monthly_savings_override`). Dat geeft bij
 *     gelijke data een andere jaarlijkse inleg → andere FIRE-leeftijd. Bewust gemarkeerd
 *     voor convergentie in stap 2b.
 *  2. **Nul-rendement-asset bij een rendement-delta.** In v2 krijgt een asset met
 *     `expected_return = 0` de fallback-grossReturn als voet en dán de delta erbovenop
 *     (`initRunningBuckets`: `baseRet = expected_return/100 || fallbackReturn`); de kernel
 *     gebruikt puur `expected_return/100` (nul-basis, GEEN grossReturn-backfill). Een
 *     +delta op zo'n asset landt dus op `0 + delta` (kernel) i.p.v. `grossReturn + delta`
 *     (v2). Zie `applyReturnDeltasToAssets`.
 *  3. **Profiel-veld-bedradings­gaten (bewust undefined → adapter-defaults).** Op de
 *     what-if-client zijn NIET beschikbaar: `yearly_essential_expenses` (→ valt in de
 *     adapter terug op geschatte_jaaruitgaven i.p.v. de echte essentiële budgetten;
 *     raakt de pensioen-uitgave-methode 'essential_budgets'), `marginaal_tarief`,
 *     `deficit_loan_rate` (→ Excel-default 0,05), `withdrawal_profile_config` (→ Excel-
 *     3-fasen-curve). Deze blijven undefined; de adapter vult neutrale defaults in.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import type { KernelAdapterInput, KernelAdapterProfile } from './index'

// ── Rendement-deltas → asset-`expected_return`-mutatie ───────────────────────

/**
 * Verschuif het `expected_return` (procentpunt) van elke bezitting met de bijbehorende
 * rendement-delta. NON-MUTEREND: levert een NIEUWE array; ongewijzigde bezittingen
 * behouden hun referentie. Per-type-delta wint van de uniforme delta; een delta is een
 * decimaal (bv. 0,02 = +2 procentpunt op `expected_return`).
 *
 * BEWUSTE AFWIJKING t.o.v. v2 (nul-rendement-asset): de kern-basis is `expected_return`
 * (nul-basis bij 0/ontbrekend), NIET de grossReturn-backfill die v2 (`initRunningBuckets`)
 * toepast. Een +delta op een 0%-asset landt hier dus op `0 + delta×100` pp, terwijl v2
 * `grossReturn + delta` zou hanteren. Zie de module-doc, punt 2.
 */
export function applyReturnDeltasToAssets(
  assets: readonly Asset[],
  returnDeltaByAssetType?: Record<string, number>,
  uniformReturnDelta = 0,
): Asset[] {
  return assets.map((a) => {
    const perType = returnDeltaByAssetType?.[a.asset_type]
    const delta = perType !== undefined ? perType : uniformReturnDelta
    if (!delta) return a // 0/afwezig → geen verschuiving (referentie behouden)
    const basePp = Number.isFinite(Number(a.expected_return)) ? Number(a.expected_return) : 0
    return { ...a, expected_return: basePp + delta * 100 }
  })
}

// ── Rauwe profiel-rij (what-if-client) → KernelAdapterProfile ────────────────

/**
 * De profiel-DB-kolommen die de what-if-client ophaalt (subset van `profiles`).
 * Superset-mapping naar `KernelAdapterProfile` incl. de kolom-hernoeming
 * `retirement_expense_custom_amount` → `retirement_custom_amount`.
 */
export interface WhatifRawProfileRow {
  date_of_birth?: string | null
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  expected_return?: number | null
  inflation_rate?: number | null
  box3_method?: string | null
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
  feature_preferences?: Record<string, unknown> | null
  withdrawal_strategy?: string | null
  guardrail_floor?: number | null
  guardrail_ceiling?: number | null
  guardrail_cut_step?: number | null
  guardrail_raise_step?: number | null
  housing_strategy_config?: unknown
  pot_rules?: unknown
  retirement_expense_method?: string | null
  /** DB-kolom `retirement_expense_custom_amount` — hernoemd naar `retirement_custom_amount`. */
  retirement_expense_custom_amount?: number | null
}

/** Parameters voor `buildWhatifKernelAdapterInput`. */
export interface BuildWhatifKernelAdapterInputParams {
  readonly profile: WhatifRawProfileRow
  /** Bezittingen — reeds door `applyReturnDeltasToAssets` gemuteerd voor de rendement-slider. */
  readonly assets: readonly Asset[]
  readonly debts: readonly Debt[]
  /** De event-set van deze run (baseline = alleen DB-events; scenario = DB + scenario-only). */
  readonly lifeEvents: readonly LifeEvent[]
  readonly aowRows?: readonly AowLeeftijdRow[]
  readonly taxYear?: TaxYear
}

/**
 * Bouw de `KernelAdapterInput` uit de rauwe what-if-toestand. Mapt alleen de op de
 * client beschikbare profiel-velden; de rest blijft undefined (adapter-defaults, zie
 * de module-doc, punt 3). De event-set gaat ONGEWIJZIGD als `lifeEvents` mee — de
 * adapter-guard doet de per-type-routering.
 */
export function buildWhatifKernelAdapterInput(
  params: BuildWhatifKernelAdapterInputParams,
): KernelAdapterInput {
  const p = params.profile
  const profile: KernelAdapterProfile = {
    date_of_birth: p.date_of_birth ?? null,
    net_monthly_income: p.net_monthly_income ?? null,
    estimated_monthly_expenses: p.estimated_monthly_expenses ?? null,
    // yearly_essential_expenses: BEDRADINGS­GAT — niet op de client → adapter valt terug
    //   op geschatte_jaaruitgaven (module-doc punt 3).
    expected_return: p.expected_return ?? null,
    inflation_rate: p.inflation_rate ?? null,
    box3_method: p.box3_method ?? null,
    // marginaal_tarief: BEDRADINGS­GAT — adapter-default.
    fire_end_strategy: p.fire_end_strategy ?? null,
    fire_end_age: p.fire_end_age ?? null,
    fire_legacy_amount: p.fire_legacy_amount ?? null,
    feature_preferences: p.feature_preferences ?? null,
    withdrawal_strategy: p.withdrawal_strategy ?? null,
    guardrail_floor: p.guardrail_floor ?? null,
    guardrail_ceiling: p.guardrail_ceiling ?? null,
    guardrail_cut_step: p.guardrail_cut_step ?? null,
    guardrail_raise_step: p.guardrail_raise_step ?? null,
    // withdrawal_profile_config + deficit_loan_rate: BEDRADINGS­GATEN — Excel-defaults.
    housing_strategy_config: p.housing_strategy_config,
    pot_rules: p.pot_rules,
    retirement_expense_method: p.retirement_expense_method ?? null,
    // Kolom-hernoeming: DB `retirement_expense_custom_amount` → kern `retirement_custom_amount`.
    retirement_custom_amount: p.retirement_expense_custom_amount ?? null,
  }
  return {
    profile,
    assets: params.assets,
    debts: params.debts,
    lifeEvents: params.lifeEvents,
    aowRows: params.aowRows,
    taxYear: params.taxYear,
  }
}

// ── Eigen-huis-ids (voor buildKernelSlotMeta) ────────────────────────────────

/**
 * Her-export van de canonieke kernel-API (stap 2b-dedupe): de regel leeft nu op
 * één plek in `./potten` en wordt gedeeld met de adapter-barrel en de
 * convergentie-router. Import-pad blijft werken voor bestaande consumenten.
 */
export { deriveEigenHuisIds } from './potten'
