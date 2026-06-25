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
  applyDownsizeValuationBasis,
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

/** Huiswaarde in het grootboek bij een rij = som van de eind-waarden van de
 * eigen_huis-assets (reëel, current_value-gegroeid; bij saleValuationBasis='woz'
 * woz_value-gegroeid, want de input-assets zijn dan al gesubstitueerd). */
function ledgerHouseValueAt(row: { assets: { type: string; eind: number }[] }): number {
  return row.assets.filter((a) => a.type === 'eigen_huis').reduce((s, a) => s + Math.max(0, a.eind), 0)
}

/**
 * Bouw de huur-life-events + de huis-`AssetLiquidation` op een GEGEVEN trigger-
 * leeftijd. Dé ENE bron voor zowel de getoonde grafiek-run (`buildV2DownsizeHousing`)
 * als de interne convergentie-runs in `resolveDownsizeTriggerV2` (de "getoonde FIRE"-
 * meting) — zodat de meetrun exact dezelfde sale+rent-delta beleeft als de grafiek.
 *
 * Alleen de nieuwe-woonkosten (huur) blijven als cashflow; de verkoopopbrengst én de
 * afgeloste hypotheek handelt de engine via de liquidatie af (anders dubbeltelling).
 * Hypotheek-keuze: bij één huis alle eigen-huis-hypotheken, bij meerdere huizen strikt
 * op `linked_asset_id` (anders zou een hypotheek van een ánder huis op €0 gezet worden
 * zonder dat dat asset het grootboek verlaat).
 */
function buildDownsizeRentAndLiquidation(
  config: DownsizeConfig,
  context: HousingContext,
  triggerAge: number,
  currentAge: number,
  endAge: number,
  extraMetadata: Record<string, unknown>,
): { rentEvents: LifeEvent[]; houseLiquidation: AssetLiquidation | undefined } {
  const rentEvents = buildHousingLifeEventsAtAge(config, context, triggerAge, currentAge, endAge, extraMetadata)
    .map((ev) => ({
      ...ev,
      metadata: {
        ...((ev.metadata as Record<string, unknown> | null) ?? {}),
        cashflows: (((ev.metadata as { cashflows?: { id: string }[] } | null)?.cashflows) ?? []).filter((c) => c.id === 'new-rent'),
      },
    }))
    .filter((ev) => (((ev.metadata as { cashflows?: unknown[] }).cashflows)?.length ?? 0) > 0)
  const soldHouse = context.eigenHuisAssets[0]
  const payoffMortgages = soldHouse == null
    ? []
    : context.eigenHuisAssets.length <= 1
      ? context.eigenHuisMortgages
      : context.eigenHuisMortgages.filter(
          (d) => (d as unknown as { linked_asset_id?: string | null }).linked_asset_id === soldHouse.id,
        )
  const houseLiquidation: AssetLiquidation | undefined = soldHouse
    ? {
        assetId: soldHouse.id,
        age: triggerAge,
        salePricePct: config.salePricePct,
        salesCostsPct: config.salesCostsPct,
        payoffDebtIds: payoffMortgages.map((d) => d.id),
      }
    : undefined
  return { rentEvents, houseLiquidation }
}

