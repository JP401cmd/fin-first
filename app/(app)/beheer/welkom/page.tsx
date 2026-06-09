'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Eye,
  RotateCcw,
} from 'lucide-react'
import { GuideScreenView } from '@/components/overview/guide-screen-view'
import {
  ALLOWED_ICONS,
  DEFAULT_WELCOME_GUIDE,
  type GuideIcon,
  type WelcomeGuideConfig,
  type WelcomeGuideScreen,
  type WelcomeGuideStep,
} from '@/lib/welcome-guide'

/**
 * /beheer/welkom — superadmin stelt de welkomstgids volledig samen: schermen +
 * stappen toevoegen/verwijderen/herordenen, alle teksten/links/iconen bewerken,
 * verplicht/optioneel + aan/uit togglen, met live-preview per scherm. Spiegelt
 * de UX van /beheer/coach. Opslag via /api/admin/welcome-guide (app_settings).
 */

let _idCounter = 0
function newId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`
}

type Msg = { type: 'success' | 'error'; text: string } | null

export default function BeheerWelkomPage() {
  const [config, setConfig] = useState<WelcomeGuideConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [isDefault, setIsDefault] = useState(true)
  const [message, setMessage] = useState<Msg>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState<Set<string>>(new Set())

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/welcome-guide')
      if (!res.ok) {
        setMessage({ type: 'error', text: 'Kon config niet laden (geen toegang?)' })
        return
      }
      const data = await res.json()
      setConfig(data.config)
      setIsDefault(!!data.isDefault)
      setDirty(false)
    } catch {
      setMessage({ type: 'error', text: 'Kon config niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])

  // ── Immutabele updaters ──
  const update = useCallback((next: WelcomeGuideConfig) => {
    setConfig(next)
    setDirty(true)
  }, [])

  function patchConfig(patch: Partial<WelcomeGuideConfig>) {
    if (!config) return
    update({ ...config, ...patch })
  }
  function setScreens(screens: WelcomeGuideScreen[]) {
    if (!config) return
    update({ ...config, screens })
  }
  function patchScreen(i: number, patch: Partial<WelcomeGuideScreen>) {
    if (!config) return
    setScreens(config.screens.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function moveScreen(i: number, dir: -1 | 1) {
    if (!config) return
    const j = i + dir
    if (j < 0 || j >= config.screens.length) return
    const arr = [...config.screens]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setScreens(arr)
  }
  function deleteScreen(i: number) {
    if (!config) return
    setScreens(config.screens.filter((_, idx) => idx !== i))
  }
  function addScreen() {
    if (!config) return
    const screen: WelcomeGuideScreen = {
      id: newId('screen'),
      title: 'Nieuw scherm',
      intro: '',
      layout: 'list',
      required: false,
      enabled: true,
      steps: [],
    }
    setScreens([...config.screens, screen])
    setExpanded((prev) => new Set(prev).add(screen.id))
  }
  function patchStep(si: number, ti: number, patch: Partial<WelcomeGuideStep>) {
    if (!config) return
    const screen = config.screens[si]
    const steps = screen.steps.map((st, idx) => (idx === ti ? { ...st, ...patch } : st))
    patchScreen(si, { steps })
  }
  function moveStep(si: number, ti: number, dir: -1 | 1) {
    if (!config) return
    const steps = [...config.screens[si].steps]
    const j = ti + dir
    if (j < 0 || j >= steps.length) return
    ;[steps[ti], steps[j]] = [steps[j], steps[ti]]
    patchScreen(si, { steps })
  }
  function deleteStep(si: number, ti: number) {
    if (!config) return
    patchScreen(si, { steps: config.screens[si].steps.filter((_, idx) => idx !== ti) })
  }
  function addStep(si: number) {
    if (!config) return
    const step: WelcomeGuideStep = {
      id: newId('step'),
      title: 'Nieuwe stap',
      description: '',
      href: '',
      enabled: true,
    }
    patchScreen(si, { steps: [...config.screens[si].steps, step] })
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function togglePreview(id: string) {
    setPreviewing((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/welcome-guide', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setConfig(data?.config ?? config)
        setIsDefault(false)
        setDirty(false)
        setMessage({ type: 'success', text: 'Welkomstgids opgeslagen' })
      } else {
        setMessage({ type: 'error', text: data?.error ?? 'Opslaan mislukt' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/welcome-guide', { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setConfig(data?.config ?? DEFAULT_WELCOME_GUIDE)
        setIsDefault(true)
        setDirty(false)
        setMessage({ type: 'success', text: 'Teruggezet naar standaard' })
      } else {
        setMessage({ type: 'error', text: 'Herstellen mislukt' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
      </div>
    )
  }

  if (!config) {
    return <p className="text-sm text-red-600">Geen config geladen.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--ink)]">Welkomstgids samenstellen</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          De multi-scherm welkomstkaart bovenaan /overzicht. Stel schermen en stappen samen; de
          eerste schermen die je als <strong>verplicht</strong> markeert verschijnen altijd, de rest
          ontgrendelt de gebruiker zelf. {isDefault ? 'Er draait nu de ingebouwde standaard.' : 'Er draait een aangepaste versie.'}
        </p>
      </div>

      {/* Globaal */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-[var(--ink-2)]">Kicker (kop bovenaan)</span>
            <input
              type="text"
              value={config.kicker}
              maxLength={60}
              onChange={(e) => patchConfig({ kicker: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
          </label>
          <div className="flex items-end">
            <ToggleRow
              label="Gids actief (voor alle gebruikers)"
              checked={config.enabled}
              onChange={(v) => patchConfig({ enabled: v })}
            />
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-amber-800">Onopgeslagen wijzigingen</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchConfig()}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
            >
              {saving ? 'Opslaan…' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {/* Schermen */}
      <div className="space-y-4">
        {config.screens.map((screen, si) => {
          const isOpen = expanded.has(screen.id)
          const showPreview = previewing.has(screen.id)
          return (
            <div
              key={screen.id}
              className={`overflow-hidden rounded-xl border bg-[var(--paper)] ${
                screen.enabled ? 'border-[var(--border-ed)]' : 'border-dashed border-[var(--border-md)] opacity-70'
              }`}
            >
              {/* Scherm-kop */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(screen.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                  <span className="truncate text-sm font-semibold text-[var(--ink)]">
                    {si + 1}. {screen.title || '(zonder titel)'}
                  </span>
                  {screen.required ? (
                    <span className="shrink-0 rounded-md bg-kern-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-kern-700">
                      Verplicht
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                      Optioneel
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-[var(--ink-4)]">
                    {screen.steps.length} stap{screen.steps.length === 1 ? '' : 'pen'}
                  </span>
                </button>
                <IconBtn title="Omhoog" onClick={() => moveScreen(si, -1)} disabled={si === 0}>
                  <ChevronUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  title="Omlaag"
                  onClick={() => moveScreen(si, 1)}
                  disabled={si === config.screens.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn title="Verwijder scherm" onClick={() => deleteScreen(si)} danger>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-[var(--border-ed)] px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Titel">
                      <input
                        type="text"
                        value={screen.title}
                        onChange={(e) => patchScreen(si, { title: e.target.value })}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Layout">
                      <select
                        value={screen.layout}
                        onChange={(e) =>
                          patchScreen(si, { layout: e.target.value === 'process' ? 'process' : 'list' })
                        }
                        className={inputCls}
                      >
                        <option value="list">Lijst (verticaal)</option>
                        <option value="process">Proces (links → rechts)</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Intro (optioneel)">
                    <input
                      type="text"
                      value={screen.intro ?? ''}
                      onChange={(e) => patchScreen(si, { intro: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-6">
                    <ToggleRow
                      label="Verplicht (altijd tonen)"
                      checked={screen.required}
                      onChange={(v) => patchScreen(si, { required: v })}
                    />
                    <ToggleRow
                      label="Ingeschakeld"
                      checked={screen.enabled}
                      onChange={(v) => patchScreen(si, { enabled: v })}
                    />
                  </div>

                  {/* Stappen */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                      Stappen
                    </p>
                    {screen.steps.map((step, ti) => (
                      <div
                        key={step.id}
                        className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] text-[var(--ink-4)]">{step.id}</span>
                          <div className="flex items-center gap-1">
                            <IconBtn title="Omhoog" onClick={() => moveStep(si, ti, -1)} disabled={ti === 0}>
                              <ChevronUp className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Omlaag"
                              onClick={() => moveStep(si, ti, 1)}
                              disabled={ti === screen.steps.length - 1}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn title="Verwijder stap" onClick={() => deleteStep(si, ti)} danger>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconBtn>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Field label="Titel/vraag">
                            <input
                              type="text"
                              value={step.title}
                              onChange={(e) => patchStep(si, ti, { title: e.target.value })}
                              className={inputCls}
                            />
                          </Field>
                          <Field label="Link (href)">
                            <input
                              type="text"
                              value={step.href ?? ''}
                              placeholder="/overzicht/bezittingen"
                              onChange={(e) => patchStep(si, ti, { href: e.target.value })}
                              className={`${inputCls} font-mono`}
                            />
                          </Field>
                        </div>
                        <Field label="Toelichting (optioneel)">
                          <input
                            type="text"
                            value={step.description ?? ''}
                            onChange={(e) => patchStep(si, ti, { description: e.target.value })}
                            className={inputCls}
                          />
                        </Field>
                        <div className="mt-2 flex flex-wrap items-center gap-6">
                          <Field label="Icoon">
                            <select
                              value={step.icon ?? ''}
                              onChange={(e) =>
                                patchStep(si, ti, {
                                  icon: e.target.value ? (e.target.value as GuideIcon) : undefined,
                                })
                              }
                              className={inputCls}
                            >
                              <option value="">— geen —</option>
                              {ALLOWED_ICONS.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <ToggleRow
                            label="Ingeschakeld"
                            checked={step.enabled}
                            onChange={(v) => patchStep(si, ti, { enabled: v })}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addStep(si)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border-md)] px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
                    >
                      <Plus className="h-4 w-4" /> Stap toevoegen
                    </button>
                  </div>

                  {/* Voorbeeld */}
                  <div>
                    <button
                      type="button"
                      onClick={() => togglePreview(screen.id)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                    >
                      <Eye className="h-4 w-4" />
                      {showPreview ? 'Voorbeeld verbergen' : 'Voorbeeld tonen'}
                    </button>
                    {showPreview && (
                      <div className="mt-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/20 p-4">
                        <GuideScreenView screen={screen} completedStepIds={[]} readOnly />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={addScreen}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <Plus className="h-4 w-4" /> Scherm toevoegen
        </button>
      </div>

      {/* Herstel */}
      <div className="border-t border-[var(--border-ed)] pt-5">
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || isDefault}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Terug naar standaard
        </button>
      </div>
    </div>
  )
}

// ── Bouwstenen ───────────────────────────────────────────────────────────────

const inputCls =
  'mt-1 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-30 ${
        danger
          ? 'text-[var(--ink-4)] hover:bg-red-50 hover:text-red-600'
          : 'text-[var(--ink-4)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]'
      }`}
    >
      {children}
    </button>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-kern-500' : 'bg-[var(--border-md)]'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      <span className="text-sm text-[var(--ink-2)]">{label}</span>
    </label>
  )
}
