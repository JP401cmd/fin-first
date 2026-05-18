'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import type { CardModule } from '@/lib/briefing/types'
import { useCardFeedback } from './card-feedback-context'

const MODULE_ACCENT: Record<string, string> = {
  kern: 'bg-kern-500',
  wil: 'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross: 'bg-[var(--border-md)]',
}

interface BriefingCardProps {
  module?: CardModule
  href?: string
  onClick?: () => void
  onEngage?: () => void
  onFeedback?: (positive: boolean) => void
  children: ReactNode
  className?: string
}

export function BriefingCard({ module = 'cross', href, onClick, onEngage, onFeedback: onFeedbackProp, children, className = '' }: BriefingCardProps) {
  const accent = MODULE_ACCENT[module] ?? MODULE_ACCENT.cross
  const isInteractive = !!(href ?? onClick)
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null)

  // Prefer explicit prop, fall back to context-provided callback
  const contextFeedback = useCardFeedback()
  const feedbackHandler = onFeedbackProp ?? contextFeedback

  const handleFeedback = (positive: boolean, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFeedbackGiven(positive)
    feedbackHandler?.(positive)
  }

  const feedbackUI = feedbackHandler && (
    <div className={`absolute bottom-2 right-2 flex items-center gap-1 transition-opacity duration-200 ${
      feedbackGiven !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
    }`}>
      {feedbackGiven !== null ? (
        <span className="text-[10px] text-[var(--ink-4)] italic select-none">Bedankt</span>
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => handleFeedback(true, e)}
            className="p-1 rounded-md text-[var(--ink-4)] hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            aria-label="Positieve feedback"
          >
            <ThumbsUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => handleFeedback(false, e)}
            className="p-1 rounded-md text-[var(--ink-4)] hover:text-red-500 hover:bg-red-50 transition-colors"
            aria-label="Negatieve feedback"
          >
            <ThumbsDown className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  )

  const baseClasses = 'group relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] transition-all'
  const interactiveClasses = isInteractive
    ? 'cursor-pointer hover:shadow-[var(--s1)] hover:-translate-y-px'
    : ''
  const animClasses = 'animate-fade-up'

  const content = (
    <>
      <div className={`h-[2px] w-full ${accent}`} />
      <div className="p-4 pb-6">
        {children}
      </div>
      {feedbackUI}
    </>
  )

  if (href) {
    return (
      <Link href={href} onClick={onEngage} className={`block ${baseClasses} ${interactiveClasses} ${animClasses} ${className}`}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    const handleClick = () => {
      onEngage?.()
      onClick()
    }
    return (
      <button type="button" onClick={handleClick} className={`text-left w-full ${baseClasses} ${interactiveClasses} ${animClasses} ${className}`}>
        {content}
      </button>
    )
  }

  return (
    <div className={`${baseClasses} ${animClasses} ${className}`}>
      {content}
    </div>
  )
}
