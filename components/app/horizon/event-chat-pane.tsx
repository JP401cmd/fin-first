'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Send, Loader2, Sparkles, ArrowRight, Edit3 } from 'lucide-react'
import { LIFE_EVENT_CATALOG, type LifeEvent } from '@/lib/horizon-data'
import { EVENT_ICONS } from './log-timeline'
import {
  renderMarkdown,
  findToolInvocation,
  TOOL_LOADING_STATES,
  TOOL_OUTPUT_STATES,
  type MessagePart,
} from '@/components/app/chat/markdown-helpers'
import { MaskedAmount } from '@/components/app/masked-amount'

/**
 * Fin-chat binnen de levensgebeurtenis-pane. Hergebruikt `/api/ai/chat` met
 * `context: 'whatif'` zodat de bestaande WHATIF_PROMPT (droomgids → planner)
 * actief wordt en de `suggestLifeEvent` tool kan gebruiken.
 *
 * Tool-output wordt gerenderd als kaart met "Open in editor"-actie die de
 * payload doorgeeft aan de pane-wrapper, die switcht naar edit-mode met
 * voor-ingevulde drie blokken.
 */

export interface SuggestedLifeEventPayload {
  event_type: string
  name: string
  target_age: number | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  explanation: string
}

interface Props {
  /** Bestaande events — meegegeven aan de prompt om dubbele suggesties te voorkomen. */
  events: LifeEvent[]
  /** Geroepen wanneer gebruiker een gesuggereerd event wil openen in de editor. */
  onAcceptSuggestion: (payload: SuggestedLifeEventPayload) => void
}

const STARTER_QUESTIONS: { label: string; prompt: string }[] = [
  { label: 'Een grote reis', prompt: 'Ik droom over een grote reis. Help me uitwerken wat het kost.' },
  { label: 'Een sabbatical', prompt: 'Ik denk aan een sabbatical. Wil je me helpen erover na te denken?' },
  { label: 'Een huis kopen', prompt: 'Ik wil een huis kopen. Hoe pakken we dit aan?' },
  { label: 'Iets anders', prompt: 'Help me na te denken over een grote levenskeuze die op de planning staat.' },
]

