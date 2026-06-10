import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'
import { BEHEER_GROUPS } from '@/lib/beheer-sections'

const CAT = 'beheer.layout'

// ── Alle beheer-tools uit de gedeelde sectie-config (lib/beheer-sections.ts) ──

const BEHEER_TOOLS = BEHEER_GROUPS.flatMap((group) => group.tools)

/** Fetch a URL without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return authenticatedFetch(path, { redirect: 'manual' })
}

/** Check if a response is a redirect */
function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

const tests: TestCase[] = [
  // ── Step 1a: Superadmin kan beheer benaderen ──────────────────────────
  {
    id: 'beheer-admin-accessible',
    name: 'Superadmin kan beheer benaderen',
    category: CAT,
    description: 'isSuperAdmin check: superadmin krijgt 200 op beheer paginas',
    priority: 'critical',
    estimatedDurationMs: 1000,
    requiredRole: 'superadmin',
    async fn() {
      const res = await fetchNoRedirect('/beheer/ai')
      assert(
        res.status === 200,
        `Expected 200 for superadmin on /beheer/ai, got ${res.status}`,
      )
    },
  },
  // ── Step 1b: Normale user heeft geen toegang ──────────────────────────
  {
    id: 'beheer-admin-only',
    name: 'Alleen super admin heeft toegang',
    category: CAT,
    description: 'isSuperAdmin check: gebruikers met role=user worden doorgestuurd',
    priority: 'critical',
    estimatedDurationMs: 3000,
    requiredRole: 'user',
    async fn() {
      // Test runner auto-switches to role='user'
      const res = await fetchNoRedirect('/beheer/ai')
      assert(
        isRedirect(res.status),
        `Expected redirect for /beheer/ai when role=user, got ${res.status}`,
      )
    },
  },

  // ── Step 2: Redirect bij niet-admin ──────────────────────────────────
  {
    id: 'beheer-redirect-non-admin',
    name: 'Redirect bij niet-admin weg van beheer',
    category: CAT,
    description: 'Niet-admin gebruikers worden weggestuurd van beheer-paginas',
    priority: 'critical',
    estimatedDurationMs: 3000,
    requiredRole: 'user',
    async fn() {
      // Test runner auto-switches to role='user'
      const res = await fetchNoRedirect('/beheer/testdata')
      assert(
        isRedirect(res.status),
        `Expected redirect for non-admin access to /beheer/testdata, got ${res.status}`,
      )
      const location = res.headers.get('location') ?? ''
      assert(
        location.includes('/overzicht') || location.includes('/will') || location.includes('/login'),
        `Expected redirect to /overzicht, /will or /login, got ${location}`,
      )
    },
  },

  // ── Step 3: Alle beheer-tools uit de sectie-config bereikbaar ─────────
  {
    id: 'beheer-nav-tabs-reachable',
    name: 'Alle beheer-tools zijn bereikbaar',
    category: CAT,
    description: 'Alle tools uit lib/beheer-sections.ts geven een redirect (auth) of 200',
    priority: 'critical',
    estimatedDurationMs: 5000,
    async fn() {
      const failures: string[] = []
      for (const tool of BEHEER_TOOLS) {
        const res = await fetchNoRedirect(tool.href)
        // Valid: 200 (admin logged in) or redirect (auth/admin check)
        // Invalid: 404, 500
        const valid = res.status === 200 || isRedirect(res.status)
        if (!valid) {
          failures.push(`${tool.label} (${tool.href}): ${res.status}`)
        }
      }
      assert(
        failures.length === 0,
        `Onbereikbare beheer tools: ${failures.join(', ')}`,
      )
    },
  },

  // ── Step 4: /beheer is de hub-startpagina ─────────────────────────────
  {
    id: 'beheer-root-hub',
    name: '/beheer toont de hub-startpagina',
    category: CAT,
    description: '/beheer rendert de startpagina met groepssecties (200), geen redirect meer naar /beheer/ai',
    priority: 'high',
    estimatedDurationMs: 1000,
    requiredRole: 'superadmin',
    async fn() {
      const res = await fetchNoRedirect('/beheer')
      assert(
        res.status === 200,
        `Expected 200 for /beheer hub as superadmin, got ${res.status}`,
      )
    },
  },

  // ── Step 5: Sectie-config structuur ───────────────────────────────────
  {
    id: 'beheer-sections-structure',
    name: 'Beheer-secties: 4 groepen met unieke routes',
    category: CAT,
    description: 'BEHEER_GROUPS heeft vier groepen in vaste volgorde; elke tool een label en unieke /beheer/-route',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(
        BEHEER_GROUPS.map((g) => g.id).join(','),
        'technisch,functioneel,test,info',
        'Groepsvolgorde moet technisch, functioneel, test, info zijn',
      )
      for (const group of BEHEER_GROUPS) {
        assert(group.tools.length > 0, `Groep ${group.id} heeft geen tools`)
      }
      for (const tool of BEHEER_TOOLS) {
        assert(tool.label.length > 0, 'Tool zonder label')
        assert(
          tool.href.startsWith('/beheer/'),
          `Tool href moet met /beheer/ beginnen: ${tool.href}`,
        )
      }
      const hrefs = BEHEER_TOOLS.map((t) => t.href)
      assertEqual(
        new Set(hrefs).size,
        hrefs.length,
        `Dubbele tool-routes in BEHEER_GROUPS: ${hrefs.filter((h, i) => hrefs.indexOf(h) !== i).join(', ')}`,
      )
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer — Layout & Toegang',
    description: 'Admin guard, hub-startpagina, groepsnavigatie, redirects bij ongeautoriseerde toegang',
    icon: 'ShieldCheck',
    testCount: 0,
  })
  registerTests(tests)
}
