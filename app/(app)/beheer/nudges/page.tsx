'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { MODULE_CATALOG, type ModuleId } from '@/lib/module-registry'

type NudgeRow = {
  key: string
  moduleId: ModuleId
  defaultTitle: string
  defaultDescription: string
  title: string
  description: string
  href: string
  icon: string
  enabled: boolean
  hasOverride: boolean
}

type Overrides = Record<string, { title?: string; description?: string; enabled?: boolean }>

const MODULE_COLORS: Partial<Record<ModuleId, { dot: string; text: string; bg: string }>> = {
  budgetteren:          { dot: 'bg-kern-500',    text: 'text-kern-700',    bg: 'bg-kern-50' },
  vermogensregistratie: { dot: 'bg-kern-500',    text: 'text-kern-700',    bg: 'bg-kern-50' },
  aandelenregistratie:  { dot: 'bg-kern-500',    text: 'text-kern-700',    bg: 'bg-kern-50' },
  inzicht_acties:       { dot: 'bg-wil-500',     text: 'text-wil-700',     bg: 'bg-wil-50' },
  toekomstplannen:      { dot: 'bg-horizon-500', text: 'text-horizon-700', bg: 'bg-horizon-50' },
}

function getModuleLabel(id: ModuleId): string {
  return MODULE_CATALOG.find((m) => m.id === id)?.label ?? id
}

export default function BeheerNudgesPage() {
  const [nudges, setNudges] = useState<NudgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<ModuleId>>(new Set())

  const fetchNudges = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/nudges')
      if (!res.ok) return
      const data = await res.json()
      setNudges(data.nudges ?? [])
    } catch {
      setMessage({ type: 'error', text: 'Kon nudges niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNudges() }, [fetchNudges])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  function updateNudge(key: string, field: 'title' | 'description' | 'enabled', value: string | boolean) {
    setNudges((prev) =>
      prev.map((n) => (n.key === key ? { ...n, [field]: value, hasOverride: true } : n))
    )
    setDirty(true)
  }

  function resetNudge(key: string) {
    setNudges((prev) =>
      prev.map((n) =>
        n.key === key
          ? { ...n, title: n.defaultTitle, description: n.defaultDescription, enabled: true, hasOverride: false }
          : n
      )
    )
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const overrides: Overrides = {}
      for (const n of nudges) {
        const changed =
          n.title !== n.defaultTitle ||
          n.description !== n.defaultDescription ||
          !n.enabled
        if (changed) {
          overrides[n.key] = {}
          if (n.title !== n.defaultTitle) overrides[n.key].title = n.title
          if (n.description !== n.defaultDescription) overrides[n.key].description = n.description
          if (!n.enabled) overrides[n.key].enabled = false
        }
      }

      const res = await fetch('/api/admin/nudges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })

      if (res.ok) {
        setDirty(false)
        setMessage({ type: 'success', text: 'Nudges opgeslagen' })
        fetchNudges()
      } else {
        setMessage({ type: 'error', text: 'Opslaan mislukt' })
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleCollapse(moduleId: ModuleId) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }

  // Group nudges by module
  const grouped = new Map<ModuleId, NudgeRow[]>()
  for (const n of nudges) {
    const list = grouped.get(n.moduleId) ?? []
    list.push(n)
    grouped.set(n.moduleId, list)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-inter)] text-lg font-bold text-[var(--ink)]">
          Module-nudges beheren
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de invul-suggesties die gebruikers zien in het meldingencentrum per module.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">Onopgeslagen wijzigingen</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { fetchNudges(); setDirty(false) }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {Array.from(grouped.entries()).map(([moduleId, moduleNudges]) => {
        const colors = MODULE_COLORS[moduleId] ?? { dot: 'bg-gray-500', text: 'text-gray-700', bg: 'bg-gray-50' }
        const isCollapsed = collapsed.has(moduleId)
        const enabledCount = moduleNudges.filter((n) => n.enabled).length

        return (
          <div key={moduleId} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCollapse(moduleId)}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)]/50"
            >
              <div className="flex items-center gap-3">
                <ChevronRight
                  className={`h-4 w-4 text-[var(--ink-3)] transition-transform duration-200 ${
                    isCollapsed ? '' : 'rotate-90'
                  }`}
                />
                <span className={`inline-flex items-center gap-2 text-sm font-semibold ${colors.text}`}>
                  <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                  {getModuleLabel(moduleId)}
                </span>
              </div>
              <span className="text-xs text-[var(--ink-4)]">
                {enabledCount}/{moduleNudges.length} actief
              </span>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-[var(--border-ed)] border-t border-[var(--border-ed)]">
                {moduleNudges.map((nudge) => (
                  <div
                    key={nudge.key}
                    className={`px-5 py-4 ${nudge.hasOverride ? 'border-l-2 border-l-amber-400' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nudge.title}
                            onChange={(e) => updateNudge(nudge.key, 'title', e.target.value)}
                            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                          />
                        </div>
                        <input
                          type="text"
                          value={nudge.description}
                          onChange={(e) => updateNudge(nudge.key, 'description', e.target.value)}
                          className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-[var(--ink-3)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                        />
                        <p className="px-2 text-[10px] text-[var(--ink-4)]">
                          {nudge.href}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {nudge.hasOverride && (
                          <button
                            type="button"
                            onClick={() => resetNudge(nudge.key)}
                            className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
                            title="Herstel naar standaard"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => updateNudge(nudge.key, 'enabled', !nudge.enabled)}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            nudge.enabled ? 'bg-kern-500' : 'bg-[var(--border-md)]'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              nudge.enabled ? 'translate-x-5' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
