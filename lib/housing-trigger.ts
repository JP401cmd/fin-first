/**
 * housing-trigger — simulatie-gebaseerde "wanneer nodig"-trigger voor de
 * eigen-huis-strategie (downsize / reverse_mortgage × on_depletion).
 *
 * Probleem dat dit oplost: het trigger-moment werd voorheen berekend door een
 * versimpeld 1D-jaarmodel (`resolveDownsizeTriggerOnDepletion`) dat AOW- en
 * pensioeninkomen, overige levensgebeurtenissen, schuld-aflossing,
 * geïndexeerde uitgaven, box 3 en per-asset-rendementen negeerde — terwijl de
 * grafiek op /toekomst door `runUnifiedProjection` wordt getekend. De
 * event-marker stond daardoor op een ander punt dan waar het vermogen in de
 * grafiek werkelijk opraakt.
 *
 * Definitie (PO-besluit): verkoop is nodig wanneer het totale netto vermogen
 * daalt tot het eigen-huis-vermogen (woningwaarde − hypotheek) — d.w.z. al
 * het niet-huis-vermogen ("liquide") is op. Het moment ligt iets vóór dat
 * punt: de verkoopkosten-buffer gaat er nog vanaf, plus een optionele
 * veiligheidsmarge (`depletionThresholdYears`, in jaren uitgaven).
 *
 * Mechanisme:
 *   1. MEETRUN — `runUnifiedProjection` ZONDER housing-events. Voor downsize
 *      met huis+hypotheek gefilterd (dan is `row.netWorth` exact het liquide
 *      pad — dezelfde pot als de echte grafiekrun); voor reverse_mortgage
 *      ongefilterd met liquide = netWorth − huisbucket + hypotheeksaldi.
 *   2. SCAN — eerste leeftijd waar liquide_einde_jaar ≤ buffer + marge.
 *      Omdat eenmalige cashflows in de engine aan het BEGIN van het jaar
 *      landen en wij einde-jaar meten, arriveert de verkoopopbrengst vóórdat
 *      het pad de drempel kruist ("iets eerder" zit structureel ingebakken).
 *   3. RONDREKENING — het event beïnvloedt de FIRE-leeftijd en daarmee het
 *      pad vóór de trigger (FIRE-detectie is forward-looking: de binary
 *      search verwerkt óók cashflows ná de kandidaat-leeftijd). Daarom een
 *      capped vaste-punt-iteratie: run-mét-event bepaalt de fireAge, de
 *      meetrun wordt daarop gepind via `forcedFireAge` (alleen fase-label +
 *      accumulatie-einde; geen andere rekenkundige bijwerkingen — bewaakt
 *      door test). Bij convergentie is het pad vóór D in de meetrun
 *      identiek aan de echte grafiekrun → trigger == grafiek-uitputting,
 *      exact. Pensioen-modus (forcedFireAge exogeen) convergeert per
 *      definitie in 1 iteratie. Cap 3 + conservatieve `min()`-tie-break.
 *
 * Puur en isomorf: geen Supabase — bruikbaar in server-loaders, de
 * client-hook (use-horizon-fire-sim) én de modal-preview, zodat alle
 * oppervlakken per constructie hetzelfde moment tonen.
 */

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { Box3Method } from '@/lib/bucket-projection'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import type { LifeEvent } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import {
  runUnifiedProjection,
  type UnifiedProjectionInput,
  type UnifiedProjectionRow,
} from '@/lib/unified-projection'
import {
  buildHousingLifeEventsAtAge,
  filterAssetsForFire,
  projectEigenHuisValuesAt,
  projectMortgageStateAt,
  type DownsizeConfig,
  type HousingContext,
  type HousingStrategyConfig,
  type ReverseMortgageConfig,
} from '@/lib/housing-strategy'

// ── Types ────────────────────────────────────────────────────

/**
 * Alles wat nodig is om een `UnifiedProjectionInput` te bouwen, MINUS de
 * housing-events zelf. `assets`/`debts` ONgefilterd — de resolver filtert
 * zelf per strategie-mode. `cashflows` zijn de kasstromen van de ECHTE
 * life events (housing-events gestript).
 */
