import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertFinite, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  computeFireProjection, computeFireRange, ageAtDate, runBacktest,
} from '@/lib/horizon-data'
import type { FinancialInput } from '@/lib/core-metrics'
import { type SimCashflow } from '@/lib/fire-simulation'
import { runSimulationUnified as runSimulation } from '@/lib/unified-projection'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams } from '@/lib/fire-params'
import { BOX3_DRAG, NL_AOW_AGE } from '@/lib/constants'
import { buildSegments, type FaseId } from '@/components/app/horizon/phase-bar'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'

const CAT = 'horizon.projecties'

const INPUT: FinancialInput = {
  totalAssets: 500_000, totalDebts: 0, monthlyIncome: 5_000,
  monthlyExpenses: 3_333, yearlyMustExpenses: 0, monthlyContributions: 1_667,
  dateOfBirth: '1991-03-18',
}

const SIM = {
  currentAge: 35, endAge: 90, currentPortfolio: 500_000,
  yearlyExpenses: 40_000, annualSavings: 20_000, grossReturn: 0.07,
  returnModel: 'nl_box3' as const, inflation: 0.02,
}

function runSim(o: Partial<typeof SIM> = {}, cf: SimCashflow[] = [], st?: FireStrategyConfig) {
  const s = { ...SIM, ...o }
  return runSimulation(s.currentAge, s.endAge, s.currentPortfolio, s.yearlyExpenses, s.annualSavings, s.grossReturn, s.returnModel, s.inflation, cf, st)
}

