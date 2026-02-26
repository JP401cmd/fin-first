'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Lock, ChevronDown, ChevronRight, Users, Check } from 'lucide-react'
import {
  TIERS,
  TIER_FEATURES,
  DEFAULT_TIER_MATRIX,
  type CommercialTier,
  type TierFeatureMatrix,
} from '@/lib/tier-config'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierCounts {
  gratis: number
  connected: number
  ai: number
}

interface LookupUser {
  id: string
  email: string
  name: string | null
  currentTier: CommercialTier
}

interface LogEntry {
  id: string
  target_user: string
  targetName: string
  old_tier: string | null
  new_tier: string
  created_at: string
}

// ── Tier design tokens ────────────────────────────────────────────────────────

const TIER_STYLES: Record<CommercialTier, {
  accent: string
  toggleOn: string
  kicker: string
  headerBg: string
  headerText: string
  badge: string
}> = {
  gratis: {
    accent: 'var(--border-md)',
    toggleOn: 'var(--ink-3)',
    kicker: 'var(--ink-3)',
    headerBg: 'var(--subtle)',
    headerText: 'var(--ink-2)',
    badge: 'bg-zinc-100 text-[var(--ink-2)]',
  },
  connected: {
    accent: 'var(--kern)',
    toggleOn: 'var(--kern)',
    kicker: 'var(--kern-t)',
    headerBg: 'var(--kern-l)',
    headerText: 'var(--kern-t)',
    badge: 'bg-kern-100 text-kern-700',
  },
  ai: {
    accent: 'var(--hor)',
    toggleOn: 'var(--hor-t)',
    kicker: 'var(--hor-t)',
    headerBg: 'var(--hor-l)',
    headerText: 'var(--hor-t)',
    badge: 'bg-horizon-100 text-horizon-700',
  },
}

const TIER_ORDER: CommercialTier[] = ['gratis', 'connected', 'ai']

function tierIndex(tier: CommercialTier): number {
  return TIER_ORDER.indexOf(tier)
}

// ── TierStatCard ──────────────────────────────────────────────────────────────

