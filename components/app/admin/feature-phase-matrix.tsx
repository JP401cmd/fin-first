'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  PHASES,
  FEATURES,
  DEFAULT_MATRIX,
  type FeaturePhaseMatrix,
} from '@/lib/feature-phases'

// Phase color styles using CSS variables — keyed by phase cssName
const PHASE_HEADER_STYLE: Record<string, React.CSSProperties> = {
  phase_recovery:  { backgroundColor: 'var(--color-phase-recovery-50)',  color: 'var(--color-phase-recovery-700)' },
  phase_stability: { backgroundColor: 'var(--color-phase-stability-50)', color: 'var(--color-phase-stability-700)' },
  phase_momentum:  { backgroundColor: 'var(--color-phase-momentum-50)',  color: 'var(--color-phase-momentum-700)' },
  phase_mastery:   { backgroundColor: 'var(--color-phase-mastery-50)',   color: 'var(--color-phase-mastery-700)' },
}

export function FeaturePhaseMatrix() {
  const [matrix, setMatrix] = useState<FeaturePhaseMatrix>(DEFAULT_MATRIX)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const fetchMatrix = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) return
      const data = await res.json()
      if (data.feature_phase_matrix) {
        setMatrix({ ...DEFAULT_MATRIX, ...data.feature_phase_matrix })
      }
    } catch {
      // Use defaults on error
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    fetchMatrix()
  }, [fetchMatrix])

  function toggle(featureId: string, phaseId: string) {
    setMatrix((prev) => ({
      ...prev,
      [featureId]: {
        ...prev[featureId],
        [phaseId]: !prev[featureId]?.[phaseId],
      },
    }))
    setMessage(null)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_phase_matrix: matrix }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setMessage({ type: 'success', text: 'Matrix opgeslagen' })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setMatrix(DEFAULT_MATRIX)
    setMessage(null)
  }

  if (!loaded) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-48 rounded bg-zinc-200" />
        <div className="h-64 rounded-[var(--r-lg)] bg-zinc-200" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-[var(--ink)]">Feature-Fase Matrix</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Configureer welke functionaliteiten beschikbaar zijn per soevereiniteitsfase
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-[var(--ink-2)] bg-[var(--subtle)] min-w-[200px]">
                Feature
              </th>
              {PHASES.map((phase) => {
                const headerStyle = PHASE_HEADER_STYLE[phase.cssName] ?? {}
                return (
                  <th
                    key={phase.id}
                    className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider"
                    style={headerStyle}
                  >
                    <div>{phase.label}</div>
                    <div className="mt-0.5 font-normal normal-case tracking-normal text-[10px] opacity-70">
                      Lvl {phase.levels.join(', ')}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {FEATURES.map((feature) => (
              <tr key={feature.id} className="hover:bg-[var(--subtle)] transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-800">{feature.label}</div>
                  <div className="text-xs text-[var(--ink-3)]">{feature.description}</div>
                </td>
                {PHASES.map((phase) => {
                  const checked = matrix[feature.id]?.[phase.id] ?? false
                  const accentColor = checked
                    ? `var(--color-${phase.cssName.replace('_', '-')}-600)`
                    : 'var(--border-md)'
                  return (
                    <td key={phase.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(feature.id, phase.id)}
                        className="h-4 w-4 cursor-pointer rounded"
                        style={{ accentColor }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={handleReset}
          className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
        >
          Standaardwaarden herstellen
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-kern-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Opslaan...' : 'Matrix opslaan'}
        </button>
      </div>
    </div>
  )
}
