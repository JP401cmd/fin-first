'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Save, Check, AlertCircle } from 'lucide-react'

export default function BeheerAiFeaturesPage() {
  const [maxRefreshes, setMaxRefreshes] = useState(3)
  const [savedMaxRefreshes, setSavedMaxRefreshes] = useState(3)
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
    async function loadSettings() {
      try {
        const res = await fetch('/api/admin/ai-features')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        const val = data.news_max_refreshes_per_week
          ? parseInt(data.news_max_refreshes_per_week, 10)
          : 3
        setMaxRefreshes(val)
        setSavedMaxRefreshes(val)
      } catch {
        // Keep defaults
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/ai-features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news_max_refreshes_per_week: String(maxRefreshes) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }
      setSavedMaxRefreshes(maxRefreshes)
      setStatus({ type: 'success', message: 'Instellingen opgeslagen' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = maxRefreshes !== savedMaxRefreshes

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">AI Features</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer limieten en instellingen voor AI-functies
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

      {/* Nieuws section */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-4 pb-3">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Nieuws
            </span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="max-refreshes"
              className="block text-sm font-medium text-[var(--ink-2)]"
            >
              Maximale verversingen per week
            </label>
            <input
              id="max-refreshes"
              type="number"
              min={0}
              max={50}
              value={loading ? '' : maxRefreshes}
              onChange={(e) => setMaxRefreshes(parseInt(e.target.value, 10) || 0)}
              disabled={loading}
              className="w-32 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 font-mono text-sm tabular-nums text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50"
            />
            <p className="text-xs text-[var(--ink-4)]">
              Standaard: 3. Stel in op 0 om handmatig verversen uit te schakelen.
              {hasChanges && (
                <span className="ml-1 font-medium text-amber-600">
                  Niet-opgeslagen wijzigingen
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Toekomstig section */}
        <div>
          <div className="flex items-center gap-4 pb-3">
            <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
              Toekomstig
            </span>
            <div className="h-px flex-1 bg-[var(--border-ed)]" />
          </div>
          <p className="text-sm italic text-[var(--ink-4)]">
            Hier komen toekomstige AI-limieten en instellingen.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving || loading || !hasChanges}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  )
}
