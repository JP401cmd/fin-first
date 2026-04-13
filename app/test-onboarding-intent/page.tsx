'use client'

import { useState } from 'react'
import { OnboardingIntent } from '@/components/onboarding/onboarding-intent'
import type { IntentId } from '@/lib/module-registry'

export default function TestOnboardingIntent() {
  const [selected, setSelected] = useState<IntentId | null>(null)

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="mx-auto max-w-2xl px-4">
        <OnboardingIntent
          selectedIntent={selected}
          onSelect={setSelected}
          onNext={() => alert('Next clicked')}
          onBack={() => alert('Back clicked')}
        />
      </div>
    </div>
  )
}
