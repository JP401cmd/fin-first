'use client'

import { createContext, useContext, useMemo } from 'react'

// ── Card Feedback Context ───────────────────────────────────
// Provides per-card thumbs up/down feedback callback via React context.
// Used by BriefingCard to show feedback buttons on hover.

export type CardFeedbackFn = (cardIndex: number, cardType: string, positive: boolean) => void

interface FeedbackCtx {
  onFeedback?: (positive: boolean) => void
}

const CardFeedbackContext = createContext<FeedbackCtx>({})

/** Hook used by BriefingCard to get its per-card feedback callback */
export function useCardFeedback(): ((positive: boolean) => void) | undefined {
  return useContext(CardFeedbackContext).onFeedback
}

/** Provider that binds a specific cardIndex + cardType to the global feedback handler */
export function CardFeedbackProvider({ index, cardType, handler, children }: {
  index: number
  cardType: string
  handler: CardFeedbackFn
  children: React.ReactNode
}) {
  const ctx = useMemo(
    () => ({ onFeedback: (positive: boolean) => handler(index, cardType, positive) }),
    [index, cardType, handler],
  )
  return (
    <CardFeedbackContext value={ctx}>
      {children}
    </CardFeedbackContext>
  )
}
