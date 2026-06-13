/**
 * Gedeelde assemblage van `UnifiedProjectionInput` uit geladen app-data.
 *
 * EÉN bron, gebruikt door zowel de /toekomst-hook (`use-horizon-fire-sim`, client)
 * als de beheer-tabel-API (`/api/horizon-engine/ledger`, server) — er is geen tweede
 * input-assemblagepad (single source of truth; zie docs/architecture/horizon-engine-v2.md).
 *
 * Pure functie, geen Supabase. Retourneert null bij onvoldoende data (geen
 * geboortedatum of geen retirement-uitgaven).
 */

import { ageAtDate, DEFAULT_RETURN, INFLATION, type FinancialInput, type LifeEvent } from '@/lib/horizon-data'
import { NL_AOW_AGE } from '@/lib/constants'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { UnifiedProjectionInput, AssetLiquidation } from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import {
  filterAssetsForFire,
  deriveHousingContext,
  isHousingStrategyEvent,
  buildHousingLifeEventsAtAge,
  DEFAULT_HOUSING_STRATEGY,
  type HousingStrategyConfig,
  type HousingContext,
  type DownsizeConfig,
} from '@/lib/housing-strategy'
import {
  resolveHousingEventsForSim,
  type SimulatedDepletionResult,
  type HousingTriggerSimBasis,
  type HousingScenarioResult,
} from '@/lib/housing-trigger'
import { expandGroupsToAssetTypes, isDefaultGroupOrder, type PotRulesConfig } from '@/lib/pot-rules'
import { runHorizonLedger } from './engine'
import { runSelectedProjection } from './select'
import type { HorizonStrategyOptions } from './strategies'

export interface BuildHorizonInputParams {
  horizonInput: FinancialInput | null
  lifeEvents: LifeEvent[]
  fireStrategy?: FireStrategyConfig
  withdrawalStrategy?: WithdrawalStrategyConfig
  grossReturn?: number
  inflation?: number
  aowAgeFractional?: number
  assets?: Asset[]
  debts?: Debt[]
  box3Method?: Box3Method
  hasPartner?: boolean
  bankAccountCash?: number
  monthlySavingsOverride?: number | null
  baseAnnualSavingsFromCashflow?: number | null
  housingStrategy?: HousingStrategyConfig
  /** Pot-regels (profiles.pot_rules) — verdeling/onttrekkingsvolgorde. */
  potRules?: PotRulesConfig
  /**
   * Feature-flag: bouwt de input voor de v2-grootboek-engine. Alleen relevant
   * voor de eigen-huis-downsize: bij true blijft het huis als niet-liquide asset
   * in de pot en wordt de verkoop een `assetLiquidations`-entry (ADR 0015) i.p.v.
   * het huis te filteren + de verkoop als inkomen in te spuiten. Default false =
   * v1-model (byte-identiek).
   */
  horizonEngineV2?: boolean
}

export interface BuiltHorizonInput {
  input: UnifiedProjectionInput
  cashflows: SimCashflow[]
  effectiveLifeEvents: LifeEvent[]
  isPensioen: boolean
  aowAge: number
  aowAgeInt: number
  /** Uit de pot-regels afgeleide engine-opties (undefined = engine-defaults). */
  strategyOptions?: Partial<HorizonStrategyOptions>
}

/**
 * Vertaal pot-regels → engine-strategie-opties. Undefined wanneer de regels gelijk
 * zijn aan de defaults (engine gebruikt dan zijn eigen defaults — byte-identiek).
 */
function potRulesToStrategyOptions(config: PotRulesConfig | undefined): Partial<HorizonStrategyOptions> | undefined {
  if (!config) return undefined
  const isDefault =
    isDefaultGroupOrder(config.withdrawalOrderGroups) &&
    isDefaultGroupOrder(config.deficitOrderGroups) &&
    config.surplusGroup === 'beleggingen'
  if (isDefault) return undefined
  const opts: Partial<HorizonStrategyOptions> = {
    withdrawalOrder: expandGroupsToAssetTypes(config.withdrawalOrderGroups),
    deficitOrder: expandGroupsToAssetTypes(config.deficitOrderGroups),
  }
  if (config.surplusGroup === 'schuld_aflossen') {
    opts.surplus = 'aflossen-eerst'
  } else {
    opts.surplusTargetTypes = expandGroupsToAssetTypes([config.surplusGroup])
  }
  return opts
}

