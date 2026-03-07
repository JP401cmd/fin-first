'use client'

import { useState, useEffect } from 'react'
import { FinnAvatar } from '@/components/app/avatars'

const COMPOSING_MESSAGES = [
  'Je data analyseren\u2026',
  'Trends bekijken\u2026',
  'Prioriteiten bepalen\u2026',
  'Briefing samenstellen\u2026',
]

export function BriefingComposingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % COMPOSING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* Will avatar */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--r)] bg-wil-50">
        <FinnAvatar size={44} />
      </div>

      {/* Bouncing dots */}
      <div className="mb-3 flex gap-1">
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {/* Rotating status message */}
      <p
        key={msgIndex}
        className="text-sm text-wil-600 font-medium animate-fade-up"
      >
        {COMPOSING_MESSAGES[msgIndex]}
      </p>
    </div>
  )
}