export interface HousingTriggerSimBasis {
  assets: Asset[]
  debts: Debt[]
  currentAge: number
  /** Eind-leeftijd van de simulatie (na evt. pensioen-endAge-bump). */
  endAge: number
  yearlyExpenses: number
  annualSavings: number
  monthlyIncome: number
  grossReturn: number
  inflationRate: number
  box3Method: Box3Method
  cashflows: SimCashflow[]
  strategyConfig: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  /** Pensioen-modus: exogene FIRE-leeftijd — wint altijd van de iteratie-pin. */
  forcedFireAge?: number
  hasPartner: boolean
  bankAccountCash?: number
}

export interface SimulatedDepletionResult {
  method: 'simulation'
  /** Geresolveerde trigger-leeftijd, geklemd op [currentAge, config.triggerAge]. */
  triggerAge: number
  /**
   * Waarom dit moment:
   *   - 'immediate': liquide zit nu al op/onder de drempel.
   *   - 'crossover': liquide kruist de drempel binnen het venster.
   *   - 'fallback': geen kruising vóór de fallback-leeftijd (bv. gebruiker
   *     bouwt nog op) → uiterste leeftijd uit de config.
   */
  reason: 'immediate' | 'crossover' | 'fallback'
  /** Liquide pad-waarde net vóór de trigger (einde voorgaand jaar). */
  liquidAtTrigger: number
  /** Verkoopkosten-buffer op de trigger-leeftijd (0 bij reverse_mortgage). */
  bufferAtTrigger: number
  /** Veiligheidsmarge-component (depletionThresholdYears × uitgaven, geïndexeerd). */
  marginAtTrigger: number
  /** Overwaarde op de trigger-leeftijd (geprojecteerde woningwaarde − hypotheek). */
  equityAtTrigger: number
  /** fireAge van de geconvergeerde run-mét-event (null = FIRE onbereikbaar/n.v.t.). */
  fireAgeUsed: number | null
  /** Aantal vaste-punt-iteraties (1..3). */
  iterations: number
  converged: boolean
  /** Compact liquide-pad voor UI-uitleg/preview (einde-jaar-waarden + drempel). */
  liquidPath: { age: number; liquid: number; buffer: number }[]
}

type OnDepletionConfig = DownsizeConfig | ReverseMortgageConfig

const MAX_ITERATIONS = 3
/** Tolerantie voor float-/afrondingsruis in euro's (rijen zijn afgerond). */
const EPSILON = 1
const agesEqual = (a: number, b: number) => Math.abs(a - b) < 1e-6

// ── Liquide-pad-extractie ────────────────────────────────────

/**
 * Liquide (= niet-huis) vermogen aan het einde van een projectiejaar.
 *
 * downsize: de meetrun draait met huis + linked mortgage gefilterd
 * (`filterAssetsForFire`) — netWorth IS dan het liquide pad, exact dezelfde
 * pot als de echte downsize-grafiekrun.
 *
 * reverse_mortgage: het huis blijft in de echte run in de pot (filteren zou
 * de onttrekkingshoogte vóór de trigger veranderen) → meetrun ongefilterd en
 * per rij huisbucket eruit / hypotheeksaldi erbij. Bucket-waarden zijn al
 * inclusion-gewogen; debtBalances zijn rauw → zelf wegen met inclusion-pct.
 * De waterfall raakt de eigen_huis-bucket pas als al het andere op is — op
 * dat moment is liquide per definitie al ≤ 0, dus de meting blijft correct.
 */
function liquidFromRow(
  row: UnifiedProjectionRow,
  mode: OnDepletionConfig['mode'],
  linkedMortgages: Debt[],
): number {
  if (mode === 'downsize') return row.netWorth
  const houseValue = row.assetBuckets.eigen_huis?.endValue ?? 0
  let mortgageBack = 0
  for (const d of linkedMortgages) {
    const detail = row.debtBalances[d.id]
    if (!detail) continue
    mortgageBack += detail.endBalance * (Number(d.net_worth_inclusion_pct ?? 100) / 100)
  }
  return row.netWorth - houseValue + mortgageBack
}

