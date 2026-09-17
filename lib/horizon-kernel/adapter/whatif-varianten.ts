/**
 * Horizon-kernel adapter — **what-if-varianten-mapping** (FASE 5, stap 2a).
 *
 * Levert de invoer-bouwstenen voor een scenario-run: de rendement-delta-mutatie op
 * bezittingen (`applyReturnDeltasToAssets`), de rauwe profiel-rij
 * (`WhatifRawProfileRow`, basis van `ConvergentieRawProfileRow`) en de eigen-huis-ids.
 * Pure, app-zijdige module — géén React, géén Supabase, géén Date/Math.random. De
 * KernelAdapterInput zelf bouwt de convergentie-router.
 *
 * ## Variant → rauwe kern-expressie (bouwtabel)
 *  - income_change / part_time / lifestyle_adjustment / extra_inleg / sabbatical /
 *    one_time_* / renovation / house_purchase / mortgage_payoff / children /
 *    child_extra_cost / market_shock (alle scenario-`LifeEvent`s):
 *      → DEZELFDE event-set als `KernelAdapterInput.lifeEvents`. De adapter-guard
 *        routeert vrije events → Geb-rijen, beheerde types → param-blokken,
 *        market_shock → potMutaties. Geen per-variant-code nodig.
 *      → **Slider-werk-uitzondering (modellek-fix):** een event met `scenario_origin`
 *        `slider:income` (income_change), `slider:workdays` (part_time),
 *        `slider:extra_inleg` (extra_inleg) of `slider:savings` (lifestyle_adjustment)
 *        draagt een PERMANENTE, inkomensgebonden spaarruimte-delta. De guard
 *        (`isSliderWorkEvent`) routeert die naar het salaris-kanaal (`nettoJaarinkomen`,
 *        `buildEventInputs.salarisDeltaPerMaand`) i.p.v. naar een doorlopende Geb-rij — daar
 *        geldt de kern-FIRE-gate dynamisch, dus de delta lekt niet de onttrekkingsfase in.
 *        `slider:extra_inleg` is per 13-jul mee-gegate (kaart "Doel lijn grafiek vragen");
 *        `slider:savings` per 29-jul op eigenaarsbesluit (spaarquote = inkomensgebonden, dus
 *        het effect vervalt met het inkomen — het FIRE-doelbedrag blijft onaangetast).
 *        Presets (`preset:*`) en échte `lifestyle_adjustment`-events dragen géén
 *        slider-origin en blijven dus ongewijzigd (Geb, permanent) — presets nog niet
 *        FIRE-gegate (follow-up).
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
 *  1. **Spaargrondslag-divergentie — OPGEHEVEN (TPR-08, ADR 0141, 13 sep 2026).**
 *     De kernel leidt sparen af als (netto_jaarinkomen − geschatte_jaaruitgaven) op de
 *     grondslag-geresolveerde profielrij (`kernel-profile-basis.ts`, ADR 0103); de
 *     what-if-baseline en `buildHorizonInput` lezen `baseAnnualSavingsFromCashflow` uit
 *     diezelfde `resolveSavingsSource`-resolutie (ADR 0121). Wat de twee uiteen liet
 *     lopen was de handmatige `profiles.monthly_savings_override`, die alleen de
 *     metadata-tak (`annualSavings`) voedde en de kern nooit bereikte. Die override is
 *     vervallen: één spaargrondslag app-breed, geen bekende afwijking meer op dit punt.
 *  2. **Nul-rendement-asset bij een rendement-delta (herzien TPR-02, 13 sep 2026).** In
 *     v2 kreeg élke asset met `expected_return = 0` de fallback-grossReturn als voet en
 *     dán de delta erbovenop (`initRunningBuckets`: `baseRet = expected_return/100 ||
 *     fallbackReturn` — de `||` maakte van een bewuste 0 een 7%). De kernel maakt sinds
 *     TPR-02 het onderscheid dat v2 miste: een INGEVULDE 0 blijft 0 (bewuste keuze) en
 *     landt op `0 + delta`; alleen een ONTBREKEND rendement (null/undefined) valt terug
 *     op het profielrendement (`potten.ts#potRendement`) en landt op
 *     `profielrendement + delta`. `applyReturnDeltasToAssets` past dezelfde terugval
 *     toe vóór de mutatie (`basisRendementPct`), anders zou een delta op zo'n asset de
 *     kern-terugval stil omzeilen en wijkt what-if van de hoofdlijn af.
 *  3. **Profiel-veld-bedradings­gaten (bewust undefined → adapter-defaults).** Op de
 *     what-if-client zijn NIET beschikbaar: `yearly_essential_expenses` (→ valt in de
 *     adapter terug op geschatte_jaaruitgaven i.p.v. de echte essentiële budgetten;
 *     raakt de pensioen-uitgave-methode 'essential_budgets') en
 *     `deficit_loan_rate` (→ Excel-default 0,05). Deze blijven undefined; de adapter
 *     vult neutrale defaults in. `withdrawal_profile_config` hoorde in dit rijtje maar
 *     is er sinds het B-042-vervolg uit: het gekozen profiel, de fasecurve en de
 *     flex-spending-config reizen mee, anders rekent what-if een ander plan door dan
 *     /toekomst.
 */

