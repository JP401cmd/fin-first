'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, Save, Check, AlertCircle } from 'lucide-react'
import { DEFAULT_PLATFORM_STATUS, type PlatformStatus } from '@/lib/platform-status'

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

const inputCls =
  'w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50'

export default function BeheerPlatformPage() {
  const [status, setStatus] = useState<PlatformStatus>(DEFAULT_PLATFORM_STATUS)
  const [saved, setSaved] = useState<PlatformStatus>(DEFAULT_PLATFORM_STATUS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const clearMsg = useCallback(() => setMsg(null), [])
  useEffect(() => {
    if (msg) {
      const t = setTimeout(clearMsg, 4000)
      return () => clearTimeout(t)
    }
  }, [msg, clearMsg])

  useEffect(() => {
    fetch('/api/admin/platform')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PlatformStatus | null) => {
        if (d) {
          setStatus(d)
          setSaved(d)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/platform', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Opslaan mislukt')
      setSaved(data.status ?? status)
      setStatus(data.status ?? status)
      setMsg({ type: 'success', text: 'Platform-status opgeslagen' })
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  const dirty = JSON.stringify(status) !== JSON.stringify(saved)

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Platform-status</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Onderhoudsmodus, in-app aankondiging en globale kill-switches.
        </p>
      </div>

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 flex items-center gap-2 border px-4 py-3 text-sm ${
            msg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {msg.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Onderhoud */}
        <div>
          <SectionLabel>Onderhoudsmodus</SectionLabel>
          <label className="flex items-center gap-2.5 text-sm text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={status.maintenance.enabled}
              disabled={loading}
              onChange={(e) =>
                setStatus((s) => ({ ...s, maintenance: { ...s.maintenance, enabled: e.target.checked } }))
              }
              className="h-4 w-4 accent-red-600"
            />
            Onderhoudsbanner tonen aan alle gebruikers
          </label>
          <input
            type="text"
            placeholder="Bv. Vanavond 22:00–23:00 voert TriFinity onderhoud uit."
            value={status.maintenance.message}
            disabled={loading}
            onChange={(e) =>
              setStatus((s) => ({ ...s, maintenance: { ...s.maintenance, message: e.target.value } }))
            }
            className={`mt-2 ${inputCls}`}
          />
        </div>

        {/* Aankondiging */}
        <div>
          <SectionLabel>Aankondiging</SectionLabel>
          <label className="flex items-center gap-2.5 text-sm text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={status.announcement.enabled}
              disabled={loading}
              onChange={(e) =>
                setStatus((s) => ({ ...s, announcement: { ...s.announcement, enabled: e.target.checked } }))
              }
              className="h-4 w-4 accent-[var(--ink)]"
            />
            Aankondiging tonen (sluitbaar per gebruiker)
          </label>
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder="Titel"
              value={status.announcement.title}
              disabled={loading}
              onChange={(e) =>
                setStatus((s) => ({ ...s, announcement: { ...s.announcement, title: e.target.value } }))
              }
              className={inputCls}
            />
            <textarea
              placeholder="Bericht"
              rows={2}
              value={status.announcement.body}
              disabled={loading}
              onChange={(e) =>
                setStatus((s) => ({ ...s, announcement: { ...s.announcement, body: e.target.value } }))
              }
              className={inputCls}
            />
            <label className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
              Niveau
              <select
                value={status.announcement.level}
                disabled={loading}
                onChange={(e) =>
                  setStatus((s) => ({
                    ...s,
                    announcement: { ...s.announcement, level: e.target.value === 'warning' ? 'warning' : 'info' },
                  }))
                }
                className="border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)]"
              >
                <option value="info">Info</option>
                <option value="warning">Waarschuwing</option>
              </select>
            </label>
          </div>
        </div>

        {/* Kill-switches */}
        <div>
          <SectionLabel>Kill-switches</SectionLabel>
          <label className="flex items-center gap-2.5 text-sm text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={status.killSwitches.ai}
              disabled={loading}
              onChange={(e) =>
                setStatus((s) => ({ ...s, killSwitches: { ...s.killSwitches, ai: e.target.checked } }))
              }
              className="h-4 w-4 accent-violet-600"
            />
            AI ingeschakeld
          </label>
          <p className="mt-1.5 text-xs text-[var(--ink-4)]">
            Uitschakelen blokkeert direct alle AI-functies (chat, briefing, rapporten, …) met een nette
            melding. Banktoegang regel je via Bank Connect.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className="inline-flex min-h-[44px] items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
        {dirty && !saving && (
          <span className="ml-3 text-xs font-medium text-amber-600">Niet-opgeslagen wijzigingen</span>
        )}
      </div>
    </div>
  )
}
