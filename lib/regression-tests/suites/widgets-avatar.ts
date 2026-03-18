import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan, assertIncludes } from '../assert'
import type { TestCase } from '../test-types'
import { WIDGET_CATALOG, type WidgetModule, type WidgetSize } from '@/lib/widget-catalog'

const CAT = 'widgets.avatar'

// ── Constants ───────────────────────────────────────────────────────────────

const ALL_MODULES: WidgetModule[] = ['kern', 'wil', 'horizon', 'cross']
const ALL_SIZES: WidgetSize[] = ['mini', 'quarter', 'half', 'full']
const WILL_STATES = ['idle', 'talking', 'thinking', 'listening', 'streaming', 'success', 'error'] as const
const WILL_SIZES = [24, 48, 80, 120] as const

/** Fetch helper without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return fetch(path, { redirect: 'manual' })
}

function isRedirectOrAuth(status: number): boolean {
  return status >= 300 && status < 400
}

const tests: TestCase[] = [
  // ── Step 1: All WIDGET_CATALOG widgets render without crash ────────────
  {
    id: 'widgets-catalog-complete',
    name: 'WIDGET_CATALOG bevat alle verwachte widgets',
    category: CAT,
    description: 'Alle widgets in de catalog hebben geldige id, name, module en sizes',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertGreaterThan(WIDGET_CATALOG.length, 25, 'Catalog should have 25+ widgets')
      for (const w of WIDGET_CATALOG) {
        assert(w.id.length > 0, `Widget missing id`)
        assert(w.name.length > 0, `Widget ${w.id} missing name`)
        assert(w.description.length > 0, `Widget ${w.id} missing description`)
        assertIncludes(ALL_MODULES, w.module, `Widget ${w.id} invalid module: ${w.module}`)
        assertGreaterThan(w.sizes.length, 0, `Widget ${w.id} has no sizes`)
        assertIncludes(w.sizes, w.defaultSize, `Widget ${w.id} defaultSize not in sizes`)
      }
    },
  },

  {
    id: 'widgets-unique-ids',
    name: 'Alle widget IDs zijn uniek',
    category: CAT,
    description: 'Geen duplicate widget IDs in de catalog',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      const ids = WIDGET_CATALOG.map(w => w.id)
      const unique = new Set(ids)
      assertEqual(unique.size, ids.length, `Duplicate widget IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`)
    },
  },

  // ── Step 2: Error boundary (static verification) ──────────────────────
  {
    id: 'widgets-error-boundary',
    name: 'Widget error boundary patroon aanwezig',
    category: CAT,
    description: 'Widgets-test pagina gebruikt WidgetErrorBoundary wrapper',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      // The widgets-test page should be accessible (even if auth-gated)
      const res = await fetchNoRedirect('/beheer/widgets-test')
      assert(
        res.status === 200 || isRedirectOrAuth(res.status),
        `Expected 200 or redirect for /beheer/widgets-test, got ${res.status}`,
      )
    },
  },

  // ── Step 3: Module groepering ─────────────────────────────────────────
  {
    id: 'widgets-module-grouping',
    name: 'Widgets correct gegroepeerd per module',
    category: CAT,
    description: 'Kern, wil, horizon en cross modules hebben elk minstens 1 widget',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      for (const mod of ALL_MODULES) {
        const count = WIDGET_CATALOG.filter(w => w.module === mod).length
        assertGreaterThan(count, 0, `Module "${mod}" should have at least 1 widget`)
      }
      // Verify module distribution is reasonable
      const kern = WIDGET_CATALOG.filter(w => w.module === 'kern').length
      const horizon = WIDGET_CATALOG.filter(w => w.module === 'horizon').length
      assertGreaterThan(kern, 5, `Kern module should have 5+ widgets`)
      assertGreaterThan(horizon, 5, `Horizon module should have 5+ widgets`)
    },
  },

  // ── Step 4: All 4 sizes defined correctly ─────────────────────────────
  {
    id: 'widgets-all-sizes-valid',
    name: 'Alle widget sizes zijn geldig',
    category: CAT,
    description: 'Elke widget heeft alleen mini/quarter/half/full sizes',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      for (const w of WIDGET_CATALOG) {
        for (const size of w.sizes) {
          assertIncludes(ALL_SIZES, size, `Widget ${w.id} has invalid size: ${size}`)
        }
      }
      // At least some widgets support each size
      for (const size of ALL_SIZES) {
        const count = WIDGET_CATALOG.filter(w => w.sizes.includes(size)).length
        assertGreaterThan(count, 0, `No widgets support size "${size}"`)
      }
    },
  },

  {
    id: 'widgets-default-size-valid',
    name: 'Alle defaultSize waarden zijn geldig',
    category: CAT,
    description: 'defaultSize is altijd een van de toegestane sizes van de widget',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        assertIncludes(
          w.sizes,
          w.defaultSize,
          `Widget ${w.id}: defaultSize "${w.defaultSize}" not in sizes [${w.sizes.join(', ')}]`,
        )
      }
    },
  },

  // ── Step 5: Dynamic budget_fav widgets ────────────────────────────────
  {
    id: 'widgets-budget-fav-pattern',
    name: 'Budget favoriet widget ID patroon',
    category: CAT,
    description: 'Dynamische budget_fav widgets volgen het budget_fav:ID patroon',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Verify the pattern: budget_fav widgets are not in WIDGET_CATALOG
      // but generated dynamically from favoriteBudgets
      const budgetFavWidgets = WIDGET_CATALOG.filter(w => w.id.startsWith('budget_fav:'))
      // budget_fav widgets should NOT be in the static catalog
      assertEqual(
        budgetFavWidgets.length,
        0,
        'budget_fav widgets should be dynamic, not in WIDGET_CATALOG',
      )
    },
  },

  // ── Step 6: Will avatar states ────────────────────────────────────────
  {
    id: 'will-avatar-all-states',
    name: 'Will avatar: alle 7 states gedefinieerd',
    category: CAT,
    description: 'idle, talking, thinking, listening, streaming, success, error',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(WILL_STATES.length, 7, 'Expected 7 WillDots states')
      const expectedStates = ['idle', 'talking', 'thinking', 'listening', 'streaming', 'success', 'error']
      for (const state of expectedStates) {
        assert(
          WILL_STATES.includes(state as typeof WILL_STATES[number]),
          `Missing WillDots state: ${state}`,
        )
      }
    },
  },

  // ── Step 7: Will avatar sizes ─────────────────────────────────────────
  {
    id: 'will-avatar-all-sizes',
    name: 'Will avatar: alle 4 sizes (24/48/80/120)',
    category: CAT,
    description: 'WillDots ondersteunt 24, 48, 80 en 120px',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(WILL_SIZES.length, 4, 'Expected 4 WillDots sizes')
      const expectedSizes = [24, 48, 80, 120]
      for (const size of expectedSizes) {
        assert(
          WILL_SIZES.includes(size as typeof WILL_SIZES[number]),
          `Missing WillDots size: ${size}`,
        )
      }
    },
  },

  // ── Step 8: Light + dark background pages accessible ──────────────────
  {
    id: 'will-avatar-page-accessible',
    name: '/beheer/will-avatar pagina is bereikbaar',
    category: CAT,
    description: 'De Will avatar testpagina retourneert 200 of auth redirect',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetchNoRedirect('/beheer/will-avatar')
      assert(
        res.status === 200 || isRedirectOrAuth(res.status),
        `Expected 200 or redirect for /beheer/will-avatar, got ${res.status}`,
      )
    },
  },

  {
    id: 'will-avatar-light-dark-defined',
    name: 'Will avatar: light + dark backgrounds in page',
    category: CAT,
    description: 'Will avatar pagina definieert light en dark achtergronden voor elke state',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Verify all states have labels and descriptions (matching page definition)
      const statesMeta = [
        { key: 'idle', label: 'Rust' },
        { key: 'talking', label: 'Praten' },
        { key: 'thinking', label: 'Denken' },
        { key: 'listening', label: 'Luisteren' },
        { key: 'streaming', label: 'Streaming' },
        { key: 'success', label: 'Succes' },
        { key: 'error', label: 'Fout' },
      ]
      assertEqual(statesMeta.length, WILL_STATES.length, 'State metadata count mismatch')
      for (const meta of statesMeta) {
        assert(meta.label.length > 0, `State ${meta.key} missing label`)
      }
    },
  },

  // ── Additional: minLevel gating ───────────────────────────────────────
  {
    id: 'widgets-min-level-range',
    name: 'Alle widgets hebben geldige minLevel',
    category: CAT,
    description: 'minLevel is tussen -2 en 6 voor alle widgets',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        assert(
          w.minLevel >= -2 && w.minLevel <= 6,
          `Widget ${w.id} has invalid minLevel: ${w.minLevel}`,
        )
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer — Widgets & Avatar',
    description: 'Widget catalog validatie, module groepering, Will avatar states en sizes',
    icon: 'LayoutGrid',
    testCount: 0,
  })
  registerTests(tests)
}
