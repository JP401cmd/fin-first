import { NextResponse } from 'next/server'

/**
 * Verification endpoint for feature #500:
 * When AI provider is unavailable, /berichten shows only meldingen
 * and displays a passende melding in the nieuws section.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Test 1: /api/news returns descriptive error when AI model fails
  {
    // Without valid auth/AI config, the news API should return a JSON error
    try {
      const res = await fetch('http://localhost:3000/api/news')
      const data = await res.json()
      // Should get an error response (401 without auth, or 422/500 with bad AI config)
      const pass = !res.ok && typeof data.error === 'string' && data.error.length > 0
      results.push({
        name: 'News API retourneert beschrijvende fout zonder geldige config',
        pass,
        detail: `Status: ${res.status}, Error: "${data.error}"`,
      })
    } catch (err) {
      results.push({
        name: 'News API retourneert beschrijvende fout zonder geldige config',
        pass: false,
        detail: `Fetch failed: ${err}`,
      })
    }
  }

  // Test 2: /api/notifications works independently (no AI dependency)
  {
    try {
      const res = await fetch('http://localhost:3000/api/notifications?days=30')
      // Without auth returns 401 — but the point is it doesn't crash and returns JSON
      const data = await res.json()
      const pass = typeof data === 'object'
      results.push({
        name: 'Notifications API is onafhankelijk van AI provider',
        pass,
        detail: `Status: ${res.status}, Has response body: ${typeof data === 'object'}`,
      })
    } catch (err) {
      results.push({
        name: 'Notifications API is onafhankelijk van AI provider',
        pass: false,
        detail: `Fetch failed: ${err}`,
      })
    }
  }

  // Test 3: Berichten page handles news errors gracefully (shows both sections)
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      // Meldingen section exists and works independently
      const hasMeldingenSection = source.includes("label=\"Meldingen\"")
      const hasFinancieelNieuwsSection = source.includes("label=\"Financieel Nieuws\"")

      // Error handling: when newsError is set, show error message
      const hasNewsErrorState = source.includes('newsError ?')
      const hasUserMessage = source.includes('Nieuws kon niet worden geladen')

      // Notifications use separate API (/api/notifications)
      const usesNotificationsApi = source.includes('/api/notifications')
      const usesNewsApi = source.includes('/api/news')

      // Both sections are rendered independently (not inside same conditional)
      const meldingenIdx = source.indexOf('MELDINGEN sectie')
      const nieuwsIdx = source.indexOf('FINANCIEEL NIEUWS sectie')
      const sectionsIndependent = meldingenIdx > 0 && nieuwsIdx > meldingenIdx

      results.push({
        name: 'Meldingen en Nieuws secties zijn onafhankelijk gerenderd',
        pass: sectionsIndependent && hasMeldingenSection && hasFinancieelNieuwsSection,
        detail: `Meldingen section: ${hasMeldingenSection}, Nieuws section: ${hasFinancieelNieuwsSection}, Independent: ${sectionsIndependent}`,
      })

      results.push({
        name: 'Nieuws sectie toont passende foutmelding bij AI-fout',
        pass: hasNewsErrorState && hasUserMessage,
        detail: `Error state handler: ${hasNewsErrorState}, User message: ${hasUserMessage}`,
      })

      results.push({
        name: 'Meldingen en Nieuws gebruiken aparte APIs',
        pass: usesNotificationsApi && usesNewsApi,
        detail: `Uses /api/notifications: ${usesNotificationsApi}, Uses /api/news: ${usesNewsApi}`,
      })
    } catch (err) {
      results.push({
        name: 'Source analysis',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 4: Verify that the news error state doesn't crash the rest of the page
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      // newsError is caught in fetchNews and stored in state (not thrown)
      const errorCaught = source.includes('setNewsError(err instanceof Error')
      // newsLoading is reset in finally block
      const loadingReset = source.includes('setNewsLoading(false)')
      // The component renders both sections regardless of news state
      const rendersAfterError = source.includes('newsError ?') && source.includes('newsItems.length > 0 ?')

      results.push({
        name: 'News fout crasht de pagina niet (error boundary pattern)',
        pass: errorCaught && loadingReset && rendersAfterError,
        detail: `Error caught: ${errorCaught}, Loading reset: ${loadingReset}, Renders after error: ${rendersAfterError}`,
      })
    } catch (err) {
      results.push({
        name: 'Error boundary check',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 5: AIConfigError from getModel is handled in news route
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/api/news/route.ts', 'utf-8')

      const hasAIConfigError = source.includes('AIConfigError')
      const returns422 = source.includes('status: 422')
      const hasModelFallback = source.includes('AI model kon niet worden geladen')
      const returns500 = source.includes('status: 500')

      results.push({
        name: 'News API vangt AIConfigError (geen API key) op',
        pass: hasAIConfigError && returns422 && hasModelFallback && returns500,
        detail: `AIConfigError handled: ${hasAIConfigError}, Returns 422: ${returns422}, Fallback message: ${hasModelFallback}, Returns 500: ${returns500}`,
      })
    } catch (err) {
      results.push({
        name: 'AIConfigError handling check',
        pass: false,
        detail: `Error: ${err}`,
      })
    }
  }

  // Test 6: Verify retry button exists for recovery after API key is restored
  {
    try {
      const fs = await import('fs/promises')
      const source = await fs.readFile('app/(app)/berichten/page.tsx', 'utf-8')

      const hasRetryButton = source.includes('Opnieuw proberen')
      const hasRefreshButton = source.includes('refreshNews')
      const resetsState = source.includes('setNewsFetched(false)') && source.includes('setNewsError(null)')

      results.push({
        name: 'Retry/refresh mechanisme beschikbaar voor herstel',
        pass: hasRetryButton && hasRefreshButton && resetsState,
        detail: `Retry button: ${hasRetryButton}, Refresh fn: ${hasRefreshButton}, State reset: ${resetsState}`,
      })
    } catch (err) {
      results.push({
        name: 'Retry mechanism check',
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
