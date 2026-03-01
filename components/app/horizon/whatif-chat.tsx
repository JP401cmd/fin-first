'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FinnAvatar } from '@/components/app/avatars'
import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { formatCurrency } from '@/lib/format'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import {
  Send, Loader2, Check, Calendar,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type SuggestLifeEventResult = {
  event_type: string
  name: string
  target_age: number | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  explanation: string
}

type MessagePart =
  | { type: 'text'; text: string }
  | { type: string; [key: string]: unknown }

interface WhatIfChatProps {
  onAddEvent: (event: WhatIfEvent) => void
  currentAge: number | null
}

// ── Markdown helpers (subset from chat-panel) ───────────────────────────────

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

// ── Life Event Suggestion Card ──────────────────────────────────────────────

function LifeEventSuggestionCard({
  data,
  added,
  onClick,
}: {
  data: SuggestLifeEventResult
  added: boolean
  onClick: () => void
}) {
  const catalog = LIFE_EVENT_CATALOG[data.event_type]
  const iconKey = catalog?.icon ?? 'Calendar'
  const icon = EVENT_ICONS[iconKey] ?? <Calendar className="h-4 w-4" />

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={added}
      className={`mt-2 w-full rounded-[var(--r-lg)] border text-left transition-all ${
        added
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-horizon-200 bg-[var(--paper)] hover:border-horizon-400 hover:shadow-[var(--s0)] active:scale-[0.98]'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={added ? 'text-emerald-500' : 'text-horizon-600'}>{icon}</span>
            <span className="text-xs font-semibold text-[var(--ink)]">{data.name}</span>
          </div>
          {added ? (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Toegevoegd
            </span>
          ) : (
            <span className="rounded-full bg-horizon-100 px-1.5 py-0.5 text-xs font-medium text-horizon-700">
              + Toevoegen
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">{data.explanation}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {data.one_time_cost > 0 && (
            <span>{formatCurrency(data.one_time_cost)} eenmalig</span>
          )}
          {data.monthly_cost_change !== 0 && (
            <span>{formatCurrency(data.monthly_cost_change)}/mnd</span>
          )}
          {data.monthly_income_change !== 0 && (
            <span>{data.monthly_income_change > 0 ? '+' : ''}{formatCurrency(data.monthly_income_change)}/mnd inkomen</span>
          )}
          {data.target_age != null && (
            <span>leeftijd {data.target_age}</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── WhatIfChat ──────────────────────────────────────────────────────────────

export function WhatIfChat({ onAddEvent, currentAge }: WhatIfChatProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [addedEvents, setAddedEvents] = useState<Set<string>>(new Set())
  const [userHasScrolled, setUserHasScrolled] = useState(false)

  // Suppress unused var — currentAge is available for future use in prompts
  void currentAge

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/ai/chat', body: { domain: 'wil', context: 'whatif' } }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    id: 'whatif-chat',
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  // Only auto-scroll within the chat container, and only when user hasn't scrolled up
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el || userHasScrolled) return
    el.scrollTop = el.scrollHeight
  }, [messages, userHasScrolled])

  // Detect manual scroll: if user scrolls away from bottom, stop auto-scrolling
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setUserHasScrolled(!atBottom)
  }, [])

  // Reset userHasScrolled when user sends a message
  const prevMsgCount = useRef(messages.length)
  useEffect(() => {
    if (messages.length > prevMsgCount.current && messages[messages.length - 1]?.role === 'user') {
      setUserHasScrolled(false)
    }
    prevMsgCount.current = messages.length
  }, [messages])

  const submit = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage({ text })
  }, [input, isStreaming, sendMessage])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Handle adding a life event from AI suggestion
  const handleAddLifeEvent = useCallback((toolCallId: string, data: SuggestLifeEventResult) => {
    if (addedEvents.has(toolCallId)) return

    const catalog = LIFE_EVENT_CATALOG[data.event_type]
    const newEvent: WhatIfEvent = {
      id: `whatif-ai-${data.event_type}-${Date.now()}`,
      name: data.name,
      event_type: data.event_type,
      target_age: data.target_age,
      target_date: null,
      one_time_cost: data.one_time_cost,
      monthly_cost_change: data.monthly_cost_change,
      monthly_income_change: data.monthly_income_change,
      duration_months: data.duration_months,
      icon: catalog?.icon ?? 'Calendar',
      is_active: true,
      sort_order: 999,
      is_indexed: true,
    }

    onAddEvent(newEvent)
    setAddedEvents(prev => new Set(prev).add(toolCallId))
  }, [addedEvents, onAddEvent])

  // Find suggestLifeEvent tool invocation in message parts
  function findSuggestLifeEvent(part: Record<string, unknown>): {
    toolCallId: string
    state: string
    output?: unknown
  } | null {
    if (part.type === 'dynamic-tool' && part.toolName === 'suggestLifeEvent') {
      return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
    }
    if (part.type === 'tool-suggestLifeEvent') {
      return { toolCallId: part.toolCallId as string, state: part.state as string, output: part.output }
    }
    if (part.type === 'tool-invocation') {
      const p = part as Record<string, unknown>
      if (p.toolName === 'suggestLifeEvent') {
        return { toolCallId: (p.toolInvocationId ?? p.toolCallId) as string, state: p.state as string, output: p.result ?? p.output }
      }
      const inv = p.toolInvocation as Record<string, unknown> | undefined
      if (inv?.toolName === 'suggestLifeEvent') {
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

      const lifeEvent = findSuggestLifeEvent(part)
      if (lifeEvent) {
        const isLoading = ['input-streaming', 'input-available', 'call', 'partial-call'].includes(lifeEvent.state)
        const hasOutput = ['output-available', 'result'].includes(lifeEvent.state) && lifeEvent.output

        if (isLoading) {
          elements.push(
            <div key={`event-loading-${lifeEvent.toolCallId}`} className="mt-2 w-full rounded-[var(--r-lg)] border border-horizon-100 bg-[var(--paper)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-horizon-400" />
                <span className="text-xs text-[var(--ink-3)]">Levensgebeurtenis wordt voorbereid...</span>
              </div>
            </div>
          )
        }

        if (hasOutput) {
          const data = lifeEvent.output as SuggestLifeEventResult
          elements.push(
            <LifeEventSuggestionCard
              key={`event-${lifeEvent.toolCallId}`}
              data={data}
              added={addedEvents.has(lifeEvent.toolCallId)}
              onClick={() => handleAddLifeEvent(lifeEvent.toolCallId, data)}
            />
          )
        }
      }
    }

    return elements
  }

  return (
    <div className="card-editorial overflow-hidden">
      {/* 3px wil-accent top border */}
      <div className="h-[3px] bg-wil-500" />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-4 py-2.5">
        <FinnAvatar size={28} />
        <div>
          <span className="text-sm font-semibold text-wil-600">Will</span>
          <span className="ml-1 text-[11px] text-[var(--ink-3)]">Droomgids</span>
        </div>
      </div>

      {/* Messages area — compact when empty, grows with messages */}
      <div ref={scrollAreaRef} onScroll={handleScroll} className={`overflow-y-auto px-4 py-3 ${messages.length === 0 ? 'h-[120px]' : 'max-h-[320px]'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <FinnAvatar size={36} />
            <p className="mt-2 font-[family-name:var(--font-source-serif)] text-sm italic text-wil-600">
              Stel je voor dat alles mogelijk is...
            </p>
            <p className="mt-1 max-w-[260px] text-xs text-[var(--ink-3)]">
              Vertel me over je dromen — alles mag hier.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          const parts = msg.parts as MessagePart[]

          if (isUser) {
            const text = parts
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('')
            if (!text) return null
            return (
              <div key={msg.id} className="mb-3 flex justify-end">
                <div className="max-w-[80%] rounded-[var(--r-lg)] bg-zinc-100 px-3 py-2 text-sm leading-relaxed text-zinc-800">
                  {text}
                </div>
              </div>
            )
          }

          const hasContent =
            parts.some((p) => p.type === 'text' && 'text' in p && p.text) ||
            parts.some((p) => findSuggestLifeEvent(p as Record<string, unknown>) !== null)

          if (!hasContent) return null

          return (
            <div key={msg.id} className="mb-3 flex justify-start">
              <div className="mr-2 mt-1 shrink-0">
                <FinnAvatar size={24} />
              </div>
              <div className="max-w-[85%] rounded-[var(--r-lg)] bg-wil-50 px-3 py-2 text-sm leading-relaxed text-[var(--ink-2)]">
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
            <div className="rounded-[var(--r-lg)] bg-wil-50 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-wil-600" />
            </div>
          </div>
        )}

      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-ed)] px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Wat zijn je dromen?"
            rows={1}
            className="max-h-20 flex-1 resize-none rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--border-md)] focus:ring-1 focus:ring-zinc-200"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isStreaming || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-lg)] bg-wil-600 text-white transition-colors hover:bg-wil-700 disabled:bg-zinc-300 disabled:text-[var(--ink-3)]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
