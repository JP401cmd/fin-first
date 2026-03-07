'use client'

import { useState, useEffect, useCallback } from 'react'
import { Newspaper, Save, RotateCcw, Check, AlertCircle } from 'lucide-react'

const DEFAULT_NEWS_PROMPT = `Je bent een financieel nieuwsanalist voor TriFinity, een Nederlandse personal finance app.

Samenvatting:
- Schrijf in het Nederlands
- Focus op persoonlijke financiën, belastingen, sparen, beleggen, hypotheken en pensioen
- Gebruik een beknopte, informatieve stijl
- Vermijd jargon; leg technische termen uit
- Relateer nieuws aan de filosofie "Geld is opgeslagen tijd"
- Geef praktische implicaties voor de gebruiker

Formaat:
- Titel: korte, pakkende kop
- Samenvatting: 2-3 zinnen kernboodschap
- Impact: wat betekent dit voor de gebruiker?
- Bron: verwijs naar de originele bron

Privacy protocol:
- Je ontvangt geanonimiseerde financiele data (geen namen, IBANs, adressen)
- Als je onverhoopt PII detecteert: NEGEER deze en gebruik ze NIET in je output
- Refereer aan de gebruiker als je/jij, nooit bij naam
- Noem nooit specifieke banken, werkgevers of adressen in je output`

export default function BeheerNieuwsPage() {
  const [prompt, setPrompt] = useState(DEFAULT_NEWS_PROMPT)
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const clearStatus = useCallback(() => {
    setStatus(null)
  }, [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(clearStatus, 4000)
      return () => clearTimeout(timer)
    }
  }, [status, clearStatus])

  useEffect(() => {
    async function loadPrompt() {
      try {
        const res = await fetch('/api/admin/news-prompt')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        if (data.prompt) {
          setPrompt(data.prompt)
          setSavedPrompt(data.prompt)
        } else {
          setSavedPrompt(null)
        }
      } catch {
        // If no saved prompt, keep default
      } finally {
        setLoading(false)
      }
    }
    loadPrompt()
  }, [])

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }
      setSavedPrompt(prompt)
      setStatus({ type: 'success', message: 'Systeemprompt opgeslagen' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-prompt', { method: 'DELETE' })
      if (!res.ok) throw new Error('Reset mislukt')
      setPrompt(DEFAULT_NEWS_PROMPT)
      setSavedPrompt(null)
      setStatus({ type: 'success', message: 'Standaard prompt hersteld' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Reset mislukt' })
    }
  }

  const hasChanges = prompt !== (savedPrompt ?? DEFAULT_NEWS_PROMPT)

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Nieuws</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de systeemprompt voor nieuwssamenvattingen
        </p>
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {status.type === 'success' ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {status.message}
        </div>
      )}

      {/* Textarea */}
      <div className="space-y-3">
        <label
          htmlFor="news-system-prompt"
          className="block text-sm font-medium text-[var(--ink-2)]"
        >
          Systeemprompt
        </label>
        <textarea
          id="news-system-prompt"
          value={loading ? 'Laden...' : prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          rows={16}
          className="w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 font-mono text-sm leading-relaxed text-[var(--ink)] placeholder-[var(--ink-4)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50"
          placeholder="Voer een systeemprompt in..."
        />
        <p className="text-xs text-[var(--ink-4)]">
          Deze prompt wordt gebruikt bij het genereren van nieuwssamenvattingen.
          {hasChanges && (
            <span className="ml-1 font-medium text-amber-600">
              Niet-opgeslagen wijzigingen
            </span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || loading || !hasChanges}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
        <button
          onClick={handleReset}
          disabled={saving || loading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border-ed)] px-5 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Terugzetten naar standaard
        </button>
      </div>
    </div>
  )
}
