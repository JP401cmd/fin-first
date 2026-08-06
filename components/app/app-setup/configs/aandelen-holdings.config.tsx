'use client'

import { useEffect, useState } from 'react'
import { LineChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import { AddItemCta } from '../add-item-cta'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────
//
// Bewust minimaal (aug 2026): de setup vraagt alléén welke beleggingen je
// aan de app koppelt — gelijkgetrokken met crypto-holdings en de
// hypotheekplanner. De eerdere broker-/invoermethode-stappen schreven
// voorkeuren die nergens werden gelezen; die keuzes horen bij het moment
// van koppelen of importeren zelf.

interface AandelenHoldingsState {
  /** Investment-assets die de gebruiker daadwerkelijk wil volgen. */
  selectedAssetIds: string[]
}

// ── Sectie — Asset-selector ─────────────────────────────────

interface InvestmentAssetRow {
  id: string
  name: string
  current_value: number
}

function InvestmentAssetSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<AandelenHoldingsState>) {
  const [rows, setRows] = useState<InvestmentAssetRow[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('assets')
          .select('id, name, current_value')
          .eq('asset_type', 'investment')
          .eq('is_active', true)
          .order('current_value', { ascending: false })
        if (aborted) return
        if (error) throw error
        setRows((data ?? []) as InvestmentAssetRow[])
      } catch (err) {
        if (aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'Kon beleggingen niet laden')
      }
    })()
    return () => {
      aborted = true
    }
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
          Je hebt nog geen belegging geregistreerd. Voeg er eerst één toe —
          daarna koppel je &apos;m hier aan de app.
        </p>
        <div className="mt-4">
          <AddItemCta label="Voeg belegging toe" />
        </div>
      </div>
    )
  }

  function toggle(id: string) {
    setState((prev) => {
      const has = prev.selectedAssetIds.includes(id)
      return {
        ...prev,
        selectedAssetIds: has
          ? prev.selectedAssetIds.filter((x) => x !== id)
          : [...prev.selectedAssetIds, id],
      }
    })
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((row) => {
          const selected = state.selectedAssetIds.includes(row.id)
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
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(row.id)}
                  className="h-4 w-4 accent-[var(--ink)]"
                />
                <LineChart className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
                <span className="flex-1 text-sm text-[var(--ink)]">{row.name}</span>
                <span className="font-mono tabular-nums text-[12px] text-[var(--ink-3)]">
                  € {Math.round(row.current_value).toLocaleString('nl-NL')}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <AddItemCta label="Voeg belegging toe" />
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

export const aandelenHoldingsSetupConfig: AppSetupConfig<AandelenHoldingsState> = {
  appKey: 'aandelen_holdings',
  featureSlug: APP_SETUP_SLUGS.aandelen_holdings,
  kicker: 'Eenmalige setup',
  title: 'Stel Aandelen-holdings in',
  intro:
    'Kies welke beleggingen je in deze app volgt. Je keuze wordt op de bezitting zelf geregistreerd — daar kun je het volgen later ook aan- of uitzetten.',
  initialState: () => ({
    selectedAssetIds: [],
  }),
  sections: [
    {
      id: 'assets',
      kicker: 'Beleggingen',
      title: 'Welke aandelen/beleggingen wil je volgen?',
      hint: 'Selecteer alleen de beleggingen die je daadwerkelijk wilt bijhouden.',
      render: InvestmentAssetSelector,
    },
  ],
  validate: (state) => {
    if (state.selectedAssetIds.length === 0) {
      return { ok: false, reason: 'Kies minstens één belegging.' }
    }
    return { ok: true }
  },
  endpoint: '/api/aandelen-holdings/setup',
  buildPayload: (state) => ({
    selectedAssetIds: state.selectedAssetIds,
  }),
}
