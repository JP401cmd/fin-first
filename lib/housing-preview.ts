/**
 * housing-preview — motorschakelaar voor de eigen-woning-scenario-preview in de
 * strategie-modal (`components/identity/instellingen/housing-strategy-section.tsx`).
 *
 * FASE 6, stap 1 (item 6/7). De preview toont per (concept-)woonstrategie het
 * trigger-moment, de kernbedragen en de nieuwe vrijheidsleeftijd. Tot nu toe rekende
 * hij ALTIJD op de v2-grootboek-engine (`runHousingScenarioProjectionV2`) of v1
 * (`runHousingScenarioProjection`). Deze helper geeft die preview — achter de
 * per-gebruiker-vlag `horizon_kernel_convergentie` — een kernel-pad, zodat hij
 * dezelfde motor draait als de /toekomst-hoofdgrafiek (`use-horizon-fire-sim`).
 *
 * ## Byte-identiteit (harde eis)
 * Vlag uit (of geen rauwe kernel-context) → LETTERLIJK de bestaande aanroep:
 * `horizonEngineV2 ? runHousingScenarioProjectionV2 : runHousingScenarioProjection`.
 * Geen gedragswijziging voor de bewezen v2/v1-preview.
 *
 * ## Kernel-tak (vlag aan)
 * Woning-strategieën zijn kernel-NATIVE: de adapter mapt `housing_strategy_config`
 * → kernel-woning-params. Per scenario overschrijven we dat veld op de rauwe
 * profiel-rij en draaien we de convergentie-router (`computeConvergentieProjection`).
 * De router bouwt de kernel-invoer zélf uit `rawContext`; `builtInput` dient hier
 * alléén als machinery-detectie-invoer (geen woning-`assetLiquidations` → geen
 * spurieuze terugval) en als — hier verworpen — v2-terugval.
 *
 * ## Coherentie: geen stille engine-mix
 * De vlag-beslissing valt één keer per preview-bundel (`isHousingPreviewKernelEnabled`);
 * de aanroepende sectie draait beide scenario-kaarten (concept + opgeslagen) door
 * dezelfde helper met dezelfde bundel → altijd dezelfde motor. Valt de router binnen
 * de kernel-tak terug (kernel-fout of onondersteunde machinerie), dan geeft deze
 * helper de bestaande v2/v1-woning-preview terug — NIET de plain-projectie-terugval
 * van de router (die kent het woning-liquidatiemodel niet). Omdat beide scenario's op
 * dezelfde basis-data draaien, valt een kernel-fout voor beide identiek uit (geen mix).
 *
 * Pure functie — geen React/Supabase/Date.now; client- én server-bruikbaar.
 */

import type { HousingStrategyConfig } from '@/lib/housing-strategy'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'
import { computeConvergentieProjection } from '@/lib/horizon-kernel/convergentie-router'
import { applyKernelHousingSaleToEvents } from '@/lib/horizon/kernel-display-events'
import { runHousingScenarioProjectionV2 } from '@/lib/horizon-engine/build-input'
import {
  runHousingScenarioProjection,
  type HousingPreviewData,
  type HousingScenarioResult,
  type HousingTriggerSimBasis,
} from '@/lib/housing-trigger'

/**
 * Draait deze preview-bundel via de horizon-kernel? Alleen wanneer de
 * convergentie-vlag letterlijk aan staat ÉN de rauwe kernel-context is meegestuurd
 * (anders kan de kernel-invoer niet worden samengesteld → v2/v1).
 */
export function isHousingPreviewKernelEnabled(preview: HousingPreviewData): boolean {
  return preview.kernelConvergentieEnabled === true && preview.kernelRawContext != null
}

/**
 * Bestaande, bewezen preview: v2-grootboek wanneer de gebruiker die draait, anders
 * v1. Byte-identiek aan het gedrag vóór FASE 6 (het `runScenario`-`useMemo` in de
 * sectie).
 */
