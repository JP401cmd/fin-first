'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRouter, usePathname } from 'next/navigation'
import { useChatContext } from './chat-provider'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { WillDots } from '@/components/app/will-dots'
import { ActionEditModal } from '@/components/app/action-edit-modal'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { renderMarkdown, findToolInvocation, TOOL_LOADING_STATES, TOOL_OUTPUT_STATES, type MessagePart } from './markdown-helpers'
import { X, Send, Loader2, Zap, Check, AlertTriangle, RefreshCw, Pin, PinOff } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'

/* ── Domain config per module ─────────────────────────────────────── */

type DomainConfig = {
  name: string
  subtitle: string
  placeholder: string
  greeting: string
  greetingDescription: string
  fabBg: string
  fabAvatar: (size: number) => React.ReactNode
  headerColor: string
  bubbleBg: string
  accentColor: string
  sendBg: string
  sendHoverBg: string
}

const WILL_CONFIG: DomainConfig = {
  name: 'Will',
  subtitle: 'Financieel assistent',
  placeholder: 'Vraag Will iets...',
  greeting: 'Hoi, ik ben Will',
  greetingDescription: 'Ik help je met al je financiele vragen — van budgetten tot FIRE-projecties.',
  fabBg: 'bg-white/60 backdrop-blur-sm',
  fabAvatar: (size: number) => <WillDots size={size} />,
  headerColor: 'text-wil-600',
  bubbleBg: 'bg-wil-50',
  accentColor: 'text-wil-600',
  sendBg: 'bg-wil-600',
  sendHoverBg: 'hover:bg-wil-700',
}

/* ── Types ─────────────────────────────────────────────────────────── */

type SuggestActionResult = {
  title: string
  description: string | null
  freedom_days_impact: number
  euro_impact_monthly: number | null
  priority_score: number
}

/* ── Action suggestion card ────────────────────────────────────────── */

