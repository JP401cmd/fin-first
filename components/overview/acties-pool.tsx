'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, MessageCircle } from 'lucide-react'
import { ActionBoard } from '@/components/app/action-board'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { OpzegModal } from '@/components/app/opzeg-modal'
import { OffTrackDoelenLijst } from '@/components/overview/off-track-doelen-lijst'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import type { Action } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import type { GoalWithBudget } from '@/lib/will-data-loader'

/** GoalProgress-shape uit will-data-loader (parallel array tegenover goals). */
type GoalProgress = {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
}

/**
 * ActiesPool — canonieke Acties-pool op /overzicht/acties.
 *
 * Plan §6.6: voorstellen-laag is verhuisd naar Will-chat (één-voor-één,
 * niks doen = weg). Op de pool zien gebruikers nog alleen het echte werk:
 *   - ActionBoard      open / postponed / completed / rejected
 *   - OffTrackDoelen   doelen onder 100% en niet on-track
 *
 * Nieuwe acties komen er nu via twee kanalen:
 *   1. Will-chat — Will stelt voorstellen voor; accept → automatisch
 *      acties via /api/ai/recommendations/[id]/accept
 *   2. Handmatig — knop "Nieuwe actie" opent het ActionForm in de board
 *
 * partnerInfo + userProfile vormen de minimale dependency-set voor de
 * cancellation-flow vanuit vaste-lasten-acties.
 */
interface ActiesPoolProps {
  actions: Action[]
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  /** PAGE_INFO['/overzicht/acties'] tekst — empty string = geen knop. */
  infoDescription: string
}

export function ActiesPool({
  actions,
  goals,
  goalProgresses,
  partnerInfo,
  currentUserId,
  infoDescription,
}: ActiesPoolProps) {
  const router = useRouter()
  const [addTrigger, setAddTrigger] = useState(0)
  const [opzegTarget, setOpzegTarget] = useState<CancellationMetadata | null>(null)

  const handleCancellationOpen = useCallback((metadata: CancellationMetadata) => {
    setOpzegTarget(metadata)
  }, [])

  const handleDataChanged = useCallback(() => {
    router.refresh()
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

        <header className="mb-6 pr-12 sm:pr-16">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Will — acties
          </div>
          <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
            Wat zou je nu kunnen doen?
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            Je open werk plus doelen die aandacht vragen. Voorstellen van Will
            komen voorbij in de chat — geaccepteerde voorstellen verschijnen
            hier als acties.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAddTrigger((t) => t + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-wil-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nieuwe actie
            </button>
            <Link
              href="/berichten?prompt=analyseer-mijn-financien"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3.5 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-wil-300 hover:text-wil-700"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Vraag Will om voorstellen
            </Link>
          </div>
        </header>

        <ActionBoard
          initialActions={actions}
          partnerInfo={partnerInfo}
          currentUserId={currentUserId}
          addTrigger={addTrigger}
          onCancellationOpen={handleCancellationOpen}
          onDataChanged={handleDataChanged}
        />

        <OffTrackDoelenLijst goals={goals} goalProgresses={goalProgresses} />
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
