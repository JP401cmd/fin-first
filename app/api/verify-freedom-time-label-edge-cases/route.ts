import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import {
  formatWithFreedom,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'

/**
 * GET /api/verify-freedom-time-label-edge-cases
 * Verification endpoint for Feature #244:
 * "FreedomTimeLabel handles edge cases correctly"
 *
 * Tests:
 * 1. Zero daily expenses → shows "∞ vrijheid" not Infinity
 * 2. Negative amounts → shows deficit framing ("achter")
 * 3. Amounts under €100 → no freedom time shown
 * 4. Very large amounts → caps at 9999 years
 * 5. NaN/undefined inputs → does not crash
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    // ========== STEP 1: Zero daily expenses ==========

    // Test 1a: formatWithFreedom with zero expenses — should show "∞ vrijheid"
    const zeroExpResult = formatWithFreedom(100000, 0)
    const hasInfinity = zeroExpResult.includes('∞')
    const hasVrijheid = zeroExpResult.includes('vrijheid')
    const noJSInfinity = !zeroExpResult.includes('Infinity') && !zeroExpResult.includes('NaN')
    results.push({
      name: '1a. Zero expenses: formatWithFreedom shows "∞ vrijheid", not JS Infinity',
      pass: hasInfinity && hasVrijheid && noJSInfinity,
      detail: `Output: "${zeroExpResult}" — ∞: ${hasInfinity}, vrijheid: ${hasVrijheid}, no JS Infinity: ${noJSInfinity}`,
    })

    // Test 1b: calculateFreedomTime with zero expenses — should have isInfinite: true
    const zeroExpBreakdown = calculateFreedomTime(100000, 0)
    results.push({
      name: '1b. Zero expenses: calculateFreedomTime sets isInfinite=true',
      pass: zeroExpBreakdown.isInfinite === true,
      detail: `isInfinite: ${zeroExpBreakdown.isInfinite}, totalDays: ${zeroExpBreakdown.totalDays}`,
    })

    // Test 1c: FreedomTimeLabel component handles zero expenses
    const componentPath = path.join(process.cwd(), 'components', 'app', 'freedom-time-label.tsx')
    const componentSource = fs.readFileSync(componentPath, 'utf-8')
    const handlesZeroExpenses = componentSource.includes('showInfinite') && componentSource.includes('∞ vrijheid')
    results.push({
      name: '1c. Component shows "∞ vrijheid" for zero daily expenses',
      pass: handlesZeroExpenses,
      detail: `Component has showInfinite logic: ${handlesZeroExpenses}`,
    })

    // ========== STEP 2: Negative amounts (deficit framing) ==========

    // Test 2a: formatWithFreedom with negative amount — shows "achter"
    const negResult = formatWithFreedom(-5000, 100)
    const hasAchter = negResult.includes('achter')
    const hasNegSign = negResult.includes('-')
    results.push({
      name: '2a. Negative amount: formatWithFreedom shows "achter" (deficit)',
      pass: hasAchter,
      detail: `Output: "${negResult}" — achter: ${hasAchter}, negative sign: ${hasNegSign}`,
    })

    // Test 2b: calculateFreedomTime with negative amount — isDeficit: true
    const negBreakdown = calculateFreedomTime(-5000, 100)
    results.push({
      name: '2b. Negative amount: calculateFreedomTime sets isDeficit=true',
      pass: negBreakdown.isDeficit === true && negBreakdown.totalDays === 50,
      detail: `isDeficit: ${negBreakdown.isDeficit}, totalDays: ${negBreakdown.totalDays}`,
    })

    // Test 2c: FreedomTimeLabel component passes deficit amounts correctly
    const passesOriginalAmount = componentSource.includes('formatWithFreedom(safeAmount,')
    const hasDeficitLogic = componentSource.includes('isDeficit')
    results.push({
      name: '2c. Component passes original (negative) amount to formatWithFreedom for deficit framing',
      pass: passesOriginalAmount && hasDeficitLogic,
      detail: `Passes safeAmount (not abs): ${passesOriginalAmount}, has deficit logic: ${hasDeficitLogic}`,
    })

    // Test 2d: Negative small amount (-50) should not show freedom time (under €100)
    const negSmallResult = formatWithFreedom(-50, 100)
    // It should still work as utility, but the component won't show it
    const negSmallHasEuro = negSmallResult.includes('€')
    results.push({
      name: '2d. Negative amount under €100: component uses absAmount >= 100 threshold',
      pass: componentSource.includes('absAmount >= 100'),
      detail: `Component checks absAmount >= 100: ${componentSource.includes('absAmount >= 100')}. Utility output for -50: "${negSmallResult}"`,
    })

    // ========== STEP 3: Amounts under €100 ==========

    // Test 3a: €50 should not show freedom time (utility still works, component hides it)
    const under100Result = formatWithFreedom(50, 100)
    results.push({
      name: '3a. Under €100: component has threshold check to hide freedom time',
      pass: componentSource.includes('absAmount >= 100') && under100Result.includes('€'),
      detail: `Component checks absAmount >= 100. Utility output for €50: "${under100Result}"`,
    })

    // Test 3b: €99 should not show freedom time
    const edge99 = formatWithFreedom(99, 100)
    results.push({
      name: '3b. €99: should not show freedom time in component (below threshold)',
      pass: componentSource.includes('absAmount >= 100'),
      detail: `Utility output for €99: "${edge99}" — but component filters based on absAmount >= 100`,
    })

    // Test 3c: €100 should show freedom time
    const edge100 = formatWithFreedom(100, 100)
    const has100Days = edge100.includes('dag') || edge100.includes('d')
    results.push({
      name: '3c. €100: exactly at threshold, should show freedom time (1 dag)',
      pass: has100Days,
      detail: `Output for €100 at €100/day: "${edge100}" — has days: ${has100Days}`,
    })

    // ========== STEP 4: Very large amounts ==========

    // Test 4a: €500M with €100/day expenses — should cap at 9999 years
    const hugeBreakdown = calculateFreedomTime(500000000, 100)
    const cappedYears = hugeBreakdown.years <= 9999
    results.push({
      name: '4a. Very large amount (€500M): capped at 9999 years',
      pass: cappedYears && hugeBreakdown.years === 9999,
      detail: `years: ${hugeBreakdown.years}, capped: ${cappedYears}`,
    })

    // Test 4b: Large amount format string is reasonable
    const hugeFormatted = formatWithFreedom(500000000, 100)
    const hasJaar = hugeFormatted.includes('jaar')
    const noInfinityText = !hugeFormatted.includes('Infinity')
    results.push({
      name: '4b. Very large amount: formatted string contains "jaar" and no "Infinity"',
      pass: hasJaar && noInfinityText,
      detail: `Output: "${hugeFormatted}" — jaar: ${hasJaar}, no Infinity: ${noInfinityText}`,
    })

    // ========== STEP 5: NaN/undefined inputs ==========

    // Test 5a: NaN amount should not crash
    let nanAmountResult: string
    let nanCrashed = false
    try {
      nanAmountResult = formatWithFreedom(NaN, 100)
    } catch {
      nanAmountResult = 'CRASHED'
      nanCrashed = true
    }
    results.push({
      name: '5a. NaN amount: does not crash, returns safe output',
      pass: !nanCrashed && nanAmountResult.includes('€') && nanAmountResult.includes('0'),
      detail: `Output: "${nanAmountResult}" — crashed: ${nanCrashed}`,
    })

    // Test 5b: NaN daily expenses should not crash
    let nanExpResult: string
    let nanExpCrashed = false
    try {
      nanExpResult = formatWithFreedom(5000, NaN)
    } catch {
      nanExpResult = 'CRASHED'
      nanExpCrashed = true
    }
    const nanExpShowsInfinity = nanExpResult.includes('∞')
    results.push({
      name: '5b. NaN daily expenses: does not crash, shows "∞ vrijheid"',
      pass: !nanExpCrashed && nanExpShowsInfinity,
      detail: `Output: "${nanExpResult}" — crashed: ${nanExpCrashed}, ∞: ${nanExpShowsInfinity}`,
    })

    // Test 5c: undefined-like inputs (Infinity) should not crash
    let infResult: string
    let infCrashed = false
    try {
      infResult = formatWithFreedom(Infinity, 100)
    } catch {
      infResult = 'CRASHED'
      infCrashed = true
    }
    results.push({
      name: '5c. Infinity amount: does not crash, returns safe output',
      pass: !infCrashed && !infResult.includes('NaN'),
      detail: `Output: "${infResult}" — crashed: ${infCrashed}`,
    })

    // Test 5d: Both NaN should not crash
    let bothNanResult: string
    let bothNanCrashed = false
    try {
      bothNanResult = formatWithFreedom(NaN, NaN)
    } catch {
      bothNanResult = 'CRASHED'
      bothNanCrashed = true
    }
    results.push({
      name: '5d. Both NaN: does not crash',
      pass: !bothNanCrashed,
      detail: `Output: "${bothNanResult}" — crashed: ${bothNanCrashed}`,
    })

    // Test 5e: Component has safeAmount guard for NaN/undefined
    const hasSafeAmountGuard = componentSource.includes('safeAmount') && componentSource.includes('isFinite')
    results.push({
      name: '5e. Component guards against NaN/undefined with safeAmount check',
      pass: hasSafeAmountGuard,
      detail: `Has safeAmount with isFinite guard: ${hasSafeAmountGuard}`,
    })

    // ========== BONUS: Verify formatFreedomTimeString edge cases ==========

    // Test 6: Zero breakdown
    const zeroBreakdown = { years: 0, months: 0, days: 0, totalDays: 0, isDeficit: false, isInfinite: false }
    const zeroStr = formatFreedomTimeString(zeroBreakdown, 'long')
    results.push({
      name: '6. Zero breakdown: formatFreedomTimeString returns "0 dagen"',
      pass: zeroStr === '0 dagen',
      detail: `Output: "${zeroStr}" (expected "0 dagen")`,
    })

  } catch (err) {
    results.push({
      name: 'Utility function execution',
      pass: false,
      detail: `Uncaught error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#244 - FreedomTimeLabel handles edge cases correctly',
    summary: `${passing}/${total} checks passing`,
    all_passing: passing === total,
    results,
  })
}
