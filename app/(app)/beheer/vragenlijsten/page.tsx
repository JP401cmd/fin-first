'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, BarChart3, ChevronUp, ChevronDown, Trash2,
  AlertTriangle, ToggleLeft, ToggleRight, X,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

type QuestionType = 'open' | 'scale' | 'multiple_choice'

interface QuestionDraft {
  id?: string
  type: QuestionType
  question_text: string
  options?: string[]
  scale_min_label?: string
  scale_max_label?: string
  is_required: boolean
  is_multi_select: boolean
}

interface QuestionnaireSummary {
  id: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  question_count: number
  response_count: number
  completed_count: number
}

interface QuestionnaireDetail {
  id: string
  title: string
  description: string | null
  is_active: boolean
  questionnaire_questions: {
    id: string
    sort_order: number
    type: QuestionType
    question_text: string
    options: string[] | null
    scale_min_label: string | null
    scale_max_label: string | null
    is_required: boolean
    is_multi_select: boolean
  }[]
}

interface SessionResponse {
  id: string
  user_email: string
  user_id: string
  started_at: string
  completed_at: string | null
  questionnaire_responses: {
    id: string
    question_id: string
    question_text_snapshot: string
    answer_text: string | null
    answer_scale: number | null
    answer_choice: string | null
    created_at: string
  }[]
}

interface QuestionSummary {
  id: string
  sort_order: number
  type: QuestionType
  question_text: string
}

export default function BeheerVragenlijsten() {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [viewingResponsesId, setViewingResponsesId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/questionnaires')
    const data = await res.json()
    setQuestionnaires(data.questionnaires ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    await fetch(`/api/admin/questionnaires/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    })
    loadList()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Vragenlijsten</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Nieuwe vragenlijst
        </button>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded border border-[var(--border-ed)] bg-[var(--subtle)]" />
          ))}
        </div>
      ) : questionnaires.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--ink-3)]">Nog geen vragenlijsten aangemaakt.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {questionnaires.map(q => (
            <div key={q.id} className="flex items-center gap-3 rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{q.title}</p>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    q.is_active ? 'bg-kern-500/10 text-kern-700' : 'bg-[var(--subtle)] text-[var(--ink-4)]'
                  }`}>
                    {q.is_active ? 'Actief' : 'Inactief'}
                  </span>
                </div>
                <p className="mt-0.5 flex gap-3 text-xs text-[var(--ink-4)]">
                  <span className="font-mono tabular-nums">{q.question_count} vragen</span>
                  <span className="font-mono tabular-nums">{q.response_count} invullingen</span>
                  <span className="font-mono tabular-nums">{q.completed_count} voltooid</span>
                </p>
              </div>
              <button type="button" onClick={() => toggleActive(q.id, q.is_active)} title={q.is_active ? 'Deactiveren' : 'Activeren'}>
                {q.is_active
                  ? <ToggleRight className="h-5 w-5 text-kern-500" />
                  : <ToggleLeft className="h-5 w-5 text-[var(--ink-4)]" />
                }
              </button>
              <button type="button" onClick={() => setEditingId(q.id)} className="text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setViewingResponsesId(q.id)} className="text-[var(--ink-3)] hover:text-[var(--ink-2)]">
                <BarChart3 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(creating || editingId) && (
        <EditorSheet
          questionnaireId={editingId}
          onClose={() => { setEditingId(null); setCreating(false) }}
          onSaved={() => { setEditingId(null); setCreating(false); loadList() }}
        />
      )}

      {viewingResponsesId && (
        <ResponsesSheet
          questionnaireId={viewingResponsesId}
          onClose={() => setViewingResponsesId(null)}
        />
      )}
    </div>
  )
}

