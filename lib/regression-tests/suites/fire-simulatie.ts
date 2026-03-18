import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertFinite, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimCashflow,
  type SimResult,
  type ReturnModel,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_MONTHLY, BOX3_DRAG } from '@/lib/constants'
import { NIBUD_CHILDREN_MONTHLY_COST, type LifeEvent } from '@/lib/horizon-data'

const CAT = 'horizon.simulatie'

const STANDARD: {
  currentAge: number; endAge: number; currentPortfolio: number;
  yearlyExpenses: number; annualSavings: number; grossReturn: number;
  returnModel: ReturnModel; inflation: number;
} = {
  currentAge: 35, endAge: 90, currentPortfolio: 150_000,
  yearlyExpenses: 36_000, annualSavings: 18_000, grossReturn: 0.07,
  returnModel: 'nl_box3', inflation: 0.02,
}

function runStd(
  overrides: Partial<typeof STANDARD> = {},
  cashflows: SimCashflow[] = [],
  strategy?: FireStrategyConfig,
): SimResult {
  const s = { ...STANDARD, ...overrides }
  return runSimulation(s.currentAge, s.endAge, s.currentPortfolio, s.yearlyExpenses, s.annualSavings, s.grossReturn, s.returnModel, s.inflation, cashflows, strategy)
}

function makeEvent(partial: Partial<LifeEvent>): LifeEvent {
  return {
    id: 'test-1', name: 'Test event', event_type: 'custom',
    target_age: null, target_date: null, one_time_cost: 0,
    monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0,
    icon: '📋', is_active: true, sort_order: 0, is_indexed: true,
    ...partial,
  }
}

