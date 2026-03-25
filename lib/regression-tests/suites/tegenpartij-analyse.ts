import { registerTests } from '../test-registry'
import { assertEqual, assertGreaterThan, assertGreaterThanOrEqual, assertNotNull, assert } from '../assert'
import type { TestCase } from '../test-types'
import { computeCounterpartyStats, computeMonthCategoryBreakdown, type CounterpartyTransaction } from '@/lib/counterparty-analysis'

const CAT = 'kern.tegenpartij-analyse'

// ── Test data helpers ────────────────────────────────────────────────────────

function tx(overrides: Partial<CounterpartyTransaction> & { date: string; amount: number }): CounterpartyTransaction {
  return {
    id: crypto.randomUUID(),
    description: 'Test transactie',
    budget_id: null,
    is_income: overrides.amount > 0,
    budget: null,
    ...overrides,
  }
}

function monthlyTxs(counterparty: string, months: number, amount: number, budgetId?: string): CounterpartyTransaction[] {
  const result: CounterpartyTransaction[] = []
  const now = new Date()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15)
    const dateStr = d.toISOString().split('T')[0]
    result.push(tx({
      date: dateStr,
      amount,
      description: `Betaling ${counterparty}`,
      budget_id: budgetId ?? null,
      budget: budgetId ? { name: 'Boodschappen' } : null,
    }))
  }
  return result
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: 'tp-groepering-basic', name: 'Basisgroepering op naam', category: CAT,
    description: 'computeCounterpartyStats groepeert transacties correct',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const txs = monthlyTxs('Albert Heijn', 6, -45)
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.transactionCount, 6, 'aantal transacties')
      assertGreaterThan(stats.monthlyBreakdown.length, 0, 'heeft maandelijkse breakdown')
    },
  },
  {
    id: 'tp-totalen-correct', name: 'Totalen en gemiddelden correct', category: CAT,
    description: 'Totaal uitgegeven, ontvangen en gemiddelde correct berekend',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const txs = [
        tx({ date: '2026-01-15', amount: -100 }),
        tx({ date: '2026-02-15', amount: -200 }),
        tx({ date: '2026-03-15', amount: 50 }),
      ]
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.totalSpent, -300, 'totaal uitgegeven')
      assertEqual(stats.totalReceived, 50, 'totaal ontvangen')
      assertEqual(stats.transactionCount, 3, 'aantal')
      // Average: (-100 + -200 + 50) / 3 = -83.33...
      assert(Math.abs(stats.averageAmount - (-250 / 3)) < 0.01, 'gemiddeld bedrag')
    },
  },
  {
    id: 'tp-maandtrend', name: 'Maandelijkse aggregatie', category: CAT,
    description: 'Maandelijkse breakdown bevat juiste maanden en totalen',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const txs = [
        tx({ date: '2026-01-10', amount: -50 }),
        tx({ date: '2026-01-20', amount: -30 }),
        tx({ date: '2026-02-15', amount: -70 }),
      ]
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.monthlyBreakdown.length, 2, 'twee maanden')
      const jan = stats.monthlyBreakdown.find(m => m.month === '2026-01')
      assertNotNull(jan, 'januari gevonden')
      assertEqual(jan!.total, -80, 'januari totaal')
      assertEqual(jan!.count, 2, 'januari count')
    },
  },
  {
    id: 'tp-categorie-verdeling', name: 'Verdeling over budgetten', category: CAT,
    description: 'Categorie-breakdown toont correcte verdeling over meerdere budgetten',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const txs = [
        tx({ date: '2026-01-15', amount: -100, budget_id: 'b1', budget: { name: 'Boodschappen' } }),
        tx({ date: '2026-02-15', amount: -100, budget_id: 'b1', budget: { name: 'Boodschappen' } }),
        tx({ date: '2026-03-15', amount: -50, budget_id: 'b2', budget: { name: 'Overig' } }),
      ]
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.categoryBreakdown.length, 2, 'twee categorieën')
      const boodschappen = stats.categoryBreakdown.find(c => c.budgetName === 'Boodschappen')
      assertNotNull(boodschappen, 'boodschappen gevonden')
      assertEqual(boodschappen!.count, 2, 'boodschappen count')
      assertEqual(boodschappen!.total, -200, 'boodschappen totaal')
      assertGreaterThanOrEqual(boodschappen!.percentage, 70, 'boodschappen percentage >= 70%')
    },
  },
  {
    id: 'tp-frequentie-detectie', name: 'Frequentiepatroon herkenning', category: CAT,
    description: 'Detecteert maandelijks patroon bij regelmatige intervallen',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // 12 maandelijkse transacties → moet "Maandelijks" detecteren
      const txs = monthlyTxs('Shell', 12, -60)
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.frequency.label, 'Maandelijks', 'frequentie label')
      assert(stats.frequency.confidence !== 'low', 'confidence niet low')
    },
  },
  {
    id: 'tp-enkel-transactie', name: 'Eén transactie → basisresultaat', category: CAT,
    description: 'Enkele transactie retourneert geldige stats zonder trend/frequentie',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const txs = [tx({ date: '2026-03-01', amount: -99 })]
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.transactionCount, 1, 'count')
      assertEqual(stats.totalSpent, -99, 'totaal')
      assertEqual(stats.monthlyBreakdown.length, 1, 'één maand')
      assertEqual(stats.frequency.label, 'Onregelmatig', 'frequentie bij 1 tx')
    },
  },
  {
    id: 'tp-inkomen-en-uitgave', name: 'Gemengde richting tegenpartij', category: CAT,
    description: 'Tegenpartij met zowel inkomsten als uitgaven toont correcte splits',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const txs = [
        tx({ date: '2026-01-25', amount: 3000, is_income: true }), // salaris
        tx({ date: '2026-02-25', amount: 3000, is_income: true }),
        tx({ date: '2026-01-15', amount: -250, is_income: false }), // declaratie terug
      ]
      const stats = computeCounterpartyStats(txs)
      assertEqual(stats.totalReceived, 6000, 'totaal ontvangen')
      assertEqual(stats.totalSpent, -250, 'totaal uitgegeven')
      assertEqual(stats.transactionCount, 3, 'count')
    },
  },
  {
    id: 'tp-leeg-resultaat', name: 'Geen match → leeg resultaat', category: CAT,
    description: 'Lege transactielijst retourneert nul-stats',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const stats = computeCounterpartyStats([])
      assertEqual(stats.transactionCount, 0, 'count')
      assertEqual(stats.totalSpent, 0, 'totaal uitgegeven')
      assertEqual(stats.totalReceived, 0, 'totaal ontvangen')
      assertEqual(stats.monthlyBreakdown.length, 0, 'geen maanden')
      assertEqual(stats.categoryBreakdown.length, 0, 'geen categorieën')
    },
  },
  {
    id: 'tp-maand-filter-categorie', name: 'Categorie-verdeling per maand', category: CAT,
    description: 'computeMonthCategoryBreakdown filtert correct per maand',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const txs = [
        tx({ date: '2026-01-15', amount: -100, budget_id: 'b1', budget: { name: 'Boodschappen' } }),
        tx({ date: '2026-01-20', amount: -50, budget_id: 'b2', budget: { name: 'Overig' } }),
        tx({ date: '2026-02-15', amount: -200, budget_id: 'b1', budget: { name: 'Boodschappen' } }),
      ]
      const janTxs = txs.filter(t => t.date.startsWith('2026-01'))
      const cats = computeMonthCategoryBreakdown(janTxs)
      assertEqual(cats.length, 2, 'twee categorieën in januari')
      const boodschappen = cats.find(c => c.budgetName === 'Boodschappen')
      assertNotNull(boodschappen, 'boodschappen gevonden')
      assertEqual(boodschappen!.total, -100, 'alleen januari bedrag')
    },
  },
  {
    id: 'tp-maand-filter-subset', name: 'Maandfilter geeft correcte subset', category: CAT,
    description: 'Filteren op maandprefix geeft alleen transacties van die maand',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const txs = monthlyTxs('Shell', 6, -60)
      const now = new Date()
      const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const filtered = txs.filter(t => t.date.startsWith(targetMonth))
      assertGreaterThan(filtered.length, 0, 'heeft transacties deze maand')
      // All filtered txs should have the same month prefix
      for (const t of filtered) {
        assert(t.date.startsWith(targetMonth), `tx datum ${t.date} begint met ${targetMonth}`)
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}
