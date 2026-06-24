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
import { NL_AOW_AGE, SALES_COSTS_BY_TYPE, DEFAULT_SALES_COSTS_PCT } from '@/lib/constants'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { type FireStrategyConfig, DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'
import { type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { UnifiedProjectionInput, AssetLiquidation, ReverseMortgagePlan } from '@/lib/unified-projection'
import type { Asset, AssetType } from '@/lib/asset-data'
import { parseSaleConfig } from '@/lib/sale-config'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import {
  filterAssetsForFire,
  deriveHousingContext,
  isHousingStrategyEvent,
  buildHousingLifeEventsAtAge,
  reverseMortgageBorrowable,
  resolveTriggerAge,
  DEFAULT_HOUSING_STRATEGY,
  type HousingStrategyConfig,
  type HousingContext,
  type DownsizeConfig,
  type ReverseMortgageConfig,
} from '@/lib/housing-strategy'
import {
  resolveHousingEventsForSim,
  type SimulatedDepletionResult,
  type HousingTriggerSimBasis,
  type HousingScenarioResult,
} from '@/lib/housing-trigger'
import { expandGroupsToAssetTypes, expandSingleGroupToAssetTypes, isDefaultGroupOrder, type PotRulesConfig } from '@/lib/pot-rules'
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
  /**
   * True wanneer de woning in deze projectie NOOIT verkocht wordt terwijl de
   * gebruiker downsize + `on_depletion` heeft ingesteld: het liquide vermogen
   * raakt de verkoopkosten-buffer nooit (`depletion.reason === 'no_sale'`),
   * dus de trigger vuurt niet en het huis blijft als niet-liquide asset in het
   * grootboek doorgroeien tot eindleeftijd. Alleen mogelijk in de v2-downsize-
   * tak (ADR 0015); in alle andere takken `false`. Voedt de "huis wordt nooit
   * verkocht"-melding op /toekomst (beschrijvend, geen advies).
   */
  housingHeldToEnd: boolean
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
    // Surplus-DOEL = exclusief de gekozen pot (bv. spaargeld → cash/savings),
    // NIET de volledige 10-type-waterfall. `expandGroupsToAssetTypes` vult de
    // overige groepen aan (juist voor een onttrekkings-volgorde, fout voor een
    // bestemming) → dat liet overschot/liquidatie-opbrengst pro-rata over álle
    // potten lopen i.p.v. naar de voorkeurspot. Zie expandSingleGroupToAssetTypes.
    opts.surplusTargetTypes = expandSingleGroupToAssetTypes(config.surplusGroup)
  }
  return opts
}

