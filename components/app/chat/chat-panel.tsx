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
import { X, Send, Loader2, Zap, Check, AlertTriangle, RefreshCw, Pin, PinOff, ShieldCheck, Sparkles, Clock, ThumbsDown } from 'lucide-react'
import type { SuggestRecommendationResult } from '@/lib/ai/tools/suggest-recommendation'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { ChatVisualizationCard } from './chat-visualization-card'
import type { VisualizationOutput } from '@/lib/ai/tools/show-visualization'

/* ── Wft Disclaimer ───────────────────────────────────────────────── */

const WFT_ACCEPTED_KEY = 'trifinity-chat-wft-accepted'

function WftDisclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <ShieldCheck className="h-6 w-6 text-amber-600" />
        </div>

        <h2 className="text-base font-semibold text-[var(--ink)]">
          Belangrijke mededeling
        </h2>

        <div className="mt-4 rounded-[var(--r-lg)] border border-amber-200 bg-amber-50/50 px-4 py-3 text-left text-sm leading-relaxed text-[var(--ink-2)]">
          <p className="font-medium text-amber-800">
            TriFinity geeft geen financieel advies.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-[var(--ink-3)]">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Alle informatie is uitsluitend educatief en informatief bedoeld.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              TriFinity beschikt niet over een Wft-vergunning en verleent geen beleggings-, verzekerings- of ander financieel advies.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Je bent zelf verantwoordelijk voor je financiële beslissingen. Raadpleeg bij twijfel een erkend financieel adviseur.
            </li>
          </ul>
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="mt-5 w-full rounded-[var(--r-lg)] bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:scale-[0.98]"
        >
          Ik begrijp het
        </button>

        <p className="mt-3 text-[10px] text-[var(--ink-4)]">
          Deze melding verschijnt eenmalig.
        </p>
      </div>
    </div>
  )
}

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

/* ── Recommendation suggestion card ────────────────────────────────── */

type RecommendationDecision = 'accepted' | 'postponed' | 'rejected'

