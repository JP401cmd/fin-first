'use client'

import { useState, useEffect, useCallback } from 'react'
import { PERSONAS, PERSONA_KEYS, type PersonaKey, type PersonaMeta } from '@/lib/test-personas'
import { BudgetAlert } from '@/components/app/budget-alert'
import { RELEASE_NOTES, type ReleaseNote, type ReleaseSection } from '@/lib/release-notes'
import { ChevronDown, ChevronUp, Tag } from 'lucide-react'

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

const TABLE_LABELS: Record<string, string> = {
  profiles: 'Profiel',
  bank_accounts: 'Bankrekeningen',
  assets: 'Bezittingen',
  debts: 'Schulden',
  budgets: 'Budgetten',
  transactions: 'Transacties',
  goals: 'Doelen',
  life_events: 'Levensgebeurtenissen',
  recommendations: 'Aanbevelingen',
  actions: 'Acties',
  net_worth_snapshots: 'Vermogenssnapshots',
}

interface SeedStep {
  step: string
  progress: number
  table: string
  action: 'delete' | 'insert' | 'update'
  count?: number
}

interface SeedSummary {
  done: true
  summary: Record<string, number>
}

type SeedEvent = SeedStep | SeedSummary | { error: string }

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Seed state
  const [seeding, setSeeding] = useState(false)
  const [seedProgress, setSeedProgress] = useState(0)
  const [seedStep, setSeedStep] = useState('')
  const [seedSteps, setSeedSteps] = useState<SeedStep[]>([])
  const [seedSummary, setSeedSummary] = useState<Record<string, number> | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [confirmPersona, setConfirmPersona] = useState<PersonaKey | null>(null)

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

  async function handleSeed(personaKey: PersonaKey) {
    setConfirmPersona(null)
    setSeeding(true)
    setSeedProgress(0)
    setSeedStep('Starten...')
    setSeedSteps([])
    setSeedSummary(null)
    setSeedError(null)

    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: personaKey }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Seed request mislukt')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          const event: SeedEvent = JSON.parse(line)

          if ('error' in event) {
            setSeedError(event.error)
            setSeeding(false)
            return
          }

          if ('done' in event && event.done) {
            setSeedSummary(event.summary)
            setSeedProgress(100)
            setSeedStep('Klaar!')
            setSeeding(false)
            return
          }

          if ('step' in event && 'progress' in event) {
            setSeedProgress(event.progress)
            setSeedStep(event.step)
            setSeedSteps((prev) => [...prev, event as SeedStep])
          }
        }
      }
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSeeding(false)
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
        <h1 className="text-2xl font-bold text-zinc-900">Admin</h1>
        <p className="mt-1 text-sm text-zinc-500">Beheer AI instellingen en testdata</p>
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

        {/* ── Section 4: Testdata Personas ─────────────────── */}
        <div className="mt-12 border-t border-zinc-200 pt-10">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-zinc-900">Testdata laden</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Selecteer een persona om de applicatie te vullen met testdata. Dit wist alle huidige data.
            </p>
          </div>

          {/* Persona cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PERSONA_KEYS.map((key) => {
              const meta = PERSONAS[key].meta
              return (
                <PersonaCard
                  key={key}
                  personaKey={key}
                  meta={meta}
                  disabled={seeding}
                  onSelect={() => setConfirmPersona(key)}
                />
              )
            })}
          </div>

          {/* Confirmation dialog */}
          {confirmPersona && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-zinc-900">Bevestiging</h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Dit wist <span className="font-semibold text-red-600">AL</span> je huidige financiele data en vervangt het met de gegevens van{' '}
                  <span className="font-semibold">{PERSONAS[confirmPersona].meta.name}</span>. Doorgaan?
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmPersona(null)}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={() => handleSeed(confirmPersona)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    Bevestigen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(seeding || seedSummary || seedError) && (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700">
                  {seeding ? 'Bezig met laden...' : seedError ? 'Fout opgetreden' : 'Voltooid'}
                </span>
                <span className="text-sm text-zinc-500">{seedProgress}%</span>
              </div>

              {/* Progress bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    seedError ? 'bg-red-500' : seedProgress === 100 ? 'bg-green-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${seedProgress}%` }}
                />
              </div>

              {/* Current step */}
              <p className="mt-2 text-sm text-zinc-500">{seedStep}</p>

              {/* Error message */}
              {seedError && (
                <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
                  {seedError}
                </div>
              )}

              {/* Summary table */}
              {seedSummary && (
                <div className="mt-4">
                  <h4 className="mb-2 text-sm font-semibold text-zinc-700">Samenvatting</h4>
                  <div className="overflow-hidden rounded-lg border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50">
                          <th className="px-3 py-2 text-left font-medium text-zinc-600">Tabel</th>
                          <th className="px-3 py-2 text-left font-medium text-zinc-600">Actie</th>
                          <th className="px-3 py-2 text-right font-medium text-zinc-600">Records</th>
                          <th className="px-3 py-2 text-center font-medium text-zinc-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {seedSteps
                          .filter((s) => s.action === 'insert' || s.action === 'update')
                          .map((s, i) => (
                          <tr key={i} className="hover:bg-zinc-50">
                            <td className="px-3 py-1.5 text-zinc-700 font-mono text-xs">{TABLE_LABELS[s.table] ?? s.table}</td>
                            <td className="px-3 py-1.5">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                s.action === 'insert' ? 'bg-green-50 text-green-700' :
                                'bg-blue-50 text-blue-700'
                              }`}>
                                {s.action === 'insert' ? 'Gevuld' : 'Bijgewerkt'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right text-zinc-700 font-mono text-xs">
                              {s.count ?? '-'}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <svg className="inline h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                    {Object.entries(seedSummary).map(([key, count]) => (
                      <span key={key}>
                        <span className="font-medium text-zinc-700">{TABLE_LABELS[key] ?? key}:</span> {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Section 5: Release Notes ─────────────────────── */}
        <div className="mt-12 border-t border-zinc-200 pt-10">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-zinc-400" />
              <h2 className="text-xl font-bold text-zinc-900">Release Notes</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Versiegeschiedenis en wijzigingen per release
            </p>
          </div>

          <div className="space-y-4">
            {RELEASE_NOTES.map((release, i) => (
              <ReleaseCard key={release.version} release={release} defaultOpen={i === 0} />
            ))}
          </div>
        </div>

        {/* ── Section 6: Meldingoverzicht ─────────────────── */}
        <div className="mt-12 border-t border-zinc-200 pt-10">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-zinc-900">Meldingoverzicht</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Alle mogelijke budget-meldingen per type — live preview
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Inkomen */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700">Inkomen</h3>
              <p className="text-xs text-zinc-400">Geen meldingen — inkomen dat de limiet overschrijdt is positief</p>
            </div>

            {/* Uitgaven */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700">Uitgaven</h3>
              <div className="space-y-2">
                <BudgetAlert
                  budgetName="Boodschappen"
                  budgetId="demo-warning"
                  spent={425}
                  limit={500}
                  threshold={80}
                  budgetType="expense"
                />
                <BudgetAlert
                  budgetName="Horeca & eten"
                  budgetId="demo-danger"
                  spent={210}
                  limit={200}
                  threshold={80}
                  budgetType="expense"
                />
                <BudgetAlert
                  budgetName="Kleding"
                  budgetId="demo-critical"
                  spent={250}
                  limit={200}
                  threshold={80}
                  budgetType="expense"
                />
              </div>
            </div>

            {/* Sparen */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700">Sparen</h3>
              <div className="space-y-2">
                <BudgetAlert
                  budgetName="Sparen & noodbuffer"
                  budgetId="demo-savings"
                  spent={45}
                  limit={100}
                  threshold={80}
                  budgetType="savings"
                />
              </div>
            </div>

            {/* Schulden */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700">Schulden</h3>
              <div className="space-y-2">
                <BudgetAlert
                  budgetName="Schulden & aflossingen"
                  budgetId="demo-debt"
                  spent={18}
                  limit={60}
                  threshold={80}
                  budgetType="debt"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PersonaCard({
  personaKey,
  meta,
  disabled,
  onSelect,
}: {
  personaKey: PersonaKey
  meta: PersonaMeta
  disabled: boolean
  onSelect: () => void
}) {
  const colorClasses: Record<string, { bg: string; border: string; text: string }> = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  }
  const colors = colorClasses[meta.color] ?? colorClasses.amber

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5 transition-all hover:shadow-md`}>
      <div className="flex items-start gap-3">
        {/* Avatar circle */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
          style={{ backgroundColor: meta.avatarColor }}
        >
          {meta.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold ${colors.text}`}>{meta.name}</h3>
          <p className="text-xs font-medium text-zinc-500">{meta.subtitle}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-600 line-clamp-2">{meta.description}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Vermogen: <span className={`font-semibold ${meta.netWorth < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(meta.netWorth)}</span></span>
        <span>Inkomen: <span className="font-medium text-zinc-700">{formatCurrency(meta.income)}/mnd</span></span>
        <span>Uitgaven: <span className="font-medium text-zinc-700">{formatCurrency(meta.expenses)}/mnd</span></span>
      </div>

      <button
        onClick={onSelect}
        disabled={disabled}
        className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        style={{ backgroundColor: disabled ? '#a1a1aa' : meta.avatarColor }}
      >
        {disabled ? 'Bezig...' : 'Laden'}
      </button>
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

// ── Release Notes Components ─────────────────────────────────

const MODULE_COLORS: Record<string, { badge: string; dot: string }> = {
  amber: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  teal: { badge: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  purple: { badge: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  blue: { badge: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  zinc: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-200', dot: 'bg-zinc-500' },
  rose: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
}

function ReleaseCard({ release, defaultOpen }: { release: ReleaseNote; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const totalItems = release.sections.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-bold font-mono text-zinc-700">
            {release.version}
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900">{release.title}</p>
            <p className="text-xs text-zinc-400">
              {new Date(release.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' '}&middot;{' '}
              {totalItems} wijziging{totalItems !== 1 ? 'en' : ''}
              {' '}&middot;{' '}
              {release.sections.length} module{release.sections.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-6 py-5 space-y-5">
          {release.sections.map((section) => (
            <ReleaseSectionBlock key={section.module} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReleaseSectionBlock({ section }: { section: ReleaseSection }) {
  const colors = MODULE_COLORS[section.color] ?? MODULE_COLORS.zinc

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${colors.badge}`}>
          {section.module}
        </span>
        <span className="text-xs text-zinc-400">{section.items.length} item{section.items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="ml-4 space-y-2">
        {section.items.map((item) => (
          <div key={item.title} className="rounded-lg bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-800">{item.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
