import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import {
  classifyLifeEvent,
  splitLifeEvents,
  computeLifeEventNetImpact,
} from '@/lib/horizon-data'
import type { LifeEvent } from '@/lib/horizon-data'

const CAT = 'horizon.levensgebeurtenissen-classificatie'

// ── Helper: minimal LifeEvent factory ────────────────────────────────────────

function makeTestEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: overrides.id ?? 'test-event-1',
    name: overrides.name ?? 'Test Event',
    event_type: overrides.event_type ?? 'custom',
    target_age: overrides.target_age ?? 40,
    target_date: overrides.target_date ?? null,
    one_time_cost: overrides.one_time_cost ?? 0,
    monthly_cost_change: overrides.monthly_cost_change ?? 0,
    monthly_income_change: overrides.monthly_income_change ?? 0,
    duration_months: overrides.duration_months ?? 0,
    icon: overrides.icon ?? '📋',
    is_active: overrides.is_active ?? true,
    sort_order: overrides.sort_order ?? 0,
    is_indexed: overrides.is_indexed ?? false,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // Test 1: erfenis met positieve one_time_cost → 'opbouwen'
  {
    id: 'classify-erfenis-opbouwen',
    name: 'Erfenis (one_time_cost: 50000) → opbouwen',
    category: CAT,
    description: 'Erfenis met positief eenmalig bedrag bouwt vrijheid op',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'Erfenis',
        one_time_cost: 50000,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'opbouwen', 'Erfenis moet classificeren als opbouwen')
    },
  },

  // Test 2: kind met negatieve netto impact → 'investeren'
  {
    id: 'classify-kind-investeren',
    name: 'Kind (one_time_cost: -5000, monthly_cost: 500, 216m) → investeren',
    category: CAT,
    description: 'Kind met hoge maandelijkse kosten investeert vrijheid in bewuste levenskeuze',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'Kind',
        one_time_cost: -5000,
        monthly_cost_change: 500,
        duration_months: 216,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'investeren', 'Kind moet classificeren als investeren')

      // Verify net impact is negative: -5000 + (0 * 216) - (500 * 216) = -113000
      const impact = computeLifeEventNetImpact(event)
      assert(impact < 0, `Net impact moet negatief zijn, was ${impact}`)
    },
  },

  // Test 3: AOW met maandelijks inkomen → 'opbouwen'
  {
    id: 'classify-aow-opbouwen',
    name: 'AOW (monthly_income: 1380, 240m) → opbouwen',
    category: CAT,
    description: 'AOW met structureel maandinkomen bouwt vrijheid op',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'AOW',
        monthly_income_change: 1380,
        duration_months: 240,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'opbouwen', 'AOW moet classificeren als opbouwen')

      // Verify net impact: 0 + (1380 * 240) - (0 * 240) = 331200
      const impact = computeLifeEventNetImpact(event)
      assert(impact > 0, `Net impact moet positief zijn, was ${impact}`)
    },
  },

  // Test 4: sabbatical met kosten + inkomensverlies → 'investeren'
  {
    id: 'classify-sabbatical-investeren',
    name: 'Sabbatical (cost: -5000, income: -5500, 6m) → investeren',
    category: CAT,
    description: 'Sabbatical met kosten en inkomensverlies investeert vrijheid',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'Sabbatical',
        one_time_cost: -5000,
        monthly_income_change: -5500,
        duration_months: 6,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'investeren', 'Sabbatical moet classificeren als investeren')

      // Net impact: -5000 + (-5500 * 6) - (0 * 6) = -38000
      const impact = computeLifeEventNetImpact(event)
      assert(impact < 0, `Net impact moet negatief zijn, was ${impact}`)
    },
  },

  // Test 5: hypotheek afgelost met lagere maandlasten → 'opbouwen'
  {
    id: 'classify-hypotheek-afgelost-opbouwen',
    name: 'Hypotheek afgelost (monthly_cost: -1200, 360m) → opbouwen',
    category: CAT,
    description: 'Hypotheek aflossen verlaagt maandlasten, bouwt vrijheid op',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'Hypotheek afgelost',
        monthly_cost_change: -1200,
        duration_months: 360,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'opbouwen', 'Hypotheek afgelost moet classificeren als opbouwen')

      // Net impact: 0 + (0 * 360) - (-1200 * 360) = 432000
      const impact = computeLifeEventNetImpact(event)
      assert(impact > 0, `Net impact moet positief zijn (lagere kosten), was ${impact}`)
    },
  },

  // Test 6: neutraal event (alle bedragen 0) → 'investeren' (conservatief)
  {
    id: 'classify-neutraal-investeren',
    name: 'Neutraal event (alle bedragen 0) → investeren (conservatief)',
    category: CAT,
    description: 'Event met netto impact 0 classificeert conservatief als investeren',
    priority: 'high',
    estimatedDurationMs: 50,
    async fn() {
      const event = makeTestEvent({
        name: 'Neutraal event',
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: 0,
        duration_months: 12,
      })
      const result = classifyLifeEvent(event)
      assertEqual(result, 'investeren', 'Neutraal event moet conservatief als investeren classificeren')

      const impact = computeLifeEventNetImpact(event)
      assertEqual(impact, 0, 'Net impact moet exact 0 zijn')
    },
  },

  // Test 7: splitLifeEvents verdeelt correct in twee arrays
  {
    id: 'split-life-events-correct',
    name: 'splitLifeEvents verdeelt mix van events correct',
    category: CAT,
    description: 'Een mix van opbouwen- en investeren-events wordt correct gesplitst',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      const erfenis = makeTestEvent({ id: 'erfenis', name: 'Erfenis', one_time_cost: 50000 })
      const aow = makeTestEvent({ id: 'aow', name: 'AOW', monthly_income_change: 1380, duration_months: 240 })
      const kind = makeTestEvent({ id: 'kind', name: 'Kind', monthly_cost_change: 500, duration_months: 216 })
      const sabbatical = makeTestEvent({ id: 'sabbatical', name: 'Sabbatical', one_time_cost: -5000, monthly_income_change: -5500, duration_months: 6 })
      const neutraal = makeTestEvent({ id: 'neutraal', name: 'Neutraal', duration_months: 12 })

      const { opbouwen, investeren } = splitLifeEvents([erfenis, aow, kind, sabbatical, neutraal])

      assertEqual(opbouwen.length, 2, 'Twee opbouwen-events verwacht (erfenis + AOW)')
      assertEqual(investeren.length, 3, 'Drie investeren-events verwacht (kind + sabbatical + neutraal)')

      // Verify specific events are in correct arrays
      assert(opbouwen.some(e => e.id === 'erfenis'), 'Erfenis moet in opbouwen staan')
      assert(opbouwen.some(e => e.id === 'aow'), 'AOW moet in opbouwen staan')
      assert(investeren.some(e => e.id === 'kind'), 'Kind moet in investeren staan')
      assert(investeren.some(e => e.id === 'sabbatical'), 'Sabbatical moet in investeren staan')
      assert(investeren.some(e => e.id === 'neutraal'), 'Neutraal moet in investeren staan')
    },
  },

  // Test 8: computeLifeEventNetImpact retourneert correct netto bedrag
  {
    id: 'compute-net-impact-correct',
    name: 'computeLifeEventNetImpact berekent correct netto bedrag',
    category: CAT,
    description: 'Net impact = one_time_cost + (income * duration) - (cost * duration)',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      // Erfenis: 50000 + 0 - 0 = 50000
      const erfenis = makeTestEvent({ one_time_cost: 50000 })
      assertEqual(computeLifeEventNetImpact(erfenis), 50000, 'Erfenis net impact = 50000')

      // Kind: -5000 + (0 * 216) - (500 * 216) = -113000
      const kind = makeTestEvent({ one_time_cost: -5000, monthly_cost_change: 500, duration_months: 216 })
      assertEqual(computeLifeEventNetImpact(kind), -113000, 'Kind net impact = -113000')

      // AOW: 0 + (1380 * 240) - (0 * 240) = 331200
      const aow = makeTestEvent({ monthly_income_change: 1380, duration_months: 240 })
      assertEqual(computeLifeEventNetImpact(aow), 331200, 'AOW net impact = 331200')

      // Sabbatical: -5000 + (-5500 * 6) - (0 * 6) = -38000
      const sabbatical = makeTestEvent({ one_time_cost: -5000, monthly_income_change: -5500, duration_months: 6 })
      assertEqual(computeLifeEventNetImpact(sabbatical), -38000, 'Sabbatical net impact = -38000')

      // Hypotheek: 0 + (0 * 360) - (-1200 * 360) = 432000
      const hypotheek = makeTestEvent({ monthly_cost_change: -1200, duration_months: 360 })
      assertEqual(computeLifeEventNetImpact(hypotheek), 432000, 'Hypotheek net impact = 432000')

      // Mixed: 10000 + (500 * 12) - (200 * 12) = 13600
      const mixed = makeTestEvent({ one_time_cost: 10000, monthly_income_change: 500, monthly_cost_change: 200, duration_months: 12 })
      assertEqual(computeLifeEventNetImpact(mixed), 13600, 'Mixed event net impact = 13600')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Levensgebeurtenissen Classificatie',
    description: 'Regressietests voor classifyLifeEvent, splitLifeEvents en computeLifeEventNetImpact',
    testCount: tests.length,
  })
  registerTests(tests)
}
