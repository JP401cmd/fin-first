'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Test page for Feature #108: Session expiry shows re-login prompt.
 *
 * This page tests:
 * 1. SessionMonitor component exists and renders when session expires
 * 2. Login page shows expiry banner when redirected with ?expired=1
 * 3. API routes return sessionExpired flag in 401 responses
 * 4. Re-login form works inline without navigation
 * 5. No raw errors shown to user
 */
export default function TestSessionExpiry() {
  const [results, setResults] = useState<{ name: string; pass: boolean; detail: string }[]>([])
  const [running, setRunning] = useState(false)

  async function runTests() {
    setRunning(true)
    const testResults: { name: string; pass: boolean; detail: string }[] = []

    // Test 1: SessionMonitor component file exists
    try {
      const res = await fetch('/api/verify-session-expiry?test=component-exists')
      const data = await res.json()
      testResults.push({
        name: 'SessionMonitor component exists',
        pass: data.exists === true,
        detail: data.detail || (data.exists ? 'Component found' : 'Component not found'),
      })
    } catch (e) {
      testResults.push({
        name: 'SessionMonitor component exists',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 2: Login page shows expired banner when ?expired=1 param present
    try {
      const res = await fetch('/login?expired=1&redirectTo=%2Fdashboard')
      const html = await res.text()
      const hasBanner = html.includes('sessie is verlopen') || html.includes('session-expired-banner')
      testResults.push({
        name: 'Login page shows session expired banner',
        pass: hasBanner,
        detail: hasBanner ? 'Expired session banner present in login HTML' : 'Banner not found in login HTML',
      })
    } catch (e) {
      testResults.push({
        name: 'Login page shows session expired banner',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 3: Protected API route returns 401 with sessionExpired flag
    try {
      const res = await fetch('/api/verify-session-expiry?test=api-401')
      const data = await res.json()
      testResults.push({
        name: 'API 401 includes sessionExpired flag',
        pass: data.pass === true,
        detail: data.detail || 'Unknown',
      })
    } catch (e) {
      testResults.push({
        name: 'API 401 includes sessionExpired flag',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 4: SessionMonitor renders modal UI elements
    try {
      const res = await fetch('/api/verify-session-expiry?test=modal-elements')
      const data = await res.json()
      testResults.push({
        name: 'Session expired modal has re-login form',
        pass: data.pass === true,
        detail: data.detail || 'Unknown',
      })
    } catch (e) {
      testResults.push({
        name: 'Session expired modal has re-login form',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 5: SessionMonitor is integrated in app layout
    try {
      const res = await fetch('/api/verify-session-expiry?test=layout-integration')
      const data = await res.json()
      testResults.push({
        name: 'SessionMonitor integrated in app layout',
        pass: data.pass === true,
        detail: data.detail || 'Unknown',
      })
    } catch (e) {
      testResults.push({
        name: 'SessionMonitor integrated in app layout',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 6: No raw error shown - verify proxy has friendly messages
    try {
      const res = await fetch('/api/verify-session-expiry?test=no-raw-errors')
      const data = await res.json()
      testResults.push({
        name: 'No raw errors shown on session expiry',
        pass: data.pass === true,
        detail: data.detail || 'Unknown',
      })
    } catch (e) {
      testResults.push({
        name: 'No raw errors shown on session expiry',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    // Test 7: After re-login, user returns to intended page
    try {
      const res = await fetch('/api/verify-session-expiry?test=redirect-preserved')
      const data = await res.json()
      testResults.push({
        name: 'After re-login, returns to intended page',
        pass: data.pass === true,
        detail: data.detail || 'Unknown',
      })
    } catch (e) {
      testResults.push({
        name: 'After re-login, returns to intended page',
        pass: false,
        detail: `Error: ${e}`,
      })
    }

    setResults(testResults)
    setRunning(false)
  }

  useEffect(() => {
    runTests()
  }, [])

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Feature #108: Session Expiry Re-Login Prompt
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          Verifies that JWT expiry shows a friendly re-login prompt, not raw errors.
        </p>

        {running && (
          <div className="text-sm text-zinc-500 mb-4">Running tests...</div>
        )}

        <div className="mb-4 rounded-lg bg-white p-4 shadow border">
          <p className="text-lg font-semibold">
            {passing}/{total} tests passing
          </p>
          <div className="mt-2 h-2 rounded-full bg-zinc-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${passing === total ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: total > 0 ? `${(passing / total) * 100}%` : '0%' }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${r.pass ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.pass ? '✅' : '❌'}</span>
                <span className="font-medium text-sm">{r.name}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600 ml-7">{r.detail}</p>
            </div>
          ))}
        </div>

        <button
          onClick={runTests}
          disabled={running}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {running ? 'Tests draaien...' : 'Tests opnieuw uitvoeren'}
        </button>
      </div>
    </div>
  )
}