// ── Drempel (verkoopkosten-buffer + veiligheidsmarge) ────────

function bufferAt(config: OnDepletionConfig, context: HousingContext, yearsFromNow: number): number {
  if (config.mode !== 'downsize') return 0
  const projected = projectEigenHuisValuesAt(context.eigenHuisAssets, Math.max(0, yearsFromNow) * 12)
  return projected.wozValue * config.salePricePct * config.salesCostsPct
}

function marginAt(config: OnDepletionConfig, sim: HousingTriggerSimBasis, yearsFromNow: number): number {
  const years = Number(config.depletionThresholdYears) || 0
  if (years <= 0) return 0
  return years * sim.yearlyExpenses * Math.pow(1 + sim.inflationRate, Math.max(0, yearsFromNow))
}

// ── Meetrun-input ────────────────────────────────────────────

function buildMeasurementInput(
  config: HousingStrategyConfig,
  sim: HousingTriggerSimBasis,
  forcedFireAge: number | undefined,
): UnifiedProjectionInput {
  // downsize/exclude: huis + linked mortgage uit de pot (zelfde filter als de
  // echte run); reverse_mortgage/include: ongefilterd (huis blijft in de pot,
  // ook echt) — filterAssetsForFire kent dit onderscheid zelf.
  const { assets, debts } = filterAssetsForFire(config, sim.assets, sim.debts)
  return {
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
    cashflows: sim.cashflows,
    strategyConfig: sim.strategyConfig,
    withdrawalStrategy: sim.withdrawalStrategy,
    forcedFireAge,
    hasPartner: sim.hasPartner,
    bankAccountCash: sim.bankAccountCash,
  }
}

// ── Scan: eerste kruising van het liquide pad met de drempel ─

interface ScanResult {
  triggerAge: number
  reason: SimulatedDepletionResult['reason']
  liquidAtTrigger: number
  bufferAtTrigger: number
  marginAtTrigger: number
  liquidPath: { age: number; liquid: number; buffer: number }[]
}

function scanRows(
  rows: UnifiedProjectionRow[],
  config: OnDepletionConfig,
  context: HousingContext,
  sim: HousingTriggerSimBasis,
  fallbackAge: number,
): ScanResult {
  const liquidPath: { age: number; liquid: number; buffer: number }[] = []
  let prevLiquid: number | null = null
  let crossing: { age: number; prevLiquid: number; buffer: number; margin: number } | null = null

  for (const row of rows) {
    const yearsFromNow = row.age - sim.currentAge
    const liquid = liquidFromRow(row, config.mode, context.eigenHuisMortgages)
    const buffer = bufferAt(config, context, yearsFromNow)
    const margin = marginAt(config, sim, yearsFromNow)
    liquidPath.push({ age: row.age, liquid, buffer: buffer + margin })
    if (
      crossing === null &&
      row.age <= fallbackAge + 1e-6 &&
      liquid - (buffer + margin) <= EPSILON
    ) {
      crossing = {
        age: row.age,
        // Liquide "net vóór" de trigger: einde voorgaand jaar (of het
        // start-vermogen wanneer het eerste jaar al kruist).
        prevLiquid: prevLiquid ?? row.startNetWorth,
        buffer,
        margin,
      }
    }
    prevLiquid = liquid
  }

  if (crossing) {
    const isImmediate = rows.length > 0 && agesEqual(crossing.age, rows[0].age)
    return {
      triggerAge: crossing.age,
      reason: isImmediate ? 'immediate' : 'crossover',
      liquidAtTrigger: crossing.prevLiquid,
      bufferAtTrigger: crossing.buffer,
      marginAtTrigger: crossing.margin,
      liquidPath,
    }
  }

  // Geen kruising binnen het venster (bv. gebruiker bouwt nog op, of het
  // vermogen houdt stand tot de fallback-leeftijd) → uiterste leeftijd.
  const yearsToFallback = fallbackAge - sim.currentAge
  const atFallback = liquidPath.find((p) => p.age >= fallbackAge - 1e-6)
  return {
    triggerAge: fallbackAge,
    reason: 'fallback',
    liquidAtTrigger: atFallback?.liquid ?? prevLiquid ?? 0,
    bufferAtTrigger: bufferAt(config, context, yearsToFallback),
    marginAtTrigger: marginAt(config, sim, yearsToFallback),
    liquidPath,
  }
}