/**
 * Bepaal het downsize-verkoopmoment op het LIQUIDE-pad van de v2-grootboek-engine
 * (ADR 0015/0030) — niet op de v1-meetrun. Meetrun = v2 met het huis IN de ledger,
 * ZONDER liquidatie maar MÉT de woning als spendable (Optie B): zo beleeft de meetrun
 * EXACT dezelfde FIRE-leeftijd, stop-werk-leeftijd en afbouw-dynamiek als de getoonde
 * grafiek. Het eerste jaar waarin de RAUW besteedbare pot (`besteedbaarVermogen` =
 * `withdrawableLiquidValue`, ex de spendable+saleManaged woning) de verkoopkosten-
 * buffer (+ optionele veiligheidsmarge) raakt, is het moment waarop verkoop nodig is.
 * Geen kruising vóór de config-cap → fallback op die cap.
 *
 * ADR 0030 (Optie B): vóór deze fix scande de meetrun `liquideVermogen` ZÓNDER
 * spendable (ex-huis-eligibility op een ándere run dan de getoonde) → de trigger
 * vuurde jaren te laat omdat de getoonde run (mét spendable) de annuïteit op de hele
 * woning-inclusieve pot spreidde en de cash stil leeg liet lopen. Nu draait de meetrun
 * op exact dezelfde grondslag als de grafiek en meet hij de pot die de afbouw werkelijk
 * opneemt → de verkoop vuurt op de leeftijd waarop de getoonde besteedbare daling de
 * buffer raakt. De woning telt mee voor eligibility (spendable) maar verlaat de pot
 * enkel via de verkoop, dus zit per definitie niet in `besteedbaarVermogen` (ex-huis).
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
    reason: 'no_sale',
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

  // fixed_age: het huis wordt sowieso verkocht op de gekozen leeftijd — dit is
  // GEEN depletie-trigger. `reason: 'no_sale'` is hier louter een placeholder
  // (het rent-event krijgt bij fixed_age geen depletion-uitleg; zie
  // `buildV2DownsizeHousing`). De verkoop zelf gebeurt onvoorwaardelijk.
  if (config.trigger === 'fixed_age') {
    return { triggerAge: fallbackAge, depletion: baseDepletion({ triggerAge: fallbackAge, reason: 'no_sale' }) }
  }

  // ADR 0030 (Optie B): de meetrun markeert het huis als saleManaged via een
  // synthetische verkoop op `endAge + 1` — STRIKT BUITEN de scan-horizon (die tot
  // endAge loopt) — zodat de verkoop binnen de scan NOOIT werkelijk vuurt, maar het
  // huis over de HELE horizon als saleManaged geldt. Bewust NIET op `fallbackAge`
  // (= config.triggerAge, [50,95], default 67): die ligt ONDER endAge, dus dan zou de
  // synthetische verkoop wél binnen de horizon vuren, de opbrengst in
  // `besteedbaarVermogen` injecteren en de scan de echte ex-huis-depletie missen
  // (trigger jaren te laat → dip→crash terug). Effect van endAge+1: het huis is
  // wél spendable (telt mee in de FIRE-eligibility/opbouw, baseInput.spendableAssetIds)
  // maar NIET rauw onttrekbaar (saleManaged → `mayBeRawWithdrawn` = false) → het zit
  // de hele horizon NIET in `besteedbaarVermogen` en de afbouw-annuïteit teert op de
  // ex-huis cash — EXACT de pre-sale dynamiek van de getoonde run. Zo meet de scan de
  // leeftijd waarop de ECHTE besteedbare (ex-huis) pot de verkoopkosten-buffer raakt,
  // ongeacht de door de gebruiker gekozen `config.triggerAge`/`fallbackAge`. Zónder
  // deze saleManaged-markering zou het huis (spendable, niet-saleManaged) wél rauw
  // onttrekbaar zijn → besteedbaarVermogen incl. huis → de scan kruist pas op endAge.
  const soldHouse = context.eigenHuisAssets[0]
  const measureLiquidations = soldHouse
    ? [
        ...(baseInput.assetLiquidations ?? []),
        {
          assetId: soldHouse.id,
          // STRIKT buiten de scan-horizon (endAge) — zie docstring/ADR 0030: deze
          // synthetische verkoop mag binnen de scan NOOIT werkelijk vuren, ze markeert
          // het huis enkel over de hele horizon als saleManaged (→ ex `besteedbaarVermogen`).
          age: baseInput.endAge + 1,
          trigger: 'fixed_age' as const,
          salePricePct: config.salePricePct,
          salesCostsPct: config.salesCostsPct,
          payoffDebtIds: context.eigenHuisMortgages.map((d) => d.id),
        },
      ]
    : baseInput.assetLiquidations

  let measure
  try {
    measure = runHorizonLedger({ ...baseInput, assetLiquidations: measureLiquidations })
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

  // Scan de VOLLEDIGE horizon (alle measure-rows tot endAge) — NIET tot
  // `fallbackAge` (= config.triggerAge). De eerste kruising, waar hij ook valt,
  // is het verkoopmoment (ADR 0012/0015). `config.triggerAge` is uitsluitend
  // het plafond voor het never-deplete-geval en mag de scan niet afkappen.
  for (const row of measure.rows) {
    const houseValue = ledgerHouseValueAt(row)
    const buffer = houseValue * config.salePricePct * config.salesCostsPct
    // Reële marge (vlak, géén nominale indexering — de engine is volledig reëel).
    const margin = margeJaren > 0 ? margeJaren * baseInput.yearlyExpenses : 0
    // ADR 0030 (Optie B): scan de RAUW besteedbare pot (`besteedbaarVermogen`) — de
    // pot die de afbouw werkelijk opneemt, ex de spendable+saleManaged woning. De
    // meetrun draait mét spendable (zelfde FIRE-leeftijd/afbouw als de getoonde run),
    // dus deze pot is exact de getoonde besteedbare daling. Vóór ADR 0030 scande dit
    // `liquideVermogen` op een ex-huis-meetrun (geen spendable) → een ándere afbouw-
    // dynamiek dan de getoonde run → de trigger vuurde jaren te laat. Nu vuurt hij op
    // de leeftijd waarop de getoonde besteedbare pot de verkoopkosten-buffer raakt.
    const besteedbaar = row.besteedbaarVermogen
    liquidPath.push({ age: row.leeftijd, liquid: besteedbaar, buffer: buffer + margin })
    if (crossing === null && besteedbaar - (buffer + margin) <= 1) {
      crossing = {
        age: row.leeftijd,
        prevLiquid: prevLiquid ?? besteedbaar,
        buffer,
        margin,
        houseValue,
      }
    }
    prevLiquid = besteedbaar
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

  // Geen kruising binnen de VOLLEDIGE horizon → verkoop is niet nodig
  // ('no_sale'). Geen force-sale op het plafond: het huis blijft in het
  // grootboek en groeit door tot endAge (groter eindvermogen). De
  // orkestratie (`buildV2DownsizeHousing`) emit hierop GEEN liquidatie en
  // GEEN huur-event. We rapporteren het plafond als `triggerAge` louter voor
  // evt. UI-uitleg.
  const atFallback = liquidPath.find((p) => p.age >= fallbackAge - 1e-6)
  return {
    triggerAge: fallbackAge,
    depletion: baseDepletion({
      triggerAge: fallbackAge,
      reason: 'no_sale',
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

  // Never-deplete (alleen relevant bij on_depletion): het liquide pad raakt de
  // verkoopkosten-buffer nooit binnen de horizon → verkoop is NIET nodig. Geen
  // liquidatie en geen huur-event: het huis blijft als niet-liquide asset in
  // het grootboek en groeit door tot endAge. Geen marker, geen "Waarom dit
  // moment?"-panel (er is immers geen event). Bij fixed_age wordt het huis wél
  // onvoorwaardelijk verkocht — die tak valt hier dus nooit door.
  if (downsizeCfg.trigger === 'on_depletion' && depletion.reason === 'no_sale') {
    return { rentEvents: [], assetLiquidations: undefined, depletion, triggerAge }
  }

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

/**
 * Bouw de v2-opeethypotheek-delta (ADR 0029): het `ReverseMortgagePlan` voor de engine
 * + de FIRE-eligibility-bijdrage (`collateralBorrowableById`). GEEN life-event en GEEN
 * `assetLiquidations` — het huis blijft `eigen_huis`-asset in de ledger, de engine
 * opent op de trigger een synthetische opeetschuld.
 *
 * Trigger-leeftijd: fixed_age → config-leeftijd; on_depletion → het versimpelde
 * 1D-resolverpad (`resolveTriggerAge`) als fallback-plafond. Het on_depletion-gedrag
 * is in het grootboek bovendien intrinsiek tekort-gedreven (de engine leent pas bij
 * een echt liquiditeitstekort ná de trigger), dus de exacte trigger-leeftijd doet er
 * voor on_depletion minder toe dan bij downsize.
 *
 * Eligibility-bijdrage = leen-RUIMTE op de huidige overwaarde = overwaarde_nu ×
 * maxLoanPct (consume: `reverseMortgageBorrowable`). Dit is een START-pot-grootheid
 * (zoals `liquidSumStart` de current asset-waarden gebruikt) die de FIRE-gate-V_nodig
 * voedt; de engine berekent de cap per jaar zélf op de meegroeiende overwaarde.
 */
