'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { NextStepCard, NextStepSection, type NextStepSuggestion } from '@/components/app/next-step-card'

const FIXTURE_STEPS: NextStepSuggestion[] = [
  {
    key: 'test_double_dismiss_1',
    title: 'Dubbel-klik test stap',
    description: 'Probeer de X knop snel twee keer te klikken. Er mag geen fout optreden.',
    href: '#',
    icon: 'lightbulb',
    moduleColor: 'amber',
  },
  {
    key: 'test_double_dismiss_2',
    title: 'Tweede stap verschijnt',
    description: 'Na het negeren van de eerste stap verschijnt deze stap.',
    href: '#',
    icon: 'zap',
    moduleColor: 'amber',
  },
  {
    key: 'test_double_dismiss_3',
    title: 'Derde stap',
    description: 'Nog een stap om te testen.',
    href: '#',
    icon: 'target',
    moduleColor: 'amber',
  },
]

/**
 * Interactive test for double-dismiss behavior.
 * The user can rapidly click dismiss and verify no errors occur.
 */
function DoubleDismissInteractiveTest() {
  const [dismissCount, setDismissCount] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [dismissLog, setDismissLog] = useState<string[]>([])
  const [dismissed, setDismissed] = useState(false)
  const dismissingRef = useRef(false)

  const step: NextStepSuggestion = {
    key: 'interactive_double_dismiss',
    title: 'Klik snel twee keer op de X',
    description: 'Test: probeer snel twee keer op de X knop te drukken.',
    href: '#',
    icon: 'lightbulb',
    moduleColor: 'amber',
  }

  const handleDismiss = useCallback((s: NextStepSuggestion) => {
    const now = new Date().toISOString().slice(11, 23)
    setDismissCount(prev => {
      const newCount = prev + 1
      setDismissLog(log => [...log, `[${now}] Dismiss #${newCount} called for key: ${s.key}`])
      return newCount
    })

    try {
      setDismissed(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrors(prev => [...prev, msg])
    }
  }, [])

  const reset = () => {
    setDismissCount(0)
    setErrors([])
    setDismissLog([])
    setDismissed(false)
    dismissingRef.current = false
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
      <h3 className="text-lg font-bold text-zinc-900">Interactieve Double-Dismiss Test</h3>

      {!dismissed ? (
        <NextStepCard step={step} onDismiss={handleDismiss} />
      ) : (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800" data-testid="dismiss-success">
          <strong>Stap succesvol genegeerd!</strong> Geen fouten opgetreden.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-zinc-500">Dismiss calls</div>
          <div className="text-2xl font-bold text-zinc-900" data-testid="dismiss-count">{dismissCount}</div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-zinc-500">Errors</div>
          <div className={`text-2xl font-bold ${errors.length > 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="error-count">
            {errors.length}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3">
          <div className="text-zinc-500">Status</div>
          <div className="text-2xl font-bold text-zinc-900" data-testid="dismiss-status">
            {dismissed ? '✅' : '⏳'}
          </div>
        </div>
      </div>

      {dismissLog.length > 0 && (
        <div className="rounded-lg bg-zinc-900 p-3 text-xs font-mono text-green-400 max-h-40 overflow-y-auto" data-testid="dismiss-log">
          {dismissLog.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          <strong>Errors:</strong>
          <ul className="mt-1 list-disc list-inside">
            {errors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      <button onClick={reset} className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 text-sm hover:bg-zinc-200 transition-colors">
        Reset
      </button>
    </div>
  )
}

/**
 * Tests the NextStepSection component with double-dismiss behavior.
 */
function SectionDoubleDismissTest() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
      <h3 className="text-lg font-bold text-zinc-900">NextStepSection Double-Dismiss</h3>
      <p className="text-sm text-zinc-500">
        Dit gebruikt de echte NextStepSection component met dismissingKeys guard.
        Klik snel op X — de knop wordt disabled tijdens het verwerken.
      </p>
      <NextStepSection steps={FIXTURE_STEPS} moduleColor="amber" />
    </div>
  )
}

/**
 * API verification test runner.
 */
function VerificationResults() {
  const [results, setResults] = useState<null | {
    passed: boolean
    summary: string
    results: Array<{ test: string; passed: boolean; details: string }>
  }>(null)
  const [loading, setLoading] = useState(false)

  const runTests = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/verify-double-dismiss')
      const data = await res.json()
      setResults(data)
    } catch (err) {
      setResults({
        passed: false,
        summary: '0/0 tests passed',
        results: [{
          test: 'API fetch',
          passed: false,
          details: err instanceof Error ? err.message : String(err),
        }],
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runTests()
  }, [])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">Verificatie Resultaten</h3>
        <button
          onClick={runTests}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {loading ? 'Testen...' : 'Opnieuw testen'}
        </button>
      </div>

      {results && (
        <>
          <div className={`rounded-lg p-3 text-sm font-medium ${results.passed ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`} data-testid="verification-summary">
            {results.passed ? '✅' : '❌'} {results.summary}
          </div>

          <div className="space-y-2">
            {results.results.map((r, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${r.passed ? 'bg-green-50/50' : 'bg-red-50/50'}`} data-testid={`test-result-${i}`}>
                <div className="flex items-center gap-2">
                  <span>{r.passed ? '✅' : '❌'}</span>
                  <span className="font-medium">{r.test}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500 font-mono">{r.details}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function TestDoubleDismissPage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Feature #156: Double Dismiss Test</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verifieer dat het twee keer negeren van een next step suggestie geen fout veroorzaakt.
          </p>
        </div>

        <DoubleDismissInteractiveTest />
        <SectionDoubleDismissTest />
        <VerificationResults />
      </div>
    </div>
  )
}