/**
 * Bepaal het downsize-verkoopmoment op het LIQUIDE-pad van de v2-grootboek-engine
 * (ADR 0015/0030/0031) — niet op de v1-meetrun. Meetrun = v2 met het huis IN de
 * ledger, ZONDER liquidatie maar MÉT de woning als spendable (Optie B) ÉN gepind op een
 * stabiele FIRE-leeftijd in de onttrekkingsfase: zo teert het RAUW besteedbare pad
 * (`besteedbaarVermogen` = `withdrawableLiquidValue`, ex de spendable+saleManaged woning)
 * pas ná de stop-werk-leeftijd af. Het eerste jaar waarin dat pad de verkoopkosten-buffer
 * (+ optionele veiligheidsmarge) raakt, is het verkoopmoment. Geen kruising binnen de
 * horizon → 'no_sale' (huis blijft staan).
 *
 * ADR 0031 (bugfix accumulatie-trigger): vóór deze fix berekende de meetrun zijn EIGEN
 * FIRE-leeftijd (geen `forcedFireAge`). Omdat de spendable woning de FIRE-eligibility-pot
 * (`liquideVermogen`) al op currentAge bevredigt maar de besteedbare ex-huis pot dat NIET
 * kan dragen, "pensioneerde" de meetrun een nog-werkende/accumulerende gebruiker direct,
 * teerde op de kleine ex-huis cash en kruiste de buffer al in de OPBOUWFASE (bv. trigger
 * 41 terwijl de getoonde run pas op ~59-60 FIRE bereikt). Fix = pin de meetrun op een
 * STABIELE FIRE-leeftijd in 2 stappen (GEEN vaste-punt-iteratie — die divergeert door
 * datzelfde spendable-woning-FIRE-gate-artefact, want bij een verkoop ver in de toekomst
 * houdt de woning `liquideVermogen` kunstmatig positief → de engine claimt een onmogelijk-
 * vroege FIRE → terugkoppeling oscilleert 41→79→83→41):
 *   1. HOLD-FIRE-anker = `runHorizonLedger(baseInput).fireAge` — de woning is daar spendable
 *      ÉN rauw besteedbaar (geen saleManaged-markering, geen huur) → `besteedbaarVermogen
 *      == liquideVermogen` → de FIRE-gate is EERLIJK → de leeftijd is sale-timing-
 *      ONAFHANKELIJK (≈ include_full-FIRE) en dus stabiel.
 *   2. één VERFIJNING: de echte getoonde downsize-run (huur + verkoopkosten) heeft een
 *      latere FIRE dan het hold-anker; pin de meetrun daarop (geklemd ≥ hold-FIRE tegen
 *      het artefact). De afbouw — en dus de trigger — valt zo gegarandeerd ≥ FIRE (of
 *      nooit → no_sale). Pensioen-modus (exogene `baseInput.forcedFireAge`) wint altijd.
 *
 * VALUATIE-BASIS: zowel de verkoopkosten-buffer als de getoonde verkoopopbrengst worden
 * op DEZELFDE basis gemeten — de **engine-asset-waarde** van het huis in het grootboek
 * (`ledgerHouseValueAt`, reëel gegroeid). Bij saleValuationBasis='woz' zijn de input-
 * assets al via `applyDownsizeValuationBasis` gesubstitueerd, dus alles erna is per
 * constructie basis-bewust. De `sale`-breakdown (engine-grondslag + afgeloste hypotheek +
 * netto opbrengst, alles basis-bewust uit de meetrun-rij) gaat mee terug zodat preview,
 * markers én de uitleg-bon exact het door de grafiek geïnjecteerde bedrag tonen (Bug B/H2).
 */
/**
 * Engine-grondslag van een huis-verkoop op de trigger-leeftijd (basis-bewust). Alle
 * velden uit DEZELFDE meetrun-rij zodat de "uitleg-bon"-breakdown per constructie optelt
 * naar `saleProceeds` (consume-don't-recompute, H2):
 *   saleProceeds = grondslag × salePricePct × (1−salesCostsPct) − mortgagePayoff.
 */
interface DownsizeSaleBreakdown {
  /** Engine-huiswaarde op de trigger-leeftijd vóór salePricePct/kosten (= current_value of woz_value, reëel gegroeid, inclusion-gewogen). */
  grondslagValueAtTrigger: number
  /** Afgelost eigen-huis-hypotheeksaldo op de trigger (engine, reëel gegroeid). */
  mortgagePayoffAtTrigger: number
  /** Engine-NETTO-opbrengst (wat de ledger werkelijk naar liquide injecteert). */
  saleProceeds: number
}

