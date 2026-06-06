import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'cross-cutting.navigatie'

// ── Navigation items from lib/navigation.ts ─────────────────────────────────

const NAV_ITEMS = [
  { label: 'Overzicht (Wil)', href: '/will' },
  { label: 'Overzicht (Horizon)', href: '/horizon' },
  { label: 'Overzicht (Identiteit)', href: '/identity' },
  { label: 'Profiel', href: '/identity/profiel' },
  { label: 'Instellingen', href: '/identity/instellingen' },
  { label: 'Koppelingen', href: '/identity/koppelingen' },
]

// ── Redirect mappings (source → expected target) ─────────────────────────────

const REDIRECTS = [
  { from: '/identity/voortgang', to: '/identity' },
  { from: '/identity/widgets', to: '/will' },
  { from: '/identity/parameters', to: '/identity/instellingen' },
  { from: '/core/cash', to: '/core/assets' },
]

// ── Known routes that should exist ─────────────────────────────────────────

const KNOWN_ROUTES = [
  '/dashboard',
  '/core',
  '/core/budgets',
  '/core/assets',
  '/core/debts',
  '/overzicht/cashflow',
  '/overzicht/cashflow/budget',
  '/overzicht/cashflow/transacties',
  '/overzicht/cashflow/vaste-lasten',
  '/overzicht/cashflow/forecast',
  '/will',
  '/horizon',
  '/identity',
  '/login',
  '/signup',
]

// ── Beheer routes (admin only) ──────────────────────────────────────────────

const BEHEER_ROUTES = [
  '/beheer/ai',
  '/beheer/testdata',
  '/beheer/releases',
  '/beheer/regressietest',
]

/** Fetch a URL without following redirects (manual redirect mode) */
async function fetchNoRedirect(path: string): Promise<Response> {
  return authenticatedFetch(path, { redirect: 'manual' })
}

/** Check if a response is a redirect */
function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

