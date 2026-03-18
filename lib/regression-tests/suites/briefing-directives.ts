import { registerTests, registerCategory } from '../test-registry'
import { assertEqual, assert, assertNotNull, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import {
  isDirectiveActive,
  getActiveDirectives,
  formatDirectivesForPrompt,
  getDefaultDirectives,
  getDefaultFunctionalDirectives,
  evaluateFunctionalDirective,
  formatFunctionalDirectivesForPrompt,
  resolveMetricLabels,
  extractMetricsFromSummary,
  DIRECTIVE_METRICS,
  type BriefingDirective,
  type FunctionalDirective,
} from '@/lib/briefing/directives'

const CAT = 'beheer-briefing'

// ── Fixtures ────────────────────────────────────────────────────

function makeTemporalDirective(overrides: Partial<BriefingDirective> = {}): BriefingDirective {
  return {
    id: 'test-temporal-1',
    title: 'Test directive',
    instruction: 'Doe iets bijzonders.',
    priority: 'normal',
    months: [],
    enabled: true,
    ...overrides,
  }
}

function makeFunctionalDirective(overrides: Partial<FunctionalDirective> = {}): FunctionalDirective {
  return {
    id: 'test-func-1',
    title: 'Test functioneel',
    metric: 'net_worth',
    condition: 'rising',
    instruction: 'Vier de vooruitgang.',
    priority: 'normal',
    enabled: true,
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ──────────────── GET: default directives ────────────────
  {
    id: 'bd-defaults-temporal',
    name: 'Default temporele directives structuur',
    category: CAT,
    description: 'getDefaultDirectives retourneert geldige directives met alle velden',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const defaults = getDefaultDirectives()
      assertGreaterThan(defaults.length, 0, 'minstens 1 default')
      for (const d of defaults) {
        assertNotNull(d.id, 'id')
        assertNotNull(d.title, 'title')
        assertNotNull(d.instruction, 'instruction')
        assert(['low', 'normal', 'high'].includes(d.priority), `priority is geldig: ${d.priority}`)
        assert(Array.isArray(d.months), 'months is array')
        assertEqual(d.enabled, true, 'defaults zijn enabled')
      }
    },
  },

  // ──────────────── Temporele directive: maanden multi-select ────────────────
  {
    id: 'bd-temporal-months-filter',
    name: 'Temporele directive: maanden filter',
    category: CAT,
    description: 'Directive met months=[3,4] is alleen actief in maart en april',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const d = makeTemporalDirective({ months: [3, 4] })
      assertEqual(isDirectiveActive(d, 3, 15), true, 'maart actief')
      assertEqual(isDirectiveActive(d, 4, 1), true, 'april actief')
      assertEqual(isDirectiveActive(d, 5, 15), false, 'mei inactief')
      assertEqual(isDirectiveActive(d, 12, 25), false, 'december inactief')
    },
  },
  {
    id: 'bd-temporal-all-months',
    name: 'Temporele directive: lege months = alle maanden',
    category: CAT,
    description: 'Directive met months=[] is actief in elke maand',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const d = makeTemporalDirective({ months: [] })
      for (let m = 1; m <= 12; m++) {
        assertEqual(isDirectiveActive(d, m, 15), true, `maand ${m} actief`)
      }
    },
  },

  // ──────────────── Temporele directive: dag ranges ────────────────
  {
    id: 'bd-temporal-day-range',
    name: 'Temporele directive: dag ranges',
    category: CAT,
    description: 'dayFrom/dayTo beperkt activatie tot dagbereik',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const d = makeTemporalDirective({ dayFrom: 20, dayTo: 31 })
      assertEqual(isDirectiveActive(d, 1, 19), false, 'dag 19 inactief')
      assertEqual(isDirectiveActive(d, 1, 20), true, 'dag 20 actief')
      assertEqual(isDirectiveActive(d, 1, 25), true, 'dag 25 actief')
      assertEqual(isDirectiveActive(d, 1, 31), true, 'dag 31 actief')
    },
  },
  {
    id: 'bd-temporal-day-from-only',
    name: 'Temporele directive: alleen dayFrom',
    category: CAT,
    description: 'Alleen dayFrom zonder dayTo: dag >= dayFrom',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const d = makeTemporalDirective({ dayFrom: 15 })
      assertEqual(isDirectiveActive(d, 6, 14), false, 'dag 14 inactief')
      assertEqual(isDirectiveActive(d, 6, 15), true, 'dag 15 actief')
      assertEqual(isDirectiveActive(d, 6, 31), true, 'dag 31 actief')
    },
  },

  // ──────────────── Prioriteit ────────────────
  {
    id: 'bd-temporal-priority',
    name: 'Temporele directive: prioriteitssortering',
    category: CAT,
    description: 'getActiveDirectives sorteert high → normal → low',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const directives: BriefingDirective[] = [
        makeTemporalDirective({ id: 'low', priority: 'low' }),
        makeTemporalDirective({ id: 'high', priority: 'high' }),
        makeTemporalDirective({ id: 'normal', priority: 'normal' }),
      ]
      const active = getActiveDirectives(directives, 6, 15)
      assertEqual(active.length, 3, '3 actieve directives')
      assertEqual(active[0].priority, 'high', 'eerste is high')
      assertEqual(active[1].priority, 'normal', 'tweede is normal')
      assertEqual(active[2].priority, 'low', 'derde is low')
    },
  },

  // ──────────────── Enabled/disabled toggle ────────────────
  {
    id: 'bd-temporal-disabled',
    name: 'Temporele directive: disabled wordt overgeslagen',
    category: CAT,
    description: 'Directive met enabled=false is nooit actief',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const d = makeTemporalDirective({ enabled: false, months: [] })
      assertEqual(isDirectiveActive(d, 6, 15), false, 'disabled directive is inactief')

      const active = getActiveDirectives([d], 6, 15)
      assertEqual(active.length, 0, 'disabled gefilterd uit actieve lijst')
    },
  },

  // ──────────────── Prompt preview: formatting ────────────────
  {
    id: 'bd-prompt-temporal-format',
    name: 'Prompt preview: temporele formatting',
    category: CAT,
    description: 'formatDirectivesForPrompt toont correct prefix per prioriteit',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const directives: BriefingDirective[] = [
        makeTemporalDirective({ priority: 'high', instruction: 'Hoog prioriteit instructie' }),
        makeTemporalDirective({ id: 't2', priority: 'normal', instruction: 'Normaal instructie' }),
        makeTemporalDirective({ id: 't3', priority: 'low', instruction: 'Laag instructie' }),
      ]
      const prompt = formatDirectivesForPrompt(directives)
      assert(prompt.includes('== REDACTIONELE RICHTLIJNEN =='), 'header aanwezig')
      assert(prompt.includes('[PRIORITEIT] Hoog prioriteit instructie'), 'high prefix')
      assert(prompt.includes('- Normaal instructie'), 'normal prefix')
      assert(prompt.includes('[optioneel] Laag instructie'), 'low prefix')
    },
  },
  {
    id: 'bd-prompt-empty',
    name: 'Prompt preview: lege lijst geeft lege string',
    category: CAT,
    description: 'formatDirectivesForPrompt met [] retourneert leeg',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(formatDirectivesForPrompt([]), '', 'lege prompt')
    },
  },

  // ──────────────── Functionele directive: metric selector ────────────────
  {
    id: 'bd-func-metrics-complete',
    name: 'Functionele directive: DIRECTIVE_METRICS compleet',
    category: CAT,
    description: 'Alle 10 metrics hebben id, label, en minstens 2 conditions',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(DIRECTIVE_METRICS.length, 10, '10 metrics')
      const expectedIds = [
        'net_worth', 'savings_rate', 'budget', 'debt', 'fire',
        'spending', 'emergency_fund', 'income', 'next_steps', 'discover',
      ]
      for (const id of expectedIds) {
        const metric = DIRECTIVE_METRICS.find((m) => m.id === id)
        assertNotNull(metric, `metric ${id} bestaat`)
        assertNotNull(metric.label, `metric ${id} heeft label`)
        assertGreaterThan(metric.conditions.length, 1, `metric ${id} heeft >=2 conditions`)
        for (const c of metric.conditions) {
          assertNotNull(c.id, `condition id voor ${id}`)
          assertNotNull(c.label, `condition label voor ${id}`)
        }
      }
    },
  },

  // ──────────────── Functionele directive: condition evaluation ────────────────
  {
    id: 'bd-func-evaluate-net-worth',
    name: 'Functionele directive: netto vermogen evaluatie',
    category: CAT,
    description: 'evaluateFunctionalDirective voor net_worth rising/declining/stagnant',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const rising = makeFunctionalDirective({ metric: 'net_worth', condition: 'rising' })
      const declining = makeFunctionalDirective({ metric: 'net_worth', condition: 'declining' })
      const stagnant = makeFunctionalDirective({ metric: 'net_worth', condition: 'stagnant' })

      // Rising: delta > 0 or growth >= 2
      assert(evaluateFunctionalDirective(rising, { netWorthDelta: 500 }), 'rising met positieve delta')
      assert(evaluateFunctionalDirective(rising, { consecutiveGrowthMonths: 3 }), 'rising met groeimaanden')
      assert(!evaluateFunctionalDirective(rising, { netWorthDelta: -200 }), 'niet rising bij negatieve delta')

      // Declining: delta < 0
      assert(evaluateFunctionalDirective(declining, { netWorthDelta: -500 }), 'declining bij negatieve delta')
      assert(!evaluateFunctionalDirective(declining, { netWorthDelta: 500 }), 'niet declining bij positieve')

      // Stagnant: abs(delta) < 100
      assert(evaluateFunctionalDirective(stagnant, { netWorthDelta: 50 }), 'stagnant bij kleine delta')
      assert(!evaluateFunctionalDirective(stagnant, { netWorthDelta: 500 }), 'niet stagnant bij grote delta')
    },
  },
  {
    id: 'bd-func-evaluate-budget',
    name: 'Functionele directive: budget evaluatie',
    category: CAT,
    description: 'evaluateFunctionalDirective voor budget on_track/over/warning',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const onTrack = makeFunctionalDirective({ metric: 'budget', condition: 'on_track' })
      const over = makeFunctionalDirective({ metric: 'budget', condition: 'over' })
      const warning = makeFunctionalDirective({ metric: 'budget', condition: 'warning' })

      assert(evaluateFunctionalDirective(onTrack, { budgetExpensePct: 60 }), 'on_track bij 60%')
      assert(!evaluateFunctionalDirective(onTrack, { budgetExpensePct: 80 }), 'niet on_track bij 80%')
      assert(evaluateFunctionalDirective(over, { budgetExpensePct: 110 }), 'over bij 110%')
      assert(evaluateFunctionalDirective(warning, { budgetExpensePct: 85 }), 'warning bij 85%')
      assert(!evaluateFunctionalDirective(warning, { budgetExpensePct: 60 }), 'niet warning bij 60%')
    },
  },
  {
    id: 'bd-func-evaluate-fire',
    name: 'Functionele directive: FIRE milestone evaluatie',
    category: CAT,
    description: 'evaluateFunctionalDirective voor FIRE on_track/behind/milestone_near',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const onTrack = makeFunctionalDirective({ metric: 'fire', condition: 'on_track' })
      const behind = makeFunctionalDirective({ metric: 'fire', condition: 'behind' })
      const near = makeFunctionalDirective({ metric: 'fire', condition: 'milestone_near' })

      assert(evaluateFunctionalDirective(onTrack, { freedomPct: 55 }), 'on_track bij 55%')
      assert(!evaluateFunctionalDirective(onTrack, { freedomPct: 30 }), 'niet on_track bij 30%')
      assert(evaluateFunctionalDirective(behind, { freedomPct: 20 }), 'behind bij 20%')
      // milestone_near: within 5% of 25% boundary
      assert(evaluateFunctionalDirective(near, { freedomPct: 72 }), 'milestone_near bij 72% (75-72=3)')
      assert(!evaluateFunctionalDirective(near, { freedomPct: 60 }), 'niet milestone_near bij 60%')
    },
  },

  // ──────────────── Functionele directive: defaults ────────────────
  {
    id: 'bd-func-defaults',
    name: 'Default functionele directives structuur',
    category: CAT,
    description: 'getDefaultFunctionalDirectives retourneert geldige directives',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const defaults = getDefaultFunctionalDirectives()
      assertGreaterThan(defaults.length, 0, 'minstens 1 default')
      const metricIds = DIRECTIVE_METRICS.map((m) => m.id)
      for (const d of defaults) {
        assertNotNull(d.id, 'id')
        assertNotNull(d.title, 'title')
        assertNotNull(d.instruction, 'instruction')
        assert(['low', 'normal', 'high'].includes(d.priority), `priority geldig: ${d.priority}`)
        assert(metricIds.includes(d.metric), `metric ${d.metric} bestaat in DIRECTIVE_METRICS`)
        const metric = DIRECTIVE_METRICS.find((m) => m.id === d.metric)!
        const conditionIds = metric.conditions.map((c) => c.id)
        assert(conditionIds.includes(d.condition), `condition ${d.condition} geldig voor metric ${d.metric}`)
        assertEqual(d.enabled, true, 'defaults zijn enabled')
      }
    },
  },

  // ──────────────── Resolve metric labels ────────────────
  {
    id: 'bd-resolve-labels',
    name: 'resolveMetricLabels retourneert Nederlandse labels',
    category: CAT,
    description: 'Metric en condition IDs worden omgezet naar labels',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const { metric, condition } = resolveMetricLabels('net_worth', 'rising')
      assertEqual(metric, 'Netto vermogen', 'metric label')
      assertEqual(condition, 'Stijgend', 'condition label')

      // Onbekende IDs geven fallback
      const unknown = resolveMetricLabels('nonexistent', 'unknown')
      assertEqual(unknown.metric, 'nonexistent', 'fallback metric')
      assertEqual(unknown.condition, 'unknown', 'fallback condition')
    },
  },

  // ──────────────── Prompt preview: functionele formatting ────────────────
  {
    id: 'bd-prompt-func-format',
    name: 'Prompt preview: functionele directives formatting',
    category: CAT,
    description: 'formatFunctionalDirectivesForPrompt met en zonder data',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const directives: FunctionalDirective[] = [
        makeFunctionalDirective({ priority: 'high', metric: 'budget', condition: 'over', instruction: 'Budget alert' }),
        makeFunctionalDirective({ id: 'f2', priority: 'normal', instruction: 'Normaal advies' }),
      ]

      // Without data summary — no ACTIEF/INACTIEF tags
      const withoutData = formatFunctionalDirectivesForPrompt(directives)
      assert(withoutData.includes('== FUNCTIONELE RICHTLIJNEN =='), 'header')
      assert(withoutData.includes('[PRIORITEIT]'), 'high priority prefix')
      assert(!withoutData.includes('[ACTIEF]'), 'geen actief tag zonder data')

      // With data summary — includes ACTIEF/INACTIEF tags
      const dataSummary = 'Uitgaven: € 1.200 van € 1.000 (120%)'
      const withData = formatFunctionalDirectivesForPrompt(directives, dataSummary)
      assert(withData.includes('[ACTIEF]') || withData.includes('[INACTIEF]'), 'evaluatie tags aanwezig')
    },
  },
  {
    id: 'bd-prompt-func-disabled-excluded',
    name: 'Prompt preview: disabled directives uitgesloten',
    category: CAT,
    description: 'Disabled functionele directives verschijnen niet in prompt',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const directives: FunctionalDirective[] = [
        makeFunctionalDirective({ enabled: false, instruction: 'Verborgen instructie' }),
      ]
      const prompt = formatFunctionalDirectivesForPrompt(directives)
      assertEqual(prompt, '', 'disabled geeft lege prompt')
    },
  },

  // ──────────────── extractMetricsFromSummary ────────────────
  {
    id: 'bd-extract-metrics',
    name: 'extractMetricsFromSummary: parst data summary',
    category: CAT,
    description: 'Extracteert financiële metrics uit data summary tekst',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const summary = [
        'Vermogensdelta (MoM): +€ 1.200',
        'Opeenvolgende maanden groei: 3',
        'Spaarquote: 25%',
        'Spaarquote trend: stijgend',
        'Uitgaven: € 1.800 van € 2.000 (90%)',
        'Maandinkomen: € 4.500',
        'VOLGENDE STAPPEN: 2 kern, 1 wil, 0 horizon',
        'ONTDEKBARE FEATURES: 3 van 10 onontdekt',
      ].join('\n')

      const m = extractMetricsFromSummary(summary)
      assertEqual(m.netWorthDelta, 1200, 'netWorthDelta')
      assertEqual(m.consecutiveGrowthMonths, 3, 'groeimaanden')
      assertEqual(m.savingsRate, 25, 'spaarquote')
      assertEqual(m.savingsRateTrend, 'stijgend', 'spaarquote trend')
      assertEqual(m.budgetExpensePct, 90, 'budget pct')
      assertEqual(m.monthlyIncome, 4500, 'maandinkomen')
      assertEqual(m.nextStepsTotal, 3, 'volgende stappen totaal')
      assertEqual(m.unvisitedFeatures, 3, 'onontdekte features')
    },
  },
]

// ── Registration ────────────────────────────────────────────────

registerCategory({
  id: CAT,
  label: 'Beheer — Briefing',
  description: 'Briefing directives: temporele en functionele CRUD, prompt preview',
  icon: 'FileEdit',
  testCount: 0,
})

export function register(): void {
  registerTests(tests)
}
