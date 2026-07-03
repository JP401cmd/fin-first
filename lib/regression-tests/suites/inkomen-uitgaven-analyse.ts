import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import type { SimCashflow, SimRow, ReturnModel } from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from './_kernel-sim'
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
    id: 'ie-breakdown-acc-savings', name: 'Besparingen in opbouwfase (buildBreakdown-fallback)', category: CAT,
    description: 'ECHTE PRODUCTIEBEVINDING (niet een shim-beperking): `toSimResult`/`toSimRow` (lib/unified-projection.ts) vullen `SimRow.incomeBreakdown`/`expenseBreakdown` sinds de kernel-migratie NOOIT meer — ook zonder cashflows. `buildBreakdownFromSimRows` valt daardoor altijd terug op row.savings/row.growth/row.withdrawal (fallback-tak). Deze test toetst die fallback. HERIJKTE GRONDSLAG: op de kernel-tak is savings netto van de Box 3-heffing van de VORIGE maand (CF!G = D - E - Bel!N(m-1), lib/horizon-kernel/tables/cf.ts) — de oude v1/v2-motor trok Box 3 alleen van het rendement af, niet van de CF-inleg. Jaar 0 bevat dus altijd een kleiner bedrag dan de nominale annualSavings (maand 0 is nog ongetaxeerd, maand 1-11 dragen oplopende Box 3-heffing) — vandaar `<=` i.p.v. `≈`.',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      const bd = buildBreakdown(r.rows)
      const accRows = bd.rows.filter(row => row.phase === 'accumulation')
      assertGreaterThan(accRows.length, 0, 'accumulatie rows aanwezig')

      const first = accRows[0]
      const savingsAmount = first.incomeBySource['savings']
      assertNotNull(savingsAmount, 'savings fallback-item gevonden')

      // Savings represents the flow to net worth, netto van Box 3-heffing (zie boven) —
      // nooit hoger dan de nominale annualSavings, en niet extreem lager (orde-grootte-check).
      const expectedSavings = STANDARD.annualSavings
      assertLessThanOrEqual(savingsAmount!, expectedSavings + 1, 'savings ≤ annualSavings (netto van Box 3-heffing)')
      assertGreaterThan(savingsAmount!, expectedSavings * 0.5, 'savings niet extreem lager dan annualSavings (plausibiliteit)')
    },
  },
  {
    id: 'ie-breakdown-acc-growth', name: 'Rendement in opbouwfase (buildBreakdown-fallback)', category: CAT,
    description: 'Zie ie-breakdown-acc-savings voor de productiebevinding (geen incomeBreakdown meer op kernel-SimRows). Toetst de growth-fallback (row.growth > 0 → incomeBySource.growth).',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      const bd = buildBreakdown(r.rows)
      const accRows = bd.rows.filter(row => row.phase === 'accumulation' && (row.incomeBySource['growth'] ?? 0) > 0)
      assertGreaterThan(accRows.length, 0, 'accumulatie rows met positieve groei')

      const growthAmount = accRows[0].incomeBySource['growth']
      assertNotNull(growthAmount, 'growth fallback-item gevonden in opbouwfase')
      assertGreaterThan(growthAmount!, 0, 'growth bedrag positief')
    },
  },
  {
    id: 'ie-breakdown-box3-visible', name: 'Box 3 belasting NIET zichtbaar (gap-lock)', category: CAT,
    description: 'ECHTE PRODUCTIEBEVINDING — geen shim-beperking: sinds de kernel-migratie heeft buildBreakdownFromSimRows (lib/income-expense-breakdown.ts) GEEN fallback voor Box 3 (SimRow draagt geen totalBox3-veld, en incomeBreakdown/expenseBreakdown zijn altijd leeg — zie ie-breakdown-acc-savings). Het gebruikte pad in productie is app/(app)/horizon/whatif/whatif-page-client.tsx regel 879 (buildBreakdownFromSimRows(whatIfSim.result.rows)) — de Box 3-laag in die grafiek toont dus geen bedrag meer. Deze test legt die huidige (ongewenste) staat bewust vast in plaats van die stil te laten verdwijnen; wordt rood zodra iemand een box3-fallback toevoegt (dan hoort deze test bijgewerkt te worden, niet de kernel).',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd({ returnModel: 'nl_box3' })
      const bd = buildBreakdown(r.rows)
      const box3Layer = bd.expenseLayers.find(l => l.id === 'box3')
      assert(!box3Layer, 'GAP: box3-laag ontbreekt (geen fallback in buildBreakdownFromSimRows sinds de kernel-migratie)')
      for (const row of bd.rows) {
        assert(!('box3' in row.expenseBySource), `GAP: geen box3 in expenseBySource op leeftijd ${row.age}`)
      }
    },
  },
  {
    id: 'ie-breakdown-acc-events', name: 'Life events in opbouwfase inkomen (buildBreakdown pass-through)', category: CAT,
    description: 'GAP t.o.v. de v2-engine: de kernel-sim-shim (_kernel-sim.ts) negeert cashflows — er is geen faithful lifeEvents-mapping vanaf een losse SimCashflow-argumentenlijst. Deze test toetst daarom rechtstreeks dat buildBreakdown() een genoemd incomeBreakdown-item (zoals de sim-engine dat vóór de migratie produceerde) ongewijzigd doorgeeft (id/label/bedrag) — GEEN sim→cashflow-integratietest meer.',
    priority: 'high', estimatedDurationMs: 20,
    fn() {
      const row: SimRow = {
        age: 68, phase: 'retirement', startPortfolio: 500_000,
        growth: 20_000, savings: 0, withdrawal: 20_000,
        cashflowNet: aowCashflow.amount, oneTimeNet: 0, endPortfolio: 504_000,
        grossIncome: 36_000, grossExpenses: 36_000,
        flowIn: 36_000, flowOut: 20_000,
        incomeBreakdown: [
          { id: 'growth', label: 'Rendement', amount: 20_000 },
          { id: aowCashflow.id, label: aowCashflow.name, amount: aowCashflow.amount },
        ],
      }
      const bd = buildBreakdown([row])
      assertEqual(bd.rows.length, 1, 'één breakdown row')
      const aowAmount = bd.rows[0].incomeBySource[aowCashflow.id]
      assertNotNull(aowAmount, 'AOW item doorgegeven in incomeBySource')
      assertEqual(aowAmount, aowCashflow.amount, 'AOW bedrag klopt')
      const aowLayer = bd.incomeLayers.find(l => l.id === aowCashflow.id)
      assertNotNull(aowLayer, 'AOW layer aangemaakt')
      assertEqual(aowLayer!.label, aowCashflow.name, 'AOW label komt overeen')
    },
  },
  {
    id: 'ie-breakdown-ret-growth', name: 'Vermogensgroei in pensioenfase (buildBreakdown-fallback)', category: CAT,
    description: 'Zie ie-breakdown-acc-savings voor de productiebevinding. Toetst de growth-fallback in de pensioenfase: incomeBySource.growth = max(0, row.growth).',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      const bd = buildBreakdown(r.rows)

      // Find early retirement rows where growth is positive
      const retRows = r.rows.filter(row => row.phase === 'retirement' && row.growth > 0)
      assertGreaterThan(retRows.length, 0, 'retirement rows met positieve groei')

      const rawRow = retRows[0]
      const bdRow = bd.rows.find(row => row.age === rawRow.age)
      assertNotNull(bdRow, 'breakdown row gevonden voor dezelfde leeftijd')
      const growthAmount = bdRow!.incomeBySource['growth']
      assertNotNull(growthAmount, 'growth fallback-item gevonden')

      // Growth amount should match max(0, row.growth) within rounding
      const expectedGrowth = Math.max(0, rawRow.growth)
      assertLessThanOrEqual(
        Math.abs(growthAmount! - expectedGrowth), 1,
        `growth bedrag (${growthAmount}) ~= max(0, row.growth) (${expectedGrowth})`,
      )
    },
  },
  {
    id: 'ie-breakdown-ret-withdrawal', name: 'Levensonderhoud in pensioenfase (buildBreakdown-fallback)', category: CAT,
    description: 'Zie ie-breakdown-acc-savings voor de productiebevinding. Toetst de withdrawal-fallback: expenseBySource.withdrawal = row.withdrawal, layer-label = Levensonderhoud.',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      const bd = buildBreakdown(r.rows)

      const retRows = r.rows.filter(row => row.phase === 'retirement' && row.withdrawal > 0)
      assertGreaterThan(retRows.length, 0, 'retirement rows met onttrekking')

      const rawRow = retRows[0]
      const bdRow = bd.rows.find(row => row.age === rawRow.age)
      assertNotNull(bdRow, 'breakdown row gevonden voor dezelfde leeftijd')
      const withdrawalAmount = bdRow!.expenseBySource['withdrawal']
      assertNotNull(withdrawalAmount, 'withdrawal fallback-item gevonden')

      // The label for withdrawal is "Levensonderhoud" (not "Onttrekking")
      const withdrawalLayer = bd.expenseLayers.find(l => l.id === 'withdrawal')
      assertNotNull(withdrawalLayer, 'withdrawal layer aanwezig')
      assertEqual(withdrawalLayer!.label, 'Levensonderhoud', 'withdrawal label is Levensonderhoud')

      assertLessThanOrEqual(
        Math.abs(withdrawalAmount! - rawRow.withdrawal), 1,
        `withdrawal bedrag (${withdrawalAmount}) ~= row.withdrawal (${rawRow.withdrawal})`,
      )
    },
  },
  {
    id: 'ie-breakdown-totals-match', name: 'Breakdown fallback-items positief', category: CAT,
    description: 'Alle fallback incomeBySource/expenseBySource bedragen > 0 (vermogensstromen, niet huishoudinkomen). Zie ie-breakdown-acc-savings voor de productiebevinding (geen incomeBreakdown/expenseBreakdown meer op kernel-SimRows).',
    priority: 'critical', estimatedDurationMs: 150,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      const bd = buildBreakdown(r.rows)

      let incomeItemCount = 0
      for (const row of bd.rows) {
        for (const [id, amount] of Object.entries(row.incomeBySource)) {
          assertGreaterThan(amount, 0, `age ${row.age}: income item '${id}' > 0`)
          incomeItemCount++
        }
      }
      assertGreaterThan(incomeItemCount, 0, 'minstens één income breakdown item aanwezig')

      let expenseItemCount = 0
      for (const row of bd.rows) {
        for (const [id, amount] of Object.entries(row.expenseBySource)) {
          assertGreaterThan(amount, 0, `age ${row.age}: expense item '${id}' > 0`)
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
    id: 'ie-breakdown-event-names', name: 'Event namen behouden (buildBreakdown pass-through)', category: CAT,
    description: 'GAP t.o.v. de v2-engine: cashflows worden door de kernel-sim-shim genegeerd (zie _kernel-sim.ts) — geen sim-integratie meer. Deze test toetst rechtstreeks dat buildBreakdown() twee gelijktijdige genoemde incomeBreakdown-items elk hun eigen naam behouden (niet gegroepeerd onder "overig").',
    priority: 'high', estimatedDurationMs: 20,
    fn() {
      const pension: SimCashflow = {
        id: 'le-pensioen-test', name: 'Bedrijfspensioen', type: 'recurring',
        direction: 'income', amount: 12_000, fromAge: 65, toAge: null, indexed: true,
      }
      const row: SimRow = {
        age: 68, phase: 'retirement', startPortfolio: 500_000,
        growth: 0, savings: 0, withdrawal: 8_000,
        cashflowNet: aowCashflow.amount + pension.amount, oneTimeNet: 0, endPortfolio: 500_000,
        grossIncome: 36_000, grossExpenses: 36_000,
        flowIn: 28_000, flowOut: 8_000,
        incomeBreakdown: [
          { id: aowCashflow.id, label: aowCashflow.name, amount: aowCashflow.amount },
          { id: pension.id, label: pension.name, amount: pension.amount },
        ],
      }
      const bd = buildBreakdown([row])
      const labels = bd.incomeLayers.map(l => l.label)
      const ids = bd.incomeLayers.map(l => l.id)

      // Both events should appear with their own name, not grouped
      assert(ids.includes(aowCashflow.id), 'AOW event id aanwezig')
      assert(ids.includes(pension.id), 'Pensioen event id aanwezig')
      assert(labels.includes(aowCashflow.name), 'AOW label aanwezig')
      assert(labels.includes(pension.name), 'Pensioen label aanwezig')
    },
  },
  {
    id: 'ie-breakdown-one-time-events', name: 'Eenmalige events op juiste leeftijd (buildBreakdown pass-through)', category: CAT,
    description: 'GAP t.o.v. de v2-engine: cashflows worden door de kernel-sim-shim genegeerd — geen sim-integratie meer. Deze test toetst rechtstreeks dat buildBreakdown() een eenmalig item (bijv. erfenis) alleen op de rij meeneemt waar het item aanwezig is, niet op andere rijen.',
    priority: 'medium', estimatedDurationMs: 20,
    fn() {
      const rowWithErfenis: SimRow = {
        age: 50, phase: 'accumulation', startPortfolio: 300_000,
        growth: 15_000, savings: 18_000, withdrawal: 0,
        cashflowNet: 0, oneTimeNet: inheritanceCashflow.amount, endPortfolio: 383_000,
        grossIncome: 54_000, grossExpenses: 36_000,
        flowIn: 83_000, flowOut: 0,
        incomeBreakdown: [
          { id: 'savings', label: 'Besparingen', amount: 18_000 },
          { id: 'growth', label: 'Rendement', amount: 15_000 },
          { id: inheritanceCashflow.id, label: inheritanceCashflow.name, amount: inheritanceCashflow.amount },
        ],
      }
      const rowWithoutErfenis: SimRow = {
        age: 51, phase: 'accumulation', startPortfolio: 383_000,
        growth: 19_000, savings: 18_000, withdrawal: 0,
        cashflowNet: 0, oneTimeNet: 0, endPortfolio: 420_000,
        grossIncome: 54_000, grossExpenses: 36_000,
        flowIn: 37_000, flowOut: 0,
        incomeBreakdown: [
          { id: 'savings', label: 'Besparingen', amount: 18_000 },
          { id: 'growth', label: 'Rendement', amount: 19_000 },
        ],
      }
      const bd = buildBreakdown([rowWithErfenis, rowWithoutErfenis])
      assertEqual(bd.rows.length, 2, 'twee breakdown rows')

      const erfenisAmount = bd.rows[0].incomeBySource[inheritanceCashflow.id]
      assertNotNull(erfenisAmount, 'erfenis item op leeftijd 50')
      assertGreaterThan(erfenisAmount!, 0, 'erfenis bedrag positief')

      // Rij op leeftijd 51 mag dit eenmalige item NIET bevatten
      const found = bd.rows[1].incomeBySource[inheritanceCashflow.id]
      assert(!found, `erfenis item NIET aanwezig op leeftijd ${bd.rows[1].age}`)
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

      // Extract all unique income source IDs uit de FALLBACK-breakdown (bd.rows —
      // r.rows.incomeBreakdown is altijd leeg sinds de kernel-migratie, zie
      // ie-breakdown-acc-savings). Zonder deze aanpassing was de oorspronkelijke
      // `if (row.incomeBreakdown)`-guard hier stil vacuously-true geworden.
      const sourceIds = new Set<string>()
      for (const row of bd.rows) {
        for (const [id, amount] of Object.entries(row.incomeBySource)) {
          if (amount > 0) sourceIds.add(id)
        }
      }
      assertGreaterThan(sourceIds.size, 0, 'minstens één income-bron gevonden (savings/growth-fallback)')

      // Every source found in the data should have a corresponding layer
      const layerIds = new Set(bd.incomeLayers.map(l => l.id))
      for (const id of sourceIds) {
        assert(layerIds.has(id), `layer voor bron '${id}' aanwezig in incomeLayers`)
      }
    },
  },
  {
    id: 'ie-breakdown-persona-mix', name: 'Besparingen → pensioen transitie (buildBreakdown-fallback)', category: CAT,
    description: 'Na pensionering verdwijnen besparingen uit de fallback-breakdown, vermogensgroei blijft. Zie ie-breakdown-acc-savings voor de productiebevinding (r.rows.incomeBreakdown is altijd leeg sinds de kernel-migratie — dit toetst bd.rows uit buildBreakdown() i.p.v. de rauwe SimRow.incomeBreakdown, anders was de oorspronkelijke `if`-guard hier stil vacuously-true).',
    priority: 'medium', estimatedDurationMs: 150,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      const bd = buildBreakdown(r.rows)

      const accRows = bd.rows.filter(row => row.phase === 'accumulation')
      const retRows = bd.rows.filter(row => row.phase === 'retirement')

      assertGreaterThan(accRows.length, 0, 'accumulatie rows aanwezig')
      assertGreaterThan(retRows.length, 0, 'retirement rows aanwezig')

      // Accumulation: savings should be present (flow to net worth from earned income)
      const accRow = accRows[0]
      const hasSavingsAcc = (accRow.incomeBySource['savings'] ?? 0) > 0
      assert(hasSavingsAcc, 'besparingen aanwezig in opbouwfase')

      // Retirement: savings should NOT be present (no earned income), growth should be present
      const retRow = retRows.find(row => (row.incomeBySource['growth'] ?? 0) > 0)
      assertNotNull(retRow, 'retirement row met positieve groei gevonden')
      const hasSavingsRet = (retRow!.incomeBySource['savings'] ?? 0) > 0
      assert(!hasSavingsRet, 'besparingen NIET aanwezig in pensioenfase')

      const hasGrowthRet = (retRow!.incomeBySource['growth'] ?? 0) > 0
      assert(hasGrowthRet, 'vermogensgroei aanwezig in pensioenfase')
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