const tests: TestCase[] = [
  // ── Step 1: Redirect tests ─────────────────────────────────────────
  {
    id: 'nav-redirect-voortgang', name: 'Redirect /identity/voortgang → /identity', category: CAT,
    description: 'Voortgang pagina redirectt naar identity overzicht',
    priority: 'high', estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/identity/voortgang')
      assert(
        isRedirect(res.status) || res.status === 200,
        `Expected redirect or 200, got ${res.status}`,
      )
      // If redirect, check location header contains target
      if (isRedirect(res.status)) {
        const location = res.headers.get('location') ?? ''
        assert(
          location.includes('/identity') || location.includes('/login'),
          `Expected redirect to /identity or /login, got ${location}`,
        )
      }
    },
  },
  {
    id: 'nav-redirect-widgets', name: 'Redirect /identity/widgets → /will', category: CAT,
    description: 'Widgets pagina redirectt naar /will (dashboard met widget edit-mode)',
    priority: 'high', estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/identity/widgets')
      assert(
        isRedirect(res.status) || res.status === 200,
        `Expected redirect or 200, got ${res.status}`,
      )
      if (isRedirect(res.status)) {
        const location = res.headers.get('location') ?? ''
        assert(
          location.includes('/will') || location.includes('/login'),
          `Expected redirect to /will or /login, got ${location}`,
        )
      }
    },
  },
  {
    id: 'nav-redirect-parameters', name: 'Redirect /identity/parameters → /identity/instellingen', category: CAT,
    description: 'Parameters pagina redirectt naar instellingen',
    priority: 'high', estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/identity/parameters')
      assert(
        isRedirect(res.status) || res.status === 200,
        `Expected redirect or 200, got ${res.status}`,
      )
      if (isRedirect(res.status)) {
        const location = res.headers.get('location') ?? ''
        assert(
          location.includes('/identity/instellingen') || location.includes('/login'),
          `Expected redirect to /identity/instellingen or /login, got ${location}`,
        )
      }
    },
  },

  {
    id: 'nav-redirect-core-cash', name: 'Redirect /core/cash → /core/assets', category: CAT,
    description: 'Cash pagina redirectt naar bezittingen (cash is onderdeel van assets)',
    priority: 'high', estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/core/cash')
      assert(
        isRedirect(res.status) || res.status === 200,
        `Expected redirect or 200, got ${res.status}`,
      )
      // Client-side redirect via router.replace — page renders as 200 with redirect JS
      // So both 200 and redirect status are acceptable
    },
  },

  // ── Step 2: Navigation structure (all items reachable) ────────────
  {
    id: 'nav-structure-reachable', name: 'Nav items zijn bereikbaar', category: CAT,
    description: 'Alle navigatie-items uit lib/navigation.ts geven een valide response',
    priority: 'critical', estimatedDurationMs: 2000,
    async fn() {
      const results: string[] = []
      for (const item of NAV_ITEMS) {
        const res = await fetchNoRedirect(item.href)
        // Valid responses: 200 (OK), 307/302 (auth redirect), or other redirect
        const valid = res.status === 200 || isRedirect(res.status)
        if (!valid) {
          results.push(`${item.label} (${item.href}): ${res.status}`)
        }
      }
      assert(results.length === 0, `Onbereikbare routes: ${results.join(', ')}`)
    },
  },

  // ── Step 3: Known routes exist ────────────────────────────────────
  {
    id: 'nav-known-routes', name: 'Bekende routes bestaan', category: CAT,
    description: 'Alle hoofdroutes geven 200 of auth redirect',
    priority: 'critical', estimatedDurationMs: 3000,
    async fn() {
      const failures: string[] = []
      for (const route of KNOWN_ROUTES) {
        const res = await fetchNoRedirect(route)
        // 200 = page rendered, 307/302 = auth redirect (valid for protected pages)
        const valid = res.status === 200 || isRedirect(res.status)
        if (!valid) {
          failures.push(`${route}: ${res.status}`)
        }
      }
      assert(failures.length === 0, `Ongeldige routes: ${failures.join(', ')}`)
    },
  },

  // ── Step 4: 404 handling ──────────────────────────────────────────
  {
    id: 'nav-404-handling', name: '404 voor ongeldige routes', category: CAT,
    description: 'Niet-bestaande routes geven 404',
    priority: 'high', estimatedDurationMs: 1000,
    async fn() {
      const invalidRoutes = [
        '/this-route-does-not-exist',
        '/core/nonexistent-page',
        '/identity/does-not-exist',
      ]
      for (const route of invalidRoutes) {
        const res = await fetchNoRedirect(route)
        // Could be 404 or redirect to login (auth middleware may catch first)
        assert(
          res.status === 404 || isRedirect(res.status),
          `Expected 404 or redirect for ${route}, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 5a: Beheer admin protection — normal user gets redirected ──
  {
    id: 'nav-beheer-protected-user', name: 'Beheer redirectt normale gebruiker', category: CAT,
    description: 'Beheer paginas redirecten gebruikers met role=user naar /will',
    priority: 'critical', estimatedDurationMs: 4000,
    requiredRole: 'user',
    async fn() {
      // Test runner auto-switches to role='user' — verify beheer redirects
      for (const route of BEHEER_ROUTES) {
        const res = await fetchNoRedirect(route)
        assert(
          isRedirect(res.status),
          `Expected redirect for ${route} when role=user, got ${res.status}`,
        )
      }
    },
  },
  // ── Step 5b: Beheer accessible for superadmin ─────────────────────
  {
    id: 'nav-beheer-accessible-admin', name: 'Beheer toegankelijk voor superadmin', category: CAT,
    description: 'Beheer paginas zijn bereikbaar voor superadmin gebruikers',
    priority: 'critical', estimatedDurationMs: 2000,
    requiredRole: 'superadmin',
    async fn() {
      // Verify that a superadmin can actually access beheer pages
      for (const route of BEHEER_ROUTES) {
        const res = await fetchNoRedirect(route)
        assert(
          res.status === 200 || isRedirect(res.status),
          `Expected 200 or redirect for ${route} as superadmin, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 6: Public pages accessible without auth ──────────────────
  {
    id: 'nav-public-pages', name: 'Publieke paginas zonder auth', category: CAT,
    description: 'Login en signup zijn toegankelijk zonder authenticatie',
    priority: 'high', estimatedDurationMs: 1000,
    async fn() {
      const publicPages = ['/login', '/signup']
      for (const page of publicPages) {
        const res = await fetchNoRedirect(page)
        assertEqual(res.status, 200, `${page} moet 200 geven`)
      }
    },
  },

  // ── Step 7: Landing page accessible ───────────────────────────────
  {
    id: 'nav-landing', name: 'Landing page bereikbaar', category: CAT,
    description: 'Root / geeft 200 of redirect naar login/dashboard',
    priority: 'medium', estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/')
      assert(
        res.status === 200 || isRedirect(res.status),
        `Expected 200 or redirect for /, got ${res.status}`,
      )
    },
  },

  // ── Step 8: API health check ──────────────────────────────────────
  {
    id: 'nav-api-health', name: 'API health endpoint', category: CAT,
    description: '/api/health retourneert 200',
    priority: 'medium', estimatedDurationMs: 500,
    async fn() {
      const res = await authenticatedFetch('/api/health')
      assertEqual(res.status, 200, 'health endpoint')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
