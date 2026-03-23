/**
 * Fase-specifieke Monte Carlo simulatie-engine.
 *
 * Generieke MC-simulatie die werkt voor elke fase (opbouw, overgang, onttrekking).
 * Bevat ook SORR-analyse en cashbuffer-analyse.
 *
 * Pure functions, geen Supabase dependency.
 */

import { SeededRandom } from '@/lib/horizon-data'
import { BOX3_DRAG, DEFAULT_VOLATILITY, DEFAULT_RETURN } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ───────────────────────────────────────────────────────────────────

export interface MonteCarloPhaseInput {
  startPortfolio: number
  yearsInPhase: number
  /** Positief = sparen (opbouw), negatief = onttrekking */
  yearlyCashflow: number
  expectedReturn: number     // decimaal, bijv. 0.07
  volatility: number         // decimaal, bijv. 0.15
  inflationRate: number      // decimaal, bijv. 0.02
  /** Life event cashflows actief gedurende deze fase */
  cashflows?: SimCashflow[]
  currentAge: number
  /** Portfolio moet boven dit bedrag blijven voor "succes" (default 0) */
  targetMinPortfolio?: number
  /** Box 3 drag (default: BOX3_DRAG uit constants) */
  box3Drag?: number
  /** Optioneel: FIRE-doelvermogen voor opbouw-slagingskans */
  fireTarget?: number
}

export interface MonteCarloPhaseResult {
  /** Per-jaar percentielenbanden (array lengte = yearsInPhase + 1, startend bij jaar 0) */
  percentiles: {
    p10: number[]
    p25: number[]
    p50: number[]
    p75: number[]
    p90: number[]
  }
  /** Fractie simulaties waar portfolio >= targetMinPortfolio elk jaar (0-1) */
  successRate: number
  medianEndPortfolio: number
  p10EndPortfolio: number
  p90EndPortfolio: number
  /** Voor opbouw: FIRE-leeftijden over alle simulaties */
  fireAges?: number[]
  /** Voor opbouw: kans op bereiken fireTarget voor einde fase */
  fireProb?: number
  /** Per-leeftijd slagingskans (voor "slagingskans per leeftijd" tabel) */
  successByAge?: { age: number; successRate: number }[]
}

export interface SORRScenario {
  name: string
  label: string
  /** Geforceerde rendementen voor de eerste N jaren (overschrijft random) */
  earlyReturns: number[]
  description: string
}

export const SORR_SCENARIOS: SORRScenario[] = [
  {
    name: 'favorable',
    label: 'Gunstige volgorde',
    earlyReturns: [0.10, 0.08, 0.10],
    description: '+10%, +8%, +10% in de eerste 3 jaar',
  },
  {
    name: 'unfavorable',
    label: 'Ongunstige volgorde',
    earlyReturns: [-0.10, -0.08, -0.10],
    description: '\u221210%, \u22128%, \u221210% in de eerste 3 jaar',
  },
  {
    name: 'crash_year1',
    label: 'Crash in jaar 1',
    earlyReturns: [-0.20],
    description: '\u221220% in het eerste jaar',
  },
]

export interface SORRResult {
  scenario: string
  label: string
  description: string
  successRate: number
  medianEndPortfolio: number
  p10EndPortfolio: number
  /** Hoeveel jaar korter het portfolio meegaat vs. baseline */
  yearsLostVsBaseline: number
}

export interface CashBufferResult {
  bufferYears: number
  bufferAmount: number
  successRate: number
  medianEndPortfolio: number
}

// ── Default simulatie-aantallen ─────────────────────────────────────────────

/** Default aantal simulaties — 500 voor mobiele performance */
const DEFAULT_SIMS = 500

/** Seed-constanten (identiek aan bestaande MC in horizon-data.ts) */
const SEED_MULTIPLIER = 7919
const SEED_OFFSET = 42

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bereken de netto cashflow van SimCashflows voor een gegeven leeftijd.
 * Inkomen is positief, uitgaven negatief.
 */
function resolveCashflowsForAge(
  cashflows: SimCashflow[],
  age: number,
): number {
  let total = 0
  for (const cf of cashflows) {
    // Controleer of deze cashflow actief is op deze leeftijd
    if (age < cf.fromAge) continue
    if (cf.type === 'one_time') {
      // Eenmalig: alleen op exact de fromAge
      if (age === cf.fromAge) {
        total += cf.direction === 'income' ? cf.amount : -cf.amount
      }
    } else {
      // Terugkerend: actief van fromAge tot toAge (exclusief)
      if (cf.toAge !== null && age >= cf.toAge) continue
      total += cf.direction === 'income' ? cf.amount : -cf.amount
    }
  }
  return total
}

