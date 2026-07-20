'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Cpu, Send, RotateCcw, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
import { checkLocalAiCapability } from '@/lib/ai/local/webgpu-capability'
import { getLocalModelState } from '@/lib/ai/local/model-manager'
import { resolveLocalReadiness, type LocalReadiness } from '@/lib/ai/local/local-readiness'
import type { LocalChatSession } from '@/lib/ai/local/litert-runtime'
import type { LocalKnowledgeItem } from '@/lib/ai/local/knowledge-context'
import type { LocalChatOverview } from '@/lib/ai/local/local-chat-context'
import { buildLocalChatSystemPrompt } from '@/lib/ai/local/local-chat-prompt'

/**
 * LocalChatPanel — de client-UI van de ON-DEVICE Fin-chat (fase C1b).
 *
 * Kaal maar netjes in de app-stijl; bewust GEEN koppeling met de cloud-chat-store
 * (eigen berichten-state). De generatie draait volledig op het toestel via de
 * LiteRT-runtime (`createChatSession`, dynamisch geïmporteerd zodat de zware
 * WASM-bundel pas laadt bij het eerste bericht).
 *
 * FAIL-CLOSED: lukt de lokale inferentie niet, dan tonen we een eerlijke melding
 * en vallen we NOOIT stil terug op de cloud-chat (/api/ai/chat). Er verlaat geen
 * financiële data het toestel — dat is de hele belofte.
 *
 * DEVICE-GEBONDEN: op mount checken we de WebGPU-capability én of het model op
 * DÍT toestel staat (`resolveLocalReadiness`). Niet klaar → verwijzing naar Mijn
 * → Privacy (model downloaden); geen chat-invoer.
 *
 * KENNIS-INJECTIE: de kennisbank-items komen van /api/local-knowledge; de
 * systeemprompt (met gefencede, per-vraag-geselecteerde kennis) wordt bij het
 * STARTEN van de sessie gebouwd op basis van de eerste vraag. Een nieuw
 * onderwerp met eigen kennis → gebruik de sessieherstart-knop. (POC-keuze:
 * één systeem-preface per sessie zodat de conversatie natief meerdere beurten
 * onthoudt.)
 */

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const FIRST_USE_HINT =
  'Eerste keer? Het model start op dit apparaat op; antwoorden duren hier doorgaans tientallen seconden. Je data blijft lokaal.'