export function EventChatPane({ events, onAcceptSuggestion }: Props) {
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set())

  // Compact-versie van scenarioContext: alleen events + lege sliders.
  // Hergebruikt de bestaande shape die /api/ai/chat al accepteert.
  const scenarioContext = useMemo(() => ({
    sliders: {
      inkomensWijziging: 0,
      werkdagenWijziging: 0,
      spaarquoteWijziging: 0,
      rendementWijziging: 0,
      extraInleg: 0,
    },
    baselineFireAge: null,
    scenarioFireAge: null,
    fireDeltaMonths: null,
    activeEvents: events.map(e => ({
      name: e.name,
      event_type: e.event_type,
      target_age: e.target_age,
      one_time_cost: e.one_time_cost,
      monthly_cost_change: e.monthly_cost_change,
      monthly_income_change: e.monthly_income_change,
      duration_months: e.duration_months,
    })),
  }), [events])

  const scenarioJSON = useMemo(() => JSON.stringify(scenarioContext), [scenarioContext])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        body: {
          domain: 'wil',
          context: 'whatif',
          scenarioContext: JSON.parse(scenarioJSON),
        },
      }),
    [scenarioJSON],
  )

  const { messages, sendMessage, status } = useChat({
    id: 'event-builder-chat',
    transport,
  })
  const isStreaming = status === 'streaming' || status === 'submitted'

  // Auto-scroll alleen wanneer gebruiker dichtbij bottom is.
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = useCallback(
    (text?: string) => {
      const value = (text ?? input).trim()
      if (!value || isStreaming) return
      sendMessage({ text: value })
      setInput('')
      inputRef.current?.focus()
    },
    [input, isStreaming, sendMessage],
  )

  function handleAccept(payload: SuggestedLifeEventPayload, key: string) {
    setAcceptedKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    onAcceptSuggestion(payload)
  }

  return (
    <div className="flex flex-col h-full -mx-4 sm:-mx-6 lg:-mx-2">
      {/* Welkom + starter-vragen wanneer chat nog leeg is */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-4">
        {messages.length === 0 && (
          <div className="py-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
              <Sparkles className="h-3 w-3" aria-hidden />
              <span>samen brainstormen</span>
            </div>
            <h3
              className="mt-2 text-2xl font-black tracking-[-0.02em]"
              style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
            >
              Wat heb je in gedachten?
            </h3>
            <p
              className="mt-3 italic text-sm text-[var(--ink-2)] leading-snug max-w-prose"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Vertel me waar je over droomt of nadenkt. Ik help je het concreet maken
              en zet er een voorstel klaar dat je daarna nog kunt bewerken.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTER_QUESTIONS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => submit(s.prompt)}
                  className="px-3 py-1.5 rounded-full border border-[var(--border-md)] text-sm text-[var(--ink-2)] hover:border-[var(--module-active-700)] hover:bg-[var(--module-active-50)] transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => {
          const parts = (message.parts ?? []) as MessagePart[]
          return (
            <div
              key={message.id}
              className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {parts.map((part, idx) => {
                // Tool-call voor suggestLifeEvent
                const inv = findToolInvocation(part as Record<string, unknown>, 'suggestLifeEvent')
                if (inv) {
                  if (TOOL_LOADING_STATES.includes(inv.state)) {
                    return (
                      <div
                        key={idx}
                        className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-3)]"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Voorstel klaarzetten…</span>
                      </div>
                    )
                  }
                  if (TOOL_OUTPUT_STATES.includes(inv.state) && inv.output) {
                    const data = inv.output as SuggestedLifeEventPayload
                    const key = inv.toolCallId
                    return (
                      <SuggestedEventCard
                        key={key}
                        data={data}
                        accepted={acceptedKeys.has(key)}
                        onAccept={() => handleAccept(data, key)}
                      />
                    )
                  }
                }
                // Reguliere tekst-bubble
                if ('text' in part && typeof (part as { text?: string }).text === 'string') {
                  const text = (part as { text: string }).text
                  if (!text) return null
                  return (
                    <div
                      key={idx}
                      className={`max-w-[88%] rounded-[var(--r-lg)] px-3 py-2 text-sm leading-relaxed ${
                        message.role === 'user'
                          ? 'bg-[var(--ink)] text-[var(--paper)]'
                          : 'bg-[var(--subtle)] text-[var(--ink)]'
                      }`}
                      style={
                        message.role === 'assistant'
                          ? { fontFamily: 'var(--font-source-serif, Georgia, serif)' }
                          : undefined
                      }
                    >
                      {message.role === 'assistant' ? renderMarkdown(text) : text}
                    </div>
                  )
                }
                return null
              })}
            </div>
          )
        })}

        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Fin denkt na…</span>
          </div>
        )}
      </div>

      {/* Sticky input onderin de pane (uitzondering op "alle knoppen onderin"-regel
          — chat-input is een input, geen action-knop). paddingBottom houdt de
          zwevende mobiele nav-pill (FloatingNavButton) vrij; var = 0 boven 768px. */}
      <div
        className="border-t border-[var(--border-ed)] bg-[var(--paper)] px-4 sm:px-6 py-3 sticky bottom-0"
        style={{ paddingBottom: 'calc(0.75rem + var(--mobile-nav-clearance))' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Vertel Fin wat je in gedachten hebt…"
            rows={1}
            className="flex-1 resize-none px-3 py-2 border border-[var(--border-md)] rounded-lg bg-[var(--paper)] text-sm focus:border-[var(--module-active-700)] focus:outline-none min-h-[40px] max-h-[120px]"
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--ink)] text-[var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Versturen"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Suggestion-card ──────────────────────────────────────────────

function SuggestedEventCard({
  data,
  accepted,
  onAccept,
}: {
  data: SuggestedLifeEventPayload
  accepted: boolean
  onAccept: () => void
}) {
  const catalog = LIFE_EVENT_CATALOG[data.event_type]
  const iconKey = catalog?.icon ?? 'Calendar'
  const icon = EVENT_ICONS[iconKey] ?? null

  return (
    <div
      className={`mt-2 w-full max-w-[88%] rounded-[var(--r-lg)] border-2 transition-all ${
        accepted
          ? 'border-emerald-300 bg-emerald-50/40'
          : 'border-[var(--module-active-700)] bg-[var(--module-active-50)]'
      }`}
    >
      <div className="px-3 py-3">
        <div className="flex items-start gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
              accepted ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--paper)] text-[var(--module-active-700)]'
            }`}
          >
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)]">
              ✨ Voorstel
            </div>
            <div className="text-sm font-semibold text-[var(--ink)] leading-tight mt-0.5">
              {data.name}
            </div>
          </div>
        </div>

        <p
          className="mt-2 italic text-xs leading-relaxed text-[var(--ink-2)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {data.explanation}
        </p>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
          {data.one_time_cost !== 0 && (
            <span>
              {data.one_time_cost > 0 ? '−' : '+'}
              <MaskedAmount value={Math.abs(data.one_time_cost)} tone="horizon" />
              <span className="text-[var(--ink-4)] ml-1">eenmalig</span>
            </span>
          )}
          {data.monthly_cost_change !== 0 && (
            <span>
              −<MaskedAmount value={data.monthly_cost_change} tone="horizon" />
              <span className="text-[var(--ink-4)] ml-1">/mnd</span>
            </span>
          )}
          {data.monthly_income_change !== 0 && (
            <span>
              {data.monthly_income_change > 0 ? '+' : '−'}
              <MaskedAmount value={Math.abs(data.monthly_income_change)} tone="horizon" />
              <span className="text-[var(--ink-4)] ml-1">/mnd inkomen</span>
            </span>
          )}
          {data.duration_months > 0 && (
            <span>
              {Math.round(data.duration_months / 12)}
              <span className="text-[var(--ink-4)] ml-1">jr</span>
            </span>
          )}
          {data.target_age != null && (
            <span>
              op {data.target_age}
              <span className="text-[var(--ink-4)] ml-1">jaar</span>
            </span>
          )}
        </div>

        <div className="mt-3 pt-2 border-t border-dashed border-[var(--border-ed)]">
          {accepted ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Edit3 className="h-3 w-3" /> Geopend in editor
            </span>
          ) : (
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--ink)] text-[var(--paper)] text-xs font-semibold hover:opacity-90"
            >
              Open in editor
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
