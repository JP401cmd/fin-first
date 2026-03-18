import { registerTests } from '../test-registry'
import { assertEqual, assertGreaterThan, assertLessThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import {
  computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage,
  computeFreedomTime, computeSavingsRate,
} from '@/lib/core-metrics'

const CAT = 'kern-metrics'

const tests: TestCase[] = [
  {
    id: 'kern-effective-expenses', name: 'Effectieve uitgaven', category: CAT,
    description: 'Moet-uitgaven of fallback naar jaarbedrag',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeEffectiveExpenses(30_000, 48_000), 30_000, 'moet-uitgaven')
      assertEqual(computeEffectiveExpenses(0, 48_000), 48_000, 'fallback')
      assertEqual(computeEffectiveExpenses(-1, 48_000), 48_000, 'negatief fallback')
    },
  },
  {
    id: 'kern-fire-target', name: 'FIRE target', category: CAT,
    description: 'FIRE target = uitgaven / SWR',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFireTarget(40_000, 0.04), 1_000_000, '4% SWR')
      assertEqual(computeFireTarget(0, 0.04), 0, 'nul uitgaven')
    },
  },
  {
    id: 'kern-freedom-pct', name: 'Vrijheidspercentage', category: CAT,
    description: 'Percentage vermogen / FIRE target',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const pct = computeFreedomPercentage(500_000, 1_000_000)
      assertEqual(pct, 50, '50%')
      assertEqual(computeFreedomPercentage(0, 1_000_000), 0, '0%')
    },
  },
  {
    id: 'kern-freedom-time', name: 'Vrijheidstijd', category: CAT,
    description: 'Jaren en maanden berekening',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const t = computeFreedomTime(500_000, 40_000)
      assertEqual(t.years, 12, '12 jaar')
      assertEqual(t.months, 6, '6 maanden')
    },
  },
  {
    id: 'kern-savings-rate', name: 'Spaarquote', category: CAT,
    description: 'Spaarquote als percentage van inkomen',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = computeSavingsRate(5_000, 3_000)
      assertEqual(r, 40, '40% spaarquote')
      assertEqual(computeSavingsRate(0, 3_000), 0, 'geen inkomen')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