// ── Kern: vaste-punt-iteratie ────────────────────────────────

/**
 * Bepaal het on_depletion-trigger-moment uit de unified projection.
 * Zie de module-docstring voor het mechanisme en het convergentie-argument.
 */
export function resolveHousingTriggerFromProjection(
  config: OnDepletionConfig,
  context: HousingContext,
  sim: HousingTriggerSimBasis,
): SimulatedDepletionResult {
  const fallbackAge = Math.max(sim.currentAge, config.triggerAge)

  const measure = (forced: number | undefined): ScanResult => {
    const result = runUnifiedProjection(buildMeasurementInput(config, sim, forced))
    return scanRows(result.rows, config, context, sim, fallbackAge)
  }

  // Pass 1 — meetrun zonder pin (pensioen-modus: exogene forcedFireAge wint).
  let scan = measure(sim.forcedFireAge)
  let D = scan.triggerAge
  let iterations = 0
  let converged = false
  let fireAgeUsed: number | null = sim.forcedFireAge ?? null

  // Vaste-punt-iteratie: run-mét-event levert de fireAge waarop de meetrun
  // wordt gepind. Convergentie = trigger verschuift niet meer.
  for (let k = 1; k <= MAX_ITERATIONS; k++) {
    iterations = k
    const events = buildHousingLifeEventsAtAge(config, context, D, sim.currentAge, sim.endAge)
    const fullInput: UnifiedProjectionInput = {
      ...buildMeasurementInput(config, sim, sim.forcedFireAge),
      cashflows: [...sim.cashflows, ...lifeEventsToCashflows(events)],
    }
    const full = runUnifiedProjection(fullInput)
    const pin = sim.forcedFireAge ?? full.fireAge ?? undefined
    fireAgeUsed = pin ?? null
    const next = measure(pin)
    if (agesEqual(next.triggerAge, D)) {
      scan = next
      converged = true
      break
    }
    D = k === MAX_ITERATIONS ? Math.min(D, next.triggerAge) : next.triggerAge
    scan = next
  }

  // Niet-geconvergeerd + min()-tie-break: lijn de uitleg-bundel uit op de
  // uiteindelijk gekozen leeftijd D, anders beschrijven liquide/buffer/marge
  // een naburig jaar terwijl het event op D staat. Puur cosmetisch voor de
  // "Waarom dit moment?"-breakdown; het event-moment zelf is altijd D.
  if (!converged && !agesEqual(scan.triggerAge, D)) {
    const idx = scan.liquidPath.findIndex((p) => agesEqual(p.age, D))
    scan = {
      ...scan,
      triggerAge: D,
      liquidAtTrigger: idx > 0 ? scan.liquidPath[idx - 1].liquid : scan.liquidAtTrigger,
      bufferAtTrigger: bufferAt(config, context, D - sim.currentAge),
      marginAtTrigger: marginAt(config, sim, D - sim.currentAge),
    }
  }

  // Overwaarde op trigger-moment: geprojecteerde marktwaarde − geamortiseerd
  // hypotheeksaldo (zelfde helpers als de event-bedragen).
  const monthsToTrigger = Math.max(0, (D - sim.currentAge) * 12)
  const projectedHouse =
    context.eigenHuisAssets.length > 0
      ? projectEigenHuisValuesAt(context.eigenHuisAssets, monthsToTrigger)
      : { wozValue: context.wozValue, currentValue: context.eigenHuisValue }
  const projectedMortgage = projectMortgageStateAt(context.eigenHuisMortgages, monthsToTrigger)
  const equityAtTrigger = Math.max(0, projectedHouse.currentValue - projectedMortgage.balance)

  return {
    method: 'simulation',
    triggerAge: D,
    reason: scan.reason,
    liquidAtTrigger: scan.liquidAtTrigger,
    bufferAtTrigger: scan.bufferAtTrigger,
    marginAtTrigger: scan.marginAtTrigger,
    equityAtTrigger,
    fireAgeUsed,
    iterations,
    converged,
    liquidPath: scan.liquidPath,
  }
}

