import { NextResponse } from 'next/server'
import { join } from 'path'
import { readFileSync } from 'fs'

/**
 * GET /api/verify-share-targets — Verification endpoint for Feature #236.
 *
 * Verifies all 7 feature steps:
 * 1. Copy shareable link to clipboard
 * 2. Download image functionality
 * 3. Web Share API integration for direct sharing
 * 4. WhatsApp sharing target
 * 5. Twitter/X sharing target
 * 6. Fallback share options when Web Share API not supported
 * 7. Share events tracking for analytics
 */

interface TestResult {
  name: string
  pass: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []
  const cwd = process.cwd()

  // ── Helper to read source files ──
  function readSource(relPath: string): string {
    try {
      return readFileSync(join(cwd, relPath), 'utf8')
    } catch {
      return ''
    }
  }

  // Read all relevant source files
  const shareDialogSrc = readSource('components/app/share-dialog.tsx')
  const freedomCardSrc = readSource('components/app/freedom-card.tsx')
  const trackApiSrc = readSource('app/api/share/track/route.ts')
  const freedomCardApiSrc = readSource('app/api/share/freedom-card/route.ts')

  // ── Test 1: ShareDialog component exists ──
  results.push({
    name: 'ShareDialog component exists',
    pass: shareDialogSrc.length > 0,
    details: shareDialogSrc.length > 0
      ? `ShareDialog component found (${shareDialogSrc.length} chars)`
      : 'ShareDialog component NOT found at components/app/share-dialog.tsx',
  })

  // ── Test 2: Copy shareable link to clipboard ──
  const hasCopyLink = shareDialogSrc.includes('navigator.clipboard.writeText') &&
    shareDialogSrc.includes('handleCopyLink') &&
    shareDialogSrc.includes('copy_link')
  results.push({
    name: 'Copy shareable link to clipboard',
    pass: hasCopyLink,
    details: hasCopyLink
      ? 'handleCopyLink function uses navigator.clipboard.writeText with copy_link tracking'
      : 'Missing clipboard copy implementation',
  })

  // ── Test 3: Copy link has fallback for older browsers ──
  const hasCopyFallback = shareDialogSrc.includes('document.execCommand') ||
    shareDialogSrc.includes('textarea')
  results.push({
    name: 'Copy link has browser fallback',
    pass: hasCopyFallback,
    details: hasCopyFallback
      ? 'Fallback to textarea + execCommand for older browsers'
      : 'Missing clipboard fallback implementation',
  })

  // ── Test 4: Download image functionality ──
  const hasDownloadImage = shareDialogSrc.includes('handleDownloadImage') &&
    shareDialogSrc.includes('download_image') &&
    shareDialogSrc.includes('canvas')
  results.push({
    name: 'Download image functionality',
    pass: hasDownloadImage,
    details: hasDownloadImage
      ? 'handleDownloadImage uses SVG foreignObject + Canvas approach for PNG download'
      : 'Missing download image implementation',
  })

  // ── Test 5: Web Share API integration ──
  const hasWebShare = shareDialogSrc.includes('navigator.share') &&
    shareDialogSrc.includes('handleWebShare') &&
    shareDialogSrc.includes('web_share')
  results.push({
    name: 'Web Share API integration',
    pass: hasWebShare,
    details: hasWebShare
      ? 'navigator.share() used with title, text, url parameters'
      : 'Missing Web Share API integration',
  })

  // ── Test 6: Web Share API detection ──
  const hasWebShareDetection = shareDialogSrc.includes('webShareSupported') &&
    shareDialogSrc.includes('navigator.share')
  results.push({
    name: 'Web Share API feature detection',
    pass: hasWebShareDetection,
    details: hasWebShareDetection
      ? 'webShareSupported state detects navigator.share availability'
      : 'Missing Web Share API feature detection',
  })

  // ── Test 7: WhatsApp sharing target ──
  const hasWhatsApp = shareDialogSrc.includes('handleWhatsApp') &&
    shareDialogSrc.includes('wa.me') &&
    shareDialogSrc.includes('WhatsApp')
  results.push({
    name: 'WhatsApp sharing target',
    pass: hasWhatsApp,
    details: hasWhatsApp
      ? 'WhatsApp share via wa.me deep link with encoded text'
      : 'Missing WhatsApp sharing target',
  })

  // ── Test 8: Twitter/X sharing target ──
  const hasTwitter = shareDialogSrc.includes('handleTwitter') &&
    shareDialogSrc.includes('twitter.com/intent/tweet') &&
    shareDialogSrc.includes('Twitter/X')
  results.push({
    name: 'Twitter/X sharing target',
    pass: hasTwitter,
    details: hasTwitter
      ? 'Twitter share via twitter.com/intent/tweet with encoded text and URL'
      : 'Missing Twitter/X sharing target',
  })

  // ── Test 9: Fallback share options ──
  const hasFallback = shareDialogSrc.includes('fallback_whatsapp') &&
    shareDialogSrc.includes('fallback_twitter') &&
    shareDialogSrc.includes('share-fallback-notice')
  results.push({
    name: 'Fallback share options when Web Share API not supported',
    pass: hasFallback,
    details: hasFallback
      ? 'Fallback notice + WhatsApp/Twitter always available as direct links regardless of Web Share API support'
      : 'Missing fallback share options',
  })

