import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #202:
 * Consistent section ordering across modules.
 *
 * Checks that all three module overview pages follow:
 * Hero → KPIs → Alerts → Primary Content → Deep Dives → Discover
 * With consistent visual hierarchy and spacing.
 */

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

// Simple string-based section markers for reliable position detection
const SECTION_MARKERS = {
  core: [
    { id: 'hero', marker: 'data-testid="kern-hero"', label: 'Hero' },
    { id: 'kpis', marker: 'data-testid="kern-kpi-grid"', label: 'KPIs' },
    { id: 'alerts', marker: 'data-testid="kern-alerts"', label: 'Alerts' },
    { id: 'primary', marker: 'data-testid="mission-control-section"', label: 'Primary Content (Mission Control)' },
    { id: 'deep_dive_1', marker: 'storageKey="kern_vermogensverloop"', label: 'Deep Dive (Vermogensverloop)' },
    { id: 'discover', marker: 'DiscoverCarousel module="kern"', label: 'Discover Carousel' },
  ],
  will: [
    { id: 'hero', marker: 'data-testid="wil-hero"', label: 'Hero' },
    { id: 'kpis', marker: 'data-testid="wil-kpi-grid"', label: 'KPIs' },
    { id: 'alerts', marker: 'data-testid="wil-alerts"', label: 'Alerts' },
    { id: 'primary', marker: 'id="section-suggesties"', label: 'Primary Content (Suggesties)' },
    { id: 'deep_dive', marker: 'storageKey="wil_beslissingspatronen"', label: 'Deep Dive (Beslissingspatronen)' },
    { id: 'discover', marker: 'DiscoverCarousel module="wil"', label: 'Discover Carousel' },
  ],
  horizon: [
    { id: 'hero', marker: 'data-testid="horizon-hero"', label: 'Hero' },
    { id: 'kpis', marker: 'data-testid="horizon-kpis"', label: 'KPIs' },
    { id: 'alerts', marker: 'data-testid="horizon-alerts"', label: 'Alerts' },
    { id: 'primary', marker: 'data-testid="fire-inputs"', label: 'Primary Content (Fire Inputs)' },
    { id: 'deep_dive', marker: 'data-testid="resilience-trend-section"', label: 'Deep Dive (Resilience Trend)' },
    { id: 'discover', marker: 'DiscoverCarousel module="horizon"', label: 'Discover Carousel' },
  ],
}

