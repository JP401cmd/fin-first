import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertFinite, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import { runPhaseMonteCarlo, runSORRAnalysis, runCashBufferAnalysis, SORR_SCENARIOS } from '@/lib/phase-monte-carlo'
import { runPhaseStressTests, PRESET_STRESS_SCENARIOS, applyStressScenario } from '@/lib/phase-stress-test'
import {
  analyzeSchenkingPlan, analyzeHuisVerkopen, analyzeEndOfLife,
  compareOvergangStrategieen, berekenEerderStoppen, NL_SCHENKING_VRIJSTELLING,
} from '@/lib/phase-analysis'
import type { MonteCarloPhaseInput } from '@/lib/phase-monte-carlo'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import type { FireStrategyConfig } from '@/lib/fire-strategy'

const CAT = 'horizon.fase-analyse'

// ── Shared test inputs ──────────────────────────────────────────────────────

const MC_INPUT: MonteCarloPhaseInput = {
  startPortfolio: 500_000,
  yearsInPhase: 20,
  yearlyCashflow: -30_000, // withdrawal
  expectedReturn: 0.07,
  volatility: 0.15,
  inflationRate: 0.02,
  currentAge: 60,
}

/**
 * Minimal UnifiedProjectionRow factory — only fills the fields that the
 * stress test engine actually reads. All other fields default to zero.
 */
function makeRow(overrides: Partial<UnifiedProjectionRow> & { age: number; year?: number }): UnifiedProjectionRow {
  const base: UnifiedProjectionRow = {
    year: overrides.year ?? 0,
    age: overrides.age,
    phase: 'withdrawal' as const,
    assetBuckets: {},
    debtBalances: {},
    totalAssets: overrides.totalAssets ?? overrides.netWorth ?? overrides.startNetWorth ?? 0,
    totalDebts: 0,
    netWorth: overrides.netWorth ?? 500_000,
    startNetWorth: overrides.startNetWorth ?? 500_000,
    // Synthetische rij: volledig liquide (Prognose!J == I) — geen eigen woning in beeld.
    nettoLiquide: overrides.nettoLiquide ?? overrides.netWorth ?? 500_000,
    grossIncome: 0,
    savings: overrides.savings ?? 0,
    withdrawal: overrides.withdrawal ?? 30_000,
    withdrawalByType: {},
    cashflowNet: overrides.cashflowNet ?? 0,
    oneTimeNet: overrides.oneTimeNet ?? 0,
    totalGrowth: overrides.totalGrowth ?? 20_000,
    totalBox3: overrides.totalBox3 ?? 5_000,
    cumulativeBox3: overrides.cumulativeBox3 ?? 0,
    inflationFactor: overrides.inflationFactor ?? 1.0,
  }
  return base
}

/** Build a 20-year withdrawal-phase row sequence for stress tests. */
function makeStressRows(startNw: number = 500_000, years: number = 20): UnifiedProjectionRow[] {
  const rows: UnifiedProjectionRow[] = []
  let nw = startNw
  for (let i = 0; i < years; i++) {
    const growth = nw * 0.05 // ~5% net return
    const withdrawal = 30_000
    const box3 = nw * 0.02
    const startNwThisYear = nw
    nw = nw + growth - withdrawal - box3
    rows.push(makeRow({
      year: i,
      age: 60 + i,
      startNetWorth: startNwThisYear,
      netWorth: nw,
      totalGrowth: Math.round(growth),
      totalBox3: Math.round(box3),
      withdrawal,
      totalAssets: Math.max(0, nw),
    }))
  }
  return rows
}

