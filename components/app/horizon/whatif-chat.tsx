'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FinDots } from '@/components/app/fin-dots'
import { LIFE_EVENT_CATALOG } from '@/lib/horizon-data'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'

import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { renderMarkdown, findToolInvocation, TOOL_LOADING_STATES, TOOL_OUTPUT_STATES, type MessagePart } from '@/components/app/chat/markdown-helpers'
import {
  Send, Loader2, Check, Calendar, Target, Clock, Plus, ShieldCheck,
} from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'

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

type SuggestActionResult = {
  title: string
  description: string | null
  freedom_days_impact: number
  euro_impact_monthly: number | null
  priority_score: number
}

export interface WhatIfScenarioContext {
  sliders: {
    inkomensWijziging: number
    werkdagenWijziging: number
    spaarquoteWijziging: number
    rendementWijziging: number
    extraInleg: number
  }
  baselineFireAge: number | null
  scenarioFireAge: number | null
  fireDeltaMonths: number | null
  activeEvents: Array<{
    name: string
    event_type: string
    target_age: number | null
    one_time_cost: number
    monthly_cost_change: number
    monthly_income_change: number
    duration_months: number
  }>
}

interface WhatIfChatProps {
  onAddEvent: (event: WhatIfEvent) => void
  scenarioContext?: WhatIfScenarioContext
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
            <span>{<MaskedAmount value={data.one_time_cost} tone="horizon" />} eenmalig</span>
          )}
          {data.monthly_cost_change !== 0 && (
            <span>{<MaskedAmount value={data.monthly_cost_change} tone="horizon" />}/mnd</span>
          )}
          {data.monthly_income_change !== 0 && (
            <span>{data.monthly_income_change > 0 ? '+' : ''}{<MaskedAmount value={data.monthly_income_change} tone="horizon" />}/mnd inkomen</span>
          )}
          {data.target_age != null && (
            <span>leeftijd {data.target_age}</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Action Suggestion Card (planner mode) ──────────────────────────────────

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
          : 'border-horizon-200 bg-horizon-50/40 hover:border-horizon-400 hover:shadow-[var(--s0)] active:scale-[0.98]'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Target className={`h-3.5 w-3.5 ${added ? 'text-emerald-500' : 'text-horizon-600'}`} />
            <span className="text-xs font-semibold text-[var(--ink)]">{data.title}</span>
          </div>
          {added ? (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Toegevoegd
            </span>
          ) : loading ? (
            <span className="flex items-center gap-0.5 rounded-full bg-horizon-100 px-1.5 py-0.5 text-xs font-medium text-horizon-700">
              <Loader2 className="h-3 w-3 animate-spin" /> Toevoegen...
            </span>
          ) : (
            <span className="flex items-center gap-0.5 rounded-full bg-horizon-100 px-1.5 py-0.5 text-xs font-medium text-horizon-700">
              <Plus className="h-3 w-3" /> Voeg toe aan Overzicht
            </span>
          )}
        </div>
        {data.description && (
          <p className="mt-1 text-xs leading-snug text-[var(--ink-3)]">{data.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {data.freedom_days_impact > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {data.freedom_days_impact} vrijheidsdagen
            </span>
          )}
          {data.euro_impact_monthly != null && data.euro_impact_monthly !== 0 && (
            <span>{<MaskedAmount value={data.euro_impact_monthly} tone="horizon" />}/mnd</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── WhatIfChat ──────────────────────────────────────────────────────────────

export function WhatIfChat({ onAddEvent, scenarioContext }: WhatIfChatProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [addedEvents, setAddedEvents] = useState<Set<string>>(new Set())
  const [addedActions, setAddedActions] = useState<Set<string>>(new Set())
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set())
  const [userHasScrolled, setUserHasScrolled] = useState(false)

  // Serialize scenarioContext to a stable string for memoization
  const scenarioJSON = useMemo(() => scenarioContext ? JSON.stringify(scenarioContext) : '', [scenarioContext])

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/ai/chat',
      body: {
        domain: 'wil',
        context: 'whatif',
        ...(scenarioJSON ? { scenarioContext: JSON.parse(scenarioJSON) } : {}),
      },
    }),
    [scenarioJSON],
  )

  const { messages, sendMessage, status } = useChat({
    id: 'whatif-chat',
    transport,
  })

  const isStreaming = status === 'streaming' || status === 'submitted'

  // ── Waar mag dit gesprek draaien? ─────────────────────────────────────────
  //
  // De WhatIfChat houdt bewust zijn eigen cloud-transport (architect-bevestigd:
  // valt buiten de lokale overname). Consistent met "lokaal gekozen = geen
  // cloud-fallback" sturen we dan GEEN scenario naar de cloud: het oppervlak
  // wordt eerlijk geblokkeerd (invoer uit + melding) i.p.v. stil te falen op een
  // server-403.
  //
  // Dit las eerder `usePrivacyMode()` — maar dat is per eigen documentatie een
  // COSMETISCHE, per-proces gecachte singleton voor labels, en hij kent alleen de
  // hoofdschakelaar. Een override op de groep 'gesprek' deed hier dus niets, en
  // een nog-lopende lezing (null) liet de invoer gewoon open staan: precies het
  // venster waarin er alsnog een cloud-aanroep kon vertrekken.
  //
  // FAIL-CLOSED via `canUseCloud` — nooit een eigen vergelijking op `status`:
  // alleen een expliciet cloud-groen licht opent de invoer. 'resolving',
  // 'lokaal' en 'blocked' blokkeren alle drie.
  const exec = useExecutionMode('gesprek')
  const canSend = exec.canUseCloud

  const blockNotice: string | null = canSend
    ? null
    : exec.status === 'lokaal'
      ? 'Je gesprekken met Fin draaien op je eigen toestel. Wat-als bespreken kan daar nog niet — zet de groep “Gesprek met Fin” op /mijn/privacy op de cloud om je scenario met Fin te bespreken.'
      : exec.status === 'blocked'
        ? (exec.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.')
        : 'Even kijken waar dit gesprek mag draaien…'

  // Detect if last AI message used suggestAction → planner mode active
  const isPlannerMode = useMemo(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastAssistant) return false
    const parts = lastAssistant.parts as MessagePart[]
    return parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'suggestAction') !== null)
  }, [messages])

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
    setUserHasScrolled(prev => {
      const next = !atBottom
      return prev === next ? prev : next
    })
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
    if (!text || isStreaming || !canSend) return
    setInput('')
    sendMessage({ text })
  }, [input, isStreaming, canSend, sendMessage])

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

  // Handle adding an action to Overzicht from AI suggestion
  const handleAddAction = useCallback(async (toolCallId: string, data: SuggestActionResult) => {
    if (addedActions.has(toolCallId) || loadingActions.has(toolCallId)) return

    setLoadingActions(prev => new Set(prev).add(toolCallId))

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

      if (res.ok) {
        setAddedActions(prev => new Set(prev).add(toolCallId))
      }
    } catch {
      // Silently fail — user can retry by clicking again
    } finally {
      setLoadingActions(prev => {
        const next = new Set(prev)
        next.delete(toolCallId)
        return next
      })
    }
  }, [addedActions, loadingActions])

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

      const lifeEvent = findToolInvocation(part, 'suggestLifeEvent')
      if (lifeEvent) {
        const isLoading = TOOL_LOADING_STATES.includes(lifeEvent.state)
        const hasOutput = TOOL_OUTPUT_STATES.includes(lifeEvent.state) && lifeEvent.output

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

      // ── suggestAction (planner mode) ──
      const action = findToolInvocation(part, 'suggestAction')
      if (action) {
        const isLoading = TOOL_LOADING_STATES.includes(action.state)
        const hasOutput = TOOL_OUTPUT_STATES.includes(action.state) && action.output

        if (isLoading) {
          elements.push(
            <div key={`action-loading-${action.toolCallId}`} className="mt-2 w-full rounded-[var(--r-lg)] border border-horizon-100 bg-[var(--paper)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-horizon-400" />
                <span className="text-xs text-[var(--ink-3)]">Actie wordt voorbereid...</span>
              </div>
            </div>
          )
        }

        if (hasOutput) {
          elements.push(
            <ActionSuggestionCard
              key={`action-${action.toolCallId}`}
              data={action.output as SuggestActionResult}
              added={addedActions.has(action.toolCallId)}
              loading={loadingActions.has(action.toolCallId)}
              onClick={() => handleAddAction(action.toolCallId, action.output as SuggestActionResult)}
            />
          )
        }
      }
    }

    return elements
  }

  return (
    <div className="card-editorial overflow-hidden">
      {/* 3px horizon-accent top border */}
      <div className="h-[3px] bg-horizon-500" />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-4 py-2.5">
        <FinDots size={28} />
        <div>
          <span className="text-sm font-semibold text-horizon-700">Fin</span>
          <span className={`ml-1 text-[11px] transition-colors ${isPlannerMode ? 'text-horizon-700 font-medium' : 'text-[var(--ink-3)]'}`}>
            {isPlannerMode ? 'Planner' : 'Droomgids'}
          </span>
        </div>
      </div>

      {/* Fail-closed: zonder cloud-groen licht gaat wat-als NIET naar de cloud —
          eerlijk geblokkeerd i.p.v. een stille cloud-belofte. */}
      {blockNotice && (
        <div className="border-b border-[var(--border-ed)] bg-horizon-50/60 px-4 py-2.5" role="status">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-horizon-600" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">{blockNotice}</p>
          </div>
        </div>
      )}

      {/* Messages area — compact when empty, grows with messages */}
      <div ref={scrollAreaRef} onScroll={handleScroll} className={`overflow-y-auto px-4 py-3 ${messages.length === 0 ? 'h-[120px]' : 'max-h-[320px]'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <FinDots size={36} />
            <p className="mt-2 font-[family-name:var(--font-source-serif)] text-sm italic text-horizon-700">
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
            parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'suggestLifeEvent') !== null) ||
            parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'suggestAction') !== null)

          if (!hasContent) return null

          return (
            <div key={msg.id} className="mb-3 flex justify-start">
              <div className="mr-2 mt-1 shrink-0">
                <FinDots size={24} state={isStreaming ? 'streaming' : 'idle'} />
              </div>
              <div className="max-w-[85%] rounded-[var(--r-lg)] bg-horizon-50 px-3 py-2 text-sm leading-relaxed text-[var(--ink-2)]">
                {renderAssistantMessage(parts)}
              </div>
            </div>
          )
        })}

        {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="mb-3 flex justify-start">
            <div className="mr-2 mt-1 shrink-0">
              <FinDots size={24} state="streaming" />
            </div>
            <div className="rounded-[var(--r-lg)] bg-horizon-50 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-horizon-600" />
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
            disabled={!canSend}
            placeholder={canSend ? 'Wat zijn je dromen?' : 'Niet beschikbaar'}
            rows={1}
            className="max-h-20 flex-1 resize-none rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-sm outline-none placeholder:text-[var(--ink-3)] focus:border-[var(--border-md)] focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={isStreaming || !input.trim() || !canSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-lg)] bg-horizon-600 text-white transition-colors hover:bg-horizon-700 disabled:bg-zinc-300 disabled:text-[var(--ink-3)]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
