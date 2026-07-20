'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ActionBoard } from '@/components/app/action-board'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageOpening } from '@/components/editorial'
import { TipsLijst } from './tips-lijst'
import type { Action, Recommendation } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

/**
 * TipsActiesPage — canoniek /overzicht/tips: TipsLijst bovenaan +
 * ActionBoard eronder. Off-track doelen leven op /toekomst.
 */
interface TipsActiesPageProps {
  recommendations: Recommendation[]
  actions: Action[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  infoDescription: string
}

export function TipsActiesPage({
  recommendations,
  actions,
  partnerInfo,
  currentUserId,
  infoDescription,
}: TipsActiesPageProps) {
  const router = useRouter()
  const [addTrigger, setAddTrigger] = useState(0)
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)
  const actiesRef = useRef<HTMLDivElement>(null)

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const handleDataChanged = useCallback(() => {
    router.refresh()
  }, [router])

  // Doorklik vanuit een Doe nu-actie: laat de gebruiker meteen de nieuw
  // aangemaakte actie zien door naar de Open-acties-sectie te scrollen.
  // router.refresh() haalt de nieuwe action op; daarna scrollen we.
  const handleTipAccepted = useCallback(() => {
    router.refresh()
    // Wacht één tick zodat de nieuwe actie kan renderen.
    requestAnimationFrame(() => {
      actiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [router])

  return (
    <FreedomDaysAnimationProvider>
      <section className="relative mx-auto max-w-3xl px-4 sm:px-6 py-6">
        {infoDescription && (
          <PageInfoButton
            description={infoDescription}
            className="absolute right-4 top-6 sm:right-6"
          />
        )}

        <PageOpening
          className="mb-6 pr-12 sm:pr-16"
          kicker="Tips & acties"
          titleBefore="Wat zou je "
          emphasis="nu"
          titleAfter=" kunnen doen?"
          deck="Toptips van Fin bovenaan; open acties eronder. Beslis op een tip met Doe nu, Later of Negeren — accepteer je 'm, dan verschijnt 'ie op je actielijst."
        />

        <TipsLijst
          recommendations={recommendations}
          onChanged={handleDataChanged}
          onAccepted={handleTipAccepted}
        />

        <div ref={actiesRef} id="acties" className="mt-8 mb-3 flex items-baseline justify-between scroll-mt-20">
          <h2 className="font-serif text-lg sm:text-xl text-[var(--ink)]">Open acties</h2>
          <button
            type="button"
            onClick={() => setAddTrigger((t) => t + 1)}
            className="inline-flex items-center gap-1 rounded-full bg-wil-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-wil-600"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Nieuwe actie
          </button>
        </div>

        <ActionBoard
          initialActions={actions}
          partnerInfo={partnerInfo}
          currentUserId={currentUserId}
          addTrigger={addTrigger}
          onCancellationOpen={handleCancellationOpen}
          onDataChanged={handleDataChanged}
        />
      </section>

      <OpzegModal
        open={!!opzegTarget}
        onClose={() => setOpzegTarget(null)}
        subscription={
          opzegTarget
            ? {
                id: '',
                name: opzegTarget.subscription_name,
                averageAmount: opzegTarget.monthly_amount,
                monthlyAmount: opzegTarget.monthly_amount,
                frequency: opzegTarget.frequency as 'monthly' | 'weekly' | 'quarterly' | 'yearly',
                nextDate: null,
                confidence: 'high' as const,
                isVariableAmount: false,
                occurrences: 0,
                alreadyConfirmed: false,
              }
            : null
        }
        initialMetadata={opzegTarget ?? undefined}
        userProfile={{ full_name: null }}
        onSavedToActionList={() => setOpzegTarget(null)}
      />
    </FreedomDaysAnimationProvider>
  )
}
