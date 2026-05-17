'use client'

import { Edit3, FileSpreadsheet, Link2 } from 'lucide-react'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type InputMethod = 'manual' | 'csv' | 'api'

interface CryptoHoldingsState {
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

// ── Sectie 1 — Bron-selector ────────────────────────────────

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

// ── Config ──────────────────────────────────────────────────

export const cryptoHoldingsSetupConfig: AppSetupConfig<CryptoHoldingsState> = {
  appKey: 'crypto_holdings',
  featureSlug: APP_SETUP_SLUGS.crypto_holdings,
  kicker: 'Eenmalige setup',
  title: 'Stel Crypto-holdings in',
  intro:
    'Crypto vraagt aparte aandacht voor bron en valuta. Geef aan waar je crypto staat en hoe je het wilt bijhouden — de app rekent automatisch naar EUR.',
  initialState: () => ({
    sources: [],
    inputMethod: null,
    acknowledgedTxLogging: false,
  }),
  sections: [
    {
      id: 'sources',
      kicker: '1. Bronnen',
      title: 'Waar staat je crypto?',
      hint: 'Selecteer alle plekken waar je iets hebt — handelsbeurzen en wallets samen.',
      render: CryptoSourceSelector,
    },
    {
      id: 'input-method',
      kicker: '2. Invoer',
      title: 'Hoe ga je posities invoeren?',
      render: InputMethodPicker,
    },
    {
      id: 'transactions',
      kicker: '3. Transacties',
      title: 'Wat we tracken',
      render: TransactionExplainer,
    },
  ],
  validate: (state) => {
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
    sources: state.sources,
    inputMethod: state.inputMethod,
  }),
}
