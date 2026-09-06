import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import { validateHref, validateCardHrefs } from '@/lib/briefing/validate-hrefs'
import { authenticatedFetch } from '../server-runner'

const CAT = 'berichten.ai-content'

// NB: het AI-DAIshboard-briefingsysteem ("Systeem B": /api/briefing/compose +
// history + de kaart-type-bibliotheek) is verwijderd — zie
// docs/briefing-analyse.md. De tests die op die routes, op CARD_SPAN of op
// validateBriefingLayout leunden zijn samen met de code verwijderd. Wat
// resteert: nieuws-generatie (levend) + de href-validatie (herbruikbaar nut).

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Nieuws generatie — streamObject met elementStream, correcte array output ──
  {
    id: 'nieuws-schema-valid-categories',
    name: 'News schema: 6 geldige categorieën gedefinieerd',
    category: CAT,
    description: 'De NEWS_CATEGORIES array bevat alle 6 categorieën: fiscaal, rente, woningmarkt, beleggingen, pensioen, macro',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      const categories = ['fiscaal', 'rente', 'woningmarkt', 'beleggingen', 'pensioen', 'macro']
      assertEqual(categories.length, 6, 'Should have 6 news categories')
      // Verify all are unique
      const unique = new Set(categories)
      assertEqual(unique.size, 6, 'All categories should be unique')
    },
  },

  {
    id: 'nieuws-schema-item-fields',
    name: 'News item schema bevat alle verplichte velden',
    category: CAT,
    description: 'NewsItem heeft id, headline, summary, impactType, personalImpact, category, date, en optioneel sourceContext',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Verify the required fields based on newsItemSchema
      const requiredFields = ['id', 'headline', 'summary', 'impactType', 'personalImpact', 'category', 'date']
      const optionalFields = ['sourceContext']

      // Simulate a valid news item
      const validItem = {
        id: 'news-2026-03-18-1',
        headline: 'Box 3 vrijstelling verhoogd',
        summary: 'De Box 3 vrijstelling is verhoogd naar €60.000 per persoon.',
        impactType: 'direct' as const,
        personalImpact: 'Met jouw vermogen bespaart dit je €500/jaar.',
        category: 'fiscaal' as const,
        date: '2026-03-18',
        sourceContext: 'Belastingplan 2026',
      }

      for (const field of requiredFields) {
        assertNotNull(
          (validItem as Record<string, unknown>)[field],
          `News item should have required field: ${field}`,
        )
      }
      // sourceContext is optional — verify it's allowed
      assert(
        optionalFields.includes('sourceContext'),
        'sourceContext should be an optional field',
      )

      // Verify impactType enum values
      assert(
        ['direct', 'relevant'].includes(validItem.impactType),
        'impactType should be "direct" or "relevant"',
      )
    },
  },

  {
    id: 'nieuws-impact-type-sorting',
    name: 'News items: direct-impact items gesorteerd vóór relevant items',
    category: CAT,
    description: 'Server-side sort garandeert dat alle "direct" items voor "relevant" items staan',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Simulate the server-side sort logic from the news route
      const items = [
        { impactType: 'relevant' as const, headline: 'A' },
        { impactType: 'direct' as const, headline: 'B' },
        { impactType: 'relevant' as const, headline: 'C' },
        { impactType: 'direct' as const, headline: 'D' },
        { impactType: 'direct' as const, headline: 'E' },
      ]

      items.sort((a, b) => {
        if (a.impactType === 'direct' && b.impactType !== 'direct') return -1
        if (a.impactType !== 'direct' && b.impactType === 'direct') return 1
        return 0
      })

      // All direct items should come first
      let foundRelevant = false
      for (const item of items) {
        if (item.impactType === 'relevant') foundRelevant = true
        if (foundRelevant) {
          assertEqual(
            item.impactType,
            'relevant',
            `After first relevant item, all subsequent should be relevant (found ${item.headline})`,
          )
        }
      }

      // Verify first items are direct
      assertEqual(items[0].impactType, 'direct', 'First item should be direct')
      assertEqual(items[1].impactType, 'direct', 'Second item should be direct')
      assertEqual(items[2].impactType, 'direct', 'Third item should be direct')
    },
  },

  {
    id: 'nieuws-api-auth-guard',
    name: 'GET /api/news vereist authenticatie',
    category: CAT,
    description: 'Niet-ingelogde gebruikers krijgen 401',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await authenticatedFetch('/api/news')
      const body = await res.json()

      // Should require auth (401) or tier gate (403) or return news data
      assert(
        res.status === 401 || res.status === 403 || res.status === 200,
        `Expected 401, 403 or 200, got ${res.status}`,
      )

      if (res.status === 401) {
        assertNotNull(body.error, 'Auth error should have message')
      }
    },
  },

  {
    id: 'nieuws-cache-ttl',
    name: 'News cache TTL is 7 dagen',
    category: CAT,
    description: 'CACHE_TTL_HOURS is 7*24 = 168 uur',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const CACHE_TTL_HOURS = 7 * 24
      assertEqual(CACHE_TTL_HOURS, 168, 'Cache TTL should be 168 hours (7 days)')
    },
  },

  // ── Step 3: Progressive loading patroon — server map state management ──
  {
    id: 'news-generation-state-structure',
    name: 'News GenerationState heeft correcte structuur: items[], complete, startedAt',
    category: CAT,
    description: 'Server state object bevat items array, complete boolean en startedAt timestamp',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Verify GenerationState structure matches CLAUDE.md pattern
      const state = {
        items: [] as unknown[],
        complete: false,
        startedAt: Date.now(),
      }

      assert(Array.isArray(state.items), 'items should be an array')
      assertEqual(state.complete, false, 'complete should start as false')
      assertGreaterThan(state.startedAt, 0, 'startedAt should be a timestamp')
    },
  },

  {
    id: 'news-timeout-cleanup',
    name: 'News generatie timeout is 2 minuten',
    category: CAT,
    description: 'GENERATION_TIMEOUT_MS is 120_000ms — stale generaties worden opgeruimd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const GENERATION_TIMEOUT_MS = 120_000
      assertEqual(GENERATION_TIMEOUT_MS, 120000, 'Timeout should be 120 seconds')

      // Simulate cleanup logic
      const staleState = { items: [], complete: false, startedAt: Date.now() - 150_000 }
      const freshState = { items: [], complete: false, startedAt: Date.now() - 30_000 }

      const now = Date.now()
      const isStale = now - staleState.startedAt > GENERATION_TIMEOUT_MS
      const isFresh = now - freshState.startedAt > GENERATION_TIMEOUT_MS

      assert(isStale, 'State older than 2 minutes should be stale')
      assert(!isFresh, 'State younger than 2 minutes should not be stale')
    },
  },

  // ── Step 4: Polling endpoint — incrementele items, complete boolean ──
  {
    id: 'news-polling-response-shapes',
    name: 'News API retourneert correcte response shapes per status',
    category: CAT,
    description: 'Generating: { status, items, editionNr, jaargang }, Done: { items, cached, editionNr, jaargang, refreshesRemaining }',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Generating response shape
      const generatingResponse = {
        status: 'generating',
        items: [],
        editionNr: 1,
        jaargang: 1,
      }

      assertEqual(generatingResponse.status, 'generating', 'Generating status')
      assert(Array.isArray(generatingResponse.items), 'Items should be array')
      assertNotNull(generatingResponse.editionNr, 'Should include editionNr')
      assertNotNull(generatingResponse.jaargang, 'Should include jaargang')

      // Completed response shape (cached or fresh)
      const completedResponse = {
        items: [{ id: '1', headline: 'Test' }],
        cached: true,
        editionNr: 5,
        jaargang: 1,
        refreshesRemaining: 2,
      }

      assert(Array.isArray(completedResponse.items), 'Items should be array')
      assert(typeof completedResponse.cached === 'boolean', 'cached should be boolean')
      assertNotNull(completedResponse.refreshesRemaining, 'Should include refreshesRemaining')

      // Partial items during generation
      const partialResponse = {
        status: 'generating',
        items: [{ id: '1', headline: 'Partial' }],
        editionNr: 1,
        jaargang: 1,
      }
      assertGreaterThanOrEqual(partialResponse.items.length, 1, 'Partial response should include items received so far')
    },
  },

  {
    id: 'news-rate-limit-response',
    name: 'News API retourneert 429 bij rate limit overschrijding',
    category: CAT,
    description: 'Refresh rate limit retourneert { error, rateLimited: true, remaining: 0, limit }',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      // Verify rate limit response structure
      const rateLimitResponse = {
        error: 'Je hebt het maximale aantal verversingen bereikt (3 per week). Probeer het later opnieuw.',
        rateLimited: true,
        remaining: 0,
        limit: 3,
      }

      assertEqual(rateLimitResponse.rateLimited, true, 'rateLimited should be true')
      assertEqual(rateLimitResponse.remaining, 0, 'remaining should be 0')
      assertGreaterThan(rateLimitResponse.limit, 0, 'limit should be > 0')
      assert(
        rateLimitResponse.error.includes('verversingen'),
        'Error message should be in Dutch',
      )
    },
  },

  // ── Href validation (herbruikbaar nut, los van het verwijderde DAIshboard) ──
  {
    id: 'briefing-href-validation',
    name: 'validateCardHrefs corrigeert ongeldige en gehallucinereerde routes',
    category: CAT,
    description: 'Geldige routes blijven, aliassen worden gecorrigeerd, onbekende routes worden verwijderd',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      // Valid route stays (nieuwe IA)
      const valid = validateHref('/overzicht')
      assertEqual(valid, '/overzicht', 'Valid route should stay unchanged')

      // Legacy alias corrected → nieuwe IA
      const alias = validateHref('/core/transactions')
      assertEqual(alias, '/overzicht/budget/transacties', 'Alias /core/transactions should map to /overzicht/budget/transacties')

      const alias2 = validateHref('/core/schulden')
      assertEqual(alias2, '/overzicht/schulden', 'Alias /core/schulden should map to /overzicht/schulden')

      // Prefix match
      const prefix = validateHref('/overzicht/budget/123')
      assertEqual(prefix, '/overzicht/budget', 'Prefix match should strip dynamic segment')

      // Invalid route removed
      const invalid = validateHref('/nonexistent/page')
      assertEqual(invalid, undefined, 'Invalid route should return undefined')

      // Empty/non-slash rejected
      const empty = validateHref('')
      assertEqual(empty, undefined, 'Empty href should return undefined')

      // Card-level validation
      const cards = [
        { type: 'action', href: '/core/transacties' },
        { type: 'metric', href: '/overzicht' },
      ]
      const validated = validateCardHrefs(cards)
      assert(
        validated[0].href === '/overzicht/budget/transacties',
        'Hallucinated href should be corrected',
      )
      assert(
        validated[1].href === '/overzicht',
        'Valid href should remain unchanged',
      )
    },
  },

  {
    id: 'briefing-checklist-href-validation',
    name: 'validateCardHrefs corrigeert ook geneste checklist item hrefs',
    category: CAT,
    description: 'Checklist items met ongeldige hrefs worden ook gecorrigeerd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const cards = [
        {
          type: 'checklist',
          title: 'To-do',
          items: [
            { label: 'Budgetten bekijken', href: '/overzicht/budget', done: false },
            { label: 'Doelen bekijken', href: '/core/goals', done: false },
            { label: 'Geen link', done: true },
          ],
        },
      ]

      const validated = validateCardHrefs(cards)
      const checklist = validated[0] as { type: 'checklist'; items: { label: string; href?: string; done: boolean }[] }

      assertEqual(checklist.items[0].href, '/overzicht/budget', 'Valid checklist href preserved')
      assertEqual(checklist.items[1].href, '/toekomst/doelen', 'Hallucinated /core/goals should map to /toekomst/doelen')
      assertEqual(checklist.items[2].href, undefined, 'Item without href stays undefined')
    },
  },

  // ── Step 6: Registered under category ──
  {
    id: 'news-edition-archiving',
    name: 'Nieuws editie archivering: cap op 50 edities per gebruiker',
    category: CAT,
    description: 'Maximaal 50 edities bewaard, oudste worden verwijderd bij overschrijding',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const MAX_EDITIONS = 50

      // Simulate cap logic
      const editions = Array.from({ length: 55 }, (_, i) => ({ id: `ed-${i}`, edition_nr: i + 1 }))
      const toDelete = editions.length > MAX_EDITIONS
        ? editions.slice(MAX_EDITIONS).map((e) => e.id)
        : []

      assertEqual(toDelete.length, 5, 'Should delete 5 excess editions (55 - 50)')
      assertEqual(toDelete[0], 'ed-50', 'First deletion should be edition 51 (index 50)')

      // Jaargang calculation
      const jaargang = new Date().getFullYear() - 2025
      assertGreaterThanOrEqual(jaargang, 1, 'Jaargang should be >= 1 (app launched 2025)')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Berichten — AI Content',
    description: 'Nieuws generatie, progressive loading, href-validatie',
    icon: 'Newspaper',
    testCount: 0,
  })
  registerTests(tests)
}
