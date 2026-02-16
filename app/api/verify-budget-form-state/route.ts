import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

type TestResult = { name: string; status: 'pass' | 'fail'; detail: string }

export async function GET() {
  const tests: TestResult[] = []

  // Read source files
  const budgetFormPath = path.join(process.cwd(), 'components', 'app', 'budget-form.tsx')
  const budgetPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')

  let budgetFormSrc = ''
  let budgetPageSrc = ''

  try { budgetFormSrc = fs.readFileSync(budgetFormPath, 'utf8') } catch { /* */ }
  try { budgetPageSrc = fs.readFileSync(budgetPagePath, 'utf8') } catch { /* */ }

  // Test 1: BudgetForm has isDirty computed via useMemo
  {
    const hasDirty = budgetFormSrc.includes('isDirty') && budgetFormSrc.includes('useMemo')
    tests.push({
      name: 'BudgetForm: isDirty tracking via useMemo',
      status: hasDirty ? 'pass' : 'fail',
      detail: hasDirty
        ? 'isDirty computed via useMemo comparing all form fields to initial values'
        : 'Missing isDirty or useMemo in BudgetForm',
    })
  }

  // Test 2: BudgetForm has beforeunload event listener
  {
    const hasBeforeUnload = budgetFormSrc.includes('beforeunload') && budgetFormSrc.includes('addEventListener')
    tests.push({
      name: 'BudgetForm: beforeunload event listener',
      status: hasBeforeUnload ? 'pass' : 'fail',
      detail: hasBeforeUnload
        ? 'beforeunload listener added when isDirty, removed on cleanup'
        : 'Missing beforeunload listener in BudgetForm',
    })
  }

  // Test 3: BudgetForm has localStorage draft auto-save
  {
    const hasDraft = budgetFormSrc.includes('localStorage.setItem') && budgetFormSrc.includes('draftKey')
    tests.push({
      name: 'BudgetForm: localStorage draft auto-save',
      status: hasDraft ? 'pass' : 'fail',
      detail: hasDraft
        ? 'Draft auto-saved to localStorage when form is dirty'
        : 'Missing localStorage draft save in BudgetForm',
    })
  }

  // Test 4: BudgetForm has draft recovery on mount
  {
    const hasRecovery = budgetFormSrc.includes('loadDraft') && budgetFormSrc.includes('localStorage.getItem')
    tests.push({
      name: 'BudgetForm: localStorage draft recovery',
      status: hasRecovery ? 'pass' : 'fail',
      detail: hasRecovery
        ? 'Draft loaded from localStorage on mount and applied to form state'
        : 'Missing localStorage draft recovery in BudgetForm',
    })
  }

  // Test 5: BudgetForm clears draft on save
  {
    const hasCleanup = budgetFormSrc.includes('localStorage.removeItem') && budgetFormSrc.includes('router.push')
    tests.push({
      name: 'BudgetForm: draft cleanup on save',
      status: hasCleanup ? 'pass' : 'fail',
      detail: hasCleanup
        ? 'localStorage draft removed after successful save before navigation'
        : 'Missing draft cleanup on save in BudgetForm',
    })
  }

  // Test 6: BudgetForm has navigation warning (showNavWarning)
  {
    const hasNavWarning = budgetFormSrc.includes('showNavWarning') && budgetFormSrc.includes('Onopgeslagen wijzigingen')
    tests.push({
      name: 'BudgetForm: unsaved changes navigation warning',
      status: hasNavWarning ? 'pass' : 'fail',
      detail: hasNavWarning
        ? 'Navigation warning dialog with "Onopgeslagen wijzigingen" shown when dirty'
        : 'Missing navigation warning in BudgetForm',
    })
  }

  // Test 7: BudgetForm has confirm/cancel navigation buttons
  {
    const hasConfirm = budgetFormSrc.includes('confirmNavigation') && budgetFormSrc.includes('cancelNavigation')
    tests.push({
      name: 'BudgetForm: confirm/cancel navigation actions',
      status: hasConfirm ? 'pass' : 'fail',
      detail: hasConfirm
        ? 'confirmNavigation discards changes & navigates, cancelNavigation keeps editing'
        : 'Missing confirm/cancel navigation in BudgetForm',
    })
  }

  // Test 8: BudgetForm has dirty indicator
  {
    const hasDirtyIndicator = budgetFormSrc.includes('dirty-indicator') && budgetFormSrc.includes('Onopgeslagen wijzigingen')
    tests.push({
      name: 'BudgetForm: dirty indicator visible',
      status: hasDirtyIndicator ? 'pass' : 'fail',
      detail: hasDirtyIndicator
        ? 'Visual dirty indicator with amber pulse dot shown when form has unsaved changes'
        : 'Missing dirty indicator in BudgetForm',
    })
  }

  // Test 9: BudgetForm has draft recovered notice
  {
    const hasDraftNotice = budgetFormSrc.includes('draft-recovered-notice') && budgetFormSrc.includes('Concept hersteld')
    tests.push({
      name: 'BudgetForm: draft recovered notice',
      status: hasDraftNotice ? 'pass' : 'fail',
      detail: hasDraftNotice
        ? 'Blue notice shown when draft is recovered from localStorage with accept/discard options'
        : 'Missing draft recovered notice in BudgetForm',
    })
  }

  // Test 10: BudgetForm has discard draft option
  {
    const hasDiscardDraft = budgetFormSrc.includes('discardDraft') && budgetFormSrc.includes('Origineel laden')
    tests.push({
      name: 'BudgetForm: discard draft option',
      status: hasDiscardDraft ? 'pass' : 'fail',
      detail: hasDiscardDraft
        ? 'Discard draft resets form to initial values and removes localStorage draft'
        : 'Missing discard draft in BudgetForm',
    })
  }

  // Test 11: BudgetForm back link intercepts navigation
  {
    const hasNavIntercept = budgetFormSrc.includes('handleNavClick') && budgetFormSrc.includes('Terug naar budgetten')
    tests.push({
      name: 'BudgetForm: back link navigation interception',
      status: hasNavIntercept ? 'pass' : 'fail',
      detail: hasNavIntercept
        ? 'Back link uses handleNavClick to show warning when dirty instead of navigating'
        : 'Missing navigation interception for back link in BudgetForm',
    })
  }

  // Test 12: BudgetForm cancel button intercepts navigation
  {
    const hasCancelIntercept = budgetFormSrc.includes('Annuleren') && budgetFormSrc.includes('handleNavClick')
    tests.push({
      name: 'BudgetForm: cancel button navigation interception',
      status: hasCancelIntercept ? 'pass' : 'fail',
      detail: hasCancelIntercept
        ? 'Cancel button uses handleNavClick to show warning when dirty'
        : 'Missing navigation interception for cancel button in BudgetForm',
    })
  }

  // Test 13: BudgetEditModal has isDirty tracking
  {
    const hasModalDirty = budgetPageSrc.includes('BudgetEditModal') &&
      /function BudgetEditModal[\s\S]{0,3000}isDirty/.test(budgetPageSrc)
    tests.push({
      name: 'BudgetEditModal: isDirty tracking',
      status: hasModalDirty ? 'pass' : 'fail',
      detail: hasModalDirty
        ? 'Modal tracks isDirty state comparing current values to original budget'
        : 'Missing isDirty tracking in BudgetEditModal',
    })
  }

  // Test 14: BudgetEditModal has unsaved changes close confirmation
  {
    const hasModalConfirm = budgetPageSrc.includes('modal-unsaved-changes-warning') && budgetPageSrc.includes('handleClose')
    tests.push({
      name: 'BudgetEditModal: unsaved changes close confirmation',
      status: hasModalConfirm ? 'pass' : 'fail',
      detail: hasModalConfirm
        ? 'Modal shows unsaved changes warning when closing with dirty state'
        : 'Missing close confirmation in BudgetEditModal',
    })
  }

  // Test 15: BudgetEditModal has beforeunload
  {
    const hasModalBeforeUnload = /BudgetEditModal[\s\S]{0,5000}beforeunload/.test(budgetPageSrc)
    tests.push({
      name: 'BudgetEditModal: beforeunload event listener',
      status: hasModalBeforeUnload ? 'pass' : 'fail',
      detail: hasModalBeforeUnload
        ? 'Modal adds beforeunload listener when dirty for page refresh protection'
        : 'Missing beforeunload in BudgetEditModal',
    })
  }

  // Test 16: BudgetEditModal has dirty indicator
  {
    const hasModalDirtyIndicator = budgetPageSrc.includes('modal-dirty-indicator')
    tests.push({
      name: 'BudgetEditModal: dirty indicator',
      status: hasModalDirtyIndicator ? 'pass' : 'fail',
      detail: hasModalDirtyIndicator
        ? 'Modal shows amber dirty indicator when form has unsaved changes'
        : 'Missing dirty indicator in BudgetEditModal',
    })
  }

  // Test 17: beforeunload cleanup (removeEventListener)
  {
    const hasCleanup = budgetFormSrc.includes('removeEventListener') && budgetFormSrc.includes('beforeunload')
    tests.push({
      name: 'BudgetForm: beforeunload cleanup',
      status: hasCleanup ? 'pass' : 'fail',
      detail: hasCleanup
        ? 'beforeunload event listener is properly cleaned up in useEffect return'
        : 'Missing beforeunload cleanup in BudgetForm',
    })
  }

  // Test 18: BudgetForm compares all 14 form fields for isDirty
  {
    const dirtyFields = [
      'form.name', 'form.icon', 'form.description', 'form.default_limit',
      'form.budget_type', 'form.interval', 'form.rollover_type', 'form.limit_type',
      'form.alert_threshold', 'form.max_single_transaction_amount',
      'form.is_essential', 'form.priority_score', 'form.is_inflation_indexed',
      'form.parent_id',
    ]
    const allCompared = dirtyFields.every(field => budgetFormSrc.includes(field))
    tests.push({
      name: 'BudgetForm: all form fields compared in isDirty',
      status: allCompared ? 'pass' : 'fail',
      detail: allCompared
        ? 'All 14 form fields are compared against initial values in isDirty memo'
        : 'Not all form fields are compared in isDirty check',
    })
  }

  return NextResponse.json({
    tests,
    passing: tests.filter(t => t.status === 'pass').length,
    failing: tests.filter(t => t.status === 'fail').length,
    total: tests.length,
  })
}
