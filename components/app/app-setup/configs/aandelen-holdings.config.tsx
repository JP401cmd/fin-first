'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Edit3, FileSpreadsheet, Link2, LineChart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type InputMethod = 'manual' | 'csv' | 'api'

interface AandelenHoldingsState {
  /** Investment-assets die de gebruiker daadwerkelijk wil volgen. */
  selectedAssetIds: string[]
  brokers: string[]
  inputMethod: InputMethod | null
  acknowledgedTxLogging: boolean
}

// ── Broker-lijst ────────────────────────────────────────────

const BROKERS: { id: string; label: string; status?: 'soon' }[] = [
  { id: 'degiro', label: 'DEGIRO' },
  { id: 'bux', label: 'BUX' },
  { id: 'bitvavo_stocks', label: 'Bitvavo Stocks' },
  { id: 'trading212', label: 'Trading 212' },
  { id: 'ibkr', label: 'Interactive Brokers' },
  { id: 'etoro', label: 'eToro' },
  { id: 'meesman', label: 'Meesman' },
  { id: 'anders', label: 'Anders' },
]

// ── Sectie 1 — Asset-selector ───────────────────────────────

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
          Je hebt nog geen belegging geregistreerd. Voeg een belegging toe via{' '}
          <Link
            href="/core/assets/investment"
            className="underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            Bezittingen
          </Link>{' '}
          voordat je de app instelt.
        </p>
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
  )
}

// ── Sectie 2 — Broker-selector ──────────────────────────────

function BrokerSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<AandelenHoldingsState>) {
  function toggle(id: string) {
    setState((prev) => {
      const has = prev.brokers.includes(id)
      return {
        ...prev,
        brokers: has ? prev.brokers.filter((x) => x !== id) : [...prev.brokers, id],
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {BROKERS.map((broker) => {
        const selected = state.brokers.includes(broker.id)
        return (
          <button
            type="button"
            key={broker.id}
            onClick={() => toggle(broker.id)}
            className={`min-h-9 border px-3 py-1.5 text-sm transition-colors ${
              selected
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]/40'
            }`}
          >
            {broker.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Sectie 2 — Input-methode picker ─────────────────────────

function InputMethodPicker({
  state,
  setState,
}: AppSetupSectionRenderProps<AandelenHoldingsState>) {
  const options: { id: InputMethod; icon: typeof Edit3; title: string; description: string }[] = [
    {
      id: 'manual',
      icon: Edit3,
      title: 'Handmatig',
      description: 'Voeg posities één voor één toe. Geschikt voor een beperkt aantal holdings.',
    },
    {
      id: 'csv',
      icon: FileSpreadsheet,
      title: 'CSV-import',
      description: 'Download een afschrift bij je broker en upload het. Wordt geparsed en gematched.',
    },
    {
      id: 'api',
      icon: Link2,
      title: 'Koppelen of importeren',
      description: 'Koppel Trading 212 of importeer een CSV later direct op de beleggings-bezitting zelf.',
    },
  ]
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = state.inputMethod === opt.id
        const Icon = opt.icon
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => setState((prev) => ({ ...prev, inputMethod: opt.id }))}
            className={`flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-[var(--ink)] bg-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
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

function TransactionLoggingExplainer({
  state,
  setState,
}: AppSetupSectionRenderProps<AandelenHoldingsState>) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ExplainerCard
          title="Aankoop & verkoop"
          copy="Per transactie leggen we kostprijs, aantal en valuta vast. De app berekent automatisch je gemiddelde inkoopprijs en running P&L."
        />
        <ExplainerCard
          title="Dividend & splits"
          copy="Log dividend als aparte mutatie zodat je rendement klopt; aandelensplits passen de holdings automatisch aan zonder cost-basis te verstoren."
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
        <input
          type="checkbox"
          checked={state.acknowledgedTxLogging}
          onChange={() =>
            setState((prev) => ({
              ...prev,
              acknowledgedTxLogging: !prev.acknowledgedTxLogging,
            }))
          }
          className="h-4 w-4 accent-[var(--ink)]"
        />
        <span className="text-sm text-[var(--ink-2)]">
          Ik snap hoe ik aandelen-transacties later kan vastleggen.
        </span>
      </label>
    </div>
  )
}

function ExplainerCard({ title, copy }: { title: string; copy: string }) {
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

export const aandelenHoldingsSetupConfig: AppSetupConfig<AandelenHoldingsState> = {
  appKey: 'aandelen_holdings',
  featureSlug: APP_SETUP_SLUGS.aandelen_holdings,
  kicker: 'Eenmalige setup',
  title: 'Stel Aandelen-holdings in',
  intro:
    'Twee keuzes om je portefeuille goed te volgen: bij welke broker(s) je belegt en hoe je posities binnenkomen.',
  initialState: () => ({
    selectedAssetIds: [],
    brokers: [],
    inputMethod: null,
    acknowledgedTxLogging: false,
  }),
  sections: [
    {
      id: 'assets',
      kicker: '1. Beleggingen',
      title: 'Welke aandelen/beleggingen wil je volgen?',
      hint: 'Selecteer alleen de beleggingen die je daadwerkelijk wilt bijhouden.',
      render: InvestmentAssetSelector,
    },
    {
      id: 'brokers',
      kicker: '2. Brokers',
      title: 'Bij welke broker(s) beleg je?',
      hint: 'Kies één of meer — bepaalt vooraf ingevulde tags en welke CSV-formats we herkennen.',
      render: BrokerSelector,
    },
    {
      id: 'input-method',
      kicker: '3. Invoer',
      title: 'Hoe komen posities binnen?',
      render: InputMethodPicker,
    },
    {
      id: 'transactions',
      kicker: '4. Transacties',
      title: 'Wat we tracken',
      render: TransactionLoggingExplainer,
    },
  ],
  validate: (state) => {
    if (state.selectedAssetIds.length === 0) {
      return { ok: false, reason: 'Kies minstens één belegging.' }
    }
    if (state.brokers.length === 0) {
      return { ok: false, reason: 'Kies minstens één broker.' }
    }
    if (state.inputMethod === null) {
      return { ok: false, reason: 'Kies een invoermethode.' }
    }
    if (!state.acknowledgedTxLogging) {
      return { ok: false, reason: 'Bevestig dat je weet hoe transacties werken.' }
    }
    return { ok: true }
  },
  endpoint: '/api/aandelen-holdings/setup',
  buildPayload: (state) => ({
    selectedAssetIds: state.selectedAssetIds,
    brokers: state.brokers,
    inputMethod: state.inputMethod,
  }),
}
