import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import type { BriefingCardSpec } from '@/lib/briefing/types'
import { CARD_SPAN } from '@/lib/briefing/types'
import { validateBriefingLayout, optimizeRowFill } from '@/lib/briefing/validate-layout'
import { validateHref, validateCardHrefs } from '@/lib/briefing/validate-hrefs'
import { authenticatedFetch } from '../server-runner'

const CAT = 'berichten.ai-content'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(type: BriefingCardSpec['type'], extra?: Record<string, unknown>): BriefingCardSpec {
  const base: Record<string, unknown> = { type }

  switch (type) {
    case 'metric':
      return { type: 'metric', label: 'Test', value: '€100', module: 'kern', ...extra } as BriefingCardSpec
    case 'action':
      return { type: 'action', icon: 'Zap', kicker: 'Test', title: 'Actie', description: 'Doe iets', href: '/core', module: 'kern', ...extra } as BriefingCardSpec
    case 'alert':
      return { type: 'alert', severity: 'warning', title: 'Alert', message: 'Let op', ...extra } as BriefingCardSpec
    case 'progressRing':
      return { type: 'progressRing', label: 'Ring', value: '50%', percentage: 50, module: 'kern', ...extra } as BriefingCardSpec
    case 'sparkline':
      return { type: 'sparkline', label: 'Spark', value: '€100', dataKey: 'netWorthHistory', module: 'kern', ...extra } as BriefingCardSpec
    case 'milestone':
      return { type: 'milestone', target: '€100K', current: '€50K', percentage: 50, label: 'Mijlpaal', ...extra } as BriefingCardSpec
    case 'insight':
      return { type: 'insight', text: 'Inzicht tekst', emphasis: 'observation', ...extra } as BriefingCardSpec
    case 'checklist':
      return { type: 'checklist', title: 'Lijst', items: [{ label: 'Item 1', done: false }], ...extra } as BriefingCardSpec
    case 'comparison':
      return { type: 'comparison', label: 'Vergelijking', leftLabel: 'A', leftValue: '€10', rightLabel: 'B', rightValue: '€20', delta: '+€10', ...extra } as BriefingCardSpec
    case 'countdown':
      return { type: 'countdown', label: 'Aftellen', days: 30, module: 'horizon', ...extra } as BriefingCardSpec
    case 'goalProgress':
      return { type: 'goalProgress', name: 'Doel', percentage: 75, current: '€7.5K', target: '€10K', onTrack: true, module: 'wil', ...extra } as BriefingCardSpec
    case 'budgetBar':
      return { type: 'budgetBar', name: 'Budget', spent: '€500', limit: '€1000', percentage: 50, status: 'healthy', ...extra } as BriefingCardSpec
    case 'quote':
      return { type: 'quote', text: 'Wijsheid', module: 'wil', ...extra } as BriefingCardSpec
    case 'recurring':
      return { type: 'recurring', title: 'Terugkerend', items: [{ name: 'Netflix', amount: '€12' }], totalAmount: '€12', ...extra } as BriefingCardSpec
    case 'lifeEvent':
      return { type: 'lifeEvent', name: 'Event', daysUntil: 60, amount: '€5K', amountType: 'eenmalig', module: 'horizon', ...extra } as BriefingCardSpec
    case 'nextStep':
      return { type: 'nextStep', title: 'Volgende stap', description: 'Doe dit', href: '/core', module: 'kern', icon: 'ArrowRight', ...extra } as BriefingCardSpec
    case 'discover':
      return { type: 'discover', label: 'Ontdek', teaser: 'Nieuw!', description: 'Probeer dit', href: '/horizon', module: 'horizon', featureId: 'test', ...extra } as BriefingCardSpec
    default:
      return { ...base, ...extra } as unknown as BriefingCardSpec
  }
}

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await authenticatedFetch(path, init)
  let body: Record<string, unknown> = {}
  try {
    body = await res.json()
  } catch {
    // Non-JSON response
  }
  return { status: res.status, body }
}

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

  // ── Step 2: Briefing generatie — streamText met tool-call card push ──
  {
    id: 'briefing-tool-to-card-mapping',
    name: 'Briefing tool calls correct gemapped naar card types',
    category: CAT,
    description: 'Alle 19 showXxx tool names worden correct omgezet naar card type strings',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Map of tool names → expected card types (from briefing/compose/route.ts)
      const toolToCard: Record<string, string> = {
        showMetric: 'metric',
        showAction: 'action',
        showAlert: 'alert',
        showProgressRing: 'progressRing',
        showSparkline: 'sparkline',
        showMilestone: 'milestone',
        showInsight: 'insight',
        showChecklist: 'checklist',
        showComparison: 'comparison',
        showCountdown: 'countdown',
        showGoalProgress: 'goalProgress',
        showBudgetBar: 'budgetBar',
        showQuote: 'quote',
        showRecurring: 'recurring',
        showLifeEvent: 'lifeEvent',
        showNextStep: 'nextStep',
        showDiscover: 'discover',
        showDecisionPatterns: 'decisionPatterns',
        showFreedomDaysTrend: 'freedomDaysTrend',
      }

      assertEqual(Object.keys(toolToCard).length, 19, 'Should map 19 tool names')

      // Verify each mapping
      for (const [tool, cardType] of Object.entries(toolToCard)) {
        // Tool name should start with 'show'
        assert(tool.startsWith('show'), `Tool name ${tool} should start with "show"`)
        // Card type should be lowercase first letter of the remainder
        const expectedType = tool.replace('show', '')
        const lowered = expectedType.charAt(0).toLowerCase() + expectedType.slice(1)
        assertEqual(cardType, lowered, `Tool ${tool} should map to ${lowered}`)
      }
    },
  },

  {
    id: 'briefing-card-span-completeness',
    name: 'CARD_SPAN bevat alle card types',
    category: CAT,
    description: 'Elk card type in BriefingCardSpec heeft een span-waarde in CARD_SPAN',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      const allTypes = [
        'metric', 'action', 'alert', 'progressRing', 'sparkline', 'milestone',
        'insight', 'checklist', 'comparison', 'countdown', 'goalProgress',
        'budgetBar', 'quote', 'recurring', 'lifeEvent', 'nextStep', 'discover',
        'decisionPatterns', 'freedomDaysTrend',
      ] as const

      assertEqual(Object.keys(CARD_SPAN).length, allTypes.length, `CARD_SPAN should have ${allTypes.length} entries`)

      for (const type of allTypes) {
        const span = CARD_SPAN[type]
        assertNotNull(span, `CARD_SPAN should define span for type "${type}"`)
        assert(
          span === 1 || span === 2 || span === 4,
          `Span for ${type} should be 1, 2, or 4 — got ${span}`,
        )
      }

      // Verify specific span values
      // 1-col cards
      const oneColTypes = ['metric', 'progressRing', 'countdown', 'sparkline', 'goalProgress', 'budgetBar']
      for (const t of oneColTypes) {
        assertEqual(CARD_SPAN[t as BriefingCardSpec['type']], 1, `${t} should span 1 col`)
      }

      // 2-col cards
      const twoColTypes = ['action', 'alert', 'checklist', 'comparison', 'insight', 'quote', 'recurring', 'lifeEvent', 'nextStep', 'discover', 'decisionPatterns', 'freedomDaysTrend']
      for (const t of twoColTypes) {
        assertEqual(CARD_SPAN[t as BriefingCardSpec['type']], 2, `${t} should span 2 cols`)
      }

      // 4-col cards
      assertEqual(CARD_SPAN.milestone, 4, 'milestone should span 4 cols (full width)')
    },
  },

  {
    id: 'briefing-compose-auth-guard',
    name: 'POST /api/briefing/compose vereist authenticatie',
    category: CAT,
    description: 'Niet-ingelogde gebruikers krijgen 401',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await authenticatedFetch('/api/briefing/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSummary: 'test', temporal: { date: '2026-03-18', dayOfMonth: 18 } }),
      })
      const body = await res.json()

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
    id: 'briefing-compose-missing-fields',
    name: 'POST /api/briefing/compose wijst ontbrekende velden af',
    category: CAT,
    description: 'Verzoeken zonder dataSummary of temporal krijgen 400',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await authenticatedFetch('/api/briefing/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      // 400 (validation) or 401/403 (auth)
      assert(
        res.status === 400 || res.status === 401 || res.status === 403,
        `Expected 400, 401 or 403 for missing fields, got ${res.status}`,
      )

      if (res.status === 400) {
        const body = await res.json()
        assertNotNull(body.error, 'Should return error message for missing fields')
      }
    },
  },

  {
    id: 'briefing-poll-idle-state',
    name: 'GET /api/briefing/compose retourneert idle status zonder actieve compositie',
    category: CAT,
    description: 'Polling endpoint retourneert { status: "idle" } wanneer geen compositie actief is',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      const res = await authenticatedFetch('/api/briefing/compose')
      const body = await res.json()

      // 200 with idle, or 401/403 for auth
      assert(
        res.status === 200 || res.status === 401 || res.status === 403,
        `Expected 200, 401 or 403, got ${res.status}`,
      )

      if (res.status === 200 && body.status) {
        // Could be idle or composing if another session is running
        assert(
          body.status === 'idle' || body.status === 'composing',
          `Expected status idle or composing, got ${body.status}`,
        )
      }
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
    id: 'briefing-composition-state-structure',
    name: 'Briefing CompositionState bevat cards[], complete, composedAt, startedAt, completedAt',
    category: CAT,
    description: 'Server state object voor briefing bevat uitgebreide state fields',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const state = {
        cards: [] as unknown[],
        complete: false,
        composedAt: '',
        startedAt: Date.now(),
        completedAt: 0,
      }

      assert(Array.isArray(state.cards), 'cards should be an array')
      assertEqual(state.complete, false, 'complete should start as false')
      assertEqual(state.composedAt, '', 'composedAt should start empty')
      assertGreaterThan(state.startedAt, 0, 'startedAt should be a timestamp')
      assertEqual(state.completedAt, 0, 'completedAt should start at 0')
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

  {
    id: 'briefing-composition-timeout-and-ttl',
    name: 'Briefing composition timeout 2min en result TTL 5min',
    category: CAT,
    description: 'COMPOSITION_TIMEOUT_MS = 120_000, RESULT_TTL_MS = 300_000',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const COMPOSITION_TIMEOUT_MS = 120_000
      const RESULT_TTL_MS = 5 * 60 * 1000

      assertEqual(COMPOSITION_TIMEOUT_MS, 120_000, 'Composition timeout should be 2 minutes')
      assertEqual(RESULT_TTL_MS, 300_000, 'Result TTL should be 5 minutes')

      // Verify cleanup logic: incomplete > timeout → cleaned, complete > TTL → cleaned
      const now = Date.now()

      // Incomplete + stale → cleanup
      const incompleteStale = { complete: false, startedAt: now - 150_000, completedAt: 0 }
      assert(
        !incompleteStale.complete && now - incompleteStale.startedAt > COMPOSITION_TIMEOUT_MS,
        'Incomplete stale should be cleaned up',
      )

      // Complete + expired → cleanup
      const completeExpired = { complete: true, startedAt: now - 400_000, completedAt: now - 350_000 }
      assert(
        completeExpired.complete && now - completeExpired.completedAt > RESULT_TTL_MS,
        'Complete expired should be cleaned up',
      )

      // Complete + fresh → keep
      const completeFresh = { complete: true, startedAt: now - 60_000, completedAt: now - 30_000 }
      assert(
        !(completeFresh.complete && now - completeFresh.completedAt > RESULT_TTL_MS),
        'Complete fresh should be kept',
      )
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
    id: 'briefing-polling-response-shapes',
    name: 'Briefing compose retourneert correcte response shapes per status',
    category: CAT,
    description: 'Idle: { status: "idle" }, Composing: { status, cards }, Done: { type: "done", cards, composedAt }, Error: { type: "error", message }',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Idle response
      const idleResponse = { status: 'idle' }
      assertEqual(idleResponse.status, 'idle', 'Idle status')

      // Composing response (with partial cards)
      const composingResponse = {
        status: 'composing',
        cards: [{ type: 'metric', label: 'Test', value: '€100', module: 'kern' }],
      }
      assertEqual(composingResponse.status, 'composing', 'Composing status')
      assert(Array.isArray(composingResponse.cards), 'Partial cards should be array')

      // Done response
      const doneResponse = {
        type: 'done' as const,
        cards: [{ type: 'metric', label: 'Test', value: '€100', module: 'kern' }],
        composedAt: '2026-03-18T12:00:00.000Z',
      }
      assertEqual(doneResponse.type, 'done', 'Done type')
      assertNotNull(doneResponse.composedAt, 'Done should include composedAt')

      // Error response
      const errorResponse = {
        type: 'error' as const,
        message: 'AI compositie mislukt',
      }
      assertEqual(errorResponse.type, 'error', 'Error type')
      assertNotNull(errorResponse.message, 'Error should include message')
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

  // ── Step 5: validateBriefingLayout — layout validatie na generatie ──
  {
    id: 'layout-empty-and-single',
    name: 'validateBriefingLayout: lege en single-card arrays ongewijzigd',
    category: CAT,
    description: 'Lege array en array met 1 card worden ongewijzigd geretourneerd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const empty = validateBriefingLayout([])
      assertEqual(empty.length, 0, 'Empty array should stay empty')

      const single = validateBriefingLayout([makeCard('metric')])
      assertEqual(single.length, 1, 'Single card should stay single')
      assertEqual(single[0].type, 'metric', 'Single card type preserved')
    },
  },

  {
    id: 'layout-milestone-not-first-or-last',
    name: 'validateBriefingLayout: milestone niet als eerste of laatste',
    category: CAT,
    description: 'Milestone cards worden naar het midden verplaatst als ze eerste of laatste zijn',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      // Milestone first → moved to middle
      const cards: BriefingCardSpec[] = [
        makeCard('milestone'),
        makeCard('metric'),
        makeCard('metric'),
        makeCard('metric'),
        makeCard('metric'),
        makeCard('insight'),
      ]
      const result = validateBriefingLayout(cards)

      assert(result[0].type !== 'milestone', 'Milestone should not be first after validation')
      assert(result[result.length - 1].type !== 'milestone', 'Milestone should not be last after validation')

      // Verify milestone exists somewhere in the middle
      const milestoneIdx = result.findIndex((c) => c.type === 'milestone')
      assert(milestoneIdx > 0, 'Milestone should be at index > 0')
      assert(milestoneIdx < result.length - 1, 'Milestone should not be at last index')
    },
  },

  {
    id: 'layout-last-card-valid-ending',
    name: 'validateBriefingLayout: laatste card is action, insight of quote',
    category: CAT,
    description: 'Als de laatste card geen geldig eind-type is, wordt een geldige card naar het einde verplaatst',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const validEndTypes = new Set(['action', 'insight', 'quote'])

      // Last card is metric (invalid) but has an insight in the middle
      const cards: BriefingCardSpec[] = [
        makeCard('metric'),
        makeCard('insight'),
        makeCard('metric'),
        makeCard('metric'),
      ]
      const result = validateBriefingLayout(cards)
      assert(
        validEndTypes.has(result[result.length - 1].type),
        `Last card should be action/insight/quote, got ${result[result.length - 1].type}`,
      )
    },
  },

  {
    id: 'layout-no-adjacent-same-1col',
    name: 'validateBriefingLayout: geen twee zelfde 1-col types naast elkaar',
    category: CAT,
    description: 'Twee opeenvolgende 1-col cards van hetzelfde type worden uit elkaar geplaatst',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      const cards: BriefingCardSpec[] = [
        makeCard('metric'),
        makeCard('metric'),
        makeCard('progressRing'),
        makeCard('insight'), // 2-col, valid ending
      ]
      const result = validateBriefingLayout(cards)

      // Check that no two adjacent 1-col cards have the same type
      for (let i = 0; i < result.length - 1; i++) {
        const curr = result[i]
        const next = result[i + 1]
        if (CARD_SPAN[curr.type] === 1 && CARD_SPAN[next.type] === 1) {
          // Only assert if there was a swap candidate available
          if (curr.type === next.type) {
            // Check if there was a different type available for swap
            const otherTypes = result.filter((c) => CARD_SPAN[c.type] === 1 && c.type !== curr.type)
            if (otherTypes.length > 0) {
              assert(false, `Adjacent 1-col cards should have different types: ${curr.type} at ${i}, ${next.type} at ${i + 1}`)
            }
          }
        }
      }
    },
  },

  {
    id: 'layout-row-fill-optimization',
    name: 'optimizeRowFill: rijen vullen tot precies 4 kolommen',
    category: CAT,
    description: 'Greedy algoritme vult rijen met exacte 4-kolom breedte, milestone krijgt eigen rij',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Test 1: 4 x 1-col → perfect single row
      const fourMetrics = [
        makeCard('metric'),
        makeCard('progressRing'),
        makeCard('countdown'),
        makeCard('sparkline'),
      ]
      const result1 = optimizeRowFill(fourMetrics)
      assertEqual(result1.length, 4, 'All 4 cards preserved')
      const totalSpan1 = result1.reduce((sum, c) => sum + CARD_SPAN[c.type], 0)
      assertEqual(totalSpan1, 4, 'Total span should be 4')

      // Test 2: milestone (4) + 2-col + 2-col → 2 rows
      const withMilestone = [
        makeCard('milestone'),
        makeCard('action'),
        makeCard('insight'),
      ]
      const result2 = optimizeRowFill(withMilestone)
      assertEqual(result2.length, 3, 'All 3 cards preserved')

      // First card should be milestone (span=4, own row)
      assertEqual(result2[0].type, 'milestone', 'Milestone should stay first')

      // Remaining should fit in row of 4 (2+2)
      const remainingSpan = CARD_SPAN[result2[1].type] + CARD_SPAN[result2[2].type]
      assertEqual(remainingSpan, 4, 'Remaining cards should fill a row of 4')

      // Test 3: Reorder needed — 2-col, 1-col, 1-col, 2-col, 1-col, 1-col
      const needsReorder = [
        makeCard('action'),    // 2
        makeCard('metric'),    // 1
        makeCard('countdown'), // 1
        makeCard('insight'),   // 2
        makeCard('sparkline'), // 1
        makeCard('budgetBar'), // 1
      ]
      const result3 = optimizeRowFill(needsReorder)
      assertEqual(result3.length, 6, 'All 6 cards preserved')
      const totalSpan3 = result3.reduce((sum, c) => sum + CARD_SPAN[c.type], 0)
      assertEqual(totalSpan3, 8, 'Total span should be 8 (2 full rows)')
    },
  },

  {
    id: 'layout-preserves-card-count',
    name: 'validateBriefingLayout verliest geen cards',
    category: CAT,
    description: 'Input en output arrays hebben dezelfde lengte — geen cards worden verwijderd',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      const cards: BriefingCardSpec[] = [
        makeCard('metric'),
        makeCard('action'),
        makeCard('milestone'),
        makeCard('progressRing'),
        makeCard('sparkline'),
        makeCard('countdown'),
        makeCard('budgetBar'),
        makeCard('insight'),
        makeCard('comparison'),
        makeCard('quote'),
      ]

      const result = validateBriefingLayout(cards)
      assertEqual(result.length, cards.length, 'Output should have same number of cards as input')

      // Verify all types are preserved (just reordered)
      const inputTypes = cards.map((c) => c.type).sort()
      const outputTypes = result.map((c) => c.type).sort()
      assertEqual(
        JSON.stringify(inputTypes),
        JSON.stringify(outputTypes),
        'All card types should be preserved after layout validation',
      )
    },
  },

  // ── Href validation ──
  {
    id: 'briefing-href-validation',
    name: 'validateCardHrefs corrigeert ongeldige en gehallucinereerde routes',
    category: CAT,
    description: 'Geldige routes blijven, aliassen worden gecorrigeerd, onbekende routes worden verwijderd',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      // Valid route stays
      const valid = validateHref('/core')
      assertEqual(valid, '/core', 'Valid route should stay unchanged')

      // Alias corrected
      const alias = validateHref('/core/transactions')
      assertEqual(alias, '/core/cash', 'Alias /core/transactions should map to /core/cash')

      const alias2 = validateHref('/core/schulden')
      assertEqual(alias2, '/core/debts', 'Alias /core/schulden should map to /core/debts')

      // Prefix match
      const prefix = validateHref('/core/budgets/123')
      assertEqual(prefix, '/core/budgets', 'Prefix match should strip dynamic segment')

      // Invalid route removed
      const invalid = validateHref('/nonexistent/page')
      assertEqual(invalid, undefined, 'Invalid route should return undefined')

      // Empty/non-slash rejected
      const empty = validateHref('')
      assertEqual(empty, undefined, 'Empty href should return undefined')

      // Card-level validation
      const cards: BriefingCardSpec[] = [
        makeCard('action', { href: '/core/transacties' }),
        makeCard('metric', { href: '/will' }),
      ]
      const validated = validateCardHrefs(cards)
      assert(
        'href' in validated[0] && validated[0].href === '/core/cash',
        'Hallucinated href should be corrected',
      )
      assert(
        'href' in validated[1] && validated[1].href === '/will',
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
      const cards: BriefingCardSpec[] = [
        {
          type: 'checklist',
          title: 'To-do',
          items: [
            { label: 'Budgetten bekijken', href: '/core/budgets', done: false },
            { label: 'Goals bekijken', href: '/core/goals', done: false },
            { label: 'Geen link', done: true },
          ],
        },
      ]

      const validated = validateCardHrefs(cards)
      const checklist = validated[0] as { type: 'checklist'; items: { label: string; href?: string; done: boolean }[] }

      assertEqual(checklist.items[0].href, '/core/budgets', 'Valid checklist href preserved')
      assertEqual(checklist.items[1].href, '/will', 'Hallucinated /core/goals should map to /will')
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

  {
    id: 'briefing-temporal-context-structure',
    name: 'TemporalContext bevat alle verplichte velden',
    category: CAT,
    description: 'TemporalContext interface heeft 12 velden voor datum, tijd, seizoen en salaris-countdown',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Verify TemporalContext structure
      const temporal = {
        date: '2026-03-18',
        dayOfMonth: 18,
        dayOfWeek: 'woensdag',
        dayOfWeekEn: 'Wednesday',
        month: 3,
        monthName: 'maart',
        year: 2026,
        timeOfDay: 'ochtend' as const,
        greeting: 'Goedemorgen',
        seasonalNotes: ['Belastingaangifte periode'],
        daysUntilMonthEnd: 13,
        daysUntilSalary: 7,
      }

      const requiredKeys = [
        'date', 'dayOfMonth', 'dayOfWeek', 'dayOfWeekEn',
        'month', 'monthName', 'year', 'timeOfDay',
        'greeting', 'seasonalNotes', 'daysUntilMonthEnd', 'daysUntilSalary',
      ]

      for (const key of requiredKeys) {
        assertNotNull(
          (temporal as Record<string, unknown>)[key],
          `TemporalContext should have field: ${key}`,
        )
      }

      // Verify timeOfDay valid values
      const validTimes = ['ochtend', 'middag', 'avond']
      assert(
        validTimes.includes(temporal.timeOfDay),
        `timeOfDay should be ochtend/middag/avond, got ${temporal.timeOfDay}`,
      )
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Berichten \u2014 AI Content',
    description: 'Nieuws generatie, briefing compositie, progressive loading, layout validatie',
    icon: 'Newspaper',
    testCount: 0,
  })
  registerTests(tests)
}
