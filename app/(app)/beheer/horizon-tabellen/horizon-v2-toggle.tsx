'use client'

import { useEffect, useState } from 'react'

/**
 * Toggle voor de grootboek-engine v2 op /toekomst (per-gebruiker opt-in).
 * Schrijft naar /api/horizon-engine → profiles.feature_preferences.horizon_engine_v2.
 * Raakt alleen je eigen account; /toekomst gebruikt v2 pas na een refresh.
 */
export function HorizonV2Toggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/horizon-engine')
      .then((r) => r.json())
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false))
  }, [])

  async function toggle() {
    if (enabled == null || saving) return
    setSaving(true)
    const next = !enabled
    try {
      const r = await fetch('/api/horizon-engine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const d = await r.json()
      setEnabled(!!d.enabled)
    } catch {
      /* laat huidige stand staan */
    } finally {
      setSaving(false)
    }
  }

  const on = enabled === true
  return (
    <div className="flex items-center justify-between gap-4 border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--paper)] p-3">
      <div className="text-[13px] text-[var(--ink-2)]">
        <div className="font-semibold text-[var(--ink)]">Engine v2 op /toekomst</div>
        <div className="text-[12px] text-[var(--ink-3)]">
          Gebruikt de grootboek-engine (reëel→nominaal) op je <strong>eigen</strong> /toekomst-pagina. Alleen jouw account; ververs
          /toekomst na het omzetten.
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={enabled == null || saving}
        aria-pressed={on}
        className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
          on
            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
            : 'border-[var(--border-md)] bg-transparent text-[var(--ink-3)]'
        } ${enabled == null || saving ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {enabled == null ? '…' : on ? 'aan' : 'uit'}
      </button>
    </div>
  )
}
