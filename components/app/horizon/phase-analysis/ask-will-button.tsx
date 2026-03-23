'use client'

import { memo } from 'react'
import { MessageSquare } from 'lucide-react'
import { useChatContext } from '@/components/app/chat/chat-provider'

// ── Types ────────────────────────────────────────────────────────────────────

interface AskWillButtonProps {
  /** Context message sent to Will when the button is clicked */
  context: string
  /** Button label, default "Vraag Will" */
  label?: string
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Compact button that opens the Will chat sidebar with a pre-filled context message.
 * Uses the `openWithMessage` API from the chat provider to simultaneously set the
 * pending message and open the chat panel in a single atomic action.
 */
export const AskWillButton = memo(function AskWillButton({
  context,
  label = 'Vraag Will',
}: AskWillButtonProps) {
  const { openWithMessage } = useChatContext()

  return (
    <button
      type="button"
      onClick={() => openWithMessage(context)}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] border border-[var(--color-wil-300)] bg-[var(--color-wil-50)] px-3 py-1.5 text-xs font-medium text-[var(--color-wil-700)] transition-colors hover:bg-[var(--color-wil-100)]"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {label}
    </button>
  )
})
