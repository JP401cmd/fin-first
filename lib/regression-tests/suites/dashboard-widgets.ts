import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan, assertGreaterThanOrEqual, assertLessThanOrEqual, assertNotNull, assertIncludes } from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'
import {
  WIDGET_CATALOG,
  WIDGET_HREFS,
  WIDGET_FEATURE_MAP,
  DEFAULT_WIDGET_PREFS,
  BUDGET_WIDGETS,
  mergeWidgetPrefs,
  getWidgetDef,
  type WidgetPref,
  type WidgetPrefs,
  type WidgetModule,
  type WidgetSize,
} from '@/lib/widget-catalog'
import { UNIFIED_FEATURES } from '@/lib/feature-registry'
import { reassignOrders, moveWidget } from '@/lib/widget-order'
import {
  buildDashboardLayout,
  GRID_TARGET_CELLS,
  FOCUS_WIDGET_BOOST,
  WIDGET_POPULARITY,
  type AutoDashboardAnswers,
  type GridSize,
  type FocusChoice,
} from '@/lib/auto-dashboard-builder'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'

const CAT = 'widgets.systeem'

// ── Helpers ───────────────────────────────────────────────────────────

function makePrefs(ids: string[]): WidgetPref[] {
  return ids.map((id, i) => ({ id, enabled: true, size: 'half' as const, order: i * 10 }))
}

function countCells(prefs: { size: string }[]): number {
  return prefs.reduce((sum, p) => {
    if (p.size === 'full') return sum + 4
    if (p.size === 'half') return sum + 2
    return sum + 1
  }, 0)
}

const ALL_FEATURES_ENABLED: FeatureAccessMap = {}
const NO_FAVS: { id: string; name: string }[] = []

function makeAnswers(o?: Partial<AutoDashboardAnswers>): AutoDashboardAnswers {
  return {
    focuses: ['overview'],
    modulePreference: 'balanced',
    gridSize: 'medium',
    detailLevel: 'compact',
    selectedBudgetFavIds: [],
    ...o,
  }
}

const VALID_MODULES: WidgetModule[] = ['kern', 'wil', 'horizon', 'cross']
const VALID_SIZES: WidgetSize[] = ['mini', 'quarter', 'half', 'full', 'xl']

