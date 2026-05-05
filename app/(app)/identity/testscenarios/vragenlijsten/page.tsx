'use client'

/**
 * Fase 3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §2.1 (shell-agnostische content)
 * Eigen back-knop verwijderd; shell levert deze via TopBar (mobile) of pane-header (desktop).
 */

import { useState, useEffect } from 'react'
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

interface QuestionnaireItem {
  id: string
  title: string
  description: string | null
  question_count: number
  answered_count: number
  has_open_session: boolean
  has_completed: boolean
}

export default function VragenlijstenPage() {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/questionnaires')
      .then(r => r.json())
      .then(d => setQuestionnaires(d.questionnaires ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <NavStackMeta title="Vragenlijsten" bottomBar={{ kind: 'tabs' }} />
      <header className="mb-10 border-b border-[var(--border-ed)] pb-6 space-y-2">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Feedback
        </div>
        <h1
          className="font-bold text-3xl sm:text-4xl tracking-[-0.02em] leading-tight"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Vragen&shy;{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            lijsten
          </em>
        </h1>
        <p
          className="italic text-base leading-relaxed text-[var(--ink-2)] max-w-xl pl-4"
          style={{
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            borderLeft: '2px solid var(--module-active-500)',
          }}
        >
          Deel je ervaringen met TriFinity. Elke vragenlijst duurt een paar minuten en
          helpt ons de app te verbeteren.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : questionnaires.length === 0 ? (
        <p className="font-serif text-sm text-[var(--ink-3)]">
          Er zijn momenteel geen vragenlijsten beschikbaar.
        </p>
      ) : (
        <div className="space-y-4">
          {questionnaires.map(q => (
            <QuestionnaireCard key={q.id} questionnaire={q} />
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionnaireCard({ questionnaire: q }: { questionnaire: QuestionnaireItem }) {
  const pct = q.question_count > 0 ? Math.round((q.answered_count / q.question_count) * 100) : 0
  const isComplete = q.has_completed && !q.has_open_session
  const isInProgress = q.has_open_session

  return (
    <Link
      href={`/identity/testscenarios/vragenlijsten/${q.id}`}
      className="group block border border-[var(--border-ed)] bg-[var(--paper)] px-5 py-4 transition-all duration-150 hover:-translate-y-px hover:border-[var(--border-md)] hover:shadow-[var(--s1)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{q.title}</h3>
          {q.description && (
            <p className="mt-1 font-serif text-sm text-[var(--ink-3)]">{q.description}</p>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-[var(--ink-4)]">
            <span className="font-mono tabular-nums">{q.question_count} vragen</span>
            {isInProgress && (
              <span className="flex items-center gap-1 text-amber-600">
                <Clock className="h-3 w-3" />
                Bezig &mdash; {q.answered_count}/{q.question_count}
              </span>
            )}
            {isComplete && !isInProgress && (
              <span className="flex items-center gap-1 text-kern-600">
                <CheckCircle2 className="h-3 w-3" />
                Afgerond
              </span>
            )}
          </div>
          {isInProgress && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-kern-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[var(--ink-4)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink-3)]" />
      </div>
    </Link>
  )
}
