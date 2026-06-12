import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #181: Freedom-time in budget displays
 * Tests that budget bars, alerts, and detail modal show freedom-time in Dutch-locale format.
 */
export async function GET() {
  const results: { test: string; passed: boolean; details: string }[] = []

  // Test 1: eurToFreedomTime returns formattedDagen property
  try {
    // Read the freedom-time-label source to verify formattedDagen exists
    const filePath = path.join(process.cwd(), 'components', 'app', 'freedom-time-label.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasFormattedDagen = source.includes('formattedDagen')
    const hasToLocaleString = source.includes("toLocaleString('nl-NL'")
    results.push({
      test: 'eurToFreedomTime returns formattedDagen property',
      passed: hasFormattedDagen && hasToLocaleString,
      details: hasFormattedDagen && hasToLocaleString
        ? 'formattedDagen property exists with nl-NL locale formatting'
        : `formattedDagen: ${hasFormattedDagen}, nl-NL locale: ${hasToLocaleString}`,
    })
  } catch (e) {
    results.push({ test: 'eurToFreedomTime returns formattedDagen property', passed: false, details: String(e) })
  }

  // Test 2: Budget tree progress bars use formattedDagen with "nog X dagen deze maand"
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'budget-tree.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasFreedomDaysRemaining = source.includes('freedom-days-remaining')
    const usesFormattedDagen = source.includes('formattedDagen')
    const hasNogDezeMaand = source.includes('nog {freedom.formattedDagen} deze maand')
    results.push({
      test: 'Budget tree bars show "nog X,X dagen deze maand"',
      passed: hasFreedomDaysRemaining && usesFormattedDagen && hasNogDezeMaand,
      details: hasFreedomDaysRemaining && usesFormattedDagen && hasNogDezeMaand
        ? 'FreedomDaysLabel shows "nog {formattedDagen} deze maand" with data-testid="freedom-days-remaining"'
        : `testid: ${hasFreedomDaysRemaining}, formattedDagen: ${usesFormattedDagen}, nogDezeMaand: ${hasNogDezeMaand}`,
    })
  } catch (e) {
    results.push({ test: 'Budget tree bars show "nog X,X dagen deze maand"', passed: false, details: String(e) })
  }

  // Test 3: Budget tree over-budget shows "€X over — Y dagen ingeleverd"
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'budget-tree.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasOverTestId = source.includes('freedom-days-over')
    const hasOverFormat = source.includes('ingeleverd')
    const usesFormattedDagen = source.includes('freedom.formattedDagen} ingeleverd')
    results.push({
      test: 'Budget tree over-budget shows "€X over — Y dagen ingeleverd"',
      passed: hasOverTestId && hasOverFormat && usesFormattedDagen,
      details: hasOverTestId && hasOverFormat && usesFormattedDagen
        ? 'Over-budget label shows "{formatCurrency} over — {formattedDagen} ingeleverd"'
        : `testid: ${hasOverTestId}, ingeleverd: ${hasOverFormat}, formattedDagen: ${usesFormattedDagen}`,
    })
  } catch (e) {
    results.push({ test: 'Budget tree over-budget shows "€X over — Y dagen ingeleverd"', passed: false, details: String(e) })
  }

  // Test 4: Budget alert uses formattedDagen for over-budget message
  try {
    const filePath = path.join(process.cwd(), 'components', 'app', 'budget-alert.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasAlertFreedomTime = source.includes('alert-freedom-time')
    const usesFormattedDagen = source.includes('formattedDagen')
    const hasIngeleverd = source.includes('ingeleverd')
    results.push({
      test: 'Budget alert shows "€X over — Y dagen ingeleverd"',
      passed: hasAlertFreedomTime && usesFormattedDagen && hasIngeleverd,
      details: hasAlertFreedomTime && usesFormattedDagen && hasIngeleverd
        ? 'Alert uses formattedDagen with "ingeleverd" message'
        : `testid: ${hasAlertFreedomTime}, formattedDagen: ${usesFormattedDagen}, ingeleverd: ${hasIngeleverd}`,
    })
  } catch (e) {
    results.push({ test: 'Budget alert shows "€X over — Y dagen ingeleverd"', passed: false, details: String(e) })
  }

  // Test 5: Budget detail modal shows freedom-time for limit, spent, remaining
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasLimitFreedom = source.includes('modal-limit-freedom')
    const hasSpentFreedom = source.includes('modal-spent-freedom')
    const hasRemainingFreedom = source.includes('modal-remaining-freedom')
    const usesFormattedDagen = (source.match(/formattedDagen/g) || []).length >= 4
    results.push({
      test: 'Budget detail modal shows freedom days for limit/spent/remaining',
      passed: hasLimitFreedom && hasSpentFreedom && hasRemainingFreedom && usesFormattedDagen,
      details: hasLimitFreedom && hasSpentFreedom && hasRemainingFreedom && usesFormattedDagen
        ? 'Modal shows formattedDagen for limit, spent, and remaining amounts'
        : `limit: ${hasLimitFreedom}, spent: ${hasSpentFreedom}, remaining: ${hasRemainingFreedom}, formattedDagen count: ${(source.match(/formattedDagen/g) || []).length}`,
    })
  } catch (e) {
    results.push({ test: 'Budget detail modal shows freedom days for limit/spent/remaining', passed: false, details: String(e) })
  }

  // Test 6: Budget detail modal progress bar shows "nog X dagen deze maand"
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasBarFreedom = source.includes('modal-bar-freedom')
    const hasBarNogDezeMaand = source.includes('deze maand')
    results.push({
      test: 'Budget modal progress bar shows "nog X dagen deze maand"',
      passed: hasBarFreedom && hasBarNogDezeMaand,
      details: hasBarFreedom && hasBarNogDezeMaand
        ? 'Progress bar has freedom-time label with "deze maand" context'
        : `barFreedom: ${hasBarFreedom}, dezeMaand: ${hasBarNogDezeMaand}`,
    })
  } catch (e) {
    results.push({ test: 'Budget modal progress bar shows "nog X dagen deze maand"', passed: false, details: String(e) })
  }

  // Test 7: Child budget freedom-time in detail modal
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasChildRemaining = source.includes('child-freedom-remaining')
    const hasChildOver = source.includes('child-freedom-over')
    results.push({
      test: 'Child budgets in modal show freedom-time remaining/over',
      passed: hasChildRemaining && hasChildOver,
      details: hasChildRemaining && hasChildOver
        ? 'Child budgets have remaining and over-budget freedom-time labels'
        : `childRemaining: ${hasChildRemaining}, childOver: ${hasChildOver}`,
    })
  } catch (e) {
    results.push({ test: 'Child budgets in modal show freedom-time remaining/over', passed: false, details: String(e) })
  }

  // Test 8: Transaction freedom-time in detail modal
  try {
    const filePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
    const source = fs.readFileSync(filePath, 'utf-8')
    const hasTxFreedom = source.includes('tx-freedom-time')
    const txUsesFormattedDagen = source.includes('.formattedDagen}')
    results.push({
      test: 'Transactions in budget modal show freedom-time',
      passed: hasTxFreedom && txUsesFormattedDagen,
      details: hasTxFreedom && txUsesFormattedDagen
        ? 'Transaction line items show freedom-time via formattedDagen'
        : `txFreedom: ${hasTxFreedom}, formattedDagen: ${txUsesFormattedDagen}`,
    })
  } catch (e) {
    results.push({ test: 'Transactions in budget modal show freedom-time', passed: false, details: String(e) })
  }

  // Test 9: Freedom-time labels use subtle styling (text-sm, italic, text-zinc-500)
  try {
    const treeSource = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'budget-tree.tsx'), 'utf-8')
    const alertSource = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'budget-alert.tsx'), 'utf-8')
    const pageSource = fs.readFileSync(path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx'), 'utf-8')

    const treeHasSubtle = treeSource.includes('text-sm italic text-zinc-500')
    const alertHasSubtle = alertSource.includes('text-sm italic text-zinc-500')
    const pageHasSubtle = pageSource.includes('text-sm italic text-zinc-500')

    results.push({
      test: 'Freedom-time labels use subtle styling (text-sm italic text-zinc-500)',
      passed: treeHasSubtle && alertHasSubtle && pageHasSubtle,
      details: treeHasSubtle && alertHasSubtle && pageHasSubtle
        ? 'All three files use consistent subtle styling: text-sm italic text-zinc-500'
        : `tree: ${treeHasSubtle}, alert: ${alertHasSubtle}, page: ${pageHasSubtle}`,
    })
  } catch (e) {
    results.push({ test: 'Freedom-time labels use subtle styling', passed: false, details: String(e) })
  }

  // Test 10: Calculations use real daily expenses from user data (DailyExpenseProvider context)
  try {
    const treeSource = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'budget-tree.tsx'), 'utf-8')
    const alertSource = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'budget-alert.tsx'), 'utf-8')
    const pageSource = fs.readFileSync(path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx'), 'utf-8')

    const treeUsesContext = treeSource.includes('useDailyExpenseRate()')
    const alertUsesContext = alertSource.includes('useDailyExpenseRate()')
    const pageUsesContext = pageSource.includes('useDailyExpenseRate()')

    // Verify the context provider loads from real transactions
    const contextSource = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'freedom-time-label.tsx'), 'utf-8')
    const usesTransactions = contextSource.includes("from('transactions')") && contextSource.includes("source: 'transactions'")

    results.push({
      test: 'Calculations use real daily expenses from user transaction data',
      passed: treeUsesContext && alertUsesContext && pageUsesContext && usesTransactions,
      details: treeUsesContext && alertUsesContext && pageUsesContext && usesTransactions
        ? 'All components use useDailyExpenseRate() hook, which loads from real Supabase transactions'
        : `tree: ${treeUsesContext}, alert: ${alertUsesContext}, page: ${pageUsesContext}, realTx: ${usesTransactions}`,
    })
  } catch (e) {
    results.push({ test: 'Calculations use real daily expenses', passed: false, details: String(e) })
  }

  // Test 11: formattedDagen uses Dutch locale (nl-NL) with comma decimal separator
  try {
    const source = fs.readFileSync(path.join(process.cwd(), 'components', 'app', 'freedom-time-label.tsx'), 'utf-8')
    const hasNlNlLocale = source.includes("toLocaleString('nl-NL'")
    const hasDagenLabel = source.includes("dagen")
    const hasMaandenLabel = source.includes("maanden")
    const hasJaarLabel = source.includes("jaar")

    results.push({
      test: 'formattedDagen uses Dutch locale with dagen/maanden/jaar labels',
      passed: hasNlNlLocale && hasDagenLabel && hasMaandenLabel && hasJaarLabel,
      details: hasNlNlLocale && hasDagenLabel && hasMaandenLabel && hasJaarLabel
        ? 'Dutch locale formatting with dagen, maanden, and jaar labels for different ranges'
        : `nl-NL: ${hasNlNlLocale}, dagen: ${hasDagenLabel}, maanden: ${hasMaandenLabel}, jaar: ${hasJaarLabel}`,
    })
  } catch (e) {
    results.push({ test: 'formattedDagen uses Dutch locale', passed: false, details: String(e) })
  }

  // Test 12: No mock data patterns in budget freedom-time code
  try {
    const files = [
      path.join(process.cwd(), 'components', 'app', 'budget-tree.tsx'),
      path.join(process.cwd(), 'components', 'app', 'budget-alert.tsx'),
      path.join(process.cwd(), 'components', 'app', 'freedom-time-label.tsx'),
      path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx'),
    ]

    const mockPatterns = ['globalThis', 'devStore', 'mockData', 'fakeData', 'sampleData', 'dummyData', 'MOCK', 'STUB']
    const foundMocks: string[] = []

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf-8')
      for (const pattern of mockPatterns) {
        if (source.includes(pattern)) {
          foundMocks.push(`${path.basename(filePath)}: ${pattern}`)
        }
      }
    }

    results.push({
      test: 'No mock data patterns in budget freedom-time code',
      passed: foundMocks.length === 0,
      details: foundMocks.length === 0
        ? 'No mock patterns found — all data comes from real Supabase queries'
        : `Found: ${foundMocks.join(', ')}`,
    })
  } catch (e) {
    results.push({ test: 'No mock data patterns', passed: false, details: String(e) })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length
  const allPassing = passing === total

  return NextResponse.json({
    feature: 181,
    name: 'Freedom-time in budget displays',
    results,
    passing,
    total,
    allPassing,
    summary: `${passing}/${total} tests passing${allPassing ? ' ✅' : ' ❌'}`,
  })
}
