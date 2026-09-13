'use client'

/**
 * PlanReviewProvider — de ingang van de plan-review Toekomst (TPR-01, ADR 0142).
 *
 * Houdt de open-staat van de review-pane en deelt `open(stap?)` met de Voorkeuren-kaart
 * op /toekomst. Bewust STATE-gedreven en niet via een `<Link>`-navigatie: /toekomst leest
 * searchParams en is dus dynamisch — een link naar `?planreview=open` op dezelfde route
 * zou eerst alle loaders opnieuw laten draaien voordat de pane opent.
 *
 * De deeplink `?planreview=open[&stap=<stap>]` (⌘K, de knop "Alle keuzes doorlopen" op
 * /toekomst/voorkeuren) wordt bij binnenkomst geconsumeerd en uit de URL gepoetst
 * zonder van route te wisselen (zelfde regel als `lib/horizon/deeplink-cleanup.ts`).
 *
 * `initialProgress === null` betekent: de review kan (nog) niets bewaren (kolom nog niet
 * uitgerold). Dan opent er niets en blijft de kaart de gewone Voorkeuren-kaart.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  PLAN_REVIEW_PARAM,
  PLAN_REVIEW_STAP_PARAM,
  isPlanReviewStap,
  type PlanReviewProgress,
  type PlanReviewStap,
} from '@/lib/plan-review/types'
import { PlanReviewPane } from './plan-review-pane'

interface PlanReviewContextValue {
  /** Opent de review, standaard bij de eerste onbevestigde stap (A2/A6). */
  open: (stap?: PlanReviewStap) => void
}

/** Geëxporteerd voor tests (een kaart binnen een opener renderen zonder router). */
export const PlanReviewContext = createContext<PlanReviewContextValue | null>(null)

/** `null` buiten de provider — de kaart valt dan terug op zijn gewone link. */
export function usePlanReviewOpener(): PlanReviewContextValue | null {
  return useContext(PlanReviewContext)
}

/** Startstap: expliciet gevraagd > eerste open stap > stap 1 ("Alle keuzes doorlopen"). */
export function resolveStartStap(
  progress: PlanReviewProgress,
  gevraagd: PlanReviewStap | null | undefined,
): PlanReviewStap {
  if (gevraagd) return gevraagd
  return progress.eersteOpen ?? 'plan'
}

export function PlanReviewProvider({
  initialProgress,
  children,
}: {
  initialProgress: PlanReviewProgress | null
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [startStap, setStartStap] = useState<PlanReviewStap | null>(null)

  const open = useCallback(
    (stap?: PlanReviewStap) => {
      if (!initialProgress) return
      setStartStap(resolveStartStap(initialProgress, stap))
    },
    [initialProgress],
  )

  // Deeplink consumeren en opschonen (nooit van route wisselen). Opschonen gebeurt
  // SYNCHROON via de native History API, vóór de pane opent: `router.replace` zou op
  // de dynamische /toekomst alle loaders opnieuw draaien, en landt pas nádat de
  // overlay-history zijn entry duwde — dan overschrijft hij die entry en heropent een
  // latere "terug" de pane. Next synchroniseert `useSearchParams` met replaceState.
  useEffect(() => {
    if (searchParams.get(PLAN_REVIEW_PARAM) !== 'open') return
    const gevraagd = searchParams.get(PLAN_REVIEW_STAP_PARAM)
    const rest = new URLSearchParams(searchParams.toString())
    rest.delete(PLAN_REVIEW_PARAM)
    rest.delete(PLAN_REVIEW_STAP_PARAM)
    const qs = rest.toString()
    const schoon = qs ? `${pathname}?${qs}` : pathname
    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', schoon)
    } else {
      router.replace(schoon, { scroll: false })
    }
    if (initialProgress) {
      setStartStap(resolveStartStap(initialProgress, isPlanReviewStap(gevraagd) ? gevraagd : null))
    }
  }, [searchParams, router, pathname, initialProgress])

  const value = useMemo(() => (initialProgress ? { open } : null), [initialProgress, open])

  return (
    <PlanReviewContext.Provider value={value}>
      {children}
      {initialProgress && startStap && (
        <PlanReviewPane
          open
          startStap={startStap}
          initialProgress={initialProgress}
          onClose={() => setStartStap(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </PlanReviewContext.Provider>
  )
}
