'use client'

import { useState, useEffect } from 'react'
import { Lock, Save, RotateCcw, Search } from 'lucide-react'
import { UNIFIED_FEATURES, type PhaseId, type CommercialTier } from '@/lib/feature-registry'
import { PHASES } from '@/lib/feature-phases'
import { TIERS } from '@/lib/tier-config'

type FeatureOverrides = Record<string, { unlockPhase?: string }>

const PHASE_IDS: PhaseId[] = ['recovery', 'stability', 'momentum', 'mastery']
const TIER_ORDER: CommercialTier[] = ['gratis', 'connected', 'ai']

const TIER_COLORS: Record<CommercialTier, { bg: string; text: string; border: string; badge: string }> = {
  gratis:    { bg: 'bg-zinc-50',     text: 'text-zinc-700',    border: 'border-zinc-200',    badge: 'bg-zinc-100 text-zinc-700' },
  connected: { bg: 'bg-kern-50',     text: 'text-kern-700',    border: 'border-kern-200',    badge: 'bg-kern-100 text-kern-700' },
  ai:        { bg: 'bg-horizon-50',  text: 'text-horizon-700', border: 'border-horizon-200', badge: 'bg-horizon-100 text-horizon-700' },
}

const MODULE_LABELS: Record<string, string> = {
  kern: 'Kern',
  wil: 'Wil',
  horizon: 'Horizon',
  bank: 'Bank',
  ai: 'AI',
}

