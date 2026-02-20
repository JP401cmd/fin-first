'use client'

import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'

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

export default function BeheerAIPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [defaultPrompt, setDefaultPrompt] = useState<string>('')
  const [showDefaultPreview, setShowDefaultPreview] = useState(false)

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

  const fetchDefaultPrompt = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai-prompt-default')
      if (!res.ok) return
      const data = await res.json()
      setDefaultPrompt(data.prompt ?? '')
    } catch {
      // silently fail — default prompt preview is optional
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchDefaultPrompt()
  }, [fetchSettings, fetchDefaultPrompt])

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

  const hasOverride = settings.ai_system_prompt_override.trim().length > 0

  function handleResetPrompt() {
    setSettings({ ...settings, ai_system_prompt_override: '' })
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200" />
        <div className="h-64 rounded-[var(--r-lg)] bg-zinc-200" />
      </div>
    )
  }

  // Show the active prompt text (override or default) in the textarea
  const promptValue = hasOverride ? settings.ai_system_prompt_override : defaultPrompt

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

      {/* AI Provider */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">AI Provider</h2>

        <div className="mb-4 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              value="anthropic"
              checked={settings.ai_provider === 'anthropic'}
              onChange={() => setSettings({ ...settings, ai_provider: 'anthropic' })}
              className="accent-kern-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">Anthropic</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              value="openai"
              checked={settings.ai_provider === 'openai'}
              onChange={() => setSettings({ ...settings, ai_provider: 'openai' })}
              className="accent-kern-600"
            />
            <span className="text-sm font-medium text-[var(--ink-2)]">OpenAI</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">
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
            className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500"
            placeholder="Model ID"
          />
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">API Keys</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">
              Anthropic API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={settings.anthropic_api_key}
                onChange={(e) =>
                  setSettings({ ...settings, anthropic_api_key: e.target.value })
                }
                className="flex-1 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500"
                placeholder="sk-ant-..."
              />
              <StatusBadge configured={settings.anthropic_api_key !== '' && !settings.anthropic_api_key.includes('***')} />
            </div>
            {settings.anthropic_api_key.includes('***') && (
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Key is geconfigureerd. Laat leeg om niet te wijzigen, of voer een nieuwe key in.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1">
              OpenAI API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={settings.openai_api_key}
                onChange={(e) =>
                  setSettings({ ...settings, openai_api_key: e.target.value })
                }
                className="flex-1 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-kern-500 focus:outline-none focus:ring-1 focus:ring-kern-500"
                placeholder="sk-..."
              />
              <StatusBadge configured={settings.openai_api_key !== '' && !settings.openai_api_key.includes('***')} />
            </div>
            {settings.openai_api_key.includes('***') && (
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                Key is geconfigureerd. Laat leeg om niet te wijzigen, of voer een nieuwe key in.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Will's System Prompt */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Will&apos;s Systeem Prompt</h2>
            {hasOverride && (
              <span className="rounded-full bg-wil-100 px-2.5 py-0.5 text-xs font-medium text-wil-700">
                Aangepast
              </span>
            )}
          </div>
          {hasOverride && (
            <button
              type="button"
              onClick={handleResetPrompt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              <RotateCcw className="h-3 w-3" />
              Reset naar standaard
            </button>
          )}
        </div>

        <p className="mb-3 text-sm text-[var(--ink-3)]">
          {hasOverride
            ? 'Je gebruikt een aangepast prompt. Dit vervangt het volledige standaard prompt (inclusief persoonlijkheid).'
            : 'Dit is het standaard prompt van Will. Bewerk het om een aangepast prompt te gebruiken.'}
        </p>

        <textarea
          value={promptValue}
          onChange={(e) =>
            setSettings({ ...settings, ai_system_prompt_override: e.target.value })
          }
          rows={16}
          className="w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] font-mono focus:border-wil-500 focus:outline-none focus:ring-1 focus:ring-wil-500"
          placeholder="Leeg = standaard Will prompt wordt gebruikt..."
        />

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-[var(--ink-3)]">
            {promptValue.length.toLocaleString('nl-NL')} tekens
          </span>
        </div>

        {/* Default prompt preview when override is active */}
        {hasOverride && defaultPrompt && (
          <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]">
            <button
              type="button"
              onClick={() => setShowDefaultPreview(!showDefaultPreview)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            >
              <span>Standaard prompt bekijken</span>
              {showDefaultPreview ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {showDefaultPreview && (
              <div className="border-t border-[var(--border-ed)] px-3 py-2">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[var(--ink-3)] font-mono">
                  {defaultPrompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
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