/**
 * Bepaal het downsize-verkoopmoment op het LIQUIDE-pad van de v2-grootboek-engine
 * (ADR 0015) — niet op de v1-meetrun. Meetrun = v2 met het huis IN de ledger en
 * ZONDER liquidatie; het eerste jaar waarin het liquide (niet-huis) vermogen de
 * verkoopkosten-buffer (+ optionele veiligheidsmarge) raakt, is het moment waarop
 * verkoop nodig is. Geen kruising vóór de config-cap → fallback op die cap.
 *
 * Retourneert óók een `SimulatedDepletionResult`-vormige uitleg (zelfde shape als
 * `lib/housing-trigger.ts`) zodat het v2-rent-event de "Waarom dit moment?"-panel
 * kan tonen (M1) — op v2's eigen liquide-pad, geen v1-meetrun.
 *
 * VALUATIE-BASIS (M4): zowel de verkoopopbrengst (in `engine.ts`) als de
 * verkoopkosten-buffer hier worden op DEZELFDE basis gemeten: de **engine-asset-
 * waarde** van het huis in het grootboek (`current_value × inclusion`, jaarlijks
 * gegroeid op het reële `expected_return`). Dat is precies wat de ledger werkelijk
 * aanhoudt en verkoopt — niet `projectEigenHuisValuesAt(...).wozValue` (dat groeit
 * NOMINAAL en valt terug op `woz_value`, dat van `current_value` kan afwijken).
 * Door de huiswaarde uit de meetrun-rij te lezen zijn buffer en opbrengst per
 * constructie consistent én beide reëel (de engine rekent volledig reëel; de
 * marge mag dus géén nominale `(1+inflatie)^jaar`-indexering krijgen).
 */
