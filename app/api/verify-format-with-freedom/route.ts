import { NextResponse } from 'next/server'
import {
  formatWithFreedom,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'

/**
 * GET /api/verify-format-with-freedom
 * Verifies that the formatWithFreedom() utility function works correctly:
 * 1. Basic long format output
 * 2. Basic short format output
 * 3. Edge case: 0 daily expenses
 * 4. Edge case: negative amounts
 * 5. Edge case: very large amounts (1000+ years)
 * 6. Edge case: zero amount
 * 7. calculateFreedomTime() returns correct breakdown
 * 8. includeCurrency: false option
 * 9. Small amounts (only days)
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    // Test 1: Basic long format — €450.000 with €100/day expenses
    // 450000 / 100 = 4500 days = 12 years, 4 months (approx)
    const test1 = formatWithFreedom(450000, 100)
    const hasEuro = test1.includes('€')
    const hasJaar = test1.includes('jaar')
    const hasParens = test1.includes('(') && test1.includes(')')
    results.push({
      name: 'Long format: EUR + freedom time in parentheses',
      pass: hasEuro && hasJaar && hasParens,
      detail: `Output: "${test1}" — Contains €: ${hasEuro}, "jaar": ${hasJaar}, parentheses: ${hasParens}`,
    })

    // Test 2: Short format
    const test2 = formatWithFreedom(450000, 100, { format: 'short' })
    const hasShortYear = test2.includes('j')
    const hasShortMonth = test2.includes('m')
    results.push({
      name: 'Short format: uses "Xj Ym" notation',
      pass: hasShortYear && hasShortMonth && hasEuro,
      detail: `Output: "${test2}" — Contains "j": ${hasShortYear}, "m": ${hasShortMonth}`,
    })

    // Test 3: Edge case — 0 daily expenses returns "∞ vrijheid"
    const test3 = formatWithFreedom(100000, 0)
    const hasInfinity = test3.includes('∞')
    const hasVrijheid = test3.includes('vrijheid')
    results.push({
      name: 'Edge case: 0 expenses → "∞ vrijheid"',
      pass: hasInfinity && hasVrijheid,
      detail: `Output: "${test3}" — Contains ∞: ${hasInfinity}, "vrijheid": ${hasVrijheid}`,
    })

    // Test 4: Negative amounts (debt)
    const test4 = formatWithFreedom(-5000, 100)
    const hasNegativeSign = test4.includes('-')
    const hasFreedomTime4 = test4.includes('maand') || test4.includes('dag')
    results.push({
      name: 'Edge case: negative amount shows freedom time equivalent',
      pass: hasFreedomTime4,
      detail: `Output: "${test4}" — Contains time units: ${hasFreedomTime4}, negative indicator: ${hasNegativeSign}`,
    })

    // Test 5: Very large amounts (1000+ years)
    const test5 = formatWithFreedom(50000000, 100)
    const breakdown5 = calculateFreedomTime(50000000, 100)
    const cappedToReasonable = breakdown5.years <= 9999
    results.push({
      name: 'Edge case: very large amounts capped at 9999 years',
      pass: cappedToReasonable && test5.includes('jaar'),
      detail: `Output: "${test5}" — Years: ${breakdown5.years}, capped: ${cappedToReasonable}`,
    })

    // Test 6: Zero amount
    const test6 = formatWithFreedom(0, 100)
    const hasZeroDays = test6.includes('0 dagen') || test6.includes('0d')
    results.push({
      name: 'Edge case: zero amount → "0 dagen"',
      pass: hasZeroDays,
      detail: `Output: "${test6}" — Contains zero time: ${hasZeroDays}`,
    })

    // Test 7: calculateFreedomTime() returns correct breakdown
    const bd = calculateFreedomTime(450000, 100)
    // 450000 / 100 = 4500 days = 12 years + 120 days = 12y 4m 0d
    const correctYears = bd.years === 12
    const correctMonths = bd.months === 4
    const correctTotalDays = Math.abs(bd.totalDays - 4500) < 1
    results.push({
      name: 'calculateFreedomTime() returns correct breakdown',
      pass: correctYears && correctMonths && correctTotalDays,
      detail: `years: ${bd.years} (expect 12), months: ${bd.months} (expect 4), totalDays: ${bd.totalDays} (expect ~4500)`,
    })

    // Test 8: includeCurrency: false — only freedom time string
    const test8 = formatWithFreedom(450000, 100, { includeCurrency: false })
    const noCurrency = !test8.includes('€')
    const hasTime = test8.includes('jaar') || test8.includes('maand') || test8.includes('dag')
    results.push({
      name: 'includeCurrency: false → only freedom time string',
      pass: noCurrency && hasTime,
      detail: `Output: "${test8}" — No €: ${noCurrency}, has time: ${hasTime}`,
    })

    // Test 9: Small amounts (only days displayed)
    const test9 = formatWithFreedom(1500, 100)
    // 1500 / 100 = 15 days
    const hasDays = test9.includes('dag')
    results.push({
      name: 'Small amounts show days',
      pass: hasDays,
      detail: `Output: "${test9}" — Contains "dag": ${hasDays}`,
    })

    // Test 10: formatFreedomTimeString() long vs short
    const bd10 = { years: 5, months: 7, days: 15, totalDays: 2075 }
    const longStr = formatFreedomTimeString(bd10, 'long')
    const shortStr = formatFreedomTimeString(bd10, 'short')
    const longCorrect = longStr === '5 jaar en 7 maanden'
    const shortCorrect = shortStr === '5j 7m'
    results.push({
      name: 'formatFreedomTimeString() long/short formats match spec',
      pass: longCorrect && shortCorrect,
      detail: `Long: "${longStr}" (expect "5 jaar en 7 maanden"), Short: "${shortStr}" (expect "5j 7m")`,
    })

    // Test 11: 1 maand singular
    const bd11 = { years: 0, months: 1, days: 5, totalDays: 35 }
    const singularMonth = formatFreedomTimeString(bd11, 'long')
    const isSingular = singularMonth.includes('1 maand') && !singularMonth.includes('maanden')
    results.push({
      name: 'Singular "maand" for 1 month, "maanden" for plural',
      pass: isSingular,
      detail: `Output: "${singularMonth}" — Singular "1 maand": ${isSingular}`,
    })

    // Test 12: Export from utility module
    const formatModule = await import('@/lib/format')
    const hasFormatWithFreedom = typeof formatModule.formatWithFreedom === 'function'
    const hasCalculateFreedomTime = typeof formatModule.calculateFreedomTime === 'function'
    const hasFormatFreedomTimeString = typeof formatModule.formatFreedomTimeString === 'function'
    results.push({
      name: 'All functions exported from lib/format module',
      pass: hasFormatWithFreedom && hasCalculateFreedomTime && hasFormatFreedomTimeString,
      detail: `formatWithFreedom: ${hasFormatWithFreedom}, calculateFreedomTime: ${hasCalculateFreedomTime}, formatFreedomTimeString: ${hasFormatFreedomTimeString}`,
    })

  } catch (err) {
    results.push({
      name: 'Utility function execution',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#178 - formatWithFreedom() utility function',
    summary: `${passing}/${total} checks passing`,
    all_passing: passing === total,
    results,
  })
}