// ── Test cases ──────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Monte Carlo tests ───────────────────────────────────────────────────
  {
    id: 'phase-mc-percentile-order',
    name: 'MC: percentielen in correcte volgorde',
    category: CAT,
    description: 'p10 <= p25 <= p50 <= p75 <= p90 op elk jaar',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      const result = runPhaseMonteCarlo(MC_INPUT)
      const { p10, p25, p50, p75, p90 } = result.percentiles
      assertEqual(p10.length, MC_INPUT.yearsInPhase + 1, 'p10 lengte')
      for (let y = 0; y <= MC_INPUT.yearsInPhase; y++) {
        assertLessThanOrEqual(p10[y], p25[y], `p10 <= p25 jaar ${y}`)
        assertLessThanOrEqual(p25[y], p50[y], `p25 <= p50 jaar ${y}`)
        assertLessThanOrEqual(p50[y], p75[y], `p50 <= p75 jaar ${y}`)
        assertLessThanOrEqual(p75[y], p90[y], `p75 <= p90 jaar ${y}`)
      }
    },
  },
  {
    id: 'phase-mc-success-range',
    name: 'MC: successRate tussen 0 en 1',
    category: CAT,
    description: 'Slagingskans is een geldige fractie',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      const result = runPhaseMonteCarlo(MC_INPUT)
      assertGreaterThanOrEqual(result.successRate, 0, 'successRate >= 0')
      assertLessThanOrEqual(result.successRate, 1, 'successRate <= 1')
      assertFinite(result.successRate, 'successRate is finite')
    },
  },
  {
    id: 'phase-mc-deterministic',
    name: 'MC: deterministische uitkomst met seed',
    category: CAT,
    description: 'Identieke invoer produceert identieke uitvoer (seeded RNG)',
    priority: 'high',
    estimatedDurationMs: 1000,
    fn() {
      const r1 = runPhaseMonteCarlo(MC_INPUT, 100)
      const r2 = runPhaseMonteCarlo(MC_INPUT, 100)
      assertEqual(r1.successRate, r2.successRate, 'successRate gelijk')
      assertEqual(r1.medianEndPortfolio, r2.medianEndPortfolio, 'medianEnd gelijk')
      assertEqual(r1.p10EndPortfolio, r2.p10EndPortfolio, 'p10End gelijk')
      assertEqual(r1.p90EndPortfolio, r2.p90EndPortfolio, 'p90End gelijk')
      // Spot-check a few percentile values
      for (let y = 0; y <= MC_INPUT.yearsInPhase; y += 5) {
        assertEqual(r1.percentiles.p50[y], r2.percentiles.p50[y], `p50 jaar ${y} gelijk`)
      }
    },
  },
  {
    id: 'phase-mc-withdrawal-drains',
    name: 'MC: hoge onttrekking bij laag vermogen geeft lage slagingskans',
    category: CAT,
    description: 'Combinatie van hoge uitgaven en klein portfolio leidt tot lage successRate',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      const drainInput: MonteCarloPhaseInput = {
        ...MC_INPUT,
        startPortfolio: 100_000,
        yearlyCashflow: -50_000, // onttrekt 50% per jaar
        yearsInPhase: 20,
      }
      const result = runPhaseMonteCarlo(drainInput, 200)
      assertLessThan(result.successRate, 0.5, 'lage slagingskans bij drainage')
    },
  },
  {
    id: 'phase-mc-accumulation-grows',
    name: 'MC: positief sparen laat mediaan groeien',
    category: CAT,
    description: 'Opbouwfase met positieve cashflow → medianEndPortfolio > startPortfolio',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      const accumInput: MonteCarloPhaseInput = {
        ...MC_INPUT,
        yearlyCashflow: 20_000, // positief sparen
        startPortfolio: 200_000,
        yearsInPhase: 15,
        currentAge: 35,
      }
      const result = runPhaseMonteCarlo(accumInput, 200)
      assertGreaterThan(
        result.medianEndPortfolio,
        accumInput.startPortfolio,
        'mediaan eindportefeuille > startportfolio',
      )
    },
  },

  // ── Stress test tests ─────────────────────────────────────────────────────
  {
    id: 'phase-stress-crash-reduces',
    name: 'Stress: marktcrash verlaagt eindvermogen',
    category: CAT,
    description: 'Market crash scenario geeft lager eindvermogen dan baseline',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const rows = makeStressRows()
      const results = runPhaseStressTests(rows, {
        expectedReturn: 0.07,
        inflationRate: 0.02,
        yearlyExpenses: 30_000,
      })
      // Find the market_crash result
      const crash = results.find(r => r.scenario.type === 'market_crash')
      assertNotNull(crash, 'market_crash scenario gevonden')
      assertLessThan(crash.endPortfolio, crash.baseEndPortfolio, 'crash verlaagt eindvermogen')
      assertLessThan(crash.endPortfolioDelta, 0, 'delta is negatief')
    },
  },
  {
    id: 'phase-stress-inflation-reduces',
    name: 'Stress: langdurige inflatie verlaagt eindvermogen',
    category: CAT,
    description: 'Prolonged inflation scenario geeft lager eindvermogen dan baseline',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const rows = makeStressRows()
      const results = runPhaseStressTests(rows, {
        expectedReturn: 0.07,
        inflationRate: 0.02,
        yearlyExpenses: 30_000,
      })
      const inflation = results.find(r => r.scenario.type === 'prolonged_inflation')
      assertNotNull(inflation, 'prolonged_inflation scenario gevonden')
      assertLessThan(inflation.endPortfolio, inflation.baseEndPortfolio, 'inflatie verlaagt eindvermogen')
    },
  },
  {
    id: 'phase-stress-longer-life',
    name: 'Stress: langer leven geeft lager eindvermogen',
    category: CAT,
    description: 'Longer life scenario resulteert in meer verbruik of lager eindvermogen',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const rows = makeStressRows()
      const results = runPhaseStressTests(rows, {
        expectedReturn: 0.07,
        inflationRate: 0.02,
        yearlyExpenses: 30_000,
      })
      const longerLife = results.find(r => r.scenario.type === 'longer_life')
      assertNotNull(longerLife, 'longer_life scenario gevonden')
      // Living longer means either lower end portfolio or depletion
      assertLessThanOrEqual(
        longerLife.endPortfolio,
        longerLife.baseEndPortfolio,
        'langer leven verlaagt eindvermogen',
      )
    },
  },

  // ── Combined crisis regression test ────────────────────────────────────────
  {
    id: 'phase-stress-combined-crisis-worse',
    name: 'Stress: combined crisis erger dan elk apart',
    category: CAT,
    description: 'Combinatie crash+inflatie geeft grotere delta en lagere successRate dan market_crash of prolonged_inflation alleen',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const rows = makeStressRows()
      const stressParams = {
        expectedReturn: 0.07,
        inflationRate: 0.02,
        yearlyExpenses: 30_000,
      }

      // Stap 1: Run market_crash, noteer delta A
      const crashScenario = PRESET_STRESS_SCENARIOS.find(s => s.type === 'market_crash')!
      const crashResult = applyStressScenario(rows, crashScenario, stressParams)
      const deltaA = crashResult.endPortfolioDelta
      assertFinite(deltaA, 'market_crash delta is een eindig getal')

      // Stap 2: Run prolonged_inflation, noteer delta B
      const inflationScenario = PRESET_STRESS_SCENARIOS.find(s => s.type === 'prolonged_inflation')!
      const inflationResult = applyStressScenario(rows, inflationScenario, stressParams)
      const deltaB = inflationResult.endPortfolioDelta
      assertFinite(deltaB, 'prolonged_inflation delta is een eindig getal')

      // Stap 3: Run combined_crisis, noteer delta C
      const combinedScenario = PRESET_STRESS_SCENARIOS.find(s => s.type === 'combined_crisis')!
      const combinedResult = applyStressScenario(rows, combinedScenario, stressParams)
      const deltaC = combinedResult.endPortfolioDelta
      assertFinite(deltaC, 'combined_crisis delta is een eindig getal')

      // Stap 4: |C| >= max(|A|, |B|) — combined impact is at least as bad as worst individual
      const absDeltaA = Math.abs(deltaA)
      const absDeltaB = Math.abs(deltaB)
      const absDeltaC = Math.abs(deltaC)
      assertGreaterThanOrEqual(
        absDeltaC,
        Math.max(absDeltaA, absDeltaB),
        `|combined delta| (${absDeltaC}) >= max(|crash| ${absDeltaA}, |inflation| ${absDeltaB})`,
      )

      // Stap 5: successRate combined <= min(successRate crash, successRate inflation)
      assertLessThanOrEqual(
        combinedResult.estimatedSuccessRate,
        Math.min(crashResult.estimatedSuccessRate, inflationResult.estimatedSuccessRate),
        `combined successRate (${combinedResult.estimatedSuccessRate}) <= min(crash ${crashResult.estimatedSuccessRate}, inflation ${inflationResult.estimatedSuccessRate})`,
      )
    },
  },

  // ── Phase analysis tests ──────────────────────────────────────────────────
  {
    id: 'phase-analysis-schenking-vrijstelling',
    name: 'Schenking: binnen vrijstelling → 0 belasting',
    category: CAT,
    description: 'Schenking binnen jaarlijkse kindvrijstelling resulteert in nul schenkbelasting',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const result = analyzeSchenkingPlan(
        {
          relatieOntvanger: 'kind',
          bedragPerJaar: NL_SCHENKING_VRIJSTELLING.jaarlijksKind, // exact op de grens
          aantalOntvangers: 1,
          aantalJaren: 3,
          startAge: 45,
        },
        {
          currentPortfolio: 800_000,
          yearlyExpenses: 40_000,
          annualSavings: 20_000,
          expectedReturn: 0.07,
          inflationRate: 0.02,
          currentAge: 45,
          fireAge: 55,
        },
      )
      assertEqual(result.totaalSchenkbelasting, 0, 'geen belasting binnen vrijstelling')
      assertGreaterThan(result.totaalGeschonken, 0, 'er is daadwerkelijk geschonken')
      assertEqual(
        result.totaalGeschonken,
        Math.round(NL_SCHENKING_VRIJSTELLING.jaarlijksKind * 1 * 3),
        'totaal geschonken klopt',
      )
    },
  },
  {
    id: 'phase-analysis-huis-breakeven',
    name: 'Huis verkopen: breakeven huur > 0',
    category: CAT,
    description: 'De breakeven maandelijkse huurprijs moet een positief bedrag zijn',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const result = analyzeHuisVerkopen(
        {
          woningWaarde: 400_000,
          hypotheekResterend: 150_000,
          maandlastHypotheek: 800,
          woningWaardeGroei: 0.03,
          maandlastOverig: 200,
          verwachteHuur: 1_200,
          verkoopkostenPct: 0.04,
          horizonJaren: 15,
        },
        0.07, // investmentReturn
        0.02, // inflationRate
      )
      assertGreaterThan(result.breakevenHuur, 0, 'breakeven huur is positief')
      assertFinite(result.breakevenHuur, 'breakeven huur is finite')
      // Verify that jaarlijkse vergelijking has correct number of entries
      assertEqual(result.jaarlijkseVergelijking.length, 15, '15 jaren in vergelijking')
    },
  },
  {
    id: 'phase-analysis-overgang-2-strategieen',
    name: 'Overgang: retourneert exact 2 strategieën',
    category: CAT,
    description: 'compareOvergangStrategieen geeft gelijkmatig en afbouwend (deeltijdwerk is verplaatst naar de zelfstandige analyse)',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const result = compareOvergangStrategieen(
        600_000, // startPortfolio
        55,      // startAge
        67,      // endAge (AOW)
        40_000,  // yearlyExpenses
        0.07,    // expectedReturn
        0.02,    // inflationRate
      )
      assertEqual(result.length, 2, 'exact 2 strategieën')
      // Verify the two strategy names
      const names = result.map(r => r.strategie)
      assert(names.includes('gelijkmatig'), 'bevat gelijkmatig')
      assert(names.includes('afbouwend'), 'bevat afbouwend')
      assert(!names.includes('deeltijdwerk' as never), 'bevat GEEN deeltijdwerk')
      // Each strategy should have 12 years of data (55 to 67)
      for (const strat of result) {
        assertEqual(strat.jaarlijkseOnttrekking.length, 12, `${strat.strategie} heeft 12 jaren`)
      }
    },
  },
  {
    id: 'phase-analysis-eerder-stoppen-extra',
    name: 'Eerder stoppen: meer jaren eerder → meer extra sparen',
    category: CAT,
    description: 'Hoe meer jaren eerder je wilt stoppen, hoe meer extra je moet sparen',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const dummyCashflows: [] = []
      const dummyStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const result = berekenEerderStoppen(
        40,       // currentAge
        55,       // currentFireAge
        300_000,  // currentPortfolio
        40_000,   // yearlyExpenses
        20_000,   // currentAnnualSavings
        0.07,     // expectedReturn
        0.02,     // inflationRate
        dummyCashflows,
        dummyStrategy,
        { years: [1, 2, 3, 5] },
      )
      assertGreaterThanOrEqual(result.opties.length, 4, 'minstens 4 opties')
      // Each option carries a single 3-tier status from the lib
      for (const o of result.opties) {
        assert(
          o.status === 'haalbaar' || o.status === 'krap' || o.status === 'niet-haalbaar',
          `optie ${o.jarenEerder}j heeft geldige status`,
        )
      }
      // For feasible options: more years earlier → more extra savings
      const feasible = result.opties.filter(o => o.status !== 'niet-haalbaar')
      for (let i = 1; i < feasible.length; i++) {
        assertGreaterThanOrEqual(
          feasible[i].extraMaandelijksBesparen,
          feasible[i - 1].extraMaandelijksBesparen,
          `optie ${feasible[i].jarenEerder}j extra >= optie ${feasible[i - 1].jarenEerder}j extra`,
        )
      }
    },
  },
]

// ── Registration ────────────────────────────────────────────────────────────

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — Fase-analyse',
    description: 'Tests voor Monte Carlo simulatie, stresstests en fase-specifieke analyses',
    icon: 'BarChart3',
    testCount: 0,
  })
  registerTests(tests)
}
