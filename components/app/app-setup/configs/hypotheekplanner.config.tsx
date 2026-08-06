'use client'

import { useEffect, useState } from 'react'
import { Home } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import { AddItemCta } from '../add-item-cta'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────
//
// Bewust minimaal (aug 2026): de setup vraagt alléén welke hypotheek je
// aan de planner koppelt — gelijkgetrokken met crypto- en aandelen-
// holdings. De eerdere strategie-/uitleg-stappen vervielen: de strategie
// is in de planner zelf altijd aanpasbaar (Hypotheek-vs-Beleggen-sectie)
// en de opgeslagen voorkeur werd nergens gelezen.

interface HypotheekplannerState {
  mortgageId: string | null
}

// ── Sectie — Hypotheek-selector ─────────────────────────────

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
          Je hebt nog geen hypotheek geregistreerd. Voeg er eerst één toe —
          daarna koppel je &apos;m hier aan de planner.
        </p>
        <div className="mt-4">
          <AddItemCta label="Voeg hypotheek toe" href="/overzicht/schulden/mortgage" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
      <AddItemCta label="Voeg hypotheek toe" href="/overzicht/schulden/mortgage" />
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
    'Kies welke hypotheek de planner volgt. Je keuze wordt op de hypotheek zelf geregistreerd — daar kun je het volgen later ook aan- of uitzetten.',
  initialState: () => ({
    mortgageId: null,
  }),
  sections: [
    {
      id: 'mortgage',
      kicker: 'Hypotheek',
      title: 'Welke hypotheek volg je?',
      hint: 'De planner rekent op één hoofdhypotheek. Heb je er meerdere, kies de grootste of belangrijkste.',
      render: MortgageSelector,
    },
  ],
  validate: (state) => {
    if (state.mortgageId === null) {
      return { ok: false, reason: 'Selecteer een hypotheek.' }
    }
    return { ok: true }
  },
  endpoint: '/api/hypotheekplanner/setup',
  buildPayload: (state) => ({
    mortgageId: state.mortgageId,
  }),
}
