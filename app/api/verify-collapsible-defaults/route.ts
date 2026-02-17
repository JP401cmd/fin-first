import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface TestResult {
  name: string
  status: 'pass' | 'fail'
  detail: string
}

export async function GET() {
  const results: TestResult[] = []

  try {
    // Test 1: CollapsibleSection component defaults to collapsed
    const componentPath = join(process.cwd(), 'components/app/collapsible-section.tsx')
    const componentSource = readFileSync(componentPath, 'utf-8')

    const hasDefaultFalse = componentSource.includes('defaultOpen = false')
    results.push({
      name: 'CollapsibleSection defaultOpen defaults to false',
      status: hasDefaultFalse ? 'pass' : 'fail',
      detail: hasDefaultFalse
        ? 'defaultOpen = false — sections start collapsed by default'
        : 'defaultOpen should default to false',
    })

    // Test 2: Component initializes state from defaultOpen
    const initializesState = componentSource.includes('useState(defaultOpen)')
    results.push({
      name: 'Component initializes isOpen from defaultOpen prop',
      status: initializesState ? 'pass' : 'fail',
      detail: initializesState
        ? 'useState(defaultOpen) correctly initializes from prop'
        : 'State should initialize from defaultOpen prop',
    })

    // Test 3: Summary preview shown when collapsed
    const hasSummaryWhenCollapsed = componentSource.includes('!isOpen && summary')
    results.push({
      name: 'Summary preview text shown when collapsed',
      status: hasSummaryWhenCollapsed ? 'pass' : 'fail',
      detail: hasSummaryWhenCollapsed
        ? '1-line preview (summary prop) is displayed when section is collapsed'
        : 'Summary should be shown when section is collapsed',
    })

    // Test 4: Content hidden when collapsed
    const hasContentHide = componentSource.includes("max-h-0 opacity-0 overflow-hidden")
    results.push({
      name: 'Content is hidden when collapsed',
      status: hasContentHide ? 'pass' : 'fail',
      detail: hasContentHide
        ? 'max-h-0 + opacity-0 + overflow-hidden hides content'
        : 'Content should be hidden with max-h-0 when collapsed',
    })

    // Test 5: Content visible when expanded
    const hasContentShow = componentSource.includes("max-h-[5000px] opacity-100")
    results.push({
      name: 'Content expands on click (max-h transition)',
      status: hasContentShow ? 'pass' : 'fail',
      detail: hasContentShow
        ? 'max-h-[5000px] + opacity-100 reveals content on expand'
        : 'Content should expand with max-height transition',
    })

    // Test 6: Toggle function exists
    const hasToggle = componentSource.includes('function toggle()') && componentSource.includes('const next = !isOpen')
    results.push({
      name: 'Click handler toggles open/closed state',
      status: hasToggle ? 'pass' : 'fail',
      detail: hasToggle
        ? 'toggle() function flips isOpen state'
        : 'Toggle function should flip isOpen state',
    })

    // Test 7: ChevronDown icon rotates on expand
    const hasChevronRotate = componentSource.includes("isOpen ? 'rotate-180' : ''")
    results.push({
      name: 'Chevron icon rotates when expanded',
      status: hasChevronRotate ? 'pass' : 'fail',
      detail: hasChevronRotate
        ? 'ChevronDown rotates 180° when section is expanded'
        : 'Chevron should rotate on expand',
    })

    // Test 8: aria-expanded attribute present
    const hasAriaExpanded = componentSource.includes('aria-expanded={isOpen}')
    results.push({
      name: 'Accessibility: aria-expanded attribute set',
      status: hasAriaExpanded ? 'pass' : 'fail',
      detail: hasAriaExpanded
        ? 'aria-expanded reflects current open/closed state'
        : 'Button should have aria-expanded attribute',
    })

    // Test 9: De Kern overview - Vermogensverloop section uses collapsed default
    const corePagePath = join(process.cwd(), 'app/(app)/core/page.tsx')
    const corePageSource = readFileSync(corePagePath, 'utf-8')
    const coreHasNoDefaultOpen = !corePageSource.includes('defaultOpen={true}')
    const coreUsesCollapsible = corePageSource.includes('CollapsibleSection')
    const coreVermogensverloop = corePageSource.includes('storageKey="kern_vermogensverloop"')
    results.push({
      name: 'De Kern: Vermogensverloop starts collapsed (no defaultOpen=true)',
      status: coreHasNoDefaultOpen && coreUsesCollapsible && coreVermogensverloop ? 'pass' : 'fail',
      detail: coreHasNoDefaultOpen && coreUsesCollapsible && coreVermogensverloop
        ? 'Vermogensverloop section uses default collapsed state with storageKey'
        : 'Core page should not pass defaultOpen={true} to CollapsibleSection',
    })

    // Test 10: De Kern overview - Vermogensverloop has summary prop
    const vermogensSummary = corePageSource.includes('summary={snapshots.length > 0')
    results.push({
      name: 'De Kern: Vermogensverloop has preview summary text',
      status: vermogensSummary ? 'pass' : 'fail',
      detail: vermogensSummary
        ? 'Shows snapshot count and "netto vermogen over tijd" when collapsed'
        : 'Vermogensverloop section should have a summary prop for preview',
    })

    // Test 11: De Kern overview - Snapshot vergelijking section
    const snapshotVergelijking = corePageSource.includes('storageKey="kern_snapshot_vergelijking"')
    const snapshotSummary = corePageSource.includes("summary={`${new Date(snapshots")
    results.push({
      name: 'De Kern: Snapshot vergelijking has preview summary text',
      status: snapshotVergelijking && snapshotSummary ? 'pass' : 'fail',
      detail: snapshotVergelijking && snapshotSummary
        ? 'Shows comparison date range when collapsed'
        : 'Snapshot comparison section should have summary preview',
    })

    // Test 12: De Wil overview - Beslissingspatronen starts collapsed with summary
    const willPagePath = join(process.cwd(), 'app/(app)/will/page.tsx')
    const willPageSource = readFileSync(willPagePath, 'utf-8')
    const willHasNoDefaultOpen = !willPageSource.includes('defaultOpen={true}')
    const willBeslissingspatronen = willPageSource.includes('storageKey="wil_beslissingspatronen"')
    const willSummary = willPageSource.includes("summary={impactEntries.length > 0")
    results.push({
      name: 'De Wil: Beslissingspatronen starts collapsed with preview',
      status: willHasNoDefaultOpen && willBeslissingspatronen && willSummary ? 'pass' : 'fail',
      detail: willHasNoDefaultOpen && willBeslissingspatronen && willSummary
        ? 'Beslissingspatronen starts collapsed, shows category count preview'
        : 'Will page should not pass defaultOpen={true}',
    })

  } catch (err: unknown) {
    results.push({
      name: 'Source code analysis',
      status: 'fail',
      detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passCount = results.filter((r) => r.status === 'pass').length
  return NextResponse.json({
    feature: '#176 — Collapsible sections default to collapsed state',
    summary: `${passCount}/${results.length} tests passing`,
    results,
  })
}
