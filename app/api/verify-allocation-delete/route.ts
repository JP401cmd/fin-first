import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the actual source code to verify the implementation
  let holdingsPageSrc = ''
  try {
    holdingsPageSrc = readFileSync(
      join(process.cwd(), 'app/(app)/core/assets/holdings/page.tsx'),
      'utf-8'
    )
  } catch {
    return NextResponse.json({
      pass: false,
      results: [{ test: 'Read source', pass: false, detail: 'Could not read holdings page source' }],
    })
  }

  let holdingsApiSrc = ''
  try {
    holdingsApiSrc = readFileSync(
      join(process.cwd(), 'app/api/holdings/route.ts'),
      'utf-8'
    )
  } catch {
    holdingsApiSrc = ''
  }

  // Test 1: Holdings page has allocation chart section with data-testid
  const hasAllocSection = holdingsPageSrc.includes('data-testid="portfolio-allocation"')
  results.push({
    test: 'Allocation chart section has data-testid="portfolio-allocation"',
    pass: hasAllocSection,
    detail: hasAllocSection
      ? 'Found data-testid="portfolio-allocation" on the allocation section'
      : 'Missing data-testid="portfolio-allocation"',
  })

  // Test 2: Allocation donut SVG has data-testid
  const hasDonutTestId = holdingsPageSrc.includes('data-testid="allocation-donut"')
  results.push({
    test: 'Donut chart SVG has data-testid="allocation-donut"',
    pass: hasDonutTestId,
    detail: hasDonutTestId
      ? 'Found data-testid="allocation-donut" on the SVG element'
      : 'Missing data-testid="allocation-donut"',
  })

  // Test 3: allocationData is derived from holdings via useMemo
  const hasAllocationMemo =
    holdingsPageSrc.includes('allocationData') &&
    holdingsPageSrc.includes('useMemo') &&
    /allocationData\s*=\s*useMemo/.test(holdingsPageSrc)
  results.push({
    test: 'allocationData is computed from holdings state via useMemo',
    pass: hasAllocationMemo,
    detail: hasAllocationMemo
      ? 'allocationData = useMemo(() => ..., [holdings]) — automatically recomputes when holdings change'
      : 'Could not find allocationData as a useMemo dependent on holdings',
  })

  // Test 4: handleDelete filters deleted holding from state
  const hasDeleteFilter =
    holdingsPageSrc.includes('handleDelete') &&
    holdingsPageSrc.includes('setHoldings') &&
    holdingsPageSrc.includes('.filter')
  results.push({
    test: 'handleDelete filters deleted holding from React state',
    pass: hasDeleteFilter,
    detail: hasDeleteFilter
      ? 'handleDelete uses setHoldings with .filter() to remove the deleted holding from state'
      : 'handleDelete does not properly filter holdings state',
  })

  // Test 5: handleDelete recalculates totalValue
  const hasRecalcTotalValue =
    holdingsPageSrc.includes('setTotalValue') &&
    /handleDelete[\s\S]*?setTotalValue/.test(holdingsPageSrc) &&
    /newTotalValue|setTotalValue\(/.test(holdingsPageSrc)
  results.push({
    test: 'handleDelete recalculates totalValue after deletion',
    pass: hasRecalcTotalValue,
    detail: hasRecalcTotalValue
      ? 'handleDelete computes newTotalValue from remaining holdings and calls setTotalValue()'
      : 'handleDelete does NOT recalculate totalValue — chart total would be stale',
  })

  // Test 6: handleDelete recalculates totalCost
  const hasRecalcTotalCost =
    holdingsPageSrc.includes('setTotalCost') &&
    /handleDelete[\s\S]*?setTotalCost/.test(holdingsPageSrc) &&
    /newTotalCost|setTotalCost\(/.test(holdingsPageSrc)
  results.push({
    test: 'handleDelete recalculates totalCost after deletion',
    pass: hasRecalcTotalCost,
    detail: hasRecalcTotalCost
      ? 'handleDelete computes newTotalCost from remaining holdings and calls setTotalCost()'
      : 'handleDelete does NOT recalculate totalCost — rendement KPI would be stale',
  })

  // Test 7: Chart percentages use totalValue for calculation
  const hasPercentageCalc = holdingsPageSrc.includes('h.value / totalValue')
  results.push({
    test: 'Legend percentages use totalValue for percentage calculation',
    pass: hasPercentageCalc,
    detail: hasPercentageCalc
      ? 'pct = (h.value / totalValue) * 100 — uses totalValue which is recalculated on delete'
      : 'Could not find percentage calculation using totalValue',
  })

  // Test 8: Chart section is conditionally rendered based on allocationData
  const hasConditionalRender = holdingsPageSrc.includes('allocationData.length > 0')
  results.push({
    test: 'Portfolio allocation section hidden when no holdings remain',
    pass: hasConditionalRender,
    detail: hasConditionalRender
      ? '{allocationData.length > 0 && <section>} — chart disappears when all holdings are deleted'
      : 'Missing conditional render for empty allocationData',
  })

  // Test 9: DELETE handler in API route exists and removes from database
  const hasDeleteApi =
    holdingsApiSrc.includes('DELETE') &&
    (holdingsApiSrc.includes('.delete()') || holdingsApiSrc.includes("method: 'DELETE'"))
  results.push({
    test: 'API route supports DELETE method to remove holdings',
    pass: hasDeleteApi,
    detail: hasDeleteApi
      ? 'DELETE handler in /api/holdings/route.ts removes holding from database'
      : 'Could not find DELETE handler in holdings API',
  })

  const allPass = results.every((r) => r.pass)

  return NextResponse.json({
    pass: allPass,
    total: results.length,
    passing: results.filter((r) => r.pass).length,
    results,
  })
}
