import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Verification endpoint for Feature #171: Budget form has sensible default values
 *
 * Verifies that the budget creation form pre-fills with reasonable defaults:
 * 1. Interval defaults to "monthly" (current month context)
 * 2. Amount field starts empty or zero
 * 3. Category dropdown has a placeholder
 * 4. Form is ready for input with all required fields
 * 5. Other fields have sensible defaults
 */
export async function GET() {
  const results: { test: string; passed: boolean; detail: string }[] = []

  try {
    // Read the budget form component source
    const formPath = join(process.cwd(), 'components', 'app', 'budget-form.tsx')
    const formSource = await readFile(formPath, 'utf-8')

    // Read the new budget page source
    const newPagePath = join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'new', 'page.tsx')
    const newPageSource = await readFile(newPagePath, 'utf-8')

    // Test 1: Budget creation page exists and renders BudgetForm
    const rendersForm = newPageSource.includes('BudgetForm') && newPageSource.includes('parentBudgets')
    results.push({
      test: 'Budget creation page exists and renders BudgetForm',
      passed: rendersForm,
      detail: `Renders BudgetForm: ${rendersForm}`,
    })

    // Test 2: Interval defaults to "monthly" (current month context)
    // The interval field defaults to "monthly" meaning the budget is automatically
    // set to the most common interval — the current month period
    const intervalDefaultMonthly = formSource.includes("interval: budget?.interval ?? 'monthly'")
    const hasMonthlyOption = formSource.includes("value=\"monthly\"") && formSource.includes('Maandelijks')
    results.push({
      test: 'Interval defaults to monthly (current month context)',
      passed: intervalDefaultMonthly && hasMonthlyOption,
      detail: `Default monthly: ${intervalDefaultMonthly}, Monthly option: ${hasMonthlyOption}`,
    })

    // Test 3: Amount/limit field starts empty (for new budgets)
    // When creating a new budget (no budget prop), default_limit is ''
    const limitDefault = formSource.includes("default_limit: budget ? String(budget.default_limit) : ''")
    const hasLimitInput = formSource.includes('data-testid="budget-limit-input"')
    results.push({
      test: 'Amount/limit field starts empty for new budgets',
      passed: limitDefault && hasLimitInput,
      detail: `Limit default empty: ${limitDefault}, Has limit input: ${hasLimitInput}`,
    })

    // Test 4: Category dropdown has a placeholder option
    const hasPlaceholder = formSource.includes('Nieuwe categorie aanmaken')
    const hasParentSelect = formSource.includes('data-testid="budget-parent-select"')
    const placeholderIsDefault = formSource.includes("parent_id: budget?.parent_id ?? ''")
    results.push({
      test: 'Category dropdown has placeholder "Nieuwe categorie aanmaken"',
      passed: hasPlaceholder && hasParentSelect && placeholderIsDefault,
      detail: `Placeholder: ${hasPlaceholder}, Select testid: ${hasParentSelect}, Default empty: ${placeholderIsDefault}`,
    })

    // Test 5: Budget type defaults to "expense" (most common type)
    const typeDefaultExpense = formSource.includes("budget_type: budget?.budget_type ?? 'expense'")
    const hasTypeSelect = formSource.includes('data-testid="budget-type-select"')
    results.push({
      test: 'Budget type defaults to "expense" (most common)',
      passed: typeDefaultExpense && hasTypeSelect,
      detail: `Default expense: ${typeDefaultExpense}, Has type select: ${hasTypeSelect}`,
    })

    // Test 6: Rollover type defaults to "reset" (sensible default)
    const rolloverDefaultReset = formSource.includes("rollover_type: budget?.rollover_type ?? 'reset'")
    results.push({
      test: 'Rollover type defaults to "reset"',
      passed: rolloverDefaultReset,
      detail: `Default reset: ${rolloverDefaultReset}`,
    })

    // Test 7: Limit type defaults to "soft" (warning, not blocking)
    const limitTypeDefaultSoft = formSource.includes("limit_type: budget?.limit_type ?? 'soft'")
    results.push({
      test: 'Limit type defaults to "soft" (warning, not blocking)',
      passed: limitTypeDefaultSoft,
      detail: `Default soft: ${limitTypeDefaultSoft}`,
    })

    // Test 8: Alert threshold defaults to 80% (sensible warning level)
    const alertDefault80 = formSource.includes('alert_threshold: budget?.alert_threshold ?? 80')
    results.push({
      test: 'Alert threshold defaults to 80%',
      passed: alertDefault80,
      detail: `Default 80%: ${alertDefault80}`,
    })

    // Test 9: Priority score defaults to 3 (middle of 1-5 scale)
    const priorityDefault3 = formSource.includes('priority_score: budget?.priority_score ?? 3')
    results.push({
      test: 'Priority score defaults to 3 (middle value)',
      passed: priorityDefault3,
      detail: `Default 3: ${priorityDefault3}`,
    })

    // Test 10: Form has required fields and is ready for input
    const hasNameInput = formSource.includes('data-testid="budget-name-input"')
    const hasSubmitBtn = formSource.includes('data-testid="budget-submit-btn"')
    const formHasTestid = formSource.includes('data-testid="budget-form"')
    results.push({
      test: 'Form is ready for input (name input, submit button, form element)',
      passed: hasNameInput && hasSubmitBtn && formHasTestid,
      detail: `Name input: ${hasNameInput}, Submit btn: ${hasSubmitBtn}, Form testid: ${formHasTestid}`,
    })

    // Test 11: Name field starts empty for new budgets
    const nameDefaultEmpty = formSource.includes("name: budget?.name ?? ''")
    results.push({
      test: 'Name field starts empty for new budgets',
      passed: nameDefaultEmpty,
      detail: `Name default empty: ${nameDefaultEmpty}`,
    })

    // Test 12: Icon defaults to Circle (generic default icon)
    const iconDefaultCircle = formSource.includes("icon: budget?.icon ?? 'Circle'")
    results.push({
      test: 'Icon defaults to Circle (generic icon)',
      passed: iconDefaultCircle,
      detail: `Icon default Circle: ${iconDefaultCircle}`,
    })

  } catch (err) {
    results.push({
      test: 'Source code analysis',
      passed: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passed = results.filter((r) => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#171 – Budget form has sensible default values',
    summary: `${passed}/${total} tests passing`,
    allPassing: passed === total,
    results,
  })
}
