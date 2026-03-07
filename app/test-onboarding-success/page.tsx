'use client'

import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'

export default function TestOnboardingSuccess() {
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="mx-auto max-w-2xl px-4">
        <OnboardingSuccess onDashboard={() => alert('Dashboard clicked')} />
      </div>
    </div>
  )
}