function resolveDownsizeTriggerV2(
  config: DownsizeConfig,
  context: HousingContext,
  baseInput: UnifiedProjectionInput,
  currentAge: number,
): { triggerAge: number; depletion: SimulatedDepletionResult; sale: DownsizeSaleBreakdown | null } {
  const fallbackAge = Math.max(currentAge, config.triggerAge)
  const margeJaren = Number(config.depletionThresholdYears) || 0
  const soldHouse = context.eigenHuisAssets[0]
  const mortgageIds = new Set(context.eigenHuisMortgages.map((d) => d.id))

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

  // Engine-net verkoopopbrengst op een gegeven leeftijd, gelezen uit de meetrun-rij
  // (huis nog niet verkocht): `huiswaarde × salePricePct × (1−salesCostsPct) −
  // afgelost hypotheeksaldo`. Basis-bewust (de assets zijn al gesubstitueerd bij 'woz').
  type Row = { leeftijd: number; assets: { type: string; eind: number }[]; schulden: { id: string; eind: number }[]; besteedbaarVermogen: number }
  const mortgageBalanceAt = (rows: Row[], age: number): number => {
    const row = rows.find((r) => r.leeftijd === Math.round(age))
    return row ? row.schulden.filter((s) => mortgageIds.has(s.id)).reduce((sum, s) => sum + Math.max(0, s.eind), 0) : 0
  }
  const engineSaleAt = (rows: Row[], age: number): DownsizeSaleBreakdown | null => {
    const row = rows.find((r) => r.leeftijd === Math.round(age))
    if (!row) return null
    const grondslag = ledgerHouseValueAt(row)
    const mortgagePayoff = mortgageBalanceAt(rows, age)
    return {
      grondslagValueAtTrigger: grondslag,
      mortgagePayoffAtTrigger: mortgagePayoff,
      saleProceeds: grondslag * config.salePricePct * (1 - config.salesCostsPct) - mortgagePayoff,
    }
  }

  // De meetrun markeert het huis als saleManaged via een synthetische verkoop op
  // `endAge + 1` — STRIKT BUITEN de scan-horizon (tot endAge) — zodat ze binnen de scan
  // NOOIT werkelijk vuurt maar het huis over de HELE horizon als saleManaged geldt:
  // wél spendable (telt mee in `liquideVermogen`/eligibility) maar NIET rauw onttrekbaar
  // (→ niet in `besteedbaarVermogen`). Zo teert de afbouw-annuïteit op de ex-huis cash —
  // exact de pre-sale dynamiek van de getoonde run.
  const measureLiquidations = soldHouse
    ? [
        ...(baseInput.assetLiquidations ?? []),
        {
          assetId: soldHouse.id,
          age: baseInput.endAge + 1,
          trigger: 'fixed_age' as const,
          salePricePct: config.salePricePct,
          salesCostsPct: config.salesCostsPct,
          payoffDebtIds: context.eigenHuisMortgages.map((d) => d.id),
        },
      ]
    : baseInput.assetLiquidations

  // Eén meetrun, gepind op `forced` (pensioen-modus wint via baseInput.forcedFireAge).
  const runMeasure = (forced: number | undefined): { rows: Row[] } | null => {
    try {
      return runHorizonLedger({
        ...baseInput,
        assetLiquidations: measureLiquidations,
        forcedFireAge: baseInput.forcedFireAge ?? forced,
      }) as unknown as { rows: Row[] }
    } catch {
      return null
    }
  }

  // ── Scan: eerste kruising van `besteedbaarVermogen` met de verkoopkosten-buffer ──
  interface MeasureScan {
    triggerAge: number
    reason: 'immediate' | 'crossover' | 'no_sale'
    crossing: { age: number; prevLiquid: number; buffer: number; margin: number; houseValue: number } | null
    liquidPath: { age: number; liquid: number; buffer: number }[]
    prevLiquidEnd: number
  }
  const scanRows = (rows: Row[]): MeasureScan => {
    const liquidPath: { age: number; liquid: number; buffer: number }[] = []
    let prevLiquid: number | null = null
    let crossing: MeasureScan['crossing'] = null
    for (const row of rows) {
      const houseValue = ledgerHouseValueAt(row)
      const buffer = houseValue * config.salePricePct * config.salesCostsPct
      const margin = margeJaren > 0 ? margeJaren * baseInput.yearlyExpenses : 0
      const besteedbaar = row.besteedbaarVermogen
      liquidPath.push({ age: row.leeftijd, liquid: besteedbaar, buffer: buffer + margin })
      if (crossing === null && besteedbaar - (buffer + margin) <= 1) {
        crossing = { age: row.leeftijd, prevLiquid: prevLiquid ?? besteedbaar, buffer, margin, houseValue }
      }
      prevLiquid = besteedbaar
    }
    if (crossing) {
      const isImmediate = rows.length > 0 && Math.abs(crossing.age - rows[0].leeftijd) < 1e-6
      return {
        triggerAge: crossing.age,
        reason: isImmediate ? 'immediate' : 'crossover',
        crossing,
        liquidPath,
        prevLiquidEnd: prevLiquid ?? 0,
      }
    }
    return { triggerAge: fallbackAge, reason: 'no_sale', crossing: null, liquidPath, prevLiquidEnd: prevLiquid ?? 0 }
  }

  // FIRE-leeftijd van de ECHTE getoonde downsize-run (sale+rent op kandidaat D) — de
  // verfijnings-pin. Identieke delta-constructie als de grafiek
  // (`buildDownsizeRentAndLiquidation`), huis spendable (baseInput.spendableAssetIds),
  // engine zelf-berekent FIRE → `full.fireAge` == de getoonde downsize-FIRE. (Niet als
  // vaste-punt geïtereerd: bij een verkoop ver in de toekomst houdt de spendable woning
  // `liquideVermogen` positief en claimt de FIRE-gate een onmogelijk-vroege FIRE — zie
  // ADR 0031 — dus we gebruiken dit voor ÉÉN verfijning vanaf de stabiele hold-FIRE.)
  const displayedDownsizeFireAge = (D: number): number | null => {
    const { rentEvents, houseLiquidation } = buildDownsizeRentAndLiquidation(
      config, context, D, currentAge, baseInput.endAge, { depletion: null, triggerMode: config.trigger },
    )
    try {
      return runHorizonLedger({
        ...baseInput,
        cashflows: [...baseInput.cashflows, ...lifeEventsToCashflows(rentEvents)],
        assetLiquidations: [...(baseInput.assetLiquidations ?? []), ...(houseLiquidation ? [houseLiquidation] : [])],
        forcedFireAge: baseInput.forcedFireAge,
      }).fireAge
    } catch {
      return null
    }
  }

  // fixed_age: het huis wordt onvoorwaardelijk verkocht op de gekozen leeftijd — GEEN
  // depletie-trigger (placeholder 'no_sale'; het rent-event krijgt bij fixed_age geen
  // depletion-uitleg, zie buildV2DownsizeHousing). De huiswaarde (en dus de opbrengst)
  // is FIRE-leeftijd-onafhankelijk (een saleManaged huis wordt nooit rauw onttrokken),
  // dus één meetrun volstaat om de basis-bewuste engine-grondslag af te lezen.
  if (config.trigger === 'fixed_age') {
    const m = runMeasure(undefined)
    const sale = m ? engineSaleAt(m.rows, fallbackAge) : null
    return { triggerAge: fallbackAge, depletion: baseDepletion({ triggerAge: fallbackAge, reason: 'no_sale', iterations: 1 }), sale }
  }

  // ── on_depletion: stabiele pin via hold-FIRE-anker + verfijning (ADR 0031, GEEN iteratie) ──
  const buildNoSale = (scan: MeasureScan, runs: number): { triggerAge: number; depletion: SimulatedDepletionResult; sale: DownsizeSaleBreakdown | null } => {
    const atFallback = scan.liquidPath.find((p) => p.age >= fallbackAge - 1e-6)
    return {
      triggerAge: fallbackAge,
      depletion: baseDepletion({
        triggerAge: fallbackAge,
        reason: 'no_sale',
        liquidAtTrigger: atFallback?.liquid ?? scan.prevLiquidEnd ?? 0,
        liquidPath: scan.liquidPath,
        iterations: runs,
      }),
      sale: null,
    }
  }

  // STAP 1 — HONEST "hold-the-house" FIRE-anker: de FIRE-leeftijd van de run waarin de
  // woning spendable ÉN rauw besteedbaar is (geen saleManaged-markering, geen huur) =
  // `runHorizonLedger(baseInput)`. Daar geldt `besteedbaarVermogen == liquideVermogen`
  // (de woning zit in BEIDE potten), dus de FIRE-gate is EERLIJK en de leeftijd is de
  // echte "wanneer kan ik stoppen als het huis meetelt"-leeftijd (≈ include_full-FIRE).
  // Stabiel: sale-timing-onafhankelijk. NULL = FIRE onbereikbaar (bv. onderwater-hypotheek/
  // zeer hoge uitgaven): dán NIET op currentAge pinnen — dat zou de meetrun "nu laten
  // stoppen" terwijl de GETOONDE run zelf-zoekt en tot AOW doorwerkt → trigger weer te
  // vroeg (Bug A-variant, H1). We pinnen dan op `undefined` zodat de meetrun exact de
  // zelf-zoekende getoonde run volgt (= roughScan hieronder).
  let holdFireAge: number | null = baseInput.forcedFireAge ?? null
  if (holdFireAge == null) {
    try {
      holdFireAge = runHorizonLedger(baseInput).fireAge
    } catch {
      holdFireAge = null
    }
  }

  // STAP 2 — ruwe verkoop-leeftijd: meetrun gepind op het anker (of zelf-zoekend bij
  // onbereikbare FIRE, identiek aan de getoonde run).
  const pin0 = baseInput.forcedFireAge ?? holdFireAge ?? undefined
  const rough = runMeasure(pin0)
  if (!rough) return { triggerAge: fallbackAge, depletion: baseDepletion({}), sale: null }
  let triggerRuns = 1
  const roughScan = scanRows(rough.rows)
  if (roughScan.reason === 'no_sale' || !roughScan.crossing) return buildNoSale(roughScan, triggerRuns)

  // STAP 3 — verfijn ALLEEN voor een ACCUMULERENDE gebruiker (salaris-inkomen ÉN hold-FIRE
  // in de toekomst): dan werkt de gebruiker door tot ná het hold-anker en accumuleert
  // verder, waardoor de getoonde downsize-FIRE (huur + verkoopkosten) LATER valt — pin
  // daarop zodat de verkoop ná de stop-werk-leeftijd komt (geklemd ≥ hold-FIRE tegen het
  // spendable-woning-FIRE-gate-artefact bij een verkoop ver in de toekomst, ≤ endAge tegen
  // een onbereikbaar-hoge waarde). Een AL-GESTOPTE gebruiker (geen salaris) zit al in de
  // afbouw — diens hold-FIRE kan wél > currentAge zijn (brugfase), maar doorwerken voegt
  // geen vermogen toe → de ruwe trigger is al juist; de (instabiele) getoonde-downsize-FIRE
  // zou 'm enkel kunstmatig vertragen. GEEN vaste-punt-iteratie (die divergeert door het
  // artefact). Pensioen-modus (exogene forcedFireAge) slaat de verfijning over.
  let m = rough
  let scan = roughScan
  let pin = pin0
  const isAccumulating =
    baseInput.forcedFireAge == null &&
    (baseInput.monthlyIncome ?? 0) > 0 &&
    holdFireAge != null &&
    holdFireAge > currentAge + 1
  if (isAccumulating) {
    const refined = displayedDownsizeFireAge(roughScan.crossing.age)
    if (refined != null && refined > (holdFireAge as number) && refined <= baseInput.endAge) {
      const m2 = runMeasure(refined)
      if (m2) {
        triggerRuns = 2
        const scan2 = scanRows(m2.rows)
        if (scan2.reason === 'no_sale' || !scan2.crossing) return buildNoSale(scan2, triggerRuns)
        m = m2
        scan = scan2
        pin = refined
      }
    }
  }

  const chosenAge = scan.crossing!.age
  const equityAtTrigger = Math.max(0, scan.crossing!.houseValue - mortgageBalanceAt(m.rows, chosenAge))
  return {
    triggerAge: chosenAge,
    depletion: baseDepletion({
      triggerAge: chosenAge,
      reason: scan.reason,
      liquidAtTrigger: scan.crossing!.prevLiquid,
      bufferAtTrigger: scan.crossing!.buffer,
      marginAtTrigger: scan.crossing!.margin,
      equityAtTrigger,
      fireAgeUsed: pin ?? null,
      // Honest (M1): de v2-resolve is DETERMINISTISCH, geen vaste-punt-iteratie. `iterations`
      // = aantal trigger-meetruns (1 zonder verfijning, 2 met); `converged` = true betekent
      // hier louter "een definitieve trigger is bepaald", geen geslaagde convergentietest.
      iterations: triggerRuns,
      converged: true,
      liquidPath: scan.liquidPath,
    }),
    sale: engineSaleAt(m.rows, chosenAge),
  }
}