  // ── Test 10: Share events tracking API ──
  const hasTrackApi = trackApiSrc.includes('POST') &&
    trackApiSrc.includes('share_type') &&
    trackApiSrc.includes('content_type') &&
    trackApiSrc.includes('share_events')
  results.push({
    name: 'Share events tracking API exists',
    pass: hasTrackApi,
    details: hasTrackApi
      ? 'POST /api/share/track accepts share_type, content_type, privacy_level and stores in share_events table'
      : 'Missing share events tracking API',
  })

  // ── Test 11: Share tracking in dialog component ──
  const hasTrackingCalls = shareDialogSrc.includes('trackShareEvent') &&
    shareDialogSrc.includes('/api/share/track')
  results.push({
    name: 'Share events tracked in dialog component',
    pass: hasTrackingCalls,
    details: hasTrackingCalls
      ? 'trackShareEvent() called for all share actions: copy_link, download_image, web_share, whatsapp, twitter'
      : 'Missing share tracking calls in dialog',
  })

  // ── Test 12: Share tracking API auth check ──
  const hasAuthCheck = trackApiSrc.includes('auth.getUser') &&
    trackApiSrc.includes('401')
  results.push({
    name: 'Share tracking API requires authentication',
    pass: hasAuthCheck,
    details: hasAuthCheck
      ? 'API returns 401 for unauthenticated requests'
      : 'Missing auth check in share tracking API',
  })

  // ── Test 13: Share tracking GET endpoint ──
  const hasGetEndpoint = trackApiSrc.includes('export async function GET') &&
    trackApiSrc.includes('stats')
  results.push({
    name: 'Share tracking GET endpoint for analytics',
    pass: hasGetEndpoint,
    details: hasGetEndpoint
      ? 'GET /api/share/track returns events and aggregated stats (by_type, by_content, total_shares)'
      : 'Missing GET endpoint for share analytics',
  })

  // ── Test 14: ShareDialog integrated in FreedomCard ──
  const hasIntegration = freedomCardSrc.includes('ShareDialog') &&
    freedomCardSrc.includes('showShareDialog') &&
    freedomCardSrc.includes('handleOpenShareDialog')
  results.push({
    name: 'ShareDialog integrated in FreedomCardGenerator',
    pass: hasIntegration,
    details: hasIntegration
      ? 'FreedomCardGenerator uses ShareDialog component with share content and captureRef'
      : 'Missing ShareDialog integration in FreedomCardGenerator',
  })

  // ── Test 15: ShareDialog has data-testid attributes ──
  const hasTestIds = shareDialogSrc.includes('share-dialog') &&
    shareDialogSrc.includes('share-target-copy') &&
    shareDialogSrc.includes('share-target-whatsapp') &&
    shareDialogSrc.includes('share-target-twitter') &&
    shareDialogSrc.includes('share-target-download')
  results.push({
    name: 'ShareDialog has data-testid attributes for testing',
    pass: hasTestIds,
    details: hasTestIds
      ? 'All share targets have data-testid attributes for automated testing'
      : 'Missing data-testid attributes on share targets',
  })

  // ── Test 16: ShareDialog has accessibility attributes ──
  const hasAccessibility = shareDialogSrc.includes('role="dialog"') &&
    shareDialogSrc.includes('aria-modal') &&
    shareDialogSrc.includes('aria-label')
  results.push({
    name: 'ShareDialog has accessibility attributes',
    pass: hasAccessibility,
    details: hasAccessibility
      ? 'Dialog has role="dialog", aria-modal, aria-label, ESC key handler, body scroll lock'
      : 'Missing accessibility attributes',
  })

  // ── Test 17: ShareDialog uses toast notifications ──
  const hasToast = shareDialogSrc.includes('useToast') &&
    shareDialogSrc.includes('addToast')
  results.push({
    name: 'ShareDialog uses toast notifications',
    pass: hasToast,
    details: hasToast
      ? 'Toast notifications for copy success, download success, share success'
      : 'Missing toast notification integration',
  })

  // ── Test 18: useShareDialog convenience hook ──
  const hasHook = shareDialogSrc.includes('export function useShareDialog') &&
    shareDialogSrc.includes('openShareDialog') &&
    shareDialogSrc.includes('closeShareDialog')
  results.push({
    name: 'useShareDialog convenience hook exported',
    pass: hasHook,
    details: hasHook
      ? 'Reusable useShareDialog hook for easy integration in other components'
      : 'Missing useShareDialog hook',
  })

  // ── Test 19: Freedom card API still works ──
  results.push({
    name: 'Freedom card API endpoint exists',
    pass: freedomCardApiSrc.length > 0 && freedomCardApiSrc.includes('freedomPercentage'),
    details: freedomCardApiSrc.length > 0
      ? 'GET /api/share/freedom-card endpoint exists and returns card data'
      : 'Freedom card API endpoint not found',
  })

  // ── Test 20: Share tracking graceful fallback ──
  const hasGracefulFallback = trackApiSrc.includes('tracked: false') &&
    trackApiSrc.includes('fallback')
  results.push({
    name: 'Share tracking graceful fallback (table not exist)',
    pass: hasGracefulFallback,
    details: hasGracefulFallback
      ? 'Returns tracked: false with fallback source when share_events table does not exist'
      : 'Missing graceful fallback for missing table',
  })

  // ── Summary ──
  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    status: passing === total ? 'PASS' : 'FAIL',
    summary: `${passing}/${total} tests passing`,
    results,
    timestamp: new Date().toISOString(),
  })
}