function resolveDownsizeTriggerV2(
  config: DownsizeConfig,
  context: HousingContext,
  baseInput: UnifiedProjectionInput,
  currentAge: number,
): { triggerAge: number; depletion: SimulatedDepletionResult } {
  const fallbackAge = Math.max(currentAge, config.triggerAge)
  const margeJaren = Number(config.depletionThresholdYears) || 0

  // Huiswaarde in het grootboek bij een gegeven rij = de som van de eind-waarden
  // van de eigen_huis-assets (reëel, current_value-gegroeid). Dit is de basis voor
  // zowel de verkoopkosten-buffer als de daadwerkelijke verkoopopbrengst.
  const ledgerHouseValueAt = (row: { assets: { type: string; eind: number }[] }): number =>
    row.assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.eind), 0)

  const baseDepletion = (over: Partial<SimulatedDepletionResult>): SimulatedDepletionResult => ({
    method: 'simulation',
    triggerAge: fallbackAge,
    reason: 'fallback',
    liquidAtTrigger: 0,
    bufferAtTrigger: 0,
    marginAtTrigger: 0,
    equityAtTrigger: 0,
    fireAgeUsed: baseInput.forcedFireAge ?? null,
    iterations: 1,
    converged: true,
    liquidPath: [],
    ...over,
  })

  if (config.trigger === 'fixed_age') {
    return { triggerAge: fallbackAge, depletion: baseDepletion({ triggerAge: fallbackAge, reason: 'fallback' }) }
  }

  let measure
  try {
    measure = runHorizonLedger(baseInput)
  } catch {
    return { triggerAge: fallbackAge, depletion: baseDepletion({}) }
  }

  // Liquide-pad voor de UI-uitleg (einde-jaar-waarden + drempel per jaar).
  const liquidPath: { age: number; liquid: number; buffer: number }[] = []
  let prevLiquid: number | null = null
  let crossing: {
    age: number
    prevLiquid: number
    buffer: number
    margin: number
    houseValue: number
  } | null = null

  for (const row of measure.rows) {
    if (row.leeftijd > fallbackAge) break
    const houseValue = ledgerHouseValueAt(row)
    const buffer = houseValue * config.salePricePct * config.salesCostsPct
    // Reële marge (vlak, géén nominale indexering — de engine is volledig reëel).
    const margin = margeJaren > 0 ? margeJaren * baseInput.yearlyExpenses : 0
    liquidPath.push({ age: row.leeftijd, liquid: row.liquideVermogen, buffer: buffer + margin })
    if (crossing === null && row.liquideVermogen - (buffer + margin) <= 1) {
      crossing = {
        age: row.leeftijd,
        prevLiquid: prevLiquid ?? row.liquideVermogen,
        buffer,
        margin,
        houseValue,
      }
    }
    prevLiquid = row.liquideVermogen
  }

  if (crossing) {
    const isImmediate = measure.rows.length > 0 && Math.abs(crossing.age - measure.rows[0].leeftijd) < 1e-6
    // Overwaarde = geprojecteerde huiswaarde (engine-basis) − afgelost hypotheeksaldo
    // op het verkoopjaar. Lees beide uit de meetrun-rij zodat ze op dezelfde basis liggen.
    const crossRow = measure.rows.find((r) => r.leeftijd === crossing!.age)
    const mortgageIds = new Set(context.eigenHuisMortgages.map((d) => d.id))
    const mortgageBalance = crossRow
      ? crossRow.schulden.filter((s) => mortgageIds.has(s.id)).reduce((sum, s) => sum + Math.max(0, s.eind), 0)
      : 0
    const equityAtTrigger = Math.max(0, crossing.houseValue - mortgageBalance)
    return {
      triggerAge: crossing.age,
      depletion: baseDepletion({
        triggerAge: crossing.age,
        reason: isImmediate ? 'immediate' : 'crossover',
        liquidAtTrigger: crossing.prevLiquid,
        bufferAtTrigger: crossing.buffer,
        marginAtTrigger: crossing.margin,
        equityAtTrigger,
        liquidPath,
      }),
    }
  }

  // Geen kruising vóór de cap → fallback op de config-cap.
  const atFallback = liquidPath.find((p) => p.age >= fallbackAge - 1e-6)
  return {
    triggerAge: fallbackAge,
    depletion: baseDepletion({
      triggerAge: fallbackAge,
      reason: 'fallback',
      liquidAtTrigger: atFallback?.liquid ?? prevLiquid ?? 0,
      liquidPath,
    }),
  }
}

/**
 * Bouw de v2-downsize-huisvestingsdelta: het rent-event (met `depletion`-uitleg
 * voor het "Waarom dit moment?"-panel) + de `assetLiquidations`-entry. Eén bron,
 * gebruikt door zowel `buildHorizonInput` (grafiek) als de modal-preview
 * (`runHousingScenarioProjectionV2`) — zodat preview en grafiek per constructie
 * hetzelfde verkoopmoment, dezelfde opbrengst en dezelfde uitleg tonen (M1/M2).
 */
