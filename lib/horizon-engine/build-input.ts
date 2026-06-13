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
  projectEigenHuisValuesAt,
  estimateMonthlyHousingCostAfterSale,
  DEFAULT_HOUSING_STRATEGY,
  type HousingStrategyConfig,
  type HousingContext,
  type DownsizeConfig,
} from '@/lib/housing-strategy'
import { resolveHousingEventsForSim } from '@/lib/housing-trigger'
import { expandGroupsToAssetTypes, isDefaultGroupOrder, type PotRulesConfig } from '@/lib/pot-rules'
import { runHorizonLedger } from './engine'
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
 */
function resolveDownsizeTriggerV2(
  config: DownsizeConfig,
  context: HousingContext,
  baseInput: UnifiedProjectionInput,
  currentAge: number,
): number {
  const fallbackAge = Math.max(currentAge, config.triggerAge)
  if (config.trigger === 'fixed_age') return fallbackAge
  let measure
  try {
    measure = runHorizonLedger(baseInput)
  } catch {
    return fallbackAge
  }
  const margeJaren = Number(config.depletionThresholdYears) || 0
  for (const row of measure.rows) {
    if (row.leeftijd > fallbackAge) break
    const yearsFromNow = Math.max(0, row.leeftijd - currentAge)
    const woz = projectEigenHuisValuesAt(context.eigenHuisAssets, yearsFromNow * 12).wozValue
    const buffer = woz * config.salePricePct * config.salesCostsPct
    const margin = margeJaren > 0 ? margeJaren * baseInput.yearlyExpenses * Math.pow(1 + baseInput.inflationRate, yearsFromNow) : 0
    if (row.liquideVermogen - (buffer + margin) <= 1) return row.leeftijd
  }
  return fallbackAge
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
    const triggerAge = resolveDownsizeTriggerV2(downsizeCfg, housingContext, baseSimInput, currentAge)
    // Alleen de nieuwe-woonkosten (huur) als cashflow; de verkoopopbrengst én de
    // afgeloste hypotheek worden door de liquidatie in de engine afgehandeld
    // (anders dubbeltelling). Hergebruik `buildHousingLifeEventsAtAge` zodat de
    // huur-schatting + eenheid identiek zijn aan het v1-model.
    const rentEvents = buildHousingLifeEventsAtAge(downsizeCfg, housingContext, triggerAge, currentAge, simEndAge)
      .map((ev) => ({
        ...ev,
        metadata: {
          ...((ev.metadata as Record<string, unknown> | null) ?? {}),
          cashflows: (((ev.metadata as { cashflows?: { id: string }[] } | null)?.cashflows) ?? []).filter((c) => c.id === 'new-rent'),
        },
      }))
      .filter((ev) => (((ev.metadata as { cashflows?: unknown[] }).cashflows)?.length ?? 0) > 0)
    effectiveLifeEvents = [...realEvents, ...rentEvents]
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
    assetLiquidations = soldHouse
      ? [{
          assetId: soldHouse.id,
          age: triggerAge,
          salePricePct: downsizeCfg.salePricePct,
          salesCostsPct: downsizeCfg.salesCostsPct,
          payoffDebtIds: payoffMortgages.map((d) => d.id),
        }]
      : undefined
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