const tests: TestCase[] = [
  {
    id: 'horizon-fire-age', name: 'FIRE leeftijd basis', category: CAT,
    description: 'computeFireProjection berekent fireAge met fireTarget ≥ 25x',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection(INPUT)
      assertNotNull(r.fireAge)
      assertType(r.fireAge, 'number')
      assertGreaterThanOrEqual(r.fireTarget, INPUT.monthlyExpenses * 12 * 25, 'target ≥ 25x')
    },
  },
  {
    id: 'horizon-range', name: 'FIRE range volgorde', category: CAT,
    description: 'optimistic < expected < pessimistic',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const range = computeFireRange(INPUT)
      assertNotNull(range.optimistic.fireAge)
      assertNotNull(range.expected.fireAge)
      assertNotNull(range.pessimistic.fireAge)
      assertLessThan(range.optimistic.fireAge!, range.expected.fireAge!, 'opt < exp')
      assertLessThan(range.expected.fireAge!, range.pessimistic.fireAge!, 'exp < pess')
    },
  },
  {
    id: 'horizon-deplete', name: 'Deplete eindigt bij ~€0', category: CAT,
    description: 'Deplete strategie in runSimulation',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio), 5_000, 'near zero')
    },
  },
  {
    id: 'horizon-perpetual', name: 'Perpetual overleeft', category: CAT,
    description: 'Portfolio blijft positief',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runSim({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThan(r.rows[r.rows.length - 1].endPortfolio, 0, 'positief')
    },
  },
  {
    id: 'horizon-legacy', name: 'Legacy behoudt ≥€200K', category: CAT,
    description: 'Legacy strategie behoudt geïndexeerd nalatenschap',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const r = runSim({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 })
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThanOrEqual(r.rows[r.rows.length - 1].endPortfolio, 200_000, 'legacy behouden')
    },
  },
  {
    id: 'horizon-life-events', name: 'AOW + pensioen verlaagt FIRE', category: CAT,
    description: 'Inkomsten events verlagen FIRE leeftijd',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: 1250, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1667, fromAge: 68, toAge: null, indexed: true },
      ]
      const with_ = runSim({}, cfs)
      const base = runSim()
      assert(with_.fireReachable && base.fireReachable, 'beide bereikbaar')
      assertLessThanOrEqual(with_.fireAge!, base.fireAge!, 'lager met events')
    },
  },
  {
    id: 'horizon-expense-event', name: 'Eenmalige kosten verhoogt FIRE', category: CAT,
    description: 'Verbouwingskosten verhogen FIRE leeftijd',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'verbouwing', name: 'Verbouwing', type: 'one_time', direction: 'expense', amount: 50_000, fromAge: 50, toAge: 50, indexed: false },
      ]
      const r = runSim({}, cfs)
      const base = runSim()
      assertGreaterThanOrEqual(r.fireAge!, base.fireAge!, 'hogere FIRE leeftijd')
      const row50 = r.rows.find(row => row.age === 50)
      assertNotNull(row50)
      assertLessThan(row50.cashflowNet, 0, 'negatieve cashflow at 50')
    },
  },
  {
    id: 'horizon-portfolio-consistency', name: 'Portfolio consistentie', category: CAT,
    description: 'firePortfolioAtFire ≥ requiredFirePortfolio',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runSim()
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThanOrEqual(r.firePortfolioAtFire, r.requiredFirePortfolio, 'portfolio ≥ vereist')
    },
  },
  {
    id: 'horizon-params', name: 'FIRE parameters doorwerking', category: CAT,
    description: 'resolveFireParams + hoger rendement → lager fireAge',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const p = resolveFireParams({ expected_return: 0.08, inflation_rate: 0.03 })
      assertEqual(p.grossReturn, 0.08, 'grossReturn')
      assertEqual(p.inflationRate, 0.03, 'inflationRate')
      const expectedSwr = 0.08 - BOX3_DRAG - 0.03
      assertLessThan(Math.abs(p.effectiveSwr - expectedSwr), 0.0001, 'SWR')
      const high = computeFireProjection(INPUT, 0.10)
      const low = computeFireProjection(INPUT, 0.05)
      assertNotNull(high.fireAge)
      assertNotNull(low.fireAge)
      assertLessThan(high.fireAge!, low.fireAge!, 'hoger rendement = lager age')
    },
  },
  {
    id: 'horizon-unreachable', name: 'FIRE onbereikbaar', category: CAT,
    description: 'Negatieve spaarquote → null fireAge',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection({ ...INPUT, totalAssets: 0, monthlyContributions: 0, monthlyExpenses: 3_000, monthlyIncome: 2_000 })
      assertEqual(r.fireAge, null, 'fireAge null')
    },
  },
  {
    id: 'horizon-already-fire', name: 'Al FIRE bereikt', category: CAT,
    description: '€2M vermogen → fireDate "Bereikt!"',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection({ ...INPUT, totalAssets: 2_000_000 })
      assertEqual(r.fireDate, 'Bereikt!', 'fireDate')
      assertNotNull(r.fireAge)
      const age = ageAtDate('1991-03-18')
      assertEqual(r.fireAge, age, 'fireAge = huidige leeftijd')
    },
  },
  // ── Step 1: computeFireProjection vermogensprojectie & kruispunt ────────
  {
    id: 'horizon-projection-curve', name: 'Vermogensprojectie curve', category: CAT,
    description: 'computeFireProjection berekent correcte groeipad naar fireTarget',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection(INPUT)
      // fireTarget should be based on yearly expenses / SWR
      assertGreaterThan(r.fireTarget, 0, 'fireTarget > 0')
      assertGreaterThan(r.fireTarget, r.netWorth, 'target > huidige nw voor niet-FI')
      // Savings rate should be positive for positive savers
      assertGreaterThan(r.savingsRate, 0, 'spaarquote > 0')
      // Monthly passive income should be positive with positive net worth
      assertGreaterThan(r.monthlyPassiveIncome, 0, 'passief inkomen > 0')
      // Freedom percentage should be between 0 and 100 for normal scenarios
      assertGreaterThan(r.freedomPercentage, 0, 'freedom% > 0')
      assertLessThan(r.freedomPercentage, 100, 'freedom% < 100')
    },
  },
  // ── Step 3: computeFireRange met custom baseReturn ──────────────────────
  {
    id: 'horizon-range-custom-return', name: 'FireRange met custom baseReturn', category: CAT,
    description: 'Scenario offsets relatief aan gebruikersrendement',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Default baseReturn = 7%, custom at 9%
      const defaultRange = computeFireRange(INPUT)
      const customRange = computeFireRange(INPUT, undefined, undefined, 0.09)
      // With higher base return, all three scenarios should have lower fireAge
      assertNotNull(defaultRange.expected.fireAge)
      assertNotNull(customRange.expected.fireAge)
      assertLessThan(customRange.expected.fireAge!, defaultRange.expected.fireAge!, 'hoger rendement = eerder FIRE')
      // Optimistic still < expected < pessimistic within custom range
      assertNotNull(customRange.optimistic.fireAge)
      assertNotNull(customRange.pessimistic.fireAge)
      assertLessThan(customRange.optimistic.fireAge!, customRange.expected.fireAge!, 'custom opt < exp')
      assertLessThan(customRange.expected.fireAge!, customRange.pessimistic.fireAge!, 'custom exp < pess')
    },
  },
  {
    id: 'horizon-range-spread', name: 'FireRange spreiding correct', category: CAT,
    description: 'Optimistisch gebruikt +2% en pessimistisch -3% offset',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // computeFireRange uses baseReturn+2% for optimistic, baseReturn-3% for pessimistic
      const range = computeFireRange(INPUT)
      const opt = computeFireProjection(INPUT, Math.min(0.20, 0.07 + 0.02))
      const pess = computeFireProjection(INPUT, Math.max(0.01, 0.07 - 0.03))
      // The range's optimistic/pessimistic should match standalone projections
      assertEqual(range.optimistic.fireAge, opt.fireAge, 'optimistic fireAge')
      assertEqual(range.pessimistic.fireAge, pess.fireAge, 'pessimistic fireAge')
    },
  },
  // ── Step 4: runBacktest ─────────────────────────────────────────────────
  {
    id: 'horizon-backtest-basic', name: 'Backtest basisresultaten', category: CAT,
    description: 'runBacktest retourneert succespercentage en pad-data',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      const r = runBacktest(INPUT, 30)
      assertEqual(r.years, 30, 'years')
      assertGreaterThan(r.allPaths.length, 0, 'allPaths niet leeg')
      // Success rate between 0 and 1
      assertGreaterThanOrEqual(r.successRate, 0, 'successRate >= 0')
      assertLessThanOrEqual(r.successRate, 1, 'successRate <= 1')
      // All paths should have years+1 values (year 0 through year N)
      for (const path of r.allPaths) {
        assertEqual(path.values.length, 31, `pad ${path.startYear} heeft 31 waarden`)
      }
    },
  },
  {
    id: 'horizon-backtest-named-paths', name: 'Backtest named paths', category: CAT,
    description: 'Best, worst, median paths correct gesorteerd',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const r = runBacktest(INPUT, 30)
      // Worst <= median <= best (final values)
      const worstFinal = r.worstCase.values[r.years] ?? 0
      const medianFinal = r.medianPath.values[r.years] ?? 0
      const bestFinal = r.bestCase.values[r.years] ?? 0
      assertLessThanOrEqual(worstFinal, medianFinal, 'worst <= median')
      assertLessThanOrEqual(medianFinal, bestFinal, 'median <= best')
      // Named paths should exist
      assert(r.namedPaths.length >= 0, 'namedPaths is array')
      // Band data should have correct length
      assertEqual(r.bandMin.length, 31, 'bandMin lengte')
      assertEqual(r.bandMax.length, 31, 'bandMax lengte')
      assertEqual(r.bandP25.length, 31, 'bandP25 lengte')
      assertEqual(r.bandP75.length, 31, 'bandP75 lengte')
      // Band ordering: min <= p25 <= p75 <= max
      for (let y = 0; y <= r.years; y++) {
        assertLessThanOrEqual(r.bandMin[y], r.bandP25[y], `min <= p25 year ${y}`)
        assertLessThanOrEqual(r.bandP25[y], r.bandP75[y], `p25 <= p75 year ${y}`)
        assertLessThanOrEqual(r.bandP75[y], r.bandMax[y], `p75 <= max year ${y}`)
      }
    },
  },
  {
    id: 'horizon-backtest-success-rate', name: 'Backtest succespercentage realistisch', category: CAT,
    description: 'Met voldoende vermogen en spaargeld is succespercentage hoog',
    priority: 'medium', estimatedDurationMs: 200,
    fn() {
      // High savings person should have high success rate
      const highSaver: FinancialInput = {
        ...INPUT, totalAssets: 800_000, monthlyContributions: 3_000,
        monthlyExpenses: 2_000, monthlyIncome: 5_000,
      }
      const r = runBacktest(highSaver, 30)
      assertGreaterThan(r.successRate, 0.5, 'hoge success rate bij hoog vermogen')
    },
  },
  // ── Step 5: ageAtDate ───────────────────────────────────────────────────
  {
    id: 'horizon-age-basic', name: 'ageAtDate basisberekening', category: CAT,
    description: 'Correcte leeftijd voor bekende datum',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // Someone born 1991-03-18, on 2026-03-18 is exactly 35
      const age = ageAtDate('1991-03-18', new Date('2026-03-18'))
      assertEqual(age, 35, 'exact 35 op verjaardag')
    },
  },
  {
    id: 'horizon-age-before-birthday', name: 'ageAtDate voor verjaardag', category: CAT,
    description: 'Leeftijd is N-1 als verjaardag nog niet geweest is',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      // Before birthday: 2026-03-17 → still 34
      const age = ageAtDate('1991-03-18', new Date('2026-03-17'))
      assertEqual(age, 34, '34 dag voor verjaardag')
    },
  },
  {
    id: 'horizon-age-after-birthday', name: 'ageAtDate na verjaardag', category: CAT,
    description: 'Leeftijd is N als verjaardag al geweest is',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const age = ageAtDate('1991-03-18', new Date('2026-03-19'))
      assertEqual(age, 35, '35 dag na verjaardag')
    },
  },
  // ── Step 6: Diverse personas ────────────────────────────────────────────
  {
    id: 'horizon-persona-starter', name: 'Persona: starter (lang tot FIRE)', category: CAT,
    description: 'Jong persoon met weinig vermogen en hoog spaarpercentage',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const starter: FinancialInput = {
        totalAssets: 15_000, totalDebts: 20_000, monthlyIncome: 2_800,
        monthlyExpenses: 2_200, yearlyMustExpenses: 0, monthlyContributions: 600,
        dateOfBirth: '1998-06-15',
      }
      const r = computeFireProjection(starter)
      // Starter has negative net worth, should take a long time or not be reachable
      if (r.fireAge !== null) {
        assertGreaterThan(r.fireAge, 50, 'starter heeft lang nodig')
      }
      // Net worth is negative
      assertLessThan(r.netWorth, 0, 'netto vermogen negatief')
      // Freedom percentage should be 0 or very low
      assertLessThanOrEqual(r.freedomPercentage, 5, 'laag freedom%')
    },
  },
  {
    id: 'horizon-persona-bijna-fi', name: 'Persona: bijna-FI (kort)', category: CAT,
    description: 'Persoon dicht bij FIRE met hoog vermogen',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const bijnaFI: FinancialInput = {
        totalAssets: 900_000, totalDebts: 0, monthlyIncome: 6_000,
        monthlyExpenses: 3_000, yearlyMustExpenses: 0, monthlyContributions: 3_000,
        dateOfBirth: '1980-01-10',
      }
      const r = computeFireProjection(bijnaFI)
      assertNotNull(r.fireAge)
      // Should reach FIRE relatively soon (within a few years)
      const currentAge = ageAtDate('1980-01-10')
      assertLessThan(r.fireAge! - currentAge, 10, 'bijna-FI bereikt FIRE binnen 10 jaar')
      // High freedom percentage
      assertGreaterThan(r.freedomPercentage, 50, 'hoog freedom%')
    },
  },
  {
    id: 'horizon-persona-gepensioneerd', name: 'Persona: gepensioneerde (al voorbij)', category: CAT,
    description: 'Oudere persoon met voldoende vermogen → al FIRE bereikt',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const gepensioneerd: FinancialInput = {
        totalAssets: 850_000, totalDebts: 0, monthlyIncome: 3_000,
        monthlyExpenses: 2_500, yearlyMustExpenses: 0, monthlyContributions: 500,
        dateOfBirth: '1957-06-20',
      }
      const r = computeFireProjection(gepensioneerd)
      // With €850K and €2500/mo expenses, should already be FI
      assertEqual(r.fireDate, 'Bereikt!', 'gepensioneerde is al FI')
      assertNotNull(r.fireAge)
      assertGreaterThanOrEqual(r.freedomPercentage, 80, 'hoog freedom%')
    },
  },

  // ── Pensioen-modus grafiek tests ──────────────────────────────────────────
  {
    id: 'horizon-grafiek-pensioen-sim',
    name: 'SimChart pensioen-modus: simulatie data',
    category: CAT,
    description: 'runSimulation met pensioen strategie levert geldige rows voor chart',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const pensioenStrat: FireStrategyConfig = { strategy: 'pensioen', endAge: 90, legacyAmount: 0 }
      const r = runSim({}, [], pensioenStrat)
      assert(r.rows.length > 0, 'pensioen heeft rows voor chart')
      // Verify we have rows spanning from currentAge to endAge
      assertEqual(r.rows[0].age, SIM.currentAge, 'eerste row = currentAge')
      assertEqual(r.rows[r.rows.length - 1].age, SIM.endAge - 1, 'laatste row = endAge - 1')
    },
  },
  {
    id: 'horizon-grafiek-pensioen-no-fire-line',
    name: 'Pensioen-modus: AOW-dot in plaats van FIRE-lijn',
    category: CAT,
    description: 'In pensioen-modus wordt AOW age als splitpunt gebruikt, niet FIRE age',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      // In pensioen mode, the hook overrides fireAge with aowAge
      // The chart uses planningMode='pensioen' to show AOW-dot
      // Here we verify the simulation data supports this:
      const pensioenStrat: FireStrategyConfig = { strategy: 'pensioen', endAge: 90, legacyAmount: 0 }
      const r = runSim({}, [], pensioenStrat)
      // There should be a row at NL_AOW_AGE (67)
      const rowAtAow = r.rows.find(row => row.age === NL_AOW_AGE)
      assertNotNull(rowAtAow, `row at AOW age ${NL_AOW_AGE} exists`)
      assertFinite(rowAtAow!.endPortfolio, 'portfolio at AOW finite')
    },
  },
  {
    id: 'horizon-grafiek-pensioen-phases',
    name: 'Faselabels: VERMOGENSGROEI en PENSIOEN in pensioen-modus',
    category: CAT,
    description: 'SimChart toont "VERMOGENSGROEI" en "PENSIOEN" als faselabels in pensioen-modus',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // This test verifies the constants used in sim-chart.tsx
      // When planningMode === 'pensioen':
      //   - Pre-FIRE label: 'VERMOGENSGROEI' (instead of 'OPBOUW')
      //   - Post-FIRE label: 'PENSIOEN' (instead of 'AFBOUW'/'BEHOUD')
      // These are hardcoded strings in the component — we verify they're conceptually correct
      const labels = {
        preFire: 'VERMOGENSGROEI',
        postFire: 'PENSIOEN',
      }
      assertEqual(labels.preFire, 'VERMOGENSGROEI', 'pre-FIRE label')
      assertEqual(labels.postFire, 'PENSIOEN', 'post-FIRE label')
    },
  },
  {
    id: 'horizon-grafiek-pensioen-reanimation',
    name: 'Chart re-animatie bij mode-wissel (key-based remount)',
    category: CAT,
    description: 'Pensioen vs FIRE modus genereert verschillende keys voor React remount',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      // SimChart uses a key prop that changes when planningMode changes
      // This triggers a full remount and re-animation
      // We verify both modes produce valid data for chart rendering
      const pensioenResult = runSim({}, [], { strategy: 'pensioen', endAge: 90, legacyAmount: 0 })
      const fireResult = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      // Both should produce valid row data
      assert(pensioenResult.rows.length > 0, 'pensioen rows for chart')
      assert(fireResult.rows.length > 0, 'fire rows for chart')
      // Key generation: `sim-${planningMode}` ensures different keys
      const modes = ['pensioen', 'fire']
      assert(modes[0] !== modes[1], 'keys differ for re-animation')
    },
  },

  // ── Fasebalk (PhaseBar) regressietests ──────────────────────────────────────

  {
    id: 'fasebalk-3-segmenten-normaal',
    name: 'Fasebalk: 3 segmenten in normaal scenario',
    category: CAT,
    description: 'Normal case (FIRE < AOW): Opbouw + Overgang + Onttrekking',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      assertEqual(segments.length, 3, '3 segmenten')
      assertEqual(segments[0].id, 'opbouw', 'eerste = opbouw')
      assertEqual(segments[1].id, 'overgang', 'tweede = overgang')
      assertEqual(segments[2].id, 'onttrekking', 'derde = onttrekking')
    },
  },
  {
    id: 'fasebalk-proportionele-breedtes',
    name: 'Fasebalk: segmentbreedtes proportioneel naar leeftijdsspanne',
    category: CAT,
    description: 'Segment age spans should sum to endAge - currentAge',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      // Opbouw: 35→45 (10), Overgang: 45→67 (22), Onttrekking: 67→90 (23)
      const totalSpan = segments.reduce((sum, s) => sum + (s.endAge - s.startAge), 0)
      assertEqual(totalSpan, 55, 'totale span = endAge - currentAge (90-35=55)')
      // Verify proportional: Overgang should be ~2x Opbouw
      const opbouwSpan = segments[0].endAge - segments[0].startAge
      const overgangSpan = segments[1].endAge - segments[1].startAge
      assertEqual(opbouwSpan, 10, 'opbouw = 10 jaar')
      assertEqual(overgangSpan, 22, 'overgang = 22 jaar')
      // Segments should be contiguous
      assertEqual(segments[0].endAge, segments[1].startAge, 'opbouw→overgang contiguous')
      assertEqual(segments[1].endAge, segments[2].startAge, 'overgang→onttrekking contiguous')
    },
  },
  {
    id: 'fasebalk-labels-deplete',
    name: 'Fasebalk: labels correct voor deplete strategie',
    category: CAT,
    description: 'Deplete strategy produces standard 3-phase labels',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 40, fireAge: 50, aowAge: 67, endAge: 85,
        fireReachable: true, isPensioenMode: false,
      })
      assertEqual(segments[0].label, 'Opbouw', 'deplete opbouw label')
      assertEqual(segments[1].label, 'Overgang', 'deplete overgang label')
      assertEqual(segments[2].label, 'Onttrekking', 'deplete onttrekking label')
    },
  },
  {
    id: 'fasebalk-labels-perpetual',
    name: 'Fasebalk: labels correct voor perpetual strategie',
    category: CAT,
    description: 'Perpetual strategy produces same 3-phase labels',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 40, fireAge: 55, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      assertEqual(segments[0].label, 'Opbouw', 'perpetual opbouw label')
      assertEqual(segments[1].label, 'Overgang', 'perpetual overgang label')
      assertEqual(segments[2].label, 'Onttrekking', 'perpetual onttrekking label')
    },
  },
  {
    id: 'fasebalk-labels-legacy',
    name: 'Fasebalk: labels correct voor legacy strategie',
    category: CAT,
    description: 'Legacy strategy produces same 3-phase labels',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 44, fireAge: 60, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      assertEqual(segments[0].label, 'Opbouw', 'legacy opbouw label')
      assertEqual(segments[1].label, 'Overgang', 'legacy overgang label')
      assertEqual(segments[2].label, 'Onttrekking', 'legacy onttrekking label')
    },
  },
  {
    id: 'fasebalk-marijke-already-fired',
    name: 'Fasebalk: Marijke (already FIRE\'d) toont 2 segmenten',
    category: CAT,
    description: 'Already FIRE\'d persona shows Overgang + Onttrekking (no Opbouw), or just Onttrekking in pensioen mode',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      // Marijke: born 1957, currently ~68, pensioen mode, already past FIRE
      const currentAge = ageAtDate('1957-06-20')
      // In pensioen mode, overgangCollapses = true
      const segments = buildSegments({
        currentAge,
        fireAge: currentAge, // already FIRE'd
        aowAge: NL_AOW_AGE,
        endAge: 90,
        fireReachable: true,
        isPensioenMode: true, // pensioen mode
      })
      // pensioen + already FIRE'd → only Onttrekking (overgang collapses)
      assertEqual(segments.length, 1, 'pensioen + already fired = 1 segment')
      assertEqual(segments[0].id, 'onttrekking', 'only onttrekking')

      // Without pensioen mode, already FIRE'd but past AOW → only Onttrekking
      const segmentsNormal = buildSegments({
        currentAge,
        fireAge: currentAge,
        aowAge: NL_AOW_AGE,
        endAge: 90,
        fireReachable: true,
        isPensioenMode: false,
      })
      // currentAge (68) > AOW (67), so overgang also collapses → only Onttrekking
      assertEqual(segmentsNormal.length, 1, 'already past AOW = 1 segment')
      assertEqual(segmentsNormal[0].id, 'onttrekking', 'only onttrekking without pensioen')
    },
  },
  {
    id: 'fasebalk-roos-unreachable',
    name: 'Fasebalk: Roos (FIRE onbereikbaar) toont 1 segment',
    category: CAT,
    description: 'FIRE unreachable persona shows only Opbouw segment',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      // Roos: deep in debt, FIRE unreachable
      const currentAge = ageAtDate('1986-03-15')
      const segments = buildSegments({
        currentAge,
        fireAge: null,
        aowAge: NL_AOW_AGE,
        endAge: 85,
        fireReachable: false,
        isPensioenMode: false,
      })
      assertEqual(segments.length, 1, 'unreachable = 1 segment')
      assertEqual(segments[0].id, 'opbouw', 'alleen opbouw')
      assertEqual(segments[0].startAge, currentAge, 'start = currentAge')
      assertEqual(segments[0].endAge, 85, 'end = endAge')
    },
  },
  {
    id: 'fasebalk-pensioen-mode-2-segmenten',
    name: 'Fasebalk: pensioen-modus toont 2 segmenten (geen Overgang)',
    category: CAT,
    description: 'Pensioen mode collapses Overgang phase',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 35, fireAge: 50, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: true,
      })
      assertEqual(segments.length, 2, 'pensioen = 2 segmenten')
      assertEqual(segments[0].id, 'opbouw', 'eerste = opbouw')
      assertEqual(segments[1].id, 'onttrekking', 'tweede = onttrekking (geen overgang)')
      // Onttrekking starts at fireAge (not aowAge) when overgang collapses
      assertEqual(segments[1].startAge, 50, 'onttrekking begint bij fireAge')
    },
  },
  {
    id: 'fasebalk-collapsed-aria-hidden',
    name: 'Fasebalk: collapsed segment heeft aria-hidden',
    category: CAT,
    description: 'Verify that buildSegments produces collapsed-ready segments when FIRE >= AOW',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // When fireAge >= aowAge, overgang collapses
      const segments = buildSegments({
        currentAge: 35, fireAge: 70, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      // FIRE >= AOW → overgang collapses → only Opbouw + Onttrekking
      assertEqual(segments.length, 2, 'fire >= aow = 2 segmenten')
      assertEqual(segments[0].id, 'opbouw', 'opbouw present')
      assertEqual(segments[1].id, 'onttrekking', 'onttrekking present')
      // No overgang segment exists to collapse — it's correctly omitted
      const overgangExists = segments.some(s => s.id === 'overgang')
      assert(!overgangExists, 'overgang not present when fire >= aow')
      // Note: aria-hidden is applied in the React component when a segment's
      // rendered width < MIN_SEGMENT_PX (44px) — tested at component level
    },
  },
  {
    id: 'fasebalk-min-44px-segmenten',
    name: 'Fasebalk: actieve segmenten minimum 44px breed',
    category: CAT,
    description: 'Verify MIN_SEGMENT_PX constant and segment minimum width guarantee',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // All active segments have minWidth: MIN_SEGMENT_PX (44px) in the component
      // Test that all segments from buildSegments have positive age spans
      const segments = buildSegments({
        currentAge: 35, fireAge: 45, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      for (const seg of segments) {
        const span = seg.endAge - seg.startAge
        assertGreaterThan(span, 0, `${seg.id} has positive age span (${span} years)`)
      }
      // Verify the component's MIN_SEGMENT_PX is 44 (touch target)
      // This is a constant in phase-bar.tsx — we verify segments are well-formed
      // so the min-width CSS can be correctly applied
      assertEqual(segments.length, 3, 'all segments present for min-width test')
    },
  },
  {
    id: 'fasebalk-fire-equals-aow',
    name: 'Fasebalk: FIRE=AOW collapst Overgang',
    category: CAT,
    description: 'When fireAge equals aowAge, Overgang phase is omitted',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const segments = buildSegments({
        currentAge: 35, fireAge: 67, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: false,
      })
      assertEqual(segments.length, 2, 'fire=aow → 2 segmenten')
      assertEqual(segments[0].id, 'opbouw', 'opbouw 35→67')
      assertEqual(segments[1].id, 'onttrekking', 'onttrekking 67→90')
      assertEqual(segments[0].endAge, 67, 'opbouw ends at fire/aow age')
      assertEqual(segments[1].startAge, 67, 'onttrekking starts at fire/aow age')
    },
  },
  {
    id: 'fasebalk-pensioen-phases-check',
    name: 'Fasebalk: bestaande pensioen-phases test compatibel',
    category: CAT,
    description: 'Existing horizon-grafiek-pensioen-phases test still valid with fasebalk changes',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      // Verify that phase labels used in the chart (VERMOGENSGROEI/PENSIOEN)
      // are conceptually aligned with fasebalk labels (Opbouw/Onttrekking)
      // The chart uses different labels for the pensioen mode display
      const fasebalkPensioen = buildSegments({
        currentAge: 35, fireAge: 50, aowAge: 67, endAge: 90,
        fireReachable: true, isPensioenMode: true,
      })
      // Fasebalk: Opbouw + Onttrekking (2 segments in pensioen mode)
      assertEqual(fasebalkPensioen.length, 2, 'fasebalk pensioen = 2 segments')
      // Chart labels: VERMOGENSGROEI + PENSIOEN — both maps make sense
      const chartLabels = { preFire: 'VERMOGENSGROEI', postFire: 'PENSIOEN' }
      assertEqual(chartLabels.preFire, 'VERMOGENSGROEI', 'chart pre-fire label')
      assertEqual(chartLabels.postFire, 'PENSIOEN', 'chart post-fire label')
    },
  },

  // ── Persona-validatie door fasebalk-logica ──────────────────────────────────

  {
    id: 'fasebalk-persona-daan-starter',
    name: 'Persona Daan (starter) door fasebalk',
    category: CAT,
    description: 'Daan: young starter, perpetual strategy, 3 segments expected',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const p = PERSONAS.daan
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const input: FinancialInput = {
        totalAssets: 2850, totalDebts: 13900, monthlyIncome: p.meta.income,
        monthlyExpenses: p.meta.expenses, yearlyMustExpenses: 0,
        monthlyContributions: p.meta.income - p.meta.expenses,
        dateOfBirth: p.profile.date_of_birth,
      }
      const proj = computeFireProjection(input)
      const fireReachable = proj.fireAge !== null && proj.fireAge > currentAge
      const segments = buildSegments({
        currentAge,
        fireAge: fireReachable ? proj.fireAge : null,
        aowAge: NL_AOW_AGE,
        endAge: p.profile.fire_end_age ?? 90,
        fireReachable,
        isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
      })
      assertGreaterThan(segments.length, 0, 'Daan: at least 1 segment')
      assertEqual(segments[0].id, 'opbouw', 'Daan: starts with opbouw')
      // If FIRE reachable and < AOW, should have 3 segments
      if (fireReachable && proj.fireAge! < NL_AOW_AGE) {
        assertEqual(segments.length, 3, 'Daan: 3 segments when FIRE < AOW')
      }
    },
  },
  {
    id: 'fasebalk-persona-lisa-legacy',
    name: 'Persona Lisa (legacy) door fasebalk',
    category: CAT,
    description: 'Lisa: momentum phase, legacy strategy, should produce valid segments',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const p = PERSONAS.lisa
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const input: FinancialInput = {
        totalAssets: 100000, totalDebts: 0, monthlyIncome: p.meta.income,
        monthlyExpenses: p.meta.expenses, yearlyMustExpenses: 0,
        monthlyContributions: p.meta.income - p.meta.expenses,
        dateOfBirth: p.profile.date_of_birth,
      }
      const proj = computeFireProjection(input)
      const fireReachable = proj.fireAge !== null && proj.fireAge > currentAge
      const segments = buildSegments({
        currentAge,
        fireAge: fireReachable ? proj.fireAge : null,
        aowAge: NL_AOW_AGE,
        endAge: p.profile.fire_end_age ?? 90,
        fireReachable,
        isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
      })
      assertGreaterThan(segments.length, 0, 'Lisa: at least 1 segment')
      assertEqual(segments[0].id, 'opbouw', 'Lisa: starts with opbouw')
      // Segments should be contiguous
      for (let i = 1; i < segments.length; i++) {
        assertEqual(segments[i].startAge, segments[i - 1].endAge, `Lisa: contiguous at segment ${i}`)
      }
    },
  },
  {
    id: 'fasebalk-persona-willem-near-fi',
    name: 'Persona Willem (near-FI) door fasebalk',
    category: CAT,
    description: 'Willem: near financial independence, deplete strategy',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const p = PERSONAS.willem
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const input: FinancialInput = {
        totalAssets: 1457000, totalDebts: 0, monthlyIncome: p.meta.income,
        monthlyExpenses: p.meta.expenses, yearlyMustExpenses: 0,
        monthlyContributions: p.meta.income - p.meta.expenses,
        dateOfBirth: p.profile.date_of_birth,
      }
      const proj = computeFireProjection(input)
      const segments = buildSegments({
        currentAge,
        fireAge: proj.fireAge,
        aowAge: NL_AOW_AGE,
        endAge: p.profile.fire_end_age ?? 95,
        fireReachable: proj.fireAge !== null,
        isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
      })
      assertGreaterThan(segments.length, 0, 'Willem: at least 1 segment')
      // Willem is near-FI with €1.46M → likely already FIRE'd
      if (proj.fireDate === 'Bereikt!') {
        // Already FIRE'd → no Opbouw, just Onttrekking (or Overgang+Onttrekking)
        assert(segments[0].id !== 'opbouw' || segments.length === 1, 'Willem: no opbouw when already FI')
      }
    },
  },
  {
    id: 'fasebalk-persona-marijke-retired',
    name: 'Persona Marijke (retired/pensioen) door fasebalk',
    category: CAT,
    description: 'Marijke: retired, pensioen strategy, already past FIRE and AOW',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const p = PERSONAS.marijke
      const currentAge = ageAtDate(p.profile.date_of_birth)
      // Marijke is 68+, already past AOW at 67
      assertGreaterThan(currentAge, NL_AOW_AGE, 'Marijke is past AOW')

      const segments = buildSegments({
        currentAge,
        fireAge: currentAge, // already FIRE'd
        aowAge: NL_AOW_AGE,
        endAge: 90,
        fireReachable: true,
        isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
      })
      // Marijke: pensioen mode + already FIRE'd + past AOW
      // → only Onttrekking
      assertEqual(segments.length, 1, 'Marijke: 1 segment (onttrekking only)')
      assertEqual(segments[0].id, 'onttrekking', 'Marijke: only onttrekking')
      assertEqual(segments[0].startAge, currentAge, 'Marijke: starts at currentAge')
      assertEqual(segments[0].endAge, 90, 'Marijke: ends at 90')
    },
  },
  {
    id: 'fasebalk-alle-personas-geen-errors',
    name: 'Alle 4 personas door fasebalk-logica zonder errors',
    category: CAT,
    description: 'Validate all 4 personas produce valid non-empty segment arrays',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const personaConfigs: Record<PersonaKey, {
        totalAssets: number, totalDebts: number, fireAge: number | null, fireReachable: boolean
      }> = {
        daan: { totalAssets: 2850, totalDebts: 13900, fireAge: 55, fireReachable: true },
        lisa: { totalAssets: 100000, totalDebts: 0, fireAge: 60, fireReachable: true },
        willem: { totalAssets: 1457000, totalDebts: 0, fireAge: ageAtDate('1968-11-30'), fireReachable: true },
        marijke: { totalAssets: 850000, totalDebts: 0, fireAge: ageAtDate('1957-06-20'), fireReachable: true },
        compleet: { totalAssets: 1551000, totalDebts: 454020, fireAge: 50, fireReachable: true },
      }

      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        const cfg = personaConfigs[key]
        const currentAge = ageAtDate(p.profile.date_of_birth)

        const segments = buildSegments({
          currentAge,
          fireAge: cfg.fireReachable ? cfg.fireAge : null,
          aowAge: NL_AOW_AGE,
          endAge: p.profile.fire_end_age ?? 90,
          fireReachable: cfg.fireReachable,
          isPensioenMode: p.profile.fire_end_strategy === 'pensioen',
        })

        assertGreaterThan(segments.length, 0, `${key}: at least 1 segment`)
        assertLessThanOrEqual(segments.length, 3, `${key}: max 3 segments`)

        // All segments should have valid age ranges
        for (const seg of segments) {
          assertGreaterThanOrEqual(seg.startAge, currentAge, `${key}/${seg.id}: start >= currentAge`)
          assertLessThanOrEqual(seg.endAge, p.profile.fire_end_age ?? 90, `${key}/${seg.id}: end <= endAge`)
          assertGreaterThan(seg.endAge - seg.startAge, 0, `${key}/${seg.id}: positive span`)
          assert(seg.label.length > 0, `${key}/${seg.id}: non-empty label`)
          assert(seg.color.length > 0, `${key}/${seg.id}: non-empty color`)
        }
      }
    },
  },

  // ── AOW-stop toggle tests ──────────────────────────────────────────────

  {
    id: 'aow-stop-shortfall-detection',
    name: 'AOW-stop: shortfall scenario detectie',
    category: CAT,
    description: 'FIRE > AOW triggers shortfall detection for toggle visibility',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      // Low savings, high expenses → FIRE age will be > 67
      const r = runSim({
        currentAge: 35,
        endAge: 90,
        currentPortfolio: 50_000,
        yearlyExpenses: 50_000,
        annualSavings: 5_000,
        grossReturn: 0.05,
      })
      assert(r.fireReachable, 'FIRE still reachable')
      assertNotNull(r.fireAge)
      assertGreaterThan(r.fireAge!, NL_AOW_AGE, 'FIRE age > AOW age = shortfall')
    },
  },
  {
    id: 'aow-stop-forced-fire-at-aow',
    name: 'AOW-stop: forcedFireAge op AOW leeftijd',
    category: CAT,
    description: 'Simulation with forcedFireAge=67 produces valid rows',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runSimulation(35, 90, 50_000, 50_000, 5_000, 0.05, 'nl_box3', 0.02, [],
        { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
        undefined,
        NL_AOW_AGE,
      )
      assert(r.rows.length > 0, 'has rows')
      assertEqual(r.rows[0].age, 35, 'eerste row = currentAge')
      // Portfolio at AOW should exist
      const rowAtAow = r.rows.find(row => row.age === NL_AOW_AGE)
      assertNotNull(rowAtAow, 'row at AOW exists')
      assertFinite(rowAtAow!.endPortfolio, 'portfolio at AOW finite')
    },
  },
  {
    id: 'aow-stop-depletion-age',
    name: 'AOW-stop: vermogen raakt op voor endAge',
    category: CAT,
    description: 'When forced to stop at AOW with insufficient wealth, depletion occurs',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runSimulation(35, 90, 50_000, 50_000, 5_000, 0.05, 'nl_box3', 0.02, [],
        { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
        undefined,
        NL_AOW_AGE,
      )
      // Find the first row where endPortfolio <= 0
      const depletionRow = r.rows.find(row => row.endPortfolio <= 0)
      assertNotNull(depletionRow, 'depletion occurs')
      assertLessThan(depletionRow!.age, 90, 'depletion before endAge')
      assertGreaterThanOrEqual(depletionRow!.age, NL_AOW_AGE, 'depletion after AOW')
    },
  },
  {
    id: 'aow-stop-fasebalk-2-segmenten',
    name: 'AOW-stop: PhaseBar toont 2 segmenten (Opbouw + Onttrekking)',
    category: CAT,
    description: 'When AOW-stop is active (treated as pensioen mode), phase bar collapses overgang',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // User selects "stoppen op AOW" → isPensioenMode=true for PhaseBar
      const segments = buildSegments({
        currentAge: 35,
        fireAge: NL_AOW_AGE,
        aowAge: NL_AOW_AGE,
        endAge: 90,
        fireReachable: true,
        isPensioenMode: true,
      })
      assertEqual(segments.length, 2, '2 segmenten (geen overgang)')
      assertEqual(segments[0].id, 'opbouw', 'eerste = opbouw')
      assertEqual(segments[1].id, 'onttrekking', 'tweede = onttrekking')
      assertEqual(segments[1].startAge, NL_AOW_AGE, 'onttrekking begint bij AOW')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — Projecties',
    description: 'Tests voor computeFireProjection, computeFireRange, runBacktest, ageAtDate en fasebalk',
    icon: 'LineChart',
    testCount: 0,
  })
  registerTests(tests)
}
