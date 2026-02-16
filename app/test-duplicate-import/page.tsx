'use client'

import { useEffect, useState } from 'react'

type TestResult = {
  test: string
  passed: boolean
  details: string
}

export default function TestDuplicateImportPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ passed: 0, total: 0, allPassed: false })

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-duplicate-import')
        const data = await res.json()
        setResults(data.results)
        setSummary(data.summary)
      } catch (err) {
        setResults([{ test: 'Fetch error', passed: false, details: String(err) }])
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">
        Feature #158: Transaction Import Duplicate Prevention
      </h1>
      <p className="text-gray-500 mb-8">
        Verifies that re-importing the same bank file does not create duplicate transactions.
        Uses import_hash (SHA-256 of date+amount+description) for deduplication.
      </p>

      {loading ? (
        <div className="flex items-center gap-3 py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-gray-500">Running verification tests...</span>
        </div>
      ) : (
        <>
          <div className={`rounded-lg p-4 mb-8 ${summary.allPassed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <span className="text-lg font-semibold">
              {summary.allPassed ? '✅' : '❌'} {summary.passed}/{summary.total} tests passing
            </span>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 ${r.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{r.passed ? '✅' : '❌'}</span>
                  <div>
                    <div className="font-medium">{r.test}</div>
                    <div className="text-sm text-gray-600 mt-1">{r.details}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <h2 className="font-semibold mb-2">How Duplicate Prevention Works</h2>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>Each parsed transaction gets an <code className="bg-gray-200 px-1 rounded">import_hash</code> = SHA-256(date|amount|description[:100])</li>
              <li>Before import, <code className="bg-gray-200 px-1 rounded">checkDuplicates()</code> queries existing transactions by import_hash</li>
              <li>Matching transactions are marked <code className="bg-gray-200 px-1 rounded">isDuplicate=true, skipImport=true</code></li>
              <li>Only non-duplicate rows are sent to <code className="bg-gray-200 px-1 rounded">supabase.from('transactions').insert()</code></li>
              <li>Result: same file imported twice → second import creates 0 new rows</li>
            </ol>
          </div>
        </>
      )}
    </div>
  )
}