function runV2ScenarioPreview(
  config: HousingStrategyConfig,
  preview: HousingPreviewData,
): HousingScenarioResult {
  return preview.horizonEngineV2
    ? runHousingScenarioProjectionV2(config, preview.context, preview.simBasis)
    : runHousingScenarioProjection(config, preview.context, preview.simBasis)
}

/**
 * Basis-`UnifiedProjectionInput` uit de `simBasis` — géén woning-filter en géén
 * woning-events (de woning komt op de kernel-tak uit `housing_strategy_config`).
 * Wordt door de router uitsluitend gebruikt voor de machinery-detectie (zonder
 * `assetLiquidations` → `null`, geen terugval) en de hier-verworpen v2-terugval.
 * Spiegelt de veld-toewijzing van `buildMeasurementInput` (housing-trigger.ts).
 */
function baseInputFromSim(sim: HousingTriggerSimBasis): UnifiedProjectionInput {
  return {
    assets: sim.assets,
    debts: sim.debts,
    currentAge: sim.currentAge,
    endAge: sim.endAge,
    yearlyExpenses: sim.yearlyExpenses,
    annualSavings: sim.annualSavings,
    monthlySurplus: sim.annualSavings / 12,
    monthlyIncome: sim.monthlyIncome,
    incomeGrowthRate: 0,
    grossReturn: sim.grossReturn,
    inflationRate: sim.inflationRate,
    box3Method: sim.box3Method,
    cashflows: sim.cashflows,
    strategyConfig: sim.strategyConfig,
    withdrawalStrategy: sim.withdrawalStrategy,
    forcedFireAge: sim.forcedFireAge,
    hasPartner: sim.hasPartner,
    bankAccountCash: sim.bankAccountCash,
  }
}

/**
 * Draai het volledige scenario voor één (concept-)strategie-config: op de kernel-tak
 * via `computeConvergentieProjection` met een `housing_strategy_config`-override in de
 * rauwe context; op de v2/v1-tak via de bestaande aanroep. Levert altijd hetzelfde
 * `HousingScenarioResult`-contract als `runHousingScenarioProjectionV2`.
 */
export function runHousingScenarioPreview(
  config: HousingStrategyConfig,
  preview: HousingPreviewData,
): HousingScenarioResult {
  // Vlag uit / geen rauwe context → byte-identiek aan de bestaande preview.
  if (!isHousingPreviewKernelEnabled(preview) || !preview.kernelRawContext) {
    return runV2ScenarioPreview(config, preview)
  }

  const outcome = computeConvergentieProjection({
    builtInput: baseInputFromSim(preview.simBasis),
    v2FlagArg: preview.horizonEngineV2 ?? false,
    kernelEnabled: true,
    // Profiel-override: de woning-mapping loopt native via housing_strategy_config.
    rawContext: {
      ...preview.kernelRawContext,
      profile: {
        ...preview.kernelRawContext.profile,
        housing_strategy_config: config,
      },
    },
  })

  // Router viel binnen de kernel-tak terug (kernel-fout / onondersteunde machinerie)
  // → geef de bewezen v2/v1-woning-preview i.p.v. de plain-projectie-terugval van de
  // router (die het woning-liquidatiemodel niet kent). Hele preview-set blijft v2.
  if (outcome.engine !== 'kernel') {
    return runV2ScenarioPreview(config, preview)
  }

  return {
    // Item 7 — verkoopleeftijd op de KERNEL-waarheid: hergebruikt exact de
    // marker-helper van de hoofdgrafiek (`applyKernelHousingSaleToEvents`). Met een
    // lege basis-array levert die één kernel-afgeleid verkoop-event op
    // `kernelHousingSale.age` (downsize mét verkoop) of niets (geen verkoop /
    // opeethypotheek) — nooit de stale v2-trigger-leeftijd.
    events: applyKernelHousingSaleToEvents([], outcome.kernelHousingSale ?? null),
    // De kernel levert geen `SimulatedDepletionResult`; het "Waarom dit moment?"-
    // trigger-label valt daarmee op de kernel-tak terug op de neutrale variant.
    depletion: null,
    fireAgeFractional: outcome.result.fireAgeFractional,
    fireReachable: outcome.result.fireReachable,
  }
}