/**
 * Bereken percentiel uit een gesorteerde array.
 * Gebruikt floor-index, consistent met bestaande MC in horizon-data.ts.
 */
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

// ── Hoofdfunctie: runPhaseMonteCarlo ────────────────────────────────────────

/**
 * Generieke Monte Carlo simulatie voor elke fase (opbouw, overgang, onttrekking).
 *
 * @param input - Simulatie-invoer met portfolio, cashflows, en verwachtingen
 * @param sims  - Aantal simulaties (default 500)
 * @returns Percentielen, slagingskansen, en optionele FIRE-statistieken
 */
export function runPhaseMonteCarlo(
  input: MonteCarloPhaseInput,
  sims: number = DEFAULT_SIMS,
): MonteCarloPhaseResult {
  const {
    startPortfolio,
    yearsInPhase,
    yearlyCashflow,
    expectedReturn,
    volatility,
    inflationRate,
    cashflows = [],
    currentAge,
    targetMinPortfolio = 0,
    box3Drag = BOX3_DRAG,
    fireTarget,
  } = input

  // Netto rendement na Box 3 drag
  const netReturn = expectedReturn - box3Drag

  // Opslag voor alle paden: allPaths[sim][year]
  const allPaths: number[][] = []

  // Tracking per simulatie
  const successFlags: boolean[] = []
  const fireAges: number[] = []
  let fireCount = 0

  // Per-jaar FIRE-bereikt tellers (voor successByAge)
  // fireReachedByYear[y] = aantal sims dat fireTarget bereikt heeft op of voor jaar y
  const fireReachedByYear: number[] | undefined = fireTarget != null
    ? new Array(yearsInPhase + 1).fill(0)
    : undefined

  for (let s = 0; s < sims; s++) {
    const rng = new SeededRandom(s * SEED_MULTIPLIER + SEED_OFFSET)
    let portfolio = startPortfolio
    const path: number[] = [Math.round(portfolio)]
    let everBelowMin = false
    let hasFired = false

    for (let y = 1; y <= yearsInPhase; y++) {
      const age = currentAge + y

      // Stochastisch rendement met Box 3 drag
      const annualReturn = rng.normal(netReturn, volatility)
      portfolio = portfolio * (1 + annualReturn)

      // Jaarlijkse cashflow (sparen of onttrekken)
      portfolio += yearlyCashflow

      // Life event cashflows voor deze leeftijd
      const cfAmount = resolveCashflowsForAge(cashflows, age)
      portfolio += cfAmount

      // Portfolio kan niet onder nul zakken
      portfolio = Math.max(0, portfolio)

      path.push(Math.round(portfolio))

      // Succes-tracking: portfolio onder minimum?
      if (portfolio < targetMinPortfolio) {
        everBelowMin = true
      }

      // FIRE-tracking voor opbouwfase
      if (fireTarget != null && !hasFired && portfolio >= fireTarget) {
        hasFired = true
        fireAges.push(age)
        fireCount++
      }

      // Cumulatieve FIRE-bereikt per jaar
      if (fireReachedByYear != null && hasFired) {
        fireReachedByYear[y]++
      }
    }

    allPaths.push(path)
    successFlags.push(!everBelowMin)
  }

  // Bereken percentielen per jaar
  const percentiles = {
    p10: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p90: [] as number[],
  }

  for (let y = 0; y <= yearsInPhase; y++) {
    const values = allPaths.map(p => p[y]).sort((a, b) => a - b)
    percentiles.p10.push(percentile(values, 0.10))
    percentiles.p25.push(percentile(values, 0.25))
    percentiles.p50.push(percentile(values, 0.50))
    percentiles.p75.push(percentile(values, 0.75))
    percentiles.p90.push(percentile(values, 0.90))
  }

  // Eindportfolio statistieken
  const endValues = allPaths.map(p => p[yearsInPhase]).sort((a, b) => a - b)
  const medianEndPortfolio = percentile(endValues, 0.50)
  const p10EndPortfolio = percentile(endValues, 0.10)
  const p90EndPortfolio = percentile(endValues, 0.90)

  // Slagingskans
  const successCount = successFlags.filter(Boolean).length
  const successRate = successCount / sims

  // Bouw resultaat op
  const result: MonteCarloPhaseResult = {
    percentiles,
    successRate,
    medianEndPortfolio,
    p10EndPortfolio,
    p90EndPortfolio,
  }

  // FIRE-statistieken alleen als fireTarget is opgegeven
  if (fireTarget != null) {
    result.fireAges = [...fireAges].sort((a, b) => a - b)
    result.fireProb = fireCount / sims

    // Per-leeftijd slagingskans
    const successByAge: { age: number; successRate: number }[] = []
    for (let y = 1; y <= yearsInPhase; y++) {
      successByAge.push({
        age: currentAge + y,
        successRate: (fireReachedByYear?.[y] ?? 0) / sims,
      })
    }
    result.successByAge = successByAge
  }

  return result
}

