'use client'

import { useState, useEffect, useCallback } from 'react'

interface TLSettings {
  truelayer_enabled: string
  truelayer_client_id: string
  truelayer_client_secret: string
  truelayer_environment: string
}

const DEFAULT_SETTINGS: TLSettings = {
  truelayer_enabled: 'false',
  truelayer_client_id: '',
  truelayer_client_secret: '',
  truelayer_environment: 'sandbox',
}

export default function BeheerBankConnectPage() {
  const [settings, setSettings] = useState<TLSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      const data = await res.json()
      setSettings({
        truelayer_enabled: data.truelayer_enabled || 'false',
        truelayer_client_id: data.truelayer_client_id || '',
        truelayer_client_secret: data.truelayer_client_secret || '',
        truelayer_environment: data.truelayer_environment || 'sandbox',
      })
    } catch {
      setMessage({ type: 'error', text: 'Kon instellingen niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setMessage({ type: 'success', text: 'Instellingen opgeslagen' })
      await fetchSettings()
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/bank-connect/test-connection', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: data.message })
      } else {
        setMessage({ type: 'error', text: data.message || 'Verbinding mislukt' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Verbinding test mislukt' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200" />
        <div className="h-64 rounded-[var(--r-lg)] bg-zinc-200" />
      </div>
    )
  }

  const isEnabled = settings.truelayer_enabled === 'true'
  const hasCredentials = settings.truelayer_client_id !== '' && settings.truelayer_client_secret !== ''

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Feature toggle */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">TrueLayer Bankverbinding</h2>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          Schakel automatische bankconnectiviteit in via de TrueLayer Data API.
          Gebruikers kunnen hun bankrekening koppelen om transacties automatisch te synchroniseren.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) =>
                setSettings({ ...settings, truelayer_enabled: e.target.checked ? 'true' : 'false' })
              }
              className="sr-only"
            />
            <div className={`block h-6 w-11 rounded-full transition-colors ${
              isEnabled ? 'bg-kern-500' : 'bg-zinc-300'
            }`} />
            <div className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--paper)] shadow transition-transform ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </div>
          <span className="text-sm font-medium text-[var(--ink-2)]">
            {isEnabled ? 'Ingeschakeld' : 'Uitgeschakeld'}
          </span>
        </label>

        {!isEnabled && (
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            Wanneer uitgeschakeld is de bankverbinding-functie onzichtbaar voor alle gebruikers.
          </p>
        )}
      </div>

      {/* Credentials */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">API Credentials</h2>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          Verkrijg je Client ID en Client Secret via de{' '}
          <a href="https://console.truelayer.com" target="_blank" rel="noopener noreferrer" className="text-kern-600 underline hover:text-kern-700">
            TrueLayer Console
          </a>.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">Client ID</label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={settings.truelayer_client_id}
                onChange={(e) => setSettings({ ...settings, truelayer_client_id: e.target.value })}
                className="flex-1 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500"
                placeholder="Voer Client ID in..."
              />
              <StatusBadge configured={settings.truelayer_client_id !== '' && !settings.truelayer_client_id.includes('***')} />
            </div>
            {settings.truelayer_client_id.includes('***') && (
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Geconfigureerd. Voer een nieuwe waarde in om te wijzigen.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">Client Secret</label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={settings.truelayer_client_secret}
                onChange={(e) => setSettings({ ...settings, truelayer_client_secret: e.target.value })}
                className="flex-1 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500"
                placeholder="Voer Client Secret in..."
              />
              <StatusBadge configured={settings.truelayer_client_secret !== '' && !settings.truelayer_client_secret.includes('***')} />
            </div>
            {settings.truelayer_client_secret.includes('***') && (
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Geconfigureerd. Voer een nieuwe waarde in om te wijzigen.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Environment */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Omgeving</h2>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="environment"
              value="sandbox"
              checked={settings.truelayer_environment === 'sandbox'}
              onChange={() => setSettings({ ...settings, truelayer_environment: 'sandbox' })}
              className="accent-kern-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">Sandbox</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="environment"
              value="production"
              checked={settings.truelayer_environment === 'production'}
              onChange={() => setSettings({ ...settings, truelayer_environment: 'production' })}
              className="accent-kern-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">Productie</span>
          </label>
        </div>
        {settings.truelayer_environment === 'sandbox' && (
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            Sandbox-modus gebruikt testbanken en testdata. Schakel naar productie voor echte bankverbindingen.
          </p>
        )}
      </div>

      {/* Test connection + Save */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleTestConnection}
          disabled={testing || !hasCredentials}
          className="rounded-lg border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {testing ? 'Testen...' : 'Test verbinding'}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-kern-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Opslaan...' : 'Instellingen opslaan'}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        configured
          ? 'bg-green-50 text-green-700'
          : 'bg-zinc-100 text-[var(--ink-3)]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-green-500' : 'bg-zinc-400'}`} />
      {configured ? 'Geconfigureerd' : 'Niet ingesteld'}
    </span>
  )
}
