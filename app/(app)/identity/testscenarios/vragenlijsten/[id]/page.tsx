'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'

interface Question {
  id: string
  sort_order: number
  type: 'open' | 'scale' | 'multiple_choice'
  question_text: string
  options: string[] | null
  scale_min_label: string | null
  scale_max_label: string | null
  is_required: boolean
}

interface SessionData {
  id: string
  answered_question_ids: string[]
}

export default function QuestionnaireFillPage() {
  const { id } = useParams<{ id: string }>()

  const [questions, setQuestions] = useState<Question[]>([])
  const [session, setSession] = useState<SessionData | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { text?: string; scale?: number; choice?: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    async function init() {
      const detailRes = await fetch(`/api/questionnaires/${id}/session`)
      const detailData = await detailRes.json()

      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: qs } = await supabase
        .from('questionnaire_questions')
        .select('*')
        .eq('questionnaire_id', id)
        .order('sort_order', { ascending: true })

      setQuestions(qs ?? [])

      let sessionData = detailData.session
      if (!sessionData) {
        const createRes = await fetch(`/api/questionnaires/${id}/session`, { method: 'POST' })
        const createData = await createRes.json()
        sessionData = createData.session
      }
      setSession(sessionData)

      if (sessionData?.answered_question_ids?.length && qs?.length) {
        const { data: existingResponses } = await supabase
          .from('questionnaire_responses')
          .select('question_id, answer_text, answer_scale, answer_choice')
          .eq('session_id', sessionData.id)

        const answerMap: Record<string, { text?: string; scale?: number; choice?: string }> = {}
        for (const r of existingResponses ?? []) {
          answerMap[r.question_id] = {
            text: r.answer_text ?? undefined,
            scale: r.answer_scale ?? undefined,
            choice: r.answer_choice ?? undefined,
          }
        }
        setAnswers(answerMap)

        const answeredIds = new Set(sessionData.answered_question_ids)
        const firstUnanswered = qs.findIndex((q: Question) => !answeredIds.has(q.id))
        if (firstUnanswered > 0) setCurrentIndex(firstUnanswered)
      }

      setLoading(false)
    }
    init()
  }, [id])

  const currentQuestion = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined

  const saveAnswer = useCallback(async () => {
    if (!session || !currentQuestion) return
    const answer = answers[currentQuestion.id]
    if (!answer) return

    setSaving(true)
    await fetch(`/api/questionnaires/${id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        question_id: currentQuestion.id,
        question_text: currentQuestion.question_text,
        answer_text: answer.text,
        answer_scale: answer.scale,
        answer_choice: answer.choice,
      }),
    })
    setSaving(false)
  }, [session, currentQuestion, answers, id])

  const handleNext = useCallback(async () => {
    await saveAnswer()
    if (isLast) {
      await fetch(`/api/questionnaires/${id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session?.id }),
      })
      setCompleted(true)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [saveAnswer, isLast, id, session])

  const handlePrev = useCallback(async () => {
    if (currentAnswer) await saveAnswer()
    setCurrentIndex(i => Math.max(0, i - 1))
  }, [saveAnswer, currentAnswer])

  const setAnswer = useCallback((questionId: string, value: { text?: string; scale?: number; choice?: string }) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <div className="h-6 w-48 mx-auto animate-pulse rounded bg-[var(--subtle)]" />
      </div>
    )
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-kern-500" />
        <h1 className="mt-4 font-display text-2xl font-bold text-[var(--ink)]">
          Bedankt!
        </h1>
        <p className="mt-2 font-serif text-sm text-[var(--ink-3)]">
          Je antwoorden zijn opgeslagen. Je kunt de vragenlijst later opnieuw invullen.
        </p>
        <Link
          href="/identity/testscenarios"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar testscenario&rsquo;s
        </Link>
      </div>
    )
  }

  if (!currentQuestion) return null

  const pct = Math.round(((currentIndex + 1) / questions.length) * 100)
  const hasAnswer = currentAnswer && (currentAnswer.text || currentAnswer.scale || currentAnswer.choice)

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
          <span>Vraag <span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{currentIndex + 1}</span> van <span className="font-mono tabular-nums">{questions.length}</span></span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className="h-full rounded-full bg-kern-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <h2 className="font-display text-xl font-semibold leading-snug text-[var(--ink)] sm:text-2xl">
        {currentQuestion.question_text}
      </h2>

      {/* Answer input */}
      <div className="mt-6">
        {currentQuestion.type === 'open' && (
          <textarea
            value={currentAnswer?.text ?? ''}
            onChange={e => setAnswer(currentQuestion.id, { text: e.target.value })}
            placeholder="Typ je antwoord..."
            rows={4}
            className="w-full resize-none rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 font-serif text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none focus:ring-2 focus:ring-kern-500/20"
          />
        )}

        {currentQuestion.type === 'scale' && (
          <div>
            <div className="flex justify-between gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswer(currentQuestion.id, { scale: n })}
                  className={`flex h-11 w-11 items-center justify-center rounded border font-mono text-sm font-bold tabular-nums transition-colors ${
                    currentAnswer?.scale === n
                      ? 'border-kern-500 bg-kern-500 text-white'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>{currentQuestion.scale_min_label ?? '1'}</span>
              <span>{currentQuestion.scale_max_label ?? '10'}</span>
            </div>
          </div>
        )}

        {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
          <div className="space-y-2">
            {(currentQuestion.options as string[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setAnswer(currentQuestion.id, { choice: option })}
                className={`flex w-full items-center gap-3 rounded border px-4 py-3 text-left text-sm transition-colors ${
                  currentAnswer?.choice === option
                    ? 'border-kern-500 bg-kern-500/5 font-medium text-[var(--ink)]'
                    : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-[var(--border-md)]'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  currentAnswer?.choice === option
                    ? 'border-kern-500 bg-kern-500'
                    : 'border-[var(--border-md)]'
                }`}>
                  {currentAnswer?.choice === option && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between border-t border-[var(--border-ed)] pt-6">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)] disabled:opacity-30 disabled:hover:text-[var(--ink-3)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Vorige
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={saving || (currentQuestion.is_required && !hasAnswer)}
          className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all disabled:opacity-30 ${
            isLast
              ? 'bg-kern-500 text-white hover:bg-kern-600'
              : 'border border-[var(--border-md)] bg-[var(--paper)] text-[var(--ink)] hover:-translate-y-px hover:shadow-[var(--s1)]'
          }`}
        >
          {saving ? 'Opslaan...' : isLast ? 'Afronden' : 'Volgende'}
          {!isLast && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
