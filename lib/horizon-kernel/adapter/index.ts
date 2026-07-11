/**
 * Horizon-kernel adapter — barrel + integrale `KernelInput`-assemblage.
 *
 * FASE 3, snede 1. **App-zijde** (mag app-types importeren); bewust NIET via de
 * kernel-barrel (`lib/horizon-kernel/index.ts`) geëxporteerd — de kern blijft puur en
 * domein-vrij. Deze module zet echte TriFinity-app-data (profiel, `Asset[]`,
 * `Debt[]`, strategie-configs) om naar de statische `KernelInput` die de kern
 * (`solveFire`/`runKernelProjection`) consumeert.
 *
 * ## Scope
 * Snede 1: potten (V6-schaling, getypte rollen, Box 3, tekort-lening) + P-parameters
 * (persoon, inkomen/uitgaven, Box 3, eindstrategie, woning V8, onttrekkingsprofiel V4)
 * + TS-prio's (V5-overgangsmapping).
 * Snede 2: de gebeurtenis-/strategie-expanders (AOW, pensioen-multipot, kinderen-NIBUD,
 * erfenis, werk-strategie) + de dubbeltelling-guard (`events.ts`/`guard.ts`). Huis loopt
 * via de woning-config (snede 1); huis-events worden nooit als Geb-rij gemapt.
 *
 * Snede 3: household/partner (V3) — een optioneel `partner`-blok op de invoer draait de
 * kern als **huishouden-run** (partner via de PT-parameterlaag `box3.personen = 2` +
 * `leefsituatie = 'Samenwonend'`); zonder partner blijft de invoer byte-identiek aan
 * snede 2b. Per-partner-weergaven lopen via `buildPerspectiefInputs` (aparte solo-runs
 * met deel-invoer). Zie `household.ts`.
 *
 * **NIET in scope (open punten):** de kern-uitbreidingen buiten het oracle-domein
 * (generieke `sale_config`-liquidaties met "wanneer nodig"/datum-trigger, payoffDebtIds —
 * snede 2b) en de weergave-laag rond de huishouden-runs (privacy-degrade, gecombineerde
 * uitgave-methoden, dual-AOW op de head-as — FASE 4/5). Zie de `notices` uit
 * `buildKernelInputFromAppWithNotices`.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { TaxYear } from '@/lib/box3-data'
import { resolveFireParams } from '@/lib/fire-params'
import { resolvePotRules } from '@/lib/pot-rules'
import { parseHousingStrategy } from '@/lib/housing-strategy'
import type { KernelInput } from '../types'
import { buildAssetPotten, buildPotLiquidaties, buildSchuldPotten, deriveEigenHuisIds } from './potten'
import { buildTsParams } from './prio-overgang'
import {
  DEFAULT_TAX_YEAR,
  NEUTRAL_PARTNER,
  buildBox3,
  buildEindstrategie,
  buildInkomenUitgaven,
  buildOnttrekkingsprofiel,
  buildOnzekerheid,
  buildPersoonTijdas,
  buildStrategieSelectors,
  buildWoning,
  resolveDeficitLoanRate,
  type KernelAdapterProfile,
} from './params'
import { buildEventInputs, type EventMappingNotice } from './events'
import { buildPartnerParams, type KernelAdapterPartner } from './household'

/** Volledige adapter-invoer: profiel + app-bezittingen/-schulden + optionele context. */
export interface KernelAdapterInput {
  readonly profile: KernelAdapterProfile
  readonly assets: readonly Asset[]
  readonly debts: readonly Debt[]
  /**
   * Levensgebeurtenissen (`life_events`). De adapter routeert ze via de guard:
   * beheerde events (aow/pension/werk/huis + kinderen/erfenis) → param-blokken,
   * vrije events → handmatige Geb-rijen. Leeg/weggelaten → neutrale defaults (snede 1).
   */
  readonly lifeEvents?: readonly LifeEvent[]
  /** AOW-leeftijd-tabel (`aow_leeftijd`) voor `lookupAowAge`. Leeg → fallback 67. */
  readonly aowRows?: readonly AowLeeftijdRow[]
  /** Box 3-belastingjaar (`BOX3_PARAMS`). Default = meest recente. */
  readonly taxYear?: TaxYear
  /**
   * Partner-blok (V3, snede 3). Aanwezig → **huishouden-run**: de kern krijgt de partner
   * via de PT-laag (`box3.personen = 2`, `leefsituatie = 'Samenwonend'`, `partner`-blok
   * uit `buildPartnerParams`). Weggelaten → solo-run, byte-identiek aan snede 2b. De
   * top-level `assets`/`debts` zijn dan de GECOMBINEERDE huishoud-potten; de PT-laag voegt
   * alléén het partner-INKOMEN toe (geen partner-potten → geen dubbeltelling).
   */
  readonly partner?: KernelAdapterPartner
}

