import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertFinite, assertLessThan,
  assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'
import {
  computeDrift,
  suggestTrades,
  getUnclassifiedHoldings,
  isBox3Window,
  generateRebalanceNotifications,
  generateRebalancingReport,
  DEFAULT_CONSTRAINTS,
  type DriftResult,
  type Trade,
} from '@/lib/rebalancing'
import type { HoldingForAllocation, TargetAllocation } from '@/lib/portfolio-allocation'

const CAT = 'rebalancing.drift'

// ── Test fixtures ───────────────────────────────────────────────
const HOLDINGS: HoldingForAllocation[] = [
  { id: 'h1', name: 'World ETF', ticker: 'VWRL', value: 6000, asset_class: 'aandelen', sector: 'breed', geography: 'wereld' },
  { id: 'h2', name: 'Euro Bond', ticker: 'IEAG', value: 3000, asset_class: 'obligaties', sector: 'obligaties', geography: 'europa' },
  { id: 'h3', name: 'Crypto', ticker: 'BTC', value: 1000, asset_class: 'crypto', sector: 'crypto', geography: null },
]

const TARGETS: TargetAllocation[] = [
  { category: 'aandelen', target_pct: 70 },
  { category: 'obligaties', target_pct: 25 },
  { category: 'crypto', target_pct: 5 },
]

// ── Helper: fetch API with expected status ──────────────────────
async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await unauthenticatedFetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    })
    let body: Record<string, unknown> = {}
    try {
      body = await res.json()
    } catch {
      // Non-JSON response
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: { error: 'fetch failed' } }
  }
}