// ── Binary search: kritische onttrekkingsgrens ──────────────────────────────

/** Number of sims per binary search iteration (lightweight for speed) */
const BINARY_SEARCH_SIMS = 200

/** Max binary search iterations */
const BINARY_SEARCH_MAX_ITER = 8

/**
 * Zoekt via binary search de maximale jaarlijkse onttrekking met ≥ 90% slagingskans.
 *
 * Draait max 8 iteraties met 200 sims elk. De search-range is [0, yearlyWithdrawal × 1.5].
 * Als de huidige onttrekking al ≥ 90% slagingskans heeft, wordt die als resultaat teruggegeven.
 *
 * @param baseInput - MC-invoer met de originele yearlyCashflow (negatief = onttrekking)
 * @param currentSuccessRate - Slagingskans van de hoofdsimulatie (0-1)
 * @returns Maximale jaarlijkse onttrekking met ≥ 90% kans
 */
export function findCriticalWithdrawal(
  baseInput: MonteCarloPhaseInput,
  currentSuccessRate: number,
): number {
  const yearlyWithdrawal = Math.abs(baseInput.yearlyCashflow)

  // Als de huidige onttrekking al veilig is (≥ 90%), dan is dat de grens
  if (currentSuccessRate >= 0.9) return yearlyWithdrawal

  // Performance guard: geen fase = geen zinvolle grens
  if (baseInput.yearsInPhase <= 0) return yearlyWithdrawal

  let low = 0
  let high = yearlyWithdrawal * 1.5
  let best = 0

  for (let i = 0; i < BINARY_SEARCH_MAX_ITER; i++) {
    const mid = (low + high) / 2

    const result = runPhaseMonteCarlo(
      { ...baseInput, yearlyCashflow: -mid },
      BINARY_SEARCH_SIMS,
    )

    if (result.successRate >= 0.9) {
      // mid is veilig, probeer hoger
      best = mid
      low = mid
    } else {
      // mid is te hoog, probeer lager
      high = mid
    }
  }

  return Math.round(best)
}

// ── SORR-analyse ────────────────────────────────────────────────────────────

/**
 * Bereken het mediaan aantal jaren dat het portfolio meegaat (> 0) in een set paden.
 * Retourneert yearsInPhase als het portfolio nooit opraakt.
 */
function computeMedianPortfolioLifespan(
  allPaths: number[][],
  yearsInPhase: number,
): number {
  const lifespans: number[] = []
  for (const path of allPaths) {
    let lifespan = yearsInPhase
    for (let y = 1; y <= yearsInPhase; y++) {
      if (path[y] <= 0) {
        lifespan = y
        break
      }
    }
    lifespans.push(lifespan)
  }
  lifespans.sort((a, b) => a - b)
  return percentile(lifespans, 0.50)
}

/**
 * Interne MC-loop met optioneel geforceerde rendementen in de eerste jaren.
 * Retourneert ruwe paden en succes-tracking voor verdere analyse.
 */
function runMCWithForcedReturns(
  input: MonteCarloPhaseInput,
  forcedReturns: number[],
  sims: number,
): { allPaths: number[][]; successCount: number } {
  const {
    startPortfolio,
    yearsInPhase,
    yearlyCashflow,
    expectedReturn,
    volatility,
    cashflows = [],
    currentAge,
    targetMinPortfolio = 0,
    box3Drag = BOX3_DRAG,
  } = input

  const netReturn = expectedReturn - box3Drag
  const allPaths: number[][] = []
  let successCount = 0

  for (let s = 0; s < sims; s++) {
    const rng = new SeededRandom(s * SEED_MULTIPLIER + SEED_OFFSET)
    let portfolio = startPortfolio
    const path: number[] = [Math.round(portfolio)]
    let everBelowMin = false

    for (let y = 1; y <= yearsInPhase; y++) {
      const age = currentAge + y

      // Gebruik geforceerd rendement als beschikbaar, anders stochastisch
      let annualReturn: number
      if (y - 1 < forcedReturns.length) {
        annualReturn = forcedReturns[y - 1] - (box3Drag)
        // Consumeer de random waarde om de RNG-state synchroon te houden
        rng.normal(netReturn, volatility)
      } else {
        annualReturn = rng.normal(netReturn, volatility)
      }

      portfolio = portfolio * (1 + annualReturn)
      portfolio += yearlyCashflow
      portfolio += resolveCashflowsForAge(cashflows, age)
      portfolio = Math.max(0, portfolio)
      path.push(Math.round(portfolio))

      if (portfolio < targetMinPortfolio) {
        everBelowMin = true
      }
    }

    allPaths.push(path)
    if (!everBelowMin) successCount++
  }

  return { allPaths, successCount }
}

