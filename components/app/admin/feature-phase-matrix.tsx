'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  PHASES,
  FEATURES,
  DEFAULT_MATRIX,
  type FeaturePhaseMatrix,
} from '@/lib/feature-phases'

const PHASE_COLORS: Record<string, { header: string; checked: string; unchecked: string }> = {
  rose:  { header: 'bg-rose-50 text-rose-700',  checked: 'accent-rose-600',  unchecked: 'accent-zinc-300' },
  blue:  { header: 'bg-blue-50 text-blue-700',  checked: 'accent-blue-600',  unchecked: 'accent-zinc-300' },
  teal:  { header: 'bg-teal-50 text-teal-700',  checked: 'accent-teal-600',  unchecked: 'accent-zinc-300' },
  amber: { header: 'bg-amber-50 text-amber-700', checked: 'accent-amber-600', unchecked: 'accent-zinc-300' },
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
        <div className="h-64 rounded-xl bg-zinc-200" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold text-zinc-900">Feature-Fase Matrix</h2>
        <p className="mt-1 text-sm text-zinc-500">
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

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 bg-zinc-50 min-w-[200px]">
                Feature
              </th>
              {PHASES.map((phase) => {
                const colors = PHASE_COLORS[phase.color]
                return (
                  <th
                    key={phase.id}
                    className={`px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider ${colors.header}`}
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
              <tr key={feature.id} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-800">{feature.label}</div>
                  <div className="text-xs text-zinc-400">{feature.description}</div>
                </td>
                {PHASES.map((phase) => {
                  const checked = matrix[feature.id]?.[phase.id] ?? false
                  const colors = PHASE_COLORS[phase.color]
                  return (
                    <td key={phase.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(feature.id, phase.id)}
                        className={`h-4 w-4 cursor-pointer rounded ${checked ? colors.checked : colors.unchecked}`}
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
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Standaardwaarden herstellen
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Opslaan...' : 'Matrix opslaan'}
        </button>
      </div>
    </div>
  )
}
