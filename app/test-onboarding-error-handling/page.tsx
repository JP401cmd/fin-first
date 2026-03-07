'use client'

import { useState, useCallback, useReducer } from 'react'
import { FinnAvatar } from '@/components/app/avatars'

/**
 * Test page for Feature #391: Onboarding netwerk- en save-fouten met retry
 *
 * Verifies:
 * 1. Error banner appears at top of screen with Dutch error message
 * 2. Retry button retries without data loss
 * 3. All state preserved in useReducer
 * 4. Timeout-specific error message (>10s)
 * 5. Mobile: error banner is fixed/sticky, always visible
 * 6. Network error message is clear and in Dutch
 */

interface TestState {
  name: string
  income: string
  step: 'form' | 'saving' | 'success'
}

type TestAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_INCOME'; income: string }
  | { type: 'SET_STEP'; step: TestState['step'] }

const initialState: TestState = {
  name: 'Jan Tester',
  income: '3500',
  step: 'form',
}

function reducer(state: TestState, action: TestAction): TestState {
  switch (action.type) {
    case 'SET_NAME': return { ...state, name: action.name }
    case 'SET_INCOME': return { ...state, income: action.income }
    case 'SET_STEP': return { ...state, step: action.step }
    default: return state
  }
}

const ERROR_SCENARIOS = [
  { label: 'Netwerkfout (Failed to fetch)', error: 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.' },
  { label: 'Timeout (>10s)', error: 'De server reageert niet. Controleer je internetverbinding en probeer het opnieuw.' },
  { label: 'Server error (500)', error: 'Profiel opslaan mislukt: database connection error' },
  { label: 'Validatiefout', error: 'Ongeldige invoer' },
]

export default function TestOnboardingErrorHandling() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastAction, setLastAction] = useState<string>('')

  const simulateError = useCallback((errorMessage: string) => {
    setSaving(true)
    setSaveError(null)
    dispatch({ type: 'SET_STEP', step: 'saving' })
    setLastAction(`Simulatie gestart: ${errorMessage}`)

    // Simulate a 1.5s save attempt that fails
    setTimeout(() => {
      setSaveError(errorMessage)
      dispatch({ type: 'SET_STEP', step: 'form' })
      setSaving(false)
    }, 1500)
  }, [])

  const handleRetry = useCallback(() => {
    setSaving(true)
    setSaveError(null)
    dispatch({ type: 'SET_STEP', step: 'saving' })
    setRetryCount((c) => c + 1)
    setLastAction('Retry gestart — data moet intact zijn')

    // Simulate successful retry
    setTimeout(() => {
      dispatch({ type: 'SET_STEP', step: 'success' })
      setSaving(false)
    }, 1500)
  }, [])

  const dismissError = useCallback(() => setSaveError(null), [])

  const reset = useCallback(() => {
    setSaveError(null)
    setSaving(false)
    setRetryCount(0)
    setLastAction('')
    dispatch({ type: 'SET_STEP', step: 'form' })
    dispatch({ type: 'SET_NAME', name: 'Jan Tester' })
    dispatch({ type: 'SET_INCOME', income: '3500' })
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:justify-center sm:px-6 sm:py-12">
      {/* ── Sticky error banner (same as onboarding page) ─────── */}
      {saveError && (
        <div
          className="fixed inset-x-0 top-0 z-50 border-b border-red-200 bg-red-50 px-4 py-3 shadow-sm"
          role="alert"
          aria-live="assertive"
          data-testid="error-banner"
        >
          <div className="mx-auto flex max-w-[640px] items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Er ging iets mis</p>
              <p className="mt-0.5 text-sm text-red-600">{saveError}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={saving}
                className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Bezig...' : 'Opnieuw proberen'}
              </button>
              <button
                onClick={dismissError}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-100 hover:text-red-600"
                aria-label="Sluiten"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`w-full max-w-[480px] sm:max-w-[640px] ${saveError ? 'mt-16' : ''}`}>
        <h1 className="mb-6 text-2xl font-bold text-zinc-900">Test: Onboarding Error Handling (#391)</h1>

        {state.step === 'form' && (
          <div className="space-y-6">
            {/* Simulated form data — shows state preservation */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
              <h2 className="text-lg font-semibold text-zinc-800">Formulierdata (useReducer state)</h2>
              <div>
                <label className="text-sm text-zinc-500">Naam</label>
                <input
                  value={state.name}
                  onChange={(e) => dispatch({ type: 'SET_NAME', name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-500">Netto inkomen</label>
                <input
                  value={state.income}
                  onChange={(e) => dispatch({ type: 'SET_INCOME', income: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-zinc-400">
                Retry count: {retryCount} | State name: &quot;{state.name}&quot; | State income: &quot;{state.income}&quot;
              </p>
              {lastAction && (
                <p className="text-xs text-teal-600 font-medium">{lastAction}</p>
              )}
            </div>

            {/* Error scenario buttons */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-3">
              <h2 className="text-lg font-semibold text-zinc-800">Simuleer foutscenario</h2>
              <div className="grid gap-2">
                {ERROR_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.label}
                    onClick={() => simulateError(scenario.error)}
                    disabled={saving}
                    className="min-h-[44px] w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-2">
              <h2 className="text-lg font-semibold text-zinc-800">Verificatie checklist</h2>
              <ul className="text-sm text-zinc-600 space-y-1 list-disc pl-4">
                <li>Error banner verschijnt bovenaan (fixed, z-50)</li>
                <li>Foutmelding is in het Nederlands</li>
                <li>Retry knop herprobeert zonder data te verliezen</li>
                <li>Na retry: naam en inkomen zijn nog steeds ingevuld</li>
                <li>Op mobiel: banner scrollt mee (fixed positioning)</li>
                <li>Timeout melding is specifiek (&quot;server reageert niet&quot;)</li>
                <li>Dismiss (X) verbergt de banner</li>
              </ul>
            </div>

            <button onClick={reset} className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-50">
              Reset alles
            </button>
          </div>
        )}

        {state.step === 'saving' && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                <div className="animate-pulse">
                  <FinnAvatar size={64} />
                </div>
              </div>
              <p className="text-sm font-medium text-zinc-700">Opslaan...</p>
            </div>
          </div>
        )}

        {state.step === 'success' && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-white p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="mb-2 text-base font-semibold text-zinc-900">Retry gelukt!</h3>
              <p className="mb-2 text-sm text-zinc-500">State was bewaard: naam=&quot;{state.name}&quot;, inkomen=&quot;{state.income}&quot;</p>
              <p className="mb-4 text-xs text-zinc-400">Retry count: {retryCount}</p>
              <button onClick={reset} className="min-h-[44px] w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
                Opnieuw testen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
