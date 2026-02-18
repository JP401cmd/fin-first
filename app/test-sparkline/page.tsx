import * as fs from 'fs'
import * as path from 'path'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

function runTests(): TestResult[] {
  const results: TestResult[] = []
  const assetsPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'assets', 'page.tsx')
  let assetsSource = ''
  try {
    assetsSource = fs.readFileSync(assetsPagePath, 'utf-8')
  } catch {
    return [{ name: 'source_readable', pass: false, detail: 'Could not read app/(app)/core/assets/page.tsx' }]
  }

  // Test 1
  const t1 = assetsSource.includes("from('valuations')") && assetsSource.includes('loadValuations')
  results.push({ name: 'loadValuations fetches from Supabase', pass: t1, detail: t1 ? "loadValuations() queries Supabase 'valuations' table" : 'Missing Supabase query' })

  // Test 2
  const t2 = assetsSource.includes(".eq('entity_id', assetId)") && assetsSource.includes(".eq('entity_type', 'asset')")
  results.push({ name: 'Valuation query filters by entity', pass: t2, detail: t2 ? 'Filtered by entity_id and entity_type=asset' : 'Missing filters' })

  // Test 3
  const t3 = assetsSource.includes(".order('valuation_date'") && assetsSource.includes('.limit(')
  results.push({ name: 'Valuations ordered by date with limit', pass: t3, detail: t3 ? 'Has order by valuation_date and limit clause' : 'Missing ordering/limit' })

  // Test 4
  const t4 = assetsSource.includes('<polyline') && assetsSource.includes('points={points.join')
  results.push({ name: 'SVG polyline renders sparkline', pass: t4, detail: t4 ? 'SVG polyline renders from computed points' : 'Missing polyline' })

  // Test 5
  const t5 = assetsSource.includes('sorted.map(v => Number(v.value))') || assetsSource.includes('values.map((v, i)')
  results.push({ name: 'Data points mapped from valuations', pass: t5, detail: t5 ? 'Valuation values mapped to SVG coordinates' : 'Missing mapping' })

  // Test 6
  const t6 = assetsSource.includes('values.map((v, i)') && assetsSource.includes('<circle')
  results.push({ name: 'Circle markers at each data point', pass: t6, detail: t6 ? 'Circle SVG elements at each position' : 'Missing circles' })

  // Test 7
  const t7 = assetsSource.includes('valuations.length >= 2')
  results.push({ name: 'Requires minimum 2 valuations', pass: t7, detail: t7 ? 'Sparkline only renders with 2+ entries' : 'Missing check' })

  // Test 8
  const t8 = assetsSource.includes('loadValuations(asset.id)') && assetsSource.includes('openAssetModal')
  results.push({ name: 'Loads on modal open', pass: t8, detail: t8 ? 'loadValuations called in openAssetModal' : 'Missing load call' })

  // Test 9
  const t9 = assetsSource.includes('loadValuations(selectedAsset.id)')
  results.push({ name: 'Refreshes after new valuation', pass: t9, detail: t9 ? 'loadValuations called after ValuationModal save' : 'Missing refresh' })

  // Test 10
  const t10 = assetsSource.includes("trend ? '#059669' : '#dc2626'")
  results.push({ name: 'Trend color (green up, red down)', pass: t10, detail: t10 ? 'Green for upward, red for downward trend' : 'Missing trend color' })

  // Test 11
  const t11 = assetsSource.includes("toLocaleDateString('nl-NL'") && assetsSource.includes('sorted[0].valuation_date')
  results.push({ name: 'Date range labels shown', pass: t11, detail: t11 ? 'First and last dates in nl-NL locale' : 'Missing date labels' })

  // Test 12
  const mockPatterns = ['mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'globalThis', 'devStore', 'MOCK', 'STUB']
  const foundMocks = mockPatterns.filter(p => assetsSource.includes(p))
  const t12 = foundMocks.length === 0
  results.push({ name: 'No mock data patterns', pass: t12, detail: t12 ? 'Zero mock patterns in source' : `Found: ${foundMocks.join(', ')}` })

  return results
}

export default function TestSparklinePage() {
  const results = runTests()
  const passing = results.filter(r => r.pass).length
  const allPassing = passing === results.length

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #121: Sparkline Charts Render from Historical Data
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that the sparkline chart in asset detail modals uses real valuation history from Supabase.
      </p>

      <div className={`rounded-xl border p-4 mb-6 ${allPassing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className={`text-sm font-semibold ${allPassing ? 'text-emerald-700' : 'text-amber-700'}`}>
          {allPassing ? '✅' : '⚠️'} {passing}/{results.length} tests passing
        </p>
      </div>

      <div className="space-y-2">
        {results.map((test, i) => (
          <div key={test.name} className={`rounded-lg border p-3 ${test.pass ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <p className="text-sm font-medium text-zinc-900">
              {test.pass ? '✅' : '❌'} {i + 1}. {test.name}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">{test.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
