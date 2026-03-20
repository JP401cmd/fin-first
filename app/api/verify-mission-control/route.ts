import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Mission control layout for De Kern.
 * Updated for #403–#406 refactor: 3-tab layout (Assets+Debts top, Budgets bottom).
 * Cash is merged into Assets. Budgets has two-column split layout.
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the KernMissionControl component source
  const componentPath = path.join(process.cwd(), 'components/app/core/kern-mission-control.tsx')
  let componentSrc = ''
  try {
    componentSrc = fs.readFileSync(componentPath, 'utf-8')
  } catch {
    return NextResponse.json({ error: 'Could not read kern-mission-control.tsx' }, { status: 500 })
  }

  // Read the core page source
  const corePagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
  let coreSrc = ''
  try {
    coreSrc = fs.readFileSync(corePagePath, 'utf-8')
  } catch {
    return NextResponse.json({ error: 'Could not read core/page.tsx' }, { status: 500 })
  }

  // Test 1: 3-tab layout (no separate Cash tab)
  results.push({
    test: '3-tab layout: Assets, Schulden, Budgetten (no Cash tab)',
    pass: componentSrc.includes("type TabKey = 'budgets' | 'assets' | 'debts'") &&
          !componentSrc.includes("'cash' as const"),
    detail: 'TabKey has exactly 3 values, no cash tab key',
  })

  // Test 2: Assets card includes cash accounts
  results.push({
    test: 'Assets card merges cash into assets',
    pass: componentSrc.includes('Always merge cash into assets') &&
          componentSrc.includes('Liquide middelen') &&
          componentSrc.includes('allAssetItems = [...cashItems, ...nonCashItems]'),
    detail: 'Cash accounts shown as "Liquide middelen" subsection in Assets card',
  })

  // Test 3: Budgets two-column split
  results.push({
    test: 'Budgets card has two-column split layout',
    pass: componentSrc.includes('lg:flex-row') &&
          componentSrc.includes('lg:w-[40%]') &&
          componentSrc.includes('nonExpenseTypeSummaries') &&
          componentSrc.includes('expenseSegments'),
    detail: 'Left column (40%): Inkomen/Sparen/Schulden. Right: individual Uitgaven',
  })

  // Test 4: Grid layout — Assets+Debts top, Budgets bottom
  results.push({
    test: 'Grid: Assets+Debts top row, Budgets full-width bottom',
    pass: componentSrc.includes('lg:grid-cols-2') &&
          componentSrc.includes('lg:col-span-2'),
    detail: '2-column grid with budgets spanning full width on bottom row',
  })

  // Test 5: Growth direction arrows in Assets card
  results.push({
    test: 'Assets card shows growth direction arrows',
    pass: componentSrc.includes('ArrowUpRight') &&
          componentSrc.includes('ArrowDownRight') &&
          componentSrc.includes('assetGrowthDirection'),
    detail: 'ArrowUpRight for up, ArrowDownRight for down, Minus for flat',
  })

  // Test 6: Debt progress bar
  results.push({
    test: 'Schulden card has payoff progress bar',
    pass: componentSrc.includes('debtProgress') &&
          componentSrc.includes('progressPct') &&
          componentSrc.includes('from-emerald-500 to-emerald-400'),
    detail: 'Progress bar with emerald gradient based on progressPct',
  })

  // Test 7: Status icons present
  results.push({
    test: 'Cards have status icons (CheckCircle2 / AlertTriangle)',
    pass: componentSrc.includes('CheckCircle2') &&
          componentSrc.includes('AlertTriangle'),
    detail: 'CheckCircle2 for healthy status, AlertTriangle for attention',
  })

  // Test 8: CTAs in cards
  results.push({
    test: 'Cards have CTA labels',
    pass: componentSrc.includes('Bekijk portfolio') &&
          componentSrc.includes('Beheer schulden') &&
          componentSrc.includes('Beheer budgetten'),
    detail: 'CTAs: Bekijk portfolio, Beheer schulden, Beheer budgetten',
  })

  // Test 9: KernMissionControl used in core client component
  const coreClientPath = path.join(process.cwd(), 'components/core/core-client.tsx')
  let coreClientSrc = ''
  try {
    coreClientSrc = fs.readFileSync(coreClientPath, 'utf-8')
  } catch {
    // May not exist
  }
  results.push({
    test: 'KernMissionControl component used in core client',
    pass: coreClientSrc.includes('KernMissionControl'),
    detail: 'Core client imports and renders KernMissionControl',
  })

  // Test 10: Health score computation
  results.push({
    test: 'Health score includes cash and asset growth checks',
    pass: componentSrc.includes('healthScore') &&
          componentSrc.includes('totalCash >= 0') &&
          componentSrc.includes("assetGrowthDirection !== 'down'"),
    detail: 'Health score considers cash balance and asset growth direction',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: 'Mission control layout for De Kern (refactored #403–#406)',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