function RecommendationSuggestionCard({
  data,
  decision,
  loading,
  onDecision,
}: {
  data: SuggestRecommendationResult
  decision: RecommendationDecision | null
  loading: 'accept' | 'postpone' | 'reject' | null
  onDecision: (action: 'accept' | 'postpone' | 'reject') => void
}) {
  const resolved = decision !== null
  return (
    <div
      className={`mt-2 w-full rounded-[var(--r-lg)] border transition-colors ${
        resolved
          ? decision === 'accepted'
            ? 'border-emerald-200 bg-emerald-50/60'
            : decision === 'postponed'
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-zinc-200 bg-zinc-50/60'
          : 'border-wil-200 bg-[var(--paper)]'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Sparkles
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${resolved ? 'text-[var(--ink-3)]' : 'text-wil-500'}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-wil-700">
              Voorstel van Will
            </div>
            <h4 className="mt-0.5 text-sm font-semibold text-[var(--ink)] leading-snug">
              {data.title}
            </h4>
            <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug">{data.description}</p>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--ink-3)]">
              <span className="font-medium text-wil-600">
                +{data.freedom_days_per_year}{' '}
                {data.freedom_days_per_year === 1 ? 'dag' : 'dagen'} vrijheid/jaar
              </span>
              {data.euro_impact_monthly != null && data.euro_impact_monthly !== 0 && (
                <span>&euro;{Math.abs(data.euro_impact_monthly)}/mnd</span>
              )}
            </div>
            {data.suggested_actions.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--ink-3)]">
                {data.suggested_actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-wil-400" aria-hidden="true" />
                    <span>{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {resolved ? (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)]">
            {decision === 'accepted' && (
              <>
                <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" /> Geaccepteerd —
                staat op je acties
              </>
            )}
            {decision === 'postponed' && (
              <>
                <Clock className="h-3 w-3 text-amber-600" aria-hidden="true" /> Uitgesteld
              </>
            )}
            {decision === 'rejected' && (
              <>
                <ThumbsDown className="h-3 w-3 text-zinc-600" aria-hidden="true" /> Afgewezen
              </>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onDecision('accept')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 rounded-full bg-wil-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
            >
              {loading === 'accept' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3 w-3" aria-hidden="true" />
              )}
              Accepteer
            </button>
            <button
              type="button"
              onClick={() => onDecision('postpone')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              {loading === 'postpone' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Clock className="h-3 w-3" aria-hidden="true" />
              )}
              Uitstel
            </button>
            <button
              type="button"
              onClick={() => onDecision('reject')}
              disabled={loading !== null}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-[var(--paper)] px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading === 'reject' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <ThumbsDown className="h-3 w-3" aria-hidden="true" />
              )}
              Wijs af
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Quick-action chips (empty state) ──────────────────────────────── */

/**
 * Mappen van pathname-prefix naar een context-bewuste chip. Eerste match
 * wint. Pad-matching is bewust permissief (`startsWith`) zodat sub-routes
 * binnen een hefboom (bv. /overzicht/schulden/detail) ook de juiste chip
 * krijgen.
 */
const CONTEXT_CHIPS: Array<{
  prefixes: string[]
  label: string
  prompt: string
}> = [
  {
    prefixes: ['/overzicht/schulden', '/core/debts'],
    label: 'Voorstel voor mijn schulden',
    prompt: 'Geef me één concreet voorstel om mijn schulden sneller of slimmer af te lossen.',
  },
  {
    prefixes: ['/overzicht/bezittingen', '/core/assets'],
    label: 'Voorstel voor mijn bezittingen',
    prompt: 'Geef me één concreet voorstel om mijn bezittingen beter te laten renderen of risico te verlagen.',
  },
  {
    prefixes: ['/overzicht/cashflow', '/core/budgets', '/core/cash'],
    label: 'Voorstel voor mijn cashflow',
    prompt: 'Geef me één concreet voorstel om mijn maandelijkse cashflow te verbeteren.',
  },
  {
    prefixes: ['/overzicht/belasting', '/core/belasting'],
    label: 'Voorstel om belasting te besparen',
    prompt: 'Geef me één concreet voorstel om dit jaar belasting te besparen (Box 1, 2 of 3).',
  },
  {
    prefixes: ['/toekomst', '/horizon'],
    label: 'Versnel mijn vrijheidsdatum',
    prompt: 'Geef me één concreet voorstel om mijn FIRE-datum naar voren te halen.',
  },
]

const GENERIC_PROMPT =
  'Geef me één concreet voorstel op basis van mijn huidige situatie. Begin met de grootste kans.'

function QuickActionChips({
  pathname,
  disabled,
  onPick,
}: {
  pathname: string
  disabled: boolean
  onPick: (prompt: string) => void
}) {
  const contextChip = CONTEXT_CHIPS.find((c) => c.prefixes.some((p) => pathname.startsWith(p)))
  const chips: Array<{ label: string; prompt: string }> = [
    { label: 'Geef me een voorstel', prompt: GENERIC_PROMPT },
  ]
  if (contextChip) {
    chips.push({ label: contextChip.label, prompt: contextChip.prompt })
  }

  return (
    <div className="mt-4 flex max-w-[300px] flex-wrap justify-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onPick(c.prompt)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-wil-200 bg-wil-50 px-3 py-1 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100 disabled:opacity-50"
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

/* ── Main ChatPanel ────────────────────────────────────────────────── */

export function ChatPanel() {
  const { isOpen, close, toggle, openWithMessage, pendingMessage, clearPendingMessage, isPinned, togglePin, autoOpenMessage, setAutoOpenMessage } = useChatContext()
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')

  // Wft disclaimer state — one-time acceptance persisted in localStorage
  const [wftAccepted, setWftAccepted] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const accepted = localStorage.getItem(WFT_ACCEPTED_KEY)
      setWftAccepted(accepted === 'true')
    } catch {
      // localStorage not available — allow through
      setWftAccepted(true)
    }
  }, [])

  const handleWftAccept = useCallback(() => {
    setWftAccepted(true)
    try { localStorage.setItem(WFT_ACCEPTED_KEY, 'true') } catch {}
  }, [])

  // Will is the sole assistant — no domain switching
  const config = WILL_CONFIG

  // Track which suggestions have been added (by toolInvocationId)
  const [addedActions, setAddedActions] = useState<Set<string>>(new Set())
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Voorstel-beslissingen: per toolCallId welk antwoord de gebruiker gaf
  // (accepted/postponed/rejected). Onbesliste voorstellen blijven na
  // chat-sluit pending op /overzicht/tips — daar kan de gebruiker alsnog
  // beslissen. Geen expire-on-close meer.
  const [recDecisions, setRecDecisions] = useState<Map<string, RecommendationDecision>>(new Map())
  const [loadingRec, setLoadingRec] = useState<{ id: string; kind: 'accept' | 'postpone' | 'reject' } | null>(null)

  // Badge-count op de FAB: postponed voorstellen die over hun
  // terugkomdatum zijn. Discoverability voor de herbekijk-flow.
  const [postponedReady, setPostponedReady] = useState(0)

  // Modal state
  const [editAction, setEditAction] = useState<Action | null>(null)

  // Dynamic domain: route-aware and gated by active modules
  const pathname = usePathname()
  const { activeModules } = useModuleAccess()

  const domain = useMemo(() => {
    // Route-based domain selection, gated by active modules.
    // Nieuwe nav-routes (Overzicht/Toekomst/Mijn) routen naar dezelfde
    // AI-domeinen als de legacy-routes:
    //   /toekomst  → horizon  (planning + scenario's)
    //   /overzicht → wil      (briefing + acties + tips)
    //   /mijn      → kern     (profiel + config)
    if (
      (pathname.startsWith('/horizon') || pathname.startsWith('/toekomst')) &&
      activeModules.includes('toekomstplannen')
    ) return 'horizon'
    if (
      (pathname.startsWith('/will') || pathname.startsWith('/overzicht')) &&
      activeModules.includes('inzicht_acties')
    ) return 'wil'
    if (pathname.startsWith('/mijn')) return 'kern'
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

  /* ── Recommendation decision ──────────────────────────────────── */

  const handleRecDecision = useCallback(
    async (
      toolCallId: string,
      recommendationId: string,
      kind: 'accept' | 'postpone' | 'reject',
    ) => {
      if (recDecisions.has(toolCallId)) return
      setLoadingRec({ id: toolCallId, kind })

      // Postponed-voorstellen krijgen een terugkomdatum mee — na 14 dagen
      // mag Will ze opnieuw aandragen (zie recommendation-context sectie
      // "UITGESTELD — KLAAR VOOR HERBEOORDELING"). Zonder timer zou
      // "uitstellen" effectief een soft-delete zijn.
      const POSTPONE_DAYS = 14
      const postponedUntil = kind === 'postpone'
        ? new Date(Date.now() + POSTPONE_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : undefined

      try {
        const res = await fetch(`/api/ai/recommendations/${recommendationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: kind, postponed_until: postponedUntil }),
        })

        if (!res.ok) throw new Error('decision failed')

        const decision: RecommendationDecision =
          kind === 'accept' ? 'accepted' : kind === 'postpone' ? 'postponed' : 'rejected'

        setRecDecisions((prev) => {
          const next = new Map(prev)
          next.set(toolCallId, decision)
          return next
        })
      } catch {
        // silently fail — user can retry
      } finally {
        setLoadingRec(null)
      }
    },
    [recDecisions],
  )

  // Postponed-ready badge: laad bij mount en wanneer de chat sluit (na
  // mogelijke nieuwe postpones). Polling is bewust gemist — een minuutje
  // achterloop maakt voor deze nudge niet uit.
  const fetchPostponedReady = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/recommendations/postponed-ready', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const { count } = await res.json() as { count: number }
      setPostponedReady(count)
    } catch {
      // silently fail — badge is informational
    }
  }, [])

  useEffect(() => {
    void fetchPostponedReady()
  }, [fetchPostponedReady])

  useEffect(() => {
    // Refresh wanneer de chat sluit — gebruiker kan voorstellen uitgesteld
    // hebben in deze sessie of er nieuwe inzichten zijn.
    if (!isOpen) void fetchPostponedReady()
  }, [isOpen, fetchPostponedReady])

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

      // Recommendation suggestion — één-voor-één voorstel met 3 knoppen.
      // DB-rij is al aangemaakt door de tool (server-side); kaart toont
      // alleen UI-state. Pending recommendations worden bij chat-sluit
      // ge-expired.
      const rec = findToolInvocation(part, 'suggestRecommendation')
      if (rec) {
        const isLoading = TOOL_LOADING_STATES.includes(rec.state)
        const hasOutput = TOOL_OUTPUT_STATES.includes(rec.state) && rec.output

        if (isLoading) {
          elements.push(
            <div key={`rec-loading-${rec.toolCallId}`} className="mt-2 w-full rounded-[var(--r-lg)] border border-wil-100 bg-[var(--paper)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-wil-400" />
                <span className="text-xs text-[var(--ink-3)]">Voorstel wordt voorbereid...</span>
              </div>
            </div>
          )
        }

        if (hasOutput) {
          const out = rec.output as SuggestRecommendationResult | { error: true; message: string }
          if ('error' in out && out.error) {
            elements.push(
              <div key={`rec-err-${rec.toolCallId}`} className="mt-2 rounded-[var(--r-lg)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {out.message}
              </div>
            )
          } else {
            const data = out as SuggestRecommendationResult
            elements.push(
              <RecommendationSuggestionCard
                key={`rec-${rec.toolCallId}`}
                data={data}
                decision={recDecisions.get(rec.toolCallId) ?? null}
                loading={loadingRec?.id === rec.toolCallId ? loadingRec.kind : null}
                onDecision={(kind) => handleRecDecision(rec.toolCallId, data.id, kind)}
              />
            )
          }
        }
      }

      // Visualization tool — renders comparison, metric table, or bar chart cards
      const viz = findToolInvocation(part, 'showVisualization')
      if (viz) {
        const isLoading = TOOL_LOADING_STATES.includes(viz.state)
        const hasOutput = TOOL_OUTPUT_STATES.includes(viz.state) && viz.output

        if (isLoading) {
          elements.push(
            <div key={`viz-loading-${viz.toolCallId}`} className="mt-2 w-full rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ink-3)]" />
                <span className="text-xs text-[var(--ink-3)]">Visualisatie wordt opgebouwd...</span>
              </div>
            </div>
          )
        }

        if (hasOutput) {
          elements.push(
            <ChatVisualizationCard
              key={`viz-${viz.toolCallId}`}
              data={viz.output as VisualizationOutput}
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
    const hasPostponedReady = postponedReady > 0
    const fabAria = hasPostponedReady
      ? `Open chat met ${config.name} — ${postponedReady} uitgestelde voorstel${postponedReady === 1 ? '' : 'len'} klaar`
      : `Open chat met ${config.name}`
    const onFabClick = () => {
      if (hasPostponedReady) {
        // Auto-kick-off: open chat met herbekijk-prompt zodat Will
        // direct begint met de openstaande herbeoordelingen.
        openWithMessage(
          'Ik wil opnieuw kijken naar voorstellen die ik eerder heb uitgesteld en waarvan de wachttijd voorbij is. Begin met het belangrijkste.',
        )
      } else {
        toggle()
      }
    }

    return (
      <div className="fixed bottom-[calc(var(--bottom-nav-height)+1.5rem)] z-50 md:bottom-6" style={{ right: 'calc(1.5rem + var(--chat-sidebar-width, 0px))' }}>
        <button
          onClick={onFabClick}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full ${config.fabBg} text-wil-600 shadow-[var(--s1)] transition-all hover:scale-105 active:scale-95`}
          aria-label={fabAria}
        >
          {config.fabAvatar(36)}
          {hasPostponedReady && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-wil-600 px-1.5 text-[11px] font-semibold text-white shadow-md ring-2 ring-[var(--paper)]"
            >
              {postponedReady > 9 ? '9+' : postponedReady}
            </span>
          )}
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

        {/* Wft Disclaimer (first-time only) */}
        {wftAccepted === false && (
          <WftDisclaimer onAccept={handleWftAccept} />
        )}

        {/* Messages */}
        {wftAccepted !== false && (
        <>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              {config.fabAvatar(64)}
              <p className={`mt-3 text-sm font-medium ${config.accentColor}`}>
                {config.greeting}
              </p>
              <p className="mt-1 max-w-[260px] text-xs text-[var(--ink-3)]">
                {config.greetingDescription}
              </p>
              <QuickActionChips
                pathname={pathname}
                disabled={isStreaming}
                onPick={(prompt) => sendMessage({ text: prompt })}
              />
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
              parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'suggestAction') !== null) ||
              parts.some((p) => findToolInvocation(p as Record<string, unknown>, 'showVisualization') !== null)

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
        <div className="border-t border-[var(--border-ed)] px-3 py-3 pb-1" style={{ paddingBottom: undefined }}>
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

        {/* Persistent Wft disclaimer footer */}
        <p
          className="px-3 text-center text-[10px] leading-snug text-[var(--ink-4)]"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          Geen financieel advies — uitsluitend educatief en informatief.
        </p>
        </>
        )}
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
