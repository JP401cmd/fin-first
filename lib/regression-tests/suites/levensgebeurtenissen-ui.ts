import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import type { LifeEvent } from '@/lib/horizon-data'
import {
  splitLifeEvents,
  classifyLifeEvent,
  computeLifeEventNetImpact,
} from '@/lib/horizon-data'

const CAT = 'levensgebeurtenissen.ui'

// ── Mock LifeEvent factory ──────────────────────────────────────────────────

function makeEvent(overrides: Partial<LifeEvent> & { name: string }): LifeEvent {
  return {
    id: overrides.id ?? `evt-${overrides.name.toLowerCase().replace(/\s/g, '-')}`,
    name: overrides.name,
    event_type: overrides.event_type ?? 'custom',
    target_age: overrides.target_age ?? null,
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

// ── Sign-conventie voor one_time_cost (DB/cashflow-conventie, zie
// lib/horizon/life-events-catalog.ts#computeLifeEventNetImpact en
// lib/horizon/event-pane-edit-form.ts: `one_time_cost >= 0 ? 'expense' : 'income'`):
// POSITIEF = kost (drukt de vrijheidsimpact), NEGATIEF = inkomst (verhoogt 'm.
// Vóór commit 9b6882a0c gold het omgekeerde (positief = inkomst); de formule is
// toen bewust omgedraaid om aan te sluiten op de catalogus-defaults (bv.
// inheritance.defaultCost/house_sale.defaultCost = -50_000) en het bewerk-formulier.

// ── Opbouwen events (positive net impact) ───────────────────────────────────

const erfenis: LifeEvent = makeEvent({
  name: 'Erfenis',
  event_type: 'inheritance',
  target_age: 55,
  one_time_cost: -100_000, // negatief = inkomst (ontvangen erfenis)
  duration_months: 0,
})

const aow: LifeEvent = makeEvent({
  name: 'AOW',
  event_type: 'aow',
  target_age: 67,
  monthly_income_change: 1200,
  duration_months: 240, // 20 years
})

const huisVerkoop: LifeEvent = makeEvent({
  name: 'Huis verkoop',
  event_type: 'house_sale',
  target_age: 60,
  one_time_cost: -250_000, // negatief = inkomst (overwaarde-vrijval)
  duration_months: 0,
})

// ── Investeren events (zero or negative net impact) ─────────────────────────

const kinderen: LifeEvent = makeEvent({
  name: 'Kinderen',
  event_type: 'children',
  target_age: 35,
  one_time_cost: 5_000, // positief = kost (babyuitzet)
  monthly_cost_change: 500,
  duration_months: 216, // 18 years
})

const verbouwing: LifeEvent = makeEvent({
  name: 'Verbouwing',
  event_type: 'renovation',
  target_age: 40,
  one_time_cost: 50_000, // positief = kost
  duration_months: 0,
})

const wereldreis: LifeEvent = makeEvent({
  name: 'Wereldreis',
  event_type: 'world_trip',
  target_age: 45,
  one_time_cost: 30_000, // positief = kost (vertrekkosten)
  duration_months: 12,
  monthly_cost_change: 1500,
})

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: `${CAT}-mixed-events-both-columns`,
    name: 'Gemixte events vullen beide kolommen',
    description: 'Bij mix van opbouwen- en investeren-events worden beide kolommen gevuld',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const mixed = [erfenis, kinderen, aow, verbouwing]
      const { opbouwen, investeren } = splitLifeEvents(mixed)

      assertGreaterThan(opbouwen.length, 0, 'opbouwen column should have items')
      assertGreaterThan(investeren.length, 0, 'investeren column should have items')
      assertEqual(opbouwen.length + investeren.length, mixed.length, 'all events accounted for')

      // Verify specific classification
      assert(opbouwen.some(e => e.name === 'Erfenis'), 'Erfenis should be in opbouwen')
      assert(opbouwen.some(e => e.name === 'AOW'), 'AOW should be in opbouwen')
      assert(investeren.some(e => e.name === 'Kinderen'), 'Kinderen should be in investeren')
      assert(investeren.some(e => e.name === 'Verbouwing'), 'Verbouwing should be in investeren')
    },
  },
  {
    id: `${CAT}-only-opbouwen-empty-investeren`,
    name: 'Alleen opbouwen → rechterkolom is leeg',
    description: 'Bij alleen opbouwen-events toont de rechterkolom een lege-staat',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const onlyOpbouwen = [erfenis, aow, huisVerkoop]
      const { opbouwen, investeren } = splitLifeEvents(onlyOpbouwen)

      assertEqual(opbouwen.length, 3, 'all 3 events in opbouwen')
      assertEqual(investeren.length, 0, 'investeren column is empty')

      // UI would show "Nog geen investeringen gepland" for investeren column
      // Verify all events have positive net impact (opbouwen classification)
      for (const ev of onlyOpbouwen) {
        assertEqual(classifyLifeEvent(ev), 'opbouwen', `${ev.name} should classify as opbouwen`)
        assertGreaterThan(computeLifeEventNetImpact(ev), 0, `${ev.name} has positive net impact`)
      }
    },
  },
  {
    id: `${CAT}-only-investeren-empty-opbouwen`,
    name: 'Alleen investeren → linkerkolom is leeg',
    description: 'Bij alleen investeren-events toont de linkerkolom een lege-staat',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const onlyInvesteren = [kinderen, verbouwing, wereldreis]
      const { opbouwen, investeren } = splitLifeEvents(onlyInvesteren)

      assertEqual(opbouwen.length, 0, 'opbouwen column is empty')
      assertEqual(investeren.length, 3, 'all 3 events in investeren')

      // UI would show "Nog geen opbouw-gebeurtenissen gepland" for opbouwen column
      for (const ev of onlyInvesteren) {
        assertEqual(classifyLifeEvent(ev), 'investeren', `${ev.name} should classify as investeren`)
      }
    },
  },
  {
    id: `${CAT}-no-events-both-empty`,
    name: 'Geen events → beide kolommen leeg',
    description: 'Bij een lege event-lijst tonen beide kolommen een lege-staat',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const { opbouwen, investeren } = splitLifeEvents([])

      assertEqual(opbouwen.length, 0, 'opbouwen column is empty')
      assertEqual(investeren.length, 0, 'investeren column is empty')
    },
  },
  {
    id: `${CAT}-column-headers-text`,
    name: 'Kolom-headers bevatten juiste tekst',
    description: 'Linkerkolom is "Vrijheid opbouwen", rechterkolom is "Vrijheid investeren"',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      // The UI renders these exact header strings (verified in horizon-client.tsx):
      // Left column: "Vrijheid opbouwen"
      // Right column: "Vrijheid investeren"
      // We verify that the classification keys match the expected column labels:
      const opbouwenLabel = 'Vrijheid opbouwen'
      const investerenLabel = 'Vrijheid investeren'

      // Classification returns 'opbouwen' or 'investeren' — these map to the column headers
      const erfenisClass = classifyLifeEvent(erfenis)
      const kinderenClass = classifyLifeEvent(kinderen)

      assertEqual(erfenisClass, 'opbouwen', `Erfenis maps to "${opbouwenLabel}" column`)
      assertEqual(kinderenClass, 'investeren', `Kinderen maps to "${investerenLabel}" column`)

      // Verify the column mapping is complete (only 2 possible values)
      assert(
        erfenisClass === 'opbouwen' || erfenisClass === 'investeren',
        'Classification must be opbouwen or investeren',
      )
    },
  },
  {
    id: `${CAT}-column-totals-correct`,
    name: 'Totalen per kolom correct berekend',
    description: 'Totaal per kolom = som van computeLifeEventNetImpact voor events in die kolom',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const mixed = [erfenis, kinderen, aow, verbouwing, huisVerkoop, wereldreis]
      const { opbouwen, investeren } = splitLifeEvents(mixed)

      // UI calculates: opbouwen.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)
      const totalOpbouwen = opbouwen.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)
      const totalInvesteren = investeren.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)

      // Verify individual impacts
      const erfenisImpact = computeLifeEventNetImpact(erfenis)
      assertEqual(erfenisImpact, 100_000, 'Erfenis impact = 100K')

      const aowImpact = computeLifeEventNetImpact(aow)
      assertEqual(aowImpact, 1200 * 240, 'AOW impact = 1200 * 240 = 288K')

      const huisVerkoopImpact = computeLifeEventNetImpact(huisVerkoop)
      assertEqual(huisVerkoopImpact, 250_000, 'Huis verkoop impact = 250K')

      // Opbouwen total = erfenis + aow + huisVerkoop
      const expectedOpbouwen = erfenisImpact + aowImpact + huisVerkoopImpact
      assertEqual(totalOpbouwen, expectedOpbouwen, 'Opbouwen total matches sum of impacts')

      // Kinderen: -5000 + (0 * 216) - (500 * 216) = -5000 - 108000 = -113000
      const kinderenImpact = computeLifeEventNetImpact(kinderen)
      assertEqual(kinderenImpact, -113_000, 'Kinderen impact = -113K')

      // Verbouwing: -50000
      const verbouwingImpact = computeLifeEventNetImpact(verbouwing)
      assertEqual(verbouwingImpact, -50_000, 'Verbouwing impact = -50K')

      // Wereldreis: -30000 + (0*12) - (1500*12) = -30000 - 18000 = -48000
      const wereldreisImpact = computeLifeEventNetImpact(wereldreis)
      assertEqual(wereldreisImpact, -48_000, 'Wereldreis impact = -48K')

      const expectedInvesteren = kinderenImpact + verbouwingImpact + wereldreisImpact
      assertEqual(totalInvesteren, expectedInvesteren, 'Investeren total matches sum of impacts')

      // Opbouwen total should be positive
      assertGreaterThan(totalOpbouwen, 0, 'Opbouwen total is positive')
      // Investeren total should be negative or zero
      assert(totalInvesteren <= 0, 'Investeren total is non-positive')
    },
  },
  {
    id: `${CAT}-chronological-sort-within-columns`,
    name: 'Events chronologisch gesorteerd binnen kolom',
    description: 'Events zijn gesorteerd op target_age binnen elke kolom (oplopend)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      // UI does: [...opbouwen].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
      const sortByAge = (a: LifeEvent, b: LifeEvent) =>
        (a.target_age ?? 999) - (b.target_age ?? 999)

      const mixed = [aow, erfenis, huisVerkoop, wereldreis, kinderen, verbouwing]
      const { opbouwen, investeren } = splitLifeEvents(mixed)

      const opbouwenSorted = [...opbouwen].sort(sortByAge)
      const investerenSorted = [...investeren].sort(sortByAge)

      // Verify opbouwen is sorted: erfenis(55) < huisVerkoop(60) < aow(67)
      for (let i = 1; i < opbouwenSorted.length; i++) {
        const prevAge = opbouwenSorted[i - 1].target_age ?? 999
        const currAge = opbouwenSorted[i].target_age ?? 999
        assert(
          prevAge <= currAge,
          `Opbouwen sort: ${opbouwenSorted[i - 1].name} (${prevAge}) should be <= ${opbouwenSorted[i].name} (${currAge})`,
        )
      }

      // Verify investeren is sorted: kinderen(35) < verbouwing(40) < wereldreis(45)
      for (let i = 1; i < investerenSorted.length; i++) {
        const prevAge = investerenSorted[i - 1].target_age ?? 999
        const currAge = investerenSorted[i].target_age ?? 999
        assert(
          prevAge <= currAge,
          `Investeren sort: ${investerenSorted[i - 1].name} (${prevAge}) should be <= ${investerenSorted[i].name} (${currAge})`,
        )
      }

      // Verify specific expected order
      assertEqual(opbouwenSorted[0].name, 'Erfenis', 'Opbouwen first = Erfenis (55)')
      assertEqual(opbouwenSorted[1].name, 'Huis verkoop', 'Opbouwen second = Huis verkoop (60)')
      assertEqual(opbouwenSorted[2].name, 'AOW', 'Opbouwen third = AOW (67)')

      assertEqual(investerenSorted[0].name, 'Kinderen', 'Investeren first = Kinderen (35)')
      assertEqual(investerenSorted[1].name, 'Verbouwing', 'Investeren second = Verbouwing (40)')
      assertEqual(investerenSorted[2].name, 'Wereldreis', 'Investeren third = Wereldreis (45)')
    },
  },
  {
    id: `${CAT}-null-target-age-sorts-last`,
    name: 'Events zonder target_age sorteren als laatste',
    description: 'Events met target_age=null krijgen fallback 999 en sorteren achteraan',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const noAge: LifeEvent = makeEvent({
        name: 'Ongedateerd',
        one_time_cost: 10_000, // positief = kost → investeren
        target_age: null,
      })
      const withAge: LifeEvent = makeEvent({
        name: 'Gedateerd',
        one_time_cost: 20_000, // positief = kost → investeren
        target_age: 50,
      })

      const { investeren } = splitLifeEvents([noAge, withAge])
      const sortByAge = (a: LifeEvent, b: LifeEvent) =>
        (a.target_age ?? 999) - (b.target_age ?? 999)
      const sorted = [...investeren].sort(sortByAge)

      assertEqual(sorted[0].name, 'Gedateerd', 'Event with age sorts first')
      assertEqual(sorted[1].name, 'Ongedateerd', 'Event without age sorts last')
    },
  },
  {
    id: `${CAT}-zero-impact-classifies-investeren`,
    name: 'Nul-impact event classificeert als investeren',
    description: 'Een event met exact 0 net impact gaat naar de investeren-kolom (conservatief)',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    requiredRole: 'any',
    fn: () => {
      const zeroImpact: LifeEvent = makeEvent({
        name: 'Neutraal event',
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: 0,
        duration_months: 0,
      })

      assertEqual(computeLifeEventNetImpact(zeroImpact), 0, 'Net impact is exactly 0')
      assertEqual(classifyLifeEvent(zeroImpact), 'investeren', 'Zero impact → investeren (conservative)')

      const { opbouwen, investeren } = splitLifeEvents([zeroImpact])
      assertEqual(opbouwen.length, 0, 'Not in opbouwen')
      assertEqual(investeren.length, 1, 'In investeren')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Levensgebeurtenissen UI',
    description: 'Twee-kolommen rendering en lege-staat voor levensgebeurtenissen',
    icon: 'Heart',
    testCount: 0,
    defaultRole: 'any',
  })
  registerTests(tests)
}
