'use client'

// Read-only kaart voor publieke blockchain-bronnen — Blockchair (BTC + ETH)
// + 4 chain-RPC's (Polygon, Arbitrum, Base, Solana). Worden tijdens elke
// wallet-sync vanuit de server aangesproken.

import { useState } from 'react'
import { useToast } from '@/components/app/toast-provider'

interface SourceTestResult {
  ok: boolean
  latencyMs: number
  error?: string
}

interface BlockchainTestResponse {
  blockchair: SourceTestResult
  polygon: SourceTestResult
  arbitrum: SourceTestResult
  base: SourceTestResult
  solana: SourceTestResult
}

type SourceState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number }
  | { kind: 'error'; message: string }

interface SourceDef {
  key: keyof BlockchainTestResponse
  name: string
  role: string
  endpoint: string
}

const SOURCES: SourceDef[] = [
  {
    key: 'blockchair',
    name: 'Blockchair',
    role: 'Bitcoin- en Ethereum-saldo (publieke explorer)',
    endpoint: 'api.blockchair.com',
  },
  {
    key: 'polygon',
    name: 'Polygon RPC',
    role: 'MATIC-saldo via JSON-RPC',
    endpoint: 'polygon-rpc.com',
  },
  {
    key: 'arbitrum',
    name: 'Arbitrum RPC',
    role: 'ETH op Arbitrum One',
    endpoint: 'arb1.arbitrum.io',
  },
  {
    key: 'base',
    name: 'Base RPC',
    role: 'ETH op Base mainnet',
    endpoint: 'mainnet.base.org',
  },
  {
    key: 'solana',
    name: 'Solana RPC',
    role: 'SOL-saldo op mainnet-beta',
    endpoint: 'api.mainnet-beta.solana.com',
  },
]

type StatesMap = Record<keyof BlockchainTestResponse, SourceState>

const INITIAL_STATES: StatesMap = {
  blockchair: { kind: 'idle' },
  polygon: { kind: 'idle' },
  arbitrum: { kind: 'idle' },
  base: { kind: 'idle' },
  solana: { kind: 'idle' },
}

export function BlockchainSourcesCard() {
  const { addToast } = useToast()
  const [states, setStates] = useState<StatesMap>(INITIAL_STATES)
  const [running, setRunning] = useState(false)

  async function runTest() {
    if (running) return
    setRunning(true)

    const testing: StatesMap = {
      blockchair: { kind: 'testing' },
      polygon: { kind: 'testing' },
      arbitrum: { kind: 'testing' },
      base: { kind: 'testing' },
      solana: { kind: 'testing' },
    }
    setStates(testing)

    try {
      const res = await fetch('/api/integrations/blockchain/test', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as BlockchainTestResponse

      const next: StatesMap = {} as StatesMap
      let okCount = 0
      let totalCount = 0
      for (const def of SOURCES) {
        const r = json[def.key]
        totalCount++
        if (r.ok) {
          next[def.key] = { kind: 'ok', latencyMs: r.latencyMs }
          okCount++
        } else {
          next[def.key] = { kind: 'error', message: r.error ?? 'Onbekende fout' }
        }
      }
      setStates(next)

      const allOk = okCount === totalCount
      addToast({
        type: allOk ? 'success' : 'warning',
        title: allOk ? 'Blockchain-bronnen actief' : 'Blockchain-probleem',
        message: allOk
          ? `Alle ${totalCount} bronnen reageren.`
          : `${totalCount - okCount} van ${totalCount} faalden — bekijk details.`,
        duration: allOk ? 3000 : 6000,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Netwerkfout'
      const errorStates: StatesMap = {} as StatesMap
      for (const def of SOURCES) {
        errorStates[def.key] = { kind: 'error', message }
      }
      setStates(errorStates)
      addToast({ type: 'error', title: 'Test mislukt', message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">Blockchain-bronnen</p>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            Publieke RPC&apos;s en explorers voor wallet-saldo. Geen credentials nodig.
          </p>
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] disabled:cursor-wait disabled:opacity-50"
        >
          {running ? 'Testen…' : 'Test bronnen'}
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        {SOURCES.map((def) => (
          <SourceRow
            key={def.key}
            name={def.name}
            role={def.role}
            endpoint={def.endpoint}
            state={states[def.key]}
          />
        ))}
      </ul>
    </div>
  )
}

function SourceRow({
  name,
  role,
  endpoint,
  state,
}: {
  name: string
  role: string
  endpoint: string
  state: SourceState
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--ink)]">{name}</p>
        <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">{role}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
          {endpoint}
        </p>
        {state.kind === 'error' && (
          <p className="mt-1 font-mono text-[10px] tabular-nums text-red-700">{state.message}</p>
        )}
      </div>
      <SourceBadge state={state} />
    </li>
  )
}

function SourceBadge({ state }: { state: SourceState }) {
  if (state.kind === 'idle') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
        Geen test
      </span>
    )
  }
  if (state.kind === 'testing') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--subtle)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
        <span className="inline-block h-2 w-2 rounded-full animate-pulse bg-[var(--ink-4)]" aria-hidden="true" />
        Testen…
      </span>
    )
  }
  if (state.kind === 'ok') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-[color-mix(in_oklab,var(--positive)_30%,transparent)] bg-[color-mix(in_oklab,var(--positive)_8%,transparent)] px-2 py-1 font-mono text-[10px] tabular-nums uppercase tracking-[0.08em] text-positive">
        <span className="inline-block h-2 w-2 rounded-full bg-positive" aria-hidden="true" />
        Actief · {state.latencyMs}ms
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 border border-[color-mix(in_oklab,var(--negative)_30%,transparent)] bg-[color-mix(in_oklab,var(--negative)_8%,transparent)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-negative">
      <span className="inline-block h-2 w-2 rounded-full bg-negative" aria-hidden="true" />
      Fout
    </span>
  )
}
