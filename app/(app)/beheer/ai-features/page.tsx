'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Save, Check, AlertCircle } from 'lucide-react'
import { AI_FEATURES } from '@/lib/ai-credits'

interface UsageData {
  total: number
  byFeature: { key: string; label: string; credits: number }[]
  topUsers: { id: string; name: string; credits: number }[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-3">
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

export default function BeheerAiFeaturesPage() {
  const [maxRefreshes, setMaxRefreshes] = useState(3)
  const [savedMaxRefreshes, setSavedMaxRefreshes] = useState(3)
  const [budgetAi, setBudgetAi] = useState(500)
  const [budgetGratis, setBudgetGratis] = useState(50)
  const [savedAi, setSavedAi] = useState(500)
  const [savedGratis, setSavedGratis] = useState(50)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const clearStatus = useCallback(() => setStatus(null), [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(clearStatus, 4000)
      return () => clearTimeout(timer)
    }
  }, [status, clearStatus])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/ai-features')
        if (!res.ok) throw new Error('Failed to load')
        const data = await res.json()
        const r = data.news_max_refreshes_per_week ? parseInt(data.news_max_refreshes_per_week, 10) : 3
        setMaxRefreshes(r)
        setSavedMaxRefreshes(r)
        if (data.aiCreditBudgets) {
          setBudgetAi(data.aiCreditBudgets.ai ?? 500)
          setBudgetGratis(data.aiCreditBudgets.gratis ?? 50)
          setSavedAi(data.aiCreditBudgets.ai ?? 500)
          setSavedGratis(data.aiCreditBudgets.gratis ?? 50)
        }
        setUsage(data.usage ?? null)
      } catch {
        // keep defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/ai-features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_max_refreshes_per_week: String(maxRefreshes),
          aiCreditBudgets: { ai: budgetAi, gratis: budgetGratis },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }
      setSavedMaxRefreshes(maxRefreshes)
      setSavedAi(budgetAi)
      setSavedGratis(budgetGratis)
      setStatus({ type: 'success', message: 'Instellingen opgeslagen' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    maxRefreshes !== savedMaxRefreshes || budgetAi !== savedAi || budgetGratis !== savedGratis
  const inputCls =
    'w-32 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 font-mono text-sm tabular-nums text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50'

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">AI Features</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Limieten, credit-budgetten en verbruik van AI-functies.
        </p>
      </div>

      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 flex items-center gap-2 border px-4 py-3 text-sm ${
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

      <div className="space-y-8">
        {/* AI-credit-budgetten */}
        <div>
          <SectionLabel>AI-credit-budgetten (per maand)</SectionLabel>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <label htmlFor="budget-ai" className="block text-sm font-medium text-[var(--ink-2)]">
                AI-abonnees
              </label>
              <input
                id="budget-ai"
                type="number"
                min={0}
                value={loading ? '' : budgetAi}
                onChange={(e) => setBudgetAi(parseInt(e.target.value, 10) || 0)}
                disabled={loading}
                className={inputCls}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="budget-gratis" className="block text-sm font-medium text-[var(--ink-2)]">
                Gratis (proefbudget)
              </label>
              <input
                id="budget-gratis"
                type="number"
                min={0}
                value={loading ? '' : budgetGratis}
                onChange={(e) => setBudgetGratis(parseInt(e.target.value, 10) || 0)}
                disabled={loading}
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-4)]">
            Het maandbudget dat een gebruiker op /mijn/account ziet. Kosten per actie staan hieronder
            (vast in code).
          </p>
        </div>

        {/* Kosten per actie (read-only) */}
        <div>
          <SectionLabel>Kosten per actie (vast)</SectionLabel>
          <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
            {AI_FEATURES.map((f) => (
              <li key={f.key} className="flex items-baseline gap-1.5 text-sm">
                <span className="text-[var(--ink-2)]">{f.label}</span>
                <span className="font-mono tabular-nums text-[var(--ink)]">{f.cost}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Verbruik deze maand */}
        <div>
          <SectionLabel>Verbruik deze maand</SectionLabel>
          {!usage || usage.total === 0 ? (
            <p className="text-sm italic text-[var(--ink-4)]">Nog geen AI-verbruik deze periode.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Per functie · {usage.total} totaal
                </p>
                <ul className="space-y-1.5">
                  {usage.byFeature.map((f) => (
                    <li key={f.key} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--ink-2)]">{f.label}</span>
                      <span className="font-mono tabular-nums text-[var(--ink)]">{f.credits}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Grootste verbruikers
                </p>
                <ul className="space-y-1.5">
                  {usage.topUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-[var(--ink-2)]">{u.name}</span>
                      <span className="ml-2 font-mono tabular-nums text-[var(--ink)]">{u.credits}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Nieuws */}
        <div>
          <SectionLabel>Nieuws</SectionLabel>
          <div className="space-y-2">
            <label htmlFor="max-refreshes" className="block text-sm font-medium text-[var(--ink-2)]">
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
              className={inputCls}
            />
            <p className="text-xs text-[var(--ink-4)]">Standaard: 3. Stel in op 0 om handmatig verversen uit te schakelen.</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving || loading || !hasChanges}
          className="inline-flex min-h-[44px] items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
        {hasChanges && !saving && (
          <span className="ml-3 text-xs font-medium text-amber-600">Niet-opgeslagen wijzigingen</span>
        )}
      </div>
    </div>
  )
}