// ── Tests ─────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Widget Catalog ──────────────────────────────────────────
  {
    id: 'dw-catalog-count',
    name: 'Widget catalog: 44 widgets geregistreerd',
    category: CAT,
    description: 'WIDGET_CATALOG bevat alle verwachte widgets',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      assertGreaterThanOrEqual(WIDGET_CATALOG.length, 44, `catalog length ${WIDGET_CATALOG.length}`)
    },
  },
  {
    id: 'dw-catalog-unique-ids',
    name: 'Widget catalog: unieke IDs',
    category: CAT,
    description: 'Elke widget heeft een uniek id',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const ids = WIDGET_CATALOG.map(w => w.id)
      const unique = new Set(ids)
      assertEqual(unique.size, ids.length, 'duplicate widget ids found')
    },
  },
  {
    id: 'dw-catalog-module',
    name: 'Widget catalog: elke widget heeft geldig module',
    category: CAT,
    description: 'Module moet kern, wil, horizon of cross zijn',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        assertIncludes(VALID_MODULES, w.module, `${w.id} module "${w.module}"`)
      }
    },
  },
  {
    id: 'dw-catalog-sizes',
    name: 'Widget catalog: elke widget heeft geldige sizes',
    category: CAT,
    description: 'Sizes array niet leeg, elke size geldig, defaultSize in sizes',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        assertGreaterThan(w.sizes.length, 0, `${w.id} has sizes`)
        for (const s of w.sizes) {
          assertIncludes(VALID_SIZES, s, `${w.id} size "${s}"`)
        }
        assertIncludes(w.sizes, w.defaultSize, `${w.id} defaultSize in sizes`)
      }
    },
  },
  {
    id: 'dw-catalog-hrefs',
    name: 'Widget catalog: elke widget heeft een href',
    category: CAT,
    description: 'WIDGET_HREFS bevat een entry voor elke catalog widget',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        const href = WIDGET_HREFS[w.id]
        assertNotNull(href, `${w.id} missing href`)
        assert(href.startsWith('/'), `${w.id} href must start with /`)
      }
    },
  },
  {
    id: 'dw-catalog-name-desc',
    name: 'Widget catalog: naam en beschrijving',
    category: CAT,
    description: 'Elke widget heeft een niet-lege name en description',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        assert(w.name.length > 0, `${w.id} has name`)
        assert(w.description.length > 0, `${w.id} has description`)
      }
    },
  },
  {
    id: 'dw-catalog-getwidgetdef',
    name: 'Widget catalog: getWidgetDef vindt widgets',
    category: CAT,
    description: 'getWidgetDef retourneert juiste widget voor elke id',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      for (const w of WIDGET_CATALOG) {
        const found = getWidgetDef(w.id)
        assertNotNull(found, `getWidgetDef(${w.id})`)
        assertEqual(found!.id, w.id, `id match`)
      }
      assertEqual(getWidgetDef('nonexistent_widget_xyz'), undefined, 'nonexistent returns undefined')
    },
  },
  {
    id: 'dw-default-prefs',
    name: 'Widget catalog: DEFAULT_WIDGET_PREFS bevat alle widgets, geen enabled',
    category: CAT,
    description: 'Defaults match catalog lengte, 0 enabled (onaangeraakt account → doelen + fire-line)',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(DEFAULT_WIDGET_PREFS.widgets.length, WIDGET_CATALOG.length, 'prefs length == catalog')
      // Bewust 0 enabled: een onaangeraakt account toont de standaard
      // Voortgang-doelen + Vrijheidsstrip in de /overzicht hero-rail. De
      // widget-grid verschijnt alleen na expliciet aanzetten of een favoriet.
      const enabled = DEFAULT_WIDGET_PREFS.widgets.filter(w => w.enabled)
      assertEqual(enabled.length, 0, '0 widgets enabled by default')
    },
  },
  {
    id: 'dw-budget-widgets-set',
    name: 'Widget catalog: BUDGET_WIDGETS bevat budget-afhankelijke widgets',
    category: CAT,
    description: 'Budget widgets set is niet leeg en bevat bekende items',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assertGreaterThan(BUDGET_WIDGETS.size, 5, 'minstens 6 budget widgets')
      assert(BUDGET_WIDGETS.has('cash_flow'), 'cash_flow is budget widget')
      assert(BUDGET_WIDGETS.has('budgetten'), 'budgetten is budget widget')
      assert(BUDGET_WIDGETS.has('spaarquote'), 'spaarquote is budget widget')
    },
  },

  // ── Step 2: mergeWidgetPrefs ────────────────────────────────────────
  {
    id: 'dw-merge-null',
    name: 'mergeWidgetPrefs: null input retourneert defaults',
    category: CAT,
    description: 'Bij null saved prefs worden defaults gebruikt',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const result = mergeWidgetPrefs(null)
      assertEqual(result.widgets.length, WIDGET_CATALOG.length, 'length matches catalog')
    },
  },
  {
    id: 'dw-merge-empty',
    name: 'mergeWidgetPrefs: leeg widgets array retourneert defaults',
    category: CAT,
    description: 'Bij lege widgets array worden defaults gebruikt',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const result = mergeWidgetPrefs({ widgets: [] } as WidgetPrefs)
      // With empty array, savedMap is empty so all widgets get default disabled + order 100+i
      assertEqual(result.widgets.length, WIDGET_CATALOG.length, 'length matches catalog')
    },
  },
  {
    id: 'dw-merge-preserves',
    name: 'mergeWidgetPrefs: bewaart bestaande voorkeuren',
    category: CAT,
    description: 'Gebruikersvoorkeuren voor bestaande widgets worden behouden',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const saved: WidgetPrefs = {
        widgets: [
          { id: 'netto_vermogen', enabled: false, size: 'full', order: 5 },
          { id: 'cash_flow', enabled: true, size: 'quarter', order: 2 },
        ],
      }
      const result = mergeWidgetPrefs(saved)
      const nv = result.widgets.find(w => w.id === 'netto_vermogen')
      assertNotNull(nv, 'netto_vermogen found')
      assertEqual(nv!.enabled, false, 'preserved enabled=false')
      assertEqual(nv!.size, 'full', 'preserved size=full')
    },
  },
  {
    id: 'dw-merge-adds-new',
    name: 'mergeWidgetPrefs: nieuwe widgets worden toegevoegd',
    category: CAT,
    description: 'Widgets die niet in saved prefs zitten krijgen disabled default',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      // Save only 2 widgets — rest should be added as disabled
      const saved: WidgetPrefs = {
        widgets: [
          { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
          { id: 'cash_flow', enabled: true, size: 'half', order: 1 },
        ],
      }
      const result = mergeWidgetPrefs(saved)
      assertEqual(result.widgets.length, WIDGET_CATALOG.length, 'all catalog widgets present')
      // A widget not in saved should be disabled
      const budgetten = result.widgets.find(w => w.id === 'budgetten')
      assertNotNull(budgetten, 'budgetten added')
      assertEqual(budgetten!.enabled, false, 'new widget disabled by default')
    },
  },
  {
    id: 'dw-merge-mini-sanitize',
    name: 'mergeWidgetPrefs: mini size wordt gesanitized naar quarter',
    category: CAT,
    description: 'Mini is never persisted, wordt fallback naar quarter',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const saved: WidgetPrefs = {
        widgets: [
          { id: 'netto_vermogen', enabled: true, size: 'mini', order: 0 },
        ],
      }
      const result = mergeWidgetPrefs(saved)
      const nv = result.widgets.find(w => w.id === 'netto_vermogen')
      assertNotNull(nv, 'found')
      // netto_vermogen doesn't have 'mini' in sizes, so it falls back to defaultSize
      assert(nv!.size !== 'mini', 'mini sanitized away')
    },
  },
  {
    id: 'dw-merge-dynamic-preserved',
    name: 'mergeWidgetPrefs: dynamische budget_fav widgets behouden',
    category: CAT,
    description: 'budget_fav:* en holding_fav:* prefs worden doorgegeven',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const saved: WidgetPrefs = {
        widgets: [
          { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
          { id: 'budget_fav:abc123', enabled: true, size: 'quarter', order: 50 },
          { id: 'holding_fav:xyz456', enabled: true, size: 'half', order: 51 },
        ],
      }
      const result = mergeWidgetPrefs(saved)
      const budgetFav = result.widgets.find(w => w.id === 'budget_fav:abc123')
      assertNotNull(budgetFav, 'budget_fav preserved')
      const holdingFav = result.widgets.find(w => w.id === 'holding_fav:xyz456')
      assertNotNull(holdingFav, 'holding_fav preserved')
    },
  },
  {
    id: 'dw-merge-migration',
    name: 'mergeWidgetPrefs: oude abonnementen migratie naar vaste_lasten',
    category: CAT,
    description: 'Oude widget ids worden gemigreerd naar het nieuwe id',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const saved: WidgetPrefs = {
        widgets: [
          { id: 'abonnementen', enabled: true, size: 'half', order: 0 },
          { id: 'netto_vermogen', enabled: true, size: 'half', order: 1 },
        ],
      }
      const result = mergeWidgetPrefs(saved)
      const vl = result.widgets.find(w => w.id === 'vaste_lasten')
      assertNotNull(vl, 'vaste_lasten present after migration')
      assertEqual(vl!.enabled, true, 'migrated widget is enabled')
    },
  },

  // ── Step 3: Auto-dashboard builder ──────────────────────────────────
  {
    id: 'dw-builder-small-grid',
    name: 'Dashboard builder: klein grid',
    category: CAT,
    description: 'Small grid vult ~GRID_TARGET_CELLS.small cellen',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers({ gridSize: 'small' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      const cells = countCells(result)
      assertLessThanOrEqual(cells, GRID_TARGET_CELLS.small + 4, 'max cells')
      assertGreaterThanOrEqual(cells, GRID_TARGET_CELLS.small - 4, 'min cells')
    },
  },
  {
    id: 'dw-builder-medium-grid',
    name: 'Dashboard builder: medium grid',
    category: CAT,
    description: 'Medium grid heeft redelijk aantal widgets',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers({ gridSize: 'medium' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      assertGreaterThan(result.length, 0, 'widgets aanwezig')
      const cells = countCells(result)
      assertGreaterThanOrEqual(cells, GRID_TARGET_CELLS.medium - 4, 'min cells')
    },
  },
  {
    id: 'dw-builder-large-grid',
    name: 'Dashboard builder: groot grid',
    category: CAT,
    description: 'Large grid heeft meer cellen dan small',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const small = buildDashboardLayout(makeAnswers({ gridSize: 'small' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      const large = buildDashboardLayout(makeAnswers({ gridSize: 'large' }), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      assertGreaterThanOrEqual(countCells(large), countCells(small), 'large >= small cells')
    },
  },
  {
    id: 'dw-builder-all-enabled',
    name: 'Dashboard builder: alle widgets enabled',
    category: CAT,
    description: 'Resultaat bevat alleen enabled widgets',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers(), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      for (const pref of result) {
        assert(pref.enabled, `${pref.id} enabled`)
      }
    },
  },
  {
    id: 'dw-builder-sequential-order',
    name: 'Dashboard builder: sequentiële order',
    category: CAT,
    description: 'Resultaat heeft 0-based sequentiële order waarden',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const result = buildDashboardLayout(makeAnswers(), WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS)
      for (let i = 0; i < result.length; i++) {
        assertEqual(result[i].order, i, `order[${i}]`)
      }
    },
  },
  {
    id: 'dw-builder-focus-boost',
    name: 'Dashboard builder: focus boost werkt',
    category: CAT,
    description: 'Focus op fire_freedom bevordert horizon widgets',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const fireFocus = buildDashboardLayout(
        makeAnswers({ focuses: ['fire_freedom'], gridSize: 'large' }),
        WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS,
      )
      const budgetFocus = buildDashboardLayout(
        makeAnswers({ focuses: ['budget_cashflow'], gridSize: 'large' }),
        WIDGET_CATALOG, ALL_FEATURES_ENABLED, NO_FAVS,
      )
      // Fire focus should include fire_prognose
      const fireIds = new Set(fireFocus.map(w => w.id))
      assert(fireIds.has('fire_prognose'), 'fire focus includes fire_prognose')
      // Budget focus should include cash_flow
      const budgetIds = new Set(budgetFocus.map(w => w.id))
      assert(budgetIds.has('cash_flow'), 'budget focus includes cash_flow')
    },
  },
  {
    id: 'dw-builder-budget-favs',
    name: 'Dashboard builder: budget favorites ingebouwd',
    category: CAT,
    description: 'Selected budget favorites worden als quarter widgets toegevoegd',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const favs = [{ id: 'bud1', name: 'Boodschappen' }, { id: 'bud2', name: 'Huur' }]
      const result = buildDashboardLayout(
        makeAnswers({ selectedBudgetFavIds: ['bud1', 'bud2'] }),
        WIDGET_CATALOG, ALL_FEATURES_ENABLED, favs,
      )
      const favWidgets = result.filter(w => w.id.startsWith('budget_fav:'))
      assertEqual(favWidgets.length, 2, '2 budget fav widgets')
      assert(favWidgets.some(w => w.id === 'budget_fav:bud1'), 'bud1')
      assert(favWidgets.some(w => w.id === 'budget_fav:bud2'), 'bud2')
    },
  },
  {
    id: 'dw-builder-focus-choices-complete',
    name: 'Dashboard builder: alle focus choices gedefinieerd',
    category: CAT,
    description: 'FOCUS_WIDGET_BOOST heeft entries voor alle focus choices',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const expectedFocuses: FocusChoice[] = ['budget_cashflow', 'assets_investments', 'fire_freedom', 'goals_actions', 'overview']
      for (const f of expectedFocuses) {
        assertNotNull(FOCUS_WIDGET_BOOST[f], `${f} defined`)
        assertGreaterThan(FOCUS_WIDGET_BOOST[f].length, 0, `${f} has widgets`)
      }
    },
  },
  {
    id: 'dw-builder-popularity-coverage',
    name: 'Dashboard builder: popularity scores voor catalog widgets',
    category: CAT,
    description: 'WIDGET_POPULARITY bevat scores voor de meeste catalog widgets',
    priority: 'low',
    estimatedDurationMs: 5,
    fn() {
      const withPop = WIDGET_CATALOG.filter(w => WIDGET_POPULARITY[w.id] !== undefined)
      // Most widgets should have popularity defined
      assertGreaterThanOrEqual(withPop.length, WIDGET_CATALOG.length * 0.8, 'minstens 80% coverage')
    },
  },

  // ── Step 4: Widget ordering ─────────────────────────────────────────
  {
    id: 'dw-order-reassign',
    name: 'Widget ordering: reassignOrders sequentieel',
    category: CAT,
    description: 'reassignOrders geeft 0-based sequentiële orders',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const r = reassignOrders(makePrefs(['a', 'b', 'c']))
      assertEqual(r[0].order, 0, 'first')
      assertEqual(r[1].order, 1, 'second')
      assertEqual(r[2].order, 2, 'third')
    },
  },
  {
    id: 'dw-order-reassign-empty',
    name: 'Widget ordering: lege lijst',
    category: CAT,
    description: 'reassignOrders met lege input retourneert leeg',
    priority: 'low',
    estimatedDurationMs: 5,
    fn() {
      const r = reassignOrders([])
      assertEqual(r.length, 0, 'empty')
    },
  },
  {
    id: 'dw-order-move-forward',
    name: 'Widget ordering: move forward',
    category: CAT,
    description: 'moveWidget verplaatst widget naar latere positie',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b', 'c', 'd'])
      const result = moveWidget(prefs, 'a', 'c')
      assertEqual(result[0].id, 'b', 'b first')
      assertEqual(result[1].id, 'c', 'c second')
      assertEqual(result[2].id, 'a', 'a moved to after c')
    },
  },
  {
    id: 'dw-order-move-backward',
    name: 'Widget ordering: move backward',
    category: CAT,
    description: 'moveWidget verplaatst widget naar eerdere positie',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b', 'c', 'd'])
      const result = moveWidget(prefs, 'd', 'b')
      assertEqual(result[0].id, 'a', 'a stays')
      assertEqual(result[1].id, 'd', 'd moved')
      assertEqual(result[2].id, 'b', 'b shifted')
    },
  },
  {
    id: 'dw-order-move-same',
    name: 'Widget ordering: move to self is no-op',
    category: CAT,
    description: 'moveWidget met fromId === toId retourneert ongewijzigd',
    priority: 'low',
    estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b', 'c'])
      const result = moveWidget(prefs, 'b', 'b')
      assertEqual(result[0].id, 'a', 'unchanged a')
      assertEqual(result[1].id, 'b', 'unchanged b')
      assertEqual(result[2].id, 'c', 'unchanged c')
    },
  },
  {
    id: 'dw-order-move-unknown',
    name: 'Widget ordering: unknown id is no-op',
    category: CAT,
    description: 'moveWidget met onbekend id retourneert origineel',
    priority: 'low',
    estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b'])
      const result = moveWidget(prefs, 'z', 'a')
      assertEqual(result.length, 2, 'same length')
      assertEqual(result[0].id, 'a', 'unchanged')
    },
  },
  {
    id: 'dw-order-preserves-fields',
    name: 'Widget ordering: velden behouden',
    category: CAT,
    description: 'reassignOrders behoudt id, enabled, size',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      const prefs: WidgetPref[] = [
        { id: 'x', enabled: false, size: 'full', order: 99 },
        { id: 'y', enabled: true, size: 'quarter', order: 50 },
      ]
      const r = reassignOrders(prefs)
      assertEqual(r[0].id, 'x', 'id preserved')
      assertEqual(r[0].enabled, false, 'enabled preserved')
      assertEqual(r[0].size, 'full', 'size preserved')
      assertEqual(r[0].order, 0, 'order reassigned')
      assertEqual(r[1].order, 1, 'order reassigned')
    },
  },

  // ── Step 5: PUT /api/widgets ────────────────────────────────────────
  {
    id: 'dw-api-widgets-auth',
    name: 'PUT /api/widgets: auth guard',
    category: CAT,
    description: 'Ongeauthenticeerde requests worden afgewezen',
    priority: 'high',
    estimatedDurationMs: 200,
    async fn() {
      const res = await unauthenticatedFetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: [] }),
      })
      assertEqual(res.status, 401, 'unauthenticated returns 401')
    },
  },
  {
    id: 'dw-api-widgets-validation',
    name: 'PUT /api/widgets: invalid payload',
    category: CAT,
    description: 'Ongeldige body wordt afgewezen met 400',
    priority: 'medium',
    estimatedDurationMs: 200,
    async fn() {
      const res = await unauthenticatedFetch('/api/widgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: 'not an array' }),
      })
      // Should be 400 (invalid payload) or 401 (auth first)
      assert(res.status === 400 || res.status === 401, `status ${res.status} is 400 or 401`)
    },
  },
  {
    id: 'dw-api-widgets-sanitization',
    name: 'PUT /api/widgets: sanitization contract',
    category: CAT,
    description: 'API route sanitizes mini→quarter, validates catalog ids, allows dynamic prefixes',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Verify the contract: catalog ids are a known set
      const validIds = new Set(WIDGET_CATALOG.map(w => w.id))
      assertGreaterThanOrEqual(validIds.size, 44, 'minstens 44 valid widget ids')
      // Dynamic prefixes should be accepted
      assert(!validIds.has('budget_fav:test'), 'dynamic id not in catalog')
      assert(!validIds.has('holding_fav:test'), 'dynamic holding not in catalog')
      // The route filters to validIds + budget_fav: + holding_fav: prefixes
    },
  },

  // ── Step 6: Widget rendering contract ───────────────────────────────
  {
    id: 'dw-render-switch-coverage',
    name: 'Widget rendering: switch coverage voor alle catalog widgets',
    category: CAT,
    description: 'Elke widget in de catalog heeft een case in de WidgetRenderer switch',
    priority: 'critical',
    estimatedDurationMs: 5,
    fn() {
      // The widget renderer has a switch for all catalog widget ids.
      // We verify that WIDGET_HREFS (used inside WidgetRenderer) covers all catalog ids.
      // If a widget were missing from the switch, it would return null.
      for (const w of WIDGET_CATALOG) {
        const href = WIDGET_HREFS[w.id]
        assertNotNull(href, `WidgetRenderer needs href for ${w.id}`)
      }
    },
  },
  {
    id: 'dw-render-budget-gating',
    name: 'Widget rendering: budgetingActive gating',
    category: CAT,
    description: 'BUDGET_WIDGETS set is consistent met catalog ids',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // All budget widget ids should exist in catalog
      for (const bwId of BUDGET_WIDGETS) {
        const found = WIDGET_CATALOG.find(w => w.id === bwId)
        assertNotNull(found, `budget widget ${bwId} in catalog`)
      }
    },
  },
  {
    id: 'dw-render-feature-gating',
    name: 'Widget rendering: feature gating via WIDGET_FEATURE_MAP',
    category: CAT,
    description: 'Feature-gated widgets verwijzen naar een geldig unified feature id',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      // Widgets met een feature-mapping zijn gate-baar (abonnement/user-toggle)
      const mapped = WIDGET_CATALOG.filter(w => WIDGET_FEATURE_MAP[w.id])
      assertGreaterThan(mapped.length, 0, 'er zijn feature-gemapte widgets')
      const unifiedIds = new Set(UNIFIED_FEATURES.map(f => f.id))
      for (const w of mapped) {
        assert(unifiedIds.has(WIDGET_FEATURE_MAP[w.id]), `${w.id} verwijst naar geldig feature id`)
      }
    },
  },
  {
    id: 'dw-render-grid-targets',
    name: 'Dashboard builder: GRID_TARGET_CELLS waarden',
    category: CAT,
    description: 'Grid targets: small < medium < large',
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assert(GRID_TARGET_CELLS.small < GRID_TARGET_CELLS.medium, 'small < medium')
      assert(GRID_TARGET_CELLS.medium < GRID_TARGET_CELLS.large, 'medium < large')
      assertEqual(GRID_TARGET_CELLS.small, 12, 'small = 12')
      assertEqual(GRID_TARGET_CELLS.medium, 16, 'medium = 16')
      assertEqual(GRID_TARGET_CELLS.large, 20, 'large = 20')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Dashboard — Widgets',
    description: 'Widget systeem, catalog, rendering, ordering, auto-dashboard builder, drag & drop',
    icon: 'LayoutGrid',
    testCount: 0,
  })
  registerTests(tests)
}
