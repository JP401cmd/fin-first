'use client'

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { FEATURES } from '@/lib/feature-phases'

type FeatureGateProps = {
  featureId: string
  fallback?: 'hidden' | 'locked' | ReactNode
  children: ReactNode
}

export function FeatureGate({ featureId, fallback = 'hidden', children }: FeatureGateProps) {
  const { features } = useFeatureAccess()

  // Fail-open: features not in the map are shown
  if (features[featureId] !== false) {
    return <>{children}</>
  }

  if (fallback === 'hidden') {
    return null
  }

  if (fallback === 'locked') {
    const featureDef = FEATURES.find(f => f.id === featureId)
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200/60">
            <Lock className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-600">
              {featureDef?.label ?? featureId}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {featureDef?.description ?? 'Deze feature is nog niet beschikbaar in je huidige fase.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Custom fallback
  return <>{fallback}</>
}