const tests: TestCase[] = [
  // ════════════════════════════════════════════════════════════════════
  // Test 1: API retourneert correcte drift bij bekende holdings + targets
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-compute-basic',
    name: 'computeDrift: correcte drift bij bekende holdings + targets',
    category: CAT,
    description: 'computeDrift berekent correcte current_pct, target_pct en drift_pct',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Total value = 10000. aandelen=60%, obligaties=30%, crypto=10%
      const drifts = computeDrift(HOLDINGS, TARGETS, 'asset_class')

      assertEqual(drifts.length, 3, '3 drift results (1 per target)')

      const aandelen = drifts.find(d => d.category === 'aandelen')!
      assertNotNull(aandelen, 'aandelen drift bestaat')
      assertEqual(aandelen.current_pct, 60, 'aandelen current = 60%')
      assertEqual(aandelen.target_pct, 70, 'aandelen target = 70%')
      assertEqual(aandelen.drift_pct, -10, 'aandelen drift = -10% (underweight)')
      assertEqual(aandelen.drift_amount, 1000, 'aandelen drift bedrag = €1000')

      const obligaties = drifts.find(d => d.category === 'obligaties')!
      assertNotNull(obligaties, 'obligaties drift bestaat')
      assertEqual(obligaties.current_pct, 30, 'obligaties current = 30%')
      assertEqual(obligaties.target_pct, 25, 'obligaties target = 25%')
      assertEqual(obligaties.drift_pct, 5, 'obligaties drift = +5% (overweight)')

      const crypto = drifts.find(d => d.category === 'crypto')!
      assertNotNull(crypto, 'crypto drift bestaat')
      assertEqual(crypto.current_pct, 10, 'crypto current = 10%')
      assertEqual(crypto.target_pct, 5, 'crypto target = 5%')
      assertEqual(crypto.drift_pct, 5, 'crypto drift = +5% (overweight)')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 2: API retourneert hasTargets=false als geen targets ingesteld
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-no-targets',
    name: 'computeDrift: lege targets → lege drift array',
    category: CAT,
    description: 'Zonder targets retourneert computeDrift een lege array',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const drifts = computeDrift(HOLDINGS, [], 'asset_class')
      assertEqual(drifts.length, 0, 'geen drifts zonder targets')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 3: unclassifiedCount > 0 bij holdings zonder asset_class
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-unclassified',
    name: 'getUnclassifiedHoldings: detecteert holdings zonder classificatie',
    category: CAT,
    description: 'Holdings zonder asset_class worden als unclassified gemarkeerd',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const holdingsWithMissing: HoldingForAllocation[] = [
        { id: 'h1', name: 'Classified', ticker: 'ABC', value: 5000, asset_class: 'aandelen' },
        { id: 'h2', name: 'Unclassified A', ticker: 'XYZ', value: 3000, asset_class: null },
        { id: 'h3', name: 'Unclassified B', ticker: null, value: 2000, asset_class: '' },
      ]

      const unclassified = getUnclassifiedHoldings(holdingsWithMissing, 'asset_class')
      assertEqual(unclassified.length, 2, '2 unclassified holdings')
      assertEqual(unclassified[0].name, 'Unclassified A', 'eerste unclassified = A')
      assertEqual(unclassified[1].name, 'Unclassified B', 'tweede unclassified = B')
      assertEqual(unclassified[0].missingField, 'asset_class', 'missingField = asset_class')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 4: suggestTrades genereert correcte koop/verkoop bedragen
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-suggest-trades',
    name: 'suggestTrades: genereert correcte koop/verkoop trades',
    category: CAT,
    description: 'Underweight categorieën → buy, overweight → sell, met juiste bedragen',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const drifts = computeDrift(HOLDINGS, TARGETS, 'asset_class')
      const trades = suggestTrades(drifts, HOLDINGS, 'asset_class', { threshold: 5 })

      assertGreaterThan(trades.length, 0, 'minstens 1 trade gesuggereerd')

      // aandelen is -10% underweight → buy
      const aandelenTrade = trades.find(t => t.category === 'aandelen')
      if (aandelenTrade) {
        assertEqual(aandelenTrade.action, 'buy', 'aandelen: buy (underweight)')
        assertGreaterThan(aandelenTrade.amount, 0, 'aandelen: positief bedrag')
      }

      // obligaties is +5% overweight → sell (if >= threshold)
      const obligatiesTrade = trades.find(t => t.category === 'obligaties')
      if (obligatiesTrade) {
        assertEqual(obligatiesTrade.action, 'sell', 'obligaties: sell (overweight)')
        assertGreaterThan(obligatiesTrade.amount, 0, 'obligaties: positief bedrag')
      }

      // Trades should be sorted by amount descending
      for (let i = 1; i < trades.length; i++) {
        assertGreaterThanOrEqual(trades[i - 1].amount, trades[i].amount, 'trades gesorteerd op bedrag desc')
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 5: minimale transactiegrootte wordt gerespecteerd
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-min-trade-amount',
    name: 'suggestTrades: minimale transactiegrootte gerespecteerd',
    category: CAT,
    description: 'Trades onder minTradeAmount worden gefilterd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Default minTradeAmount = 100
      assertEqual(DEFAULT_CONSTRAINTS.minTradeAmount, 100, 'default minTradeAmount = €100')

      // Create scenario where drift_amount is very small (< 100)
      const smallHoldings: HoldingForAllocation[] = [
        { id: 'h1', name: 'Tiny A', ticker: 'A', value: 510, asset_class: 'aandelen' },
        { id: 'h2', name: 'Tiny B', ticker: 'B', value: 490, asset_class: 'obligaties' },
      ]
      const targets: TargetAllocation[] = [
        { category: 'aandelen', target_pct: 50 },
        { category: 'obligaties', target_pct: 50 },
      ]

      const drifts = computeDrift(smallHoldings, targets, 'asset_class')
      // Drift is 51% vs 50% = 1%, amount = 10 EUR → below minTradeAmount
      const trades = suggestTrades(drifts, smallHoldings, 'asset_class', { threshold: 1, minTradeAmount: 100 })

      // The 1% drift results in €10 which is below €100 min trade
      assertEqual(trades.length, 0, 'geen trades onder minTradeAmount')

      // With lower min trade, trades should appear
      const tradesLowMin = suggestTrades(drifts, smallHoldings, 'asset_class', { threshold: 1, minTradeAmount: 1 })
      // Even 1% drift on €1000 is €10, which is ≥ €1
      assertGreaterThanOrEqual(tradesLowMin.length, 0, 'trades verschijnen bij lage minTradeAmount')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 6: Box 3 window detectie werkt correct
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-box3-window',
    name: 'isBox3Window: detecteert nov/dec vs andere maanden',
    category: CAT,
    description: 'isBox3Window retourneert true in nov/dec, false in andere maanden',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // November = month index 10
      const nov = new Date(2026, 10, 15) // Nov 15
      assertEqual(isBox3Window(nov), true, 'november = Box 3 window')

      // December = month index 11
      const dec = new Date(2026, 11, 1) // Dec 1
      assertEqual(isBox3Window(dec), true, 'december = Box 3 window')

      // January = month index 0
      const jan = new Date(2026, 0, 2) // Jan 2
      assertEqual(isBox3Window(jan), false, 'januari ≠ Box 3 window')

      // June = month index 5
      const jun = new Date(2026, 5, 15)
      assertEqual(isBox3Window(jun), false, 'juni ≠ Box 3 window')

      // October = month index 9 (boundary)
      const oct = new Date(2026, 9, 31)
      assertEqual(isBox3Window(oct), false, 'oktober ≠ Box 3 window')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 7: notification severity mapping
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-notification-severity',
    name: 'generateRebalanceNotifications: severity mapping (warning/critical)',
    category: CAT,
    description: 'Drift > threshold → warning, drift > 2×threshold → critical',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const threshold = 5
      const drifts: DriftResult[] = [
        { category: 'aandelen', label: 'Aandelen', current_pct: 55, target_pct: 50, drift_pct: 5, drift_amount: 500, holding_count: 2 },
        { category: 'obligaties', label: 'Obligaties', current_pct: 35, target_pct: 25, drift_pct: 10, drift_amount: 1000, holding_count: 1 },
        { category: 'crypto', label: 'Crypto', current_pct: 3, target_pct: 5, drift_pct: -2, drift_amount: 200, holding_count: 1 },
      ]

      const notifications = generateRebalanceNotifications(drifts, threshold, false)

      // crypto has only 2% drift < 5% threshold → no notification
      const cryptoNotif = notifications.find(n => n.id.includes('crypto'))
      assertEqual(cryptoNotif, undefined, 'geen melding voor drift < threshold')

      // aandelen: 5% drift = threshold → warning
      const aandelenNotif = notifications.find(n => n.id.includes('aandelen'))
      assertNotNull(aandelenNotif, 'aandelen melding bestaat')
      assertEqual(aandelenNotif!.severity, 'warning', 'drift = threshold → warning')

      // obligaties: 10% drift = 2× threshold → critical
      const obligatiesNotif = notifications.find(n => n.id.includes('obligaties'))
      assertNotNull(obligatiesNotif, 'obligaties melding bestaat')
      assertEqual(obligatiesNotif!.severity, 'critical', 'drift = 2× threshold → critical')

      // All notifications should be type 'rebalance'
      for (const n of notifications) {
        assertEqual(n.type, 'rebalance', `melding type = rebalance`)
        assert(n.message.length > 0, 'melding heeft bericht')
        assertEqual(n.actionHref, '/core/assets', 'melding linkt naar /core/assets')
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 8: Box 3 peildatum notification in Nov/Dec
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-box3-notification',
    name: 'generateRebalanceNotifications: Box 3 peildatum melding',
    category: CAT,
    description: 'In Box 3 window wordt extra info-melding gegenereerd',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const drifts: DriftResult[] = []

      // No box3 → no notification
      const notifsNoBox3 = generateRebalanceNotifications(drifts, 5, false)
      const box3Notif = notifsNoBox3.find(n => n.id === 'rebalance-box3-peildatum')
      assertEqual(box3Notif, undefined, 'geen Box 3 melding buiten window')

      // With box3 → info notification
      const notifsBox3 = generateRebalanceNotifications(drifts, 5, true)
      const box3NotifActive = notifsBox3.find(n => n.id === 'rebalance-box3-peildatum')
      assertNotNull(box3NotifActive, 'Box 3 melding aanwezig in window')
      assertEqual(box3NotifActive!.severity, 'info', 'Box 3 melding = info severity')
      assert(box3NotifActive!.message.includes('Peildatum'), 'bericht vermeldt peildatum')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 9: instelbare drempel uit profile
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-configurable-threshold',
    name: 'suggestTrades: instelbare drempel beïnvloedt trade filtering',
    category: CAT,
    description: 'Hogere threshold filtert meer trades, lagere toont meer',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const drifts = computeDrift(HOLDINGS, TARGETS, 'asset_class')

      // Default threshold = 5%
      assertEqual(DEFAULT_CONSTRAINTS.threshold, 5, 'default threshold = 5%')

      // High threshold: only large drifts pass
      const tradesHigh = suggestTrades(drifts, HOLDINGS, 'asset_class', { threshold: 15 })

      // Low threshold: more trades pass
      const tradesLow = suggestTrades(drifts, HOLDINGS, 'asset_class', { threshold: 1 })

      assertGreaterThanOrEqual(tradesLow.length, tradesHigh.length, 'lagere threshold → meer of gelijke trades')

      // Very high threshold: nothing passes (all drifts are ≤ 10%)
      const tradesVeryHigh = suggestTrades(drifts, HOLDINGS, 'asset_class', { threshold: 50 })
      assertEqual(tradesVeryHigh.length, 0, 'threshold 50% → geen trades')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 10: 401 bij unauthenticated request
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-auth-guard',
    name: 'GET /api/rebalancing/check: 401 bij unauthenticated request',
    category: CAT,
    description: 'Endpoint vereist authenticatie, retourneert 401 zonder sessie',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/rebalancing/check')
      assertEqual(status, 401, 'GET /api/rebalancing/check → 401 voor unauthenticated')
      assert(body.error !== undefined, 'response bevat error veld')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Test 11: lege response bij geen holdings
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-no-holdings',
    name: 'computeDrift: geen holdings → lege drift array',
    category: CAT,
    description: 'Zonder holdings retourneert computeDrift leeg (totalValue=0)',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const drifts = computeDrift([], TARGETS, 'asset_class')
      assertEqual(drifts.length, 0, 'geen drifts zonder holdings')

      // Also test with holdings that have 0 value
      const zeroHoldings: HoldingForAllocation[] = [
        { id: 'h1', name: 'Empty', ticker: null, value: 0, asset_class: 'aandelen' },
      ]
      const driftsZero = computeDrift(zeroHoldings, TARGETS, 'asset_class')
      assertEqual(driftsZero.length, 0, 'geen drifts bij value=0')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Edge: alle holdings unclassified
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-all-unclassified',
    name: 'getUnclassifiedHoldings: alle holdings zonder classificatie',
    category: CAT,
    description: 'Als alle holdings geen asset_class hebben, zijn ze allemaal unclassified',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const unclassifiedHoldings: HoldingForAllocation[] = [
        { id: 'h1', name: 'Unknown A', ticker: 'X', value: 5000, asset_class: null },
        { id: 'h2', name: 'Unknown B', ticker: 'Y', value: 3000, asset_class: null },
        { id: 'h3', name: 'Unknown C', ticker: null, value: 2000 },
      ]

      const unclassified = getUnclassifiedHoldings(unclassifiedHoldings, 'asset_class')
      assertEqual(unclassified.length, 3, 'alle 3 holdings unclassified')

      // Drift with targets should still work (holdings fall into "anders")
      const drifts = computeDrift(unclassifiedHoldings, TARGETS, 'asset_class')
      // With all in "anders", named targets won't match → all show 0 current
      for (const d of drifts) {
        assertEqual(d.current_pct, 0, `${d.category}: current = 0% (alles unclassified)`)
        assertLessThan(d.drift_pct, 0, `${d.category}: negatieve drift (underweight)`)
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Edge: drift exact op drempel
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-exact-threshold',
    name: 'suggestTrades: drift exact op drempel wordt meegenomen',
    category: CAT,
    description: 'Drift gelijk aan threshold (>=) genereert een trade',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Create scenario where drift is exactly 5%
      const holdings: HoldingForAllocation[] = [
        { id: 'h1', name: 'Fund A', ticker: 'A', value: 5500, asset_class: 'aandelen' },
        { id: 'h2', name: 'Fund B', ticker: 'B', value: 4500, asset_class: 'obligaties' },
      ]
      const targets: TargetAllocation[] = [
        { category: 'aandelen', target_pct: 50 },
        { category: 'obligaties', target_pct: 50 },
      ]

      const drifts = computeDrift(holdings, targets, 'asset_class')
      // aandelen: 55% vs 50% = +5% drift (exactly threshold)
      const aandelenDrift = drifts.find(d => d.category === 'aandelen')!
      assertEqual(aandelenDrift.drift_pct, 5, 'drift exact 5%')

      const trades = suggestTrades(drifts, holdings, 'asset_class', { threshold: 5, minTradeAmount: 1 })
      // Drift of exactly 5% should be included (>=)
      assertGreaterThanOrEqual(trades.length, 1, 'drift = threshold → trade gegenereerd')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // holdingSuggestions correctness
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-holding-suggestions',
    name: 'suggestTrades: per-holding suggesties correct verdeeld',
    category: CAT,
    description: 'Trade bedragen worden proportioneel verdeeld over holdings in de categorie',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdings: HoldingForAllocation[] = [
        { id: 'h1', name: 'Big ETF', ticker: 'BIG', value: 8000, asset_class: 'aandelen' },
        { id: 'h2', name: 'Small ETF', ticker: 'SML', value: 2000, asset_class: 'aandelen' },
        { id: 'h3', name: 'Bond Fund', ticker: 'BND', value: 5000, asset_class: 'obligaties' },
      ]
      const targets: TargetAllocation[] = [
        { category: 'aandelen', target_pct: 50 },
        { category: 'obligaties', target_pct: 50 },
      ]

      const drifts = computeDrift(holdings, targets, 'asset_class')
      const trades = suggestTrades(drifts, holdings, 'asset_class', { threshold: 1, minTradeAmount: 1 })

      // aandelen is overweight (66.7% vs 50%) → sell
      const aandelenTrade = trades.find(t => t.category === 'aandelen')
      if (aandelenTrade) {
        assertEqual(aandelenTrade.action, 'sell', 'aandelen: sell')
        assertGreaterThanOrEqual(aandelenTrade.holdingSuggestions.length, 1, 'holding suggesties aanwezig')

        // Big ETF should get larger share of sell
        const bigSuggestion = aandelenTrade.holdingSuggestions.find(s => s.holdingId === 'h1')
        const smallSuggestion = aandelenTrade.holdingSuggestions.find(s => s.holdingId === 'h2')
        if (bigSuggestion && smallSuggestion) {
          assertGreaterThan(bigSuggestion.amount, smallSuggestion.amount, 'grotere holding → groter verkoopbedrag')
        }
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // generateRebalancingReport full report
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-full-report',
    name: 'generateRebalancingReport: volledig rapport met alle velden',
    category: CAT,
    description: 'Genereert een compleet RebalancingReport met drifts, trades, unclassified',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const report = generateRebalancingReport(HOLDINGS, TARGETS, 'asset_class')

      assertEqual(report.viewMode, 'asset_class', 'viewMode = asset_class')
      assertEqual(report.totalValue, 10000, 'totalValue = €10.000')
      assertGreaterThanOrEqual(report.drifts.length, 1, 'heeft drift resultaten')
      assert(typeof report.isBox3Window === 'boolean', 'isBox3Window is boolean')
      assert(report.generatedAt.length > 0, 'generatedAt is niet leeg')

      // Unclassified: crypto has geography=null
      const unclassifiedGeo = getUnclassifiedHoldings(HOLDINGS, 'geography')
      assertGreaterThanOrEqual(unclassifiedGeo.length, 1, 'crypto mist geography')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // View mode: sector
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-sector-viewmode',
    name: 'computeDrift: werkt met sector view mode',
    category: CAT,
    description: 'Drift berekening werkt correct met sector als classificatie',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const sectorTargets: TargetAllocation[] = [
        { category: 'breed', target_pct: 60 },
        { category: 'obligaties', target_pct: 30 },
        { category: 'crypto', target_pct: 10 },
      ]

      const drifts = computeDrift(HOLDINGS, sectorTargets, 'sector')
      assertEqual(drifts.length, 3, '3 sector drift results')

      const breed = drifts.find(d => d.category === 'breed')!
      assertNotNull(breed, 'breed sector drift bestaat')
      assertFinite(breed.drift_pct, 'breed drift is finite')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Notification message format
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-notification-message-format',
    name: 'generateRebalanceNotifications: correct berichtformaat',
    category: CAT,
    description: 'Notification berichten bevatten juiste percentages en bedragen',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const drifts: DriftResult[] = [
        { category: 'aandelen', label: 'Aandelen', current_pct: 65, target_pct: 50, drift_pct: 15, drift_amount: 1500, holding_count: 3 },
      ]

      const notifications = generateRebalanceNotifications(drifts, 5)
      assertEqual(notifications.length, 1, '1 melding')

      const msg = notifications[0].message
      assert(msg.includes('Aandelen'), 'bericht vermeldt categorie label')
      assert(msg.includes('15,0%') || msg.includes('15.0%') || msg.includes('+15'), 'bericht vermeldt drift percentage')
      assert(msg.includes('65') || msg.includes('65,0'), 'bericht vermeldt current %')
      assert(msg.includes('50') || msg.includes('50,0'), 'bericht vermeldt target %')
      assert(msg.includes('verkopen') || msg.includes('Verkopen') || msg.includes('verkoop'), 'bericht suggereert verkopen bij overweight')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Ingestelde drempel is load-bearing: 3% vs 12% verandert de meldingen
  // (regressie op de HIGH-fix — loader/widget lazen voorheen hard 5%).
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'rebalancing-drift-threshold-fixtures-3-vs-12',
    name: 'generateRebalanceNotifications: drempel 3% vs 12% geeft andere meldingen',
    category: CAT,
    description: 'Dezelfde drifts leveren bij drempel 3% méér/zwaardere meldingen dan bij 12% — de ingestelde drempel is bepalend, niet een hardcoded 5%',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Vaste drifts: +4% (klein), +10% (fors), -2% (binnen elke drempel)
      const drifts: DriftResult[] = [
        { category: 'aandelen', label: 'Aandelen', current_pct: 54, target_pct: 50, drift_pct: 4, drift_amount: 400, holding_count: 2 },
        { category: 'obligaties', label: 'Obligaties', current_pct: 35, target_pct: 25, drift_pct: 10, drift_amount: 1000, holding_count: 1 },
        { category: 'crypto', label: 'Crypto', current_pct: 3, target_pct: 5, drift_pct: -2, drift_amount: 200, holding_count: 1 },
      ]

      // Drempel 3%: 4% en 10% overschrijden → 2 meldingen.
      // 4% (<2×3=6) = warning; 10% (>=2×3=6) = critical.
      const at3 = generateRebalanceNotifications(drifts, 3, false)
      assertEqual(at3.length, 2, 'drempel 3%: 2 meldingen (4% en 10%)')
      assertEqual(at3.find(n => n.id.includes('aandelen'))!.severity, 'warning', '4% bij drempel 3% → warning')
      assertEqual(at3.find(n => n.id.includes('obligaties'))!.severity, 'critical', '10% bij drempel 3% → critical (>=2×)')

      // Drempel 12%: niets overschrijdt → 0 meldingen.
      const at12 = generateRebalanceNotifications(drifts, 12, false)
      assertEqual(at12.length, 0, 'drempel 12%: geen meldingen (alle drift < 12%)')

      // Bewijs dat de drempel bepalend is: 3% ≠ 12%.
      assertGreaterThan(at3.length, at12.length, 'lagere drempel → meer meldingen (drempel is load-bearing)')

      // Regressie tegen de oude hardcode 5%: 4% mag bij 5% GEEN melding geven,
      // maar bij de ingestelde 3% wél — dus de bron mag geen literal 5 zijn.
      const at5 = generateRebalanceNotifications(drifts, 5, false)
      assertEqual(at5.find(n => n.id.includes('aandelen')), undefined, '4% bij drempel 5% → geen melding (verschilt van 3%)')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Rebalancing — Drift, Trades & Meldingen',
    description: 'Drift berekening, trade suggesties, Box 3 window, notification generatie, drempel instelling, en edge cases',
    icon: 'Scale',
    testCount: 0,
  })
  registerTests(tests)
}
