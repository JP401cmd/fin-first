import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #201: Ontdek feature discovery carousel
 *
 * Tests:
 * 1. DiscoverCarousel component exists with horizontal scroll
 * 2. Placed at bottom of De Kern, De Wil, De Horizon overview pages
 * 3. Shows unexplored features from feature_visits tracking
 * 4. Displays teaser text like 'Wist je dat je...'
 * 5. Tracks feature visits via API (POST /api/feature-visits)
 * 6. Only shows features available for user's current sovereignty phase
 * 7. Fades out already-explored features (opacity-60 / dim styling)
 * 8. Card click navigates to feature page (Link component)
 * 9. DISCOVER_ITEMS includes multiple modules (kern, wil, horizon)
 * 10. Scroll buttons (chevron left/right) for navigation
 * 11. Sorted: unvisited features first, visited last
 * 12. Feature visits API endpoint exists (GET + POST)
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []
  const basePath = process.cwd()

  // Read component source
  let carouselSource = ''
  try {
    carouselSource = fs.readFileSync(
      path.join(basePath, 'components/app/discover-carousel.tsx'),
      'utf-8'
    )
  } catch {
    results.push({
      test: 'DiscoverCarousel component exists',
      pass: false,
      detail: 'File components/app/discover-carousel.tsx not found',
    })
    return NextResponse.json({ results, passing: 0, total: 12 })
  }

  // Test 1: Component has horizontal scroll container
  const hasHorizontalScroll =
    carouselSource.includes('overflow-x-auto') ||
    carouselSource.includes('overflow-x: auto') ||
    carouselSource.includes('overflowX')
  const hasScrollRef = carouselSource.includes('scrollRef')
  const hasFlexLayout = carouselSource.includes('flex') && carouselSource.includes('gap-')
  results.push({
    test: 'DiscoverCarousel has horizontal scroll layout',
    pass: hasHorizontalScroll && hasScrollRef && hasFlexLayout,
    detail: hasHorizontalScroll && hasScrollRef && hasFlexLayout
      ? 'Component uses overflow-x-auto with flex layout and scroll ref'
      : `Missing: overflow-x=${hasHorizontalScroll}, scrollRef=${hasScrollRef}, flex=${hasFlexLayout}`,
  })

  // Test 2: Placed at bottom of all three overview pages
  const overviewPages = [
    { name: 'De Kern', path: 'app/(app)/core/page.tsx', module: 'kern' },
    { name: 'De Wil', path: 'app/(app)/will/page.tsx', module: 'wil' },
    { name: 'De Horizon', path: 'app/(app)/horizon/page.tsx', module: 'horizon' },
  ]
  let allPagesHaveCarousel = true
  const pageDetails: string[] = []
  for (const page of overviewPages) {
    try {
      const content = fs.readFileSync(path.join(basePath, page.path), 'utf-8')
      const hasImport = content.includes('DiscoverCarousel')
      const hasUsage = content.includes(`module="${page.module}"`) || content.includes(`module='${page.module}'`)
      if (!hasImport || !hasUsage) allPagesHaveCarousel = false
      pageDetails.push(`${page.name}: import=${hasImport}, usage=${hasUsage}`)
    } catch {
      allPagesHaveCarousel = false
      pageDetails.push(`${page.name}: FILE NOT FOUND`)
    }
  }
  results.push({
    test: 'DiscoverCarousel placed on all three overview pages',
    pass: allPagesHaveCarousel,
    detail: pageDetails.join('; '),
  })

  // Test 3: Shows unexplored features using feature_visits tracking
  const hasLocalStorageVisits = carouselSource.includes('getVisitedFeaturesLocal') || carouselSource.includes('STORAGE_KEY')
  const hasFetchFromApi = carouselSource.includes('fetchVisitedFromApi') || carouselSource.includes('/api/feature-visits')
  const hasVisitedState = carouselSource.includes('visited') && carouselSource.includes('useState')
  results.push({
    test: 'Shows unexplored features from feature_visits tracking',
    pass: hasLocalStorageVisits && hasFetchFromApi && hasVisitedState,
    detail: `localStorage=${hasLocalStorageVisits}, apiSync=${hasFetchFromApi}, state=${hasVisitedState}`,
  })

  // Test 4: Displays teaser text like 'Wist je dat je...'
  const hasTeaserField = carouselSource.includes('teaser')
  const hasWistJeDat = carouselSource.includes('Wist je dat')
  const showsTeaserForUnvisited = carouselSource.includes('isVisited') && carouselSource.includes('teaser')
  results.push({
    test: "Displays teaser text like 'Wist je dat je...'",
    pass: hasTeaserField && hasWistJeDat && showsTeaserForUnvisited,
    detail: `teaserField=${hasTeaserField}, wistJeDat=${hasWistJeDat}, conditionalTeaser=${showsTeaserForUnvisited}`,
  })

  // Test 5: Tracks feature visits via API
  const hasRecordVisitToApi = carouselSource.includes('recordVisitToApi')
  const hasHandleClick = carouselSource.includes('handleClick') || carouselSource.includes('onClick')
  // Check API endpoint exists
  let featureVisitsApiExists = false
  try {
    fs.readFileSync(path.join(basePath, 'app/api/feature-visits/route.ts'), 'utf-8')
    featureVisitsApiExists = true
  } catch {
    featureVisitsApiExists = false
  }
  results.push({
    test: 'Tracks feature visits via API',
    pass: hasRecordVisitToApi && hasHandleClick && featureVisitsApiExists,
    detail: `recordApi=${hasRecordVisitToApi}, clickHandler=${hasHandleClick}, apiEndpoint=${featureVisitsApiExists}`,
  })

  // Test 6: Only shows features available for user's current sovereignty phase
  const usesFeatureAccess = carouselSource.includes('useFeatureAccess')
  const checksFeatureAccess = carouselSource.includes('features[item.id]') || carouselSource.includes('features[')
  const filtersInaccessible = carouselSource.includes('=== false')
  results.push({
    test: "Only shows features for user's current sovereignty phase",
    pass: usesFeatureAccess && checksFeatureAccess && filtersInaccessible,
    detail: `useFeatureAccess=${usesFeatureAccess}, checksAccess=${checksFeatureAccess}, filtersInaccessible=${filtersInaccessible}`,
  })

  // Test 7: Fades out already-explored features
  const hasFadedVisitedStyle =
    carouselSource.includes('opacity-60') ||
    carouselSource.includes('opacity-50') ||
    carouselSource.includes('opacity-40')
  const hasMutedColors =
    carouselSource.includes('bg-zinc-50') || carouselSource.includes('bg-zinc-100')
  const hasConditionalVisitedStyling = carouselSource.includes('isVisited')
  results.push({
    test: 'Fades out already-explored features',
    pass: hasFadedVisitedStyle && hasConditionalVisitedStyling,
    detail: `opacity=${hasFadedVisitedStyle}, muted=${hasMutedColors}, conditional=${hasConditionalVisitedStyling}`,
  })

  // Test 8: Card click navigates to feature page
  const usesNextLink = carouselSource.includes("from 'next/link'") || carouselSource.includes('from "next/link"')
  const hasHref = carouselSource.includes('href={item.href}') || carouselSource.includes('href=')
  const linksToPages = carouselSource.includes('/core') && carouselSource.includes('/will') && carouselSource.includes('/horizon')
  results.push({
    test: 'Card click navigates to feature page',
    pass: usesNextLink && hasHref && linksToPages,
    detail: `nextLink=${usesNextLink}, hrefProp=${hasHref}, moduleLinks=${linksToPages}`,
  })

  // Test 9: DISCOVER_ITEMS includes all three modules
  const hasKernItems = carouselSource.includes("module: 'kern'")
  const hasWilItems = carouselSource.includes("module: 'wil'")
  const hasHorizonItems = carouselSource.includes("module: 'horizon'")
  const itemCountMatch = carouselSource.match(/module: '/g)
  const itemCount = itemCountMatch?.length ?? 0
  results.push({
    test: 'DISCOVER_ITEMS covers all three modules',
    pass: hasKernItems && hasWilItems && hasHorizonItems && itemCount >= 10,
    detail: `kern=${hasKernItems}, wil=${hasWilItems}, horizon=${hasHorizonItems}, totalItems=${itemCount}`,
  })

  // Test 10: Scroll navigation buttons
  const hasChevronLeft = carouselSource.includes('ChevronLeft')
  const hasChevronRight = carouselSource.includes('ChevronRight')
  const hasScrollFunction = carouselSource.includes("scroll('left')") || carouselSource.includes('scroll(')
  const hasCanScrollState = carouselSource.includes('canScrollLeft') && carouselSource.includes('canScrollRight')
  results.push({
    test: 'Scroll navigation buttons (left/right chevrons)',
    pass: hasChevronLeft && hasChevronRight && hasScrollFunction && hasCanScrollState,
    detail: `left=${hasChevronLeft}, right=${hasChevronRight}, scrollFn=${hasScrollFunction}, state=${hasCanScrollState}`,
  })

  // Test 11: Sorted - unvisited first, visited last
  const hasSortLogic =
    carouselSource.includes('.sort(') &&
    (carouselSource.includes('visited.has') || carouselSource.includes('aVisited'))
  results.push({
    test: 'Sorted: unvisited features first, visited last',
    pass: hasSortLogic,
    detail: hasSortLogic
      ? 'Sort function uses visited status to order items'
      : 'Missing sort logic for visited/unvisited ordering',
  })

  // Test 12: Feature visits API has both GET and POST
  let apiHasGet = false
  let apiHasPost = false
  try {
    const apiSource = fs.readFileSync(
      path.join(basePath, 'app/api/feature-visits/route.ts'),
      'utf-8'
    )
    apiHasGet = apiSource.includes('export async function GET')
    apiHasPost = apiSource.includes('export async function POST')
  } catch {
    // Already handled
  }
  results.push({
    test: 'Feature visits API supports GET and POST',
    pass: apiHasGet && apiHasPost,
    detail: `GET=${apiHasGet}, POST=${apiHasPost}`,
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length
  return NextResponse.json({
    feature: '#201 - Ontdek feature discovery carousel',
    results,
    passing,
    total,
    allPassing: passing === total,
  })
}
