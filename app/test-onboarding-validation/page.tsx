'use client'

import { useState } from 'react'
import { OnboardingIdentity, type IdentityData } from '@/components/onboarding/onboarding-identity'

export default function TestOnboardingValidation() {
  const [data, setData] = useState<IdentityData>({
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    expected_return: 0.07,
    inflation_rate: 0.02,
    retirement_expense_method: 'essential_budgets',
    retirement_custom_amount: '',
    fire_end_strategy: 'deplete',
    fire_legacy_amount: '',
    fire_end_age: 90,
    temporal_balance: 3,
  })
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [testResults, setTestResults] = useState<{ label: string; pass: boolean }[]>([])

  function runTests() {
    const results: { label: string; pass: boolean }[] = []

    // Test 1: Error messages appear for empty fields
    const errorEls = document.querySelectorAll('[role="alert"]')
    results.push({
      label: 'Error messages appear when submitting empty form',
      pass: errorEls.length > 0,
    })

    // Test 2: Check for name error
    const nameError = document.getElementById('ob-name-error')
    results.push({
      label: 'Name field shows error message',
      pass: nameError !== null && nameError.textContent !== '',
    })

    // Test 3: Check for DOB error
    const dobError = document.getElementById('ob-dob-error')
    results.push({
      label: 'Date of birth field shows error message',
      pass: dobError !== null && dobError.textContent !== '',
    })

    // Test 4: Check for income error
    const incomeError = document.getElementById('ob-income-error')
    results.push({
      label: 'Income field shows error message',
      pass: incomeError !== null && incomeError.textContent !== '',
    })

    // Test 5: Check for summary banner
    const banner = document.querySelector('[role="alert"]')
    results.push({
      label: 'Summary error banner is displayed',
      pass: banner !== null && banner.textContent?.includes('verplichte velden') === true,
    })

    // Test 6: Check red borders on invalid inputs
    const nameInput = document.getElementById('ob-name')
    results.push({
      label: 'Name input has red border (aria-invalid)',
      pass: nameInput?.getAttribute('aria-invalid') === 'true',
    })

    setTestResults(results)
  }

  if (step === 'success') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold text-green-600">Validatie geslaagd!</h1>
        <p className="mt-2 text-zinc-600">Het formulier is succesvol gevalideerd en doorgestuurd.</p>
        <button
          onClick={() => {
            setStep('form')
            setData({
              full_name: '',
              date_of_birth: '',
              household_type: 'solo',
              number_of_children: 0,
              net_monthly_income: '',
              expected_return: 0.07,
              inflation_rate: 0.02,
              retirement_expense_method: 'essential_budgets',
              retirement_custom_amount: '',
              fire_end_strategy: 'deplete',
              fire_legacy_amount: '',
              fire_end_age: 90,
              temporal_balance: 3,
            })
          }}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Opnieuw testen
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-4 text-xl font-bold text-zinc-900">Test: Onboarding Validation (#109)</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Test field-level validation errors on the identity form. Click &quot;Volgende&quot; with empty fields,
        then click &quot;Run Tests&quot; to verify error messages appear.
      </p>

      <OnboardingIdentity
        data={data}
        onChange={setData}
        onNext={() => setStep('success')}
        onBack={() => {}}
      />

      <div className="mt-6 space-y-4">
        <button
          onClick={runTests}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          Run Tests
        </button>

        {testResults.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Test Results</h2>
            <div className="space-y-2">
              {testResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${r.pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                  <span className={`text-sm ${r.pass ? 'text-zinc-700' : 'text-red-700'}`}>{r.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {testResults.filter(r => r.pass).length}/{testResults.length} tests passing
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
