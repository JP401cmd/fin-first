import { NextResponse } from 'next/server'
import { BADGE_DEFINITIONS, BADGE_CRITERIA, type BadgeCategory } from '@/lib/badges'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-badge-grid — Verification endpoint for Feature #206
 * Verifies the BadgeGrid showcase on Identity page.
 */
export async function GET() {
  const results: { test: string; passed: boolean; details: string }[] = []

  // ── Test 1: BadgeGrid component exists ─────────────────────────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const exists = fs.existsSync(componentPath)
    const content = exists ? fs.readFileSync(componentPath, 'utf-8') : ''
    results.push({
      test: 'BadgeGrid component exists',
      passed: exists && content.includes('export function BadgeGrid'),
      details: exists ? 'badge-grid.tsx exists with BadgeGrid export' : 'Component file missing',
    })
  } catch (e) {
    results.push({ test: 'BadgeGrid component exists', passed: false, details: String(e) })
  }

  // ── Test 2: Identity page imports and renders BadgeGrid ────────
  try {
    const identityPath = path.join(process.cwd(), 'app', '(app)', 'identity', 'page.tsx')
    const content = fs.readFileSync(identityPath, 'utf-8')
    const importsBadgeGrid = content.includes("import { BadgeGrid }") || content.includes("import {BadgeGrid}")
    const rendersBadgeGrid = content.includes('<BadgeGrid')
    results.push({
      test: 'Identity page renders BadgeGrid',
      passed: importsBadgeGrid && rendersBadgeGrid,
      details: `Imports: ${importsBadgeGrid}, Renders: ${rendersBadgeGrid}`,
    })
  } catch (e) {
    results.push({ test: 'Identity page renders BadgeGrid', passed: false, details: String(e) })
  }

  // ── Test 3: Earned badges shown in full color ──────────────────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    // Earned badges use colored backgrounds
    const hasEarnedColors = content.includes('bgEarned') && content.includes('borderEarned')
    // Earned badges show actual icon (not ❓)
    const showsActualIcon = content.includes("badge.earned ? badge.icon : '❓'")
    results.push({
      test: 'Earned badges shown in full color',
      passed: hasEarnedColors && showsActualIcon,
      details: `Color styling: ${hasEarnedColors}, Icon shown: ${showsActualIcon}`,
    })
  } catch (e) {
    results.push({ test: 'Earned badges shown in full color', passed: false, details: String(e) })
  }

  // ── Test 4: Locked badges grayed with ? overlay ────────────────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const hasGrayscale = content.includes('grayscale opacity-30')
    const hasQuestionMark = content.includes("'❓'")
    const hasDashedBorder = content.includes('border-dashed')
    const showsLockedName = content.includes("'???'")
    results.push({
      test: 'Locked badges grayed with ? overlay',
      passed: hasGrayscale && hasQuestionMark && hasDashedBorder && showsLockedName,
      details: `Grayscale: ${hasGrayscale}, ❓: ${hasQuestionMark}, Dashed: ${hasDashedBorder}, ???: ${showsLockedName}`,
    })
  } catch (e) {
    results.push({ test: 'Locked badges grayed with ? overlay', passed: false, details: String(e) })
  }

  // ── Test 5: Click opens detail view with name, description, date ─
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const hasDetailModal = content.includes('BadgeDetail') && content.includes('selectedBadge')
    const showsName = content.includes('badge-detail-name')
    const showsDescription = content.includes('badge-detail-description')
    const showsDate = content.includes('badge-detail-date') && content.includes('Verdiend op')
    const hasCloseButton = content.includes('badge-detail-close')
    results.push({
      test: 'Click badge opens detail with name/description/date',
      passed: hasDetailModal && showsName && showsDescription && showsDate && hasCloseButton,
      details: `Modal: ${hasDetailModal}, Name: ${showsName}, Desc: ${showsDescription}, Date: ${showsDate}, Close: ${hasCloseButton}`,
    })
  } catch (e) {
    results.push({ test: 'Click badge opens detail with name/description/date', passed: false, details: String(e) })
  }

  // ── Test 6: Total badge count "X van Y verdiend" ───────────────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const hasCountDisplay = content.includes('van {totalCount} verdiend') || content.includes('van {totalCount} verdiend')
    const hasProgressBar = content.includes('badge-progress-summary')
    const hasEarnedCountTestId = content.includes('badge-earned-count')
    results.push({
      test: 'Shows total badge count "X van Y verdiend"',
      passed: hasCountDisplay && hasProgressBar && hasEarnedCountTestId,
      details: `Count display: ${hasCountDisplay}, Progress bar: ${hasProgressBar}, TestId: ${hasEarnedCountTestId}`,
    })
  } catch (e) {
    results.push({ test: 'Shows total badge count "X van Y verdiend"', passed: false, details: String(e) })
  }

  // ── Test 7: Progress indicators for partially-met criteria ─────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const hasProgressOnCard = content.includes('badge-progress-') && content.includes('badge.progress')
    const hasProgressInDetail = content.includes('badge-detail-progress') && content.includes('Voortgang')
    const hasProgressLabel = content.includes('progress_label')
    const hasProgressBar = content.includes('bg-emerald-400') && content.includes('bg-amber-400')
    results.push({
      test: 'Progress indicators for partially-met badge criteria',
      passed: hasProgressOnCard && hasProgressInDetail && hasProgressLabel && hasProgressBar,
      details: `Card progress: ${hasProgressOnCard}, Detail progress: ${hasProgressInDetail}, Label: ${hasProgressLabel}, Colors: ${hasProgressBar}`,
    })
  } catch (e) {
    results.push({ test: 'Progress indicators for partially-met badge criteria', passed: false, details: String(e) })
  }

  // ── Test 8: Badge criteria definitions exist for progress tracking ─
  try {
    const criteriaCount = Object.keys(BADGE_CRITERIA).length
    const hasFunctionLabels = Object.values(BADGE_CRITERIA).every(c => typeof c.label === 'function')
    results.push({
      test: 'Badge criteria definitions for progress tracking',
      passed: criteriaCount >= 10 && hasFunctionLabels,
      details: `${criteriaCount} criteria defined, all with label functions: ${hasFunctionLabels}`,
    })
  } catch (e) {
    results.push({ test: 'Badge criteria definitions for progress tracking', passed: false, details: String(e) })
  }

  // ── Test 9: Badge definitions cover all categories ─────────────
  try {
    const categories = new Set(BADGE_DEFINITIONS.map(b => b.category))
    const expectedCategories: BadgeCategory[] = [
      'onboarding', 'consistency', 'financial_health', 'fire_milestones',
      'actions', 'budget', 'exploration', 'sovereignty'
    ]
    const allPresent = expectedCategories.every(c => categories.has(c))
    results.push({
      test: 'All 8 badge categories defined',
      passed: allPresent && BADGE_DEFINITIONS.length === 35,
      details: `Categories: ${categories.size}/8, Total badges: ${BADGE_DEFINITIONS.length}/35`,
    })
  } catch (e) {
    results.push({ test: 'All 8 badge categories defined', passed: false, details: String(e) })
  }

  // ── Test 10: Category grouping with per-category counts ────────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const hasCategoryGrouping = content.includes('categories.map')
    const hasCategoryCount = content.includes('categoryEarned') && content.includes('categoryBadges.length')
    const hasCategoryLabels = content.includes('categoryLabels')
    results.push({
      test: 'Badges grouped by category with per-category counts',
      passed: hasCategoryGrouping && hasCategoryCount && hasCategoryLabels,
      details: `Grouping: ${hasCategoryGrouping}, Counts: ${hasCategoryCount}, Labels: ${hasCategoryLabels}`,
    })
  } catch (e) {
    results.push({ test: 'Badges grouped by category with per-category counts', passed: false, details: String(e) })
  }

  // ── Test 11: API provides progress data ────────────────────────
  try {
    const apiPath = path.join(process.cwd(), 'app', 'api', 'badges', 'route.ts')
    const content = fs.readFileSync(apiPath, 'utf-8')
    const hasProgressComputation = content.includes('computeBadgeProgress')
    const hasAddProgress = content.includes('addProgress')
    const importsCriteria = content.includes('BADGE_CRITERIA')
    results.push({
      test: 'API provides badge progress data',
      passed: hasProgressComputation && hasAddProgress && importsCriteria,
      details: `Progress computation: ${hasProgressComputation}, addProgress: ${hasAddProgress}, BADGE_CRITERIA: ${importsCriteria}`,
    })
  } catch (e) {
    results.push({ test: 'API provides badge progress data', passed: false, details: String(e) })
  }

  // ── Test 12: Data-testid attributes for all key elements ───────
  try {
    const componentPath = path.join(process.cwd(), 'components', 'app', 'badge-grid.tsx')
    const content = fs.readFileSync(componentPath, 'utf-8')
    const requiredTestIds = [
      'badge-grid',
      'badge-progress-summary',
      'badge-earned-count',
      'badge-total-label',
      'badge-detail-modal',
      'badge-detail-name',
      'badge-detail-description',
      'badge-detail-close',
      'badge-detail-overlay',
    ]
    const found = requiredTestIds.filter(id => content.includes(`data-testid="${id}"`))
    const allFound = found.length === requiredTestIds.length
    results.push({
      test: 'All required data-testid attributes present',
      passed: allFound,
      details: `${found.length}/${requiredTestIds.length}: ${allFound ? 'All present' : `Missing: ${requiredTestIds.filter(id => !found.includes(id)).join(', ')}`}`,
    })
  } catch (e) {
    results.push({ test: 'All required data-testid attributes present', passed: false, details: String(e) })
  }

  const passCount = results.filter(r => r.passed).length

  return NextResponse.json({
    feature: '#206 — Badge showcase on Identity page',
    summary: `${passCount}/${results.length} tests passing`,
    all_passing: passCount === results.length,
    results,
  })
}