const tests: TestCase[] = [
  {
    id: 'fire-sim-setup', name: 'SimResult velden validatie', category: CAT,
    description: 'Controleert of runSimulation alle vereiste velden retourneert',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assertType(r.rows, 'object', 'rows is array')
      assert(Array.isArray(r.rows), 'rows is array')
      assertGreaterThan(r.rows.length, 0, 'rows count')
      for (const row of r.rows) {
        assert(row.phase === 'accumulation' || row.phase === 'retirement', `phase: ${row.phase}`)
      }
    },
  },
  {
    id: 'fire-sim-deplete', name: 'Deplete strategie', category: CAT,
    description: 'Deplete eindigt portfolio bij ~€0',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio), 500, 'endPortfolio ~0')
    },
  },
  {
    id: 'fire-sim-legacy', name: 'Legacy strategie', category: CAT,
    description: 'Legacy behoudt geïndexeerd bedrag op einddatum',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const legacy = 200_000
      const r = runStd({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: legacy })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const indexed = legacy * Math.pow(1 + STANDARD.inflation, STANDARD.endAge - STANDARD.currentAge)
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio - Math.round(indexed)), 1000, 'legacy bedrag')
      const dep = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assertGreaterThan(r.requiredFirePortfolio, dep.requiredFirePortfolio, 'legacy > deplete portfolio')
    },
  },
  {
    id: 'fire-sim-perpetual', name: 'Perpetual strategie', category: CAT,
    description: 'Perpetual overleeft onbeperkt',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertGreaterThan(last.endPortfolio, 0, 'portfolio positief')
      assertEqual(r.displayEndAge, 90, 'displayEndAge')
    },
  },
  {
    id: 'fire-sim-ordering', name: 'Strategie volgorde', category: CAT,
    description: 'deplete < legacy < perpetual portfolio vereiste',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const dep = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      const leg = runStd({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 })
      const perp = runStd({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assertLessThan(dep.requiredFirePortfolio, leg.requiredFirePortfolio, 'dep < leg')
      assertLessThan(leg.requiredFirePortfolio, perp.requiredFirePortfolio, 'leg < perp')
    },
  },
  {
    id: 'fire-sim-fireage', name: 'FIRE leeftijd basis', category: CAT,
    description: 'fireAge en fireAgeFractional correct berekend',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      assertNotNull(r.fireAge)
      assertNotNull(r.fireAgeFractional)
      assertGreaterThanOrEqual(r.fireAge, STANDARD.currentAge, 'fireAge >= currentAge')
      assertLessThan(r.fireAge, STANDARD.endAge, 'fireAge < endAge')
    },
  },
  {
    id: 'fire-sim-unreachable', name: 'FIRE onbereikbaar', category: CAT,
    description: 'Geen portfolio en geen savings = onbereikbaar',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const r = runStd({ currentPortfolio: 0, annualSavings: 0, yearlyExpenses: 60_000 })
      assert(!r.fireReachable, 'FIRE onbereikbaar')
      assertEqual(r.fireAge, null, 'fireAge null')
    },
  },
  {
    id: 'fire-sim-sensitivity', name: 'Parameter gevoeligheid', category: CAT,
    description: 'Hoger rendement/sparen → lagere FIRE leeftijd, hogere uitgaven → hogere',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const base = runStd().fireAge!
      assertLessThan(runStd({ grossReturn: 0.09 }).fireAge!, base, 'hoger rendement')
      assertGreaterThan(runStd({ yearlyExpenses: 48_000 }).fireAge!, base, 'hogere uitgaven')
      assertLessThan(runStd({ annualSavings: 30_000 }).fireAge!, base, 'meer sparen')
    },
  },
  {
    id: 'fire-sim-metrics', name: 'Portfolio metrics', category: CAT,
    description: 'implicitWithdrawalRate en classic25xTarget consistent',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assertEqual(r.classic25xTarget, STANDARD.yearlyExpenses * 25, '25x target')
      const expectedRate = STANDARD.yearlyExpenses / r.requiredFirePortfolio
      assertLessThan(Math.abs(r.implicitWithdrawalRate - expectedRate), 0.001, 'withdrawal rate')
    },
  },
  {
    id: 'fire-sim-aow', name: 'AOW cashflow', category: CAT,
    description: 'AOW verlaagt onttrekking na 67',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const cf: SimCashflow = { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true }
      const r = runStd({}, [cf])
      assert(r.fireReachable, 'bereikbaar')
      const retRows = r.rows.filter(row => row.phase === 'retirement')
      const post = retRows.filter(row => row.age >= 67)
      if (post.length > 0) assertGreaterThan(post[0].cashflowNet, 0, 'cashflow na AOW')
    },
  },
  {
    id: 'fire-sim-children', name: 'NIBUD kinderfases', category: CAT,
    description: 'Kindevent genereert 3 NIBUD fases',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const ev = makeEvent({ id: 'child-1', name: 'Kind', event_type: 'children', target_age: 35, metadata: { aantalKinderen: 1, kinderbijslag: false, kinderopvangDagen: 0 } })
      const cfs = lifeEventsToCashflows([ev])
      const baby = cfs.find(c => c.name.includes('baby'))
      const basis = cfs.find(c => c.name.includes('basisschool'))
      const tiener = cfs.find(c => c.name.includes('tiener'))
      assertNotNull(baby, 'baby fase')
      assertNotNull(basis, 'basisschool fase')
      assertNotNull(tiener, 'tiener fase')
      const base = NIBUD_CHILDREN_MONTHLY_COST[1]!
      assertEqual(baby.amount, Math.round(base * 1.2), 'baby bedrag')
      assertEqual(basis.amount, Math.round(base * 1.0), 'basisschool bedrag')
      assertEqual(tiener.amount, Math.round(base * 1.3), 'tiener bedrag')
    },
  },
  {
    id: 'fire-sim-combined', name: 'Gecombineerde cashflows', category: CAT,
    description: 'Meerdere events produceren valide resultaten zonder NaN/Infinity',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 800, fromAge: 65, toAge: null, indexed: true },
        { id: 'child', name: 'Kind', type: 'recurring', direction: 'expense', amount: 500, fromAge: 37, toAge: 55, indexed: true },
        { id: 'erfenis', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 100_000, fromAge: 50, toAge: 50, indexed: false },
      ]
      const r = runStd({}, cfs)
      assert(r.fireReachable, 'bereikbaar')
      for (const row of r.rows) {
        assertFinite(row.startPortfolio, `row ${row.age} start`)
        assertFinite(row.endPortfolio, `row ${row.age} end`)
        assertFinite(row.cashflowNet, `row ${row.age} cf`)
      }
    },
  },
  {
    id: 'fire-sim-empty-cf', name: 'Lege cashflows', category: CAT,
    description: 'Lege cashflows = zelfde resultaat als baseline',
    priority: 'low', estimatedDurationMs: 100,
    fn() {
      const withEmpty = runStd({}, [])
      const base = runStd()
      assertEqual(withEmpty.fireAge, base.fireAge, 'fireAge')
      assertEqual(withEmpty.rows.length, base.rows.length, 'rows length')
    },
  },
  {
    id: 'fire-sim-order', name: 'Cashflow volgorde-onafhankelijk', category: CAT,
    description: 'Cashflow volgorde beïnvloedt resultaat niet',
    priority: 'medium', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1200, fromAge: 65, toAge: null, indexed: true },
        { id: 'erfenis', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 50_000, fromAge: 52, toAge: 52, indexed: false },
      ]
      const fwd = runStd({}, cfs)
      const rev = runStd({}, [...cfs].reverse())
      assertEqual(fwd.fireAge, rev.fireAge, 'fireAge')
      assertEqual(fwd.rows.length, rev.rows.length, 'rows')
    },
  },
  // ── Step 2: Life events — huis kopen, huurinkomsten, stopdatum ──────────
  {
    id: 'fire-sim-huis-kopen', name: 'Life event: huis kopen (eenmalige uitgave)', category: CAT,
    description: 'Eenmalige uitgave verlaagt portfolio en kan FIRE uitstellen',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const base = runStd()
      const huisCf: SimCashflow = { id: 'huis', name: 'Huis kopen', type: 'one_time', direction: 'expense', amount: 50_000, fromAge: 40, toAge: 40, indexed: false }
      const withHuis = runStd({}, [huisCf])
      assert(withHuis.fireReachable, 'FIRE nog steeds bereikbaar')
      assertGreaterThanOrEqual(withHuis.fireAge!, base.fireAge!, 'huis kopen stelt FIRE uit of gelijk')
      // Verify the row at age 40 shows the expense
      const row40 = withHuis.rows.find(r => r.age === 40)
      assertNotNull(row40, 'row at age 40')
      assertLessThan(row40.cashflowNet, 0, 'negatieve cashflow bij huis kopen')
    },
  },
  {
    id: 'fire-sim-huurinkomsten', name: 'Life event: huurinkomsten (terugkerend)', category: CAT,
    description: 'Terugkerende huurinkomsten versnellen FIRE',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const base = runStd()
      const huurCf: SimCashflow = { id: 'huur', name: 'Huurinkomsten', type: 'recurring', direction: 'income', amount: 800, fromAge: 38, toAge: null, indexed: true }
      const withHuur = runStd({}, [huurCf])
      assert(withHuur.fireReachable, 'FIRE bereikbaar')
      assertLessThanOrEqual(withHuur.fireAge!, base.fireAge!, 'huurinkomsten versnellen FIRE')
    },
  },
  {
    id: 'fire-sim-stopdatum', name: 'Life event: cashflow met stopdatum', category: CAT,
    description: 'Recurring cashflow stopt correct bij toAge',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const cf: SimCashflow = { id: 'freelance', name: 'Freelance', type: 'recurring', direction: 'income', amount: 1000, fromAge: 36, toAge: 45, indexed: true }
      const r = runStd({}, [cf])
      // Rows at age 36-44 should have positive cashflow from this, rows at 45+ should not
      const activeRows = r.rows.filter(row => row.age >= 36 && row.age < 45)
      const stoppedRows = r.rows.filter(row => row.age >= 45 && row.age < 50)
      if (activeRows.length > 0) {
        assertGreaterThan(activeRows[0].cashflowNet, 0, 'cashflow actief voor stopdatum')
      }
      // After toAge, this specific cashflow should not contribute (cashflowNet comes from all cashflows)
      // With no other cashflows, stopped rows should have 0 cashflowNet
      for (const row of stoppedRows) {
        assertEqual(row.cashflowNet, 0, `geen cashflow na stopdatum (age ${row.age})`)
      }
    },
  },
  // ── Step 3: Box 3 belastingdruk ─────────────────────────────────────────
  {
    id: 'fire-sim-box3-drag', name: 'Box 3 belastingdruk', category: CAT,
    description: 'nl_box3 model trekt forfaitaire belasting af van rendement',
    priority: 'critical', estimatedDurationMs: 200,
    fn() {
      // Same scenario with nl_box3 vs classic — nl_box3 should have higher FIRE age due to tax drag
      const box3 = runStd({ returnModel: 'nl_box3' })
      const classic = runStd({ returnModel: 'classic' })
      assert(box3.fireReachable, 'box3 bereikbaar')
      assert(classic.fireReachable, 'classic bereikbaar')
      assertGreaterThan(box3.fireAge!, classic.fireAge!, 'Box 3 belasting stelt FIRE uit')
      // Box 3 drag should reduce effective return by ~2.12%
      // Verify portfolio at same age is lower for box3
      const age50box3 = box3.rows.find(r => r.age === 50)
      const age50classic = classic.rows.find(r => r.age === 50)
      if (age50box3 && age50classic && age50box3.phase === 'accumulation' && age50classic.phase === 'accumulation') {
        assertLessThan(age50box3.endPortfolio, age50classic.endPortfolio, 'Box 3 lager portfolio bij 50')
      }
      // BOX3_DRAG should be approximately 2.12% (0.0588 * 0.36)
      assertLessThan(Math.abs(BOX3_DRAG - 0.02117), 0.001, 'BOX3_DRAG ≈ 2.12%')
    },
  },
  // ── Step 4: Inflatie correctie ──────────────────────────────────────────
  {
    id: 'fire-sim-inflation', name: 'Inflatie correctie over 30 jaar', category: CAT,
    description: 'Uitgaven stijgen met inflatie in onttrekkingsfase, portfolio compenseert',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Compare 0% vs 2% inflation — higher inflation should require larger portfolio / later FIRE
      const noInflation = runStd({ inflation: 0 })
      const withInflation = runStd({ inflation: 0.02 })
      assert(noInflation.fireReachable, 'no inflation bereikbaar')
      assert(withInflation.fireReachable, 'with inflation bereikbaar')
      // Higher inflation means you need more to sustain expenses → later FIRE or larger portfolio
      assertGreaterThanOrEqual(withInflation.fireAge!, noInflation.fireAge!, 'inflatie stelt FIRE uit')
      assertGreaterThan(withInflation.requiredFirePortfolio, noInflation.requiredFirePortfolio, 'inflatie verhoogt vereist portfolio')
      // Verify retirement expenses grow: later rows should have higher withdrawal
      const retRows = withInflation.rows.filter(r => r.phase === 'retirement')
      if (retRows.length >= 10) {
        assertGreaterThan(retRows[retRows.length - 1].withdrawal, retRows[0].withdrawal, 'withdrawal stijgt door inflatie')
      }
    },
  },
  // ── Step 5: Edge cases ──────────────────────────────────────────────────
  {
    id: 'fire-sim-zero-return', name: 'Edge case: 0% rendement', category: CAT,
    description: 'Simulatie werkt met 0% rendement — puur sparen',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd({ grossReturn: 0, returnModel: 'classic', inflation: 0 })
      // With 0% return, 0% inflation, classic model: pure savings
      // €150K + €18K/yr savings, €36K/yr expenses → needs 36K * 55yr = €1.98M for deplete@90
      // Should still be reachable eventually since savings > 0
      for (const row of r.rows) {
        assertFinite(row.startPortfolio, `row ${row.age} start`)
        assertFinite(row.endPortfolio, `row ${row.age} end`)
        assertEqual(row.growth, 0, `geen groei bij 0% rendement (age ${row.age})`)
      }
    },
  },
  {
    id: 'fire-sim-negative-return', name: 'Edge case: negatief rendement', category: CAT,
    description: 'Simulatie crasht niet bij negatief rendement',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd({ grossReturn: -0.02, returnModel: 'classic', inflation: 0 })
      // Negative return = portfolio shrinks yearly, FIRE may be unreachable
      for (const row of r.rows) {
        assertFinite(row.startPortfolio, `row ${row.age} start finite`)
        assertFinite(row.endPortfolio, `row ${row.age} end finite`)
      }
      // Growth should be negative in accumulation rows
      const accRows = r.rows.filter(row => row.phase === 'accumulation')
      if (accRows.length > 0) {
        assertLessThan(accRows[0].growth, 0, 'negatieve groei')
      }
    },
  },
  {
    id: 'fire-sim-extreme-return', name: 'Edge case: extreem hoog rendement (>20%)', category: CAT,
    description: 'Simulatie werkt met extreem hoog rendement zonder overflow',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const r = runStd({ grossReturn: 0.25, returnModel: 'classic' })
      assert(r.fireReachable, 'FIRE bereikbaar bij 25% rendement')
      assertNotNull(r.fireAge)
      // Should reach FIRE much faster than standard
      const base = runStd()
      assertLessThan(r.fireAge!, base.fireAge!, 'extreem rendement versnelt FIRE')
      // All values should remain finite (no overflow)
      for (const row of r.rows) {
        assertFinite(row.startPortfolio, `row ${row.age} start finite`)
        assertFinite(row.endPortfolio, `row ${row.age} end finite`)
        assertFinite(row.growth, `row ${row.age} growth finite`)
      }
    },
  },
  {
    id: 'fire-sim-zero-savings', name: 'Edge case: 0 spaargeld maar hoog portfolio', category: CAT,
    description: 'Geen spaargeld maar groot bestaand portfolio = FIRE mogelijk',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = runStd({ currentPortfolio: 2_000_000, annualSavings: 0 })
      assert(r.fireReachable, 'FIRE bereikbaar met groot portfolio')
      assertEqual(r.fireAge, STANDARD.currentAge, 'direct FIRE met groot portfolio')
    },
  },
  // ── Step 6: Onttrekkingsfase switch ─────────────────────────────────────
  {
    id: 'fire-sim-phase-switch', name: 'Fase switch: opbouw → afbouw', category: CAT,
    description: 'Correcte transition van accumulation naar retirement bij FIRE leeftijd',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      assertNotNull(r.fireAge)
      // All rows before fireAge should be accumulation, at/after should be retirement
      for (const row of r.rows) {
        if (row.age < r.fireAge!) {
          assertEqual(row.phase, 'accumulation', `age ${row.age} moet accumulation zijn`)
          assertGreaterThanOrEqual(row.savings, 0, `savings >= 0 in opbouw (age ${row.age})`)
        } else {
          assertEqual(row.phase, 'retirement', `age ${row.age} moet retirement zijn`)
          assertEqual(row.savings, 0, `geen savings in retirement (age ${row.age})`)
          assertGreaterThanOrEqual(row.withdrawal, 0, `withdrawal >= 0 in afbouw (age ${row.age})`)
        }
      }
      // Verify no gaps: ages should be consecutive from currentAge to endAge-1
      const ages = r.rows.map(row => row.age)
      for (let i = 1; i < ages.length; i++) {
        assertEqual(ages[i], ages[i - 1] + 1, `opeenvolgende leeftijden (${ages[i - 1]} → ${ages[i]})`)
      }
    },
  },
  // ── Step 8: FIRE leeftijd bepaling ──────────────────────────────────────
  {
    id: 'fire-sim-fire-detection', name: 'FIRE leeftijd: passief inkomen ≥ uitgaven', category: CAT,
    description: 'FIRE wordt bepaald wanneer portfolio voldoende is voor onttrekking',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      assertNotNull(r.fireAge)
      // At fireAge, portfolio should be >= requiredFirePortfolio
      assertGreaterThanOrEqual(r.firePortfolioAtFire, r.requiredFirePortfolio, 'portfolio ≥ vereist bij FIRE')
      // requiredFirePortfolio should be enough to sustain expenses
      assertGreaterThan(r.requiredFirePortfolio, 0, 'vereist portfolio > 0')
      // Fractional age should be close to integer age
      assertNotNull(r.fireAgeFractional)
      assertLessThan(Math.abs(r.fireAgeFractional! - r.fireAge!), 1, 'fractional ≈ integer')
      assertGreaterThanOrEqual(r.fireAgeFractional!, r.fireAge! - 1, 'fractional nabij integer')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — FIRE Simulatie',
    description: 'Kritieke tests voor runSimulation(): strategieën, life events, Box 3, inflatie, edge cases',
    icon: 'TrendingUp',
    testCount: 0,
  })
  registerTests(tests)
}