// ── Orkestratie: dé ene ingang voor loaders, hook en preview ─

/**
 * Resolve het trigger-moment (simulatie-gebaseerd bij on_depletion, direct
 * bij fixed_age) en bouw de virtuele LifeEvents op die leeftijd. Vervangt
 * de oude `getHousingLifeEvents` op alle productie-callsites.
 */
export function resolveHousingEventsForSim(
  config: HousingStrategyConfig,
  context: HousingContext,
  sim: HousingTriggerSimBasis,
): { events: LifeEvent[]; depletion: SimulatedDepletionResult | null } {
  if (!context.hasEigenHuis) return { events: [], depletion: null }
  if (config.mode === 'include_full' || config.mode === 'exclude_from_fire') {
    return { events: [], depletion: null }
  }

  if (config.trigger === 'fixed_age') {
    const triggerAge = Math.max(sim.currentAge, config.triggerAge)
    return {
      events: buildHousingLifeEventsAtAge(config, context, triggerAge, sim.currentAge, sim.endAge),
      depletion: null,
    }
  }

  const depletion = resolveHousingTriggerFromProjection(config, context, sim)
  const events = buildHousingLifeEventsAtAge(
    config,
    context,
    depletion.triggerAge,
    sim.currentAge,
    sim.endAge,
    { depletion },
  )
  return { events, depletion }
}

// ── Preview: volledig scenario voor de strategie-modal ───────

/**
 * Serialiseerbare bundel die de server-loader aan de Huis-strategie-modal
 * meegeeft zodat de preview client-side met exact dezelfde basis rekent als
 * de grafiek (zelfde simBasis → zelfde trigger → zelfde vrijheidsleeftijd).
 */
export interface HousingPreviewData {
  simBasis: HousingTriggerSimBasis
  context: HousingContext
  /**
   * Draait deze gebruiker de v2-grootboek-engine? (`isHorizonV2Enabled` uit het
   * profiel, via de loader.) Bepaalt of de modal-preview met v2 rekent zodat hij
   * de v2-grafiek matcht (M2). Default/false = v1-engine (huidige gedrag).
   */
  horizonEngineV2?: boolean
}

export interface HousingScenarioResult {
  events: LifeEvent[]
  depletion: SimulatedDepletionResult | null
  /** Vrijheidsleeftijd (fractioneel) onder deze strategie-config; null = onbereikbaar. */
  fireAgeFractional: number | null
  fireReachable: boolean
}

/**
 * Draai het volledige scenario voor een (concept-)strategie-config: trigger
 * resolven, events bouwen én de definitieve projectie draaien — zodat de
 * modal vóór opslaan de trigger-leeftijd, de kernbedragen en de nieuwe
 * vrijheidsleeftijd kan tonen. Zelfde paden als de grafiek; geen aparte
 * preview-wiskunde.
 */
export function runHousingScenarioProjection(
  config: HousingStrategyConfig,
  context: HousingContext,
  sim: HousingTriggerSimBasis,
): HousingScenarioResult {
  const { events, depletion } = resolveHousingEventsForSim(config, context, sim)
  const input: UnifiedProjectionInput = {
    ...buildMeasurementInput(config, sim, sim.forcedFireAge),
    cashflows: [...sim.cashflows, ...lifeEventsToCashflows(events)],
  }
  const result = runUnifiedProjection(input)
  return {
    events,
    depletion,
    fireAgeFractional: result.fireAgeFractional,
    fireReachable: result.fireReachable,
  }
}
