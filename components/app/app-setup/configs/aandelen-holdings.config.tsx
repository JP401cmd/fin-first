'use client'

import { Edit3, FileSpreadsheet, Link2 } from 'lucide-react'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type InputMethod = 'manual' | 'csv' | 'api'

interface AandelenHoldingsState {
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

// ── Sectie 1 — Broker-selector ──────────────────────────────

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
      title: 'API-koppeling',
      description: 'Voor brokers die het ondersteunen, sync je posities automatisch. Read-only verbinding.',
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

// ── Config ──────────────────────────────────────────────────

export const aandelenHoldingsSetupConfig: AppSetupConfig<AandelenHoldingsState> = {
  appKey: 'aandelen_holdings',
  featureSlug: APP_SETUP_SLUGS.aandelen_holdings,
  kicker: 'Eenmalige setup',
  title: 'Stel Aandelen-holdings in',
  intro:
    'Twee keuzes om je portefeuille goed te volgen: bij welke broker(s) je belegt en hoe je posities binnenkomen.',
  initialState: () => ({
    brokers: [],
    inputMethod: null,
    acknowledgedTxLogging: false,
  }),
  sections: [
    {
      id: 'brokers',
      kicker: '1. Brokers',
      title: 'Bij welke broker(s) beleg je?',
      hint: 'Kies één of meer — bepaalt vooraf ingevulde tags en welke CSV-formats we herkennen.',
      render: BrokerSelector,
    },
    {
      id: 'input-method',
      kicker: '2. Invoer',
      title: 'Hoe komen posities binnen?',
      render: InputMethodPicker,
    },
    {
      id: 'transactions',
      kicker: '3. Transacties',
      title: 'Wat we tracken',
      render: TransactionLoggingExplainer,
    },
  ],
  validate: (state) => {
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
    brokers: state.brokers,
    inputMethod: state.inputMethod,
  }),
}