/**
 * Sequence of Returns Risk (SORR) analyse voor de onttrekkingsfase.
 *
 * Vergelijkt geforceerde rendement-scenario's (gunstig, ongunstig, crash) met
 * een baseline om het effect van volgorde-risico op het portfolio te meten.
 *
 * @param input     - Simulatie-invoer (typisch onttrekkingsfase)
 * @param scenarios - SORR-scenario's (default: SORR_SCENARIOS)
 * @param sims      - Aantal simulaties per scenario (default 500)
 */
export function runSORRAnalysis(
  input: MonteCarloPhaseInput,
  scenarios: SORRScenario[] = SORR_SCENARIOS,
  sims: number = DEFAULT_SIMS,
): SORRResult[] {
  // Baseline: geen geforceerde rendementen
  const baseline = runMCWithForcedReturns(input, [], sims)
  const baselineLifespan = computeMedianPortfolioLifespan(
    baseline.allPaths,
    input.yearsInPhase,
  )

  const results: SORRResult[] = []

  for (const scenario of scenarios) {
    const { allPaths, successCount } = runMCWithForcedReturns(
      input,
      scenario.earlyReturns,
      sims,
    )

    const endValues = allPaths.map(p => p[input.yearsInPhase]).sort((a, b) => a - b)
    const scenarioLifespan = computeMedianPortfolioLifespan(
      allPaths,
      input.yearsInPhase,
    )

    results.push({
      scenario: scenario.name,
      label: scenario.label,
      description: scenario.description,
      successRate: successCount / sims,
      medianEndPortfolio: percentile(endValues, 0.50),
      p10EndPortfolio: percentile(endValues, 0.10),
      yearsLostVsBaseline: Math.max(0, baselineLifespan - scenarioLifespan),
    })
  }

  return results
}

// ── Cashbuffer-analyse ──────────────────────────────────────────────────────

/**
 * Cashbuffer-analyse: vergelijk scenario's met en zonder cash reserve.
 *
 * Bij een cashbuffer wordt een deel van het portfolio apart gezet als onbelegd
 * geld. Gedurende de bufferperiode wordt uit de buffer onttrokken in plaats van
 * uit het belegde portfolio, waardoor het portfolio kan herstellen na een crash.
 *
 * @param input       - Simulatie-invoer (onttrekkingsfase, yearlyCashflow < 0)
 * @param bufferYears - Te vergelijken buffer-opties in jaren (default [0, 2, 3])
 * @param sims        - Aantal simulaties per variant (default 500)
 */
