'use client'

import { createContext, useContext } from 'react'

export type DreamPhase = 'idle' | 'dissolve' | 'threshold' | 'reveal'

export interface DreamTransitionValue {
  triggerDream: (href: string) => void
  phase: DreamPhase
}

export const DreamTransitionContext = createContext<DreamTransitionValue>({
  triggerDream: () => {},
  phase: 'idle',
})

export function useDreamTransition() {
  return useContext(DreamTransitionContext)
}
