import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the import page source
  const importPagePath = path.join(process.cwd(), 'app/(app)/core/cash/import/page.tsx')
  let src = ''
  try {
    src = fs.readFileSync(importPagePath, 'utf-8')
  } catch {
    return NextResponse.json({ error: 'Cannot read import page source' }, { status: 500 })
  }

  // Test 1: isNetworkFailure function exists
  results.push({
    test: 'isNetworkFailure helper function exists',
    pass: src.includes('function isNetworkFailure('),
    detail: 'Must have a network failure detection function',
  })

  // Test 2: Detects "Failed to fetch" (browser network error)
  results.push({
    test: 'Detects "Failed to fetch" TypeError',
    pass: src.includes("'Failed to fetch'") || src.includes('"Failed to fetch"'),
    detail: 'Must detect the standard browser network error message',
  })

  // Test 3: Detects NetworkError
  results.push({
    test: 'Detects NetworkError',
    pass: src.includes("'NetworkError'") || src.includes('"NetworkError"'),
    detail: 'Must detect NetworkError type',
  })

  // Test 4: handleImport has network error handling with try-catch
  results.push({
    test: 'handleImport catches network exceptions',
    pass: src.includes('async function handleImport') && src.includes('isNetworkFailure'),
    detail: 'handleImport must catch network errors',
  })

  // Test 5: Error message displayed in Dutch
  results.push({
    test: 'Network error message in Dutch',
    pass: src.includes('Geen internetverbinding') || src.includes('Netwerkfout') || src.includes('netwerk'),
    detail: 'Must show Dutch network error message',
  })

  // Test 6: Retry button exists for network errors
  results.push({
    test: 'Retry button for network errors',
    pass: src.includes('Opnieuw proberen') && src.includes('isNetworkError'),
    detail: 'Must have a retry button when network error occurs',
  })

  // Test 7: WifiOff icon imported for visual feedback
  results.push({
    test: 'WifiOff icon for network error visual',
    pass: src.includes('WifiOff') && src.includes('lucide-react'),
    detail: 'Must show WifiOff icon for network errors',
  })

  // Test 8: Import progress tracking
  results.push({
    test: 'Import progress tracking during batch insert',
    pass: src.includes('importProgress') && src.includes('setImportProgress'),
    detail: 'Must track progress during batch import',
  })

  // Test 9: Batch retry support (resume from last successful batch)
  results.push({
    test: 'Supports retrying from last successful batch',
    pass: src.includes('importedBatchIndex') && src.includes('retryFromBatch'),
    detail: 'Must support resuming import from last successful batch to prevent corruption',
  })

  // Test 10: Partial import notification (tells user how many already imported)
  results.push({
    test: 'Partial import notification',
    pass: src.includes('transacties zijn al geïmporteerd') || src.includes('van') && src.includes('geïmporteerd'),
    detail: 'Must tell user how many transactions were already imported on partial failure',
  })

  // Test 11: checkDuplicates has network error handling
  results.push({
    test: 'checkDuplicates has network error handling',
    pass: (() => {
      const checkDupIdx = src.indexOf('async function checkDuplicates()')
      const handleImportIdx = src.indexOf('async function handleImport(')
      if (checkDupIdx === -1 || handleImportIdx === -1) return false
      const checkDupBody = src.slice(checkDupIdx, handleImportIdx)
      return checkDupBody.includes('isNetworkFailure') && checkDupBody.includes('try')
    })(),
    detail: 'checkDuplicates must also handle network errors',
  })

  // Test 12: Initial data load has network error handling
  results.push({
    test: 'Initial data load has network error handling',
    pass: src.includes('loadInitialData') && src.includes('Kan geen verbinding maken'),
    detail: 'Initial page load must handle network errors gracefully',
  })

  // Test 13: Network error is visually distinct from regular errors
  results.push({
    test: 'Network errors styled differently from regular errors',
    pass: src.includes('isNetworkError') && src.includes('border-orange-200') && src.includes('border-red-200'),
    detail: 'Network errors should use orange styling, regular errors use red',
  })

  // Test 14: Progress bar shown during import
  results.push({
    test: 'Progress bar shown during batch import',
    pass: src.includes('importProgress.total') && src.includes('rounded-full') && src.includes('transition-all'),
    detail: 'Must show visual progress bar during import',
  })

  // Test 15: RefreshCw icon imported for retry button
  results.push({
    test: 'RefreshCw icon for retry button',
    pass: src.includes('RefreshCw') && src.includes('lucide-react'),
    detail: 'Must have refresh icon on retry button',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#99 - Network failure during transaction import shows error',
    passing,
    total,
    percentage: Math.round((passing / total) * 100),
    results,
  })
}