export function runCashBufferAnalysis(
  input: MonteCarloPhaseInput,
  bufferYears: number[] = [0, 2, 3],
  sims: number = DEFAULT_SIMS,
): CashBufferResult[] {
  const results: CashBufferResult[] = []

  // Jaarlijkse onttrekking (absoluut bedrag)
  const yearlyWithdrawal = Math.abs(input.yearlyCashflow)

  for (const years of bufferYears) {
    const bufferAmount = years * yearlyWithdrawal
    const investedPortfolio = Math.max(0, input.startPortfolio - bufferAmount)

    // Simuleer met aangepaste invoer:
    // - Lager startportfolio (buffer is apart gezet)
    // - Eerste bufferYears: geen onttrekking uit portfolio (cashflow = 0)
    // - Na bufferYears: normale onttrekking hervat
    const {
      yearsInPhase,
      expectedReturn,
      volatility,
      cashflows = [],
      currentAge,
      targetMinPortfolio = 0,
      box3Drag = BOX3_DRAG,
    } = input

    const netReturn = expectedReturn - box3Drag
    const allPaths: number[][] = []
    let successCount = 0

    for (let s = 0; s < sims; s++) {
      const rng = new SeededRandom(s * SEED_MULTIPLIER + SEED_OFFSET)
      let portfolio = investedPortfolio
      let remainingBuffer = bufferAmount
      const path: number[] = [Math.round(portfolio + remainingBuffer)]
      let everBelowMin = false

      for (let y = 1; y <= yearsInPhase; y++) {
        const age = currentAge + y
        const annualReturn = rng.normal(netReturn, volatility)

        // Beleggingsrendement op het geïnvesteerde deel
        portfolio = portfolio * (1 + annualReturn)

        // Life event cashflows
        portfolio += resolveCashflowsForAge(cashflows, age)

        if (remainingBuffer > 0) {
          // Onttrek uit buffer, niet uit portfolio
          const withdrawFromBuffer = Math.min(remainingBuffer, yearlyWithdrawal)
          remainingBuffer -= withdrawFromBuffer

          // Als de buffer niet toereikend is, onttrek het restant uit portfolio
          const shortfall = yearlyWithdrawal - withdrawFromBuffer
          if (shortfall > 0) {
            portfolio -= shortfall
          }
        } else {
          // Buffer uitgeput: onttrek uit portfolio
          portfolio += input.yearlyCashflow // negatief getal
        }

        portfolio = Math.max(0, portfolio)
        const totalValue = portfolio + remainingBuffer
        path.push(Math.round(totalValue))

        if (totalValue < targetMinPortfolio) {
          everBelowMin = true
        }
      }

      allPaths.push(path)
      if (!everBelowMin) successCount++
    }

    const endValues = allPaths.map(p => p[yearsInPhase]).sort((a, b) => a - b)

    results.push({
      bufferYears: years,
      bufferAmount: Math.round(bufferAmount),
      successRate: successCount / sims,
      medianEndPortfolio: percentile(endValues, 0.50),
    })
  }

  return results
}

// ── Per-leeftijd FIRE-slagingskans ──────────────────────────────────────────

/**
 * Bereken de kans op bereiken van het FIRE-doelvermogen bij elke opgegeven leeftijd.
 *
 * Draait één volledige MC-simulatie en volgt per jaar of het portfolio het
 * fireTarget overschrijdt. Retourneert de cumulatieve slagingskans per leeftijd.
 *
 * @param input - Simulatie-invoer met fireTarget (verplicht)
 * @param ages  - Leeftijden waarvoor de slagingskans gewenst is
 * @param sims  - Aantal simulaties (default 500)
 */
export function runMonteCarloAtAges(
  input: MonteCarloPhaseInput,
  ages: number[],
  sims: number = DEFAULT_SIMS,
): { age: number; successRate: number }[] {
  const fireTarget = input.fireTarget
  if (fireTarget == null || fireTarget <= 0) {
    // Zonder FIRE-target is slagingskans niet zinvol
    return ages.map(age => ({ age, successRate: 0 }))
  }

  const {
    startPortfolio,
    yearsInPhase,
    yearlyCashflow,
    expectedReturn,
    volatility,
    cashflows = [],
    currentAge,
    box3Drag = BOX3_DRAG,
  } = input

  const netReturn = expectedReturn - box3Drag

  // Vertaal gevraagde leeftijden naar simulatiejaren
  const ageToYear = new Map<number, number>()
  for (const age of ages) {
    const year = age - currentAge
    if (year >= 1 && year <= yearsInPhase) {
      ageToYear.set(age, year)
    }
  }

  // Tel per jaar hoeveel simulaties FIRE hebben bereikt
  const fireReachedByYear = new Array<number>(yearsInPhase + 1).fill(0)

  for (let s = 0; s < sims; s++) {
    const rng = new SeededRandom(s * SEED_MULTIPLIER + SEED_OFFSET)
    let portfolio = startPortfolio
    let hasFired = false

    for (let y = 1; y <= yearsInPhase; y++) {
      const age = currentAge + y
      const annualReturn = rng.normal(netReturn, volatility)

      portfolio = portfolio * (1 + annualReturn)
      portfolio += yearlyCashflow
      portfolio += resolveCashflowsForAge(cashflows, age)
      portfolio = Math.max(0, portfolio)

      if (!hasFired && portfolio >= fireTarget) {
        hasFired = true
      }

      if (hasFired) {
        fireReachedByYear[y]++
      }
    }
  }

  // Vertaal terug naar gevraagde leeftijden
  return ages.map(age => {
    const year = ageToYear.get(age)
    if (year == null) {
      // Leeftijd valt buiten simulatieperiode
      return { age, successRate: 0 }
    }
    return {
      age,
      successRate: fireReachedByYear[year] / sims,
    }
  })
}
