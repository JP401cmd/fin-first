'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type Strategy = 'aflossen' | 'beleggen' | 'mix'

interface HypotheekplannerState {
  mortgageId: string | null
  strategy: Strategy | null
  acknowledgedTracking: boolean
}

// ── Sectie 1 — Hypotheek-selector ───────────────────────────

interface MortgageRow {
  id: string
  name: string
  current_balance: number
  interest_rate: number
}

function MortgageSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<HypotheekplannerState>) {
  const [rows, setRows] = useState<MortgageRow[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('debts')
          .select('id, name, current_balance, interest_rate')
          .eq('debt_type', 'mortgage')
          .eq('is_active', true)
          .order('current_balance', { ascending: false })
        if (aborted) return
        if (error) throw error
        const r = (data ?? []) as MortgageRow[]
        setRows(r)
        if (state.mortgageId === null && r.length === 1) {
          setState((prev) => ({ ...prev, mortgageId: r[0].id }))
        }
      } catch (err) {
        if (aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'Kon hypotheken niet laden')
      }
    })()
    return () => {
      aborted = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (errorMsg) {
    return (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {errorMsg}
      </p>
    )
  }
  if (rows === null) {
    return <SkeletonRows rows={1} />
  }
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-5">
        <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Je hebt nog geen hypotheek geregistreerd. Voeg er één toe via{' '}
          <Link
            href="/core/debts"
            className="underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            Schulden
          </Link>{' '}
          voordat je de planner instelt.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const selected = state.mortgageId === row.id
        return (
          <li key={row.id}>
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                selected
                  ? 'border-[var(--ink)] bg-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
              }`}
            >
              <input
                type="radio"
                name="mortgage"
                checked={selected}
                onChange={() => setState((prev) => ({ ...prev, mortgageId: row.id }))}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              <Home className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
              <span className="flex-1 text-sm text-[var(--ink)]">{row.name}</span>
              <span className="font-mono tabular-nums text-[12px] text-[var(--ink-3)]">
                € {Math.round(row.current_balance).toLocaleString('nl-NL')} · {row.interest_rate.toFixed(2)}%
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ── Sectie 2 — Strategie ────────────────────────────────────

function StrategyPicker({
  state,
  setState,
}: AppSetupSectionRenderProps<HypotheekplannerState>) {
  const options: { id: Strategy; title: string; description: string }[] = [
    {
      id: 'aflossen',
      title: 'Aflossen',
      description: 'Extra geld in de hypotheek. Lagere maandlasten, garantie, eerder schuldvrij — maar minder beleggings-groei.',
    },
    {
      id: 'beleggen',
      title: 'Beleggen',
      description: 'Extra geld naar je beleggingsportefeuille. Verwacht hogere groei, maar accepteert volatiliteit en blijvende schuld.',
    },
    {
      id: 'mix',
      title: 'Mix',
      description: 'Deels aflossen, deels beleggen. Balanceert zekerheid en rendement — vaak het rationele optimum bij lage rente.',
    },
  ]
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = state.strategy === opt.id
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => setState((prev) => ({ ...prev, strategy: opt.id }))}
            className={`flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-[var(--ink)] bg-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                selected
                  ? 'border-[var(--ink)] bg-[var(--ink)]'
                  : 'border-[var(--border-md)] bg-[var(--paper)]'
              }`}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--paper)]" />}
            </span>
            <div className="flex-1">
              <h4 className="font-serif text-sm font-semibold text-[var(--ink)]">{opt.title}</h4>
              <p className="mt-0.5 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">
                {opt.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Sectie 3 — Uitleg ───────────────────────────────────────

function TrackingExplainer({
  state,
  setState,
}: AppSetupSectionRenderProps<HypotheekplannerState>) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          title="Aflossingen volgen"
          copy="We tonen je amortisatie-curve en mijlpalen (LTV 80%, schuldvrij-datum). Bij extra aflossing tikt de datum eerder."
        />
        <Card
          title="Woningwaarde"
          copy="Herwaardeer je woning periodiek via de waardestijging-slider; je equity-opbouw blijft realistisch."
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
        <input
          type="checkbox"
          checked={state.acknowledgedTracking}
          onChange={() =>
            setState((prev) => ({
              ...prev,
              acknowledgedTracking: !prev.acknowledgedTracking,
            }))
          }
          className="h-4 w-4 accent-[var(--ink)]"
        />
        <span className="text-sm text-[var(--ink-2)]">
          Ik snap hoe ik aflossing en woningwaarde bijhoud.
        </span>
      </label>
    </div>
  )
}

function Card({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
      <h4 className="font-serif text-sm font-semibold text-[var(--ink)]">{title}</h4>
      <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">{copy}</p>
    </div>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40"
        />
      ))}
    </div>
  )
}

// ── Config ──────────────────────────────────────────────────

export const hypotheekplannerSetupConfig: AppSetupConfig<HypotheekplannerState> = {
  appKey: 'hypotheekplanner',
  featureSlug: APP_SETUP_SLUGS.hypotheekplanner,
  kicker: 'Eenmalige setup',
  title: 'Stel de Hypotheekplanner in',
  intro:
    'Twee keuzes bepalen wat de planner voor jou laat zien: welke hypotheek je tracked en welke aflos-strategie bij je past.',
  initialState: () => ({
    mortgageId: null,
    strategy: null,
    acknowledgedTracking: false,
  }),
  sections: [
    {
      id: 'mortgage',
      kicker: '1. Hypotheek',
      title: 'Welke hypotheek volg je?',
      hint: 'De planner rekent op één hoofdhypotheek. Heb je er meerdere, kies de grootste of belangrijkste.',
      render: MortgageSelector,
    },
    {
      id: 'strategy',
      kicker: '2. Strategie',
      title: 'Wat doe je met extra ruimte?',
      hint: 'Bepaalt het advies in de Hypotheek-vs-Beleggen sectie. Je kunt het later wijzigen.',
      render: StrategyPicker,
    },
    {
      id: 'tracking',
      kicker: '3. Tracking',
      title: 'Hoe blijft het actueel',
      render: TrackingExplainer,
    },
  ],
  validate: (state) => {
    if (state.mortgageId === null) {
      return { ok: false, reason: 'Selecteer een hypotheek.' }
    }
    if (state.strategy === null) {
      return { ok: false, reason: 'Kies een strategie.' }
    }
    if (!state.acknowledgedTracking) {
      return { ok: false, reason: 'Bevestig dat je weet hoe je het bijhoudt.' }
    }
    return { ok: true }
  },
  endpoint: '/api/hypotheekplanner/setup',
  buildPayload: (state) => ({
    mortgageId: state.mortgageId,
    strategy: state.strategy,
  }),
}
