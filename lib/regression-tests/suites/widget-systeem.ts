import { registerTests } from '../test-registry'
import { assertEqual, assert } from '../assert'
import type { TestCase } from '../test-types'
import { reassignOrders, moveWidget } from '@/lib/widget-order'
import type { WidgetPref } from '@/lib/widget-catalog'

const CAT = 'widgets.ordering'

function makePrefs(ids: string[]): WidgetPref[] {
  return ids.map((id, i) => ({ id, enabled: true, size: 'half' as const, order: i * 10 }))
}

const tests: TestCase[] = [
  {
    id: 'widget-reassign', name: 'Order reassignment', category: CAT,
    description: 'reassignOrders geeft sequentiële orders',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const r = reassignOrders(makePrefs(['a', 'b', 'c']))
      assertEqual(r[0].order, 0, 'first')
      assertEqual(r[1].order, 1, 'second')
      assertEqual(r[2].order, 2, 'third')
    },
  },
  {
    id: 'widget-reassign-empty', name: 'Lege lijst', category: CAT,
    description: 'reassignOrders met lege input',
    priority: 'low', estimatedDurationMs: 5,
    fn() {
      const r = reassignOrders([])
      assertEqual(r.length, 0, 'empty')
    },
  },
  {
    id: 'widget-move-forward', name: 'Widget verplaatsen vooruit', category: CAT,
    description: 'moveWidget verplaatst widget naar latere positie',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b', 'c', 'd'])
      const result = moveWidget(prefs, 'a', 'c')
      assertEqual(result[0].id, 'b', 'b first')
      assertEqual(result[1].id, 'c', 'c second')
      assertEqual(result[2].id, 'a', 'a moved')
    },
  },
  {
    id: 'widget-move-backward', name: 'Widget verplaatsen achteruit', category: CAT,
    description: 'moveWidget verplaatst widget naar eerdere positie',
    priority: 'high', estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b', 'c', 'd'])
      const result = moveWidget(prefs, 'd', 'b')
      assertEqual(result[0].id, 'a', 'a stays')
      assertEqual(result[1].id, 'd', 'd moved')
      assertEqual(result[2].id, 'b', 'b shifted')
    },
  },
  {
    id: 'widget-preserves-fields', name: 'Velden behouden', category: CAT,
    description: 'reassignOrders behoudt id, enabled, size',
    priority: 'medium', estimatedDurationMs: 5,
    fn() {
      const prefs = makePrefs(['a', 'b'])
      const r = reassignOrders(prefs)
      assertEqual(r[0].id, 'a', 'id')
      assert(r[0].enabled, 'enabled')
      assertEqual(r[0].size, 'half', 'size')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