function EditorSheet({ questionnaireId, onClose, onSaved }: {
  questionnaireId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!questionnaireId)

  useEffect(() => {
    if (!questionnaireId) return
    fetch(`/api/admin/questionnaires/${questionnaireId}`)
      .then(r => r.json())
      .then(d => {
        const q = d.questionnaire as QuestionnaireDetail
        setTitle(q.title)
        setDescription(q.description ?? '')
        setQuestions(
          q.questionnaire_questions.map(qq => ({
            id: qq.id,
            type: qq.type,
            question_text: qq.question_text,
            options: qq.options ?? undefined,
            scale_min_label: qq.scale_min_label ?? undefined,
            scale_max_label: qq.scale_max_label ?? undefined,
            is_required: qq.is_required,
            is_multi_select: qq.is_multi_select,
          }))
        )
        setLoading(false)
      })
  }, [questionnaireId])

  const addQuestion = (type: QuestionType) => {
    setQuestions(prev => [
      ...prev,
      {
        type,
        question_text: '',
        is_required: true,
        is_multi_select: false,
        ...(type === 'multiple_choice' ? { options: [''] } : {}),
        ...(type === 'scale' ? { scale_min_label: 'Zeer slecht', scale_max_label: 'Uitstekend' } : {}),
      },
    ])
  }

  const updateQuestion = (index: number, updates: Partial<QuestionDraft>) => {
    setQuestions(prev => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)))
  }

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= questions.length) return
    setQuestions(prev => {
      const next = [...prev]
      ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
      return next
    })
  }

  const handleSave = async () => {
    if (!title.trim() || questions.length === 0) return
    setSaving(true)

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      questions: questions.map(q => ({
        id: q.id,
        type: q.type,
        question_text: q.question_text,
        options: q.options,
        scale_min_label: q.scale_min_label,
        scale_max_label: q.scale_max_label,
        is_required: q.is_required,
        is_multi_select: q.is_multi_select,
      })),
    }

    if (questionnaireId) {
      await fetch(`/api/admin/questionnaires/${questionnaireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/admin/questionnaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setSaving(false)
    onSaved()
  }

  const TYPE_LABELS: Record<QuestionType, string> = {
    open: 'Open',
    scale: 'Schaal 1-10',
    multiple_choice: 'Meerkeuze',
  }

  return (
    <BottomSheet open={true} onClose={onClose} title={questionnaireId ? 'Vragenlijst bewerken' : 'Nieuwe vragenlijst'} size="full">
      {loading ? (
        <div className="p-6"><div className="h-40 animate-pulse rounded bg-[var(--subtle)]" /></div>
      ) : (
        <div className="space-y-6 p-6">
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titel van de vragenlijst"
              className="w-full border-b border-[var(--border-ed)] bg-transparent pb-2 font-display text-lg font-semibold text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optionele beschrijving..."
              rows={2}
              className="w-full resize-none border-b border-[var(--border-ed)] bg-transparent pb-2 font-serif text-sm text-[var(--ink-2)] placeholder:text-[var(--ink-4)] focus:border-[var(--border-md)] focus:outline-none"
            />
          </div>

          {questions.length > 10 && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Vragenlijsten met meer dan 10 vragen hebben significant lagere voltooiingspercentages.
            </div>
          )}

          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="rounded border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-1 rounded bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--ink-4)]">
                    {TYPE_LABELS[q.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={q.question_text}
                      onChange={e => updateQuestion(i, { question_text: e.target.value })}
                      placeholder="Typ je vraag..."
                      rows={2}
                      className="w-full resize-none bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none"
                    />
                    {q.type === 'scale' && (
                      <div className="mt-2 flex gap-3">
                        <input type="text" value={q.scale_min_label ?? ''} onChange={e => updateQuestion(i, { scale_min_label: e.target.value })} placeholder="Label 1 (bijv. Zeer slecht)" className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-3)] focus:outline-none" />
                        <input type="text" value={q.scale_max_label ?? ''} onChange={e => updateQuestion(i, { scale_max_label: e.target.value })} placeholder="Label 10 (bijv. Uitstekend)" className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-3)] focus:outline-none" />
                      </div>
                    )}
                    {q.type === 'multiple_choice' && (
                      <div className="mt-2 space-y-1.5">
                        {(q.options ?? []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border border-[var(--border-md)]" />
                            <input type="text" value={opt} onChange={e => { const newOpts = [...(q.options ?? [])]; newOpts[oi] = e.target.value; updateQuestion(i, { options: newOpts }) }} placeholder={`Optie ${oi + 1}`} className="flex-1 border-b border-[var(--border-ed)] bg-transparent pb-1 text-xs text-[var(--ink-2)] focus:outline-none" />
                            <button type="button" onClick={() => { updateQuestion(i, { options: (q.options ?? []).filter((_, j) => j !== oi) }) }} className="text-[var(--ink-4)] hover:text-red-500"><X className="h-3 w-3" /></button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => updateQuestion(i, { options: [...(q.options ?? []), ''] })} className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]">+ Optie toevoegen</button>
                          <label className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                            <input type="checkbox" checked={q.is_multi_select} onChange={e => updateQuestion(i, { is_multi_select: e.target.checked })} className="h-3 w-3 rounded border-[var(--border-md)]" />
                            Meerdere antwoorden
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveQuestion(i, -1)} disabled={i === 0} className="text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} className="text-[var(--ink-4)] hover:text-[var(--ink-2)] disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeQuestion(i)} className="mt-1 text-[var(--ink-4)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => addQuestion('open')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">+ Open vraag</button>
            <button type="button" onClick={() => addQuestion('scale')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">+ Schaal 1-10</button>
            <button type="button" onClick={() => addQuestion('multiple_choice')} className="rounded border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]">+ Meerkeuze</button>
          </div>

          <button type="button" onClick={handleSave} disabled={saving || !title.trim() || questions.length === 0} className="w-full rounded bg-kern-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-kern-600 disabled:opacity-40">
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

function formatChoice(choice: string | null): string {
  if (!choice) return '\u2014'
  try {
    const parsed = JSON.parse(choice)
    if (Array.isArray(parsed)) return parsed.join(', ')
  } catch { /* plain string */ }
  return choice
}

function ResponsesSheet({ questionnaireId, onClose }: {
  questionnaireId: string
  onClose: () => void
}) {
  const [sessions, setSessions] = useState<SessionResponse[]>([])
  const [questions, setQuestions] = useState<QuestionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'sessions' | 'questions'>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/questionnaires/${questionnaireId}/responses`)
      .then(r => r.json())
      .then(d => {
        setSessions(d.sessions ?? [])
        setQuestions(d.questions ?? [])
        setLoading(false)
      })
  }, [questionnaireId])

  const totalSessions = sessions.length
  const completedSessions = sessions.filter(s => s.completed_at).length
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
  const selectedSession = selectedSessionId ? sessions.find(s => s.id === selectedSessionId) : null

  const questionAggregates = (qId: string) => {
    return sessions.flatMap(s => s.questionnaire_responses.filter(r => r.question_id === qId))
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Resultaten" size="full">
      {loading ? (
        <div className="p-6"><div className="h-40 animate-pulse rounded bg-[var(--subtle)]" /></div>
      ) : (
        <div className="p-6">
          <div className="mb-6 flex gap-6 text-xs text-[var(--ink-3)]">
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{totalSessions}</span> invullingen</span>
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{completedSessions}</span> voltooid</span>
            <span><span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">{completionRate}%</span> voltooiingspercentage</span>
          </div>

          <div className="mb-4 flex gap-0.5 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-0.5 w-fit">
            <button type="button" onClick={() => { setView('sessions'); setSelectedQuestionId(null) }} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'sessions' ? 'bg-zinc-900 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'}`}>Per invulling</button>
            <button type="button" onClick={() => { setView('questions'); setSelectedSessionId(null) }} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'questions' ? 'bg-zinc-900 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'}`}>Per vraag</button>
          </div>

          {view === 'sessions' && !selectedSession && (
            <div className="space-y-2">
              {sessions.map(s => (
                <button key={s.id} type="button" onClick={() => setSelectedSessionId(s.id)} className="flex w-full items-center justify-between rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{s.user_email}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-4)]">{new Date(s.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.completed_at ? 'bg-kern-500/10 text-kern-700' : 'bg-amber-100 text-amber-700'}`}>{s.completed_at ? 'Voltooid' : 'Onvolledig'}</span>
                </button>
              ))}
              {sessions.length === 0 && <p className="text-sm text-[var(--ink-3)]">Nog geen invullingen.</p>}
            </div>
          )}

          {view === 'sessions' && selectedSession && (
            <div>
              <button type="button" onClick={() => setSelectedSessionId(null)} className="mb-4 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]">&larr; Terug naar overzicht</button>
              <p className="text-sm font-medium text-[var(--ink)]">{selectedSession.user_email}</p>
              <p className="mb-4 text-xs text-[var(--ink-4)]">{new Date(selectedSession.started_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <div className="space-y-3">
                {selectedSession.questionnaire_responses
                  .sort((a, b) => {
                    const qA = questions.findIndex(q => q.id === a.question_id)
                    const qB = questions.findIndex(q => q.id === b.question_id)
                    return qA - qB
                  })
                  .map(r => (
                  <div key={r.id} className="rounded border border-[var(--border-ed)] px-4 py-3">
                    <p className="text-xs font-medium text-[var(--ink-3)]">{r.question_text_snapshot}</p>
                    <p className="mt-1 text-sm text-[var(--ink)]">{r.answer_text ?? (r.answer_scale != null ? `${r.answer_scale}/10` : formatChoice(r.answer_choice)) ?? '\u2014'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'questions' && !selectedQuestionId && (
            <div className="space-y-2">
              {questions.map(q => {
                const responses = questionAggregates(q.id)
                const scaleAvg = q.type === 'scale' && responses.length > 0
                  ? (responses.reduce((sum, r) => sum + (r.answer_scale ?? 0), 0) / responses.length).toFixed(1)
                  : null
                return (
                  <button key={q.id} type="button" onClick={() => setSelectedQuestionId(q.id)} className="flex w-full items-center justify-between rounded border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--ink)]">{q.question_text}</p>
                      <p className="mt-0.5 text-xs text-[var(--ink-4)]">
                        {responses.length} antwoorden
                        {scaleAvg && <span className="ml-2">Gem. <span className="font-mono tabular-nums font-semibold">{scaleAvg}</span>/10</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {view === 'questions' && selectedQuestionId && (() => {
            const q = questions.find(q => q.id === selectedQuestionId)
            const responses = questionAggregates(selectedQuestionId)
            if (!q) return null

            return (
              <div>
                <button type="button" onClick={() => setSelectedQuestionId(null)} className="mb-4 text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]">&larr; Terug naar overzicht</button>
                <p className="mb-4 text-sm font-medium text-[var(--ink)]">{q.question_text}</p>

                {q.type === 'scale' && responses.length > 0 && (
                  <div className="mb-4 flex items-end gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                      const count = responses.filter(r => r.answer_scale === n).length
                      const maxCount = Math.max(...Array.from({ length: 10 }, (_, i) => responses.filter(r => r.answer_scale === i + 1).length), 1)
                      return (
                        <div key={n} className="flex flex-1 flex-col items-center gap-1">
                          <div className="w-full rounded-t bg-kern-500/60" style={{ height: `${Math.max((count / maxCount) * 60, 2)}px` }} />
                          <span className="text-[10px] font-mono tabular-nums text-[var(--ink-4)]">{n}</span>
                          <span className="text-[10px] font-mono tabular-nums text-[var(--ink-3)]">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {q.type === 'multiple_choice' && responses.length > 0 && (() => {
                  const counts: Record<string, number> = {}
                  for (const r of responses) {
                    if (!r.answer_choice) continue
                    let choices: string[]
                    try { const parsed = JSON.parse(r.answer_choice); choices = Array.isArray(parsed) ? parsed : [r.answer_choice] } catch { choices = [r.answer_choice] }
                    for (const c of choices) counts[c] = (counts[c] ?? 0) + 1
                  }
                  const maxCount = Math.max(...Object.values(counts), 1)
                  return (
                    <div className="mb-4 space-y-1.5">
                      {Object.entries(counts).map(([choice, count]) => (
                        <div key={choice} className="flex items-center gap-3">
                          <span className="w-24 truncate text-xs text-[var(--ink-2)]">{choice}</span>
                          <div className="flex-1 h-4 rounded bg-[var(--subtle)]"><div className="h-full rounded bg-kern-500/60" style={{ width: `${(count / maxCount) * 100}%` }} /></div>
                          <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">{count}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                <div className="space-y-2">
                  {responses.map(r => {
                    const session = sessions.find(s => s.questionnaire_responses.some(sr => sr.id === r.id))
                    return (
                      <div key={r.id} className="rounded border border-[var(--border-ed)] px-4 py-3">
                        <p className="text-xs text-[var(--ink-4)]">{session?.user_email ?? '?'} &mdash; {new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</p>
                        <p className="mt-1 text-sm text-[var(--ink)]">{r.answer_text ?? (r.answer_scale != null ? `${r.answer_scale}/10` : formatChoice(r.answer_choice)) ?? '\u2014'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </BottomSheet>
  )
}