export function LocalChatPanel({ overview }: { overview: LocalChatOverview }) {
  const [readiness, setReadiness] = useState<LocalReadiness | null>(null)
  const [knowledge, setKnowledge] = useState<LocalKnowledgeItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // De lopende, native multi-turn sessie (één LiteRT-Conversation). Lazy: pas
  // gebouwd bij het eerste bericht. In een ref zodat re-renders 'm niet resetten.
  const sessionRef = useRef<LocalChatSession | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Mount: capability + model-staat bepalen, en de kennisbank ophalen.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [cap, model] = await Promise.all([checkLocalAiCapability(), getLocalModelState()])
        if (active) setReadiness(resolveLocalReadiness(cap, { state: model.state }))
      } catch {
        if (active) {
          setReadiness({
            ready: false,
            kind: 'capability',
            message: 'Lokale AI kon niet worden gecontroleerd op dit toestel. Probeer het later opnieuw.',
          })
        }
      }
      // Kennisbank is niet-blokkerend: faalt de fetch, dan werkt de chat gewoon
      // door op puur de eigen DNA (geen kennisinjectie).
      try {
        const res = await fetch('/api/local-knowledge')
        if (res.ok) {
          const data = (await res.json()) as { items?: LocalKnowledgeItem[] }
          if (active && Array.isArray(data.items)) setKnowledge(data.items)
        }
      } catch {
        /* stil: chat werkt zonder kennisbank */
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Autoscroll naar het laatste bericht bij nieuwe content.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight })
  }, [messages])

  // Sessie opruimen bij unmount (conversatie vrijgeven; engine blijft gedeeld).
  useEffect(() => {
    return () => {
      sessionRef.current?.dispose()
      sessionRef.current = null
    }
  }, [])

  const appendAssistantDelta = useCallback((delta: string) => {
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last && last.role === 'assistant') {
        next[next.length - 1] = { role: 'assistant', content: last.content + delta }
      }
      return next
    })
  }, [])

  const onSend = useCallback(async () => {
    const text = input.trim()
    if (!text || generating || !readiness?.ready) return

    setError(null)
    setInput('')
    setGenerating(true)
    // Voeg de vraag toe + een leeg assistent-bericht als streaming-doel.
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])

    try {
      if (!sessionRef.current) {
        // Bouw de systeemprompt op basis van de eerste vraag (kennis-selectie)
        // en start de native multi-turn conversatie.
        const systemPrompt = buildLocalChatSystemPrompt({ overview, question: text, knowledgeItems: knowledge })
        const { createChatSession } = await import('@/lib/ai/local/litert-runtime')
        sessionRef.current = await createChatSession(systemPrompt)
      }
      await sessionRef.current.send(text, appendAssistantDelta)
    } catch {
      // Fail-closed: eerlijke melding, geen cloud-fallback. Verwijder het lege
      // assistent-bericht zodat er geen halve bubbel blijft staan.
      setMessages((prev) => {
        const next = [...prev]
        if (next[next.length - 1]?.role === 'assistant' && next[next.length - 1].content === '') next.pop()
        return next
      })
      setError(
        'Het lokale antwoord is niet gelukt. Er is niets naar onze servers gestuurd. Probeer het opnieuw, of herstart de sessie.',
      )
    } finally {
      setGenerating(false)
    }
  }, [input, generating, readiness, overview, knowledge, appendAssistantDelta])

  const onRestart = useCallback(() => {
    sessionRef.current?.dispose()
    sessionRef.current = null
    setMessages([])
    setError(null)
    setInput('')
  }, [])

  return (
    <div className="space-y-4 pb-8">
      {/* ── Kop + experimenteel-badge ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center bg-wil-50">
            <Cpu className="h-4 w-4 text-wil-600" aria-hidden="true" />
          </div>
          <h1 className="text-base font-semibold text-[var(--ink)]">Lokale chat met Fin</h1>
          <span className="inline-flex items-center border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
            Experimenteel
          </span>
        </div>
        <div className="flex items-start gap-2 rounded-[var(--r-lg)] border border-wil-200 bg-wil-50/60 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wil-600" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-[var(--ink-2)]">
            Deze chat draait volledig <strong>op dit apparaat</strong> — je financiële gegevens verlaten je
            toestel niet en er gaat niets naar onze servers. {FIRST_USE_HINT}
          </p>
        </div>
      </div>

      {/* ── Niet gereed op dit toestel ── */}
      {readiness && !readiness.ready && (
        <div className="border border-amber-500/40 bg-amber-50/60 p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--ink)]">Nog niet klaar op dit toestel</h2>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">{readiness.message}</p>
          {readiness.kind === 'model-missing' && (
            <Link
              href="/mijn/privacy"
              className="mt-3 inline-flex items-center gap-1.5 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Naar Mijn → Privacy
            </Link>
          )}
        </div>
      )}

      {/* ── Chat-oppervlak (alleen als gereed) ── */}
      {readiness?.ready && (
        <>
          <div
            ref={scrollRef}
            className="min-h-[16rem] max-h-[52vh] space-y-3 overflow-y-auto border border-[var(--border-ed)] bg-[var(--paper)] p-4"
          >
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--ink-3)]">
                Stel je eerste vraag — bijvoorbeeld &quot;Hoe sta ik er eigenlijk voor?&quot; of &quot;Wat is
                jaarruimte?&quot;
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--r-lg)] bg-wil-600 px-3 py-2 text-sm text-white'
                        : 'max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--r-lg)] bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)]'
                    }
                  >
                    {m.content ||
                      (generating && m.role === 'assistant' && i === messages.length - 1 ? (
                        <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Fin denkt na…
                        </span>
                      ) : null)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Live-regio voor status (blijft gemount). */}
          <p className="sr-only" aria-live="polite">
            {generating ? 'Fin genereert een antwoord op je toestel.' : ''}
            {error ?? ''}
          </p>

          {/* ── Foutmelding (fail-closed) ── */}
          {error && (
            <div className="flex items-start gap-2 border border-negative/30 bg-negative/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[var(--ink-2)]">{error}</p>
            </div>
          )}

          {/* ── Invoer ── */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void onSend()
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void onSend()
                }
              }}
              rows={2}
              placeholder="Stel je vraag aan Will…"
              disabled={generating}
              aria-label="Je vraag aan Fin"
              className="min-h-[2.75rem] flex-1 resize-none border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-wil-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={generating || !input.trim()}
              className="inline-flex h-11 items-center gap-2 bg-wil-600 px-4 text-sm font-medium text-white transition-colors hover:bg-wil-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Verstuur
            </button>
          </form>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onRestart}
              disabled={generating}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Sessie herstarten (nieuw onderwerp)
            </button>
          )}
        </>
      )}
    </div>
  )
}
