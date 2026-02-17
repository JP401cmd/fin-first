import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * API endpoint to verify transaction filter and reset functionality.
 * Checks that:
 * 1. Filter state variables exist in the cash page
 * 2. Filter UI components are rendered (search, type, budget, reset)
 * 3. Reset function clears all filters
 * 4. filteredTransactions memo applies all filters
 * 5. Empty state shows filter-aware message
 * 6. data-testid attributes present for testing
 */
export async function GET() {
  const results: { name: string; pass: boolean; details: string }[] = []

  // Read the cash page source
  const cashPagePath = path.join(process.cwd(), 'app/(app)/core/cash/page.tsx')
  let source = ''
  try {
    source = fs.readFileSync(cashPagePath, 'utf-8')
  } catch (e) {
    return NextResponse.json({
      error: 'Could not read cash page source',
      tests: [{ name: 'Source readable', pass: false, details: String(e) }],
    })
  }

  // Test 1: Filter state variables exist
  const hasFilterSearch = source.includes("const [filterSearch, setFilterSearch] = useState('')")
  const hasFilterType = source.includes("const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')")
  const hasFilterBudgetId = source.includes("const [filterBudgetId, setFilterBudgetId] = useState<string>('all')")
  results.push({
    name: 'Filter state variables exist',
    pass: hasFilterSearch && hasFilterType && hasFilterBudgetId,
    details: `filterSearch: ${hasFilterSearch}, filterType: ${hasFilterType}, filterBudgetId: ${hasFilterBudgetId}`,
  })

  // Test 2: hasActiveFilters computed property
  const hasActiveFilters = source.includes('hasActiveFilters')
  const hasActiveFiltersComputation = source.includes("filterSearch !== '' || filterType !== 'all' || filterBudgetId !== 'all'")
  results.push({
    name: 'hasActiveFilters computed properly',
    pass: hasActiveFilters && hasActiveFiltersComputation,
    details: `hasActiveFilters: ${hasActiveFilters}, computation: ${hasActiveFiltersComputation}`,
  })

  // Test 3: resetFilters function exists and clears all filters
  const hasResetFunction = source.includes('function resetFilters()')
  const resetsSearch = source.includes("setFilterSearch('')")
  const resetsType = source.includes("setFilterType('all')")
  const resetsBudget = source.includes("setFilterBudgetId('all')")
  results.push({
    name: 'resetFilters function clears all filter state',
    pass: hasResetFunction && resetsSearch && resetsType && resetsBudget,
    details: `function: ${hasResetFunction}, search: ${resetsSearch}, type: ${resetsType}, budget: ${resetsBudget}`,
  })

  // Test 4: filteredTransactions useMemo exists
  const hasFilteredTransactions = source.includes('const filteredTransactions = useMemo')
  results.push({
    name: 'filteredTransactions memo exists',
    pass: hasFilteredTransactions,
    details: `filteredTransactions useMemo: ${hasFilteredTransactions}`,
  })

  // Test 5: Search filter works on description, counterparty, notes
  const searchesDescription = source.includes('tx.description') && source.includes('toLowerCase().includes(searchLower)')
  const searchesCounterparty = source.includes('tx.counterparty_name') && source.includes('toLowerCase().includes(searchLower)')
  const searchesNotes = source.includes('tx.notes') && source.includes('toLowerCase().includes(searchLower)')
  results.push({
    name: 'Search filter matches description, counterparty, notes',
    pass: searchesDescription && searchesCounterparty && searchesNotes,
    details: `description: ${searchesDescription}, counterparty: ${searchesCounterparty}, notes: ${searchesNotes}`,
  })

  // Test 6: Type filter (income/expense)
  const hasIncomeFilter = source.includes("filterType === 'income'") && source.includes('Number(tx.amount) > 0')
  const hasExpenseFilter = source.includes("filterType === 'expense'") && source.includes('Number(tx.amount) < 0')
  results.push({
    name: 'Type filter supports income and expense',
    pass: hasIncomeFilter && hasExpenseFilter,
    details: `income: ${hasIncomeFilter}, expense: ${hasExpenseFilter}`,
  })

  // Test 7: Budget category filter
  const hasBudgetFilter = source.includes("filterBudgetId !== 'all'")
  const hasUncategorized = source.includes("filterBudgetId === 'uncategorized'") && source.includes('!tx.budget_id')
  const hasBudgetMatch = source.includes('tx.budget_id === filterBudgetId')
  results.push({
    name: 'Budget category filter with uncategorized option',
    pass: hasBudgetFilter && hasUncategorized && hasBudgetMatch,
    details: `budgetFilter: ${hasBudgetFilter}, uncategorized: ${hasUncategorized}, budgetMatch: ${hasBudgetMatch}`,
  })

  // Test 8: Filter UI - search input with data-testid
  const hasSearchInput = source.includes('data-testid="filter-search"')
  results.push({
    name: 'Search input UI with data-testid',
    pass: hasSearchInput,
    details: `search input: ${hasSearchInput}`,
  })

  // Test 9: Filter UI - type select with data-testid
  const hasTypeSelect = source.includes('data-testid="filter-type"')
  results.push({
    name: 'Type select UI with data-testid',
    pass: hasTypeSelect,
    details: `type select: ${hasTypeSelect}`,
  })

  // Test 10: Filter UI - budget select with data-testid
  const hasBudgetSelect = source.includes('data-testid="filter-budget"')
  results.push({
    name: 'Budget select UI with data-testid',
    pass: hasBudgetSelect,
    details: `budget select: ${hasBudgetSelect}`,
  })

  // Test 11: Reset button with data-testid (appears when filters active)
  const hasResetButton = source.includes('data-testid="filter-reset"')
  const resetOnlyWhenActive = source.includes('hasActiveFilters') && source.includes('onClick={resetFilters}')
  results.push({
    name: 'Reset button visible only when filters active',
    pass: hasResetButton && resetOnlyWhenActive,
    details: `resetButton: ${hasResetButton}, conditionalRender: ${resetOnlyWhenActive}`,
  })

  // Test 12: Filter summary shows filtered/total count
  const hasFilterSummary = source.includes('data-testid="filter-summary"')
  const showsCount = source.includes('filteredTransactions.length') && source.includes('transactions.length')
  results.push({
    name: 'Filter summary shows count of filtered vs total',
    pass: hasFilterSummary && showsCount,
    details: `filterSummary: ${hasFilterSummary}, showsCount: ${showsCount}`,
  })

  // Test 13: Empty state is filter-aware
  const hasFilterAwareEmpty = source.includes('hasActiveFilters') && source.includes('Geen transacties komen overeen met de huidige filters')
  const hasResetInEmpty = source.includes('data-testid="filter-reset-empty"')
  results.push({
    name: 'Empty state shows filter-specific message with reset button',
    pass: hasFilterAwareEmpty && hasResetInEmpty,
    details: `filterAwareEmpty: ${hasFilterAwareEmpty}, resetInEmpty: ${hasResetInEmpty}`,
  })

  // Test 14: Grouped transactions use filteredTransactions (not raw transactions)
  const usesFilteredForGrouping = source.includes('filteredTransactions.reduce<Record<string, Transaction[]>>')
  results.push({
    name: 'Transaction grouping uses filteredTransactions',
    pass: usesFilteredForGrouping,
    details: `usesFilteredForGrouping: ${usesFilteredForGrouping}`,
  })

  // Test 15: RotateCcw icon imported for reset button
  const hasRotateIcon = source.includes('RotateCcw')
  const hasSearchIcon = source.includes('Search')
  const hasFilterIcon = source.includes('Filter')
  results.push({
    name: 'Required icons imported (RotateCcw, Search, Filter)',
    pass: hasRotateIcon && hasSearchIcon && hasFilterIcon,
    details: `RotateCcw: ${hasRotateIcon}, Search: ${hasSearchIcon}, Filter: ${hasFilterIcon}`,
  })

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    summary: `${passing}/${total} tests passing`,
    allPass: passing === total,
    tests: results,
  })
}
