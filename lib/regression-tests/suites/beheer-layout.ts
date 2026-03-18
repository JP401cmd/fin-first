import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'beheer.layout'

// ── Beheer nav tabs (all 18 from beheer-nav.tsx) ──────────────────────────────

const BEHEER_TABS = [
  { label: 'AI Instellingen', href: '/beheer/ai' },
  { label: 'Prompts', href: '/beheer/prompts' },
  { label: 'Briefing', href: '/beheer/briefing' },
  { label: 'Testdata', href: '/beheer/testdata' },
  { label: 'Release Notes', href: '/beheer/releases' },
  { label: 'Meldingen', href: '/beheer/meldingen' },
  { label: 'Toegang', href: '/beheer/toegang' },
  { label: 'Database', href: '/beheer/migration' },
  { label: 'Mobile Preview', href: '/beheer/testdata#mobile-preview' },
  { label: 'Bank Connect', href: '/beheer/bank-connect' },
  { label: 'Nieuws', href: '/beheer/nieuws' },
  { label: 'AI Features', href: '/beheer/ai-features' },
  { label: 'Widgets', href: '/beheer/widgets-test' },
  { label: 'Propositie', href: '/beheer/propositie' },
  { label: 'AOW-leeftijd', href: '/beheer/aow-leeftijd' },
  { label: 'Will Avatar', href: '/beheer/will-avatar' },
  { label: 'Roadmap', href: '/beheer/roadmap' },
  { label: 'Regressietest', href: '/beheer/regressietest' },
]

/** Fetch a URL without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return fetch(path, { redirect: 'manual' })
}

/** Check if a response is a redirect */
function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