/** `KernelInput` + de niet-(volledig-)mapbare punten uit de event-laag (voor rapport/beheer). */
export interface KernelAdapterResult {
  readonly input: KernelInput
  readonly notices: readonly EventMappingNotice[]
}

/**
 * Bouw de statische, VOLLEDIGE `KernelInput` + event-diagnostiek uit echte app-data.
 * Gooit een duidelijke fout bij een ontbrekende geboortedatum (zonder tijdas kan de
 * kern niet rekenen). De `notices` melden capaciteits-/kern-gaten (market_shock,
 * pensioen > 6 slots, Geb-overloop) i.p.v. ze stilzwijgend te droppen.
 */
export function buildKernelInputFromAppWithNotices(input: KernelAdapterInput): KernelAdapterResult {
  const { profile, assets, debts } = input
  if (!profile.date_of_birth) {
    throw new Error('buildKernelInputFromApp: profiel.date_of_birth ontbreekt — kan geen tijdas bouwen')
  }
  const taxYear = input.taxYear ?? DEFAULT_TAX_YEAR
  const aowRows = input.aowRows ?? []
  const inflatie = resolveFireParams(profile).inflationRate

  const { startLeeftijd, persoon } = buildPersoonTijdas(profile.date_of_birth, aowRows)

  const eigenHuisIds = deriveEigenHuisIds(assets)
  // V7: tekort-lening-rente uit het profiel (deficit_loan_rate) of Excel-default.
  const deficitLoanRate = resolveDeficitLoanRate(profile)
  const assetPotten = buildAssetPotten(assets)
  const schuldPotten = buildSchuldPotten(debts, eigenHuisIds, deficitLoanRate)

  const woningMeerekenen = parseHousingStrategy(profile.housing_strategy_config).mode === 'include_full'
  const ts = buildTsParams(resolvePotRules(profile), assetPotten, schuldPotten, woningMeerekenen)

  // Event-laag (snede 2): guard-gepartitioneerde routering naar de gebeurtenis-blokken.
  const events = buildEventInputs(input.lifeEvents ?? [], { startLeeftijd, inflatie })

  // Buiten-oracle uitbreidingen (snede 2b): market_shock → potMutaties (uit de event-
  // laag), sale_config-verkopen → potLiquidaties. Leeg → veld weggelaten (inert; de
  // KernelInput blijft identiek aan snede 1 wanneer er niets te muteren/liquideren valt).
  const liquidaties = buildPotLiquidaties(assets, { startLeeftijd })

  // Household/partner-laag (V3, snede 3). Aanwezig → huishouden-run: PT-partnerblok,
  // fiscale verdubbeling (personen=2) en samenwonend-leefsituatie. Weggelaten → alle drie
  // vallen op de solo-defaults terug en de KernelInput is byte-identiek aan snede 2b.
  const partnerResult = input.partner ? buildPartnerParams(input.partner, aowRows) : null
  const personen = partnerResult ? 2 : 1

  // Slider-werk-flows (inkomen/werkdagen, wat-als/scenariolaag) → salaris-kanaal. Hun
  // permanente maand-delta wordt op het basissalaris (`nettoJaarinkomen`) opgeteld — daar
  // geldt de dynamische kern-FIRE-gate (CF!D → F sparen, 0 ná FIRE), zodat de delta niet als
  // levenslange Geb-baat de onttrekkingsfase in lekt. BEWUST ná `buildInkomenUitgaven`, zodat
  // `uitgaveNaPensioenPerJaar` op het ongewijzigde basisinkomen blijft (scenario-inkomen
  // raakt de uitgave-na-pensioen-aanname niet — minimale blast radius). Delta 0 → byte-
  // identieke `inkomenUitgaven` (referentie behouden) → snede-1-determinisme intact.
  const inkomenUitgavenBasis = buildInkomenUitgaven(profile)
  const inkomenUitgaven =
    events.salarisDeltaPerMaand !== 0
      ? {
          ...inkomenUitgavenBasis,
          nettoJaarinkomen: inkomenUitgavenBasis.nettoJaarinkomen + events.salarisDeltaPerMaand * 12,
        }
      : inkomenUitgavenBasis

  const kernelInput: KernelInput = {
    // kern-scaffold
    startLeeftijd,
    inflatie,
    box3: buildBox3(profile, taxYear, personen),
    assetPotten,
    schuldPotten,

    // P-parameterblokken
    persoon,
    inkomenUitgaven,
    tekortLeningRente: deficitLoanRate,
    strategie: buildStrategieSelectors(),
    eindstrategie: buildEindstrategie(profile),
    woning: buildWoning(profile.housing_strategy_config),
    onttrekkingsprofiel: buildOnttrekkingsprofiel(profile),
    onzekerheid: buildOnzekerheid(persoon.startjaar),

    // overige invoer-tabbladen
    ts,
    gebeurtenissen: events.gebeurtenissen,
    // Bij een partner dwingt de huishouden-run het samenwonend-AOW-tarief af (kern-B21 =
    // 993) — óók als een AOW-event 'Alleenstaand' zou zeggen; partner-aanwezigheid wint.
    autoGebeurtenissen: partnerResult
      ? { ...events.autoGebeurtenissen, leefsituatie: 'Samenwonend' }
      : events.autoGebeurtenissen,
    partner: partnerResult ? partnerResult.partner : NEUTRAL_PARTNER,
    werkStrategie: events.werkStrategie,

    // kern-uitbreidingen buiten het oracle-domein (snede 2b) — weggelaten bij leeg.
    potMutaties: events.potMutaties.length > 0 ? events.potMutaties : undefined,
    potLiquidaties: liquidaties.liquidaties.length > 0 ? liquidaties.liquidaties : undefined,
    // F6-bugfix (gap V19, TRANSITIONEEL): app-pad lost een transitie-lag-tekort af uit
    // liquide bezit i.p.v. het eindeloos te laten compounden. Parity-/fixture-pad zet
    // deze vlag NIET (input-from-fixture) → Excel v5-oracle byte-identiek.
    tekortAflossingUitLiquide: true,
  }

  return {
    input: kernelInput,
    notices: [...events.notices, ...liquidaties.notices, ...(partnerResult?.notices ?? [])],
  }
}

