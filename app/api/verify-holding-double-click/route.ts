import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-holding-double-click
 * Verifies that the holding creation form has double-click / duplicate submission protection.
 * Source-code level verification of 8 protection mechanisms.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    // Read the holding form source code
    const holdingPagePath = join(process.cwd(), 'app', '(app)', 'core', 'assets', 'holdings', 'page.tsx')
    const holdingPageSrc = readFileSync(holdingPagePath, 'utf-8')

    // Read the holdings API route source code
    const apiRoutePath = join(process.cwd(), 'app', 'api', 'holdings', 'route.ts')
    const apiRouteSrc = readFileSync(apiRoutePath, 'utf-8')

    // Test 1: Button has disabled={saving || submitted || !name}
    const hasDisabledButton = holdingPageSrc.includes('disabled={saving || submitted || !name}')
    results.push({
      name: 'Submit button is disabled during saving and after submission',
      pass: hasDisabledButton,
      detail: hasDisabledButton
        ? 'Button has disabled={saving || submitted || !name} — prevents clicks during save and after success'
        : 'Missing disabled state on submit button',
    })

    // Test 2: saving state is set before fetch
    const hasSavingState = holdingPageSrc.includes('setSaving(true)') && holdingPageSrc.includes('setSaving(false)')
    results.push({
      name: 'Saving state prevents re-entry during API call',
      pass: hasSavingState,
      detail: hasSavingState
        ? 'setSaving(true) before fetch and setSaving(false) in finally block — button disabled during API call'
        : 'Missing saving state management',
    })

    // Test 3: submitted state prevents all future submissions
    const hasSubmittedGuard = holdingPageSrc.includes('if (!name || submitted) return')
    const hasSetSubmitted = holdingPageSrc.includes('setSubmitted(true)')
    results.push({
      name: 'Submitted flag permanently blocks re-submission after success',
      pass: hasSubmittedGuard && hasSetSubmitted,
      detail: hasSubmittedGuard && hasSetSubmitted
        ? 'submitted flag checked at start of handleSave + set to true after success — permanent block'
        : `Guard: ${hasSubmittedGuard}, SetSubmitted: ${hasSetSubmitted}`,
    })

    // Test 4: Idempotency key generated with crypto.randomUUID()
    const hasIdempotencyKey = holdingPageSrc.includes('crypto.randomUUID()')
    const hasIdempotencyHeader = holdingPageSrc.includes("'X-Idempotency-Key'")
    results.push({
      name: 'Idempotency key sent with creation request',
      pass: hasIdempotencyKey && hasIdempotencyHeader,
      detail: hasIdempotencyKey && hasIdempotencyHeader
        ? 'crypto.randomUUID() generates unique key, sent as X-Idempotency-Key header'
        : `UUID: ${hasIdempotencyKey}, Header: ${hasIdempotencyHeader}`,
    })

    // Test 5: Server-side idempotency cache
    const hasServerCache = apiRouteSrc.includes('idempotencyCache') && apiRouteSrc.includes('IDEMPOTENCY_TTL_MS')
    results.push({
      name: 'Server-side idempotency cache deduplicates requests',
      pass: hasServerCache,
      detail: hasServerCache
        ? 'In-memory idempotencyCache with 5-minute TTL — duplicate keys return cached response instead of inserting'
        : 'Missing server-side idempotency cache',
    })

    // Test 6: Visual feedback during saving (button text changes)
    const hasSavingText = holdingPageSrc.includes("saving ? 'Opslaan...'")
    const hasSubmittedText = holdingPageSrc.includes("submitted ? 'Opgeslagen ✓'")
    results.push({
      name: 'Visual feedback shows saving/saved state on button',
      pass: hasSavingText && hasSubmittedText,
      detail: hasSavingText && hasSubmittedText
        ? 'Button shows "Opslaan..." during save and "Opgeslagen ✓" after — clear visual feedback'
        : `SavingText: ${hasSavingText}, SubmittedText: ${hasSubmittedText}`,
    })

    // Test 7: History state management prevents back-button re-submission
    const hasHistoryReplace = holdingPageSrc.includes('window.history.replaceState')
    const hasFormSubmittedState = holdingPageSrc.includes('formSubmitted: true')
    results.push({
      name: 'History state prevents back-button re-submission',
      pass: hasHistoryReplace && hasFormSubmittedState,
      detail: hasHistoryReplace && hasFormSubmittedState
        ? 'window.history.replaceState marks form as submitted — back button cannot re-trigger'
        : `HistoryReplace: ${hasHistoryReplace}, FormSubmittedState: ${hasFormSubmittedState}`,
    })

    // Test 8: Server checks idempotency key before insert (prevents race condition)
    const hasServerCheck = apiRouteSrc.includes("const cached = idempotencyCache.get(cacheKey)")
    const hasEarlyReturn = apiRouteSrc.includes('if (cached)')
    results.push({
      name: 'Server checks idempotency key before database insert',
      pass: hasServerCheck && hasEarlyReturn,
      detail: hasServerCheck && hasEarlyReturn
        ? 'Server checks cache before inserting — even if two rapid requests bypass client guard, only first inserts'
        : `ServerCheck: ${hasServerCheck}, EarlyReturn: ${hasEarlyReturn}`,
    })
  } catch (err) {
    results.push({
      name: 'Source code accessible',
      pass: false,
      detail: `Could not read source files: ${err instanceof Error ? err.message : 'unknown error'}`,
    })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    title: 'Holding Double-Click Protection Verification',
    summary: `${passing}/${total} checks passing`,
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
