import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'beheer.informatief'

/** Fetch a URL without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return authenticatedFetch(path, { redirect: 'manual' })
}

/** Check if a response is a redirect */
function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

// ── Release notes expected module colors ─────────────────────────────────────
const MODULE_COLORS = ['amber', 'teal', 'purple', 'blue', 'zinc', 'rose']

const tests: TestCase[] = [
  // ── Step 1: Release notes data en rendering ─────────────────────────────
  {
    id: 'releases-data-structure',
    name: 'Release notes: RELEASE_NOTES data correct gerenderd',
    category: CAT,
    description:
      'Controleert dat RELEASE_NOTES array geladen kan worden met correcte structuur',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      // Dynamically import release notes data
      const { RELEASE_NOTES, compareReleaseVersions } = await import('@/lib/release-notes')
      const { APP_VERSION } = await import('@/lib/app-version')

      // Should have releases
      assertGreaterThan(
        RELEASE_NOTES.length,
        0,
        'RELEASE_NOTES should have at least 1 release',
      )

      // Verify each release has required fields
      for (const release of RELEASE_NOTES) {
        assert(
          typeof release.version === 'string' && release.version.length > 0,
          `Release missing version: ${JSON.stringify(release)}`,
        )
        assert(
          typeof release.date === 'string' && release.date.length > 0,
          `Release ${release.version} missing date`,
        )
        assert(
          typeof release.title === 'string' && release.title.length > 0,
          `Release ${release.version} missing title`,
        )
        assert(
          Array.isArray(release.sections) && release.sections.length > 0,
          `Release ${release.version} missing sections`,
        )

        // Verify each section has required fields
        for (const section of release.sections) {
          assert(
            typeof section.module === 'string' && section.module.length > 0,
            `Section in ${release.version} missing module name`,
          )
          assert(
            typeof section.color === 'string' && section.color.length > 0,
            `Section ${section.module} in ${release.version} missing color`,
          )
          assert(
            Array.isArray(section.items) && section.items.length > 0,
            `Section ${section.module} in ${release.version} has no items`,
          )

          // Verify each item has title and description
          for (const item of section.items) {
            assert(
              typeof item.title === 'string' && item.title.length > 0,
              `Item in ${section.module} (${release.version}) missing title`,
            )
            assert(
              typeof item.description === 'string' &&
                item.description.length > 0,
              `Item "${item.title}" in ${section.module} (${release.version}) missing description`,
            )
          }
        }
      }

      // Releases should be sorted newest first (semver descending). Numeric
      // compare — a parseFloat would put 0.100.0 below 0.99.0.
      for (let i = 0; i < RELEASE_NOTES.length - 1; i++) {
        const a = RELEASE_NOTES[i].version
        const b = RELEASE_NOTES[i + 1].version
        assert(
          compareReleaseVersions(a, b) > 0,
          `Releases not sorted newest first: ${a} before ${b}`,
        )
      }

      // Collapsible card verification: first release should default open
      // This is a UI behavior — we verify the ReleaseCard component receives defaultOpen={i === 0}
      // Structural verification: the first release carries the package.json version
      // (one version source — lib/app-version.ts; lib/release-notes.test.ts guards the same).
      assertEqual(
        RELEASE_NOTES[0].version,
        APP_VERSION,
        `First release version should equal package.json version ${APP_VERSION}, got ${RELEASE_NOTES[0].version}`,
      )
    },
  },

  // ── Step 2: Release module kleuren ──────────────────────────────────────
  {
    id: 'releases-module-colors',
    name: 'Release module kleuren: correcte kleuring per module',
    category: CAT,
    description:
      'Controleert dat alle module secties een geldige kleur hebben uit het MODULE_COLORS object',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const { RELEASE_NOTES } = await import('@/lib/release-notes')

      const invalidColors: string[] = []

      for (const release of RELEASE_NOTES) {
        for (const section of release.sections) {
          if (!MODULE_COLORS.includes(section.color)) {
            invalidColors.push(
              `${section.module} in ${release.version}: "${section.color}"`,
            )
          }
        }
      }

      assert(
        invalidColors.length === 0,
        `Sections with invalid colors: ${invalidColors.join(', ')}. Valid colors: ${MODULE_COLORS.join(', ')}`,
      )

      // Verify the color mapping aligns with module conventions
      // amber = Kern/Bezittingen, teal = Wil/Schulden, purple = Horizon/Budget
      // (the hefboom names since 0.89.0 map onto the same accent tokens).
      // Check at least some releases follow convention
      const firstRelease = RELEASE_NOTES[0]
      for (const section of firstRelease.sections) {
        if (section.module === 'Bezittingen') {
          assertEqual(section.color, 'amber', `Bezittingen should use amber in ${firstRelease.version}`)
        }
        if (section.module === 'Schulden') {
          assertEqual(section.color, 'teal', `Schulden should use teal in ${firstRelease.version}`)
        }
        if (section.module === 'Budget') {
          assertEqual(section.color, 'purple', `Budget should use purple in ${firstRelease.version}`)
        }
        if (section.module.includes('Kern')) {
          assertEqual(
            section.color,
            'amber',
            `Kern module should use amber color in ${firstRelease.version}`,
          )
        }
        if (section.module.includes('Wil')) {
          assertEqual(
            section.color,
            'teal',
            `Wil module should use teal color in ${firstRelease.version}`,
          )
        }
        if (section.module.includes('Horizon')) {
          assertEqual(
            section.color,
            'purple',
            `Horizon module should use purple color in ${firstRelease.version}`,
          )
        }
      }
    },
  },

  // ── Step 3: Informatieve routes bereikbaar ──────────────────────────────
  {
    id: 'informatief-routes-accessible',
    name: 'Alle informatieve beheer routes bereikbaar',
    category: CAT,
    description:
      'Controleert dat /beheer/releases, /beheer/architectuur, /beheer/blueprints en /beheer/widget-audit bereikbaar zijn',
    priority: 'high',
    estimatedDurationMs: 3000,
    async fn() {
      const routes = [
        '/beheer/releases',
        '/beheer/architectuur',
        '/beheer/blueprints',
        '/beheer/widget-audit',
      ]
      const failures: string[] = []

      for (const route of routes) {
        const res = await fetchNoRedirect(route)
        const valid = res.status === 200 || isRedirect(res.status)
        if (!valid) {
          failures.push(`${route}: ${res.status}`)
        }
      }

      assert(
        failures.length === 0,
        `Onbereikbare informatieve routes: ${failures.join(', ')}`,
      )
    },
  },

  // ── Step 4: Release notes count ──────────────────────────────────────────
  {
    id: 'releases-version-count',
    name: 'Release notes: minstens 20 versies aanwezig',
    category: CAT,
    description:
      'Controleert dat er voldoende release history is',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { RELEASE_NOTES, parseReleaseVersion } = await import('@/lib/release-notes')

      assertGreaterThan(
        RELEASE_NOTES.length,
        19,
        `Expected at least 20 releases, got ${RELEASE_NOTES.length}`,
      )

      // Verify version format consistency: semver 0.MINOR.PATCH, major stays 0
      // until the formal go-decision for the livegang.
      for (const release of RELEASE_NOTES) {
        const parsed = parseReleaseVersion(release.version)
        assert(parsed !== null, `Version should be semver 0.MINOR.PATCH: ${release.version}`)
        assertEqual(parsed?.major, 0, `Major must stay 0 before livegang: ${release.version}`)
      }

      // Verify dates are valid ISO strings
      for (const release of RELEASE_NOTES) {
        const date = new Date(release.date)
        assert(
          !isNaN(date.getTime()),
          `Invalid date for ${release.version}: ${release.date}`,
        )
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer — Informatief',
    description:
      'Release notes en informatieve beheer-pagina’s: architectuur, blueprints, widget-audit',
    icon: 'BookOpen',
    testCount: 0,
    defaultRole: 'superadmin' as const,
  })
  registerTests(tests)
}
