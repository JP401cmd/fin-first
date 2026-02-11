'use client'

import { useState, useEffect, useCallback } from 'react'

interface Settings {
  ai_provider: string
  ai_model_anthropic: string
  ai_model_openai: string
  anthropic_api_key: string
  openai_api_key: string
  ai_system_prompt_override: string
}

const DEFAULT_SETTINGS: Settings = {
  ai_provider: 'anthropic',
  ai_model_anthropic: 'claude-sonnet-4-5-20250929',
  ai_model_openai: 'gpt-4o',
  anthropic_api_key: '',
  openai_api_key: '',
  ai_system_prompt_override: '',
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      const data = await res.json()
      setSettings({ ...DEFAULT_SETTINGS, ...data })
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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-zinc-200" />
          <div className="h-64 rounded-xl bg-zinc-200" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Admin — AI Instellingen</h1>
        <p className="mt-1 text-sm text-zinc-500">Beheer AI provider, model, API keys en systeem prompt</p>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Section 1: AI Provider */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">AI Provider</h2>

          <div className="mb-4 flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={settings.ai_provider === 'anthropic'}
                onChange={() => setSettings({ ...settings, ai_provider: 'anthropic' })}
                className="accent-amber-600"
              />
              <span className="text-sm font-medium text-zinc-700">Anthropic</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={settings.ai_provider === 'openai'}
                onChange={() => setSettings({ ...settings, ai_provider: 'openai' })}
                className="accent-amber-600"
              />
              <span className="text-sm font-medium text-zinc-700">OpenAI</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Model ({settings.ai_provider === 'anthropic' ? 'Anthropic' : 'OpenAI'})
            </label>
            <input
              type="text"
              value={
                settings.ai_provider === 'anthropic'
                  ? settings.ai_model_anthropic
                  : settings.ai_model_openai
              }
              onChange={(e) =>
                setSettings({
                  ...settings,
                  [settings.ai_provider === 'anthropic'
                    ? 'ai_model_anthropic'
                    : 'ai_model_openai']: e.target.value,
                })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="Model ID"
            />
          </div>
        </div>

        {/* Section 2: API Keys */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">API Keys</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Anthropic API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={settings.anthropic_api_key}
                  onChange={(e) =>
                    setSettings({ ...settings, anthropic_api_key: e.target.value })
                  }
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="sk-ant-..."
                />
                <StatusBadge configured={settings.anthropic_api_key !== '' && !settings.anthropic_api_key.includes('***')} />
              </div>
              {settings.anthropic_api_key.includes('***') && (
                <p className="mt-1 text-xs text-zinc-500">
                  Key is geconfigureerd. Laat leeg om niet te wijzigen, of voer een nieuwe key in.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                OpenAI API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={settings.openai_api_key}
                  onChange={(e) =>
                    setSettings({ ...settings, openai_api_key: e.target.value })
                  }
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="sk-..."
                />
                <StatusBadge configured={settings.openai_api_key !== '' && !settings.openai_api_key.includes('***')} />
              </div>
              {settings.openai_api_key.includes('***') && (
                <p className="mt-1 text-xs text-zinc-500">
                  Key is geconfigureerd. Laat leeg om niet te wijzigen, of voer een nieuwe key in.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: System Prompt Override */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">System Prompt Override</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Laat leeg om het standaard DNA-prompt te gebruiken. Als je hier tekst invult, vervangt dit het basis systeem prompt.
          </p>
          <textarea
            value={settings.ai_system_prompt_override}
            onChange={(e) =>
              setSettings({ ...settings, ai_system_prompt_override: e.target.value })
            }
            rows={12}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 font-mono focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="Leeg = standaard TriFinity DNA prompt wordt gebruikt..."
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Opslaan...' : 'Instellingen opslaan'}
          </button>
        </div>
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
          : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-green-500' : 'bg-zinc-400'}`} />
      {configured ? 'Geconfigureerd' : 'Niet ingesteld'}
    </span>
  )
}
