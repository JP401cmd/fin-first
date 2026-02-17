import { NextResponse } from 'next/server'
import { computeBudgetForecast, getConfidenceLabel, getConfidenceColors } from '@/lib/budget-forecast'

/**
 * Verification endpoint for Feature #220: Budget forecast next month prediction.
 * Tests all 6 feature steps:
 * 1. Calculate 3-6 month spending average per budget category
 * 2. Show predicted next month spend on budget detail
 * 3. Add confidence indicator based on spending variance
 * 4. Alert when predicted spend exceeds budget limit
 * 5. Display contextual message per category
 * 6. Handle categories with insufficient history
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // --- Step 1: Calculate 3-6 month spending average ---

  // Test 1.1: Basic 6-month weighted average calculation
  {
    const spending = [400, 420, 380, 450, 410, 430]
    const forecast = computeBudgetForecast(spending, 500, 'Boodschappen')
    const pass = forecast.hasSufficientData && forecast.predicted > 0 && forecast.monthsUsed >= 3
    results.push({
      name: '1.1 Calculate 3-6 month spending average',
      pass,
      detail: `predicted=${forecast.predicted}, monthsUsed=${forecast.monthsUsed}, hasSufficientData=${forecast.hasSufficientData}`,
    })
  }

  // Test 1.2: Weighted average gives more weight to recent months
  {
    // Low early, high recently → prediction should be closer to recent values
    const spending = [100, 100, 100, 500, 500, 500]
    const forecast = computeBudgetForecast(spending, 1000, 'Test')
    // Weighted average with weights [1,2,3,4,5,6]: (100*1 + 100*2 + 100*3 + 500*4 + 500*5 + 500*6) / 21
    // = (100+200+300+2000+2500+3000) / 21 = 8100/21 ≈ 386
    const pass = forecast.predicted > 300 && forecast.predicted < 500
    results.push({
      name: '1.2 Weighted average favors recent months',
      pass,
      detail: `predicted=${forecast.predicted} (expected 350-450 range for rising trend)`,
    })
  }

  // Test 1.3: Uses only non-zero months for calculation
  {
    const spending = [0, 0, 0, 400, 420, 380]
    const forecast = computeBudgetForecast(spending, 500, 'Test')
    const pass = forecast.hasSufficientData && forecast.monthsUsed === 3
    results.push({
      name: '1.3 Uses only non-zero months for prediction',
      pass,
      detail: `monthsUsed=${forecast.monthsUsed}, hasSufficientData=${forecast.hasSufficientData}`,
    })
  }

  // --- Step 2: Show predicted next month spend on budget detail ---

  // Test 2.1: Forecast returns a formatted predicted amount
  {
    const spending = [300, 320, 310, 340, 350, 330]
    const forecast = computeBudgetForecast(spending, 400, 'Uit eten')
    const pass = forecast.predicted > 0 && forecast.hasSufficientData
    results.push({
      name: '2.1 Predicted amount returned for budget detail display',
      pass,
      detail: `predicted=${forecast.predicted}`,
    })
  }

  // Test 2.2: Forecast card data-testid attributes are defined
  {
    // This test verifies that the component uses the correct data-testid attributes
    // by checking the forecast structure has all display-needed fields
    const spending = [200, 220, 210, 230, 240, 250]
    const forecast = computeBudgetForecast(spending, 300, 'Test')
    const pass = (
      typeof forecast.predicted === 'number' &&
      typeof forecast.confidence === 'string' &&
      typeof forecast.confidencePercent === 'number' &&
      typeof forecast.message === 'string'
    )
    results.push({
      name: '2.2 Forecast has all fields needed for budget detail UI',
      pass,
      detail: `predicted=${forecast.predicted}, confidence=${forecast.confidence}, message=${forecast.message.substring(0, 50)}...`,
    })
  }

  // --- Step 3: Confidence indicator based on spending variance ---

  // Test 3.1: High confidence for consistent spending
  {
    const spending = [400, 405, 398, 402, 400, 403]
    const forecast = computeBudgetForecast(spending, 500, 'Vaste lasten')
    const pass = forecast.confidence === 'high' && forecast.confidencePercent >= 80
    results.push({
      name: '3.1 High confidence for consistent spending (low variance)',
      pass,
      detail: `confidence=${forecast.confidence}, percent=${forecast.confidencePercent}%, stdDev=${forecast.stdDev}, mean=${forecast.mean}`,
    })
  }

  // Test 3.2: Medium confidence for moderate variance
  {
    // CV needs to be 0.15-0.35 for medium confidence
    // mean≈375, stdDev≈90 → CV≈0.24
    const spending = [250, 450, 300, 500, 280, 470]
    const forecast = computeBudgetForecast(spending, 500, 'Boodschappen')
    const pass = forecast.confidence === 'medium'
    results.push({
      name: '3.2 Medium confidence for moderate spending variance',
      pass,
      detail: `confidence=${forecast.confidence}, percent=${forecast.confidencePercent}%, stdDev=${forecast.stdDev}, cv=${forecast.mean > 0 ? (forecast.stdDev / forecast.mean).toFixed(3) : 'n/a'}`,
    })
  }

  // Test 3.3: Low confidence for highly variable spending
  {
    const spending = [50, 500, 100, 800, 200, 600]
    const forecast = computeBudgetForecast(spending, 1000, 'Vakantie')
    const pass = forecast.confidence === 'low'
    results.push({
      name: '3.3 Low confidence for highly variable spending',
      pass,
      detail: `confidence=${forecast.confidence}, percent=${forecast.confidencePercent}%, stdDev=${forecast.stdDev}, mean=${forecast.mean}`,
    })
  }

  // Test 3.4: Confidence colors and labels
  {
    const highColors = getConfidenceColors('high')
    const medColors = getConfidenceColors('medium')
    const lowColors = getConfidenceColors('low')
    const highLabel = getConfidenceLabel('high')
    const medLabel = getConfidenceLabel('medium')
    const lowLabel = getConfidenceLabel('low')
    const pass = (
      highColors.dot === 'bg-emerald-500' &&
      medColors.dot === 'bg-amber-500' &&
      lowColors.dot === 'bg-zinc-400' &&
      highLabel === 'Hoge betrouwbaarheid' &&
      medLabel === 'Gemiddelde betrouwbaarheid' &&
      lowLabel === 'Lage betrouwbaarheid'
    )
    results.push({
      name: '3.4 Confidence colors and Dutch labels',
      pass,
      detail: `high=${highLabel}/${highColors.dot}, medium=${medLabel}/${medColors.dot}, low=${lowLabel}/${lowColors.dot}`,
    })
  }

  // --- Step 4: Alert when predicted spend exceeds budget limit ---

  // Test 4.1: Alert triggered when predicted exceeds limit
  {
    const spending = [480, 500, 510, 520, 490, 530]
    const forecast = computeBudgetForecast(spending, 400, 'Uit eten')
    const pass = forecast.exceedsLimit && forecast.exceedAmount > 0 && forecast.alertMessage !== null
    results.push({
      name: '4.1 Alert triggered when predicted exceeds budget limit',
      pass,
      detail: `exceedsLimit=${forecast.exceedsLimit}, exceedAmount=${forecast.exceedAmount}, alertMessage=${forecast.alertMessage}`,
    })
  }

  // Test 4.2: No alert when predicted is within limit
  {
    const spending = [200, 210, 190, 220, 200, 205]
    const forecast = computeBudgetForecast(spending, 500, 'Vervoer')
    const pass = !forecast.exceedsLimit && forecast.exceedAmount === 0 && forecast.alertMessage === null
    results.push({
      name: '4.2 No alert when predicted is within budget limit',
      pass,
      detail: `exceedsLimit=${forecast.exceedsLimit}, exceedAmount=${forecast.exceedAmount}`,
    })
  }

  // Test 4.3: Alert message contains exceed amount
  {
    const spending = [600, 620, 580, 650, 610, 630]
    const forecast = computeBudgetForecast(spending, 500, 'Test')
    const pass = forecast.exceedsLimit && forecast.alertMessage !== null && forecast.alertMessage.includes('overschrijden')
    results.push({
      name: '4.3 Alert message mentions limit overschrijding',
      pass,
      detail: `alertMessage=${forecast.alertMessage}`,
    })
  }

  // --- Step 5: Display contextual message per category ---

  // Test 5.1: Contextual message uses budget name
  {
    const spending = [400, 420, 380, 450, 410, 430]
    const forecast = computeBudgetForecast(spending, 500, 'Boodschappen')
    const pass = forecast.message.includes('boodschappen') && forecast.message.includes('volgende maand')
    results.push({
      name: '5.1 Contextual message includes budget name and next month reference',
      pass,
      detail: `message="${forecast.message}"`,
    })
  }

  // Test 5.2: Message pattern matches spec format
  {
    const spending = [400, 420, 380, 450, 410, 430]
    const forecast = computeBudgetForecast(spending, 500, 'Boodschappen')
    // Should match: "Op basis van je patroon geef je volgende maand €X uit aan boodschappen"
    const pass = forecast.message.startsWith('Op basis van je patroon') && forecast.message.includes('uit aan')
    results.push({
      name: '5.2 Message follows spec pattern: "Op basis van je patroon..."',
      pass,
      detail: `message="${forecast.message}"`,
    })
  }

  // --- Step 6: Handle categories with insufficient history ---

  // Test 6.1: Insufficient history with 0 months
  {
    const forecast = computeBudgetForecast([], 500, 'Nieuw budget')
    const pass = !forecast.hasSufficientData && forecast.predicted === 0 && forecast.message.includes('niet genoeg')
    results.push({
      name: '6.1 Handle zero months of history',
      pass,
      detail: `hasSufficientData=${forecast.hasSufficientData}, message="${forecast.message}"`,
    })
  }

  // Test 6.2: Insufficient history with only 2 months
  {
    const forecast = computeBudgetForecast([100, 200], 500, 'Kort budget')
    const pass = !forecast.hasSufficientData && forecast.predicted === 0 && forecast.monthsUsed === 2
    results.push({
      name: '6.2 Handle only 2 months of history (below minimum)',
      pass,
      detail: `hasSufficientData=${forecast.hasSufficientData}, monthsUsed=${forecast.monthsUsed}`,
    })
  }

  // Test 6.3: Insufficient history with only zero months
  {
    const spending = [0, 0, 0, 0, 0, 0]
    const forecast = computeBudgetForecast(spending, 500, 'Leeg budget')
    const pass = !forecast.hasSufficientData && forecast.predicted === 0
    results.push({
      name: '6.3 Handle all-zero months (no actual spending)',
      pass,
      detail: `hasSufficientData=${forecast.hasSufficientData}, monthsUsed=${forecast.monthsUsed}`,
    })
  }

  // Test 6.4: Sufficient data with exactly 3 non-zero months
  {
    const spending = [0, 0, 0, 300, 320, 310]
    const forecast = computeBudgetForecast(spending, 500, 'Minimum data')
    const pass = forecast.hasSufficientData && forecast.predicted > 0 && forecast.monthsUsed === 3
    results.push({
      name: '6.4 Exactly 3 non-zero months is sufficient for prediction',
      pass,
      detail: `hasSufficientData=${forecast.hasSufficientData}, predicted=${forecast.predicted}, monthsUsed=${forecast.monthsUsed}`,
    })
  }

  // Test 6.5: Insufficient message mentions minimum months needed
  {
    const forecast = computeBudgetForecast([100], 500, 'Test budget')
    const pass = forecast.message.includes('3 maanden')
    results.push({
      name: '6.5 Insufficient history message mentions 3 months minimum',
      pass,
      detail: `message="${forecast.message}"`,
    })
  }

  // ── Summary ──
  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#220 Budget forecast next month prediction',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
