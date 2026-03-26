import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'welcome.krant'

const tests: TestCase[] = [
  {
    id: 'welcome-api-get',
    name: 'GET /api/welcome retourneert geldige structuur',
    category: CAT,
    description: 'Welcome endpoint retourneert { seen: boolean }',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/welcome')
      assertEqual(res.status, 200, 'Status moet 200 zijn')

      const data = await res.json()
      assert(typeof data.seen === 'boolean', 'seen moet een boolean zijn')
    },
  },
  {
    id: 'welcome-api-put-mark-seen',
    name: 'PUT /api/welcome markeert als gezien',
    category: CAT,
    description: 'PUT met { seen: true } persists en GET bevestigt',
    priority: 'critical',
    estimatedDurationMs: 3000,
    async fn() {
      // Mark as seen
      const putRes = await authenticatedFetch('/api/welcome', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      })
      assertEqual(putRes.status, 200, 'PUT moet succesvol zijn')
      const putData = await putRes.json()
      assertEqual(putData.seen, true, 'Response bevestigt seen=true')

      // Verify with GET
      const getRes = await authenticatedFetch('/api/welcome')
      const getData = await getRes.json()
      assertEqual(getData.seen, true, 'GET bevestigt persistentie')
    },
  },
  {
    id: 'welcome-api-put-validation',
    name: 'PUT /api/welcome valideert body',
    category: CAT,
    description: 'Ongeldige body retourneert 400',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/api/welcome', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: true }),
      })
      assertEqual(res.status, 400, 'Ongeldige body moet 400 retourneren')
    },
  },
  {
    id: 'welcome-api-put-reset',
    name: 'PUT /api/welcome kan gereset worden',
    category: CAT,
    description: 'PUT met { seen: false } reset de flag, daarna hersteld naar true',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      // Reset
      const resetRes = await authenticatedFetch('/api/welcome', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: false }),
      })
      assertEqual(resetRes.status, 200, 'Reset moet succesvol zijn')

      const getRes = await authenticatedFetch('/api/welcome')
      const getData = await getRes.json()
      assertEqual(getData.seen, false, 'GET bevestigt reset naar false')

      // Restore to true for clean state
      await authenticatedFetch('/api/welcome', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      })
    },
  },
  {
    id: 'welcome-preserves-other-prefs',
    name: 'Welcome API behoudt andere feature_preferences',
    category: CAT,
    description: 'Zet _welcome_seen zonder _invulfase_active te overschrijven',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      // Check invulfase status before
      const beforeRes = await authenticatedFetch('/api/invulfase')
      const beforeData = await beforeRes.json()
      const invulfaseBefore = beforeData.active

      // Toggle welcome seen
      await authenticatedFetch('/api/welcome', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: true }),
      })

      // Verify invulfase is unchanged
      const afterRes = await authenticatedFetch('/api/invulfase')
      const afterData = await afterRes.json()
      assertEqual(
        afterData.active,
        invulfaseBefore,
        `_invulfase_active moet ongewijzigd blijven (was ${invulfaseBefore})`,
      )
    },
  },
]

export function register(): void {
  registerTests(tests)
}
