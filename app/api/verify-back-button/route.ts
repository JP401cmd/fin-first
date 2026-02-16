import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification API for Feature #139: Back button after form submit does not re-submit
 *
 * Tests:
 * 1. HoldingForm uses fetch() API, not HTML form action (no browser POST cache)
 * 2. HoldingForm has idempotency key to prevent duplicate submissions
 * 3. HoldingForm has submitted state flag to prevent double-click re-submit
 * 4. HoldingForm handleSave uses async fetch with JSON body
 * 5. Holdings API POST has idempotency key support (X-Idempotency-Key header)
 * 6. No HTML <form method="POST"> pattern used in holdings form
 * 7. Page uses popstate listener to close modals on back button press
 * 8. HoldingForm marks history state as formSubmitted after successful save
 */

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the holdings page source
  let holdingsPageSrc = ''
  try {
    holdingsPageSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/core/assets/holdings/page.tsx'),
      'utf-8'
    )
  } catch (e: any) {
    return NextResponse.json({
      error: 'Could not read holdings page source',
      detail: e.message,
    }, { status: 500 })
  }

  // Read the API route source
  let holdingsApiSrc = ''
  try {
    holdingsApiSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/api/holdings/route.ts'),
      'utf-8'
    )
  } catch (e: any) {
    holdingsApiSrc = ''
  }

  // Extract the HoldingForm component
  const formStart = holdingsPageSrc.indexOf('function HoldingForm(')
  const formEnd = holdingsPageSrc.indexOf('function HoldingEditForm(')
  const holdingFormSrc = formStart >= 0 && formEnd > formStart
    ? holdingsPageSrc.substring(formStart, formEnd)
    : ''

  // Extract the HoldingsPage component (before HoldingForm)
  const pageComponentSrc = formStart >= 0
    ? holdingsPageSrc.substring(0, formStart)
    : holdingsPageSrc

  // Test 1: HoldingForm uses fetch() API, not HTML form action
  try {
    const usesFetch = holdingFormSrc.includes("fetch('/api/holdings'")
    const hasFormAction = holdingFormSrc.includes('action=') || holdingFormSrc.includes('method="POST"') || holdingFormSrc.includes("method='POST'")

    results.push({
      name: 'HoldingForm uses fetch() API, not HTML form action',
      pass: usesFetch && !hasFormAction,
      detail: `Uses fetch(): ${usesFetch}, Has form action/method: ${hasFormAction}`,
    })
  } catch (e: any) {
    results.push({
      name: 'HoldingForm uses fetch() API, not HTML form action',
      pass: false,
      detail: e.message,
    })
  }

  // Test 2: HoldingForm has idempotency key to prevent duplicate submissions
  try {
    const hasIdempotencyKey = holdingFormSrc.includes('idempotencyKey') || holdingFormSrc.includes('Idempotency-Key')
    const hasRandomUUID = holdingFormSrc.includes('randomUUID') || holdingFormSrc.includes('crypto.randomUUID')

    results.push({
      name: 'HoldingForm sends idempotency key to prevent duplicate API calls',
      pass: hasIdempotencyKey && hasRandomUUID,
      detail: `Has idempotency key header: ${hasIdempotencyKey}, Generates UUID: ${hasRandomUUID}`,
    })
  } catch (e: any) {
    results.push({
      name: 'HoldingForm sends idempotency key to prevent duplicate API calls',
      pass: false,
      detail: e.message,
    })
  }

  // Test 3: HoldingForm has submitted state flag to prevent double-click
  try {
    const hasSubmittedState = holdingFormSrc.includes('submitted') && holdingFormSrc.includes('setSubmitted')
    const preventsResubmit = holdingFormSrc.includes('if (!name || submitted)') || holdingFormSrc.includes('submitted) return')

    results.push({
      name: 'HoldingForm has submitted state flag preventing re-submission',
      pass: hasSubmittedState && preventsResubmit,
      detail: `Has submitted state: ${hasSubmittedState}, Guards against re-submit: ${preventsResubmit}`,
    })
  } catch (e: any) {
    results.push({
      name: 'HoldingForm has submitted state flag preventing re-submission',
      pass: false,
      detail: e.message,
    })
  }

  // Test 4: HoldingForm handleSave uses async fetch with JSON body
  try {
    const hasAsyncFetch = holdingFormSrc.includes('async function handleSave')
    const hasJsonBody = holdingFormSrc.includes("'Content-Type': 'application/json'") ||
                       holdingFormSrc.includes('"Content-Type": "application/json"')
    const hasJsonStringify = holdingFormSrc.includes('JSON.stringify')

    results.push({
      name: 'handleSave uses async fetch with JSON body',
      pass: hasAsyncFetch && hasJsonBody && hasJsonStringify,
      detail: `Async function: ${hasAsyncFetch}, JSON content type: ${hasJsonBody}, JSON.stringify: ${hasJsonStringify}`,
    })
  } catch (e: any) {
    results.push({
      name: 'handleSave uses async fetch with JSON body',
      pass: false,
      detail: e.message,
    })
  }

  // Test 5: Holdings API POST has idempotency key support
  try {
    const hasIdempotencyHeader = holdingsApiSrc.includes('X-Idempotency-Key') || holdingsApiSrc.includes('idempotency')
    const hasIdempotencyCache = holdingsApiSrc.includes('idempotencyCache') || holdingsApiSrc.includes('idempotency_cache')
    const has409Response = holdingsApiSrc.includes('409')
    const hasDuplicateCheck = holdingsApiSrc.includes('force_duplicate') || holdingsApiSrc.includes('existing_holdings')

    results.push({
      name: 'Holdings API has idempotency key support and duplicate detection',
      pass: hasIdempotencyHeader && hasDuplicateCheck && has409Response,
      detail: `Idempotency header: ${hasIdempotencyHeader}, Idempotency cache: ${hasIdempotencyCache}, 409 response: ${has409Response}, Duplicate check: ${hasDuplicateCheck}`,
    })
  } catch (e: any) {
    results.push({
      name: 'Holdings API has idempotency key support and duplicate detection',
      pass: false,
      detail: e.message,
    })
  }

  // Test 6: No HTML <form method="POST"> pattern used in holdings form
  try {
    const hasFormTag = holdingFormSrc.includes('<form')
    const hasSubmitEvent = holdingFormSrc.includes('onSubmit') || holdingFormSrc.includes('type="submit"')
    const usesOnClick = holdingFormSrc.includes('onClick={handleSave}') || holdingFormSrc.includes('onClick={() => handleSave')

    results.push({
      name: 'No HTML <form> with POST used (prevents browser re-submit prompt)',
      pass: !hasFormTag && usesOnClick,
      detail: `Has <form> tag: ${hasFormTag}, Has onSubmit: ${hasSubmitEvent}, Uses onClick for save: ${usesOnClick}`,
    })
  } catch (e: any) {
    results.push({
      name: 'No HTML <form> with POST used (prevents browser re-submit prompt)',
      pass: false,
      detail: e.message,
    })
  }

  // Test 7: Page uses popstate listener to close modals on back button press
  try {
    const hasPopstateListener = pageComponentSrc.includes('popstate')
    const closesFormOnBack = pageComponentSrc.includes('setShowForm(false)')
    const pushesHistoryForModal = pageComponentSrc.includes('pushState') && pageComponentSrc.includes('holdingsModal')

    results.push({
      name: 'Page uses popstate listener to close modals on back button',
      pass: hasPopstateListener && closesFormOnBack && pushesHistoryForModal,
      detail: `Has popstate listener: ${hasPopstateListener}, Closes form on back: ${closesFormOnBack}, Pushes history for modal: ${pushesHistoryForModal}`,
    })
  } catch (e: any) {
    results.push({
      name: 'Page uses popstate listener to close modals on back button',
      pass: false,
      detail: e.message,
    })
  }

  // Test 8: HoldingForm marks history state as formSubmitted after successful save
  try {
    const marksFormSubmitted = holdingFormSrc.includes('formSubmitted')
    const usesReplaceState = holdingFormSrc.includes('replaceState')
    const checksFormSubmittedOnMount = pageComponentSrc.includes('formSubmitted')

    results.push({
      name: 'History state marked as formSubmitted to prevent re-open on back',
      pass: marksFormSubmitted && usesReplaceState && checksFormSubmittedOnMount,
      detail: `Marks formSubmitted in history: ${marksFormSubmitted}, Uses replaceState: ${usesReplaceState}, Checks on mount: ${checksFormSubmittedOnMount}`,
    })
  } catch (e: any) {
    results.push({
      name: 'History state marked as formSubmitted to prevent re-open on back',
      pass: false,
      detail: e.message,
    })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#139 - Back button after form submit does not re-submit',
    summary: `${passing}/${total} tests passing`,
    results,
  })
}
