'use client'

import { useState } from 'react'
import { X, Check, Clock, Trash2, CalendarDays } from 'lucide-react'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import {
  getSourceBadgeClasses,
  ACTION_SOURCE_LABELS,
} from '@/lib/recommendation-data'

type ActionEditModalProps = {
  action: Action
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
  onStatusChange: (status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
}

function getWeekLabel(date: Date): string {
  const year = date.getFullYear()
  const oneJan = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
  const week = Math.ceil((days + oneJan.getDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getWeekDates(weekStr: string): string {
  const [yearStr, weekPart] = weekStr.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekPart)
  const jan1 = new Date(year, 0, 1)
  const dayOffset = (1 - jan1.getDay() + 7) % 7
  const monday = new Date(year, 0, 1 + dayOffset + (week - 1) * 7)
  if (monday.getDay() !== 1) {
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  }
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} - ${fmt(sunday)}`
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900">Actie bewerken</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadge}`}>
              {ACTION_SOURCE_LABELS[action.source]}
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Beschrijving</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isEditable}
              rows={2}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>

          {/* Impact row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Vrijheidsdagen</label>
              <input
                type="number"
                value={freedomDays}
                onChange={(e) => setFreedomDays(e.target.value)}
                disabled={!isEditable}
                min="0"
                step="0.1"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Euro impact/mnd</label>
              <input
                type="number"
                value={euroImpact}
                onChange={(e) => setEuroImpact(e.target.value)}
                disabled={!isEditable}
                min="0"
                step="1"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
          </div>

          {/* Schedule row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600">
                <CalendarDays className="h-3 w-3" />
                Inplannen voor week
              </label>
              <select
                value={scheduledWeek}
                onChange={(e) => setScheduledWeek(e.target.value)}
                disabled={!isEditable}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
              >
                <option value="">Niet ingepland</option>
                {weekOptions.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Deadline</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!isEditable}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300 disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Prioriteit</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => isEditable && setPriority(p)}
                  disabled={!isEditable}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    priority >= p
                      ? 'bg-teal-500 text-white'
                      : 'bg-white text-zinc-400 ring-1 ring-zinc-200 hover:bg-teal-50'
                  } disabled:opacity-60`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Linked recommendation */}
          {action.recommendation?.title && (
            <div className="rounded-lg bg-zinc-50 px-3 py-2">
              <span className="text-[11px] text-zinc-400">Via aanbeveling:</span>
              <p className="text-xs font-medium text-zinc-600">{action.recommendation.title}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
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
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500"
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
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50"
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
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              Sluiten
            </button>
            {isEditable && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
