import { registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertLessThanOrEqual,
  assertGreaterThanOrEqual, assertFinite, assert,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage,
  computeFreedomTime, computeSavingsRate,
} from '@/lib/core-metrics'

const CAT = 'kern.berekeningen'

const tests: TestCase[] = [
  // ── computeEffectiveExpenses ──────────────────────────────────────────
  {
    id: 'kern-ee-must-only', name: 'Effectieve uitgaven: alleen vaste lasten', category: CAT,
    description: 'Wanneer moet-uitgaven > 0, retourneer moet-uitgaven',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeEffectiveExpenses(30_000, 48_000), 30_000, 'moet-uitgaven gekozen')
    },
  },
  {
    id: 'kern-ee-mix', name: 'Effectieve uitgaven: mix vast/variabel', category: CAT,
    description: 'Moet-uitgaven lager dan totaal → moet-uitgaven wint',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeEffectiveExpenses(24_000, 48_000), 24_000, 'moet < totaal')
      assertEqual(computeEffectiveExpenses(60_000, 48_000), 60_000, 'moet > totaal')
    },
  },
  {
    id: 'kern-ee-zero', name: 'Effectieve uitgaven: nul-uitgaven', category: CAT,
    description: 'Bij 0 moet-uitgaven, fallback naar jaaruitgaven',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeEffectiveExpenses(0, 48_000), 48_000, 'fallback naar jaar')
      assertEqual(computeEffectiveExpenses(0, 0), 0, 'beide nul')
    },
  },
  {
    id: 'kern-ee-negative', name: 'Effectieve uitgaven: negatieve correcties', category: CAT,
    description: 'Negatieve moet-uitgaven behandeld als 0 (fallback)',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // Negative mustExpenses <= 0, so falls back to yearlyExpenses
      assertEqual(computeEffectiveExpenses(-5_000, 36_000), 36_000, 'negatief → fallback')
      assertEqual(computeEffectiveExpenses(-1, 24_000), 24_000, 'net onder nul → fallback')
    },
  },

  // ── computeFireTarget ─────────────────────────────────────────────────
  {
    id: 'kern-ft-swr4', name: 'FIRE target: 4% SWR', category: CAT,
    description: 'Standaard 4% rule of thumb',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFireTarget(40_000, 0.04), 1_000_000, '40K/4% = 1M')
      assertEqual(computeFireTarget(24_000, 0.04), 600_000, '24K/4% = 600K')
    },
  },
  {
    id: 'kern-ft-swr-nl', name: 'FIRE target: NL SWR (2.88%)', category: CAT,
    description: 'Nederlandse Box3-gecorrigeerde SWR',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const target = computeFireTarget(40_000, 0.0288)
      // 40_000 / 0.0288 ≈ 1_388_888.89
      assertGreaterThan(target, 1_388_000, 'NL SWR target > 1.388M')
      assertLessThanOrEqual(target, 1_389_000, 'NL SWR target < 1.389M')
    },
  },
  {
    id: 'kern-ft-partner', name: 'FIRE target: met partner (hogere uitgaven)', category: CAT,
    description: 'Hogere uitgaven door partner resulteren in hoger target',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const solo = computeFireTarget(30_000, 0.04)
      const partner = computeFireTarget(45_000, 0.04)
      assertGreaterThan(partner, solo, 'partner target > solo target')
      assertEqual(partner, 1_125_000, '45K/4% = 1.125M')
    },
  },
  {
    id: 'kern-ft-kinderen', name: 'FIRE target: met kinderen (hogere uitgaven)', category: CAT,
    description: 'Kinderen verhogen uitgaven → hoger FIRE target',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const geenKinderen = computeFireTarget(36_000, 0.04)
      const metKinderen = computeFireTarget(48_000, 0.04)
      assertGreaterThan(metKinderen, geenKinderen, 'met kinderen > zonder')
      assertEqual(metKinderen, 1_200_000, '48K/4% = 1.2M')
    },
  },
  {
    id: 'kern-ft-zero', name: 'FIRE target: nul uitgaven', category: CAT,
    description: 'Bij 0 uitgaven is FIRE target 0',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFireTarget(0, 0.04), 0, 'nul uitgaven → nul target')
      assertEqual(computeFireTarget(0, 0.0288), 0, 'nul uitgaven NL SWR')
    },
  },

  // ── computeFreedomPercentage ──────────────────────────────────────────
  {
    id: 'kern-fp-zero-worth', name: 'Vrijheidspercentage: vermogen=0', category: CAT,
    description: 'Geen vermogen → 0%',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(0, 1_000_000), 0, 'nul vermogen')
    },
  },
  {
    id: 'kern-fp-zero-target', name: 'Vrijheidspercentage: target=0', category: CAT,
    description: 'Geen target → 0% (division by zero guard)',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(500_000, 0), 0, 'nul target')
      assertEqual(computeFreedomPercentage(0, 0), 0, 'beide nul')
    },
  },
  {
    id: 'kern-fp-over100', name: 'Vrijheidspercentage: vermogen > target (>100%)', category: CAT,
    description: 'Boven target → capped op 100%',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(2_000_000, 1_000_000), 100, 'capped at 100')
      assertEqual(computeFreedomPercentage(1_000_001, 1_000_000), 100, 'net boven target')
    },
  },
  {
    id: 'kern-fp-partial', name: 'Vrijheidspercentage: tussenliggende waarden', category: CAT,
    description: 'Correcte percentageberekening',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(500_000, 1_000_000), 50, '50%')
      assertEqual(computeFreedomPercentage(250_000, 1_000_000), 25, '25%')
      assertEqual(computeFreedomPercentage(100_000, 1_000_000), 10, '10%')
    },
  },
  {
    id: 'kern-fp-negative-worth', name: 'Vrijheidspercentage: negatief vermogen', category: CAT,
    description: 'Negatief vermogen → clamped op 0%',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeFreedomPercentage(-100_000, 1_000_000), 0, 'negatief → 0%')
    },
  },

  // ── computeFreedomTime ────────────────────────────────────────────────
  {
    id: 'kern-ftm-basic', name: 'Vrijheidstijd: correcte conversie', category: CAT,
    description: 'Jaren en maanden berekening uit vermogen/uitgaven',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const t = computeFreedomTime(500_000, 40_000)
      // 500K / 40K = 12.5 jaar = 12 jaar, 6 maanden
      assertEqual(t.years, 12, '12 jaar')
      assertEqual(t.months, 6, '6 maanden')
    },
  },
  {
    id: 'kern-ftm-exact-fire', name: 'Vrijheidstijd: exact FIRE grens', category: CAT,
    description: 'Bij exact heel getal jaren, 0 restmaanden',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // 100K / 25K = 4.0 jaar exact
      const t = computeFreedomTime(100_000, 25_000)
      assertEqual(t.years, 4, '4 jaar exact')
      assertEqual(t.months, 0, '0 restmaanden')
    },
  },
  {
    id: 'kern-ftm-zero-expenses', name: 'Vrijheidstijd: nul uitgaven', category: CAT,
    description: 'Geen uitgaven → 0 (geen oneindige vrijheid)',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const t = computeFreedomTime(500_000, 0)
      assertEqual(t.years, 0, 'nul uitgaven → 0 jaar')
      assertEqual(t.months, 0, 'nul uitgaven → 0 maanden')
    },
  },
  {
    id: 'kern-ftm-zero-worth', name: 'Vrijheidstijd: nul vermogen', category: CAT,
    description: 'Geen vermogen → 0 jaar 0 maanden',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const t = computeFreedomTime(0, 40_000)
      assertEqual(t.years, 0, '0 jaar')
      assertEqual(t.months, 0, '0 maanden')
    },
  },
  {
    id: 'kern-ftm-negative-worth', name: 'Vrijheidstijd: negatief vermogen', category: CAT,
    description: 'Negatief vermogen → clamped op 0',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const t = computeFreedomTime(-50_000, 40_000)
      assertEqual(t.years, 0, 'clamped jaar')
      assertEqual(t.months, 0, 'clamped maanden')
    },
  },
  {
    id: 'kern-ftm-large', name: 'Vrijheidstijd: groot vermogen', category: CAT,
    description: 'Grote waarden produceren finite resultaat',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // 5M / 40K = 125 jaar
      const t = computeFreedomTime(5_000_000, 40_000)
      assertEqual(t.years, 125, '125 jaar')
      assertEqual(t.months, 0, '0 restmaanden')
      assertFinite(t.years, 'finite jaren')
      assertFinite(t.months, 'finite maanden')
    },
  },

  // ── computeSavingsRate ────────────────────────────────────────────────
  {
    id: 'kern-sr-zero-income', name: 'Spaarquote: inkomen=0', category: CAT,
    description: 'Geen inkomen → 0% spaarquote',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeSavingsRate(0, 3_000), 0, 'geen inkomen')
      assertEqual(computeSavingsRate(0, 0), 0, 'alles nul')
    },
  },
  {
    id: 'kern-sr-negative', name: 'Spaarquote: uitgaven > inkomen (negatief)', category: CAT,
    description: 'Meer uitgeven dan verdienen → negatieve spaarquote',
    priority: 'critical', estimatedDurationMs: 5,
    fn() {
      const rate = computeSavingsRate(3_000, 5_000)
      // (3000 - 5000) / 3000 * 100 = -66.67%
      assert(rate < 0, 'negatieve spaarquote')
      assertFinite(rate, 'finite')
    },
  },
  {
    id: 'kern-sr-perfect', name: 'Spaarquote: perfecte spaarder', category: CAT,
    description: '100% spaarquote bij nul uitgaven',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeSavingsRate(5_000, 0), 100, '100% spaarquote')
    },
  },
  {
    id: 'kern-sr-normal', name: 'Spaarquote: normaal scenario', category: CAT,
    description: 'Typische spaarquote berekening',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // (5000 - 3000) / 5000 * 100 = 40%
      assertEqual(computeSavingsRate(5_000, 3_000), 40, '40%')
      // (4000 - 3000) / 4000 * 100 = 25%
      assertEqual(computeSavingsRate(4_000, 3_000), 25, '25%')
    },
  },
  {
    id: 'kern-sr-savings-budget', name: 'Spaarquote: met savingsBudgetSpent', category: CAT,
    description: 'Spaarbedrag in budget telt mee als besparing, niet als uitgave',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      // Without savings budget: (5000 - 4000) / 5000 = 20%
      // With 500 savings budget: (5000 - 4000 + 500) / 5000 = 30%
      const without = computeSavingsRate(5_000, 4_000)
      const withSavings = computeSavingsRate(5_000, 4_000, 500)
      assertEqual(without, 20, 'zonder spaarbegroting')
      assertEqual(withSavings, 30, 'met spaarbegroting')
      assertGreaterThan(withSavings, without, 'spaarbegroting verhoogt rate')
    },
  },
  {
    id: 'kern-sr-breakeven', name: 'Spaarquote: break-even', category: CAT,
    description: 'Inkomen = uitgaven → 0% spaarquote',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      assertEqual(computeSavingsRate(4_000, 4_000), 0, 'break-even')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
