'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calculator,
  Sparkles,
  ArrowLeft,
  Save,
  Trash2,
  Wand2,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CalculatorRunner } from './calculator-runner'
import { CalculatorToLifeEventSheet } from './calculator-to-life-event-sheet'
import type { CalculatorDefinition, CustomCalculatorRow } from '@/lib/calculator/types'
import type { PrefillValues } from '@/lib/calculator/user-data-keys'
import { CalendarPlus } from 'lucide-react'

/**
 * RekenhulpView — eigen plek (/toekomst?tab=rekenhulp) waar Will helpt
 * een custom calculator te bouwen. Drie modi:
 *   - 'list':    opgeslagen calculators + "Nieuwe met Will"-knop
 *   - 'build':   prompt-veld → AI-generatie → preview (Opslaan/Verfijnen)
 *   - 'run':     opgeslagen calculator interactief draaien
 *
 * Calculatie staat los van de projectie (plan-beslissing). Een
 * levensgebeurtenis-export volgt als losse eindstap (fase 2).
 */

const EXAMPLE_PROMPTS = [
  'Aflossen op mijn hypotheek vs. hetzelfde bedrag beleggen over 15 jaar',
  'Agio storten in mijn BV en daar beleggen vs. privé beleggen in box 3',
  'Mijn deel van de woning verhuren: belast in box 1 vs. box 3',
]

type Mode = 'list' | 'build' | 'run'

export function RekenhulpView({
  saved,
  prefill,
}: {
  saved: CustomCalculatorRow[]
  prefill: PrefillValues
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CalculatorDefinition | null>(null)
  const [running, setRunning] = useState<CustomCalculatorRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [lifeEventSeed, setLifeEventSeed] = useState<{
    name: string
    amount: number
  } | null>(null)

  async function generate(refine = false) {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/build-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          refineFrom: refine ? draft : undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Genereren mislukt.')
        return
      }
      setDraft(data.definition)
      if (refine) setPrompt('')
    } catch {
      setError('Netwerkfout — probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd.')
      setSaving(false)
      return
    }
    const { error: insertError } = await supabase.from('custom_calculators').insert({
      user_id: user.id,
      name: draft.name,
      description: draft.description ?? null,
      definition: draft,
      created_by_ai: true,
    })
    setSaving(false)
    if (insertError) {
      setError(`Opslaan mislukt: ${insertError.message}`)
      return
    }
    setDraft(null)
    setPrompt('')
    setMode('list')
    router.refresh()
  }

  async function deleteSaved(id: string) {
    const supabase = createClient()
    const { error: delError } = await supabase
      .from('custom_calculators')
      .delete()
      .eq('id', id)
    if (!delError) router.refresh()
  }

  // ── Build-modus ──────────────────────────────────────────────
  if (mode === 'build') {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
        <button
          type="button"
          onClick={() => {
            setMode('list')
            setDraft(null)
            setError(null)
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Terug
        </button>

        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Rekenhulp bouwen met Will
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Beschrijf je vraagstuk
          </h2>
          <p className="text-sm text-[var(--ink-2)] mt-1 leading-relaxed">
            Will maakt er een rekenhulp van met jouw gegevens al ingevuld.
          </p>
        </header>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="bv. Aflossen op mijn hypotheek vs. beleggen over 15 jaar"
          className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--ink-3)] resize-none"
        />

        {!draft && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="text-[11px] rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => generate(!!draft)}
            disabled={loading || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-4 h-4" aria-hidden="true" />
            )}
            {draft ? 'Verfijnen' : 'Genereer rekenhulp'}
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        )}

        {draft && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="font-serif text-lg text-[var(--ink)]">{draft.name}</h3>
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 text-white px-3 py-2 text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Opslaan
              </button>
            </div>
            <CalculatorRunner definition={draft} prefill={prefill} />
          </div>
        )}
      </section>
    )
  }

  // ── Run-modus ────────────────────────────────────────────────
  if (mode === 'run' && running) {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
        <button
          type="button"
          onClick={() => {
            setMode('list')
            setRunning(null)
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-3)] hover:text-[var(--ink-2)] mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Terug naar rekenhulpen
        </button>
        <header className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Rekenhulp
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">{running.name}</h2>
        </header>
        <CalculatorRunner
          definition={running.definition}
          prefill={prefill}
          footer={({ winner, values }) => {
            // Voorgevuld bedrag: de compare-output van het winnende
            // scenario (indien aanwezig), anders 0.
            const compareKey = running.definition.compare?.outputKey
            const seedAmount =
              winner && compareKey ? values[winner]?.[compareKey] ?? 0 : 0
            return (
              <button
                type="button"
                onClick={() =>
                  setLifeEventSeed({
                    name: running.definition.name,
                    amount: Math.abs(seedAmount ?? 0),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
              >
                <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                Maak hier een levensgebeurtenis van
              </button>
            )
          }}
        />
        {lifeEventSeed && (
          <CalculatorToLifeEventSheet
            defaultName={lifeEventSeed.name}
            defaultAmount={lifeEventSeed.amount}
            defaultAge={prefill.current_age ? Math.round(prefill.current_age) : null}
            onClose={() => setLifeEventSeed(null)}
          />
        )}
      </section>
    )
  }

  // ── Lijst-modus (default) ────────────────────────────────────
  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-10">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — rekenhulp
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Jouw rekenhulpen
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setMode('build')
            setDraft(null)
            setError(null)
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          Nieuwe met Will
        </button>
      </header>

      {saved.length === 0 ? (
        <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
          <span className="inline-flex w-10 h-10 rounded-xl bg-violet-50 items-center justify-center mb-3">
            <Calculator className="w-5 h-5 text-violet-700" aria-hidden="true" />
          </span>
          <h3 className="font-serif text-lg text-[var(--ink)] mb-2">
            Nog geen rekenhulpen
          </h3>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
            Laat Will een rekenhulp maken voor je eigen vraagstuk — aflossen
            vs. beleggen, verhuurregimes, of agio naar je BV. Je gegevens zijn
            al ingevuld; je past alleen de aannames aan.
          </p>
          <button
            type="button"
            onClick={() => setMode('build')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-sm font-semibold hover:bg-[var(--ink-2)] transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Maak je eerste rekenhulp
          </button>
        </article>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {saved.map((calc) => (
            <article
              key={calc.id}
              className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 flex flex-col"
            >
              <div className="flex items-start gap-2 mb-2">
                <span className="inline-flex w-8 h-8 rounded-lg bg-violet-50 text-violet-700 items-center justify-center shrink-0">
                  <Calculator className="w-4 h-4" aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0">
                  {calc.name}
                </h3>
              </div>
              {calc.description && (
                <p className="text-xs text-[var(--ink-2)] leading-snug mb-3 line-clamp-2">
                  {calc.description}
                </p>
              )}
              <div className="mt-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRunning(calc)
                    setMode('run')
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-ed)] px-3 py-2 text-xs font-semibold text-[var(--ink-2)] hover:border-[var(--ink-3)] transition-colors"
                >
                  Openen
                </button>
                <button
                  type="button"
                  onClick={() => deleteSaved(calc.id)}
                  aria-label={`Verwijder ${calc.name}`}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
