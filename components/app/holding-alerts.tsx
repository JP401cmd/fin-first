'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Bell, BellOff, Plus, Trash2, ArrowUp, ArrowDown,
  TrendingUp, BarChart3, Loader2, AlertTriangle, X,
} from 'lucide-react'

type AlertType = 'price_above' | 'price_below' | 'return_threshold' | 'rebalance_drift'

type HoldingAlert = {
  id: string
  holding_id: string | null
  type: AlertType
  threshold: number
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

type HoldingAlertsProps = {
  holdingId: string
  holdingName: string
  currentPrice: number
}

const alertTypeConfig: Record<AlertType, {
  label: string
  description: string
  icon: typeof ArrowUp
  color: string
  bg: string
  unit: string
  placeholder: string
}> = {
  price_above: {
    label: 'Prijs boven',
    description: 'Melding als de prijs stijgt boven drempel',
    icon: ArrowUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    unit: '\u20AC',
    placeholder: '100.00',
  },
  price_below: {
    label: 'Prijs onder',
    description: 'Melding als de prijs daalt onder drempel',
    icon: ArrowDown,
    color: 'text-red-600',
    bg: 'bg-red-50',
    unit: '\u20AC',
    placeholder: '50.00',
  },
  return_threshold: {
    label: 'Rendement',
    description: 'Melding bij opgegeven rendement (%)',
    icon: TrendingUp,
    color: 'text-kern-600',
    bg: 'bg-kern-50',
    unit: '%',
    placeholder: '10',
  },
  rebalance_drift: {
    label: 'Allocatie-drift',
    description: 'Melding als allocatie >X% afwijkt van doel',
    icon: BarChart3,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    unit: '%',
    placeholder: '5',
  },
}

export default function HoldingAlerts({
  holdingId,
  holdingName,
  currentPrice,
}: HoldingAlertsProps) {
  const [alerts, setAlerts] = useState<HoldingAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newType, setNewType] = useState<AlertType>('price_above')
  const [newThreshold, setNewThreshold] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/holding-alerts?holding_id=${holdingId}`)
      if (!res.ok) throw new Error('Kon alerts niet laden')
      const data = await res.json()
      setAlerts(data.alerts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij laden')
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  async function handleCreate() {
    if (!newThreshold) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/holding-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: holdingId,
          type: newType,
          threshold: Number(newThreshold),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Kon alert niet aanmaken')
      }
      setShowForm(false)
      setNewThreshold('')
      loadAlerts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij aanmaken')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(alertId: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/holding-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, is_active: !currentActive }),
      })
      if (!res.ok) throw new Error('Kon alert niet wijzigen')
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_active: !currentActive } : a))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij wijzigen')
    }
  }

  async function handleDelete(alertId: string) {
    setDeleting(alertId)
    try {
      const res = await fetch(`/api/holding-alerts?id=${alertId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Kon alert niet verwijderen')
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij verwijderen')
    } finally {
      setDeleting(null)
    }
  }

  function formatThreshold(type: AlertType, threshold: number): string {
    if (type === 'price_above' || type === 'price_below') {
      return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(threshold)
    }
    return `${threshold}%`
  }

  function getAlertStatus(alert: HoldingAlert): { triggered: boolean; label: string } {
    if (alert.type === 'price_above') {
      const triggered = currentPrice >= alert.threshold
      return { triggered, label: triggered ? 'Bereikt' : `Nog ${formatThreshold('price_above', alert.threshold - currentPrice)} te gaan` }
    }
    if (alert.type === 'price_below') {
      const triggered = currentPrice <= alert.threshold
      return { triggered, label: triggered ? 'Bereikt' : `Prijs is ${formatThreshold('price_below', currentPrice - alert.threshold)} erboven` }
    }
    return { triggered: false, label: 'Actief' }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-[var(--ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Alerts laden...
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="holding-alerts">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-2)]">
          <Bell className="h-4 w-4 text-kern-500" />
          Prijs-alerts
          {alerts.length > 0 && (
            <span className="ml-1 rounded-full bg-kern-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-kern-700">
              {alerts.filter(a => a.is_active).length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-kern-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-kern-700"
          data-testid="new-alert-btn"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showForm ? 'Sluiten' : 'Alert toevoegen'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* New alert form */}
      {showForm && (
        <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50/30 p-4" data-testid="alert-form">
          {/* Type selector */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.entries(alertTypeConfig) as [AlertType, typeof alertTypeConfig[AlertType]][]).map(([type, cfg]) => {
              const Icon = cfg.icon
              return (
                <button
                  key={type}
                  onClick={() => setNewType(type)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all ${
                    newType === type
                      ? `${cfg.bg} border-current ${cfg.color} ring-1 ring-offset-0`
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                  }`}
                  data-testid={`alert-type-${type}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          <p className="mb-3 text-xs text-[var(--ink-3)]">
            {alertTypeConfig[newType].description}
          </p>

          {/* Threshold input */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium text-[var(--ink-3)]">
                Drempel ({alertTypeConfig[newType].unit}) *
              </label>
              <input
                type="number"
                step={newType === 'price_above' || newType === 'price_below' ? '0.01' : '1'}
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-ed)] px-2.5 py-1.5 text-sm"
                placeholder={alertTypeConfig[newType].placeholder}
                autoFocus
                data-testid="alert-threshold-input"
              />
              {(newType === 'price_above' || newType === 'price_below') && currentPrice > 0 && (
                <p className="mt-1 text-[10px] text-[var(--ink-3)]">
                  Huidige prijs: {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(currentPrice)}
                </p>
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={saving || !newThreshold}
              className="rounded-lg bg-kern-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              data-testid="alert-save-btn"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Alert list */}
      {alerts.length === 0 && !showForm ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
          <BellOff className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
          <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Geen alerts ingesteld</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Ontvang meldingen bij prijswijzigingen of allocatie-drift.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5" data-testid="alert-list">
          {alerts.map((alert) => {
            const cfg = alertTypeConfig[alert.type]
            const Icon = cfg.icon
            const status = getAlertStatus(alert)

            return (
              <div
                key={alert.id}
                className={`flex items-center gap-3 rounded-[var(--r-lg)] border p-3 transition-colors ${
                  alert.is_active
                    ? 'border-[var(--border-ed)] bg-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)] opacity-60'
                }`}
                data-testid={`alert-item-${alert.id}`}
              >
                {/* Icon */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className="font-mono text-sm font-bold text-[var(--ink)]">
                      {formatThreshold(alert.type, alert.threshold)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {status.triggered ? (
                      <span className="font-medium text-emerald-600">{status.label}</span>
                    ) : (
                      status.label
                    )}
                    {alert.last_triggered_at && (
                      <span className="ml-2">
                        Laatst: {new Date(alert.last_triggered_at).toLocaleDateString('nl-NL', {
                          day: 'numeric', month: 'short',
                        })}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleToggle(alert.id, alert.is_active)}
                    className={`rounded-lg p-1.5 transition-colors ${
                      alert.is_active
                        ? 'text-kern-600 hover:bg-kern-50'
                        : 'text-[var(--ink-4)] hover:bg-[var(--subtle)]'
                    }`}
                    title={alert.is_active ? 'Alert deactiveren' : 'Alert activeren'}
                    data-testid={`alert-toggle-${alert.id}`}
                  >
                    {alert.is_active ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    disabled={deleting === alert.id}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    title="Alert verwijderen"
                    data-testid={`alert-delete-${alert.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
