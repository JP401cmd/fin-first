'use client'

import { useState } from 'react'
import { OnboardingInkomen } from '@/components/onboarding/onboarding-inkomen'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'

/**
 * Test page for OnboardingInkomen — verifies:
 * 1. Both fields are optional (marked "(optioneel)")
 * 2. User can proceed without filling anything ("Later invullen")
 * 3. Geschat jaarinkomen (netto) + geschatte maandelijkse uitgaven are asked
 * 4. Spaarquote-preview appears when both fields are valid
 */
export default function TestOnboardingInkomen() {
  const [data, setData] = useState<Pick<IdentityData, 'estimated_yearly_income' | 'estimated_monthly_expenses'>>({
    estimated_yearly_income: '',
    estimated_monthly_expenses: '',
  })
  const [proceeded, setProceeded] = useState(false)

  if (proceeded) {
    return (
      <div className="mx-auto max-w-2xl p-8 bg-[var(--paper)] min-h-screen">
        <h1 className="text-2xl font-bold text-green-600 mb-4">Doorgegaan naar volgende stap!</h1>
        <p className="text-sm text-[var(--ink-2)] mb-4">
          De gebruiker kon doorgaan met de volgende waarden:
        </p>
        <pre className="text-sm bg-[var(--subtle)] p-4 border border-[var(--border-ed)]">
          {JSON.stringify(data, null, 2)}
        </pre>
        <button
          onClick={() => { setProceeded(false); setData({ estimated_yearly_income: '', estimated_monthly_expenses: '' }) }}
          className="mt-4 bg-[var(--ink)] text-[var(--paper)] px-4 py-2 text-sm"
        >
          Opnieuw testen
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]" style={{
      '--module-active-50': 'var(--color-kern-50)',
      '--module-active-100': 'var(--color-kern-100)',
      '--module-active-200': 'var(--color-kern-200)',
      '--module-active-300': 'var(--color-kern-300)',
      '--module-active-400': 'var(--color-kern-400)',
      '--module-active-500': 'var(--color-kern-500)',
      '--module-active-600': 'var(--color-kern-600)',
      '--module-active-700': 'var(--color-kern-700)',
      '--module-active-800': 'var(--color-kern-800)',
      '--module-active-900': 'var(--color-kern-900)',
      '--module-active-950': 'var(--color-kern-950)',
    } as React.CSSProperties}>
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--ink-3)] mb-2">
          Test: Onboarding Inkomen (jaarinkomen + maanduitgaven → spaarquote)
        </p>
      </div>
      <OnboardingInkomen
        data={data}
        onChange={setData}
        onNext={() => setProceeded(true)}
        onBack={() => alert('Terug geklikt')}
        onSkipIncome={() => {
          setData({ estimated_yearly_income: '', estimated_monthly_expenses: '' })
          setProceeded(true)
        }}
      />
    </div>
  )
}