function TierStatCard({
  tier,
  count,
  total,
}: {
  tier: CommercialTier
  count: number
  total: number
}) {
  const def = TIERS.find((t) => t.id === tier)!
  const style = TIER_STYLES[tier]
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const featuresInTier = TIER_FEATURES.filter((f) => f.tier === tier)

  return (
    <div
      className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
      style={{ boxShadow: 'var(--s0)' }}
    >
      <div
        className="h-1 w-full"
        style={{ backgroundColor: style.accent }}
      />
      <div className="p-5">
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: style.kicker }}
        >
          {def.label}
        </p>
        <p className="font-mono text-3xl font-bold text-[var(--ink)]">{count}</p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">gebruikers</p>

        {/* Progress bar */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--subtle)', border: '1px solid var(--border-ed)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: style.accent,
            }}
          />
        </div>
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">{pct}% van totaal</p>

        {/* Feature bullets */}
        <div className="mt-3 space-y-1">
          {featuresInTier.slice(0, 3).map((f) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: style.accent }} />
              <span className="text-[11px] text-[var(--ink-3)]">{f.label}</span>
            </div>
          ))}
          {featuresInTier.length > 3 && (
            <p className="text-[11px] text-[var(--ink-4)]">
              +{featuresInTier.length - 3} meer
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── TierFeatureMatrix ─────────────────────────────────────────────────────────

function TierFeatureMatrixComponent({
  matrix,
  onChange,
  dirtyFeatures,
}: {
  matrix: TierFeatureMatrix
  onChange: (matrix: TierFeatureMatrix) => void
  dirtyFeatures: Set<string>
}) {
  const [collapsed, setCollapsed] = useState<Record<CommercialTier, boolean>>({
    gratis: false,
    connected: false,
    ai: false,
  })

  function handleToggle(featureId: string, tier: CommercialTier, currentValue: boolean) {
    const tierIdx = tierIndex(tier)
    const newMatrix = { ...matrix }
    const row = { ...(newMatrix[featureId] ?? { gratis: false, connected: false, ai: false }) }

    if (!currentValue) {
      // Turning ON: enable for this tier and all higher tiers
      for (const t of TIER_ORDER) {
        if (tierIndex(t) >= tierIdx) row[t] = true
      }
    } else {
      // Turning OFF: disable for this tier and all lower tiers
      for (const t of TIER_ORDER) {
        if (tierIndex(t) <= tierIdx) row[t] = false
      }
    }

    newMatrix[featureId] = row
    onChange(newMatrix)
  }

  function isForced(featureId: string, tier: CommercialTier): boolean {
    // A cell is "forced on" if a lower tier is enabled
    const tierIdx = tierIndex(tier)
    for (const t of TIER_ORDER) {
      if (tierIndex(t) < tierIdx && matrix[featureId]?.[t]) return true
    }
    return false
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
      {/* Header row */}
      <div className="grid border-b border-[var(--border-ed)] bg-[var(--subtle)]" style={{ gridTemplateColumns: '1fr repeat(3, 120px)' }}>
        <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-2)]">
          Feature
        </div>
        {TIERS.map((t) => {
          const style = TIER_STYLES[t.id]
          return (
            <div
              key={t.id}
              className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wider"
              style={{ backgroundColor: style.headerBg, color: style.headerText }}
            >
              {t.label}
            </div>
          )
        })}
      </div>

      {/* Feature groups */}
      {TIERS.map((tierDef) => {
        const featuresInGroup = TIER_FEATURES.filter((f) => f.tier === tierDef.id)
        const style = TIER_STYLES[tierDef.id]
        const isCollapsed = collapsed[tierDef.id]

        return (
          <div key={tierDef.id}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [tierDef.id]: !c[tierDef.id] }))}
              className="flex w-full items-center gap-2 border-b border-[var(--border-ed)] px-4 py-2 text-left transition-colors hover:bg-[var(--subtle)]"
              style={{ backgroundColor: style.headerBg + '80' }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: style.kicker }} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" style={{ color: style.kicker }} />
              )}
              <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: style.kicker }}>
                {tierDef.label} functies ({featuresInGroup.length})
              </span>
            </button>

            {/* Feature rows */}
            {!isCollapsed && featuresInGroup.map((feat) => {
              const isDirty = dirtyFeatures.has(feat.id)
              return (
                <div
                  key={feat.id}
                  className="grid border-b border-[var(--border-ed)] transition-colors last:border-0 hover:bg-[var(--subtle)]"
                  style={{
                    gridTemplateColumns: '1fr repeat(3, 120px)',
                    borderLeft: isDirty ? '2px solid var(--hor-t)' : '2px solid transparent',
                  }}
                >
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-[var(--ink)]">{feat.label}</p>
                    <p className="text-[11px] text-[var(--ink-3)]">{feat.description}</p>
                    {feat.ref && (
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-4)]">{feat.ref}</p>
                    )}
                  </div>
                  {TIERS.map((col) => {
                    const val = matrix[feat.id]?.[col.id] ?? false
                    const forced = isForced(feat.id, col.id)
                    const colStyle = TIER_STYLES[col.id]

                    return (
                      <div key={col.id} className="flex items-center justify-center px-3 py-3">
                        {forced ? (
                          <div className="flex items-center gap-1 opacity-40">
                            <Lock className="h-3 w-3 text-[var(--ink-3)]" />
                            <div
                              className="h-4 w-4 rounded"
                              style={{ backgroundColor: colStyle.accent }}
                            />
                          </div>
                        ) : (
                          <input
                            type="checkbox"
                            checked={val}
                            onChange={() => handleToggle(feat.id, col.id, val)}
                            className="h-4 w-4 cursor-pointer rounded"
                            style={{ accentColor: val ? colStyle.toggleOn : 'var(--border-md)' }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── TierPricingPreview ────────────────────────────────────────────────────────

function TierPricingPreview({ matrix }: { matrix: TierFeatureMatrix }) {
  return (
    <div className="space-y-3">
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Pricing Preview
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">Wat gebruikers zien (alleen nieuwe features per tier)</p>
      </div>

      {TIERS.map((tierDef, idx) => {
        const style = TIER_STYLES[tierDef.id]
        // "New" features for this tier = enabled in this tier but NOT in lower tiers
        const newFeatures = TIER_FEATURES.filter((f) => {
          const enabledInThis = matrix[f.id]?.[tierDef.id] ?? false
          if (!enabledInThis) return false
          if (idx === 0) return true
          const lowerTier = TIERS[idx - 1].id
          return !(matrix[f.id]?.[lowerTier] ?? false)
        })

        return (
          <div
            key={tierDef.id}
            className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden"
          >
            <div className="h-0.5 w-full" style={{ backgroundColor: style.accent }} />
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ color: style.kicker }}
                >
                  {tierDef.label}
                </span>
                {idx > 0 && (
                  <span className="text-[10px] text-[var(--ink-4)]">
                    + alles van {TIERS[idx - 1].label}
                  </span>
                )}
              </div>
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">{tierDef.description}</p>
              <div className="space-y-1">
                {newFeatures.length === 0 ? (
                  <p className="text-[11px] italic text-[var(--ink-4)]">Geen exclusieve features</p>
                ) : (
                  newFeatures.map((f) => (
                    <div key={f.id} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 flex-shrink-0" style={{ color: style.accent }} />
                      <span className="text-[11px] text-[var(--ink-2)]">{f.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── TierAssignment ────────────────────────────────────────────────────────────

function TierAssignment() {
  const [email, setEmail] = useState('')
  const [lookupUser, setLookupUser] = useState<LookupUser | null>(null)
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')
  const [selectedTier, setSelectedTier] = useState<CommercialTier | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [assignMessage, setAssignMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [recentLog, setRecentLog] = useState<LogEntry[]>([])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tier-assign')
      if (!res.ok) return
      const data = await res.json()
      setRecentLog(data.log ?? [])
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    fetchLog()
  }, [fetchLog])

  function handleEmailChange(value: string) {
    setEmail(value)
    setLookupUser(null)
    setLookupState('idle')
    setSelectedTier(null)
    setAssignMessage(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.includes('@') && value.length > 4) {
      setLookupState('loading')
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/admin/tier-assign?email=${encodeURIComponent(value)}`)
          if (!res.ok) throw new Error()
          const data = await res.json()
          if (data.user) {
            setLookupUser(data.user)
            setLookupState('found')
            setSelectedTier(data.user.currentTier)
          } else {
            setLookupState('notfound')
          }
        } catch {
          setLookupState('notfound')
        }
      }, 300)
    }
  }

  async function handleAssign() {
    if (!lookupUser || !selectedTier) return
    setAssigning(true)
    setAssignMessage(null)
    try {
      const res = await fetch('/api/admin/tier-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: lookupUser.id, tier: selectedTier }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Toewijzen mislukt')
      }
      setAssignMessage({
        type: 'success',
        text: `${lookupUser.name ?? lookupUser.email} is bijgewerkt naar ${selectedTier}`,
      })
      setLookupUser({ ...lookupUser, currentTier: selectedTier })
      await fetchLog()
    } catch (e) {
      setAssignMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Toewijzen mislukt',
      })
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Gebruiker Toewijzen
      </p>

      {/* Email input */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
          E-mailadres
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          placeholder="gebruiker@example.com"
          className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
        />
      </div>

      {/* Lookup state feedback */}
      {lookupState === 'loading' && (
        <p className="mb-3 text-xs text-[var(--ink-3)]">Gebruiker zoeken...</p>
      )}
      {lookupState === 'notfound' && (
        <p className="mb-3 text-xs text-red-600">Geen gebruiker gevonden met dit e-mailadres.</p>
      )}

      {/* User preview */}
      {lookupState === 'found' && lookupUser && (
        <div className="mb-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
          <p className="text-sm font-medium text-[var(--ink)]">
            {lookupUser.name ?? lookupUser.email}
          </p>
          <p className="text-xs text-[var(--ink-3)]">{lookupUser.email}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--ink-3)]">Huidig tier:</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TIER_STYLES[lookupUser.currentTier].badge}`}>
              {lookupUser.currentTier}
            </span>
          </div>
        </div>
      )}

      {/* Tier selector */}
      {lookupState === 'found' && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
            Nieuw tier
          </label>
          <div className="flex gap-2">
            {TIERS.map((t) => {
              const style = TIER_STYLES[t.id]
              const isSelected = selectedTier === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTier(t.id)}
                  className="flex-1 rounded-[var(--r)] border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition-all"
                  style={
                    isSelected
                      ? {
                          backgroundColor: style.headerBg,
                          borderColor: style.accent,
                          color: style.headerText,
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: 'var(--border-ed)',
                          color: 'var(--ink-3)',
                        }
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Assign button */}
      {lookupState === 'found' && (
        <button
          type="button"
          onClick={handleAssign}
          disabled={assigning || !selectedTier || selectedTier === lookupUser?.currentTier}
          className="w-full rounded-[var(--r)] bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {assigning ? 'Toewijzen...' : 'Tier toewijzen'}
        </button>
      )}

      {/* Assign message */}
      {assignMessage && (
        <div
          className={`mt-3 rounded-[var(--r)] px-3 py-2 text-xs ${
            assignMessage.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {assignMessage.text}
        </div>
      )}

      {/* Recent log */}
      {recentLog.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[var(--ink-3)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Recente toewijzingen
            </p>
          </div>
          <div className="divide-y divide-[var(--border-ed)]">
            {recentLog.map((entry) => {
              const newStyle = TIER_STYLES[entry.new_tier as CommercialTier]
              return (
                <div key={entry.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--ink)]">{entry.targetName}</p>
                    <p className="text-[10px] text-[var(--ink-3)]">
                      {entry.old_tier ?? '—'} → {entry.new_tier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${newStyle?.badge ?? 'bg-zinc-100 text-zinc-600'}`}
                    >
                      {entry.new_tier}
                    </span>
                    <span className="text-[10px] text-[var(--ink-4)]">
                      {new Date(entry.created_at).toLocaleDateString('nl-NL', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TiersPage() {
  const [matrix, setMatrix] = useState<TierFeatureMatrix>(DEFAULT_TIER_MATRIX)
  const [savedMatrix, setSavedMatrix] = useState<TierFeatureMatrix>(DEFAULT_TIER_MATRIX)
  const [counts, setCounts] = useState<TierCounts>({ gratis: 0, connected: 0, ai: 0 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tier-config')
      if (!res.ok) throw new Error('Failed to fetch tier config')
      const data = await res.json()
      const loadedMatrix = { ...DEFAULT_TIER_MATRIX, ...data.matrix }
      setMatrix(loadedMatrix)
      setSavedMatrix(loadedMatrix)
      setCounts(data.counts ?? { gratis: 0, connected: 0, ai: 0 })
      setTotal(data.total ?? 0)
    } catch {
      setMessage({ type: 'error', text: 'Kon tier-configuratie niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // Compute which features have been changed
  const dirtyFeatures = new Set<string>()
  for (const featId of Object.keys(matrix)) {
    for (const tier of TIER_ORDER) {
      if ((matrix[featId]?.[tier] ?? false) !== (savedMatrix[featId]?.[tier] ?? false)) {
        dirtyFeatures.add(featId)
        break
      }
    }
  }

  const hasUnsavedChanges = dirtyFeatures.size > 0

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/tier-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setSavedMatrix(matrix)
      setMessage({ type: 'success', text: 'Tier-matrix opgeslagen' })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setMatrix(savedMatrix)
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-[var(--r-lg)] bg-zinc-200" />
          ))}
        </div>
        <div className="h-96 rounded-[var(--r-lg)] bg-zinc-200" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">Tier Beheer</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Commerciële tiers: Gratis / Connected / AI
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasUnsavedChanges}
          className="rounded-[var(--r)] bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>

      {/* Unsaved changes banner */}
      {hasUnsavedChanges && (
        <div className="flex items-center justify-between rounded-[var(--r)] border border-dashed px-4 py-2.5" style={{ borderColor: 'var(--hor-t)', backgroundColor: 'var(--hor-l)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--hor-t)' }}>
            {dirtyFeatures.size} onopgeslagen {dirtyFeatures.size === 1 ? 'wijziging' : 'wijzigingen'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-[var(--border-md)] px-3 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded px-3 py-1 text-xs font-medium text-[var(--paper)] disabled:opacity-40"
              style={{ backgroundColor: 'var(--hor-t)' }}
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div
          className={`rounded-[var(--r)] border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tier stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {TIERS.map((t) => (
          <TierStatCard
            key={t.id}
            tier={t.id}
            count={counts[t.id] ?? 0}
            total={total}
          />
        ))}
      </div>

      {/* Feature matrix */}
      <TierFeatureMatrixComponent
        matrix={matrix}
        onChange={(m) => { setMatrix(m); setMessage(null) }}
        dirtyFeatures={dirtyFeatures}
      />

      {/* Bottom row: pricing preview + assignment */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '55fr 45fr' }}>
        <TierPricingPreview matrix={matrix} />
        <TierAssignment />
      </div>
    </div>
  )
}
