'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Calendar,
  Activity,
} from 'lucide-react'
import type { BriefingDirective, FunctionalDirective } from '@/lib/briefing/directives'
import {
  isDirectiveActive,
  getDefaultDirectives,
  getDefaultFunctionalDirectives,
  DIRECTIVE_METRICS,
  resolveMetricLabels,
} from '@/lib/briefing/directives'

// ── Shared ───────────────────────────────────────────────────

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'Hoog',    color: 'var(--ink)',   bg: 'var(--kern-l)' },
  normal: { label: 'Normaal', color: 'var(--ink-2)', bg: 'var(--subtle)' },
  low:    { label: 'Laag',    color: 'var(--ink-3)', bg: 'var(--subtle)' },
}

function PriorityPicker({ value, onChange }: { value: string; onChange: (p: 'high' | 'normal' | 'low') => void }) {
  return (
    <div className="flex gap-2">
      {(['high', 'normal', 'low'] as const).map((p) => {
        const pl = PRIORITY_LABELS[p]
        const selected = value === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className="rounded-[var(--r)] border px-3 py-1.5 text-xs font-medium transition-all"
            style={
              selected
                ? { borderColor: 'var(--ink)', backgroundColor: 'var(--ink)', color: 'var(--paper)' }
                : { borderColor: 'var(--border-md)', color: 'var(--ink-3)' }
            }
          >
            {pl.label}
          </button>
        )
      })}
    </div>
  )
}

function EnableToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        enabled ? 'bg-[var(--ink)]' : 'bg-[var(--border-md)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--paper)] transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[var(--r)] border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
    >
      <Trash2 className="h-3 w-3" />
      Verwijderen
    </button>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-[var(--ink-2)]" />
      <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--ink-2)]">{label}</h3>
    </div>
  )
}

// ── Temporal DirectiveRow ────────────────────────────────────

function scheduleLabel(d: BriefingDirective): string {
  const parts: string[] = []
  if (d.months.length > 0) {
    parts.push(d.months.map((m) => MONTH_LABELS[m - 1]).join(', '))
  } else {
    parts.push('Alle maanden')
  }
  if (d.dayFrom != null || d.dayTo != null) {
    parts.push(`dag ${d.dayFrom ?? 1}–${d.dayTo ?? 31}`)
  }
  return parts.join(' · ')
}

