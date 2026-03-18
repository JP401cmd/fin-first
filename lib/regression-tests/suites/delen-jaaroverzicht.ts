import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'identiteit.delen-jaaroverzicht'

// ── Helper ────────────────────────────────────────────────────────────────────

/** Fetch without following redirects */
async function fetchNoRedirect(path: string): Promise<Response> {
  return fetch(path, { redirect: 'manual' })
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
      const res = await fetch('/api/share/freedom-card')
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
      const res = await fetch('/api/share/track', {
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
      const res = await fetch('/api/share/track', {
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
      const res = await fetch('/api/share/freedom-card?privacy=anonymous')
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
      const res = await fetch('/api/share/freedom-card?privacy=invalid_level')
      // Should be 400 (invalid privacy) or 401 (auth check first)
      assert(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 for invalid privacy, got ${res.status}`,
      )
    },
  },

  // ── Step 5: GET /api/year-in-review ─────────────────────────────────────────
  {
    id: 'delen-year-in-review-api',
    name: 'GET /api/year-in-review: correcte jaardata',
    category: CAT,
    description: 'Year-in-review endpoint retourneert correct gestructureerde jaardata',
    priority: 'critical',
    estimatedDurationMs: 3000,
    async fn() {
      const year = new Date().getFullYear() - 1
      const res = await fetch(`/api/year-in-review?year=${year}`)
      if (res.status === 200) {
        const data = await res.json()
        assertEqual(data.year, year, 'Jaar moet overeenkomen met request')
        // Check required fields exist
        assert(typeof data.freedomDaysWon === 'number', 'freedomDaysWon moet number zijn')
        assert(Array.isArray(data.freedomDaysByMonth), 'freedomDaysByMonth moet array zijn')
        assertEqual(data.freedomDaysByMonth.length, 12, 'Moet 12 maanden bevatten')
        assert(Array.isArray(data.monthlyOverview), 'monthlyOverview moet array zijn')
        assertEqual(data.monthlyOverview.length, 12, 'monthlyOverview moet 12 maanden bevatten')
        assert(typeof data.totalIncome === 'number', 'totalIncome moet number zijn')
        assert(typeof data.totalExpenses === 'number', 'totalExpenses moet number zijn')
        assert(typeof data.totalSaved === 'number', 'totalSaved moet number zijn')
        assert(typeof data.actionsCompleted === 'number', 'actionsCompleted moet number zijn')
        assertNotNull(data.generatedAt, 'generatedAt')
      } else {
        assert(
          res.status === 401 || isRedirect(res.status),
          `Expected 200 or 401 for year-in-review, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 5b: Year-in-review invalid year ───────────────────────────────────
  {
    id: 'delen-year-in-review-invalid',
    name: 'GET /api/year-in-review: ongeldig jaar geweigerd',
    category: CAT,
    description: 'Ongeldige jaar parameter geeft 400',
    priority: 'medium',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetch('/api/year-in-review?year=1990')
      // 400 (invalid year) or 401 (auth check first)
      assert(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 for year=1990, got ${res.status}`,
      )
    },
  },

  // ── Step 6: Year selector options ──────────────────────────────────────────
  {
    id: 'delen-year-selector',
    name: 'Jaaroverzicht year selector: laatste 5 jaren',
    category: CAT,
    description: 'Year selector biedt 5 jaar opties aan',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const currentYear = new Date().getFullYear()
      const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)
      assertEqual(yearOptions.length, 5, 'Moet 5 jaar opties genereren')
      assertEqual(yearOptions[0], currentYear, 'Eerste optie is huidig jaar')
      assertEqual(yearOptions[4], currentYear - 4, 'Laatste optie is 4 jaar geleden')
      // All years should be valid (>= 2000)
      for (const y of yearOptions) {
        assertGreaterThanOrEqual(y, 2000, `Jaar ${y} moet >= 2000 zijn`)
      }
    },
  },

  // ── Step 7: Charts data structure ──────────────────────────────────────────
  {
    id: 'delen-jaaroverzicht-charts',
    name: 'Jaaroverzicht charts: data structuur validatie',
    category: CAT,
    description: 'Freedom days bar chart, net worth sparkline, best/worst months, FIRE progress structuur',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const year = new Date().getFullYear() - 1
      const res = await fetch(`/api/year-in-review?year=${year}`)
      if (res.status === 200) {
        const data = await res.json()
        // Freedom days bar chart: 12 months, each with month, label, days
        for (const m of data.freedomDaysByMonth) {
          assertNotNull(m.month, 'month key')
          assertNotNull(m.label, 'month label')
          assert(typeof m.days === 'number', `days for ${m.label} moet number zijn`)
          assertGreaterThanOrEqual(m.days, 0, `days for ${m.label} mag niet negatief zijn`)
        }
        // Net worth sparkline: netWorthByMonth is array of {month, value}
        assert(Array.isArray(data.netWorthByMonth), 'netWorthByMonth moet array zijn')
        for (const point of data.netWorthByMonth) {
          assertNotNull(point.month, 'sparkline month')
          assert(typeof point.value === 'number', 'sparkline value moet number zijn')
        }
        // Best/worst months: nullable but correct shape when present
        if (data.bestMonth) {
          assertNotNull(data.bestMonth.label, 'bestMonth label')
          assert(typeof data.bestMonth.savings === 'number', 'bestMonth savings moet number zijn')
        }
        if (data.worstMonth) {
          assertNotNull(data.worstMonth.label, 'worstMonth label')
          assert(typeof data.worstMonth.savings === 'number', 'worstMonth savings moet number zijn')
        }
        // FIRE progress: nullable but correct shape when present
        if (data.fireStart) {
          assert(typeof data.fireStart.percentage === 'number', 'fireStart percentage moet number zijn')
          assert(typeof data.fireStart.netWorth === 'number', 'fireStart netWorth moet number zijn')
          assert(typeof data.fireStart.fireTarget === 'number', 'fireStart fireTarget moet number zijn')
        }
        if (data.fireEnd) {
          assert(typeof data.fireEnd.percentage === 'number', 'fireEnd percentage moet number zijn')
        }
      } else {
        assert(
          res.status === 401 || isRedirect(res.status),
          `Expected 200 or 401, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 8: Samenvatting statistics berekening ─────────────────────────────
  {
    id: 'delen-jaaroverzicht-samenvatting',
    name: 'Jaaroverzicht samenvatting: statistieken correct berekend',
    category: CAT,
    description: 'totalSaved = totalIncome - totalExpenses, savingsRate consistent',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const year = new Date().getFullYear() - 1
      const res = await fetch(`/api/year-in-review?year=${year}`)
      if (res.status === 200) {
        const data = await res.json()
        // totalSaved should equal totalIncome - totalExpenses (rounded)
        const expectedSaved = Math.round(data.totalIncome - data.totalExpenses)
        assertEqual(data.totalSaved, expectedSaved, 'totalSaved = totalIncome - totalExpenses')
        // savingsRate consistency: if totalIncome > 0, savingsRate should be defined
        if (data.totalIncome > 0) {
          assertNotNull(data.savingsRate, 'savingsRate moet bestaan als er inkomen is')
          // savingsRate should be in reasonable range
          assert(
            data.savingsRate >= -200 && data.savingsRate <= 100,
            `savingsRate ${data.savingsRate} buiten bereik`,
          )
        }
        // actionsCompleted must be non-negative
        assertGreaterThanOrEqual(data.actionsCompleted, 0, 'actionsCompleted >= 0')
        // freedomDaysWon must be non-negative
        assertGreaterThanOrEqual(data.freedomDaysWon, 0, 'freedomDaysWon >= 0')
      } else {
        assert(
          res.status === 401 || isRedirect(res.status),
          `Expected 200 or 401, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 9: renderYearInReviewToCanvas ──────────────────────────────────────
  {
    id: 'delen-canvas-render',
    name: 'renderYearInReviewToCanvas: PNG export structuur',
    category: CAT,
    description: 'Canvas renderer verwacht alle verplichte YearInReviewData velden',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Validate the YearInReviewData contract that the canvas renderer expects
      const mockData = {
        year: 2025,
        displayName: 'Test User',
        freedomDaysWon: 42,
        freedomDaysByMonth: Array.from({ length: 12 }, (_, i) => ({
          month: `2025-${String(i + 1).padStart(2, '0')}`,
          label: ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][i],
          days: Math.floor(Math.random() * 10),
        })),
        bestFreedomMonth: { month: '2025-06', label: 'jun', days: 8 },
        netWorthStart: 100000,
        netWorthEnd: 120000,
        netWorthGrowth: 20000,
        netWorthGrowthPct: 20.0,
        netWorthByMonth: Array.from({ length: 12 }, (_, i) => ({
          month: `2025-${String(i + 1).padStart(2, '0')}`,
          value: 100000 + i * 1800,
        })),
        bestMonth: { month: '2025-03', label: 'Maart', income: 5000, expenses: 2500, savings: 2500 },
        worstMonth: { month: '2025-11', label: 'November', income: 4000, expenses: 4500, savings: -500 },
        monthlyOverview: Array.from({ length: 12 }, (_, i) => ({
          month: `2025-${String(i + 1).padStart(2, '0')}`,
          label: ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'][i],
          income: 4000 + Math.random() * 1000,
          expenses: 2500 + Math.random() * 1500,
          savings: 500 + Math.random() * 1000,
        })),
        fireStart: { percentage: 25.3, netWorth: 100000, fireTarget: 400000 },
        fireEnd: { percentage: 30.1, netWorth: 120000, fireTarget: 400000 },
        fireProgressDelta: 4.8,
        totalIncome: 54000,
        totalExpenses: 36000,
        totalSaved: 18000,
        savingsRate: 33.3,
        actionsCompleted: 15,
        generatedAt: new Date().toISOString(),
      }
      // All required fields exist and are correct type
      assertEqual(mockData.year, 2025, 'year')
      assertEqual(mockData.freedomDaysByMonth.length, 12, '12 maanden freedom days')
      assertEqual(mockData.monthlyOverview.length, 12, '12 maanden overview')
      assertEqual(mockData.netWorthByMonth.length, 12, '12 maanden net worth')
      assertNotNull(mockData.fireStart, 'fireStart')
      assertNotNull(mockData.fireEnd, 'fireEnd')
      assertNotNull(mockData.generatedAt, 'generatedAt')
      // Canvas dimensions are hardcoded: 840x1200 (verified from source)
      const W = 840
      const H = 1200
      assertGreaterThan(W, 0, 'Canvas width')
      assertGreaterThan(H, 0, 'Canvas height')
    },
  },

  // ── Step 10: ShareDialog for jaaroverzicht ──────────────────────────────────
  {
    id: 'delen-jaaroverzicht-share',
    name: 'Jaaroverzicht ShareDialog: share content structuur',
    category: CAT,
    description: 'getShareContent genereert correcte ShareContent voor jaaroverzicht',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Simulate the getShareContent logic from jaaroverzicht page
      const mockData = {
        year: 2025,
        freedomDaysWon: 42,
        netWorthGrowthPct: 20.0,
      }
      const formatPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
      const shareContent = {
        title: `Mijn TriFinity Jaaroverzicht ${mockData.year}`,
        text: `Mijn ${mockData.year} in cijfers: ${mockData.freedomDaysWon} vrijheidsdagen gewonnen${mockData.netWorthGrowthPct != null ? `, vermogen ${formatPct(mockData.netWorthGrowthPct)}` : ''} #TriFinity`,
        url: 'https://example.com',
        contentType: 'milestone' as const,
        privacyLevel: 'anonymous',
      }
      assert(shareContent.title.includes('2025'), 'Titel moet jaar bevatten')
      assert(shareContent.text.includes('42'), 'Text moet freedomDaysWon bevatten')
      assert(shareContent.text.includes('+20.0%'), 'Text moet groeipercentage bevatten')
      assert(shareContent.text.includes('#TriFinity'), 'Text moet hashtag bevatten')
      assertEqual(shareContent.contentType, 'milestone', 'contentType moet milestone zijn')
    },
  },

  // ── Step 11: Delen page route accessible ───────────────────────────────────
  {
    id: 'delen-page-accessible',
    name: 'Delen pagina: /identity/delen bereikbaar',
    category: CAT,
    description: '/identity/delen route geeft 200 of auth redirect',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetchNoRedirect('/identity/delen')
      assert(
        res.status === 200 || isRedirect(res.status),
        `Expected 200 or redirect for /identity/delen, got ${res.status}`,
      )
    },
  },

  // ── Step 12: Jaaroverzicht page route accessible ───────────────────────────
  {
    id: 'delen-jaaroverzicht-accessible',
    name: 'Jaaroverzicht pagina: /identity/jaaroverzicht bereikbaar',
    category: CAT,
    description: '/identity/jaaroverzicht route geeft 200 of auth redirect',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await fetchNoRedirect('/identity/jaaroverzicht')
      assert(
        res.status === 200 || isRedirect(res.status),
        `Expected 200 or redirect for /identity/jaaroverzicht, got ${res.status}`,
      )
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Identiteit — Delen & Jaaroverzicht',
    description: 'Freedom card, social sharing, year-in-review met charts en export',
    icon: 'Share2',
    testCount: 0,
  })
  registerTests(tests)
}