function buildV2DownsizeHousing(
  downsizeCfg: DownsizeConfig,
  housingContext: HousingContext,
  baseSimInput: UnifiedProjectionInput,
  currentAge: number,
  simEndAge: number,
): { rentEvents: LifeEvent[]; assetLiquidations: AssetLiquidation[] | undefined; depletion: SimulatedDepletionResult; triggerAge: number } {
  const { triggerAge, depletion } = resolveDownsizeTriggerV2(downsizeCfg, housingContext, baseSimInput, currentAge)
  // Alleen de nieuwe-woonkosten (huur) als cashflow; de verkoopopbrengst én de
  // afgeloste hypotheek worden door de liquidatie in de engine afgehandeld
  // (anders dubbeltelling). Hergebruik `buildHousingLifeEventsAtAge` zodat de
  // huur-schatting + eenheid identiek zijn aan het v1-model. `extraMetadata`
  // draagt de `depletion`-uitleg + `triggerMode` zodat het rent-event de
  // "Waarom dit moment?"-panel toont (M1) — net als het v1-pad, maar op v2's
  // eigen liquide-pad (geen v1-meetrun).
  const rentEvents = buildHousingLifeEventsAtAge(downsizeCfg, housingContext, triggerAge, currentAge, simEndAge, {
    // Bij fixed_age géén depletion (net als v1): de panel-gate vereist
    // on_depletion. Bij on_depletion draagt depletion de volledige uitleg.
    depletion: downsizeCfg.trigger === 'on_depletion' ? depletion : null,
    triggerMode: downsizeCfg.trigger,
  })
    .map((ev) => ({
      ...ev,
      metadata: {
        ...((ev.metadata as Record<string, unknown> | null) ?? {}),
        cashflows: (((ev.metadata as { cashflows?: { id: string }[] } | null)?.cashflows) ?? []).filter((c) => c.id === 'new-rent'),
      },
    }))
    .filter((ev) => (((ev.metadata as { cashflows?: unknown[] }).cashflows)?.length ?? 0) > 0)
  // We verkopen het eerste eigen huis. Los alléén de hypotheken af die aan DÍT
  // huis gekoppeld zijn — bij één huis alle eigen-huis-hypotheken (sommige
  // hebben geen linked_asset_id), bij meerdere huizen strikt op linked_asset_id
  // (anders zou een hypotheek van een ánder, niet-verkocht huis op €0 gezet
  // worden zonder dat dat asset het grootboek verlaat → waarde uit het niets).
  const soldHouse = housingContext.eigenHuisAssets[0]
  const payoffMortgages = soldHouse == null
    ? []
    : housingContext.eigenHuisAssets.length <= 1
      ? housingContext.eigenHuisMortgages
      : housingContext.eigenHuisMortgages.filter(
          (d) => (d as unknown as { linked_asset_id?: string | null }).linked_asset_id === soldHouse.id,
        )
  const assetLiquidations: AssetLiquidation[] | undefined = soldHouse
    ? [{
        assetId: soldHouse.id,
        age: triggerAge,
        salePricePct: downsizeCfg.salePricePct,
        salesCostsPct: downsizeCfg.salesCostsPct,
        payoffDebtIds: payoffMortgages.map((d) => d.id),
      }]
    : undefined
  return { rentEvents, assetLiquidations, depletion, triggerAge }
}

