import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import type { SimCashflow, SimRow, ReturnModel } from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from '@/lib/horizon-engine/scalar-bridge'
import { buildBreakdownFromSimRows as buildBreakdown } from '@/lib/income-expense-breakdown'

const CAT = 'horizon.inkomen-uitgaven'

// ── Standard simulation parameters ──────────────────────────────────────────

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
) {
  const s = { ...STANDARD, ...overrides }
  return runSimulation(
    s.currentAge, s.endAge, s.currentPortfolio,
    s.yearlyExpenses, s.annualSavings, s.grossReturn,
    s.returnModel, s.inflation, cashflows,
  )
}

// ── Reusable test cashflows ─────────────────────────────────────────────────

const aowCashflow: SimCashflow = {
  id: 'le-aow-test', name: 'AOW', type: 'recurring',
  direction: 'income', amount: 16_000, fromAge: 67, toAge: null, indexed: true,
}

const inheritanceCashflow: SimCashflow = {
  id: 'le-erfenis-test', name: 'Erfenis oom', type: 'one_time',
  direction: 'income', amount: 50_000, fromAge: 50, toAge: 50, indexed: false,
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: 'ie-breakdown-acc-savings', name: 'Besparingen in opbouwfase', category: CAT,
    description: 'In accumulatiefase bevat incomeBreakdown een item met id=savings en bedrag ≈ annualSavings',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      const accRows = r.rows.filter(row => row.phase === 'accumulation')
      assertGreaterThan(accRows.length, 0, 'accumulatie rows aanwezig')

      // Check the first accumulation row (before inflation adjustments compound)
      const first = accRows[0]
      assertNotNull(first.incomeBreakdown, 'incomeBreakdown aanwezig')
      const savingsItem = first.incomeBreakdown!.find(item => item.id === 'savings')
      assertNotNull(savingsItem, 'savings item gevonden')

      // Savings represents the flow to net worth (annualSavings), not total household income
      const expectedSavings = STANDARD.annualSavings
      // Allow ±1 for rounding
      assertLessThanOrEqual(
        Math.abs(savingsItem!.amount - expectedSavings), 1,
        `savings bedrag (${savingsItem!.amount}) ~= annualSavings (${expectedSavings})`,
      )
    },
  },
  {
    id: 'ie-breakdown-acc-growth', name: 'Rendement in opbouwfase', category: CAT,
    description: 'In accumulatiefase bevat incomeBreakdown een item met id=growth wanneer portfolio > 0',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      const accRows = r.rows.filter(row => row.phase === 'accumulation' && row.growth > 0)
      assertGreaterThan(accRows.length, 0, 'accumulatie rows met positieve groei')

      const first = accRows[0]
      assertNotNull(first.incomeBreakdown, 'incomeBreakdown aanwezig')
      const growthItem = first.incomeBreakdown!.find(item => item.id === 'growth')
      assertNotNull(growthItem, 'growth item gevonden in opbouwfase')
      assertGreaterThan(growthItem!.amount, 0, 'growth bedrag positief')
    },
  },
  {
    id: 'ie-breakdown-box3-visible', name: 'Box 3 belasting zichtbaar', category: CAT,
    description: 'Met returnModel nl_box3 bevat expenseBreakdown een item met id=box3',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd({ returnModel: 'nl_box3' })
      // Find any row that has expenseBreakdown with a box3 item
      const rowWithBox3 = r.rows.find(row =>
        row.expenseBreakdown && row.expenseBreakdown.some(item => item.id === 'box3'),
      )
      assertNotNull(rowWithBox3, 'minstens één rij bevat box3 in expenseBreakdown')
      const box3Item = rowWithBox3!.expenseBreakdown!.find(item => item.id === 'box3')
      assertNotNull(box3Item, 'box3 item gevonden')
      assertGreaterThan(box3Item!.amount, 0, 'box3 bedrag positief')
    },
  },
  {
    id: 'ie-breakdown-acc-events', name: 'Life events in opbouwfase inkomen', category: CAT,
    description: 'Positieve cashflows (bijv. AOW) verschijnen als aparte items in incomeBreakdown met cf.name als label',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [aowCashflow])
      assert(r.fireReachable, 'FIRE bereikbaar')

      // Find a retirement row at or after AOW age
      const postAow = r.rows.filter(row => row.age >= 67 && row.phase === 'retirement')
      if (postAow.length === 0) return // AOW only starts at 67; skip if no retirement rows there

      const row = postAow[0]
      assertNotNull(row.incomeBreakdown, 'incomeBreakdown aanwezig na AOW')
      const aowItem = row.incomeBreakdown!.find(item => item.id === aowCashflow.id)
      assertNotNull(aowItem, 'AOW item gevonden in incomeBreakdown')
      assertEqual(aowItem!.label, aowCashflow.name, 'AOW label komt overeen')
      assertGreaterThan(aowItem!.amount, 0, 'AOW bedrag positief')
    },
  },
  {
    id: 'ie-breakdown-ret-growth', name: 'Vermogensgroei in pensioenfase', category: CAT,
    description: 'In pensioenfase bevat incomeBreakdown een item met id=growth en bedrag = max(0, row.growth)',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')

      // Find early retirement rows where growth is positive
      const retRows = r.rows.filter(row => row.phase === 'retirement' && row.growth > 0)
      assertGreaterThan(retRows.length, 0, 'retirement rows met positieve groei')

      const row = retRows[0]
      assertNotNull(row.incomeBreakdown, 'incomeBreakdown aanwezig')
      const growthItem = row.incomeBreakdown!.find(item => item.id === 'growth')
      assertNotNull(growthItem, 'growth item gevonden')

      // Growth amount should match max(0, row.growth) within rounding
      const expectedGrowth = Math.max(0, row.growth)
      assertLessThanOrEqual(
        Math.abs(growthItem!.amount - expectedGrowth), 1,
        `growth bedrag (${growthItem!.amount}) ~= max(0, row.growth) (${expectedGrowth})`,
      )
    },
  },
  {
    id: 'ie-breakdown-ret-withdrawal', name: 'Levensonderhoud in pensioenfase', category: CAT,
    description: 'In pensioenfase bevat expenseBreakdown een item met id=withdrawal, label=Levensonderhoud, bedrag = row.withdrawal',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')

      const retRows = r.rows.filter(row => row.phase === 'retirement' && row.withdrawal > 0)
      assertGreaterThan(retRows.length, 0, 'retirement rows met onttrekking')

      const row = retRows[0]
      assertNotNull(row.expenseBreakdown, 'expenseBreakdown aanwezig')
      const withdrawalItem = row.expenseBreakdown!.find(item => item.id === 'withdrawal')
      assertNotNull(withdrawalItem, 'withdrawal item gevonden')

      // The label for withdrawal is "Levensonderhoud" (not "Onttrekking")
      assertEqual(withdrawalItem!.label, 'Levensonderhoud', 'withdrawal label is Levensonderhoud')

      assertLessThanOrEqual(
        Math.abs(withdrawalItem!.amount - row.withdrawal), 1,
        `withdrawal bedrag (${withdrawalItem!.amount}) ~= row.withdrawal (${row.withdrawal})`,
      )
    },
  },
  {
    id: 'ie-breakdown-totals-match', name: 'Breakdown items positief', category: CAT,
    description: 'Alle incomeBreakdown items > 0 en expenseBreakdown items > 0 (vermogensstromen, niet huishoudinkomen)',
    priority: 'critical', estimatedDurationMs: 150,
    fn() {
      const r = runStd({}, [aowCashflow])
      assert(r.fireReachable, 'FIRE bereikbaar')

      // Breakdown now shows vermogensstromen (flows to/from net worth), which are
      // different numbers from grossIncome/grossExpenses (household-level). We verify
      // that each breakdown item has a positive amount (sanity check).
      let incomeItemCount = 0
      for (const row of r.rows) {
        if (!row.incomeBreakdown) continue
        for (const item of row.incomeBreakdown) {
          assertGreaterThan(item.amount, 0, `age ${row.age}: income item '${item.id}' > 0`)
          incomeItemCount++
        }
      }
      assertGreaterThan(incomeItemCount, 0, 'minstens één income breakdown item aanwezig')

      let expenseItemCount = 0
      for (const row of r.rows) {
        if (!row.expenseBreakdown) continue
        for (const item of row.expenseBreakdown) {
          assertGreaterThan(item.amount, 0, `age ${row.age}: expense item '${item.id}' > 0`)
          expenseItemCount++
        }
      }
      assertGreaterThan(expenseItemCount, 0, 'minstens één expense breakdown item aanwezig')
    },
  },
  {
    id: 'ie-breakdown-gap-analysis', name: 'Gap-analyse bij tekort', category: CAT,
    description: 'buildBreakdown() toont rijen met negatief surplus wanneer uitgaven > inkomen',
    priority: 'high', estimatedDurationMs: 150,
    fn() {
      // Run with very high expenses and low savings to create deficit rows
      const r = runStd({ yearlyExpenses: 60_000, annualSavings: 5_000, currentPortfolio: 50_000 })
      const bd = buildBreakdown(r.rows)

      assertGreaterThan(bd.rows.length, 0, 'breakdown rows aanwezig')

      // In a scenario with high expenses, there should be rows where surplus < 0
      // (especially in retirement with a small portfolio)
      const deficitRows = bd.rows.filter(row => row.surplus < 0)
      assertGreaterThan(deficitRows.length, 0, 'rijen met tekort (surplus < 0) bestaan')
    },
  },
  {
    id: 'ie-breakdown-event-names', name: 'Event namen behouden', category: CAT,
    description: 'Elk life event behoudt zijn eigen naam in de breakdown (niet gegroepeerd onder "overig")',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const pension: SimCashflow = {
        id: 'le-pensioen-test', name: 'Bedrijfspensioen', type: 'recurring',
        direction: 'income', amount: 12_000, fromAge: 65, toAge: null, indexed: true,
      }
      const r = runStd({}, [aowCashflow, pension])
      assert(r.fireReachable, 'FIRE bereikbaar')

      // Find rows where both events are active (age >= 67)
      const postBoth = r.rows.filter(row => row.age >= 67 && row.phase === 'retirement')
      if (postBoth.length === 0) return

      const row = postBoth[0]
      assertNotNull(row.incomeBreakdown, 'incomeBreakdown aanwezig')

      const labels = row.incomeBreakdown!.map(item => item.label)
      const ids = row.incomeBreakdown!.map(item => item.id)

      // Both events should appear with their own name, not grouped
      assert(ids.includes(aowCashflow.id), 'AOW event id aanwezig')
      assert(ids.includes(pension.id), 'Pensioen event id aanwezig')
      assert(labels.includes(aowCashflow.name), 'AOW label aanwezig')
      assert(labels.includes(pension.name), 'Pensioen label aanwezig')
    },
  },
  {
    id: 'ie-breakdown-one-time-events', name: 'Eenmalige events op juiste leeftijd', category: CAT,
    description: 'Eenmalige cashflows (bijv. erfenis) verschijnen alleen in de breakdown bij de juiste leeftijd',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [inheritanceCashflow])
      assert(r.fireReachable, 'FIRE bereikbaar')

      // Row at age 50 should contain the inheritance in its breakdown
      const row50 = r.rows.find(row => row.age === 50)
      assertNotNull(row50, 'rij op leeftijd 50 aanwezig')

      if (row50!.incomeBreakdown) {
        const erfenisItem = row50!.incomeBreakdown.find(item => item.id === inheritanceCashflow.id)
        assertNotNull(erfenisItem, 'erfenis item op leeftijd 50')
        assertGreaterThan(erfenisItem!.amount, 0, 'erfenis bedrag positief')
      }

      // Rows at other ages should NOT contain this one-time event
      const otherRows = r.rows.filter(row => row.age !== 50 && row.incomeBreakdown)
      for (const row of otherRows) {
        const found = row.incomeBreakdown!.find(item => item.id === inheritanceCashflow.id)
        assert(!found, `erfenis item NIET aanwezig op leeftijd ${row.age}`)
      }
    },
  },
  {
    id: 'ie-breakdown-backward-compat', name: 'Backward compatibility zonder breakdown velden', category: CAT,
    description: 'buildBreakdown() verwerkt rijen zonder incomeBreakdown/expenseBreakdown met fallback layers',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      // Create minimal SimRow data without breakdown fields (legacy format)
      const legacyRows: SimRow[] = [
        {
          age: 35, phase: 'accumulation', startPortfolio: 150_000,
          growth: 7_500, savings: 18_000, withdrawal: 0,
          cashflowNet: 0, oneTimeNet: 0, endPortfolio: 175_500,
          grossIncome: 54_000, grossExpenses: 36_000,
          flowIn: 0, flowOut: 0,
          // No incomeBreakdown or expenseBreakdown
        },
        {
          age: 60, phase: 'retirement', startPortfolio: 800_000,
          growth: 40_000, savings: 0, withdrawal: 36_000,
          cashflowNet: 0, oneTimeNet: 0, endPortfolio: 804_000,
          grossIncome: 40_000, grossExpenses: 36_000,
          flowIn: 0, flowOut: 0,
          // No incomeBreakdown or expenseBreakdown
        },
      ]

      const bd = buildBreakdown(legacyRows)

      // Should produce valid output with fallback layers
      assertEqual(bd.rows.length, 2, 'twee breakdown rows')
      assertGreaterThan(bd.incomeLayers.length, 0, 'income layers aanwezig')
      assertGreaterThan(bd.expenseLayers.length, 0, 'expense layers aanwezig')

      // Accumulation row fallback: savings + growth for income, withdrawal for expense
      assertEqual(bd.rows[0].incomeBySource['savings'], 18_000, 'fallback savings (= row.savings)')
      assertEqual(bd.rows[0].incomeBySource['growth'], 7_500, 'fallback growth (= row.growth)')
      // No withdrawal in accumulation (withdrawal = 0)
      assert(!bd.rows[0].expenseBySource['withdrawal'] || bd.rows[0].expenseBySource['withdrawal'] === 0, 'geen withdrawal in opbouwfase')

      // Retirement row fallback: growth for income, withdrawal for expense
      assertEqual(bd.rows[1].incomeBySource['growth'], 40_000, 'fallback growth')
      assertEqual(bd.rows[1].expenseBySource['withdrawal'], 36_000, 'fallback withdrawal')
    },
  },
  {
    id: 'ie-breakdown-layer-discovery', name: 'Layer discovery compleet', category: CAT,
    description: 'buildBreakdown().incomeLayers bevat alle unieke bronnen uit de data',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const pension: SimCashflow = {
        id: 'le-pensioen-disc', name: 'Pensioen', type: 'recurring',
        direction: 'income', amount: 15_000, fromAge: 65, toAge: null, indexed: true,
      }
      const r = runStd({}, [aowCashflow, pension])
      const bd = buildBreakdown(r.rows)

      // Extract all unique income source IDs from the raw rows
      const sourceIds = new Set<string>()
      for (const row of r.rows) {
        if (row.incomeBreakdown) {
          for (const item of row.incomeBreakdown) {
            if (item.amount > 0) sourceIds.add(item.id)
          }
        }
      }

      // Every source found in the data should have a corresponding layer
      const layerIds = new Set(bd.incomeLayers.map(l => l.id))
      for (const id of sourceIds) {
        assert(layerIds.has(id), `layer voor bron '${id}' aanwezig in incomeLayers`)
      }
    },
  },
  {
    id: 'ie-breakdown-persona-mix', name: 'Besparingen → pensioen transitie', category: CAT,
    description: 'Na pensionering verdwijnen besparingen uit breakdown, vermogensgroei blijft',
    priority: 'medium', estimatedDurationMs: 150,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')

      const accRows = r.rows.filter(row => row.phase === 'accumulation')
      const retRows = r.rows.filter(row => row.phase === 'retirement')

      assertGreaterThan(accRows.length, 0, 'accumulatie rows aanwezig')
      assertGreaterThan(retRows.length, 0, 'retirement rows aanwezig')

      // Accumulation: savings should be present (flow to net worth from earned income)
      const accRow = accRows[0]
      if (accRow.incomeBreakdown) {
        const hasSavings = accRow.incomeBreakdown.some(item => item.id === 'savings')
        assert(hasSavings, 'besparingen aanwezig in opbouwfase')
      }

      // Retirement: savings should NOT be present (no earned income), growth should be present
      const retRow = retRows.find(row => row.growth > 0 && row.incomeBreakdown)
      if (retRow && retRow.incomeBreakdown) {
        const hasSavings = retRow.incomeBreakdown.some(item => item.id === 'savings' && item.amount > 0)
        assert(!hasSavings, 'besparingen NIET aanwezig in pensioenfase')

        const hasGrowth = retRow.incomeBreakdown.some(item => item.id === 'growth')
        assert(hasGrowth, 'vermogensgroei aanwezig in pensioenfase')
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Inkomen & Uitgaven Bronanalyse',
    description: 'Tests voor SimRow incomeBreakdown/expenseBreakdown en buildBreakdown() transformatie',
    icon: 'BarChart3',
    testCount: 0,
  })
  registerTests(tests)
}
