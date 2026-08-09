'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Check } from 'lucide-react'

interface FeedbackItem {
  id: string
  email: string | null
  category: 'bug' | 'idea' | 'question' | 'other'
  message: string
  status: 'new' | 'reviewed'
  created_at: string
}

const CATEGORY_LABEL: Record<FeedbackItem['category'], string> = {
  bug: 'Bug',
  idea: 'Idee',
  question: 'Vraag',
  other: 'Overig',
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

export default function BeheerFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(item: FeedbackItem) {
    const next = item.status === 'reviewed' ? 'new' : 'reviewed'
    setBusy(item.id)
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: next }),
      })
      if (res.ok) {
        setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: next } : i)))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Feedback (archief)</h2>
        </div>
        {/* ADR 0096: het formulier op /mijn/feedback is gesloten. Deze inbox
            groeit niet meer; nieuwe meldingen lopen via de meldmodus in de chat
            naar de werkqueue. De historie blijft hier leesbaar. */}
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Historie van het oude feedbackformulier. Nieuwe meldingen komen binnen via de meldmodus in
          de chat — die staan in de werkqueue, niet hier.
        </p>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse bg-[var(--subtle)]" />
      ) : items.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen feedback ontvangen.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <article
              key={item.id}
              className={`border p-3 ${
                item.status === 'reviewed'
                  ? 'border-[var(--border-ed)] bg-[var(--subtle)]/40'
                  : 'border-[var(--border-ed)] bg-[var(--paper)]'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="bg-[var(--ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                    {CATEGORY_LABEL[item.category]}
                  </span>
                  <span className="font-mono text-xs text-[var(--ink-3)]">{item.email ?? '—'}</span>
                </div>
                <span className="font-mono text-xs tabular-nums text-[var(--ink-4)]">{fmt(item.created_at)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">{item.message}</p>
              <button
                onClick={() => toggle(item)}
                disabled={busy === item.id}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {item.status === 'reviewed' ? 'Gelezen — markeer als nieuw' : 'Markeer als gelezen'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