function buildV2ReverseMortgageHousing(
  config: ReverseMortgageConfig,
  context: HousingContext,
  currentAge: number,
  currentLiquidPortfolio: number,
  yearlyExpenses: number,
): { reverseMortgage: ReverseMortgagePlan; collateralBorrowableById: Record<string, number> } {
  const triggerAge = resolveTriggerAge(
    config.trigger,
    config.triggerAge,
    config.depletionThresholdYears,
    currentAge,
    yearlyExpenses,
    currentLiquidPortfolio,
  )
  const houseAsset = context.eigenHuisAssets[0]
  const mortgageDebtIds = context.eigenHuisMortgages.map((d) => d.id)

  // FIRE-eligibility-bijdrage op de huidige overwaarde (start-pot grondslag). De
  // engine herberekent de jaar-cap zelf op de meegroeiende overwaarde.
  const overwaardeNu = Math.max(0, context.eigenHuisValue - context.mortgageBalance)
  const borrowableNu = reverseMortgageBorrowable(overwaardeNu, config.maxLoanPct)

  return {
    reverseMortgage: {
      houseAssetId: houseAsset?.id ?? '',
      triggerAge,
      interestRate: config.interestRate,
      maxLoanPct: config.maxLoanPct,
      monthlyPayout: config.monthlyPayout,
      mortgageDebtIds,
    },
    collateralBorrowableById: houseAsset ? { [houseAsset.id]: borrowableNu } : {},
  }
}

