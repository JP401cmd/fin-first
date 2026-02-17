import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  function check(name: string, pass: boolean, detail: string) {
    results.push({ name, pass, detail })
  }

  // Read the CollapsibleSection component
  const componentPath = path.join(process.cwd(), 'components', 'app', 'collapsible-section.tsx')
  const componentSrc = fs.readFileSync(componentPath, 'utf-8')

  // Test 1: CollapsibleSection component exists
  check(
    'CollapsibleSection component exists',
    fs.existsSync(componentPath),
    componentPath
  )

  // Test 2: Has expand/collapse toggle
  check(
    'Has expand/collapse toggle button',
    componentSrc.includes('onClick={toggle}') && componentSrc.includes('aria-expanded'),
    'Button with onClick={toggle} and aria-expanded attribute'
  )

  // Test 3: Default collapsed state (defaultOpen = false)
  check(
    'Default collapsed state (defaultOpen = false)',
    componentSrc.includes('defaultOpen = false'),
    'Sections collapse by default'
  )

  // Test 4: 1-line summary preview when collapsed
  check(
    '1-line summary preview when collapsed',
    componentSrc.includes('!isOpen && summary') && componentSrc.includes('truncate'),
    'Shows truncated summary only when collapsed'
  )

  // Test 5: localStorage persistence
  check(
    'localStorage persistence per section',
    componentSrc.includes('localStorage.getItem(') &&
    componentSrc.includes('localStorage.setItem(') &&
    componentSrc.includes('collapsible_') &&
    componentSrc.includes('storageKey'),
    'Reads and writes collapse state to localStorage with unique key'
  )

  // Test 6: Smooth animation
  check(
    'Smooth expand/collapse animation',
    componentSrc.includes('transition-all duration-300') && componentSrc.includes('transition-transform duration-200'),
    'Content uses transition-all duration-300, chevron uses transition-transform duration-200'
  )

  // Test 7: ChevronDown icon rotates
  check(
    'Chevron rotates on expand',
    componentSrc.includes("rotate-180") && componentSrc.includes('ChevronDown'),
    'ChevronDown rotates 180 degrees when expanded'
  )

  // Test 8: storageKey prop for unique localStorage keys
  check(
    'storageKey prop for unique persistence',
    componentSrc.includes('storageKey: string'),
    'Each section uses a unique storageKey for localStorage'
  )

  // Read core page for Vermogensverloop and Snapshot Vergelijking
  const corePagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'page.tsx')
  const corePageSrc = fs.readFileSync(corePagePath, 'utf-8')

  // Test 9: Vermogensverloop uses CollapsibleSection
  check(
    'Vermogensverloop uses CollapsibleSection',
    corePageSrc.includes('storageKey="kern_vermogensverloop"') &&
    corePageSrc.includes('title="Vermogensverloop"'),
    'Core page wraps Vermogensverloop in CollapsibleSection with proper storageKey'
  )

  // Test 10: Vermogensverloop has summary
  check(
    'Vermogensverloop has mini-summary',
    corePageSrc.includes('summary={snapshots.length > 0'),
    'Shows snapshot count and description when collapsed'
  )

  // Test 11: Snapshot Vergelijking uses CollapsibleSection
  check(
    'Snapshot Vergelijking uses CollapsibleSection',
    corePageSrc.includes('storageKey="kern_snapshot_vergelijking"') &&
    corePageSrc.includes('title="Vergelijking snapshots"'),
    'Core page wraps Snapshot Vergelijking in CollapsibleSection with proper storageKey'
  )

  // Test 12: Snapshot Vergelijking has summary
  check(
    'Snapshot Vergelijking has mini-summary',
    corePageSrc.includes("toLocaleDateString('nl-NL'") &&
    corePageSrc.includes('kern_snapshot_vergelijking'),
    'Shows date comparison as summary (e.g., "15 jan vs 20 feb")'
  )

  // Read will page for Beslissingspatronen
  const willPagePath = path.join(process.cwd(), 'app', '(app)', 'will', 'page.tsx')
  const willPageSrc = fs.readFileSync(willPagePath, 'utf-8')

  // Test 13: Beslissingspatronen uses CollapsibleSection
  check(
    'Beslissingspatronen uses CollapsibleSection',
    willPageSrc.includes('storageKey="wil_beslissingspatronen"') &&
    willPageSrc.includes('title="Beslissingspatronen"'),
    'Will page wraps Beslissingspatronen in CollapsibleSection with proper storageKey'
  )

  // Test 14: Beslissingspatronen has summary
  check(
    'Beslissingspatronen has mini-summary',
    willPageSrc.includes('vrijheidsdagen per type actie') &&
    willPageSrc.includes('wil_beslissingspatronen'),
    'Shows category count and description when collapsed'
  )

  // Test 15: All three sections have icons
  check(
    'All sections have icons',
    corePageSrc.includes('icon={<TrendingUp') && // Vermogensverloop
    corePageSrc.includes('icon={<Camera') && // Snapshot Vergelijking
    willPageSrc.includes('icon={<Flame'), // Beslissingspatronen
    'Vermogensverloop=TrendingUp, SnapshotVergelijking=Camera, Beslissingspatronen=Flame'
  )

  // Test 16: data-testid attributes for testing
  check(
    'data-testid attributes on component',
    componentSrc.includes('data-testid={`collapsible-section-${storageKey}`}') &&
    componentSrc.includes('data-testid={`collapsible-toggle-${storageKey}`}') &&
    componentSrc.includes('data-testid={`collapsible-content-${storageKey}`}'),
    'Section container, toggle button, and content all have data-testid'
  )

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#200 - Collapsible deep-dive sections',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
