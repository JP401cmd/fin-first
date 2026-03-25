'use client'

import { useState } from 'react'
import { X, Check, Clock, Trash2, CalendarDays } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import {
  getSourceBadgeClasses,
  ACTION_SOURCE_LABELS,
} from '@/lib/recommendation-data'
import { getWeekLabel, getWeekDates } from '@/lib/week-utils'

type ActionEditModalProps = {
  action: Action
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
  onStatusChange: (status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
}

export function ActionEditModal({ action, onClose, onSave, onStatusChange }: ActionEditModalProps) {
  const [title, setTitle] = useState(action.title)
  const [description, setDescription] = useState(action.description ?? '')
  const [freedomDays, setFreedomDays] = useState(String(action.freedom_days_impact ?? ''))
  const [euroImpact, setEuroImpact] = useState(String(action.euro_impact_monthly ?? ''))
  const [dueDate, setDueDate] = useState(action.due_date ?? '')
  const [scheduledWeek, setScheduledWeek] = useState(action.scheduled_week ?? '')
  const [priority, setPriority] = useState(action.priority_score ?? 3)
  const [saving, setSaving] = useState(false)

  const sourceBadge = getSourceBadgeClasses(action.source)
  const isEditable = action.status === 'open' || action.status === 'postponed'

  // Generate next 6 week options
  const weekOptions: { value: string; label: string }[] = []
  const today = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i * 7)
    const wk = getWeekLabel(d)
    weekOptions.push({
      value: wk,
      label: i === 0 ? `Deze week (${getWeekDates(wk)})` : i === 1 ? `Volgende week (${getWeekDates(wk)})` : getWeekDates(wk),
    })
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        freedom_days_impact: freedomDays ? parseFloat(freedomDays) : 0,
        euro_impact_monthly: euroImpact ? parseFloat(euroImpact) : null,
        due_date: dueDate || null,
        scheduled_week: scheduledWeek || null,
        priority_score: priority,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose}>
      {/* Header - custom because it has badges */}
      <div className="flex items-center justify-between border-b border-[var(--border-ed)] px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[var(--ink)]">Actie bewerken</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadge}`}>
            {ACTION_SOURCE_LABELS[action.source]}
          </span>
        </div>
        <button onClick={onClose} className="touch-target rounded-md text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-4 px-5 py-4">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Titel</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isEditable}
            className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Beschrijving</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isEditable}
            rows={2}
            className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
          />
        </div>

        {/* Impact row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Vrijheidsdagen</label>
            <input
              type="number"
              value={freedomDays}
              onChange={(e) => setFreedomDays(e.target.value)}
              disabled={!isEditable}
              min="0"
              step="0.1"
              className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Euro impact/mnd</label>
            <input
              type="number"
              value={euroImpact}
              onChange={(e) => setEuroImpact(e.target.value)}
              disabled={!isEditable}
              min="0"
              step="1"
              className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
            />
          </div>
        </div>

        {/* Schedule row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--ink-2)]">
              <CalendarDays className="h-3 w-3" />
              Inplannen voor week
            </label>
            <select
              value={scheduledWeek}
              onChange={(e) => setScheduledWeek(e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
            >
              <option value="">Niet ingepland</option>
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Deadline</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-wil-300 focus:outline-none focus:ring-1 focus:ring-wil-300 disabled:bg-[var(--subtle)] disabled:text-[var(--ink-3)]"
            />
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Prioriteit</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => isEditable && setPriority(p)}
                disabled={!isEditable}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  priority >= p
                    ? 'bg-wil-500 text-white'
                    : 'bg-[var(--paper)] text-[var(--ink-3)] ring-1 ring-zinc-200 hover:bg-wil-50'
                } disabled:opacity-60`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Linked recommendation */}
        {action.recommendation?.title && (
          <div className="rounded-lg bg-[var(--subtle)] px-3 py-2">
            <span className="text-[11px] text-[var(--ink-3)]">Via aanbeveling:</span>
            <p className="text-xs font-medium text-[var(--ink-2)]">{action.recommendation.title}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border-ed)] px-5 py-3">
        {/* Status actions */}
        <div className="flex gap-1">
          {action.status === 'open' && (
            <>
              <button
                type="button"
                onClick={() => onStatusChange('completed')}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
              >
                <Check className="h-3.5 w-3.5" />
                Afronden
              </button>
              <button
                type="button"
                onClick={() => onStatusChange('rejected')}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Afwijzen
              </button>
            </>
          )}
          {action.status === 'postponed' && (
            <button
              type="button"
              onClick={() => onStatusChange('open')}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-wil-600 transition-colors hover:bg-wil-50"
            >
              Heropenen
            </button>
          )}
        </div>

        {/* Save / Close */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-zinc-100"
          >
            Sluiten
          </button>
          {isEditable && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="rounded-lg bg-wil-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