export function buildHorizonInput(p: BuildHorizonInputParams): BuiltHorizonInput | null {
  if (!p.horizonInput) return null
  const { monthlyContributions, yearlyMustExpenses, dateOfBirth, monthlyIncome } = p.horizonInput

  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  if (currentAge === null) return null
  const yearlyExpenses = yearlyMustExpenses > 0 ? yearlyMustExpenses : 0
  if (yearlyExpenses <= 0) return null

  // annualSavings — prioriteit: override → cashflow-spaarquote → asset-aggregaat.
  const annualSavings =
    p.monthlySavingsOverride != null && p.monthlySavingsOverride >= 0
      ? p.monthlySavingsOverride * 12
      : p.baseAnnualSavingsFromCashflow != null && p.baseAnnualSavingsFromCashflow > 0
        ? p.baseAnnualSavingsFromCashflow
        : (monthlyContributions ?? 0) * 12
  const monthlySurplus = annualSavings / 12

  const grossReturn = p.grossReturn ?? DEFAULT_RETURN
  const inflationRate = p.inflation ?? INFLATION

  const strategyForSim = p.fireStrategy ?? DEFAULT_FIRE_STRATEGY
  const isPensioen = strategyForSim.strategy === 'pensioen'
  const aowAge = p.aowAgeFractional ?? NL_AOW_AGE
  const aowAgeInt = Math.ceil(aowAge)
  const effectiveStrategy = isPensioen
    ? { ...strategyForSim, endAge: Math.max(strategyForSim.endAge, aowAgeInt + 1) }
    : strategyForSim
  const simEndAge = effectiveStrategy.endAge
  const forcedFireAge = isPensioen ? aowAgeInt : undefined

  // Housing-strategie. Twee modellen:
  //  • v1 / niet-downsize: filter eigen_huis + gekoppelde hypotheek uit de pot en
  //    spuit de verkoop als events (inkomen) in — `resolveHousingEventsForSim`.
  //  • v2 + downsize (ADR 0015): houd het huis als niet-liquide asset IN het
  //    grootboek en verkoop het op de trigger via `assetLiquidations`. Netto
  //    vermogen blijft daardoor continu (alleen −verkoopkosten); alléén de
  //    liquiditeit verspringt. De trigger ligt op v2's eigen liquide-pad.
  const housingCfg = p.housingStrategy ?? DEFAULT_HOUSING_STRATEGY
  const housingContext = deriveHousingContext(p.assets ?? [], p.debts ?? [])
  const useV2Downsize = p.horizonEngineV2 === true && housingCfg.mode === 'downsize' && housingContext.hasEigenHuis

  const realEvents = (p.lifeEvents ?? []).filter((e) => !isHousingStrategyEvent(e))
  let effectiveAssets: Asset[]
  let effectiveDebts: Debt[]
  let effectiveLifeEvents: LifeEvent[] = p.lifeEvents ?? []
  let assetLiquidations: AssetLiquidation[] | undefined

  if (useV2Downsize) {
    // Huis + hypotheek blijven in het grootboek; verkoop = asset-liquidatie.
    effectiveAssets = p.assets ?? []
    effectiveDebts = p.debts ?? []
    const baseSimInput: UnifiedProjectionInput = {
      assets: effectiveAssets,
      debts: effectiveDebts,
      currentAge,
      endAge: simEndAge,
      yearlyExpenses,
      annualSavings,
      monthlySurplus,
      monthlyIncome: monthlyIncome ?? 0,
      incomeGrowthRate: 0,
      grossReturn,
      inflationRate,
      box3Method: p.box3Method ?? 'forfaitair',
      cashflows: lifeEventsToCashflows(realEvents),
      strategyConfig: effectiveStrategy,
      withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
      forcedFireAge,
      hasPartner: p.hasPartner ?? false,
      bankAccountCash: p.bankAccountCash ?? 0,
    }
    const downsizeCfg = housingCfg as DownsizeConfig
    const v2Housing = buildV2DownsizeHousing(downsizeCfg, housingContext, baseSimInput, currentAge, simEndAge)
    effectiveLifeEvents = [...realEvents, ...v2Housing.rentEvents]
    assetLiquidations = v2Housing.assetLiquidations
  } else {
    // v1 / niet-downsize: bestaand filter + inkomen-model (byte-identiek).
    const filtered = filterAssetsForFire(housingCfg, p.assets ?? [], p.debts ?? [])
    effectiveAssets = filtered.assets
    effectiveDebts = filtered.debts
    try {
      const { events: housingEvents } = resolveHousingEventsForSim(housingCfg, housingContext, {
        assets: p.assets ?? [],
        debts: p.debts ?? [],
        currentAge,
        endAge: simEndAge,
        yearlyExpenses,
        annualSavings,
        monthlyIncome: monthlyIncome ?? 0,
        grossReturn,
        inflationRate,
        box3Method: p.box3Method ?? 'forfaitair',
        cashflows: lifeEventsToCashflows(realEvents),
        strategyConfig: effectiveStrategy,
        withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
        forcedFireAge,
        hasPartner: p.hasPartner ?? false,
        bankAccountCash: p.bankAccountCash ?? 0,
      })
      effectiveLifeEvents = [...realEvents, ...housingEvents]
    } catch {
      // Degradatie: val terug op de meegegeven events.
    }
  }

  const cashflows = lifeEventsToCashflows(effectiveLifeEvents)

  const input: UnifiedProjectionInput = {
    assets: effectiveAssets,
    debts: effectiveDebts,
    currentAge,
    endAge: simEndAge,
    yearlyExpenses,
    annualSavings,
    monthlySurplus,
    monthlyIncome: monthlyIncome ?? 0,
    incomeGrowthRate: 0,
    grossReturn,
    inflationRate,
    box3Method: p.box3Method ?? 'forfaitair',
    cashflows,
    strategyConfig: effectiveStrategy,
    withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge,
    hasPartner: p.hasPartner ?? false,
    bankAccountCash: p.bankAccountCash ?? 0,
    assetLiquidations,
  }

  return {
    input,
    cashflows,
    effectiveLifeEvents,
    isPensioen,
    aowAge,
    aowAgeInt,
    strategyOptions: potRulesToStrategyOptions(p.potRules),
  }
}