/**
 * Bouw de statische, VOLLEDIGE `KernelInput` uit echte app-data (zonder diagnostiek).
 * Dunne wrapper rond `buildKernelInputFromAppWithNotices` — dé ingang voor consumenten
 * die alleen de kern-invoer nodig hebben.
 */
export function buildKernelInputFromApp(input: KernelAdapterInput): KernelInput {
  return buildKernelInputFromAppWithNotices(input).input
}

// ── Herexports (voor consumenten + tests) ────────────────────────────────────────
export type { KernelAdapterProfile } from './params'
export {
  assignAssetSlots,
  assignDebtSlots,
  buildAssetPotten,
  buildPotLiquidaties,
  buildSchuldPotten,
  deriveEigenHuisIds,
  mapInSparenNaAflossing,
  type DebtSlot,
  type LiquidatieContext,
} from './potten'
export { buildTsParams } from './prio-overgang'
export {
  buildBox3,
  buildEindstrategie,
  buildInkomenUitgaven,
  buildOnttrekkingsprofiel,
  buildPersoonTijdas,
  buildWoning,
  resolveDeficitLoanRate,
} from './params'
export {
  buildEventInputs,
  type EventInputs,
  type EventMappingContext,
  type EventMappingNotice,
} from './events'
export {
  partitionEvents,
  expanderFor,
  isExpanderManagedEvent,
  dedupeById,
  AUTO_EXPANDER_EVENT_TYPES,
  type EventPartition,
  type ExpanderKind,
  type GuardEvent,
} from './guard'
export {
  buildPartnerParams,
  buildPerspectiefInputs,
  type KernelAdapterPartner,
  type PartnerBuildResult,
  type HouseholdSplit,
  type PerspectiefInputs,
} from './household'
