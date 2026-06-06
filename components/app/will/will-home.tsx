'use client'

import './will-home.css'
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { WillDots } from '@/components/app/will-dots'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { useCoachSuggestion } from '@/lib/hooks/use-coach-suggestion'
import { useTypewriter } from '@/lib/hooks/use-typewriter'
import { CoachMelding } from './coach-melding'
import {
  DEFAULT_COACH_TIMING, DEFAULT_COACH_HEADER,
  type CoachDataGaps, type DeferredField, type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

const THINK_MS = 400
const POSTPONED_PROMPT =
  'Ik wil opnieuw kijken naar tips die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met de belangrijkste.'

export type WillHomeProps = {
  dataGaps?: CoachDataGaps
  deferredFields?: DeferredField[]
  overrides?: CoachOverrides
  activeModules?: ModuleId[]
  delayMs?: number
  autoDismissMs?: number
  headerLabel?: string
}

export function WillHome({
  dataGaps, deferredFields, overrides, activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  autoDismissMs = DEFAULT_COACH_TIMING.autoDismissMs,
  headerLabel = DEFAULT_COACH_HEADER,
}: WillHomeProps) {
  const { isOpen, toggle, open, openWithMessage } = useChatContext()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { suggestion, dismiss } = useCoachSuggestion({ dataGaps, deferredFields, overrides, activeModules, delayMs })

  const mode: 'bubble' | 'melding' = suggestion ? 'melding' : 'bubble'

  // thinking: true for THINK_MS after a new suggestion appears (skipped when reduced-motion)
  const [thinking, setThinking] = useState(false)
  const prevSuggestionKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (mode !== 'melding') { setThinking(false); return }
    // On new suggestion key → start thinking phase (unless reduced-motion)
    if (suggestion?.key !== prevSuggestionKey.current) {
      prevSuggestionKey.current = suggestion?.key
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) {
        setThinking(false)
        return
      }
      setThinking(true)
      const t = setTimeout(() => setThinking(false), THINK_MS)
      return () => clearTimeout(t)
    }
  }, [mode, suggestion?.key])

  const { shown, done } = useTypewriter(suggestion?.message ?? '', { start: mode === 'melding' && !thinking })

  useEffect(() => {
    if (mode !== 'melding') return
    const t = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(t)
  }, [mode, suggestion?.key, autoDismissMs, dismiss])

  const strookRef = useRef<HTMLDivElement>(null)
  const [rise, setRise] = useState(80)
  useLayoutEffect(() => {
    if (mode === 'melding' && strookRef.current) {
      setRise(Math.max(0, strookRef.current.offsetHeight - 30))
    }
  }, [mode, suggestion?.key, shown, done])

  const [postponedReady, setPostponedReady] = useState(0)
  const fetchPostponedReady = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/recommendations/postponed-ready', { cache: 'no-store' })
      if (!res.ok) return
      const { count } = (await res.json()) as { count: number }
      setPostponedReady(count)
    } catch { /* informatief — stil falen */ }
  }, [])
  useEffect(() => { void fetchPostponedReady() }, [fetchPostponedReady])
  useEffect(() => { if (!isOpen) void fetchPostponedReady() }, [isOpen, fetchPostponedReady])

  const willState = mode === 'bubble' ? 'idle' : thinking ? 'thinking' : done ? 'listening' : 'talking'

  const handleBubbleClick = useCallback(() => {
    if (postponedReady > 0) openWithMessage(POSTPONED_PROMPT)
    else toggle()
  }, [postponedReady, openWithMessage, toggle])

  const handleCta = useCallback(() => {
    dismiss()
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [dismiss, searchParams, router, pathname])

  const handleOpenChatFromMelding = useCallback(() => {
    dismiss()
    open()
  }, [dismiss, open])

  if (isOpen) return null

  const fabAria = postponedReady > 0
    ? `Open chat met Will — ${postponedReady} uitgestelde tip${postponedReady === 1 ? '' : 's'} klaar`
    : 'Open chat met Will'

  return (
    <div className={`willhome willhome--${mode}`} style={{ ['--wh-rise' as string]: `${rise}px` }}>
      {mode === 'melding' && suggestion ? (
        <div ref={strookRef} className="wh-melding-face">
          <CoachMelding
            headerLabel={headerLabel}
            shown={shown}
            showCursor={!done}
            done={done}
            cta={suggestion.cta}
            ctaHref={suggestion.ctaHref}
            onClose={dismiss}
            onCtaActivate={handleCta}
            onOpenChat={handleOpenChatFromMelding}
          />
        </div>
      ) : (
        <button type="button" onClick={handleBubbleClick} className="wh-bubble" aria-label={fabAria}>
          {postponedReady > 0 && (
            <span className="wh-badge" aria-hidden>{postponedReady > 9 ? '9+' : postponedReady}</span>
          )}
        </button>
      )}

      <div className={`wh-avatar wh-avatar--${mode}`} aria-hidden>
        <WillDots size={36} state={willState} />
      </div>

      {mode === 'bubble' && <AiPrivacyIndicator size={12} className="wh-privacy" />}
    </div>
  )
}
