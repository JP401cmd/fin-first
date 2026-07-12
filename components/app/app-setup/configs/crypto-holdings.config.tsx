'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Coins, Edit3, FileSpreadsheet, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type InputMethod = 'manual' | 'csv' | 'api'

interface CryptoHoldingsState {
  /** Crypto-assets die de gebruiker daadwerkelijk wil volgen. */
  selectedAssetIds: string[]
  /** Exchange/wallet-bronnen waar de gebruiker crypto heeft. */
  sources: string[]
  inputMethod: InputMethod | null
  acknowledgedTxLogging: boolean
}

// ── Bron-catalog ─────────────────────────────────────────────

interface CryptoSourceOption {
  id: string
  label: string
  /** Exchange = handelshistorie beschikbaar; wallet = alleen saldo. */
  kind: 'exchange' | 'wallet'
}

const SOURCES: CryptoSourceOption[] = [
  { id: 'bitvavo', label: 'Bitvavo', kind: 'exchange' },
  { id: 'kraken', label: 'Kraken', kind: 'exchange' },
  { id: 'binance', label: 'Binance', kind: 'exchange' },
  { id: 'coinbase', label: 'Coinbase', kind: 'exchange' },
  { id: 'metamask', label: 'MetaMask (hot)', kind: 'wallet' },
  { id: 'ledger', label: 'Ledger (cold)', kind: 'wallet' },
  { id: 'trezor', label: 'Trezor (cold)', kind: 'wallet' },
  { id: 'anders', label: 'Anders', kind: 'wallet' },
]

// ── Sectie 1 — Asset-selector ───────────────────────────────

interface CryptoAssetRow {
  id: string
  name: string
  current_value: number
}

function CryptoAssetSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<CryptoHoldingsState>) {
  const [rows, setRows] = useState<CryptoAssetRow[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('assets')
          .select('id, name, current_value')
          .eq('asset_type', 'crypto')
          .eq('is_active', true)
          .order('current_value', { ascending: false })
        if (aborted) return
        if (error) throw error
        setRows((data ?? []) as CryptoAssetRow[])
      } catch (err) {
        if (aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'Kon crypto-bezittingen niet laden')
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
          Je hebt nog geen crypto-bezitting geregistreerd. Voeg een crypto-bezitting toe via{' '}
          <Link
            href="/core/assets/crypto"
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
              <Coins className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
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

// ── Sectie 2 — Bron-selector ────────────────────────────────

function CryptoSourceSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<CryptoHoldingsState>) {
  function toggle(id: string) {
    setState((prev) => {
      const has = prev.sources.includes(id)
      return {
        ...prev,
        sources: has ? prev.sources.filter((x) => x !== id) : [...prev.sources, id],
      }
    })
  }

  const exchanges = SOURCES.filter((s) => s.kind === 'exchange')
  const wallets = SOURCES.filter((s) => s.kind === 'wallet')

  return (
    <div className="space-y-4">
      <SourceGroup title="Exchanges" subtitle="Handelshistorie beschikbaar via export of API.">
        <div className="flex flex-wrap gap-2">
          {exchanges.map((source) => {
            const selected = state.sources.includes(source.id)
            return (
              <button
                type="button"
                key={source.id}
                onClick={() => toggle(source.id)}
                className={`min-h-9 border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]/40'
                }`}
              >
                {source.label}
              </button>
            )
          })}
        </div>
      </SourceGroup>
      <SourceGroup title="Wallets" subtitle="Alleen saldo zichtbaar — geen handelshistorie tenzij je on-chain log inleest.">
        <div className="flex flex-wrap gap-2">
          {wallets.map((source) => {
            const selected = state.sources.includes(source.id)
            return (
              <button
                type="button"
                key={source.id}
                onClick={() => toggle(source.id)}
                className={`min-h-9 border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]/40'
                }`}
              >
                {source.label}
              </button>
            )
          })}
        </div>
      </SourceGroup>
    </div>
  )
}

function SourceGroup({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{title}</p>
      <p className="mt-0.5 font-serif italic text-[11px] leading-snug text-[var(--ink-3)]">
        {subtitle}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

// ── Sectie 2 — Input-methode ────────────────────────────────

function InputMethodPicker({
  state,
  setState,
}: AppSetupSectionRenderProps<CryptoHoldingsState>) {
  const options: { id: InputMethod; icon: typeof Edit3; title: string; description: string }[] = [
    {
      id: 'api',
      icon: Link2,
      title: 'Exchange-koppeling',
      description: 'Read-only API-key — saldi en transacties synchroniseren automatisch.',
    },
    {
      id: 'csv',
      icon: FileSpreadsheet,
      title: 'CSV-import',
      description: 'Exporteer een afschrift uit je exchange en upload het bestand.',
    },
    {
      id: 'manual',
      icon: Edit3,
      title: 'Handmatig saldo',
      description: 'Voer per wallet of exchange het huidige saldo zelf in. Handig voor cold storage.',
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

function TransactionExplainer({
  state,
  setState,
}: AppSetupSectionRenderProps<CryptoHoldingsState>) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          title="EUR-basis"
          copy="We rekenen kostprijs en P&L door in EUR — ook bij stablecoin- en cross-coin-trades. Belangrijk voor je Box 3-aangifte."
        />
        <Card
          title="Staking & airdrops"
          copy="Rewards en airdrops loggen we als aparte inkomsten-mutaties zodat je belastbare basis klopt zonder je cost-basis te vertekenen."
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
          Ik snap hoe crypto-mutaties worden gelogd.
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

export const cryptoHoldingsSetupConfig: AppSetupConfig<CryptoHoldingsState> = {
  appKey: 'crypto_holdings',
  featureSlug: APP_SETUP_SLUGS.crypto_holdings,
  kicker: 'Eenmalige setup',
  title: 'Stel Crypto-holdings in',
  intro:
    'Crypto vraagt aparte aandacht voor bron en valuta. Geef aan waar je crypto staat en hoe je het wilt bijhouden — de app rekent automatisch naar EUR.',
  initialState: () => ({
    selectedAssetIds: [],
    sources: [],
    inputMethod: null,
    acknowledgedTxLogging: false,
  }),
  sections: [
    {
      id: 'assets',
      kicker: '1. Bezittingen',
      title: 'Welke crypto-bezittingen wil je volgen?',
      hint: 'Selecteer alleen de crypto-bezittingen die je daadwerkelijk wilt bijhouden.',
      render: CryptoAssetSelector,
    },
    {
      id: 'sources',
      kicker: '2. Bronnen',
      title: 'Waar staat je crypto?',
      hint: 'Selecteer alle plekken waar je iets hebt — handelsbeurzen en wallets samen.',
      render: CryptoSourceSelector,
    },
    {
      id: 'input-method',
      kicker: '3. Invoer',
      title: 'Hoe ga je posities invoeren?',
      render: InputMethodPicker,
    },
    {
      id: 'transactions',
      kicker: '4. Transacties',
      title: 'Wat we tracken',
      render: TransactionExplainer,
    },
  ],
  validate: (state) => {
    if (state.selectedAssetIds.length === 0) {
      return { ok: false, reason: 'Kies minstens één crypto-bezitting.' }
    }
    if (state.sources.length === 0) {
      return { ok: false, reason: 'Geef minstens één bron op.' }
    }
    if (state.inputMethod === null) {
      return { ok: false, reason: 'Kies een invoermethode.' }
    }
    if (!state.acknowledgedTxLogging) {
      return { ok: false, reason: 'Bevestig dat je weet hoe crypto-mutaties werken.' }
    }
    return { ok: true }
  },
  endpoint: '/api/crypto-holdings/setup',
  buildPayload: (state) => ({
    selectedAssetIds: state.selectedAssetIds,
    sources: state.sources,
    inputMethod: state.inputMethod,
  }),
}
