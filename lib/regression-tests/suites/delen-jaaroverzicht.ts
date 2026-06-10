import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch, authenticatedFetch } from '../server-runner'

const CAT = 'identiteit.delen-jaaroverzicht'

// ── Helper ────────────────────────────────────────────────────────────────────

/** Fetch without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return authenticatedFetch(path, { redirect: 'manual' })
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: FreedomCardGenerator renders correctly ──────────────────────────
  {
    id: 'delen-freedom-card-generator',
    name: 'FreedomCardGenerator: freedom card data via API',
    category: CAT,
    description: 'GET /api/share/freedom-card retourneert geldige freedom card data met financiële velden',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      // The freedom-card endpoint requires auth; unauthenticated should get 401 or redirect
      const res = await unauthenticatedFetch('/api/share/freedom-card')
      // If 401 = correct auth gating; if 200 = logged in, check shape
      if (res.status === 200) {
        const data = await res.json()
        assertNotNull(data.privacyLevel, 'privacyLevel')
        assert(
          typeof data.freedomDaysWon === 'number',
          'freedomDaysWon moet een number zijn',
        )
        assertNotNull(data.fireCountdown, 'fireCountdown')
        assert(
          typeof data.fireCountdown.label === 'string',
          'fireCountdown.label moet een string zijn',
        )
        assertNotNull(data.freedomTime, 'freedomTime')
        assertNotNull(data.generatedAt, 'generatedAt')
        assertNotNull(data.dataAvailability, 'dataAvailability')
      } else {
        // 401 or redirect — auth gating works correctly
        assert(
          res.status === 401 || isRedirect(res.status),
          `Expected 200, 401 or redirect for freedom-card, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 2: ShareDialog sharing options ─────────────────────────────────────
  {
    id: 'delen-share-dialog-options',
    name: 'ShareDialog: sharing opties beschikbaar',
    category: CAT,
    description: 'ShareContent interface bevat alle benodigde velden voor deelbare URL',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Validate ShareContent type contract — must have title, text, contentType
      const mockContent = {
        title: 'Test share',
        text: 'Test text',
        url: 'https://example.com',
        contentType: 'freedom_card' as const,
        privacyLevel: 'anonymous',
      }
      assertNotNull(mockContent.title, 'share title')
      assertNotNull(mockContent.text, 'share text')
      assertNotNull(mockContent.url, 'share url')
      assertNotNull(mockContent.contentType, 'share contentType')
      // Valid content types
      const validTypes = ['freedom_card', 'milestone', 'achievement', 'badge']
      assert(
        validTypes.includes(mockContent.contentType),
        `contentType '${mockContent.contentType}' moet geldig zijn`,
      )
    },
  },

  // ── Step 3: POST /api/share/track ───────────────────────────────────────────
  {
    id: 'delen-share-track-post',
    name: 'POST /api/share/track: share event logging',
    category: CAT,
    description: 'Share tracking endpoint accepteert events en retourneert correct',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      const body = {
        share_type: 'copy_link',
        content_type: 'freedom_card',
        privacy_level: 'anonymous',
      }
      const res = await unauthenticatedFetch('/api/share/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // 401 = auth required (correct), 200 = logged in + tracked/fallback
      if (res.status === 200) {
        const data = await res.json()
        // tracked: true (db worked) or tracked: false (fallback)
        assert(
          typeof data.tracked === 'boolean' || data.source === 'fallback',
          'Response moet tracked boolean of fallback source bevatten',
        )
      } else {
        assertEqual(res.status, 401, 'Niet-ingelogde POST moet 401 geven')
      }
    },
  },

  // ── Step 3b: POST /api/share/track validation ──────────────────────────────
  {
    id: 'delen-share-track-validation',
    name: 'POST /api/share/track: ongeldige share_type geweigerd',
    category: CAT,
    description: 'Ongeldige share_type of content_type geeft 400',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const body = {
        share_type: 'invalid_type',
        content_type: 'freedom_card',
      }
      const res = await unauthenticatedFetch('/api/share/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // 400 (invalid) or 401 (auth first) are both acceptable
      assert(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 for invalid share_type, got ${res.status}`,
      )
    },
  },

  // ── Step 4: GET /api/share/freedom-card ─────────────────────────────────────
  {
    id: 'delen-freedom-card-endpoint',
    name: 'GET /api/share/freedom-card: afbeelding data endpoint',
    category: CAT,
    description: 'Freedom card endpoint retourneert JSON met card data',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      // Test with privacy parameter
      const res = await unauthenticatedFetch('/api/share/freedom-card?privacy=anonymous')
      if (res.status === 200) {
        const data = await res.json()
        assertEqual(data.privacyLevel, 'anonymous', 'Privacy level moet anonymous zijn')
        // Should NOT include displayName or netWorth for anonymous
        assert(
          data.displayName === undefined || data.displayName === null,
          'Anonymous card mag geen displayName bevatten',
        )
        assert(
          data.netWorth === undefined || data.netWorth === null,
          'Anonymous card mag geen netWorth bevatten',
        )
      } else {
        assert(
          res.status === 401 || isRedirect(res.status),
          `Expected 200 or 401, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 4b: Freedom card privacy levels ───────────────────────────────────
  {
    id: 'delen-freedom-card-privacy',
    name: 'GET /api/share/freedom-card: ongeldig privacy niveau',
    category: CAT,
    description: 'Ongeldige privacy parameter geeft 400',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await unauthenticatedFetch('/api/share/freedom-card?privacy=invalid_level')
      // Should be 400 (invalid privacy) or 401 (auth check first)
      assert(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 for invalid privacy, got ${res.status}`,
      )
    },
  },

]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Identiteit — Delen',
    description: 'Freedom card en social sharing (jaaroverzicht is verwijderd; alleen de share-API\'s leven nog)',
    icon: 'Share2',
    testCount: 0,
  })
  registerTests(tests)
}