/**
 * Bouw de v2-downsize-huisvestingsdelta: het rent-event (met `depletion`-uitleg
 * voor het "Waarom dit moment?"-panel) + de `assetLiquidations`-entry. Eén bron,
 * gebruikt door zowel `buildHorizonInput` (grafiek) als de modal-preview
 * (`runHousingScenarioProjectionV2`) — zodat preview en grafiek per constructie
 * hetzelfde verkoopmoment, dezelfde opbrengst en dezelfde uitleg tonen (M1/M2).
 *
 * Bug B (ADR 0031): de getoonde `metadata.saleProceeds` was WOZ-nominaal (via
 * `buildHousingLifeEventsAtAge` → `projectEigenHuisValuesAt`) en week daarmee af van de
 * markt-, reële verkoop in de engine (~€171k voor een 50%-inclusion-huis). We overschrijven
 * 'm met de ECHTE engine-net-opbrengst op de trigger-leeftijd (`resolveDownsizeTriggerV2.
 * sale`), basis-bewust, en VERRIJKEN het event-metadata met de engine-GRONDSLAG (H2) zodat
 * de uitleg-bon (event-pane-view.tsx) zijn regels consume-don't-recompute kan tonen die per
 * constructie optellen naar `saleProceeds`:
 *   saleProceeds = grondslagValueAtTrigger × salePricePct × (1 − salesCostsPct) − mortgagePayoffAtTrigger.
 */