export default function ToegangsPage() {
  const [overrides, setOverrides] = useState<FeatureOverrides>({})
  const [savedOverrides, setSavedOverrides] = useState<FeatureOverrides>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedTierTab, setSelectedTierTab] = useState<CommercialTier | 'all'>('all')

  // Subscription assignment
  const [assignEmail, setAssignEmail] = useState('')
  const [assignSubs, setAssignSubs] = useState<{ connected: boolean; ai: boolean }>({ connected: false, ai: false })
  const [assigning, setAssigning] = useState(false)
  const [assignMessage, setAssignMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/feature-access')
      .then(r => r.json())
      .then(data => {
        setOverrides(data.overrides ?? {})
        setSavedOverrides(data.overrides ?? {})
      })
      .finally(() => setLoading(false))
  }, [])

  const isDirty = JSON.stringify(overrides) !== JSON.stringify(savedOverrides)

  function getEffectivePhase(featureId: string, defaultPhase: PhaseId): PhaseId {
    return (overrides[featureId]?.unlockPhase as PhaseId) ?? defaultPhase
  }

  function togglePhase(featureId: string, phase: PhaseId, defaultPhase: PhaseId) {
    const effective = getEffectivePhase(featureId, defaultPhase)
    const effectiveIdx = PHASE_IDS.indexOf(effective)
    const phaseIdx = PHASE_IDS.indexOf(phase)

    // Toggle: if clicking the current unlock phase and it's before current, move it up
    // If clicking a later phase, set unlock to that phase
    let newPhase: PhaseId
    if (phaseIdx < effectiveIdx) {
      // Moving earlier (making available sooner)
      newPhase = phase
    } else if (phaseIdx === effectiveIdx && phaseIdx > 0) {
      // Toggling off at current position, move to next phase
      newPhase = PHASE_IDS[phaseIdx + 1] ?? PHASE_IDS[phaseIdx]
    } else if (phaseIdx > effectiveIdx) {
      // Moving later (making available later)
      newPhase = PHASE_IDS[phaseIdx] ?? phase
    } else {
      newPhase = phase
    }

    setOverrides(prev => {
      const next = { ...prev }
      if (newPhase === defaultPhase) {
        // No override needed — remove
        delete next[featureId]
      } else {
        next[featureId] = { unlockPhase: newPhase }
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/feature-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      if (res.ok) {
        const data = await res.json()
        setSavedOverrides(data.overrides)
        setOverrides(data.overrides)
        setMessage({ type: 'success', text: 'Matrix opgeslagen' })
      } else {
        setMessage({ type: 'error', text: 'Fout bij opslaan' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Netwerkfout' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setOverrides({})
  }

  async function handleAssign() {
    if (!assignEmail.trim()) return
    setAssigning(true)
    setAssignMessage(null)
    const subs: string[] = []
    if (assignSubs.connected) subs.push('connected')
    if (assignSubs.ai) subs.push('ai')
    try {
      const res = await fetch('/api/admin/tier-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: assignEmail.trim(), subscriptions: subs }),
      })
      const data = await res.json()
      if (res.ok) {
        const label = subs.length === 0 ? 'Gratis' : subs.map(s => s === 'connected' ? 'Connected' : 'AI').join(' + ')
        setAssignMessage(`${label} toegewezen aan ${assignEmail}`)
        setAssignEmail('')
      } else {
        setAssignMessage(data.error ?? 'Fout bij toewijzen')
      }
    } catch {
      setAssignMessage('Netwerkfout')
    } finally {
      setAssigning(false)
    }
  }

  const filteredFeatures = selectedTierTab === 'all'
    ? UNIFIED_FEATURES
    : UNIFIED_FEATURES.filter(f => f.requiredTier === selectedTierTab)

  const tierCounts = {
    gratis: UNIFIED_FEATURES.filter(f => f.requiredTier === 'gratis').length,
    connected: UNIFIED_FEATURES.filter(f => f.requiredTier === 'connected').length,
    ai: UNIFIED_FEATURES.filter(f => f.requiredTier === 'ai').length,
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-[var(--ink-3)]">Laden...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)]">Functionaliteitenbeheer</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          {UNIFIED_FEATURES.length} functionaliteiten — {tierCounts.gratis} gratis, {tierCounts.connected} connected, {tierCounts.ai} AI
        </p>
      </div>

      {/* Tier tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSelectedTierTab('all')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            selectedTierTab === 'all'
              ? 'bg-zinc-900 text-white'
              : 'bg-[var(--subtle)] text-[var(--ink-2)] hover:bg-zinc-200'
          }`}
        >
          Alle ({UNIFIED_FEATURES.length})
        </button>
        {TIER_ORDER.map(tier => {
          const colors = TIER_COLORS[tier]
          const tierDef = TIERS.find(t => t.id === tier)
          return (
            <button
              key={tier}
              onClick={() => setSelectedTierTab(tier)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedTierTab === tier
                  ? `${colors.bg} ${colors.text} ${colors.border} border`
                  : 'bg-[var(--subtle)] text-[var(--ink-2)] hover:bg-zinc-200'
              }`}
            >
              {tierDef?.label} ({tierCounts[tier]})
            </button>
          )
        })}
      </div>

      {/* Unsaved changes banner */}
      {isDirty && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-700">Onopgeslagen wijzigingen</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOverrides(savedOverrides)}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-amber-100 transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Feature matrix table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-ed)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-4 py-3 text-left font-semibold text-[var(--ink-2)]">Functionaliteit</th>
              {PHASES.map(p => (
                <th
                  key={p.id}
                  className="px-3 py-3 text-center font-semibold text-[var(--ink-2)]"
                  style={{ minWidth: 80 }}
                >
                  <div>{p.label}</div>
                  <div className="text-[10px] font-normal text-[var(--ink-4)]">
                    Lvl {p.levels.join(', ')}
                  </div>
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-[var(--ink-2)]">Min. Tier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ed)]">
            {filteredFeatures.map(feat => {
              const effective = getEffectivePhase(feat.id, feat.defaultPhase)
              const effectiveIdx = PHASE_IDS.indexOf(effective)
              const isTierLocked = feat.requiredTier !== 'gratis'
              const hasOverride = !!overrides[feat.id]
              const colors = TIER_COLORS[feat.requiredTier]

              return (
                <tr
                  key={feat.id}
                  className={`hover:bg-[var(--subtle)]/50 transition-colors ${hasOverride ? 'border-l-2 border-l-amber-400' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isTierLocked && <Lock className={`h-3.5 w-3.5 ${colors.text}`} />}
                      <div>
                        <p className="font-medium text-[var(--ink)]">{feat.label}</p>
                        <p className="text-xs text-[var(--ink-4)]">{feat.description}</p>
                        <div className="mt-1 flex gap-1 flex-wrap">
                          {feat.widgets.length > 0 && (
                            <span className="text-[10px] text-[var(--ink-4)]">
                              Widgets: {feat.widgets.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  {PHASES.map((p, pIdx) => {
                    const isEnabled = pIdx >= effectiveIdx
                    const isDefault = pIdx >= PHASE_IDS.indexOf(feat.defaultPhase)
                    const isUnlockPoint = pIdx === effectiveIdx

                    return (
                      <td key={p.id} className="px-3 py-3 text-center">
                        {isTierLocked ? (
                          <span className="text-[var(--ink-4)]">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => togglePhase(feat.id, p.id as PhaseId, feat.defaultPhase)}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
                              isEnabled
                                ? isUnlockPoint
                                  ? 'bg-zinc-900 text-white'
                                  : 'bg-zinc-200 text-zinc-600'
                                : 'bg-transparent text-[var(--ink-4)] hover:bg-zinc-100'
                            }`}
                            title={isEnabled ? `Aan (${isUnlockPoint ? 'ontgrendelpunt' : 'hoger'})` : 'Uit'}
                          >
                            {isEnabled ? '✓' : ''}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
                      {TIERS.find(t => t.id === feat.requiredTier)?.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-[var(--ink-3)]">
        <span><span className="inline-block h-4 w-4 rounded bg-zinc-900 text-white text-center leading-4 mr-1">✓</span> Ontgrendelpunt</span>
        <span><span className="inline-block h-4 w-4 rounded bg-zinc-200 text-center leading-4 mr-1">✓</span> Automatisch aan (hogere fase)</span>
        <span><Lock className="inline h-3 w-3 mr-1" /> Vereist abonnement</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Standaardwaarden
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
        {message && (
          <span className={`text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>

      {/* Subscription assignment section */}
      <div className="border-t border-[var(--border-ed)] pt-8">
        <h3 className="text-sm font-semibold text-[var(--ink-2)] mb-4">Gebruikersbeheer</h3>
        <p className="mb-4 text-xs text-[var(--ink-3)]">
          Abonnementen zijn onafhankelijk — een gebruiker kan Connected en/of AI apart activeren.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[var(--ink-3)] mb-1">E-mail</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ink-4)]" />
              <input
                type="email"
                value={assignEmail}
                onChange={e => setAssignEmail(e.target.value)}
                placeholder="gebruiker@email.nl"
                className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] pl-9 pr-4 py-2 text-sm placeholder:text-[var(--ink-4)] focus:border-zinc-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={assignSubs.connected}
                onChange={e => setAssignSubs(s => ({ ...s, connected: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
              />
              <span className="text-sm font-medium text-kern-700">Connected</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={assignSubs.ai}
                onChange={e => setAssignSubs(s => ({ ...s, ai: e.target.checked }))}
                className="h-4 w-4 rounded border-[var(--border-md)] text-horizon-600 focus:ring-horizon-500"
              />
              <span className="text-sm font-medium text-horizon-700">AI</span>
            </label>
          </div>
          <button
            onClick={handleAssign}
            disabled={assigning || !assignEmail.trim()}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {assigning ? 'Toewijzen...' : 'Toewijzen'}
          </button>
        </div>
        {assignMessage && (
          <p className={`mt-2 text-sm ${assignMessage.includes('Fout') || assignMessage.includes('error') ? 'text-red-600' : 'text-emerald-600'}`}>
            {assignMessage}
          </p>
        )}
      </div>
    </div>
  )
}
