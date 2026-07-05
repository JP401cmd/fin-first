'use client'

import { useState } from 'react'
import { MessageSquare, Check } from 'lucide-react'
import { PageOpening } from '@/components/editorial'

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idee' },
  { value: 'question', label: 'Vraag' },
  { value: 'other', label: 'Overig' },
] as const

export default function MijnFeedbackPage() {
  const [category, setCategory] = useState<string>('idea')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: message.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Versturen mislukt')
      }
      setDone(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen mislukt')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <PageOpening
        className="mb-6"
        kicker={
          <>
            <MessageSquare className="h-3 w-3" aria-hidden />
            Feedback
          </>
        }
        titleBefore="Help ons TriFinity "
        emphasis="beter"
        titleAfter=" te maken"
        deck="Een bug, een idee of een vraag? Laat het weten — we lezen alles."
      />

      {done ? (
        <div className="flex items-start gap-2 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">Dank je — je feedback is verstuurd.</p>
            <button onClick={() => setDone(false)} className="mt-1 text-xs underline hover:no-underline">
              Nog iets insturen
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)]">Categorie</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`min-h-[40px] border px-3 py-1.5 text-sm transition-colors ${
                    category === c.value
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-white'
                      : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="fb-message" className="block text-sm font-medium text-[var(--ink-2)]">
              Je bericht
            </label>
            <textarea
              id="fb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Wat wil je ons laten weten?"
              className="mt-2 w-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
            />
          </div>

          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}

          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="inline-flex min-h-[44px] items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? 'Versturen…' : 'Versturen'}
          </button>
        </form>
      )}
    </div>
  )
}
