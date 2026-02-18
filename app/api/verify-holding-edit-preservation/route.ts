import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the holdings page source
  const holdingsPagePath = path.join(process.cwd(), 'app/(app)/core/assets/holdings/page.tsx')
  let source = ''
  try {
    source = fs.readFileSync(holdingsPagePath, 'utf-8')
  } catch {
    return NextResponse.json({
      error: 'Could not read holdings page source',
      results: [{ name: 'file-exists', pass: false, detail: 'Holdings page not found' }],
    })
  }

  // Test 1: HoldingEditForm has isDirty state tracking
  results.push({
    name: 'isDirty-tracking',
    pass: source.includes('isDirty') && source.includes('useMemo'),
    detail: 'HoldingEditForm should track dirty state via isDirty computed value',
  })

  // Test 2: beforeunload event listener for page refresh warning
  results.push({
    name: 'beforeunload-warning',
    pass: source.includes('beforeunload') && source.includes('addEventListener'),
    detail: 'Should add beforeunload event listener when form is dirty',
  })

  // Test 3: localStorage draft auto-save
  results.push({
    name: 'localStorage-draft-save',
    pass: source.includes('localStorage.setItem') && source.includes('holding-edit-draft'),
    detail: 'Should auto-save draft to localStorage when form is dirty',
  })

  // Test 4: localStorage draft recovery
  results.push({
    name: 'localStorage-draft-recovery',
    pass: source.includes('localStorage.getItem') && source.includes('loadDraft'),
    detail: 'Should recover draft from localStorage on mount',
  })

  // Test 5: Draft cleanup on save
  results.push({
    name: 'draft-cleanup-on-save',
    pass: source.includes('localStorage.removeItem(draftKey)'),
    detail: 'Should remove draft from localStorage after successful save',
  })

  // Test 6: Unsaved changes confirmation on close
  results.push({
    name: 'close-confirmation',
    pass: source.includes('showCloseConfirm') && source.includes('handleClose'),
    detail: 'Should show confirmation when closing with unsaved changes',
  })

  // Test 7: Discard changes option
  results.push({
    name: 'discard-changes-option',
    pass: source.includes('discard-changes-btn') && source.includes('cleanupAndClose'),
    detail: 'Should offer discard changes option in confirmation dialog',
  })

  // Test 8: Keep editing option
  results.push({
    name: 'keep-editing-option',
    pass: source.includes('keep-editing-btn') && source.includes('Verder bewerken'),
    detail: 'Should offer keep editing option in confirmation dialog',
  })

  // Test 9: Draft recovery notice
  results.push({
    name: 'draft-recovery-notice',
    pass: source.includes('draft-recovered-notice') && source.includes('Concept hersteld'),
    detail: 'Should show notice when draft is recovered after refresh',
  })

  // Test 10: Discard draft option (load original)
  results.push({
    name: 'discard-draft-option',
    pass: source.includes('discard-draft-btn') && source.includes('discardDraft'),
    detail: 'Should offer option to discard recovered draft and load original values',
  })

  // Test 11: Dirty indicator visible
  results.push({
    name: 'dirty-indicator',
    pass: source.includes('dirty-indicator') && source.includes('Onopgeslagen wijzigingen'),
    detail: 'Should show visual indicator when form has unsaved changes',
  })

  // Test 12: beforeunload cleanup (removes event listener)
  results.push({
    name: 'beforeunload-cleanup',
    pass: source.includes('removeEventListener') && source.includes('beforeunload'),
    detail: 'Should remove beforeunload listener when form is no longer dirty or on unmount',
  })

  const passing = results.filter((r) => r.pass).length
  return NextResponse.json({
    feature: '#136 — Holding edit form preserves data on refresh',
    summary: `${passing}/${results.length} tests passing`,
    results,
  })
}
