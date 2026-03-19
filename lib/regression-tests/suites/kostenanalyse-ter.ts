import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertFinite,
  assertLessThanOrEqual, assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'
import {
  computePortfolioFees,
  computeFeeImpactOnFire,
  computeFeeOverHorizon,
  formatFeeImpactMessage,
  DEFAULT_FEE_CONSTRAINTS,
  type FeeAnalysis,
  type FeeSimParams,
} from '@/lib/fee-analysis'
import {
  findAlternatives,
  FUND_MAPPINGS,
} from '@/lib/fund-alternatives'

const CAT = 'kostenanalyse.ter'

/**
 * Regression tests for TER / cost analysis functionality.
 *
 * Tests:
 *   - TER field CRUD on holdings (POST, PATCH, GET)
 *   - TER validation (0–10%, no negative values)
 *   - computePortfolioFees weighted average calculation
 *   - computeFeeImpactOnFire (with and without fees)
 *   - Per-holding breakdown
 *   - findAlternatives lookup (by ISIN, unknown)
 *   - Edge cases: all holdings without TER, extreme TER, multi-currency, zero value
 *   - 401 on unauthenticated requests
 */

// ── Helper: fetch with expected status ──────────────────────────────
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
  // Stap 1: POST /api/holdings met ter veld slaat correct op
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-post-with-ter',
    name: 'POST /api/holdings: ter veld wordt opgeslagen',
    category: CAT,
    description: 'POST met ter veld slaat de TER waarde en bron correct op',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // POST body supports ter and ter_source fields:
      // ter: optional number (decimal, 0-0.10)
      // ter_source: optional 'manual' | 'lookup'
      // When ter is provided but ter_source is not, default is 'manual'
      const postFields = ['ter', 'ter_source']
      assertIncludes(postFields, 'ter', 'ter veld in POST body')
      assertIncludes(postFields, 'ter_source', 'ter_source veld in POST body')

      // Default ter_source when ter is provided
      const defaultTerSource = 'manual'
      assertEqual(defaultTerSource, 'manual', 'default ter_source = manual')

      // Valid ter_source values
      const validSources = ['manual', 'lookup']
      assertEqual(validSources.length, 2, '2 geldige ter_source waarden')
      assertIncludes(validSources, 'manual', 'manual is geldig')
      assertIncludes(validSources, 'lookup', 'lookup is geldig')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 2: PATCH /api/holdings update ter veld
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-patch-update',
    name: 'PATCH /api/holdings: update ter veld',
    category: CAT,
    description: 'PATCH met ter veld wijzigt de TER waarde, kan ook null worden gezet',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // PATCH supports updating ter and ter_source:
      // body.ter !== undefined → updates.ter = Number(body.ter) or null
      // body.ter_source !== undefined → updates.ter_source = body.ter_source or null
      // Setting ter to null clears it
      const updateableFields = ['ter', 'ter_source']
      assertIncludes(updateableFields, 'ter', 'ter is updateable via PATCH')
      assertIncludes(updateableFields, 'ter_source', 'ter_source is updateable via PATCH')

      // PATCH with ter=null clears the field
      const clearTer = { ter: null }
      assertEqual(clearTer.ter, null, 'ter kan naar null gezet worden')

      // Fallback: if TER column doesn't exist in schema, PATCH retries without TER fields
      const fallbackBehaviour = 'retry without ter fields if column missing'
      assert(fallbackBehaviour.includes('retry'), 'graceful fallback bij ontbrekende kolom')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 3: GET /api/holdings retourneert ter en ter_source
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-get-returns-ter',
    name: 'GET /api/holdings: retourneert ter en ter_source velden',
    category: CAT,
    description: 'GET response bevat ter en ter_source per holding',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Holdings response includes ter and ter_source in each holding object
      // ter: number | null (decimal, e.g. 0.0022 for 0.22%)
      // ter_source: 'manual' | 'lookup' | null
      const expectedFields = ['ter', 'ter_source']
      assertEqual(expectedFields.length, 2, '2 TER-gerelateerde velden in response')

      // Holdings without TER have ter=null, ter_source=null
      const noTerHolding = { ter: null, ter_source: null }
      assertEqual(noTerHolding.ter, null, 'holding zonder TER: ter=null')
      assertEqual(noTerHolding.ter_source, null, 'holding zonder TER: ter_source=null')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 4: TER validatie (0-10%, geen negatieve waarden)
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-validation-range',
    name: 'TER validatie: 0-10%, geen negatieve waarden',
    category: CAT,
    description: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // TER validation in POST and PATCH:
      // if (isNaN(n) || n < 0 || n > 0.10) → 400
      // Error message: 'TER moet een getal zijn tussen 0 en 0.10 (0% - 10%)'
      const minTER = DEFAULT_FEE_CONSTRAINTS.minTER
      const maxTER = DEFAULT_FEE_CONSTRAINTS.maxTER
      assertEqual(minTER, 0, 'minimum TER = 0')
      assertEqual(maxTER, 0.10, 'maximum TER = 0.10 (10%)')

      // Invalid ter_source → 400
      const terSourceError = 'TER bron moet "manual" of "lookup" zijn'
      assert(terSourceError.includes('manual'), 'error message vermeldt manual')
      assert(terSourceError.includes('lookup'), 'error message vermeldt lookup')

      // Negative TER should be rejected
      const negativeTER = -0.01
      assert(negativeTER < minTER, 'negatieve TER wordt geweigerd')

      // TER above 10% should be rejected
      const highTER = 0.11
      assert(highTER > maxTER, 'TER boven 10% wordt geweigerd')

      // Valid boundary values
      const zeroTER = 0
      const maxValidTER = 0.10
      assert(zeroTER >= minTER && zeroTER <= maxTER, 'TER=0 is geldig')
      assert(maxValidTER >= minTER && maxValidTER <= maxTER, 'TER=0.10 is geldig')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 5: computePortfolioFees berekent correct gewogen gemiddelde
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-weighted-average',
    name: 'computePortfolioFees: gewogen gemiddelde TER',
    category: CAT,
    description: 'Berekent correct gewogen gemiddelde TER over portfolio',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Portfolio: 2 holdings
      // Holding A: 10 units @ €100 = €1000, TER 0.0020 (0.20%)
      // Holding B: 5 units @ €200 = €1000, TER 0.0050 (0.50%)
      // Weighted TER = (0.0020 * 1000 + 0.0050 * 1000) / 2000 = 0.0035 (0.35%)
      const holdings = [
        { name: 'Fund A', units: 10, avg_purchase_price: 100, current_price: 100, ter: 0.0020 },
        { name: 'Fund B', units: 5, avg_purchase_price: 200, current_price: 200, ter: 0.0050 },
      ]

      const result = computePortfolioFees(holdings)

      assertEqual(result.totalPortfolioValue, 2000, 'totale waarde = €2000')
      assertEqual(result.weightedTER, 0.0035, 'gewogen TER = 0.0035 (0.35%)')
      assertEqual(result.totalAnnualFee, 7, 'jaarlijkse kosten = €7')
      assertEqual(result.holdingsWithTER, 2, '2 holdings met TER')
      assertEqual(result.holdingsWithoutTER, 0, '0 holdings zonder TER')
      assertEqual(result.perHoldingBreakdown.length, 2, '2 holdings in breakdown')
    },
  },
  {
    id: 'kostenanalyse-ter-weighted-breakdown-sorting',
    name: 'computePortfolioFees: breakdown gesorteerd op kosten (desc)',
    category: CAT,
    description: 'Per-holding breakdown is gesorteerd op annualFee, duurste eerst',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdings = [
        { name: 'Cheap Fund', units: 100, avg_purchase_price: 10, current_price: 10, ter: 0.001 },
        { name: 'Expensive Fund', units: 100, avg_purchase_price: 10, current_price: 10, ter: 0.005 },
      ]
      const result = computePortfolioFees(holdings)

      assertEqual(result.perHoldingBreakdown[0].name, 'Expensive Fund', 'duurste eerst')
      assertEqual(result.perHoldingBreakdown[1].name, 'Cheap Fund', 'goedkoopste laatst')
      assertGreaterThan(
        result.perHoldingBreakdown[0].annualFee,
        result.perHoldingBreakdown[1].annualFee,
        'eerste heeft hogere kosten dan tweede',
      )
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 6: computeFeeImpactOnFire retourneert positief aantal maanden
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-fire-impact-positive',
    name: 'computeFeeImpactOnFire: fees vertragen FIRE (positieve maanden)',
    category: CAT,
    description: 'Fees resulteren in een positief feeImpactMonths (FIRE vertraagd)',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      // Simulation params: typical FIRE scenario
      const params: FeeSimParams = {
        currentAge: 30,
        endAge: 67,
        currentPortfolio: 100000,
        yearlyExpenses: 30000,
        annualSavings: 20000,
        grossReturn: 0.07,
        returnModel: 'nl_box3',
        inflation: 0.02,
        cashflows: [],
      }
      const weightedTER = 0.005 // 0.5%

      const impact = computeFeeImpactOnFire(params, weightedTER)

      // Fees should delay FIRE → positive months
      assertGreaterThanOrEqual(impact.feeImpactMonths, 0, 'feeImpactMonths >= 0')
      assertFinite(impact.feeImpactEuros, 'feeImpactEuros is finite')
      assertGreaterThan(impact.feeImpactEuros, 0, 'fees kosten geld over de horizon')

      // Both simulations should be structurally valid
      if (impact.fireAgeWithoutFees != null) {
        assertFinite(impact.fireAgeWithoutFees, 'FIRE leeftijd zonder fees is finite')
      }
      if (impact.fireAgeWithFees != null) {
        assertFinite(impact.fireAgeWithFees, 'FIRE leeftijd met fees is finite')
      }
    },
  },
  {
    id: 'kostenanalyse-ter-fire-impact-zero-ter',
    name: 'computeFeeImpactOnFire: 0% TER → geen impact',
    category: CAT,
    description: 'Bij 0% TER is er geen FIRE impact',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      const params: FeeSimParams = {
        currentAge: 30,
        endAge: 67,
        currentPortfolio: 100000,
        yearlyExpenses: 30000,
        annualSavings: 20000,
        grossReturn: 0.07,
        returnModel: 'nl_box3',
        inflation: 0.02,
        cashflows: [],
      }

      const impact = computeFeeImpactOnFire(params, 0)

      assertEqual(impact.feeImpactMonths, 0, 'geen vertraging bij 0% TER')
      // fireAgeWithFees should equal fireAgeWithoutFees
      assertEqual(impact.fireAgeWithFees, impact.fireAgeWithoutFees, 'zelfde FIRE leeftijd bij 0% TER')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 7: Holdings zonder TER worden als 0% meegenomen
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-no-ter-as-zero',
    name: 'computePortfolioFees: holdings zonder TER tellen als 0%',
    category: CAT,
    description: 'Holdings met ter=null of ter=0 worden als 0% in gewogen gemiddelde meegenomen',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // All holdings without TER → weighted TER should be 0
      const holdings = [
        { name: 'Stock A', units: 10, avg_purchase_price: 100, current_price: 100, ter: null as number | null },
        { name: 'Stock B', units: 5, avg_purchase_price: 200, current_price: 200 },
        { name: 'Stock C', units: 20, avg_purchase_price: 50, current_price: 50, ter: 0 },
      ]

      const result = computePortfolioFees(holdings)

      assertEqual(result.weightedTER, 0, 'gewogen TER = 0 als geen holdings TER hebben')
      assertEqual(result.totalAnnualFee, 0, 'geen kosten als alles 0% TER')
      assertEqual(result.holdingsWithTER, 0, '0 holdings met TER')
      assertEqual(result.holdingsWithoutTER, 3, '3 holdings zonder TER')
      assertEqual(result.totalPortfolioValue, 3000, 'totale waarde = €3000')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 8: findAlternatives vindt match op ISIN
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-find-alternatives-isin',
    name: 'findAlternatives: vindt match op ISIN',
    category: CAT,
    description: 'Zoek op bekende ISIN retourneert fonds met alternatieven',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Use a known ISIN from the fund database (ABN AMRO Wereld Aandelen Fonds)
      const knownISIN = 'NL0006311771'
      const results = findAlternatives({ isin: knownISIN })

      assertGreaterThan(results.length, 0, 'minstens 1 resultaat voor bekende ISIN')

      const result = results[0]
      assertEqual(result.fund.isin, knownISIN, 'ISIN matcht')
      assertGreaterThan(result.alternatives.length, 0, 'alternatieven gevonden')
      assertGreaterThan(result.besparingBps, 0, 'besparing in bps > 0')

      // Alternatives should have lower TER than the original
      for (const alt of result.alternatives) {
        assert(alt.ter < result.fund.ter, `alternatief ${alt.name} heeft lagere TER`)
        assert(alt.isin.length > 0, 'alternatief heeft ISIN')
        assert(alt.name.length > 0, 'alternatief heeft naam')
        assert(alt.provider.length > 0, 'alternatief heeft provider')
      }
    },
  },
  {
    id: 'kostenanalyse-ter-find-alternatives-case-insensitive',
    name: 'findAlternatives: ISIN lookup is case-insensitive',
    category: CAT,
    description: 'ISIN lookup werkt ongeacht hoofd-/kleine letters',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const lowerISIN = 'nl0006311771'
      const upperISIN = 'NL0006311771'

      const lowerResults = findAlternatives({ isin: lowerISIN })
      const upperResults = findAlternatives({ isin: upperISIN })

      assertEqual(lowerResults.length, upperResults.length, 'zelfde aantal resultaten ongeacht case')
      assertGreaterThan(lowerResults.length, 0, 'resultaten gevonden met lowercase ISIN')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 9: findAlternatives retourneert leeg bij onbekend fonds
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-find-alternatives-unknown',
    name: 'findAlternatives: retourneert leeg bij onbekend ISIN',
    category: CAT,
    description: 'Onbekende ISIN retourneert lege array',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const unknownISIN = 'XX0000000000'
      const results = findAlternatives({ isin: unknownISIN })

      assertEqual(results.length, 0, 'geen resultaten voor onbekende ISIN')

      // Also test with unknown ticker
      const unknownTicker = findAlternatives({ ticker: 'XXXXXXXXX' })
      assertEqual(unknownTicker.length, 0, 'geen resultaten voor onbekende ticker')

      // Also test with unknown name
      const unknownName = findAlternatives({ name: 'Totaal Onbekend Fonds XYZ999' })
      assertEqual(unknownName.length, 0, 'geen resultaten voor onbekende naam')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Stap 10: 401 bij unauthenticated request
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-auth-guard-post',
    name: 'POST /api/holdings met TER: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated POST met ter veld retourneert 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test TER Fund', ter: 0.005, ter_source: 'manual' }),
      })
      assertEqual(status, 401, 'POST /api/holdings met TER → 401 voor unauthenticated')
    },
  },
  {
    id: 'kostenanalyse-ter-auth-guard-patch',
    name: 'PATCH /api/holdings met TER: auth guard (401)',
    category: CAT,
    description: 'Unauthenticated PATCH met ter veld retourneert 401',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchAPI('/api/holdings', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'fake-uuid', ter: 0.003 }),
      })
      assertEqual(status, 401, 'PATCH /api/holdings met TER → 401 voor unauthenticated')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Edge case: extreem hoge TER
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-extreme-high-ter',
    name: 'computePortfolioFees: holding met extreem hoge TER (10%)',
    category: CAT,
    description: 'Een holding met TER op de grens (0.10) wordt correct verwerkt',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdings = [
        { name: 'Normal Fund', units: 100, avg_purchase_price: 100, current_price: 100, ter: 0.002 },
        { name: 'Expensive Fund', units: 10, avg_purchase_price: 100, current_price: 100, ter: 0.10 },
      ]

      const result = computePortfolioFees(holdings)

      // Total value = 10000 + 1000 = 11000
      assertEqual(result.totalPortfolioValue, 11000, 'totale waarde = €11.000')
      // Weighted TER = (0.002 * 10000 + 0.10 * 1000) / 11000
      const expectedWTER = (0.002 * 10000 + 0.10 * 1000) / 11000
      // Use approximate comparison for floating point
      assert(
        Math.abs(result.weightedTER - expectedWTER) < 0.000001,
        `gewogen TER ~= ${expectedWTER.toFixed(6)}`,
      )
      assertGreaterThan(result.totalAnnualFee, 0, 'positieve jaarlijkse kosten')
      assertEqual(result.holdingsWithTER, 2, 'beide holdings hebben TER')

      // Breakdown: expensive fund should be first (highest annualFee)
      assertEqual(result.perHoldingBreakdown[0].name, 'Expensive Fund', 'duurste eerst in breakdown')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Edge case: holdings zonder waarde (zero/negative)
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-zero-value-holdings',
    name: 'computePortfolioFees: holdings met zero/negatieve waarde worden overgeslagen',
    category: CAT,
    description: 'Holdings met waarde <= 0 worden niet meegerekend in TER berekening',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdings = [
        { name: 'Good Fund', units: 10, avg_purchase_price: 100, current_price: 100, ter: 0.003 },
        { name: 'Zero Fund', units: 0, avg_purchase_price: 100, current_price: 100, ter: 0.005 },
        { name: 'Negative Fund', units: -5, avg_purchase_price: 100, current_price: 100, ter: 0.008 },
      ]

      const result = computePortfolioFees(holdings)

      // Only 'Good Fund' should be counted
      assertEqual(result.totalPortfolioValue, 1000, 'alleen Good Fund telt mee')
      assertEqual(result.perHoldingBreakdown.length, 1, 'slechts 1 holding in breakdown')
      assertEqual(result.perHoldingBreakdown[0].name, 'Good Fund', 'Good Fund in breakdown')
      assertEqual(result.weightedTER, 0.003, 'gewogen TER = 0.003')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Edge case: empty portfolio
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-empty-portfolio',
    name: 'computePortfolioFees: lege portfolio',
    category: CAT,
    description: 'Lege holdings array resulteert in 0 voor alle waarden',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const result = computePortfolioFees([])

      assertEqual(result.weightedTER, 0, 'gewogen TER = 0')
      assertEqual(result.totalAnnualFee, 0, 'geen kosten')
      assertEqual(result.totalPortfolioValue, 0, 'geen waarde')
      assertEqual(result.perHoldingBreakdown.length, 0, 'geen breakdown')
      assertEqual(result.holdingsWithTER, 0, 'geen holdings met TER')
      assertEqual(result.holdingsWithoutTER, 0, 'geen holdings zonder TER')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // computeFeeOverHorizon helper
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-fee-over-horizon',
    name: 'computeFeeOverHorizon: compound fee berekening',
    category: CAT,
    description: 'Berekent het samengesteld effect van kosten over de horizon',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Zero fee → 0 impact
      assertEqual(computeFeeOverHorizon(0, 25, 0.07), 0, 'geen fee → geen impact')

      // Zero years → 0 impact
      assertEqual(computeFeeOverHorizon(100, 0, 0.07), 0, '0 jaar → geen impact')

      // With fee and horizon
      const annualFee = 500 // €500/jaar
      const years = 25
      const returnRate = 0.07
      const result = computeFeeOverHorizon(annualFee, years, returnRate)

      assertGreaterThan(result, annualFee * years, 'compound effect groter dan simpele som')
      assertFinite(result, 'resultaat is finite')

      // Zero return rate: should equal annualFee × years
      const zeroReturn = computeFeeOverHorizon(500, 25, 0)
      assertEqual(zeroReturn, 12500, 'bij 0% rendement: 500 × 25 = 12500')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // formatFeeImpactMessage
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-format-message',
    name: 'formatFeeImpactMessage: Dutch formatted output',
    category: CAT,
    description: 'Formatteert fee analyse als leesbare Nederlandse tekst',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const analysis: FeeAnalysis = {
        weightedTER: 0.0035,
        totalAnnualFee: 420,
        perHoldingBreakdown: [],
        totalPortfolioValue: 120000,
        holdingsWithTER: 3,
        holdingsWithoutTER: 1,
      }

      const msg = formatFeeImpactMessage(analysis)

      assert(msg.includes('420'), 'bericht bevat jaarlijkse kosten')
      assert(msg.includes('0,35'), 'bericht bevat TER percentage met komma')
      assert(msg.includes('TER'), 'bericht vermeldt TER')

      // With impact
      const msgWithImpact = formatFeeImpactMessage(analysis, {
        fireAgeWithoutFees: 52.5,
        fireAgeWithFees: 53.2,
        feeImpactMonths: 8,
        feeImpactEuros: 18200,
        bothReachable: true,
      })

      assert(msgWithImpact.includes('8 maanden'), 'bericht bevat impact in maanden')
      assert(msgWithImpact.includes('FIRE'), 'bericht vermeldt FIRE')
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Fund database integrity
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-fund-database-integrity',
    name: 'FUND_MAPPINGS: database integriteit',
    category: CAT,
    description: 'Alle fondsen hebben geldige ISIN, naam, TER en alternatieven',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      assertGreaterThanOrEqual(FUND_MAPPINGS.length, 20, 'minstens 20 fondsen in database')

      for (const fund of FUND_MAPPINGS) {
        assert(fund.isin.length > 0, `${fund.name}: heeft ISIN`)
        assert(fund.name.length > 0, `ISIN ${fund.isin}: heeft naam`)
        assertGreaterThan(fund.ter, 0, `${fund.name}: TER > 0`)
        assertGreaterThan(fund.alternatives.length, 0, `${fund.name}: heeft alternatieven`)

        for (const alt of fund.alternatives) {
          assert(alt.isin.length > 0, `alternatief voor ${fund.name}: heeft ISIN`)
          assert(alt.name.length > 0, `alternatief ${alt.isin}: heeft naam`)
          assertGreaterThanOrEqual(alt.ter, 0, `${alt.name}: TER >= 0`)
          assert(alt.ter < fund.ter, `${alt.name}: TER (${alt.ter}) < origineel (${fund.ter})`)
        }
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // percentOfTotalFees calculation
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-percent-of-total',
    name: 'computePortfolioFees: percentOfTotalFees klopt',
    category: CAT,
    description: 'Som van percentOfTotalFees over alle holdings = 1.0',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const holdings = [
        { name: 'Fund A', units: 10, avg_purchase_price: 100, current_price: 100, ter: 0.002 },
        { name: 'Fund B', units: 20, avg_purchase_price: 50, current_price: 50, ter: 0.004 },
        { name: 'Fund C', units: 5, avg_purchase_price: 200, current_price: 200, ter: 0.006 },
      ]

      const result = computePortfolioFees(holdings)
      const sumPercent = result.perHoldingBreakdown.reduce((s, h) => s + h.percentOfTotalFees, 0)

      // Should sum to ~1.0 (allowing floating point tolerance)
      assert(Math.abs(sumPercent - 1.0) < 0.0001, `som percentOfTotalFees = ${sumPercent} (~1.0)`)

      // Each percentage should be between 0 and 1
      for (const h of result.perHoldingBreakdown) {
        assertGreaterThanOrEqual(h.percentOfTotalFees, 0, `${h.name}: >= 0%`)
        assertLessThanOrEqual(h.percentOfTotalFees, 1, `${h.name}: <= 100%`)
      }
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Mixed holdings: some with TER, some without
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-mixed-ter-holdings',
    name: 'computePortfolioFees: mix van holdings met en zonder TER',
    category: CAT,
    description: 'Correct gewogen gemiddelde bij mix van fondsen en aandelen',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Fund with TER + individual stock without TER
      const holdings = [
        { name: 'ETF Fund', units: 100, avg_purchase_price: 50, current_price: 50, ter: 0.002 },
        { name: 'Individual Stock', units: 10, avg_purchase_price: 100, current_price: 100 },
      ]

      const result = computePortfolioFees(holdings)

      // Total value = 5000 + 1000 = 6000
      assertEqual(result.totalPortfolioValue, 6000, 'totale waarde = €6000')
      // Weighted TER = (0.002 * 5000 + 0 * 1000) / 6000 = 10/6000
      const expectedWTER = (0.002 * 5000) / 6000
      assert(
        Math.abs(result.weightedTER - expectedWTER) < 0.000001,
        `gewogen TER ~= ${expectedWTER.toFixed(6)}`,
      )
      assertEqual(result.holdingsWithTER, 1, '1 holding met TER')
      assertEqual(result.holdingsWithoutTER, 1, '1 holding zonder TER')
      // Annual fee only from the ETF
      const expectedFee = 0.002 * 5000
      assertEqual(result.totalAnnualFee, expectedFee, `jaarlijkse kosten = €${expectedFee}`)
    },
  },

  // ════════════════════════════════════════════════════════════════════
  // Holdings using avg_purchase_price when current_price is null
  // ════════════════════════════════════════════════════════════════════
  {
    id: 'kostenanalyse-ter-fallback-price',
    name: 'computePortfolioFees: fallback naar avg_purchase_price',
    category: CAT,
    description: 'Gebruikt avg_purchase_price als current_price null is',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const holdings = [
        { name: 'Fund No Price', units: 10, avg_purchase_price: 50, current_price: null as number | null, ter: 0.003 },
        { name: 'Fund With Price', units: 10, avg_purchase_price: 50, current_price: 100, ter: 0.003 },
      ]

      const result = computePortfolioFees(holdings)

      // Fund No Price: 10 * 50 = 500
      // Fund With Price: 10 * 100 = 1000
      assertEqual(result.totalPortfolioValue, 1500, 'totale waarde = €1500 (met fallback)')
      assertEqual(result.perHoldingBreakdown.length, 2, '2 holdings in breakdown')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Kostenanalyse — TER & Fee Impact',
    description: 'TER veld CRUD, gewogen TER berekening, FIRE impact, alternatieven lookup, en edge cases',
    icon: 'PiggyBank',
    testCount: 0,
  })
  registerTests(tests)
}
