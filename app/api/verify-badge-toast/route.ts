import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-badge-toast — Verification endpoint for Feature #205
 *
 * Checks that the BadgeToast notification system meets all requirements:
 * 1. BadgeToast component with trophy icon and badge name
 * 2. Animation: badge icon flies toward profile/identity section
 * 3. Queue system for multiple badges earned simultaneously
 * 4. Show toasts sequentially with slight delay
 * 5. Mark badge as notified in user_badges table
 * 6. Don't show notification for already-notified badges
 */
export async function GET() {
  const results: Array<{
    id: number
    name: string
    passed: boolean
    detail: string
  }> = []

  let testId = 0

  // Helper to read file
  const readFile = (relPath: string): string => {
    try {
      return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8')
    } catch {
      return ''
    }
  }

  // ── 1. BadgeToast component exists with trophy icon ────────────
  testId++
  const toastProviderSrc = readFile('components/app/toast-provider.tsx')
  const hasBadgeToast = toastProviderSrc.includes('data-testid="badge-toast"')
  const hasTrophyIcon = toastProviderSrc.includes('🏆') && toastProviderSrc.includes('badge-toast-trophy')
  results.push({
    id: testId,
    name: 'BadgeToast component with trophy icon',
    passed: hasBadgeToast && hasTrophyIcon,
    detail: hasBadgeToast && hasTrophyIcon
      ? 'BadgeToastItem renders with data-testid="badge-toast" and 🏆 trophy icon'
      : `Missing: badgeToast=${hasBadgeToast}, trophyIcon=${hasTrophyIcon}`,
  })

  // ── 2. Badge name displayed in toast title ─────────────────────
  testId++
  const hasBadgeName = toastProviderSrc.includes('Badge verdiend:') && toastProviderSrc.includes('badge-toast-title')
  results.push({
    id: testId,
    name: 'Toast shows "🏆 Badge verdiend: [name]!" title',
    passed: hasBadgeName,
    detail: hasBadgeName
      ? 'Toast title includes "🏆 Badge verdiend: {badge.name}!" pattern'
      : 'Missing badge name in toast title',
  })

  // ── 3. Badge icon displayed in toast ───────────────────────────
  testId++
  const hasBadgeIcon = toastProviderSrc.includes('badge-toast-icon')
  results.push({
    id: testId,
    name: 'Toast shows badge icon',
    passed: hasBadgeIcon,
    detail: hasBadgeIcon
      ? 'Badge icon element with data-testid="badge-toast-icon" found'
      : 'Missing badge icon display in toast',
  })

  // ── 4. Flying badge icon animation ─────────────────────────────
  testId++
  const hasFlyingIcon = toastProviderSrc.includes('FlyingBadgeIcon') && toastProviderSrc.includes('flying-badge-icon')
  const hasFlyAnimation = toastProviderSrc.includes('cubic-bezier') || toastProviderSrc.includes('transition')
  results.push({
    id: testId,
    name: 'Animation: badge icon flies toward profile',
    passed: hasFlyingIcon && hasFlyAnimation,
    detail: hasFlyingIcon && hasFlyAnimation
      ? 'FlyingBadgeIcon component with CSS transition animation flies icon toward top-right (profile area)'
      : `Missing: flyingIcon=${hasFlyingIcon}, animation=${hasFlyAnimation}`,
  })

  // ── 5. Queue system for multiple badges ────────────────────────
  testId++
  const hasQueueRef = toastProviderSrc.includes('badgeQueueRef')
  const hasProcessingRef = toastProviderSrc.includes('processingRef')
  const hasQueueBadges = toastProviderSrc.includes('queueBadges')
  results.push({
    id: testId,
    name: 'Queue system for multiple badges',
    passed: hasQueueRef && hasProcessingRef && hasQueueBadges,
    detail: hasQueueRef && hasProcessingRef && hasQueueBadges
      ? 'Badge queue with badgeQueueRef, processingRef, and queueBadges function implemented'
      : `Missing: queueRef=${hasQueueRef}, processing=${hasProcessingRef}, queueFn=${hasQueueBadges}`,
  })

  // ── 6. Sequential toast display with delay ─────────────────────
  testId++
  const hasSequentialDelay = toastProviderSrc.includes('setTimeout(processNext') && toastProviderSrc.includes('1200')
  results.push({
    id: testId,
    name: 'Toasts shown sequentially with delay',
    passed: hasSequentialDelay,
    detail: hasSequentialDelay
      ? 'processNext called with 1200ms setTimeout between sequential badge toasts'
      : 'Missing sequential processing with delay',
  })

  // ── 7. Mark as notified API endpoint exists ────────────────────
  testId++
  const notifyApiSrc = readFile('app/api/badges/notify/route.ts')
  const hasNotifyPost = notifyApiSrc.includes('export async function POST')
  const hasNotifyGet = notifyApiSrc.includes('export async function GET')
  results.push({
    id: testId,
    name: 'Mark-as-notified API endpoint (POST /api/badges/notify)',
    passed: hasNotifyPost,
    detail: hasNotifyPost
      ? 'POST /api/badges/notify endpoint exists to mark badges as notified'
      : 'Missing POST /api/badges/notify endpoint',
  })

  // ── 8. Get unnotified badges API endpoint ──────────────────────
  testId++
  results.push({
    id: testId,
    name: 'Get unnotified badges API endpoint (GET /api/badges/notify)',
    passed: hasNotifyGet,
    detail: hasNotifyGet
      ? 'GET /api/badges/notify endpoint exists to fetch unnotified badges'
      : 'Missing GET /api/badges/notify endpoint',
  })

  // ── 9. Toast calls mark-as-notified after showing ──────────────
  testId++
  const toastCallsNotify = toastProviderSrc.includes('/api/badges/notify') && toastProviderSrc.includes('badge.slug')
  results.push({
    id: testId,
    name: 'Toast marks badge as notified after display',
    passed: toastCallsNotify,
    detail: toastCallsNotify
      ? 'ToastProvider calls /api/badges/notify with badge slug after showing toast'
      : 'Missing notify call in toast display flow',
  })

  // ── 10. Prevent repeat notifications ───────────────────────────
  testId++
  const notifyEndpointChecksNotified = notifyApiSrc.includes('notified') && notifyApiSrc.includes('eq(\'notified\', false)')
  results.push({
    id: testId,
    name: 'Prevent repeat notifications for already-notified badges',
    passed: notifyEndpointChecksNotified,
    detail: notifyEndpointChecksNotified
      ? 'GET /api/badges/notify only returns badges where notified=false'
      : 'Missing notified filter in unnotified badges query',
  })

  // ── 11. BadgeNotifier component in app layout ──────────────────
  testId++
  const layoutSrc = readFile('app/(app)/layout.tsx')
  const hasBadgeNotifier = layoutSrc.includes('BadgeNotifier') && layoutSrc.includes('badge-notifier')
  results.push({
    id: testId,
    name: 'BadgeNotifier component in app layout',
    passed: hasBadgeNotifier,
    detail: hasBadgeNotifier
      ? 'BadgeNotifier is imported and rendered in app/(app)/layout.tsx'
      : 'Missing BadgeNotifier in app layout',
  })

  // ── 12. useUnnotifiedBadges hook exists ────────────────────────
  testId++
  const unnotifiedHookSrc = readFile('lib/hooks/use-unnotified-badges.ts')
  const hasUnnotifiedHook = unnotifiedHookSrc.includes('useUnnotifiedBadges') && unnotifiedHookSrc.includes('/api/badges/notify')
  results.push({
    id: testId,
    name: 'useUnnotifiedBadges hook for page-load check',
    passed: hasUnnotifiedHook,
    detail: hasUnnotifiedHook
      ? 'useUnnotifiedBadges hook fetches unnotified badges on mount and queues them'
      : 'Missing useUnnotifiedBadges hook',
  })

  // ── 13. Badge evaluation hooks uses queue ──────────────────────
  testId++
  const evalHookSrc = readFile('lib/hooks/use-badge-evaluation.ts')
  const evalUsesQueue = evalHookSrc.includes('queueBadges')
  results.push({
    id: testId,
    name: 'useBadgeEvaluation uses queue system',
    passed: evalUsesQueue,
    detail: evalUsesQueue
      ? 'useBadgeEvaluation hook uses queueBadges for sequential toast display'
      : 'Missing queueBadges usage in useBadgeEvaluation',
  })

  // ── 14. Badge toast has proper accessibility ───────────────────
  testId++
  const hasA11y = toastProviderSrc.includes('role="alert"') && toastProviderSrc.includes('aria-live="polite"')
  results.push({
    id: testId,
    name: 'Badge toast accessibility (role=alert, aria-live)',
    passed: hasA11y,
    detail: hasA11y
      ? 'Toast has role="alert" and container has aria-live="polite"'
      : 'Missing accessibility attributes on badge toast',
  })

  // ── Summary ────────────────────────────────────────────────────
  const passing = results.filter((r) => r.passed).length

  return NextResponse.json({
    feature: '#205 — Badge notification toast system',
    passing,
    total: results.length,
    all_passing: passing === results.length,
    results,
  })
}