/**
 * v2-variant van `runHousingScenarioProjection` (lib/housing-trigger.ts) voor de
 * Huis-strategie-modal-preview wanneer de gebruiker de v2-grootboek-engine draait
 * (M2). Doel: de preview rekent met EXACT dezelfde engine + huisvestingsmodel als
 * de grafiek, zodat de modal-copy "zelfde engine als de grafiek" klopt.
 *
 *  • downsize: het v2-asset-liquidatiemodel (ADR 0015) — huis blijft in het
 *    grootboek, verkoop = `assetLiquidations` op v2's eigen liquide-pad — via de
 *    gedeelde helper `buildV2DownsizeHousing`, daarna `runSelectedProjection(.., true)`.
 *  • include_full / exclude_from_fire / reverse_mortgage: v2 houdt (voorlopig) het
 *    v1-huisvestingsmodel; we bouwen de events via de gedeelde v1-resolver en
 *    draaien alléén de uiteindelijke projectie door de v2-engine.
 *
 * Geen import-cyclus: dit bestand importeert housing-trigger al; housing-trigger
 * importeert dit bestand niet. De keuze v1↔v2 valt in de component (UI-concern),
 * niet hier.
 */
export function runHousingScenarioProjectionV2(
  config: HousingStrategyConfig,
  context: HousingContext,
  sim: HousingTriggerSimBasis,
): HousingScenarioResult {
  const useV2Downsize = config.mode === 'downsize' && context.hasEigenHuis

  if (!useV2Downsize) {
    // Niet-downsize: bouw de events met het gedeelde v1-pad (filter + events),
    // maar draai de uiteindelijke projectie door de v2-engine zodat de getoonde
    // FIRE-leeftijd overeenkomt met de v2-grafiek.
    const { events, depletion } = resolveHousingEventsForSim(config, context, sim)
    const { assets, debts } = filterAssetsForFire(config, sim.assets, sim.debts)
    const input: UnifiedProjectionInput = {
      assets,
      debts,
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
      cashflows: [...sim.cashflows, ...lifeEventsToCashflows(events)],
      strategyConfig: sim.strategyConfig,
      withdrawalStrategy: sim.withdrawalStrategy,
      forcedFireAge: sim.forcedFireAge,
      hasPartner: sim.hasPartner,
      bankAccountCash: sim.bankAccountCash,
    }
    const result = runSelectedProjection(input, true)
    return { events, depletion, fireAgeFractional: result.fireAgeFractional, fireReachable: result.fireReachable }
  }

  // downsize → v2-asset-liquidatiemodel, exact zoals de grafiek (build-input).
  const baseSimInput: UnifiedProjectionInput = {
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
  const v2Housing = buildV2DownsizeHousing(config as DownsizeConfig, context, baseSimInput, sim.currentAge, sim.endAge)
  const input: UnifiedProjectionInput = {
    ...baseSimInput,
    cashflows: [...sim.cashflows, ...lifeEventsToCashflows(v2Housing.rentEvents)],
    assetLiquidations: v2Housing.assetLiquidations,
  }
  const result = runSelectedProjection(input, true)
  return {
    events: v2Housing.rentEvents,
    depletion: config.trigger === 'on_depletion' ? v2Housing.depletion : null,
    fireAgeFractional: result.fireAgeFractional,
    fireReachable: result.fireReachable,
  }
}