function ActionSuggestionCard({
  data,
  added,
  loading,
  onClick,
}: {
  data: SuggestActionResult
  added: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={added || loading}
      className={`mt-2 w-full rounded-[var(--r-lg)] border text-left transition-all ${
        added
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-wil-200 bg-[var(--paper)] hover:border-wil-400 hover:shadow-[var(--s0)] active:scale-[0.98]'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className={`h-3.5 w-3.5 shrink-0 ${added ? 'text-emerald-500' : 'text-wil-500'}`} />
            <span className="text-xs font-semibold text-zinc-800">{data.title}</span>
          </div>
          {added ? (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Toegevoegd
            </span>
          ) : loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-wil-500" />
          ) : (
            <span className="rounded-full bg-wil-100 px-1.5 py-0.5 text-xs font-medium text-wil-700">
              + Toevoegen
            </span>
          )}
        </div>
        {data.description && (
          <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">{data.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--ink-3)]">
          <span className="font-medium text-wil-600">
            +{data.freedom_days_impact} {data.freedom_days_impact === 1 ? 'dag' : 'dagen'} vrijheid
          </span>
          {data.euro_impact_monthly != null && data.euro_impact_monthly > 0 && (
            <span>&euro;{data.euro_impact_monthly}/mnd</span>
          )}
        </div>
      </div>
    </button>
  )
}

/* ── Main ChatPanel ────────────────────────────────────────────────── */

export function ChatPanel() {
  const { isOpen, close, toggle, pendingMessage, clearPendingMessage, isPinned, togglePin, autoOpenMessage, setAutoOpenMessage } = useChatContext()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  // Will is the sole assistant — no domain switching
  const config = WILL_CONFIG

  // Track which suggestions have been added (by toolInvocationId)
  const [addedActions, setAddedActions] = useState<Set<string>>(new Set())
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Modal state
  const [editAction, setEditAction] = useState<Action | null>(null)

  // Dynamic domain: route-aware and gated by active modules
  const pathname = usePathname()
  const { activeModules } = useModuleAccess()

  const domain = useMemo(() => {
    // Route-based domain selection, gated by active modules
    if (pathname.startsWith('/horizon') && activeModules.includes('toekomstplannen')) return 'horizon'
    if (pathname.startsWith('/will') && activeModules.includes('inzicht_acties')) return 'wil'
    // Default: wil if available, otherwise kern
    if (activeModules.includes('inzicht_acties')) return 'wil'
    return 'kern'
  }, [pathname, activeModules])

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/ai/chat', body: { domain } }),
    [domain],
  )

  const { messages: rawMessages, sendMessage, status, error, clearError, regenerate } = useChat({
    id: 'chat-will',
    transport,
  })

  // Deduplicate messages by ID — the useChat store can produce transient
  // duplicates during rapid re-renders (e.g. dreamgate page transition).
  const messages = useMemo(() => {
    const seen = new Set<string>()
    return rawMessages.filter(msg => {
      if (seen.has(msg.id)) return false
      seen.add(msg.id)
      return true
    })
  }, [rawMessages])

  const isStreaming = status === 'streaming' || status === 'submitted'
  const hasError = status === 'error' || !!error

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Auto-send pending message from notification "Vraag AI"
  useEffect(() => {
    if (isOpen && pendingMessage && !isStreaming) {
      sendMessage({ text: pendingMessage })
      clearPendingMessage()
    }
  }, [isOpen, pendingMessage, isStreaming, sendMessage, clearPendingMessage])

  // Auto-send scenario context message when chat opens from whatif page (first open only)
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (isOpen && autoOpenMessage && !isStreaming && messages.length === 0 && !autoSentRef.current) {
      autoSentRef.current = true
      sendMessage({ text: autoOpenMessage })
      setAutoOpenMessage(null)
    }
  }, [isOpen, autoOpenMessage, isStreaming, messages.length, sendMessage, setAutoOpenMessage])

  const submit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage({ text })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  /* ── Action creation from suggestion ──────────────────────────── */

  const handleAddAction = useCallback(async (invocationId: string, data: SuggestActionResult) => {
    if (addedActions.has(invocationId)) return
    setLoadingAction(invocationId)

    try {
      const res = await fetch('/api/ai/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          freedom_days_impact: data.freedom_days_impact,
          euro_impact_monthly: data.euro_impact_monthly,
          priority_score: data.priority_score,
          source: 'chat',
        }),
      })

      if (!res.ok) throw new Error('Failed to create action')

      const { action } = await res.json() as { action: Action }
      setAddedActions((prev) => new Set(prev).add(invocationId))
      setEditAction(action)
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingAction(null)
    }
  }, [addedActions])

  /* ── Modal handlers ───────────────────────────────────────────── */

  const handleModalSave = useCallback(async (data: Record<string, unknown>) => {
    if (!editAction) return
    const res = await fetch(`/api/ai/actions/${editAction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setEditAction(null)
      router.refresh()
    }
  }, [editAction, router])

  const handleStatusChange = useCallback(async (status: ActionStatus, data?: Record<string, unknown>) => {
    if (!editAction) return
    const res = await fetch(`/api/ai/actions/${editAction.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...data }),
    })
    if (res.ok) {
      setEditAction(null)
      router.refresh()
    }
  }, [editAction, router])

  /* ── Render message parts ─────────────────────────────────────── */

  function renderAssistantMessage(parts: MessagePart[]) {
    const elements: React.ReactNode[] = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as Record<string, unknown>

      if (part.type === 'text' && part.text) {
        elements.push(
          <div key={`text-${i}`}>
            {renderMarkdown(part.text as string)}
          </div>
        )
      }

      const action = findToolInvocation(part, 'suggestAction')
      if (action) {
        const isLoading = TOOL_LOADING_STATES.includes(action.state)
        const hasOutput = TOOL_OUTPUT_STATES.includes(action.state) && action.output

        if (isLoading) {
          elements.push(
            <div key={`action-loading-${action.toolCallId}`} className="mt-2 w-full rounded-[var(--r-lg)] border border-wil-100 bg-[var(--paper)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-wil-400" />
                <span className="text-xs text-[var(--ink-3)]">Actie wordt voorbereid...</span>
              </div>
            </div>
          )
        }

        if (hasOutput) {
          const data = action.output as SuggestActionResult
          elements.push(
            <ActionSuggestionCard
              key={`action-${action.toolCallId}`}
              data={data}
              added={addedActions.has(action.toolCallId)}
              loading={loadingAction === action.toolCallId}
              onClick={() => handleAddAction(action.toolCallId, data)}
            />
          )
        }
      }
    }

    return elements
  }

  /* ── Error helpers ────────────────────────────────────────────── */

  function getErrorMessage(err: Error | undefined): string {
    if (!err) return 'Er ging iets mis. Probeer het opnieuw.'
    const msg = err.message?.toLowerCase() ?? ''
    if (msg.includes('timeout') || msg.includes('duurde te lang') || msg.includes('504')) {
      return 'Het AI-antwoord duurde te lang. Probeer het opnieuw met een kortere vraag.'
    }
    if (msg.includes('unauthorized') || msg.includes('401')) {
      return 'Je sessie is verlopen. Log opnieuw in.'
    }
    if (msg.includes('api key') || msg.includes('422') || msg.includes('niet geconfigureerd')) {
      return 'De AI is niet geconfigureerd. Controleer de API-sleutel in Admin instellingen.'
    }
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch')) {
      return 'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.'
    }
    return 'Er ging iets mis bij het genereren van een antwoord. Probeer het opnieuw.'
  }

  const handleRetry = useCallback(() => {
    clearError()
    regenerate()
  }, [clearError, regenerate])

  const handleDismissError = useCallback(() => {
    clearError()
  }, [clearError])

  /* ── FAB ──────────────────────────────────────────────────────── */

  if (!isOpen) {
    return (
      <div className="fixed bottom-[calc(var(--bottom-nav-height)+1.5rem)] z-50 md:bottom-6" style={{ right: 'calc(1.5rem + var(--chat-sidebar-width, 0px))' }}>
        <button
          onClick={toggle}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${config.fabBg} text-wil-600 shadow-[var(--s1)] transition-all hover:scale-105 active:scale-95`}
          aria-label={`Open chat met ${config.name}`}
        >
          {config.fabAvatar(36)}
        </button>
        <AiPrivacyIndicator size={12} className="absolute -top-1 -right-1 rounded-full bg-[var(--paper)] p-0.5 shadow-sm" />
      </div>
    )
  }

  // Panel classes differ between floating (default) and pinned (sidebar) mode
  const panelClasses = isPinned
    ? 'fixed top-0 right-0 z-50 flex h-screen w-[420px] flex-col bg-[var(--paper)] shadow-2xl border-l border-[var(--border-ed)]'
    : 'fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col bg-[var(--paper)] shadow-2xl md:bottom-6 md:right-6 md:h-[700px] md:w-[480px] md:rounded-[var(--r-lg)] md:border md:border-[var(--border-ed)]'

  return (
    <>
      {/* Mobile backdrop (not shown when pinned) */}
      {!isPinned && (
        <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={close} />
      )}

      {/* Panel */}
      <div className={panelClasses}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-4 py-3">
          <div className="flex items-center gap-2">
            {config.fabAvatar(32)}
            <div>
              <span className={`text-sm font-semibold ${config.headerColor}`}>{config.name}</span>
              <span className="ml-1 text-xs text-[var(--ink-3)]">{config.subtitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Pin toggle — desktop only */}
            <button
              onClick={togglePin}
              className="hidden touch-target rounded-lg text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)] md:flex md:items-center md:justify-center"
              aria-label={isPinned ? 'Losmaken' : 'Vastzetten'}
              title={isPinned ? 'Losmaken' : 'Vastzetten'}
            >
              {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
            <button onClick={close} className="touch-target rounded-lg text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {config.fabAvatar(64)}
              <p className={`mt-3 text-sm font-medium ${config.accentColor}`}>
                {config.greeting}
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-[var(--ink-3)]">
                {config.greetingDescription}
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            const parts = msg.parts as MessagePart[]

            // For user messages: only show text
            if (isUser) {
              const text = parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('')
              if (!text) return null
              return (
                <div key={msg.id} className="mb-3 flex justify-end">
                  <div className="max-w-[80%] rounded-[var(--r-lg)] px-3 py-2 text-sm leading-relaxed bg-zinc-100 text-zinc-800">
                    {text}
                  </div>
                </div>
              )
            }

            // For assistant messages: render text + tool invocations
            const hasContent =
              parts.some((p) => p.type === 'text' && 'text' in p && p.text) ||
              parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'suggestAction') !== null)

            if (!hasContent) return null

            return (
              <div key={msg.id} className="mb-3 flex justify-start">
                <div className="mr-2 mt-1 shrink-0">
                  <WillDots size={28} state={isStreaming ? 'streaming' : 'idle'} />
                </div>
                <div className={`max-w-[85%] rounded-[var(--r-lg)] px-3 py-2 text-sm leading-relaxed ${config.bubbleBg} text-[var(--ink-2)]`}>
                  {renderAssistantMessage(parts)}
                </div>
              </div>
            )
          })}

          {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
            <div className="mb-3 flex justify-start">
              <div className="mr-2 mt-1 shrink-0">
                <WillDots size={28} state="streaming" />
              </div>
              <div className={`rounded-[var(--r-lg)] px-3 py-2 ${config.bubbleBg}`}>
                <Loader2 className={`h-4 w-4 animate-spin ${config.accentColor}`} />
              </div>
            </div>
          )}

          {/* Error banner with retry */}
          {hasError && (
            <div className="mb-3 rounded-[var(--r-lg)] border border-red-200 bg-red-50 px-3 py-3" data-testid="chat-error-banner">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800">
                    {getErrorMessage(error)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
                      data-testid="chat-retry-button"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Opnieuw proberen
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissError}
                      className="rounded-lg px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-100"
                      data-testid="chat-dismiss-error"
                    >
                      Sluiten
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border-ed)] px-3 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={config.placeholder}
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--border-md)] focus:ring-1 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={submit}
              disabled={isStreaming || !input.trim()}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-lg)] ${config.sendBg} text-white transition-colors ${config.sendHoverBg} disabled:bg-zinc-300 disabled:text-[var(--ink-3)]`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Action edit modal */}
      {editAction && (
        <ActionEditModal
          action={editAction}
          onClose={() => setEditAction(null)}
          onSave={handleModalSave}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  )
}