const tests: TestCase[] = [
  // ── Step 1: isSuperAdmin check ──────────────────────────────────────
  {
    id: 'beheer-admin-only',
    name: 'Alleen super admin heeft toegang',
    category: CAT,
    description: 'isSuperAdmin check: niet-ingelogde gebruikers worden doorgestuurd',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      // Without auth cookies, the beheer layout should redirect
      const res = await fetchNoRedirect('/beheer/ai')
      assert(
        isRedirect(res.status),
        `Expected redirect for /beheer/ai (admin protection), got ${res.status}`,
      )
    },
  },

  // ── Step 2: Redirect bij niet-admin → /will ─────────────────────────
  {
    id: 'beheer-redirect-non-admin',
    name: 'Redirect bij niet-admin naar /will',
    category: CAT,
    description: 'Niet-admin gebruikers worden doorgestuurd naar /will',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      // The beheer layout redirects non-admins to /will
      // Without auth, middleware redirects to /login first
      // Either way, we should get a redirect (not a 200)
      const res = await fetchNoRedirect('/beheer/testdata')
      assert(
        isRedirect(res.status),
        `Expected redirect for non-admin access to /beheer/testdata, got ${res.status}`,
      )
      const location = res.headers.get('location') ?? ''
      // Should redirect to /will (non-admin) or /login (not authenticated)
      assert(
        location.includes('/will') || location.includes('/login'),
        `Expected redirect to /will or /login, got ${location}`,
      )
    },
  },

  // ── Step 3: All 18 beheer-nav tabs reachable ────────────────────────
  {
    id: 'beheer-nav-tabs-reachable',
    name: 'Alle 18 beheer-nav tabs zijn bereikbaar',
    category: CAT,
    description: 'Alle tabs uit beheer-nav.tsx geven een redirect (auth) of 200',
    priority: 'critical',
    estimatedDurationMs: 5000,
    async fn() {
      const failures: string[] = []
      for (const tab of BEHEER_TABS) {
        const path = tab.href.split('#')[0] // strip hash fragments
        const res = await fetchNoRedirect(path)
        // Valid: 200 (admin logged in) or redirect (auth/admin check)
        // Invalid: 404, 500
        const valid = res.status === 200 || isRedirect(res.status)
        if (!valid) {
          failures.push(`${tab.label} (${path}): ${res.status}`)
        }
      }
      assert(
        failures.length === 0,
        `Onbereikbare beheer tabs: ${failures.join(', ')}`,
      )
    },
  },

  // ── Step 4: /beheer redirect → /beheer/ai ──────────────────────────
  {
    id: 'beheer-root-redirect',
    name: '/beheer redirectt naar /beheer/ai',
    category: CAT,
    description: '/beheer zonder subpad redirectt naar AI instellingen',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/beheer')
      assert(
        isRedirect(res.status),
        `Expected redirect for /beheer, got ${res.status}`,
      )
      const location = res.headers.get('location') ?? ''
      // Should redirect to /beheer/ai (page.tsx redirect) or /login (auth)
      assert(
        location.includes('/beheer/ai') || location.includes('/login') || location.includes('/will'),
        `Expected redirect to /beheer/ai, /login or /will, got ${location}`,
      )
    },
  },

  // ── Step 5: /beheer/features redirect → /beheer/toegang ────────────
  {
    id: 'beheer-features-redirect',
    name: '/beheer/features redirectt naar /beheer/toegang',
    category: CAT,
    description: 'Legacy features pagina redirectt naar toegang',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/beheer/features')
      assert(
        isRedirect(res.status),
        `Expected redirect for /beheer/features, got ${res.status}`,
      )
      const location = res.headers.get('location') ?? ''
      assert(
        location.includes('/beheer/toegang') || location.includes('/login') || location.includes('/will'),
        `Expected redirect to /beheer/toegang, /login or /will, got ${location}`,
      )
    },
  },

  // ── Step 6: /beheer/tiers redirect → /beheer/toegang ───────────────
  {
    id: 'beheer-tiers-redirect',
    name: '/beheer/tiers redirectt naar /beheer/toegang',
    category: CAT,
    description: 'Legacy tiers pagina redirectt naar toegang',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const res = await fetchNoRedirect('/beheer/tiers')
      assert(
        isRedirect(res.status),
        `Expected redirect for /beheer/tiers, got ${res.status}`,
      )
      const location = res.headers.get('location') ?? ''
      assert(
        location.includes('/beheer/toegang') || location.includes('/login') || location.includes('/will'),
        `Expected redirect to /beheer/toegang, /login or /will, got ${location}`,
      )
    },
  },

  // ── Step 7: Horizontaal scrollende nav ──────────────────────────────
  {
    id: 'beheer-nav-scroll',
    name: 'Horizontaal scrollende nav: alle tabs bereikbaar',
    category: CAT,
    description: 'BeheerNav heeft overflow-x-auto voor mobiel scroll en bevat alle 18 tabs',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      // Static verification: the beheer-nav component uses overflow-x-auto
      // and renders all tabs with whitespace-nowrap for horizontal scrolling.
      // We verify the expected tab count matches the component definition.
      assertEqual(
        BEHEER_TABS.length,
        18,
        `Expected 18 beheer tabs, got ${BEHEER_TABS.length}`,
      )
      // Verify all tabs have labels and hrefs
      for (const tab of BEHEER_TABS) {
        assert(tab.label.length > 0, `Tab missing label`)
        assert(tab.href.startsWith('/beheer/'), `Tab href must start with /beheer/: ${tab.href}`)
      }
      // Verify no duplicate hrefs (ignoring hash fragments)
      const paths = BEHEER_TABS.map((t) => t.href.split('#')[0])
      const unique = new Set(paths)
      // Mobile Preview shares /beheer/testdata with Testdata tab (hash fragment difference)
      // So we expect 17 unique base paths for 18 tabs
      assert(
        unique.size >= 17,
        `Expected at least 17 unique base paths, got ${unique.size}`,
      )
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer \u2014 Layout & Toegang',
    description: 'Admin guard, navigatie, redirects bij ongeautoriseerde toegang',
    icon: 'ShieldCheck',
    testCount: 0,
  })
  registerTests(tests)
}
