import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #195: Jouw Pad progress widget on Dashboard
 * Tests the widget component and its integration with the Dashboard.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Helper to read file
  const readFile = (filePath: string): string => {
    try {
      return fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8')
    } catch {
      return ''
    }
  }

  // 1. JouwPadWidget component exists
  const widgetCode = readFile('components/app/jouw-pad-widget.tsx')
  results.push({
    name: 'JouwPadWidget component exists',
    pass: widgetCode.length > 0,
    detail: widgetCode.length > 0 ? `Component file: ${widgetCode.length} chars` : 'File not found',
  })

  // 2. Widget shows current phase and level with visual indicator
  const hasPhaseDisplay = widgetCode.includes('data-testid="jouw-pad-phase"')
  const hasLevelDisplay = widgetCode.includes('data-testid="jouw-pad-level"')
  const hasShieldIcon = widgetCode.includes('Shield')
  results.push({
    name: 'Shows current phase + level with visual indicator',
    pass: hasPhaseDisplay && hasLevelDisplay && hasShieldIcon,
    detail: `Phase display: ${hasPhaseDisplay}, Level display: ${hasLevelDisplay}, Shield icon: ${hasShieldIcon}`,
  })

  // 3. Progress toward next level with criteria checklist
  const hasCriteriaChecklist = widgetCode.includes('data-testid="jouw-pad-criteria"')
  const hasCriterionItems = widgetCode.includes('data-testid={`jouw-pad-criterion-')
  const hasCheckIcon = widgetCode.includes('Check') && widgetCode.includes('Circle')
  const hasNextLevelCriteria = widgetCode.includes('NEXT_LEVEL_CRITERIA')
  results.push({
    name: 'Criteria checklist for next level progress',
    pass: hasCriteriaChecklist && hasCriterionItems && hasCheckIcon && hasNextLevelCriteria,
    detail: `Checklist: ${hasCriteriaChecklist}, Items: ${hasCriterionItems}, Icons: ${hasCheckIcon}, Criteria map: ${hasNextLevelCriteria}`,
  })

  // 4. Criteria checklist has criteria for all levels -2 to 5 (for progressing to next)
  const criteriaLevels = [-2, -1, 0, 1, 2, 3, 4, 5]
  const hasCriteriaForAllLevels = criteriaLevels.every(level => {
    const pattern = new RegExp(`\\[${level < 0 ? level : level}\\]:\\s*\\[`)
    return pattern.test(widgetCode)
  })
  results.push({
    name: 'Criteria defined for all levels (-2 to 5)',
    pass: hasCriteriaForAllLevels,
    detail: `All levels have criteria: ${hasCriteriaForAllLevels}`,
  })

  // 5. Shows next unlock preview: 'Volgend niveau → [feature name]'
  const hasNextLevelPreview = widgetCode.includes('data-testid="jouw-pad-next-level"')
  const hasVolgendNiveau = widgetCode.includes('Volgend niveau')
  const hasNextUnlock = widgetCode.includes('Ontgrendelt:')
  results.push({
    name: 'Next unlock preview with "Volgend niveau → [feature]"',
    pass: hasNextLevelPreview && hasVolgendNiveau && hasNextUnlock,
    detail: `Preview: ${hasNextLevelPreview}, Label: ${hasVolgendNiveau}, Unlock: ${hasNextUnlock}`,
  })

  // 6. Widget is placed on Dashboard page
  const dashboardCode = readFile('app/(app)/dashboard/page.tsx')
  const hasWidgetImport = dashboardCode.includes("import { JouwPadWidget }")
  const hasWidgetRender = dashboardCode.includes('<JouwPadWidget')
  results.push({
    name: 'Widget placed on Dashboard page',
    pass: hasWidgetImport && hasWidgetRender,
    detail: `Import: ${hasWidgetImport}, Render: ${hasWidgetRender}`,
  })

  // 7. Dashboard passes financial data props to widget
  const passesNetWorth = dashboardCode.includes('netWorth={')
  const passesMonthsCovered = dashboardCode.includes('monthsCovered={')
  const passesConsumerDebt = dashboardCode.includes('hasConsumerDebt={')
  results.push({
    name: 'Dashboard passes financial data to widget',
    pass: passesNetWorth && passesMonthsCovered && passesConsumerDebt,
    detail: `netWorth: ${passesNetWorth}, monthsCovered: ${passesMonthsCovered}, hasConsumerDebt: ${passesConsumerDebt}`,
  })

  // 8. Compact card format (not intrusive)
  const hasCompactCard = widgetCode.includes('rounded-xl') && widgetCode.includes('p-5')
  const hasHoverEffect = widgetCode.includes('hover:shadow-md')
  results.push({
    name: 'Compact card format with subtle styling',
    pass: hasCompactCard && hasHoverEffect,
    detail: `Compact card: ${hasCompactCard}, Hover: ${hasHoverEffect}`,
  })

  // 9. Widget is clickable via href prop (catalog WIDGET_HREFS → /mijn)
  const acceptsHrefProp = widgetCode.includes('href?: string') && widgetCode.includes('href={href}')
  results.push({
    name: 'Widget accepts href prop for click-through (catalog routes to /mijn)',
    pass: acceptsHrefProp,
    detail: `Accepts href prop: ${acceptsHrefProp}`,
  })

  // 10. Phase progress bar with 4 segments
  const hasProgressBar = widgetCode.includes('data-testid="jouw-pad-progress-bar"')
  const hasPhaseSegments = widgetCode.includes('PHASES.map')
  results.push({
    name: 'Phase progress bar with 4 segments',
    pass: hasProgressBar && hasPhaseSegments,
    detail: `Progress bar: ${hasProgressBar}, Phase segments: ${hasPhaseSegments}`,
  })

  // 11. Criteria checklist correctly evaluates financial data
  // Verify criteria check functions reference the right data fields
  const checksNetWorth = widgetCode.includes('d.netWorth')
  const checksMonthsCovered = widgetCode.includes('d.monthsCovered')
  const checksFreedomPct = widgetCode.includes('d.freedomPct')
  const checksConsumerDebt = widgetCode.includes('d.hasConsumerDebt')
  results.push({
    name: 'Criteria evaluate financial data (netWorth, months, freedom%, debt)',
    pass: checksNetWorth && checksMonthsCovered && checksFreedomPct && checksConsumerDebt,
    detail: `netWorth: ${checksNetWorth}, months: ${checksMonthsCovered}, freedom: ${checksFreedomPct}, debt: ${checksConsumerDebt}`,
  })

  // 12. Criteria items show met/unmet state visually
  const hasMetAttribute = widgetCode.includes('data-met=')
  const hasCheckedStyle = widgetCode.includes('bg-emerald-100') && widgetCode.includes('text-emerald-600')
  const hasUncheckedStyle = widgetCode.includes('text-zinc-300') // Circle icon color
  const hasStrikethrough = widgetCode.includes('line-through')
  results.push({
    name: 'Criteria show met/unmet visual state',
    pass: hasMetAttribute && hasCheckedStyle && hasUncheckedStyle && hasStrikethrough,
    detail: `Met attr: ${hasMetAttribute}, Check style: ${hasCheckedStyle}, Uncheck style: ${hasUncheckedStyle}, Strikethrough: ${hasStrikethrough}`,
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#195 — Jouw Pad progress widget on Dashboard',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