/**
 * Niet-liquide asset-types die via een verkoop-life-event binnen het v2-grootboek
 * geliquideerd kunnen worden (ADR 0015, generiek). Bewust GEEN `eigen_huis`: dat
 * loopt via het downsize-pad (`buildV2DownsizeHousing`) met zijn eigen trigger +
 * gebruiker-instelbare verkoopkosten. Liquide types (cash/savings/investment/
 * retirement/crypto) zijn nooit in scope — die worden direct als liquide pot
 * besteed; ze "verkopen" voegt niets toe.
 *
 * `levensverzekering` en `vordering` staan hier bewust NIET in: het zijn liquide-
 * achtige uitkeringen/vorderingen die als geldstroom binnenkomen (een life event
 * met monthly_income_change/one_time inkomen), niet als een te liquideren
 * niet-liquide bezit. Toevoegen zou hen ten onrechte als asset-verkoop modelleren.
 */
const LIQUIDATABLE_NON_LIQUID: Set<AssetType> = new Set([
  'vehicle',
  'physical',
  'other',
  'deelneming',
  'real_estate',
])

/**
 * Voeg de (optionele) huis-downsize-liquidatie samen met de generieke verkoop-
 * liquidaties tot één `AssetLiquidation[]`. Lege uitkomst → undefined (zodat het
 * veld weg blijft als er niets te liquideren valt — bestaande callers/tests
 * verwachten undefined i.p.v. een lege array bij geen huis-downsize).
 */
function mergeLiquidations(
  housing: AssetLiquidation[] | undefined,
  generic: AssetLiquidation[],
): AssetLiquidation[] | undefined {
  const merged = [...(housing ?? []), ...generic]
  return merged.length > 0 ? merged : undefined
}

/**
 * Bouw de generieke (niet-eigen_huis) asset-liquidaties uit de **`sale_config` per
 * asset** — de ENIGE bron voor het of/wanneer van een niet-liquide verkoop (ADR
 * 0020). Iedere actieve, niet-liquide (`LIQUIDATABLE_NON_LIQUID`), niet-`eigen_huis`
 * asset met waarde > 0 wordt geëvalueerd:
 *   • `niet_verkopen`  → geen entry (asset blijft staan).
 *   • `vast_moment`    → `fixed_age`-`AssetLiquidation` op de leeftijd (of datum →
 *                        `ageAtDate`); verleden = stille skip.
 *   • `wanneer_nodig`  → `on_demand`-`AssetLiquidation` (geen vaste leeftijd; de
 *                        engine verkoopt bij liquiditeitstekort). Optioneel
 *                        `triggerAge` = fallback-plafond; ontbreekt het → géén
 *                        plafond (`Number.POSITIVE_INFINITY`).
 *
 * RESOLVE-TIME DEFAULT: een asset zónder (geldige) `sale_config` valt via
 * `parseSaleConfig` terug op `wanneer_nodig` (geen backfill). Alleen een expliciete
 * `niet_verkopen` zet verkoop uit.
 *
 * SSoT — `sale_config` PREVALEERT boven `linked_asset_id`: de oude life-event-driver
 * is geen bron meer. We lezen wél nog `metadata.verkoopprijs`/`verkoopkostenPct`/
 * `payoffDebtIds` van een eventueel gekoppeld verkoop-event (via `linked_asset_id`)
 * als KALIBRATIE/aanvulling, en onderdrukken dan diens eenmalige opbrengst-cashflow
 * (`handledEventIds`) om dubbeltelling te voorkomen. De maandelijkse gevolgen
 * (bv. wegvallend onderhoud) van zo'n event blijven bewust bestaan.
 *
 * Opbrengst wordt op de ECHTE engine-asset-waarde op het verkoopjaar berekend
 * ("consume don't recompute"); `salePricePct` schaalt alleen de prijs-fractie.
 */
