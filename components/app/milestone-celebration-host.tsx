'use client'

/**
 * MilestoneCelebrationHost — de aanroepsite voor de **server-gedreven**
 * mijlpalen (bv. "€100.000 bereikt").
 *
 * Verschil met de twee bestaande aanroepsites van `MilestoneCelebration`
 * (`quick-add-wizard` → 'first-asset', `doelen-view` → `goal-reached:<id>`):
 * die dragen hun once-guard per-device op localStorage. Een server-gedreven
 * mijlpaal hoort cross-device precies één keer te verschijnen, dus rendert deze
 * host met `guard="none"` en meldt hij de viering af bij de server:
 * `POST /api/milestones/acknowledge` met `{ key }`.
 *
 * Eén acknowledge per mount, via een ref: sluitknop, auto-dismiss én het openen
 * van de deel-sheet zijn alle drie een dismiss-route, maar samen goed voor
 * hooguit één POST. Faalt de POST (offline, 500), dan wordt er níet opnieuw
 * geprobeerd — de mijlpaal blijft dan server-side open en de viering komt later
 * nog eens langs. Dat is bewust: liever twee keer gevierd dan stil verloren.
 *
 * Vorm: geen confetti, geen emoji (besluit W4.5). De teksten komen als kant-en-
 * klare strings binnen (server-loader) en zijn constaterend — de host verzint
 * geen bedragen, cijfers of duiding.
 */

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { MilestoneCelebration } from '@/components/app/milestone-celebration'

/**
 * De deel-sheet draagt de hele deel-flow (standen-keuze, kaart-preview,
 * ShareDialog) en trekt de canvas-renderer mee. Dynamisch geladen zodat die
 * bundel pas bij een klik binnenkomt — spiegelt `components/overview/briefing-panel.tsx`.
 */
const DeelKaartSheet = dynamic(
  () => import('@/components/app/deel-kaart-sheet').then((m) => m.DeelKaartSheet),
  { ssr: false },
)

/** Kant-en-klare mijlpaal, zoals de server-loader 'm levert. Plat en serialiseerbaar. */
export type CelebratableMilestone = {
  /** Stabiele mijlpaal-sleutel; gaat 1-op-1 naar de acknowledge-API. */
  key: string
  /** Korte kop, constaterend (bv. 'Je eerste ton staat.'). */
  titel: string
  /** Eén zin die de betekenis duidt in vrijheidstaal. */
  betekenis: string
}

export interface MilestoneCelebrationHostProps {
  /** De te vieren mijlpaal, of `null` wanneer er niets te vieren valt. */
  milestone: CelebratableMilestone | null
}

export function MilestoneCelebrationHost({ milestone }: MilestoneCelebrationHostProps) {
  // Per-key i.p.v. een boolean: levert de server ná deze viering een volgende
  // mijlpaal, dan begint die met een schone lei (viering zichtbaar, nog niet
  // afgemeld) zonder dat de host hoeft te remounten.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [deelOpen, setDeelOpen] = useState(false)
  const acknowledgedKeyRef = useRef<string | null>(null)

  const acknowledge = useCallback((key: string) => {
    if (acknowledgedKeyRef.current === key) return
    acknowledgedKeyRef.current = key
    // Fire-and-forget: de viering is al weg, een mislukte melding mag de UI
    // niet raken (zie de kop van dit bestand).
    void fetch('/api/milestones/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).catch(() => {
      /* stil: mijlpaal blijft open, viering komt later nog eens langs */
    })
  }, [])

  const handleDismiss = useCallback(
    (key: string) => {
      acknowledge(key)
      setDismissedKey(key)
    },
    [acknowledge],
  )

  if (!milestone) return null

  const zichtbaar = dismissedKey !== milestone.key

  return (
    <>
      {zichtbaar && (
        <MilestoneCelebration
          // Nieuwe key = verse mount: fade-in en auto-dismiss-timer beginnen
          // opnieuw i.p.v. door te lopen op de vorige mijlpaal.
          key={milestone.key}
          celebrationKey={milestone.key}
          guard="none"
          title={milestone.titel}
          meaning={milestone.betekenis}
          onDismiss={() => handleDismiss(milestone.key)}
          action={
            <button
              type="button"
              onClick={() => {
                // Het pakken van de actie is óók een dismiss-route.
                handleDismiss(milestone.key)
                setDeelOpen(true)
              }}
              className="group inline-flex min-h-[44px] items-center justify-center px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
            >
              <span className="border-b border-[var(--module-active-500)] pb-0.5 font-[family-name:var(--font-inter)] text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--module-active-700)] transition-colors group-hover:text-[var(--ink)]">
                Deel dit
              </span>
            </button>
          }
        />
      )}

      {deelOpen && <DeelKaartSheet open onClose={() => setDeelOpen(false)} />}
    </>
  )
}
