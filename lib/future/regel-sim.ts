/**
 * runRegelProjection — gedeelde engine-aanroep voor de live-sim-bewerkschermen
 * (Eindstrategie & Onttrekkingsstrategie) op /toekomst → Voorkeuren.
 *
 * (FASE 6 stap 5A — kernel-only.) De baseline-curve in de editor moet IDENTIEK zijn aan de
 * Tijdas-grafiek. Beide draaien via `computeConvergentieProjection` (de horizon-kernel). De
 * server bouwt de `RegelSimSnapshot` (rauwe kernel-context + de huidige strategie-configs) en
 * geeft die als prop door; deze functie draait client-side (de router is puur). De
 * draft-strategie wordt op de profiel-velden van de rauwe context geplakt
 * (`applyDraftToRawContext`) — de kernel resolvet pensioen/AOW ZÉLF.
 */

import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import type { SimRow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { ankerReachFromSim, type AnkerReach } from '@/lib/horizon/anker-copy'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import type { PlanDraft } from '@/lib/horizon/plan-draft'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { SaleConfig } from '@/lib/sale-config'
import type { LifeEvent } from '@/lib/horizon-data'

/**
 * Serialiseerbare momentopname van alle simulatie-inputs voor de Voorkeuren-editors.
 * Wordt server-side gebouwd in dashboard-data-loader en als prop doorgegeven.
 */
export interface RegelSimSnapshot {
  /**
   * Rauwe kernel-context (profiel-rij + bezittingen/schulden/gebeurtenissen), gebouwd
   * server-side in `dashboard-data-loader` — DEZELFDE die de Tijdas-grafiek voedt. De
   * draft-strategie wordt hier bovenop de profiel-velden geplakt (zie `runRegelProjection`),
   * zodat de kernel de kandidaat-config leest zoals de gebruiker 'm zou opslaan.
   */
  rawContext: ConvergentieRawContext
  /** Rauwe eindstrategie (huidige config — voor de editor-weergave). */
  fireStrategy: FireStrategyConfig
  /** Huidige onttrekkingsstrategie (voor de editor-weergave). */
  withdrawalStrategy: WithdrawalStrategyConfig
  /** AOW-leeftijd afgerond omhoog (weergave). */
  aowAgeInt: number
  /** Fractionele AOW-leeftijd (weergave). */
  aowFractional: number
}

export interface RegelProjection {
  rows: SimRow[]
  fireAgeFractional: number | null
  /**
   * TPR-01 — "reikt tot": het bereik van het vermogen uit DEZELFDE run, via de
   * canonieke `ankerReachFromSim` (uitputtingsmaand × startleeftijd × eindleeftijd).
   * Bij een kern-fout `{ kind: 'onbekend' }`. Consume-only: de plan-review toont
   * hiermee het effect van een keuze zonder een eigen "wanneer is het op"-som.
   * Optioneel/additief in het TYPE (bestaande lege-projectie-literals in de
   * regel-bodies blijven compileerbaar); `runRegelProjection` zet 'm altijd.
   */
  reach?: AnkerReach
  /**
   * TPR-15 — het netto LIQUIDE vermogen aan het einde van het plan: de laatste
   * weergaverij (`clipRowsToPlanEnd` op de kernel-eindleeftijd), met de canonieke
   * weergave-deflator van díe rij. Nominaal: de consument deflateert precies één keer
   * via `deflate()` (`lib/euro-display.ts`). `null` = geen rijen. Consume-only — de
   * plan-review toont hiermee "wat er aan het einde over is" wanneer elke keuze tot het
   * einde van het plan reikt (effectmaat trede 3). Optioneel/additief in het TYPE.
   */
  eindeLiquide?: { leeftijd: number; nominaal: number; inflationFactor: number } | null
}

/** Verse lege projectie per aanroep — geen gedeelde (muteerbare) `rows`-array. */
function emptyProjection(): RegelProjection {
  return { rows: [], fireAgeFractional: null, reach: { kind: 'onbekend' }, eindeLiquide: null }
}

/**
 * Draft-override voor `runRegelProjection`. Naast de eind-/onttrekkingsstrategie kan een
 * volledige `withdrawal_profile_config`-draft (JSONB) meegegeven worden — zo reflecteert
 * de live-sim óók het onttrekkingsprofiel (V4) én de roadmap-M flex-spending-config
 * (`flex_nice_only`/`flex_nice_fractie`/`flex_cut_step`), die de kernel-adapter uit die
 * kolom leest. `null` wist de kolom (→ adapter-defaults).
 */
export interface RegelSimOverride {
  fireStrategy?: FireStrategyConfig
  /**
   * ADR 0129 F3b — het volledige plan-concept (anker + eind-vorm) uit de twee vragen.
   * Wint van `fireStrategy` wanneer beide meegegeven zijn: de eind-vorm gaat in
   * `fire_end_strategy`, het anker in `fire_stop_anchor`/`fire_stop_age` — exact de
   * kolommen die `buildConvergentieAdapterProfile` leest, zodat de live-sim onder een
   * gekozen stopleeftijd hetzelfde rekent als de kernel na de save.
   */
  firePlan?: PlanDraft
  /**
   * TPR-12 — de schakelaar "niet-liquide bezit meetellen in de nalatenschap"
   * (`profiles.fire_legacy_include_illiquid`, P!B54). `undefined` = kolom ongewijzigd;
   * `null` = terug naar de kernel-default ('Nee').
   */
  legacyIncludeIlliquid?: boolean | null
  /**
   * ADR 0149 — "Geen tekort-lening in mijn plan" (`profiles.fire_no_deficit_loan`).
   * `undefined` = kolom ongewijzigd; `false` = uit; `true`/`null` = aan (standaard, 17 sep 2026).
   */
  geenTekortLening?: boolean | null
  withdrawalStrategy?: WithdrawalStrategyConfig
  withdrawalProfileConfig?: Record<string, unknown> | null
  /**
   * TPR-01 — een kandidaat-woonstrategie als rauwe `housing_strategy_config`-JSONB
   * (dezelfde vorm als `serializeHousingStrategyConfig`/de PUT-body van
   * `/api/housing-strategy`). De plan-review zet hiermee de vier strategieën naast
   * elkaar. `undefined` = kolom ongewijzigd; `null` = geen config (kern-default).
   */
  housingStrategyConfig?: Record<string, unknown> | null
  /**
   * TPR-01 — een kandidaat-grondslag voor de uitgaven ná stoppen, als de twee
   * profielkolommen die de adapter leest (`retirement_expense_method` +
   * `retirement_expense_custom_amount` → `computeRetirementExpenses`). De plan-review
   * toont hiermee wat een ander uitgavenbedrag met de uitkomst doet; de kern rekent
   * het bedrag zelf door. `undefined` = kolommen ongewijzigd.
   */
  retirementExpense?: { method: string; customAmount: number | null }
  /**
   * TPR-15 — kandidaat-verkoopinstellingen per bezitting-id (`assets.sale_config`, dezelfde
   * vorm als de PATCH-body van `/api/assets/[id]/sale-config`). De kern leest de kolom zelf
   * (`buildPotLiquidaties`); hier wordt alleen de rij in de rauwe context vervangen. Een id
   * dat niet in de context staat, verandert niets. `undefined` = rijen ongewijzigd.
   */
  assetSaleConfigs?: Readonly<Record<string, SaleConfig>>
  /**
   * TPR-15 stap 3 — een kandidaat voor een beheerde strategie-gebeurtenis (AOW, werk of één
   * pensioenpot), in dezelfde rijvorm als `life_events`. De kern routeert die typen zelf naar
   * hun param-blokken; hier wordt alleen de lijst in de rauwe context aangepast.
   *  - `vervang: { eventType }` — alle rijen van dat type wijken (AOW en werk zijn één rij per
   *    gebruiker; zo rekenden de strategie-editors hun preview al).
   *  - `vervang: { id }` — alleen die rij wijkt; `id: null` = een nieuwe pot, er wijkt niets.
   *  - `event: null` — alleen weglaten (de vergelijking "zonder …").
   * `undefined` = gebeurtenissen ongewijzigd.
   */
  lifeEvent?: {
    vervang: { eventType: string } | { id: string | null }
    event: LifeEvent | null
  }
  /**
   * TPR-15 laag 2 — kandidaat-markt-aannames en Box 3, als de profielkolommen die de adapter
   * leest (dezelfde namen en eenheden als `PROFIEL_KERNEL_KOLOMMEN` en de PUT-body van
   * `/api/parameters`: rendement en inflatie als FRACTIE, heffingvrij in euro p.p. per jaar).
   * Een afwezige sleutel = kolom ongewijzigd; `box3_heffingvrij_inkomen: null` = terug naar de
   * kernel-default. `expected_return` is het terugvalrendement: de kern gebruikt het alleen voor
   * een bezitting zonder eigen rendement (`potRendement`, TPR-02).
   */
  parameters?: Partial<
    Pick<ConvergentieRawProfileRow, 'inflation_rate' | 'expected_return' | 'box3_method' | 'box3_heffingvrij_inkomen'>
  >
  /**
   * TPR-15 laag 2 — kandidaat-rendement per bezitting-id (`assets.expected_return`, PERCENT:
   * 7 = 7%, dezelfde eenheid als de PATCH-body van `/api/assets/[id]/expected-return`). Alleen
   * de rij in de rauwe context wordt vervangen; een onbekend id verandert niets.
   *
   * `null` = "geen eigen rendement" (ADR 0166). De wizard hoeft daarvoor GEEN eigen som te
   * doen: de rij gaat als `null` de kern in en `potRendement` past daar de terugval op het
   * profielrendement toe — dezelfde ketting als bij opslaan. Zou de wizard hier zelf het
   * profielrendement invullen, dan zou het live effect stil afwijken van het bewaarde plan
   * zodra die twee grondslagen uiteenlopen.
   */
  assetExpectedReturns?: Readonly<Record<string, number | null>>
  /**
   * W-009 — een kandidaat-GRONDSLAG voor inkomen en uitgaven nu, als de twee
   * kasstroomvelden die de adapter leest (`net_monthly_income` ×12 → `nettoJaarinkomen`,
   * `estimated_monthly_expenses`). Beide in EURO PER MAAND, precies zoals
   * `withResolvedKernelBedragen` (lib/horizon/kernel-profile-basis.ts) ze vóór elke
   * kernel-run op de profielrij plakt — de app injecteert daar de geresolveerde
   * effectieve bedragen; hier zet de wizard er de bedragen van een ándere grondslag
   * neer. Er wordt hier dus niets herberekend: de kandidaat-bedragen komen uit
   * `resolveAmountWithBasis` op de cashflow-bundel. `undefined` = kolommen ongewijzigd.
   */
  cashflow?: { monthlyIncome: number; monthlyExpenses: number }
}

/**
 * Draai de projectie voor een gegeven (eventueel overschreven) strategie-config via de
 * horizon-kernel. Bij een kern-fout: lege rijen.
 *
 * @param override - kandidaat-config (NIET de props muteren — altijd een kopie meegeven).
 */
export function runRegelProjection(
  snapshot: RegelSimSnapshot,
  override?: RegelSimOverride,
): RegelProjection {
  const outcome = computeConvergentieProjection({
    rawContext: applyDraftToRawContext(snapshot.rawContext, override),
  })
  if (!outcome.ok) return emptyProjection()
  const res = toSimResult(outcome.result)
  const eindRij = clipRowsToPlanEnd(outcome.result.rows, res.displayEndAge).at(-1)
  return {
    rows: res.rows,
    fireAgeFractional: res.fireAgeFractional,
    // Rij 0 = de startleeftijd (maand 0) — dezelfde as als `KernelInput.startLeeftijd`.
    reach: ankerReachFromSim({
      startAge: res.rows[0]?.age ?? null,
      kernelDepletionMonth: res.kernelDepletionMonth,
      endAge: res.displayEndAge,
    }),
    eindeLiquide: eindRij
      ? { leeftijd: eindRij.age, nominaal: eindRij.nettoLiquide, inflationFactor: eindRij.inflationFactor }
      : null,
  }
}

/**
 * Plak de draft-strategie op de profiel-velden van de rauwe kernel-context zodat de kernel
 * de kandidaat-config leest zoals de gebruiker 'm zou opslaan. ZONDER override (baseline)
 * blijft de context ONgewijzigd — dan is de kernel-run identiek aan de Tijdas-grafiek (die
 * dezelfde rauwe context gebruikt), geen default-drift. De withdrawal-guardrails en de
 * eindstrategie-velden spiegelen exact de kolommen die `buildConvergentieAdapterProfile` leest.
 */
function applyDraftToRawContext(
  base: ConvergentieRawContext,
  override?: RegelSimOverride,
): ConvergentieRawContext {
  if (
    !override?.fireStrategy &&
    !override?.firePlan &&
    !override?.withdrawalStrategy &&
    override?.withdrawalProfileConfig === undefined &&
    override?.legacyIncludeIlliquid === undefined &&
    override?.geenTekortLening === undefined &&
    override?.housingStrategyConfig === undefined &&
    override?.retirementExpense === undefined &&
    override?.assetSaleConfigs === undefined &&
    override?.lifeEvent === undefined &&
    override?.parameters === undefined &&
    override?.assetExpectedReturns === undefined &&
    override?.cashflow === undefined
  ) {
    return base
  }
  const profile = { ...base.profile }
  const saleConfigs = override.assetSaleConfigs
  const rendementen = override.assetExpectedReturns
  const heeft = (map: object | undefined, id: string) => map != null && Object.prototype.hasOwnProperty.call(map, id)
  const assets =
    saleConfigs || rendementen
      ? base.assets.map((a) => {
          if (!heeft(saleConfigs, a.id) && !heeft(rendementen, a.id)) return a
          return {
            ...a,
            ...(heeft(saleConfigs, a.id) ? { sale_config: saleConfigs![a.id] } : {}),
            ...(heeft(rendementen, a.id) ? { expected_return: rendementen![a.id] } : {}),
          }
        })
      : base.assets
  // TPR-15 laag 2 — alleen de meegegeven sleutels (een afwezige sleutel laat de kolom staan).
  if (override.parameters) {
    for (const [kolom, waarde] of Object.entries(override.parameters)) {
      if (waarde !== undefined) (profile as Record<string, unknown>)[kolom] = waarde
    }
  }
  const lifeEvents = override.lifeEvent ? vervangLifeEvent(base.lifeEvents, override.lifeEvent) : base.lifeEvents
  // W-009 — kandidaat-grondslag voor inkomen/uitgaven nu. Dezelfde twee velden die
  // `withResolvedKernelBedragen` vult; de kern leest ze als kasstroom-basis.
  if (override.cashflow !== undefined) {
    profile.net_monthly_income = override.cashflow.monthlyIncome
    profile.estimated_monthly_expenses = override.cashflow.monthlyExpenses
  }
  // TPR-01 — kandidaat-uitgavengrondslag na stoppen (de kern leidt het jaarbedrag af).
  if (override.retirementExpense !== undefined) {
    profile.retirement_expense_method = override.retirementExpense.method
    profile.retirement_expense_custom_amount = override.retirementExpense.customAmount
  }
  // TPR-01 — kandidaat-woonstrategie; `null` = kolom leeg (kern-default include_full).
  if (override.housingStrategyConfig !== undefined) {
    profile.housing_strategy_config = override.housingStrategyConfig
  }
  if (override.legacyIncludeIlliquid !== undefined) {
    profile.fire_legacy_include_illiquid = override.legacyIncludeIlliquid
  }
  if (override.geenTekortLening !== undefined) {
    profile.fire_no_deficit_loan = override.geenTekortLening
  }
  if (override.firePlan) {
    const p = override.firePlan
    profile.fire_end_strategy = p.endForm
    profile.fire_end_age = p.endAge
    profile.fire_legacy_amount = p.endForm === 'legacy' ? p.legacyAmount : 0
    profile.fire_stop_anchor = p.anchor
    profile.fire_stop_age = p.anchor === 'age' ? p.stopAge : null
  } else if (override.fireStrategy) {
    profile.fire_end_strategy = override.fireStrategy.strategy
    profile.fire_end_age = override.fireStrategy.endAge
    profile.fire_legacy_amount = override.fireStrategy.legacyAmount
  }
  if (override.withdrawalStrategy) {
    profile.withdrawal_strategy = override.withdrawalStrategy.strategy
    profile.guardrail_floor = override.withdrawalStrategy.guardrailFloor
    profile.guardrail_ceiling = override.withdrawalStrategy.guardrailCeiling
    profile.guardrail_cut_step = override.withdrawalStrategy.guardrailCutStep
  }
  // Roadmap M / V4 — volledige withdrawal_profile_config-draft (profiel + curve + flex).
  // `undefined` = niet meegegeven (kolom ongewijzigd); `null` = expliciet wissen.
  if (override.withdrawalProfileConfig !== undefined) {
    profile.withdrawal_profile_config = override.withdrawalProfileConfig
  }
  return { ...base, profile, assets, lifeEvents }
}

/**
 * De gebeurtenissenlijst met één beheerde strategie-rij vervangen (zie `RegelSimOverride.lifeEvent`).
 * Geëxporteerd zodat de strategie-editors op /toekomst/voorkeuren hun preview met
 * dezelfde vervangregel opbouwen als de kern-override in de wizard.
 */
export function vervangLifeEvent(
  events: readonly LifeEvent[],
  draft: NonNullable<RegelSimOverride['lifeEvent']>,
): readonly LifeEvent[] {
  const { vervang } = draft
  const blijft =
    'eventType' in vervang
      ? events.filter((e) => e.event_type !== vervang.eventType)
      : vervang.id == null
        ? [...events]
        : events.filter((e) => e.id !== vervang.id)
  return draft.event ? [...blijft, draft.event] : blijft
}
