'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings2, ChevronDown } from 'lucide-react'
import { Kicker } from '@/components/editorial'

/**
 * Rebalancing drempel-instellingen — contextually placed on /core/assets/holdings.
 * Shows a slider to adjust the drift threshold percentage.
 * Only visible when user has target allocations.
 */
export function RebalancingSettingsSection() {
  const supabase = createClient()

  const [hasTargetAllocations, setHasTargetAllocations] = useState(false)
  const [open, setOpen] = useState(false)
  const [threshold, setThreshold] = useState(5)
  const [thresholdSaved, setThresholdSaved] = useState(5)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load threshold + check if user has target allocations
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check target allocations
      try {
        const { count } = await supabase
          .from('target_allocations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
        if ((count ?? 0) > 0) {
          setHasTargetAllocations(true)
        }
      } catch { /* table may not exist */ }

      // Load threshold from profile
      const { data } = await supabase
        .from('profiles')
        .select('rebalance_threshold')
        .eq('id', user.id)
        .single()

      if (data?.rebalance_threshold != null) {
        const th = Number(data.rebalance_threshold)
        setThreshold(th)
        setThresholdSaved(th)
      }

      setLoaded(true)
    }
    load()
  }, [supabase])

  const saveThreshold = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({ rebalance_threshold: threshold })
        .eq('id', user.id)
      if (error) throw error
      setThresholdSaved(threshold)
      setMessage({ type: 'success', text: 'Drempel opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setSaving(false)
  }, [supabase, threshold])

  // Don't render if no target allocations or not loaded yet
  if (!loaded || !hasTargetAllocations) return null

  return (
    <div className="mt-6 border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      {/* Accent bar */}
      <div className="h-[3px] w-full bg-kern-500" />

      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <Kicker>
            <Settings2 className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
            Rebalancing
          </Kicker>
          <span className="font-mono text-sm tabular-nums text-[var(--ink-3)]">
            drempel {thresholdSaved}%
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-[var(--border-ed)] px-4 sm:px-8 pb-6 pt-4 space-y-5">
          <p className="text-sm text-[var(--ink-2)]">
            Stel in hoe gevoelig de rebalancing-meldingen zijn. Een lagere drempel geeft eerder een signaal, een hogere drempel filtert kleine afwijkingen weg.
          </p>

          {/* Threshold slider */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Drift Drempel</p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none bg-[var(--border-ed)] accent-kern-500 cursor-pointer"
                style={{ minHeight: '44px' }}
              />
              <span className="font-mono tabular-nums text-lg font-semibold text-[var(--ink)] min-w-[3.5rem] text-right">
                {threshold}%
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-[var(--ink-4)] mt-1 px-0.5">
              <span>1% — gevoelig</span>
              <span>20% — tolerant</span>
            </div>
          </div>

          {/* Explanation */}
          <p className="text-xs text-[var(--ink-3)] leading-relaxed">
            Je ontvangt een melding wanneer je allocatie meer dan {threshold}% afwijkt van je target.
            Bij een drempel van {threshold}% en een target van 60% aandelen, krijg je pas een signaal wanneer het aandeel onder {Math.max(0, 60 - threshold)}% of boven {Math.min(100, 60 + threshold)}% komt.
          </p>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={saveThreshold}
              disabled={saving || threshold === thresholdSaved}
              className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Drempel opslaan'}
            </button>
            {message && (
              <span className={`text-sm ${message.type === 'success' ? 'text-positive' : 'text-negative'}`}>
                {message.text}
              </span>
            )}
            {threshold !== thresholdSaved && !message && (
              <span className="text-xs text-amber-600">Niet opgeslagen</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
