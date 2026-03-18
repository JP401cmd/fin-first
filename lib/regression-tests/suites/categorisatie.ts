import { registerTests } from '../test-registry'
import { assertEqual, assertNotNull, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import { frequencyMatch, categorizeTransaction, type FrequencyMatch } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

const CAT = 'categorisatie'

function mockBudget(id: string, name: string, slug: string): Budget {
  return {
    id, name, slug, type: 'expense', parent_id: null, sort_order: 0,
    default_limit: '0', icon: null, color: null, is_income: false,
  } as unknown as Budget
}

const tests: TestCase[] = [
  {
    id: 'cat-freq-match', name: 'Frequentie match', category: CAT,
    description: 'frequencyMatch vindt bekende tegenpartijen',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const freqMap = new Map<string, FrequencyMatch>([
        ['name:albert heijn', { budget_id: 'b1', count: 15, total: 16, confidence: 0.94 }],
      ])
      const r = frequencyMatch('Albert Heijn Amsterdam', null, freqMap)
      assertNotNull(r, 'match gevonden')
      assertEqual(r!.budget_id, 'b1', 'budget_id')
      assertGreaterThanOrEqual(r!.confidence, 0.90, 'confidence')
    },
  },
  {
    id: 'cat-freq-no-match', name: 'Geen frequentie match', category: CAT,
    description: 'Onbekende tegenpartij retourneert null',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const freqMap = new Map<string, FrequencyMatch>()
      const r = frequencyMatch('Onbekend BV', null, freqMap)
      assertEqual(r, null, 'geen match')
    },
  },
  {
    id: 'cat-categorize', name: 'Categorisatie pipeline', category: CAT,
    description: 'categorizeTransaction matcht via frequentie of slug',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const budgets = [mockBudget('b1', 'Boodschappen', 'boodschappen')]
      const freqMap = new Map<string, FrequencyMatch>([
        ['name:albert heijn', { budget_id: 'b1', count: 15, total: 16, confidence: 0.94 }],
      ])
      const r = categorizeTransaction(
        'Albert Heijn',
        'Albert Heijn BV',
        -45.50,
        budgets as Budget[],
        undefined,
        undefined,
        null,
        freqMap,
      )
      assertNotNull(r, 'categorisatie resultaat')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
