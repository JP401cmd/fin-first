import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'invulfase.checklist'

const FIXED_CATEGORIES = ['vermogen', 'schulden', 'instellingen']
const VALID_STATUSES = ['empty', 'partial', 'complete', 'skipped']

const tests: TestCase[] = [
  {
    id: 'invulfase-checklist-structure',
    name: 'GET /api/invulfase/checklist retourneert geldige structuur',
    category: CAT,
    description: 'Checklist endpoint retourneert categories array en progress object met percentage 0-100',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/invulfase/checklist')
      assertEqual(res.status, 200, 'Status moet 200 zijn')

      const data = await res.json()
      assert(Array.isArray(data.categories), 'categories moet een array zijn')
      assert(data.progress != null, 'progress moet bestaan')
      assert(typeof data.progress.percentage === 'number', 'percentage moet een number zijn')
      assert(data.progress.percentage >= 0 && data.progress.percentage <= 100, 'percentage moet 0-100 zijn')
    },
  },
  {
    id: 'invulfase-checklist-fixed-categories',
    name: 'Vaste categorieën zijn altijd aanwezig',
    category: CAT,
    description: 'Vermogen, schulden en instellingen zijn altijd in de response',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/invulfase/checklist')
      const data = await res.json()

      const catKeys = data.categories.map((c: { key: string }) => c.key)
      for (const fixed of FIXED_CATEGORIES) {
        assert(catKeys.includes(fixed), `Categorie '${fixed}' moet aanwezig zijn`)
      }
    },
  },
  {
    id: 'invulfase-checklist-valid-statuses',
    name: 'Alle items hebben geldige statussen',
    category: CAT,
    description: 'Elk item heeft status empty, partial, complete of skipped en een positief gewicht',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/invulfase/checklist')
      const data = await res.json()

      for (const cat of data.categories) {
        for (const item of cat.items) {
          assert(
            VALID_STATUSES.includes(item.status),
            `Item '${item.key}' heeft ongeldige status '${item.status}'`,
          )
          assert(typeof item.weight === 'number' && item.weight > 0, `Item '${item.key}' moet positief gewicht hebben`)
          assert(typeof item.href === 'string' && item.href.startsWith('/'), `Item '${item.key}' moet geldige href hebben`)
        }
      }
    },
  },
  {
    id: 'invulfase-skip-toggle',
    name: 'PUT /api/invulfase/skip markeert en unmarkeert items',
    category: CAT,
    description: 'Skip API slaat overgeslagen items op in feature_preferences en undo werkt',
    priority: 'critical',
    estimatedDurationMs: 3000,
    async fn() {
      // Skip een item
      const skipRes = await authenticatedFetch('/api/invulfase/skip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'creditcard', skipped: true }),
      })
      assertEqual(skipRes.status, 200, 'Skip moet succesvol zijn')
      const skipData = await skipRes.json()
      assert(Array.isArray(skipData.skipped), 'Response bevat skipped array')
      assert(skipData.skipped.includes('creditcard'), 'creditcard zit in skipped array')

      // Undo de skip
      const undoRes = await authenticatedFetch('/api/invulfase/skip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'creditcard', skipped: false }),
      })
      assertEqual(undoRes.status, 200, 'Undo skip moet succesvol zijn')
      const undoData = await undoRes.json()
      assert(!undoData.skipped.includes('creditcard'), 'creditcard niet meer in skipped array na undo')
    },
  },
  {
    id: 'invulfase-skip-validation',
    name: 'PUT /api/invulfase/skip valideert body',
    category: CAT,
    description: 'Ongeldige body retourneert 400',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/api/invulfase/skip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: true }),
      })
      assertEqual(res.status, 400, 'Ongeldige body moet 400 retourneren')
    },
  },
  {
    id: 'invulfase-progress-consistent',
    name: 'Gewogen voortgang is consistent met items',
    category: CAT,
    description: 'Progress totals kloppen met de som van gewichten per status',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/invulfase/checklist')
      const data = await res.json()

      let totalWeight = 0
      let completedWeight = 0
      let skippedWeight = 0
      for (const cat of data.categories) {
        for (const item of cat.items) {
          totalWeight += item.weight
          if (item.status === 'complete') completedWeight += item.weight
          if (item.status === 'skipped') skippedWeight += item.weight
        }
      }

      assertEqual(data.progress.total, totalWeight, 'Totaal gewicht overeenkomen')
      assertEqual(data.progress.completed, completedWeight, 'Completed gewicht overeenkomen')
      assertEqual(data.progress.skipped, skippedWeight, 'Skipped gewicht overeenkomen')
    },
  },
  {
    id: 'invulfase-dismiss-still-works',
    name: 'Dismiss via PUT /api/invulfase werkt nog',
    category: CAT,
    description: 'Invulfase kan gedeactiveerd en opnieuw geactiveerd worden',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      // Dismiss
      const dismissRes = await authenticatedFetch('/api/invulfase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      })
      assertEqual(dismissRes.status, 200, 'Dismiss succesvol')

      const checkRes = await authenticatedFetch('/api/invulfase')
      const checkData = await checkRes.json()
      assertEqual(checkData.active, false, 'Invulfase inactief na dismiss')

      // Reactiveer
      await authenticatedFetch('/api/invulfase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      })
    },
  },
]

export function register(): void {
  registerTests(tests)
}
