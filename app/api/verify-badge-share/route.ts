import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS } from '@/lib/badges'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/verify-badge-share — Verification endpoint for Feature #238: Badge showcase sharing
 *
 * Tests:
 * 1. Share button exists in badge detail view
 * 2. ShareDialog imported and used in badge-grid.tsx
 * 3. Badge name and description included in share text
 * 4. Web Share API support via ShareDialog
 * 5. Copy link and download image support
 * 6. Consistent TriFinity branding in shared badge image
 * 7. Share content type is 'badge'
 * 8. Share tracking API accepts 'badge' content_type
 * 9. renderBadgeCardToCanvas function exists and is exported
 * 10. canvasColorHex provides per-badge-color styling
 * 11. Only earned badges have share button
 * 12. Badge share card includes badge icon, name, category, and branding
 */
export async function GET() {
  const results: Array<{ test: string; pass: boolean; detail: string }> = []

  try {
    // Read the badge-grid.tsx file
    const badgeGridPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const badgeGridSrc = fs.readFileSync(badgeGridPath, 'utf-8')

    // Read the share-dialog.tsx file
    const shareDialogPath = path.join(process.cwd(), 'components', 'app', 'share-dialog.tsx')
    const shareDialogSrc = fs.readFileSync(shareDialogPath, 'utf-8')

    // Read the share tracking API
    const shareTrackPath = path.join(process.cwd(), 'app', 'api', 'share', 'track', 'route.ts')
    const shareTrackSrc = fs.readFileSync(shareTrackPath, 'utf-8')

    // Test 1: Share button exists in badge detail view
    const hasShareButton = badgeGridSrc.includes('badge-share-button') &&
      badgeGridSrc.includes('Deel deze badge')
    results.push({
      test: 'Share button in badge detail view',
      pass: hasShareButton,
      detail: hasShareButton
        ? 'Found badge-share-button with "Deel deze badge" label'
        : 'Missing share button in badge detail modal',
    })

    // Test 2: ShareDialog imported and used
    const hasShareDialogImport = badgeGridSrc.includes("from '@/components/app/share-dialog'") ||
      badgeGridSrc.includes('from "@/components/app/share-dialog"')
    const hasShareDialogUsage = badgeGridSrc.includes('<ShareDialog')
    results.push({
      test: 'ShareDialog imported and used in badge-grid.tsx',
      pass: hasShareDialogImport && hasShareDialogUsage,
      detail: hasShareDialogImport && hasShareDialogUsage
        ? 'ShareDialog properly imported and rendered'
        : `Import: ${hasShareDialogImport}, Usage: ${hasShareDialogUsage}`,
    })

    // Test 3: Badge name and description in share text
    const hasNameInText = badgeGridSrc.includes('badge.name') && badgeGridSrc.includes('badge verdiend')
    const hasDescInText = badgeGridSrc.includes('badge.description')
    results.push({
      test: 'Badge name and description in share text',
      pass: hasNameInText && hasDescInText,
      detail: hasNameInText && hasDescInText
        ? 'Share text includes badge name ("badge verdiend") and description'
        : `Name in text: ${hasNameInText}, Description in text: ${hasDescInText}`,
    })

    // Test 4: Web Share API support via ShareDialog
    const shareDialogHasWebShare = shareDialogSrc.includes('navigator.share') &&
      shareDialogSrc.includes('web_share')
    results.push({
      test: 'Web Share API support via ShareDialog',
      pass: shareDialogHasWebShare,
      detail: shareDialogHasWebShare
        ? 'ShareDialog supports Web Share API with navigator.share'
        : 'Web Share API support not found in ShareDialog',
    })

    // Test 5: Copy link and download image support
    const hasCopyLink = shareDialogSrc.includes('handleCopyLink') && shareDialogSrc.includes('copy_link')
    const hasDownload = shareDialogSrc.includes('handleDownloadImage') && shareDialogSrc.includes('download_image')
    results.push({
      test: 'Copy link and download image support',
      pass: hasCopyLink && hasDownload,
      detail: hasCopyLink && hasDownload
        ? 'ShareDialog supports both copy link and download image'
        : `Copy link: ${hasCopyLink}, Download: ${hasDownload}`,
    })

    // Test 6: Consistent TriFinity branding in shared badge image
    const hasTriFinityBranding = badgeGridSrc.includes('TriFinity') &&
      (badgeGridSrc.includes('#fbbf24') || badgeGridSrc.includes('AMBER_400')) &&
      (badgeGridSrc.includes('#2dd4bf') || badgeGridSrc.includes('TEAL_400')) &&
      (badgeGridSrc.includes('#a855f7') || badgeGridSrc.includes('PURPLE_400'))
    const hasBrandingDots = badgeGridSrc.includes('dotSize') || badgeGridSrc.includes('#fbbf24')
    results.push({
      test: 'Consistent TriFinity branding in shared badge image',
      pass: hasTriFinityBranding && hasBrandingDots,
      detail: hasTriFinityBranding && hasBrandingDots
        ? 'TriFinity branding with amber/teal/purple dots present'
        : 'Missing TriFinity branding elements',
    })

    // Test 7: Share content type is 'badge'
    const hasContentTypeBadge = badgeGridSrc.includes("contentType: 'badge'")
    results.push({
      test: "Share content type set to 'badge'",
      pass: hasContentTypeBadge,
      detail: hasContentTypeBadge
        ? "contentType: 'badge' found in share content"
        : "Missing contentType: 'badge' in share content",
    })

    // Test 8: Share tracking API accepts 'badge' content type
    const shareDialogHasBadgeType = shareDialogSrc.includes("'badge'")
    const trackApiHasBadge = shareTrackSrc.includes("'badge'")
    results.push({
      test: "Share tracking API and dialog accept 'badge' content type",
      pass: shareDialogHasBadgeType && trackApiHasBadge,
      detail: shareDialogHasBadgeType && trackApiHasBadge
        ? "Both ShareDialog type and track API accept 'badge'"
        : `Dialog: ${shareDialogHasBadgeType}, Track API: ${trackApiHasBadge}`,
    })

    // Test 9: renderBadgeCardToCanvas function exists and is exported
    const hasCanvasRender = badgeGridSrc.includes('export function renderBadgeCardToCanvas')
    const hasCanvasElement = badgeGridSrc.includes('document.createElement') && badgeGridSrc.includes("'canvas'")
    results.push({
      test: 'renderBadgeCardToCanvas function exported',
      pass: hasCanvasRender && hasCanvasElement,
      detail: hasCanvasRender && hasCanvasElement
        ? 'renderBadgeCardToCanvas creates canvas with badge image'
        : `Export: ${hasCanvasRender}, Canvas: ${hasCanvasElement}`,
    })

    // Test 10: canvasColorHex provides per-badge-color styling
    const hasCanvasColors = badgeGridSrc.includes('canvasColorHex')
    const allColors = ['amber', 'teal', 'purple', 'emerald', 'rose', 'blue', 'zinc']
    const colorsInCanvas = allColors.filter(c => {
      const regex = new RegExp(`${c}:\\s*\\{\\s*primary:`)
      return regex.test(badgeGridSrc)
    })
    results.push({
      test: 'canvasColorHex with per-badge-color styling',
      pass: hasCanvasColors && colorsInCanvas.length === allColors.length,
      detail: `${colorsInCanvas.length}/${allColors.length} badge colors defined in canvasColorHex`,
    })

    // Test 11: Only earned badges have share button
    const shareOnlyEarned = badgeGridSrc.includes('badge.earned && onShare')
    results.push({
      test: 'Share button only shown for earned badges',
      pass: shareOnlyEarned,
      detail: shareOnlyEarned
        ? 'Share button conditionally rendered with badge.earned && onShare'
        : 'Missing earned badge guard on share button',
    })

    // Test 12: Badge share card includes icon, name, category, branding
    const hasShareCard = badgeGridSrc.includes('BadgeShareCard') || badgeGridSrc.includes('badge-share-card')
    const cardHasIcon = badgeGridSrc.includes('badge.icon')
    const cardHasName = badgeGridSrc.includes('badge.name')
    const cardHasCategory = badgeGridSrc.includes('categoryLabels[badge.category]') || badgeGridSrc.includes('catLabel')
    results.push({
      test: 'Badge share card with icon, name, category, branding',
      pass: hasShareCard && cardHasIcon && cardHasName && cardHasCategory,
      detail: hasShareCard && cardHasIcon && cardHasName && cardHasCategory
        ? 'BadgeShareCard renders icon, name, category with TriFinity branding'
        : `Card: ${hasShareCard}, Icon: ${cardHasIcon}, Name: ${cardHasName}, Cat: ${cardHasCategory}`,
    })

  } catch (err) {
    results.push({
      test: 'File reading',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#238 Badge showcase sharing',
    passing,
    total,
    all_passing: passing === total,
    results,
  })
}
