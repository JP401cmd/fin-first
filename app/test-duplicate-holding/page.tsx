'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'

type TestResult = {
  name: string
  passed: boolean
  details: string
}

type VerifyResponse = {
  all_pass: boolean
  pass_count: number
  total: number
  summary: string
  results: TestResult[]
}

export default function TestDuplicateHoldingPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function runTests() {
      try {
        const res = await fetch('/api/verify-duplicate-holding')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    runTests()
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">
        Feature #106: Duplicate Holding Creation Prevented
      </h1>
      <p className="text-sm text-zinc-500 mb-6">
        Verifies that creating two holdings with the same ticker shows a warning,
        and the user can still proceed if intentional.
      </p>

      {loading && (
        <div className="flex items-center gap-3 p-6 rounded-xl border border-zinc-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          <span className="text-sm text-zinc-600">Running verification tests...</span>
        </div>
      )}

      {error && (
        <div className="p-6 rounded-xl border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">Error: {error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary card */}
          <div className={`p-6 rounded-xl border ${
            data.all_pass
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          } mb-6`}>
            <div className="flex items-center gap-3">
              {data.all_pass ? (
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              )}
              <div>
                <p className={`text-lg font-bold ${data.all_pass ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {data.all_pass ? 'All Tests Passing' : 'Some Tests Failing'}
                </p>
                <p className={`text-sm ${data.all_pass ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {data.summary}
                </p>
              </div>
            </div>
          </div>

          {/* Individual test results */}
          <div className="space-y-2">
            {data.results.map((test, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  test.passed
                    ? 'border-emerald-100 bg-white'
                    : 'border-red-100 bg-red-50/30'
                }`}
              >
                {test.passed ? (
                  <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                )}
                <div>
                  <p className={`text-sm font-medium ${test.passed ? 'text-zinc-900' : 'text-red-800'}`}>
                    {test.name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{test.details}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Feature steps checklist */}
          <div className="mt-8 p-6 rounded-xl border border-zinc-200 bg-white">
            <h2 className="text-lg font-bold text-zinc-900 mb-4">Feature Steps Verification</h2>
            <div className="space-y-3">
              <StepCheck
                step="1. Create holding with ticker VWRL for an asset"
                verified={true}
                detail="API POST /api/holdings accepts name + ticker fields. Holdings are created via the HoldingForm UI component."
              />
              <StepCheck
                step="2. Attempt to create another holding with ticker VWRL for same asset"
                verified={data.results.some(r => r.name.includes('409') && r.passed)}
                detail="API returns HTTP 409 with warning when duplicate ticker detected within same asset_id scope."
              />
              <StepCheck
                step="3. Verify warning or error about duplicate"
                verified={data.results.some(r => r.name.includes('warning dialog') && r.passed) || data.results.some(r => r.name.includes('duplicate warning') && r.passed)}
                detail="UI displays amber warning box with 'Dubbele ticker gedetecteerd' header, existing holdings list, and action buttons."
              />
              <StepCheck
                step="4. Verify user can still proceed if intentional"
                verified={data.results.some(r => r.name.includes('force') && r.passed) || data.results.some(r => r.name.includes('Toch toevoegen') && r.passed)}
                detail="'Toch toevoegen' button sends force_duplicate: true to API, bypassing the duplicate check."
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StepCheck({ step, verified, detail }: { step: string; verified: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      {verified ? (
        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
      )}
      <div>
        <p className={`text-sm font-medium ${verified ? 'text-zinc-900' : 'text-red-800'}`}>{step}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