function buildGenericAssetLiquidations(
  events: LifeEvent[],
  assets: Asset[],
  currentAge: number,
  dateOfBirth: string | null,
): { liquidations: AssetLiquidation[]; handledEventIds: Set<string> } {
  const liquidations: AssetLiquidation[] = []
  const handledEventIds = new Set<string>()

  // Verkoop-events gekoppeld aan een asset (voor optionele kalibratie + onderdrukking
  // van hun opbrengst-cashflow). Eén event per asset volstaat (eerste actieve).
  //
  // AANNAME (M2): een `linked_asset_id` op een life_event betekent UITSLUITEND een
  // verkoop-/liquidatie-koppeling. We filteren bewust NIET op `event_type`: de
  // verkoop-events dragen vandaag het generieke type `'custom'` (er bestaat geen
  // dedicated `'verkoop'`-type — zie test-personas "Stacaravan verkopen" +
  // migratie 20260616020000), dus een type-filter zou óf niets afvangen óf legitieme
  // verkopen wegfilteren. De DB-kolom (`life_events.linked_asset_id`, ON DELETE SET
  // NULL) en het `LifeEvent`-type documenteren dezelfde betekenis. Krijgt een ander
  // event-type later óók een `linked_asset_id` met andere semantiek, dan moet hier
  // alsnog een expliciet type-filter komen.
  const eventByAssetId = new Map<string, LifeEvent>()
  for (const ev of events) {
    if (!ev.is_active || !ev.linked_asset_id) continue
    if (!eventByAssetId.has(ev.linked_asset_id)) eventByAssetId.set(ev.linked_asset_id, ev)
  }

  for (const asset of assets) {
    if (asset.is_active === false) continue
    // eigen_huis loopt via het downsize-pad; liquide types zijn niet in scope.
    if (asset.asset_type === 'eigen_huis') continue
    if (!LIQUIDATABLE_NON_LIQUID.has(asset.asset_type)) continue
    // Waardeloos/negatief asset → niets te verkopen (stille skip).
    const currentValue = Number(asset.current_value ?? 0)
    if (!Number.isFinite(currentValue) || currentValue <= 0) continue

    const cfg = parseSaleConfig((asset as { sale_config?: unknown }).sale_config)
    if (cfg.stand === 'niet_verkopen') {
      // M1: asset blijft staan (geen liquidatie), MAAR onderdruk wél de eenmalige
      // opbrengst van een eventueel gekoppeld verkoop-event. Anders zou die
      // opbrengst-cashflow (one_time_cost < 0 of metadata.cashflows-income) als
      // "geld uit het niets" binnenstromen terwijl het asset nooit verkocht wordt.
      // De maandelijkse gevolgen (bv. wegvallend onderhoud) blijven via
      // lifeEventsToCashflows bestaan; alleen de opbrengst-portie vervalt.
      const nietVerkopenEvent = eventByAssetId.get(asset.id)
      if (nietVerkopenEvent) handledEventIds.add(nietVerkopenEvent.id)
      continue
    }

    // Optioneel gekoppeld verkoop-event: kalibratie + opbrengst-onderdrukking.
    const linkedEvent = eventByAssetId.get(asset.id)
    const meta = (linkedEvent?.metadata ?? {}) as Record<string, unknown>

    // salePricePct = verkoopprijs / huidige waarde, geclampt op [0, 2]; ontbrekend
    // → 1.0 (verkoop tegen de geprojecteerde marktwaarde zelf).
    const verkoopprijs = Number(meta.verkoopprijs ?? 0)
    const salePricePct =
      Number.isFinite(verkoopprijs) && verkoopprijs > 0
        ? Math.min(2, Math.max(0, verkoopprijs / currentValue))
        : 1.0

    // Verkoopkosten: sale_config-override > per-event override > type-default > fallback.
    // Alle overrides al gevalideerd op [0, 0.20] (parseSaleConfig / hieronder).
    const eventOverridePct = Number(meta.verkoopkostenPct)
    const eventCosts =
      Number.isFinite(eventOverridePct) && eventOverridePct >= 0 && eventOverridePct <= 0.2
        ? eventOverridePct
        : undefined
    const salesCostsPct =
      cfg.salesCostsPct ?? eventCosts ?? SALES_COSTS_BY_TYPE[asset.asset_type] ?? DEFAULT_SALES_COSTS_PCT

    // payoffDebtIds: sale_config > event-metadata.
    const rawEventPayoff = meta.payoffDebtIds
    const eventPayoff = Array.isArray(rawEventPayoff)
      ? rawEventPayoff.filter((d): d is string => typeof d === 'string')
      : []
    const payoffDebtIds = cfg.payoffDebtIds ?? eventPayoff

    if (cfg.stand === 'vast_moment') {
      // Vaste leeftijd: primair triggerAge; anders triggerDate → ageAtDate.
      let age: number | null = cfg.triggerAge ?? null
      if ((age === null) && cfg.triggerDate && dateOfBirth) {
        const derived = ageAtDate(dateOfBirth, new Date(cfg.triggerDate))
        if (Number.isFinite(derived)) age = derived
      }
      if (age === null || !Number.isFinite(age)) continue
      // Verleden-verkoop overslaan (consistent met de huis-trigger).
      if (age < currentAge) continue
      liquidations.push({ assetId: asset.id, age, trigger: 'fixed_age', salePricePct, salesCostsPct, payoffDebtIds })
      if (linkedEvent) handledEventIds.add(linkedEvent.id)
      continue
    }

    // wanneer_nodig (incl. resolve-time default): on_demand. `triggerAge` = optioneel
    // fallback-plafond; ontbreekt het → geen plafond.
    const plafond = cfg.triggerAge != null && Number.isFinite(cfg.triggerAge)
      ? cfg.triggerAge
      : Number.POSITIVE_INFINITY
    liquidations.push({ assetId: asset.id, age: plafond, trigger: 'on_demand', salePricePct, salesCostsPct, payoffDebtIds })
    if (linkedEvent) handledEventIds.add(linkedEvent.id)
  }

  return { liquidations, handledEventIds }
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
  const useV2 = p.horizonEngineV2 === true
  const useV2Downsize = useV2 && housingCfg.mode === 'downsize' && housingContext.hasEigenHuis
  // ADR 0029: reverse_mortgage echt in het grootboek (alleen onder v2 met een eigen
  // huis). Het huis blijft `eigen_huis`-asset (niet gefilterd, niet spendable); de
  // engine opent op de trigger een synthetische opeetschuld. Geen V1-payout-life-event.
  const useV2ReverseMortgage =
    useV2 && housingCfg.mode === 'reverse_mortgage' && housingContext.hasEigenHuis
  // Pot-regels → engine-opties: één keer afleiden zodat de housing-meetrun
  // (v1-tak hieronder, voor reverse_mortgage onder v2) op DEZELFDE verdeling-/
  // onttrekkingsvolgorde rekent als de getoonde grafiekrun. undefined = defaults.
  const strategyOptions = potRulesToStrategyOptions(p.potRules)

  const realEvents = (p.lifeEvents ?? []).filter((e) => !isHousingStrategyEvent(e))
  let effectiveAssets: Asset[]
  let effectiveDebts: Debt[]
  let effectiveLifeEvents: LifeEvent[] = p.lifeEvents ?? []
  let assetLiquidations: AssetLiquidation[] | undefined
  // Opeethypotheek-plan + eligibility-bijdrage (ADR 0029) — alleen gezet in de
  // useV2ReverseMortgage-tak.
  let reverseMortgage: ReverseMortgagePlan | undefined
  let collateralBorrowableById: Record<string, number> | undefined
  // Wordt true wanneer downsize + on_depletion nooit triggert (huis blijft staan).
  let housingHeldToEnd = false

  // Generieke (niet-eigen_huis) asset-liquidaties uit verkoop-life-events (ADR
  // 0015, generiek) — alléén onder v2 (v1 negeert assetLiquidations). Eén bron;
  // `genericHandledEventIds` onderdrukt de opbrengst-cashflows van deze events in
  // ELKE lifeEventsToCashflows-aanroep (meetruns + de getoonde grafiekrun) zodat
  // de verkoop niet dubbel telt — de maandelijkse gevolgen (bv. wegvallend
  // onderhoud) blijven wél. Zie `buildGenericAssetLiquidations`.
  const genericLiq = useV2
    ? buildGenericAssetLiquidations(realEvents, p.assets ?? [], currentAge, dateOfBirth)
    : { liquidations: [], handledEventIds: new Set<string>() }
  const genericHandledEventIds = genericLiq.handledEventIds
  const skipIds = genericHandledEventIds.size > 0 ? genericHandledEventIds : undefined

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
      cashflows: lifeEventsToCashflows(realEvents, skipIds),
      strategyConfig: effectiveStrategy,
      withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
      forcedFireAge,
      hasPartner: p.hasPartner ?? false,
      bankAccountCash: p.bankAccountCash ?? 0,
      // M1 (review): de downsize-trigger-meetrun (buildV2DownsizeHousing →
      // resolveDownsizeTriggerV2) moet DEZELFDE liquide opbrengsten zien als de
      // getoonde grafiek. Anders mist de meetrun de cash van een generieke verkoop
      // (bv. stacaravan) en kan de huis-verkoop-trigger iets te vroeg vuren t.o.v.
      // de grafiek. genericLiq is hier al berekend; het huis zit nog NIET in deze
      // lijst (dat is juist wat de meetrun bepaalt). Verandert alleen trigger-
      // timing-accuratesse, niet het huis-model zelf.
      assetLiquidations: genericLiq.liquidations.length > 0 ? genericLiq.liquidations : undefined,
      // ADR 0030 (Optie B): de trigger-meetrun draait nu mét de woning als spendable —
      // EXACT de FIRE-eligibility-grondslag van de getoonde grafiek — zodat de meetrun
      // dezelfde FIRE-leeftijd, dezelfde stop-werk-leeftijd en dezelfde afbouw-dynamiek
      // beleeft. De trigger scant vervolgens `besteedbaarVermogen` (de RAUW besteedbare
      // pot, ex de spendable+saleManaged woning), zodat hij vuurt op de leeftijd waarop
      // de ECHTE besteedbare daling van de getoonde run de verkoopkosten-buffer raakt —
      // niet jaren later op een ex-huis-meetrun die de getoonde run niet beleeft. De
      // woning telt mee voor eligibility maar verlaat de pot enkel via de verkoop, dus
      // ze zit per definitie NIET in `besteedbaarVermogen` (ex-huis blijft ex-huis).
      spendableAssetIds: housingContext.hasEigenHuis
        ? housingContext.eigenHuisAssets.map((a) => a.id)
        : undefined,
    }
    const downsizeCfg = housingCfg as DownsizeConfig
    const v2Housing = buildV2DownsizeHousing(downsizeCfg, housingContext, baseSimInput, currentAge, simEndAge)
    effectiveLifeEvents = [...realEvents, ...v2Housing.rentEvents]
    // Merge huis-downsize-liquidatie + generieke verkoop-liquidaties (één array).
    assetLiquidations = mergeLiquidations(v2Housing.assetLiquidations, genericLiq.liquidations)
    // Huis nooit verkocht: on_depletion-trigger vuurde niet (liquide vermogen
    // raakte de verkoopkosten-buffer nooit) → geen liquidatie, huis groeit door.
    housingHeldToEnd =
      downsizeCfg.trigger === 'on_depletion' &&
      v2Housing.depletion.reason === 'no_sale' &&
      v2Housing.assetLiquidations === undefined
  } else if (useV2ReverseMortgage) {
    // ADR 0029: opeethypotheek echt in het grootboek. Huis + hypotheek blijven in de
    // pot (geen filter, geen V1-payout-life-event); de engine opent op de trigger een
    // synthetische opeetschuld en leent tegen de overwaarde (gecapt op maxLoanPct).
    effectiveAssets = p.assets ?? []
    effectiveDebts = p.debts ?? []
    effectiveLifeEvents = realEvents
    const rmCfg = housingCfg as ReverseMortgageConfig
    const v2Rm = buildV2ReverseMortgageHousing(
      rmCfg,
      housingContext,
      currentAge,
      // Liquide-portfolio-benadering voor de on_depletion-fallback-trigger: alleen
      // gebruikt door resolveTriggerAge bij on_depletion (fixed_age negeert het).
      Math.max(0, (p.bankAccountCash ?? 0)),
      yearlyExpenses,
    )
    reverseMortgage = v2Rm.reverseMortgage
    collateralBorrowableById = v2Rm.collateralBorrowableById
    // Generieke verkoop-liquidaties (bv. stacaravan) gelden ook hier.
    assetLiquidations = mergeLiquidations(undefined, genericLiq.liquidations)
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
        cashflows: lifeEventsToCashflows(realEvents, skipIds),
        strategyConfig: effectiveStrategy,
        withdrawalStrategy: p.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
        forcedFireAge,
        hasPartner: p.hasPartner ?? false,
        bankAccountCash: p.bankAccountCash ?? 0,
      }, useV2, strategyOptions)
      effectiveLifeEvents = [...realEvents, ...housingEvents]
    } catch {
      // Degradatie: val terug op de meegegeven events.
    }
    // Generieke verkoop-liquidaties gelden ook zónder huis-downsize (v2). v1
    // negeert assetLiquidations volledig, dus dit raakt het v1-pad niet (genericLiq
    // is daar leeg). De geliquideerde assets worden NIET uit de pot gefilterd —
    // ze blijven in het grootboek en verlaten het op de verkoop (engine-block 6b).
    assetLiquidations = mergeLiquidations(undefined, genericLiq.liquidations)
  }

  const cashflows = lifeEventsToCashflows(effectiveLifeEvents, skipIds)

  // De woning telt mee als besteedbaar FIRE-vermogen (`spendable`) in TWEE modi:
  //  • include_full (ADR 0015, Optie A): de woning telt volledig mee zodat een
  //    deplete/spend-down 'm óók afbouwt (laatst in de volgorde) en de lijn richting
  //    €0 loopt, i.p.v. dat de niet-liquide woning onbespeelbaar blijft groeien.
  //  • v2-downsize "Verkopen" (ADR 0028, Fase 2): de woning telt mee tijdens de
  //    OPBOUW (tilt FIRE-eligibility → vervroegt FIRE) maar verlaat de pot UITSLUITEND
  //    via de downsize-verkoop (de assetLiquidations-entry maakt 'm óók saleManaged;
  //    spendable + saleManaged samen — nooit rauw onttrokken). Zie engine.ts
  //    countsAsEligibilityLiquid/mayBeRawWithdrawn.
  // v1 negeert dit veld (eigen huis-handling daar).
  const spendableAssetIds =
    (housingCfg.mode === 'include_full' || useV2Downsize) && housingContext.hasEigenHuis
      ? housingContext.eigenHuisAssets.map((a) => a.id)
      : undefined

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
    spendableAssetIds,
    reverseMortgage,
    collateralBorrowableById,
  }

  return {
    input,
    cashflows,
    effectiveLifeEvents,
    isPensioen,
    aowAge,
    aowAgeInt,
    strategyOptions,
    housingHeldToEnd,
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
 *  • reverse_mortgage (ADR 0029): het v2-opeethypotheek-grootboekmodel — huis blijft
 *    in de pot, synthetische opeetschuld via `buildV2ReverseMortgageHousing`, geen
 *    V1-payout-life-event.
 *  • include_full / exclude_from_fire: v2 houdt het v1-huisvestingsmodel; we bouwen
 *    de events via de gedeelde v1-resolver en draaien alléén de uiteindelijke
 *    projectie door de v2-engine.
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
  const useV2ReverseMortgage = config.mode === 'reverse_mortgage' && context.hasEigenHuis

  if (useV2ReverseMortgage) {
    // ADR 0029: opeethypotheek in het grootboek — exact zoals de grafiek (build-input).
    const v2Rm = buildV2ReverseMortgageHousing(
      config as ReverseMortgageConfig,
      context,
      sim.currentAge,
      Math.max(0, sim.bankAccountCash ?? 0),
      sim.yearlyExpenses,
    )
    const input: UnifiedProjectionInput = {
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
      reverseMortgage: v2Rm.reverseMortgage,
      collateralBorrowableById: v2Rm.collateralBorrowableById,
    }
    const result = runSelectedProjection(input, true)
    // Geen housing-life-event (de opeetschuld zit in het grootboek) en geen depletion-panel.
    return { events: [], depletion: null, fireAgeFractional: result.fireAgeFractional, fireReachable: result.fireReachable }
  }

  if (!useV2Downsize) {
    // Niet-downsize (incl. reverse_mortgage onder v2): bouw de events met het
    // gedeelde resolver-pad, maar laat zowel de trigger-MEETRUN als de
    // uiteindelijke projectie door de v2-engine lopen (useV2 = true) zodat de
    // getoonde FIRE-leeftijd én het verkoop-/uitkering-moment overeenkomen met
    // de v2-grafiek — niet een v1-gemeten trigger op een v2-lijn.
    const { events, depletion } = resolveHousingEventsForSim(config, context, sim, true)
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
      // include_full: woning besteedbaar (Optie A, ADR 0015) — consistent met de grafiek.
      spendableAssetIds:
        config.mode === 'include_full' && context.hasEigenHuis
          ? context.eigenHuisAssets.map((a) => a.id)
          : undefined,
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
    // ADR 0030 (Optie B): de trigger-meetrun draait mét de woning als spendable —
    // EXACT de FIRE-eligibility-grondslag van de grafiek — zodat de modal-preview
    // hetzelfde verkoopmoment toont (trigger scant `besteedbaarVermogen`, ex-huis).
    // Spiegelt build-input's `baseSimInput`.
    spendableAssetIds: context.hasEigenHuis ? context.eigenHuisAssets.map((a) => a.id) : undefined,
  }
  const v2Housing = buildV2DownsizeHousing(config as DownsizeConfig, context, baseSimInput, sim.currentAge, sim.endAge)
  const input: UnifiedProjectionInput = {
    ...baseSimInput,
    cashflows: [...sim.cashflows, ...lifeEventsToCashflows(v2Housing.rentEvents)],
    assetLiquidations: v2Housing.assetLiquidations,
    // v2-downsize "Verkopen" (ADR 0028): de woning is besteedbaar (spendable) zodat
    // de modal-preview EXACT dezelfde FIRE-eligibility-grondslag rekent als de
    // grafiek (build-input zet hetzelfde). De trigger-meetrun in buildV2DownsizeHousing
    // draait op `baseSimInput` ZÓNDER spendable → ex-huis exhaustion, identiek aan de
    // grafiek-keten. spendable + saleManaged → telt mee maar verlaat de pot enkel
    // via de verkoop.
    spendableAssetIds: context.hasEigenHuis ? context.eigenHuisAssets.map((a) => a.id) : undefined,
  }
  const result = runSelectedProjection(input, true)
  return {
    events: v2Housing.rentEvents,
    depletion: config.trigger === 'on_depletion' ? v2Housing.depletion : null,
    fireAgeFractional: result.fireAgeFractional,
    fireReachable: result.fireReachable,
  }
}
