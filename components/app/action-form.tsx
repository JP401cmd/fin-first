'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

type ActionFormProps = {
  onSubmit: (data: {
    title: string
    description?: string
    freedom_days_impact: number
    euro_impact_monthly?: number
    due_date?: string
    priority_score?: number
  }) => Promise<void>
  onCancel: () => void
}

export function ActionForm({ onSubmit, onCancel }: ActionFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [freedomDays, setFreedomDays] = useState('')
  const [euroImpact, setEuroImpact] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(3)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !freedomDays) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        freedom_days_impact: parseFloat(freedomDays),
        euro_impact_monthly: euroImpact ? parseFloat(euroImpact) : undefined,
        due_date: dueDate || undefined,
        priority_score: priority,
      })
      setTitle('')
      setDescription('')
      setFreedomDays('')
      setEuroImpact('')
      setDueDate('')
      setPriority(3)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Nieuwe actie</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Wat ga je doen? *"
            required
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
          />
        </div>

        <div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschrijving (optioneel)"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Vrijheidsdagen impact *
            </label>
            <input
              type="number"
              value={freedomDays}
              onChange={(e) => setFreedomDays(e.target.value)}
              placeholder="Bijv. 5"
              required
              min="0"
              step="0.1"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Euro impact/mnd
            </label>
            <input
              type="number"
              value={euroImpact}
              onChange={(e) => setEuroImpact(e.target.value)}
              placeholder="Bijv. 50"
              min="0"
              step="1"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Deadline</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Prioriteit (1-5)
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                    priority >= p
                      ? 'bg-teal-500 text-white'
                      : 'bg-white text-zinc-400 ring-1 ring-zinc-200 hover:bg-teal-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || !title.trim() || !freedomDays}
          className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Toevoegen
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
        >
          Annuleren
        </button>
      </div>
    </form>
  )
}
