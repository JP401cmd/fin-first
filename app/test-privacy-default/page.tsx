'use client'

import { useState, useEffect } from 'react'

interface TestResult {
  id: number
  name: string
  pass: boolean
  detail: string
}

interface VerificationResponse {
  feature: number
  name: string
  summary: string
  passing: number
  total: number
  allPassing: boolean
  results: TestResult[]
  error?: string
}

export default function TestPrivacyDefaultPage() {
  const [verification, setVerification] = useState<VerificationResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-privacy-default')
      .then(res => res.json())
      .then(data => {
        setVerification(data)
        setLoading(false)
      })
      .catch(err => {
        setVerification({
          feature: 175,
          name: 'Privacy level defaults to anonymous',
          summary: 'Failed to load',
          passing: 0,
          total: 0,
          allPassing: false,
          results: [],
          error: err.message
        })
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-zinc-500">Laden...</p>
      </div>
    )
  }

  if (!verification) return null

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #175: Privacy Default Verification
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Verifies that the freedom card generator defaults to the safest privacy option (anonymous).
      </p>

      {/* Summary */}
      <div className={`mb-6 rounded-xl border p-4 ${
        verification.allPassing
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50'
      }`}>
        <p className={`text-lg font-bold ${
          verification.allPassing ? 'text-green-700' : 'text-red-700'
        }`}>
          {verification.summary}
        </p>
        <p className="text-sm text-zinc-600 mt-1">
          {verification.allPassing
            ? 'All tests passing - privacy defaults to anonymous correctly'
            : 'Some tests failing - check details below'}
        </p>
      </div>

      {/* Test results */}
      <div className="space-y-3">
        {verification.results.map((result) => (
          <div
            key={result.id}
            className={`rounded-lg border p-3 ${
              result.pass
                ? 'border-green-200 bg-green-50/50'
                : 'border-red-200 bg-red-50/50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{result.pass ? '✅' : '❌'}</span>
              <div>
                <p className={`text-sm font-medium ${
                  result.pass ? 'text-green-800' : 'text-red-800'
                }`}>
                  Test {result.id}: {result.name}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{result.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {verification.error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error: {verification.error}
        </div>
      )}

      {/* Feature description */}
      <div className="mt-8 rounded-lg bg-zinc-50 p-4 text-xs text-zinc-500">
        <p className="font-semibold text-zinc-700 mb-2">Feature #175: Privacy level defaults to anonymous for sharing</p>
        <ul className="space-y-1 list-disc pl-4">
          <li>Freedom card generator defaults to safest privacy option</li>
          <li>Navigate to freedom card generator</li>
          <li>Verify privacy level defaults to Anonymous</li>
          <li>Verify no real name or amounts shown by default</li>
          <li>User must explicitly opt into less private modes</li>
        </ul>
      </div>
    </div>
  )
}