function buildV2DownsizeHousing(
  downsizeCfg: DownsizeConfig,
  housingContext: HousingContext,
  baseSimInput: UnifiedProjectionInput,
  currentAge: number,
  simEndAge: number,
): { rentEvents: LifeEvent[]; assetLiquidations: AssetLiquidation[] | undefined; depletion: SimulatedDepletionResult; triggerAge: number } {
  const { triggerAge, depletion, sale } = resolveDownsizeTriggerV2(downsizeCfg, housingContext, baseSimInput, currentAge)

  // Never-deplete (alleen relevant bij on_depletion): het liquide pad raakt de
  // verkoopkosten-buffer nooit binnen de horizon → verkoop is NIET nodig. Geen
  // liquidatie en geen huur-event: het huis blijft als niet-liquide asset in
  // het grootboek en groeit door tot endAge. Bij fixed_age wordt het huis wél
  // onvoorwaardelijk verkocht — die tak valt hier dus nooit door.
  if (downsizeCfg.trigger === 'on_depletion' && depletion.reason === 'no_sale') {
    return { rentEvents: [], assetLiquidations: undefined, depletion, triggerAge }
  }

  const { rentEvents, houseLiquidation } = buildDownsizeRentAndLiquidation(
    downsizeCfg, housingContext, triggerAge, currentAge, simEndAge,
    {
      // Bij fixed_age géén depletion (net als v1): de panel-gate vereist on_depletion.
      depletion: downsizeCfg.trigger === 'on_depletion' ? depletion : null,
      triggerMode: downsizeCfg.trigger,
    },
  )

  // Bug B + H2: overschrijf de WOZ-nominale `saleProceeds` met de ECHTE engine-net-opbrengst
  // en verrijk met de basis-bewuste engine-GRONDSLAG zodat preview/markers EN de uitleg-bon
  // het door de grafiek geïnjecteerde bedrag tonen (de bon telt per constructie op naar
  // `saleProceeds`). De oude WOZ-velden (`wozValueAtTrigger`/`mortgageBalanceAtTrigger`)
  // blijven informatief staan maar zijn voor de breakdown vervangen door de engine-velden.
  if (rentEvents.length > 0 && sale != null && Number.isFinite(sale.saleProceeds)) {
    rentEvents[0] = {
      ...rentEvents[0],
      metadata: {
        ...((rentEvents[0].metadata as Record<string, unknown> | null) ?? {}),
        saleProceeds: sale.saleProceeds,
        saleValuationBasis: downsizeCfg.saleValuationBasis ?? 'market',
        grondslagValueAtTrigger: sale.grondslagValueAtTrigger,
        mortgagePayoffAtTrigger: sale.mortgagePayoffAtTrigger,
      },
    }
  }

  const assetLiquidations: AssetLiquidation[] | undefined = houseLiquidation ? [houseLiquidation] : undefined
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
    // ADR 0031: bij saleValuationBasis='woz' vervangt `applyDownsizeValuationBasis` de
    // current_value van het eigen huis door woz_value — DÉ ENE bron die de getoonde run,
    // de trigger-meetrun ÉN de modal-preview (`runHousingScenarioProjectionV2`) van
    // dezelfde basis-bewuste huiswaarde voorziet. Omdat de engine de huiswaarde overal
    // via `assetEngineValue` leest, raakt deze ene substitutie automatisch netto vermogen,
    // FIRE-pot, verkoopopbrengst én display. Bij 'market' (default) verandert er niets.
    const downsizeCfg = housingCfg as DownsizeConfig
    effectiveAssets = applyDownsizeValuationBasis(p.assets ?? [], downsizeCfg)
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
  // ADR 0031: dezelfde basis-bewuste substitutie als build-input (één bron) zodat de
  // modal-preview met identieke huiswaarde rekent als de grafiek.
  const downsizeCfg = config as DownsizeConfig
  const basisAssets = applyDownsizeValuationBasis(sim.assets, downsizeCfg)
  const baseSimInput: UnifiedProjectionInput = {
    assets: basisAssets,
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
  const v2Housing = buildV2DownsizeHousing(downsizeCfg, context, baseSimInput, sim.currentAge, sim.endAge)
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
