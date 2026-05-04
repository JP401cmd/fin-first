'use client'

// Read-only kaart voor publieke prijsbronnen — Yahoo Finance + CoinGecko.
//
// Anders dan exchange-koppelingen of wallets hebben deze geen credentials,
// geen per-user staat en geen `last_synced_at`. Ze worden tijdens élke sync
// transparant aangeroepen vanaf de server. Voor de gebruiker is het wel
// nuttig om te weten dat ze bestaan en om bij twijfel een latency-test te
// kunnen draaien — vandaar deze kaart in het sync-rapport.

import { useState } from 'react'
import { useToast } from '@/components/app/toast-provider'

interface SourceTestResult {
  ok: boolean
  latencyMs: number
  error?: string
}

interface MarketTestResponse {
  yahoo: SourceTestResult
  coingecko: SourceTestResult
}

type SourceState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number }
  | { kind: 'error'; message: string }

export function MarketDataSourcesCard() {
  const { addToast } = useToast()
  const [yahoo, setYahoo] = useState<SourceState>({ kind: 'idle' })
  const [coingecko, setCoinGecko] = useState<SourceState>({ kind: 'idle' })
  const [running, setRunning] = useState(false)

  async function runTest() {
    if (running) return
    setRunning(true)
    setYahoo({ kind: 'testing' })
    setCoinGecko({ kind: 'testing' })
    try {
      const res = await fetch('/api/integrations/market-data/test', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as MarketTestResponse

      setYahoo(
        json.yahoo.ok
          ? { kind: 'ok', latencyMs: json.yahoo.latencyMs }
          : { kind: 'error', message: json.yahoo.error ?? 'Onbekende fout' },
      )
      setCoinGecko(
        json.coingecko.ok
          ? { kind: 'ok', latencyMs: json.coingecko.latencyMs }
          : { kind: 'error', message: json.coingecko.error ?? 'Onbekende fout' },
      )

      const bothOk = json.yahoo.ok && json.coingecko.ok
      addToast({
        type: bothOk ? 'success' : 'warning',
        title: bothOk ? 'Prijsbronnen actief' : 'Prijsbron-probleem',
        message: bothOk
          ? `Yahoo ${json.yahoo.latencyMs}ms · CoinGecko ${json.coingecko.latencyMs}ms`
          : 'Bekijk details in het rapport.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Netwerkfout'
      setYahoo({ kind: 'error', message })
      setCoinGecko({ kind: 'error', message })
      addToast({ type: 'error', title: 'Test mislukt', message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">Prijsbronnen</p>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            Publieke API&apos;s zonder credentials. Worden bij elke sync automatisch
            aangeroepen vanuit de server.
          </p>
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-md)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-all hover:-translate-y-px hover:bg-[var(--subtle)] disabled:cursor-wait disabled:opacity-50"
        >
          {running ? 'Testen…' : 'Test prijsbronnen'}
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        <SourceRow
          name="Yahoo Finance"
          role="Primair · stocks, ETFs, top-crypto (BTC-EUR, ETH-EUR…)"
          state={yahoo}
        />
        <SourceRow
          name="CoinGecko"
          role="Fallback · long-tail crypto (ADA, BNB, AVAX, TIA, INJ…)"
          state={coingecko}
        />
      </ul>
    </div>
  )
}

function SourceRow({ name, role, state }: { name: string; role: string; state: SourceState }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-ed)] pt-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--ink)]">{name}</p>
        <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">{role}</p>
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
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)] animate-pulse" aria-hidden="true" />
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
