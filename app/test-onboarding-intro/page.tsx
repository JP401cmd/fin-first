'use client'

import { OnboardingIntro } from '@/components/onboarding/onboarding-intro'

export default function TestOnboardingIntro() {
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="mx-auto max-w-2xl px-4">
        <OnboardingIntro
          onNext={() => alert('Next clicked')}
          onLogout={() => alert('Logout clicked')}
        />
      </div>
    </div>
  )
}
