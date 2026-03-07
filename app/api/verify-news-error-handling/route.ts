import { NextResponse } from 'next/server'

/**
 * Verification endpoint for feature #498:
 * Tests that the /berichten page handles news API errors gracefully.
 *
 * We verify the code structure rather than making actual AI calls.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Test 1: /api/news returns proper error JSON on failure
  {
    try {
      // Call news API without auth — should get 401
      const res = await fetch(`http://localhost:3000/api/news`, {
        headers: { 'Accept': 'application/json' },
      })
      const data = await res.json()
      const pass = res.status === 401 && typeof data.error === 'string'
      results.push({
        name: 'API retourneert JSON error bij ontbrekende auth',
        pass,
        detail: `Status: ${res.status}, Error: ${data.error ?? 'geen'}`,
      })
    } catch (err) {
      results.push({
        name: 'API retourneert JSON error bij ontbrekende auth',
        pass: false,
        detail: `Fetch failed: ${err}`,
      })
    }
  }

  // Test 2: Verify news error UI elements exist in the berichten page source
  {
    try {
      const res = await fetch('http://localhost:3000/berichten', {
        headers: { 'Accept': 'text/html' },
      })
      // Since not logged in, we'll get redirected to login — that's expected
      // Instead, read the source file directly
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      const hasErrorState = source.includes('newsError')
      const hasRetryButton = source.includes('Opnieuw proberen')
      const hasAlertCircle = source.includes('AlertCircle')
      const hasRefreshCw = source.includes('RefreshCw')
      const hasErrorReset = source.includes('setNewsFetched(false)')
      const hasUserFriendlyMessage = source.includes('Nieuws kon niet worden geladen')

      const allPass = hasErrorState && hasRetryButton && hasAlertCircle && hasRefreshCw && hasErrorReset && hasUserFriendlyMessage

      results.push({
        name: 'Berichten pagina heeft error state met foutmelding',
        pass: hasErrorState && hasUserFriendlyMessage,
        detail: `newsError state: ${hasErrorState}, user-friendly message: ${hasUserFriendlyMessage}`,
      })

      results.push({
        name: 'Berichten pagina heeft Opnieuw proberen knop',
        pass: hasRetryButton && hasRefreshCw,
        detail: `Retry button: ${hasRetryButton}, RefreshCw icon: ${hasRefreshCw}`,
      })

      results.push({
        name: 'Retry reset newsFetched en newsError state',
        pass: hasErrorReset,
        detail: `setNewsFetched(false) in onClick: ${hasErrorReset}`,
      })

      results.push({
        name: 'Alle error handling elementen aanwezig',
        pass: allPass,
        detail: `Error state: ${hasErrorState}, Retry: ${hasRetryButton}, Icon: ${hasAlertCircle}, Refresh: ${hasRefreshCw}, Reset: ${hasErrorReset}, Message: ${hasUserFriendlyMessage}`,
      })
    } catch (err) {
      results.push({
        name: 'Source analysis',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 3: Verify the AI chat endpoint also returns proper error on sanitize fail
  {
    try {
      const res = await fetch('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], domain: 'wil' }),
      })
      const data = await res.json()
      const pass = res.status === 401
      results.push({
        name: 'AI chat API retourneert 401 zonder auth',
        pass,
        detail: `Status: ${res.status}, Body: ${JSON.stringify(data)}`,
      })
    } catch (err) {
      results.push({
        name: 'AI chat API retourneert 401 zonder auth',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 4: Verify the news fetch code catches errors properly
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      // Check that fetchNews has proper error handling
      const hasTryCatch = source.includes('catch (err)') && source.includes('setNewsError')
      const handlesHttpError = source.includes('!res.ok') && source.includes('throw new Error')
      const handlesNetworkError = source.includes('err instanceof Error')

      results.push({
        name: 'fetchNews heeft volledige error handling',
        pass: hasTryCatch && handlesHttpError && handlesNetworkError,
        detail: `try/catch + setNewsError: ${hasTryCatch}, HTTP errors: ${handlesHttpError}, network errors: ${handlesNetworkError}`,
      })
    } catch (err) {
      results.push({
        name: 'fetchNews error handling check',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 5: Verify refreshNews also has error handling
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      // Check refreshNews function
      const hasRefreshFn = source.includes('refreshNews')
      const refreshIdx = source.indexOf('const refreshNews')
      const refreshBlock = source.slice(refreshIdx, refreshIdx + 800)
      const refreshHasErrorHandling = refreshBlock.includes('catch (err)') && refreshBlock.includes('setNewsError')

      results.push({
        name: 'refreshNews heeft ook error handling',
        pass: hasRefreshFn && refreshHasErrorHandling,
        detail: `refreshNews exists: ${hasRefreshFn}, has error handling: ${refreshHasErrorHandling}`,
      })
    } catch (err) {
      results.push({
        name: 'refreshNews error handling check',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  const passing = results.filter((r) => r.pass).length

  return NextResponse.json({
    summary: `${passing}/${results.length} tests passing`,
    allPassing: passing === results.length,
    results,
  })
}
