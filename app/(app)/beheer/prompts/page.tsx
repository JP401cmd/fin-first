'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, FileCode2, Loader2 } from 'lucide-react'

interface PromptInfo {
  id: string
  label: string
  description: string
  content: string
  source: string
  domain: string | null
  dynamic: boolean
  charCount: number
}

const DOMAIN_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  kern: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Kern' },
  wil: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Wil' },
  horizon: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Horizon' },
}
const SHARED_BADGE = { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'Gedeeld' }

export default function BeheerPromptsPage() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([])
  const [combinedWil, setCombinedWil] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['base']))
  const [showCombined, setShowCombined] = useState(false)

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-prompts')
      if (!res.ok) throw new Error('Kon prompts niet laden')
      const data = await res.json()
      setPrompts(data.prompts)
      setCombinedWil(data.combinedWil ?? '')
    } catch {
      setError('Kon prompts niet laden. Controleer of je admin-rechten hebt.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  function togglePanel(id: string) {
    setOpenPanels((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--ink-3)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Prompts laden...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  const totalChars = prompts.reduce((sum, p) => sum + p.charCount, 0)

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">System Prompts</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Overzicht van alle system prompts die Will en andere AI-modules gebruiken.
          Aanpassen doe je in de code ({prompts.length} prompts, {totalChars.toLocaleString('nl-NL')} tekens totaal).
        </p>

        {/* Combined preview button */}
        <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]">
          <button
            type="button"
            onClick={() => setShowCombined(!showCombined)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
          >
            <span>Gecombineerd prompt bekijken (base + wil) — wat de chat-API naar het model stuurt</span>
            {showCombined ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
          {showCombined && (
            <div className="border-t border-[var(--border-ed)] px-3 py-2">
              <div className="mb-1.5 text-xs text-[var(--ink-4)]">
                {combinedWil.length.toLocaleString('nl-NL')} tekens
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-[var(--ink-3)] font-mono">
                {combinedWil}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Prompt panels */}
      {prompts.map((prompt) => {
        const isOpen = openPanels.has(prompt.id)
        const badge = prompt.domain ? DOMAIN_BADGE[prompt.domain] : SHARED_BADGE

        return (
          <div
            key={prompt.id}
            className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
          >
            {/* Header — always visible */}
            <button
              type="button"
              onClick={() => togglePanel(prompt.id)}
              className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-[var(--subtle)] transition-colors"
            >
              <FileCode2 className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {prompt.label}
                  </span>
                  {badge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  )}
                  {prompt.dynamic && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                      dynamisch
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)] truncate">
                  {prompt.description}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-[var(--ink-4)]">
                {prompt.charCount.toLocaleString('nl-NL')} tekens
              </span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
              )}
            </button>

            {/* Content — collapsible */}
            {isOpen && (
              <div className="border-t border-[var(--border-ed)] px-6 py-4">
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--subtle)] p-4 text-xs text-[var(--ink-2)] font-mono leading-relaxed">
                  {prompt.content}
                </pre>
                <div className="mt-2 text-[10px] text-[var(--ink-4)]">
                  Bron: {prompt.source}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