export async function GET() {
  const results: TestResult[] = []

  try {
    // Read the three page files
    const corePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
    const willPath = path.join(process.cwd(), 'app/(app)/will/page.tsx')
    const horizonPath = path.join(process.cwd(), 'app/(app)/horizon/page.tsx')

    const coreContent = fs.readFileSync(corePath, 'utf-8')
    const willContent = fs.readFileSync(willPath, 'utf-8')
    const horizonContent = fs.readFileSync(horizonPath, 'utf-8')

    const pages = [
      { name: 'De Kern', content: coreContent, markers: SECTION_MARKERS.core },
      { name: 'De Wil', content: willContent, markers: SECTION_MARKERS.will },
      { name: 'De Horizon', content: horizonContent, markers: SECTION_MARKERS.horizon },
    ]

    // Test 1-3: Each page has all required sections present
    for (const page of pages) {
      const missing: string[] = []
      for (const section of page.markers) {
        if (page.content.indexOf(section.marker) === -1) {
          missing.push(section.label)
        }
      }
      results.push({
        name: `${page.name}: All required sections present`,
        pass: missing.length === 0,
        detail: missing.length === 0
          ? `All ${page.markers.length} sections found`
          : `Missing: ${missing.join(', ')}`,
      })
    }

    // Test 4-6: Section ordering compliance (Hero → KPIs → Alerts → Primary → Deep Dives → Discover)
    for (const page of pages) {
      const positions = page.markers.map(s => ({
        label: s.label,
        position: page.content.indexOf(s.marker),
      }))
      const found = positions.filter(p => p.position >= 0)
      let ordered = true
      const orderIssues: string[] = []
      for (let i = 1; i < found.length; i++) {
        if (found[i].position < found[i - 1].position) {
          ordered = false
          orderIssues.push(`${found[i - 1].label} (pos ${found[i-1].position}) appears after ${found[i].label} (pos ${found[i].position})`)
        }
      }
      results.push({
        name: `${page.name}: Section ordering Hero→KPIs→Alerts→Primary→DeepDives→Discover`,
        pass: ordered,
        detail: ordered
          ? `All ${found.length} sections in correct order: ${found.map(f => `${f.label}@${f.position}`).join(' → ')}`
          : `Order issues: ${orderIssues.join('; ')}`,
      })
    }

    // Test 7-9: Gradient hero section per module color
    const heroPatterns = [
      { name: 'De Kern', content: coreContent, marker: 'bg-gradient-to-br from-amber-950', color: 'amber' },
      { name: 'De Wil', content: willContent, marker: 'bg-gradient-to-br from-teal-950', color: 'teal' },
      { name: 'De Horizon', content: horizonContent, marker: 'bg-gradient-to-br from-purple-950', color: 'purple' },
    ]
    for (const hp of heroPatterns) {
      const found = hp.content.includes(hp.marker)
      results.push({
        name: `${hp.name}: Gradient hero with ${hp.color} theme`,
        pass: found,
        detail: found
          ? `Hero uses ${hp.color} gradient`
          : `Hero does not use expected ${hp.color} gradient`,
      })
    }

    // Test 10-12: White cards with subtle borders for KPI sections
    for (const page of pages) {
      const found = page.content.includes('rounded-xl border border-zinc-200 bg-white p-5')
      results.push({
        name: `${page.name}: White cards with subtle borders`,
        pass: found,
        detail: found
          ? 'KPI cards use white bg + zinc-200 border'
          : 'KPI cards missing expected styling',
      })
    }

    // Test 13-15: Consistent spacing rhythm - Hero→NextStep = mt-6
    for (const page of pages) {
      // Find the JSX usage of <NextStepSection (not the import)
      const jsxPattern = /<NextStepSection/
      const jsxMatch = page.content.match(jsxPattern)
      if (!jsxMatch) {
        results.push({ name: `${page.name}: Next Step at mt-6 after Hero`, pass: false, detail: 'NextStepSection JSX not found' })
        continue
      }
      const nextStepIdx = page.content.indexOf(jsxMatch[0], page.content.indexOf('return'))
      if (nextStepIdx === -1) {
        results.push({ name: `${page.name}: Next Step at mt-6 after Hero`, pass: false, detail: 'NextStepSection not found in render' })
        continue
      }
      // Look backwards for the containing section element with mt-6
      const precedingContent = page.content.substring(Math.max(0, nextStepIdx - 300), nextStepIdx)
      const hasmt6 = precedingContent.includes('mt-6')
      results.push({
        name: `${page.name}: Next Step at mt-6 after Hero`,
        pass: hasmt6,
        detail: hasmt6
          ? 'NextStepSection section uses mt-6'
          : 'NextStepSection section spacing not mt-6',
      })
    }

    // Test 16-18: Consistent spacing rhythm - KPIs at mt-8
    const kpiMarkers = [
      { name: 'De Kern', content: coreContent, marker: 'kern-kpi-grid' },
      { name: 'De Wil', content: willContent, marker: 'wil-kpi-grid' },
      { name: 'De Horizon', content: horizonContent, marker: 'horizon-kpis' },
    ]
    for (const km of kpiMarkers) {
      const kpiIdx = km.content.indexOf(km.marker)
      if (kpiIdx === -1) {
        results.push({ name: `${km.name}: KPIs at mt-8`, pass: false, detail: 'KPI section not found' })
        continue
      }
      // Check the line containing the KPI marker for mt-8
      const lineStart = km.content.lastIndexOf('\n', kpiIdx) + 1
      const lineEnd = km.content.indexOf('\n', kpiIdx)
      const line = km.content.substring(lineStart, lineEnd)
      const hasmt8 = line.includes('mt-8')
      results.push({
        name: `${km.name}: KPIs at mt-8`,
        pass: hasmt8,
        detail: hasmt8
          ? 'KPI section uses mt-8 spacing'
          : `KPI section line: "${line.trim().substring(0, 80)}..."`,
      })
    }

    // Test 19: De Horizon alerts come BEFORE Resilience Trend and Projectie-invoer
    const alertPos = horizonContent.indexOf('data-testid="horizon-alerts"')
    const resilienceTrendPos = horizonContent.indexOf('data-testid="resilience-trend-section"')
    const fireInputsPos = horizonContent.indexOf('data-testid="fire-inputs"')
    const alertsBeforeContent = alertPos >= 0 && (resilienceTrendPos === -1 || alertPos < resilienceTrendPos) && (fireInputsPos === -1 || alertPos < fireInputsPos)
    results.push({
      name: 'De Horizon: Alerts appear before Resilience Trend and Projectie-invoer',
      pass: alertsBeforeContent,
      detail: alertsBeforeContent
        ? `Alerts at ${alertPos}, Resilience at ${resilienceTrendPos}, Inputs at ${fireInputsPos}`
        : `Order violation: Alerts=${alertPos}, Resilience=${resilienceTrendPos}, Inputs=${fireInputsPos}`,
    })

    // Test 20: Deep Dive sections (CollapsibleSection) use mt-10 in Kern and Wil
    const kernDeepDiveIdx = coreContent.indexOf('storageKey="kern_vermogensverloop"')
    const kernDeepDivePreceding = kernDeepDiveIdx >= 0 ? coreContent.substring(Math.max(0, kernDeepDiveIdx - 300), kernDeepDiveIdx) : ''
    const kernDeepDiveMt10 = kernDeepDivePreceding.includes('mt-10')

    const wilDeepDiveIdx = willContent.indexOf('storageKey="wil_beslissingspatronen"')
    const wilDeepDivePreceding = wilDeepDiveIdx >= 0 ? willContent.substring(Math.max(0, wilDeepDiveIdx - 300), wilDeepDiveIdx) : ''
    const wilDeepDiveMt10 = wilDeepDivePreceding.includes('mt-10')

    results.push({
      name: 'Deep Dive sections use mt-10 spacing',
      pass: kernDeepDiveMt10 && wilDeepDiveMt10,
      detail: `Kern: ${kernDeepDiveMt10 ? 'yes' : 'no'}, Wil: ${wilDeepDiveMt10 ? 'yes' : 'no'}`,
    })

    // Test 21: LockedFeaturesFooter present on all pages
    const footerPresent = [
      coreContent.includes('LockedFeaturesFooter module="kern"'),
      willContent.includes('LockedFeaturesFooter module="wil"'),
      horizonContent.includes('LockedFeaturesFooter module="horizon"'),
    ]
    results.push({
      name: 'LockedFeaturesFooter on all module pages',
      pass: footerPresent.every(Boolean),
      detail: `Kern: ${footerPresent[0]}, Wil: ${footerPresent[1]}, Horizon: ${footerPresent[2]}`,
    })

    // Test 22: DiscoverCarousel at end of all pages
    const discoverPresent = [
      coreContent.includes('DiscoverCarousel module="kern"'),
      willContent.includes('DiscoverCarousel module="wil"'),
      horizonContent.includes('DiscoverCarousel module="horizon"'),
    ]
    results.push({
      name: 'DiscoverCarousel at end of all module pages',
      pass: discoverPresent.every(Boolean),
      detail: `Kern: ${discoverPresent[0]}, Wil: ${discoverPresent[1]}, Horizon: ${discoverPresent[2]}`,
    })

    // Test 23-25: DiscoverCarousel is last content section (after LockedFeaturesFooter)
    const modules = [
      { name: 'De Kern', content: coreContent, module: 'kern' },
      { name: 'De Wil', content: willContent, module: 'wil' },
      { name: 'De Horizon', content: horizonContent, module: 'horizon' },
    ]
    for (const m of modules) {
      const footerPos = m.content.indexOf(`LockedFeaturesFooter module="${m.module}"`)
      const discoverPos = m.content.indexOf(`DiscoverCarousel module="${m.module}"`)
      const correctOrder = footerPos >= 0 && discoverPos >= 0 && footerPos < discoverPos
      results.push({
        name: `${m.name}: Discover after LockedFeaturesFooter`,
        pass: correctOrder,
        detail: correctOrder
          ? `Footer at ${footerPos}, Discover at ${discoverPos}`
          : `Order issue: Footer=${footerPos}, Discover=${discoverPos}`,
      })
    }

    const passing = results.filter(r => r.pass).length

    return NextResponse.json({
      feature: '#202 — Consistent section ordering across modules',
      passing,
      total: results.length,
      allPassing: passing === results.length,
      tests: results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: '#202 — Consistent section ordering across modules',
      error: String(err),
      tests: results,
    }, { status: 500 })
  }
}