function TemporalRow({
  directive,
  isActive,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
}: {
  directive: BriefingDirective
  isActive: boolean
  expanded: boolean
  onToggleExpand: () => void
  onChange: (updated: BriefingDirective) => void
  onDelete: () => void
}) {
  const pri = PRIORITY_LABELS[directive.priority] ?? PRIORITY_LABELS.normal

  function toggleMonth(m: number) {
    const months = directive.months.includes(m)
      ? directive.months.filter((x) => x !== m)
      : [...directive.months, m].sort((a, b) => a - b)
    onChange({ ...directive, months })
  }

  return (
    <div className="border-b border-[var(--border-ed)] last:border-0">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--subtle)]"
        onClick={onToggleExpand}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">
              {directive.title || 'Naamloze richtlijn'}
            </span>
            {isActive && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                ACTIEF
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{scheduleLabel(directive)}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ color: pri.color, backgroundColor: pri.bg }}
        >
          {pri.label}
        </span>
        <EnableToggle enabled={directive.enabled} onToggle={() => onChange({ ...directive, enabled: !directive.enabled })} />
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Titel</label>
            <input
              type="text"
              value={directive.title}
              onChange={(e) => onChange({ ...directive, title: e.target.value })}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Instructie voor Will</label>
            <textarea
              value={directive.instruction}
              onChange={(e) => onChange({ ...directive, instruction: e.target.value })}
              rows={3}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Prioriteit</label>
            <PriorityPicker value={directive.priority} onChange={(p) => onChange({ ...directive, priority: p })} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
              Maanden <span className="font-normal text-[var(--ink-3)]">(leeg = alle)</span>
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {MONTH_LABELS.map((label, i) => {
                const m = i + 1
                const selected = directive.months.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    className="rounded-[var(--r)] border px-2 py-1.5 text-[11px] font-medium transition-all"
                    style={
                      selected
                        ? { borderColor: 'var(--ink)', backgroundColor: 'var(--ink)', color: 'var(--paper)' }
                        : { borderColor: 'var(--border-ed)', color: 'var(--ink-3)' }
                    }
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Dag van</label>
              <input
                type="number"
                min={1}
                max={31}
                value={directive.dayFrom ?? ''}
                onChange={(e) => onChange({ ...directive, dayFrom: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="—"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Dag t/m</label>
              <input
                type="number"
                min={1}
                max={31}
                value={directive.dayTo ?? ''}
                onChange={(e) => onChange({ ...directive, dayTo: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="—"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <DeleteButton onClick={onDelete} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Functional DirectiveRow ──────────────────────────────────

function FunctionalRow({
  directive,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
}: {
  directive: FunctionalDirective
  expanded: boolean
  onToggleExpand: () => void
  onChange: (updated: FunctionalDirective) => void
  onDelete: () => void
}) {
  const pri = PRIORITY_LABELS[directive.priority] ?? PRIORITY_LABELS.normal
  const { metric: metricLabel, condition: condLabel } = resolveMetricLabels(directive.metric, directive.condition)
  const currentMetric = DIRECTIVE_METRICS.find((m) => m.id === directive.metric)

  return (
    <div className="border-b border-[var(--border-ed)] last:border-0">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--subtle)]"
        onClick={onToggleExpand}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-3)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--ink)]">
              {directive.title || 'Naamloze richtlijn'}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            {metricLabel} &middot; {condLabel}
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ color: pri.color, backgroundColor: pri.bg }}
        >
          {pri.label}
        </span>
        <EnableToggle enabled={directive.enabled} onToggle={() => onChange({ ...directive, enabled: !directive.enabled })} />
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Titel</label>
            <input
              type="text"
              value={directive.title}
              onChange={(e) => onChange({ ...directive, title: e.target.value })}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
            />
          </div>

          {/* Metric + Condition selectors */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Metriek</label>
              <select
                value={directive.metric}
                onChange={(e) => {
                  const newMetric = e.target.value
                  const firstCond = DIRECTIVE_METRICS.find((m) => m.id === newMetric)?.conditions[0]?.id ?? ''
                  onChange({ ...directive, metric: newMetric, condition: firstCond })
                }}
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
              >
                {DIRECTIVE_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Conditie</label>
              <select
                value={directive.condition}
                onChange={(e) => onChange({ ...directive, condition: e.target.value })}
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
              >
                {(currentMetric?.conditions ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Instructie voor Will</label>
            <textarea
              value={directive.instruction}
              onChange={(e) => onChange({ ...directive, instruction: e.target.value })}
              rows={3}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-2)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-2)]"
            />
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              Wordt in de prompt als: &ldquo;Wanneer {metricLabel.toLowerCase()} {condLabel.toLowerCase()}: ...&rdquo;
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">Prioriteit</label>
            <PriorityPicker value={directive.priority} onChange={(p) => onChange({ ...directive, priority: p })} />
          </div>

          <div className="flex justify-end">
            <DeleteButton onClick={onDelete} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────

export default function BriefingDirectivesPage() {
  const [directives, setDirectives] = useState<BriefingDirective[]>([])
  const [savedDirectives, setSavedDirectives] = useState<BriefingDirective[]>([])
  const [funcDirectives, setFuncDirectives] = useState<FunctionalDirective[]>([])
  const [savedFuncDirectives, setSavedFuncDirectives] = useState<FunctionalDirective[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/briefing-directives')
      if (!res.ok) throw new Error('Laden mislukt')
      const data = await res.json()
      setDirectives(data.directives ?? [])
      setSavedDirectives(data.directives ?? [])
      setFuncDirectives(data.functionalDirectives ?? [])
      setSavedFuncDirectives(data.functionalDirectives ?? [])
    } catch {
      setMessage({ type: 'error', text: 'Kon richtlijnen niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const isDirty =
    JSON.stringify(directives) !== JSON.stringify(savedDirectives) ||
    JSON.stringify(funcDirectives) !== JSON.stringify(savedFuncDirectives)

  const activeToday = directives.filter((d) => isDirectiveActive(d, currentMonth, currentDay))
  const enabledFunctional = funcDirectives.filter((d) => d.enabled)

  function clearMsg() { setMessage(null) }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/briefing-directives', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directives, functionalDirectives: funcDirectives }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Opslaan mislukt')
      }
      setSavedDirectives(directives)
      setSavedFuncDirectives(funcDirectives)
      setMessage({ type: 'success', text: 'Richtlijnen opgeslagen' })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Opslaan mislukt' })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDirectives(savedDirectives)
    setFuncDirectives(savedFuncDirectives)
    setMessage(null)
  }

  // ── Temporal handlers ──
  function handleTemporalChange(id: string, updated: BriefingDirective) {
    setDirectives((prev) => prev.map((d) => (d.id === id ? updated : d))); clearMsg()
  }
  function handleTemporalDelete(id: string) {
    setDirectives((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null); clearMsg()
  }
  function handleTemporalAdd() {
    const n: BriefingDirective = { id: crypto.randomUUID(), title: '', instruction: '', priority: 'normal', months: [], enabled: true }
    setDirectives((prev) => [...prev, n]); setExpandedId(n.id); clearMsg()
  }

  // ── Functional handlers ──
  function handleFuncChange(id: string, updated: FunctionalDirective) {
    setFuncDirectives((prev) => prev.map((d) => (d.id === id ? updated : d))); clearMsg()
  }
  function handleFuncDelete(id: string) {
    setFuncDirectives((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null); clearMsg()
  }
  function handleFuncAdd() {
    const first = DIRECTIVE_METRICS[0]
    const n: FunctionalDirective = {
      id: crypto.randomUUID(), title: '', metric: first.id, condition: first.conditions[0].id,
      instruction: '', priority: 'normal', enabled: true,
    }
    setFuncDirectives((prev) => [...prev, n]); setExpandedId(n.id); clearMsg()
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-zinc-200" />
        <div className="h-24 rounded-[var(--r-lg)] bg-zinc-200" />
        <div className="h-64 rounded-[var(--r-lg)] bg-zinc-200" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">Briefing Richtlijnen</h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Redactionele aandachtspunten die Will&apos;s briefing sturen
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded-[var(--r)] bg-[var(--ink)] px-5 py-2 text-sm font-medium text-[var(--paper)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>

      {/* Dirty banner */}
      {isDirty && (
        <div
          className="flex items-center justify-between rounded-[var(--r)] border border-dashed px-4 py-2.5"
          style={{ borderColor: 'var(--kern)', backgroundColor: 'var(--kern-l)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--kern-t)' }}>
            Onopgeslagen wijzigingen
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
              style={{ backgroundColor: 'var(--kern)' }}
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

      {/* Active today panel */}
      {(activeToday.length > 0 || enabledFunctional.length > 0) && (
        <div className="rounded-[var(--r-lg)] border border-green-200 bg-green-50 p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-green-700">
              Actief vandaag ({currentDay} {MONTH_LABELS[currentMonth - 1]})
            </p>
          </div>
          <div className="space-y-1">
            {activeToday.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <span className="h-1 w-1 flex-shrink-0 rounded-full bg-green-500" />
                <span className="text-sm text-green-800">{d.title}</span>
                {d.priority === 'high' && (
                  <span className="rounded bg-green-200 px-1 py-0.5 text-[9px] font-bold text-green-700">PRIORITEIT</span>
                )}
              </div>
            ))}
            {enabledFunctional.length > 0 && activeToday.length > 0 && (
              <div className="my-1.5 border-t border-green-200" />
            )}
            {enabledFunctional.map((d) => {
              const { metric, condition } = resolveMetricLabels(d.metric, d.condition)
              return (
                <div key={d.id} className="flex items-center gap-2">
                  <Activity className="h-2.5 w-2.5 flex-shrink-0 text-green-500" />
                  <span className="text-sm text-green-800">{d.title}</span>
                  <span className="text-[10px] text-green-600">{metric} · {condition}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Temporal Directives ═══ */}
      <SectionHeader icon={Calendar} label="Temporele richtlijnen" />

      {directives.length > 0 ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
          {directives.map((d) => (
            <TemporalRow
              key={d.id}
              directive={d}
              isActive={isDirectiveActive(d, currentMonth, currentDay)}
              expanded={expandedId === d.id}
              onToggleExpand={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onChange={(updated) => handleTemporalChange(d.id, updated)}
              onDelete={() => handleTemporalDelete(d.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen temporele richtlijnen.</p>
          <button
            type="button"
            onClick={() => { setDirectives(getDefaultDirectives()); clearMsg() }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vul standaarden in
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleTemporalAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] py-3 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
      >
        <Plus className="h-4 w-4" />
        Temporele richtlijn toevoegen
      </button>

      {/* ═══ Functional Directives ═══ */}
      <div className="border-t border-[var(--border-ed)] pt-6">
        <SectionHeader icon={Activity} label="Functionele richtlijnen" />
        <p className="mt-1 mb-4 text-xs text-[var(--ink-3)]">
          Situationele sturing op basis van financiele data. Will past deze toe wanneer de conditie herkend wordt.
        </p>
      </div>

      {funcDirectives.length > 0 ? (
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
          {funcDirectives.map((d) => (
            <FunctionalRow
              key={d.id}
              directive={d}
              expanded={expandedId === d.id}
              onToggleExpand={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onChange={(updated) => handleFuncChange(d.id, updated)}
              onDelete={() => handleFuncDelete(d.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen functionele richtlijnen.</p>
          <button
            type="button"
            onClick={() => { setFuncDirectives(getDefaultFunctionalDirectives()); clearMsg() }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--paper)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Vul standaarden in
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleFuncAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] py-3 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)]"
      >
        <Plus className="h-4 w-4" />
        Functionele richtlijn toevoegen
      </button>
    </div>
  )
}
