'use client'

import { useState } from 'react'
import { Clock, Calendar, Send } from 'lucide-react'

type PostponeFormProps = {
  mode: 'recommendation' | 'action'
  onSubmit: (data: { reason?: string; postponed_until?: string; postpone_weeks?: number }) => void
  onCancel: () => void
}

const WEEK_OPTIONS = [1, 2, 4, 6, 8, 12]

export function PostponeForm({ mode, onSubmit, onCancel }: PostponeFormProps) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [weeks, setWeeks] = useState<number>(2)

  function handleSubmit() {
    if (mode === 'recommendation') {
      onSubmit({ reason: reason || undefined, postponed_until: date || undefined })
    } else {
      onSubmit({ reason: reason || undefined, postpone_weeks: weeks })
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-teal-100 bg-teal-50/50 p-3">
      {mode === 'recommendation' ? (
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-600">
            <Calendar className="h-3.5 w-3.5" />
            Herinneren op
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-600">
            <Clock className="h-3.5 w-3.5" />
            Uitstellen met
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeeks(w)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  weeks === w
                    ? 'bg-teal-500 text-white'
                    : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-teal-50'
                }`}
              >
                {w} {w === 1 ? 'week' : 'weken'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Reden (optioneel)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Waarom stel je dit uit?"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          className="flex items-center gap-1.5 rounded-md bg-teal-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-600"
        >
          <Send className="h-3 w-3" />
          Bevestigen
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}
