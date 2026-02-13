'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRouter } from 'next/navigation'
import { useChatContext } from './chat-provider'
import { FinnAvatar } from '@/components/app/avatars'
import { ActionEditModal } from '@/components/app/action-edit-modal'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { X, Send, Loader2, Zap, Check } from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────────── */

type SuggestActionResult = {
  title: string
  description: string | null
  freedom_days_impact: number
  euro_impact_monthly: number | null
  priority_score: number
}

// AI SDK v6 dynamic tool invocation part
type DynamicToolPart = {
  type: 'dynamic-tool'
  toolName: string
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
}

type MessagePart =
  | { type: 'text'; text: string }
  | DynamicToolPart
  | { type: string; [key: string]: unknown }

/* ── Markdown helpers ──────────────────────────────────────────────── */

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: { content: string; ordered: boolean }[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    const isOrdered = listItems[0].ordered
    const Tag = isOrdered ? 'ol' : 'ul'
    const listClass = isOrdered ? 'my-1 ml-4 list-decimal space-y-0.5' : 'my-1 ml-4 list-disc space-y-0.5'
    elements.push(
      <Tag key={`list-${elements.length}`} className={listClass}>
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item.content)}</li>
        ))}
      </Tag>
    )
    listItems = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (/^---+$/.test(line.trim())) { flushList(); continue }

    const headerMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headerMatch) {
      flushList()
      elements.push(
        <p key={`h-${i}`} className="mb-1 mt-2 font-semibold first:mt-0">
          {renderInline(headerMatch[1])}
        </p>
      )
      continue
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)/)
    if (ulMatch) { listItems.push({ content: ulMatch[1], ordered: false }); continue }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)/)
    if (olMatch) { listItems.push({ content: olMatch[1], ordered: true }); continue }

    flushList()

    if (line.trim() === '') {
      elements.push(<br key={`br-${i}`} />)
    } else {
      elements.push(
        <p key={`p-${i}`} className="mb-1 last:mb-0">
          {renderInline(line)}
        </p>
      )
    }
  }

  flushList()
  return elements
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(<strong key={match.index}>{match[1]}</strong>)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : [text]
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
      className={`mt-2 w-full rounded-xl border text-left transition-all ${
        added
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-teal-200 bg-white hover:border-teal-400 hover:shadow-sm active:scale-[0.98]'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className={`h-3.5 w-3.5 shrink-0 ${added ? 'text-emerald-500' : 'text-teal-500'}`} />
            <span className="text-xs font-semibold text-zinc-800">{data.title}</span>
          </div>
          {added ? (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Toegevoegd
            </span>
          ) : loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" />
          ) : (
            <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
              + Toevoegen
            </span>
          )}
        </div>
        {data.description && (
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">{data.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="font-medium text-teal-600">
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
  const { isOpen, close, toggle } = useChatContext()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  // Track which suggestions have been added (by toolInvocationId)
  const [addedActions, setAddedActions] = useState<Set<string>>(new Set())
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Modal state
  const [editAction, setEditAction] = useState<Action | null>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/ai/chat', body: { domain: 'wil' } }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    id: 'chat-will',
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

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

  function findSuggestAction(part: Record<string, unknown>): {
    toolCallId: string
    state: string
    output?: unknown
  } | null {
    // AI SDK v6: type 'dynamic-tool' with toolName
    if (part.type === 'dynamic-tool' && part.toolName === 'suggestAction') {
      return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
    }
    // AI SDK v6: typed tool part 'tool-suggestAction'
    if (part.type === 'tool-suggestAction') {
      return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
    }
    // AI SDK v4/v5 compat: type 'tool-invocation'
    if (part.type === 'tool-invocation') {
      const p = part as Record<string, unknown>
      // Flat structure (v4)
      if (p.toolName === 'suggestAction') {
        return { toolCallId: (p.toolInvocationId ?? p.toolCallId) as string, state: p.state as string, output: p.result ?? p.output }
      }
      // Nested structure (v5)
      const inv = p.toolInvocation as Record<string, unknown> | undefined
      if (inv?.toolName === 'suggestAction') {
        return { toolCallId: (inv.toolCallId ?? inv.toolInvocationId) as string, state: inv.state as string, output: inv.result ?? inv.output }
      }
    }
    return null
  }

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

      const action = findSuggestAction(part)
      if (action) {
        const isLoading = ['input-streaming', 'input-available', 'call', 'partial-call'].includes(action.state)
        const hasOutput = ['output-available', 'result'].includes(action.state) && action.output

        if (isLoading) {
          elements.push(
            <div key={`action-loading-${action.toolCallId}`} className="mt-2 w-full rounded-xl border border-teal-100 bg-white px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-400" />
                <span className="text-xs text-zinc-400">Actie wordt voorbereid...</span>
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

  /* ── FAB ──────────────────────────────────────────────────────── */

  if (!isOpen) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Open chat"
      >
        <FinnAvatar size={36} />
      </button>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={close} />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col bg-white shadow-2xl md:bottom-6 md:right-6 md:h-[600px] md:w-[400px] md:rounded-2xl md:border md:border-zinc-200">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <FinnAvatar size={32} />
            <div>
              <span className="text-sm font-semibold text-teal-600">Will</span>
              <span className="ml-1 text-xs text-zinc-400">Financieel assistent</span>
            </div>
          </div>
          <button onClick={close} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FinnAvatar size={64} />
              <p className="mt-3 text-sm font-medium text-teal-600">
                Hoi, ik ben Will
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-zinc-400">
                Ik help je met al je financiële vragen — van budgetten tot FIRE-projecties.
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
                  <div className="max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-zinc-100 text-zinc-800">
                    {text}
                  </div>
                </div>
              )
            }

            // For assistant messages: render text + tool invocations
            const hasContent =
              parts.some((p) => p.type === 'text' && 'text' in p && p.text) ||
              parts.some((p) => findSuggestAction(p as Record<string, unknown>) !== null)

            if (!hasContent) return null

            return (
              <div key={msg.id} className="mb-3 flex justify-start">
                <div className="mr-2 mt-1 shrink-0">
                  <FinnAvatar size={24} />
                </div>
                <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed bg-teal-50 text-zinc-700">
                  {renderAssistantMessage(parts)}
                </div>
              </div>
            )
          })}

          {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
            <div className="mb-3 flex justify-start">
              <div className="mr-2 mt-1 shrink-0">
                <FinnAvatar size={24} />
              </div>
              <div className="rounded-2xl px-3 py-2 bg-teal-50">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-100 px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Vraag Will iets..."
              rows={1}
              className="max-h-24 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={submit}
              disabled={isStreaming || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white transition-colors hover:bg-teal-700 disabled:bg-zinc-300 disabled:text-zinc-500"
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