import type { Asset } from '@/lib/asset-data'

// ── Rendement-deltas → asset-`expected_return`-mutatie ───────────────────────

/**
 * Verschuif het `expected_return` (procentpunt) van elke bezitting met de bijbehorende
 * rendement-delta. NON-MUTEREND: levert een NIEUWE array; ongewijzigde bezittingen
 * behouden hun referentie. Per-type-delta wint van de uniforme delta; een delta is een
 * decimaal (bv. 0,02 = +2 procentpunt op `expected_return`).
 *
 * Basis vóór de delta = dezelfde ketting als de kern (`potten.ts#potRendement`, TPR-02):
 * een INGEVULDE waarde (ook 0) is de basis; ontbreekt het rendement (null/undefined),
 * dan is `basisRendementPct` (het profielrendement in PROCENT, bv. 7) de basis. Een
 * +delta op een bewuste 0%-asset landt dus op `0 + delta×100` pp (geen v2-achtige
 * grossReturn-backfill); op een asset zónder rendement op `basis + delta×100`.
 * Zonder delta blijft de rij ongewijzigd (ook een ontbrekend rendement blijft
 * ontbrekend — de terugval gebeurt dan in de kern zelf). `basisRendementPct`
 * weggelaten → 0 (byte-identiek aan vóór TPR-02). Zie de module-doc, punt 2.
 */
export function applyReturnDeltasToAssets(
  assets: readonly Asset[],
  returnDeltaByAssetType?: Record<string, number>,
  uniformReturnDelta = 0,
  basisRendementPct = 0,
): Asset[] {
  return assets.map((a) => {
    const perType = returnDeltaByAssetType?.[a.asset_type]
    const delta = perType !== undefined ? perType : uniformReturnDelta
    if (!delta) return a // 0/afwezig → geen verschuiving (referentie behouden)
    const eigen = a.expected_return as number | null | undefined
    const basePp =
      eigen == null
        ? Number.isFinite(basisRendementPct) ? basisRendementPct : 0
        : Number.isFinite(Number(eigen)) ? Number(eigen) : 0
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
  /** TPR-12 — P!B91 heffingvrij inkomen (euro p.p. per jaar); NULL → kernel-default 1800. */
  box3_heffingvrij_inkomen?: number | string | null
  fire_end_strategy?: string | null
  fire_end_age?: number | null
  fire_legacy_amount?: number | string | null
  /** TPR-12 — P!B54 niet-liquide meetellen in de nalatenschap; NULL → 'Nee'. */
  fire_legacy_include_illiquid?: boolean | null
  /** ADR 0129 D1 — stop-anker (`solved`/`aow`/`now`/`age`). */
  fire_stop_anchor?: string | null
  /** ADR 0129 D1 — zelfgekozen stopleeftijd (halve jaren). */
  fire_stop_age?: number | string | null
  /** ADR 0149 — "geen tekort-lening in mijn plan"; NULL/afwezig → aan (standaard), `false` → uit. */
  fire_no_deficit_loan?: boolean | null
  feature_preferences?: Record<string, unknown> | null
  withdrawal_strategy?: string | null
  /**
   * Zelfde eis als het stop-anker (ADR 0129 D3): het GEKOZEN onttrekkingsprofiel —
   * en zijn fasegrenzen — moet ook op het what-if-pad meereizen. Zonder deze kolom
   * leest `resolveWithdrawalProfiel` alleen de enum, die geen Afnemend/Oplopend kent,
   * en rekent what-if stil een ander plan door dan /toekomst (B-042-vervolg).
   */
  withdrawal_profile_config?: unknown
  guardrail_floor?: number | null
  guardrail_ceiling?: number | null
  guardrail_cut_step?: number | null
  housing_strategy_config?: unknown
  pot_rules?: unknown
  retirement_expense_method?: string | null
  /** DB-kolom `retirement_expense_custom_amount` — hernoemd naar `retirement_custom_amount`. */
  retirement_expense_custom_amount?: number | null
}

// ── Eigen-huis-ids (voor buildKernelSlotMeta) ────────────────────────────────

/**
 * Her-export van de canonieke kernel-API (stap 2b-dedupe): de regel leeft nu op
 * één plek in `./potten` en wordt gedeeld met de adapter-barrel en de
 * convergentie-router. Import-pad blijft werken voor bestaande consumenten.
 */
export { deriveEigenHuisIds } from './potten'
