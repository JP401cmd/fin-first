// Global-sync orchestrator (pure async function, runs in the browser).
//
// Coordinates a one-shot batch sync across:
//   1. Exchange connections (`POST /api/integrations/exchanges/[id]/sync`)
//   2. Wallet addresses     (`POST /api/integrations/wallets/[id]/sync`)
//   3. Holdings prices      (`POST /api/holdings/refresh-prices`)
//
// Concurrency: max 3 in-flight requests at a time to keep the browser, our own
// API routes, and upstream APIs (Bitvavo, Blockchair, Yahoo, CoinGecko) happy.
// We use a sliding-window pool — as soon as one finishes, the next slot starts.
//
// Per-step events are emitted via the `onEvent` callback so the UI can render
// determinate progress without the orchestrator owning React state. The final
// aggregate is returned for the toast / partial-failure indicator.

import { fetchWithRetry } from './fetch-with-retry'

export type SyncJobKind = 'exchange' | 'wallet' | 'prices'

export interface SyncJob {
  id: string                  // unique job identifier (connection id, or 'prices')
  kind: SyncJobKind
  label: string               // human-friendly ("Bitvavo", "Bitcoin wallet", "Prijzen")
  url: string                 // POST endpoint
}

export type SyncOutcome = 'success' | 'error' | 'partial'

export interface SyncJobResult {
  job: SyncJob
  outcome: SyncOutcome
  itemsSynced?: number
  totalEur?: number | null
  error?: string
  durationMs: number
}

export interface SyncEvent {
  type: 'start' | 'job-start' | 'job-end' | 'end'
  totalJobs: number
  completedJobs: number
  job?: SyncJob
  result?: SyncJobResult
}

export interface GlobalSyncResult {
  results: SyncJobResult[]
  successCount: number
  errorCount: number
  partialCount: number
  totalDurationMs: number
}

export interface GlobalSyncOptions {
  concurrency?: number
  onEvent?: (event: SyncEvent) => void
  signal?: AbortSignal
}

interface SyncBody {
  status?: 'success' | 'error' | 'partial'
  itemsSynced?: number
  totalEur?: number | null
  error?: string
  message?: string
  totalsSynced?: number
}

async function runOne(job: SyncJob, signal?: AbortSignal): Promise<SyncJobResult> {
  const startedAt = performance.now()
  try {
    const res = await fetchWithRetry(
      job.url,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      { signal, timeoutMs: 90_000, retries: 2 },
    )

    let body: SyncBody = {}
    try {
      body = (await res.json()) as SyncBody
    } catch {
      // Non-JSON response; treat as error if status is bad
    }

    const durationMs = Math.round(performance.now() - startedAt)

    if (!res.ok) {
      return {
        job,
        outcome: 'error',
        error: body?.error ?? body?.message ?? `HTTP ${res.status}`,
        durationMs,
      }
    }

    // Server explicitly returns status:'partial' when sync succeeded but a
    // sub-step (e.g. Bitvavo trades-import) failed. Surface that to the user.
    if (body?.status === 'error') {
      return {
        job,
        outcome: 'error',
        error: body?.error ?? 'Onbekende fout.',
        durationMs,
      }
    }

    const outcome: SyncOutcome = body?.status === 'partial' ? 'partial' : 'success'

    return {
      job,
      outcome,
      itemsSynced: typeof body?.itemsSynced === 'number'
        ? body.itemsSynced
        : typeof body?.totalsSynced === 'number'
          ? body.totalsSynced
          : undefined,
      totalEur: typeof body?.totalEur === 'number' ? body.totalEur : null,
      error: outcome === 'partial' ? (body?.error ?? undefined) : undefined,
      durationMs,
    }
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt)
    if ((err as { name?: string })?.name === 'AbortError') {
      return { job, outcome: 'error', error: 'Geannuleerd', durationMs }
    }
    const message = err instanceof Error ? err.message : 'Netwerkfout'
    return { job, outcome: 'error', error: message, durationMs }
  }
}

/**
 * Run an array of sync jobs with bounded concurrency. Resolves only after every
 * job has completed (success, partial, or error). Cancellation via `signal`
 * propagates to in-flight `fetch` calls — pending jobs that haven't started
 * resolve as `error` with `'Geannuleerd'`.
 */
export async function runGlobalSync(
  jobs: SyncJob[],
  options: GlobalSyncOptions = {},
): Promise<GlobalSyncResult> {
  const { concurrency = 3, onEvent, signal } = options
  const totalJobs = jobs.length
  const startedAt = performance.now()
  const results: SyncJobResult[] = []
  let completed = 0

  onEvent?.({ type: 'start', totalJobs, completedJobs: 0 })

  if (totalJobs === 0) {
    onEvent?.({ type: 'end', totalJobs: 0, completedJobs: 0 })
    return {
      results: [],
      successCount: 0,
      errorCount: 0,
      partialCount: 0,
      totalDurationMs: Math.round(performance.now() - startedAt),
    }
  }

  let cursor = 0

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const idx = cursor++
      if (idx >= totalJobs) return
      const job = jobs[idx]
      onEvent?.({ type: 'job-start', totalJobs, completedJobs: completed, job })
      const result = await runOne(job, signal)
      results.push(result)
      completed++
      onEvent?.({
        type: 'job-end',
        totalJobs,
        completedJobs: completed,
        job,
        result,
      })
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, totalJobs) },
    () => worker(),
  )
  await Promise.all(workers)

  const successCount = results.filter((r) => r.outcome === 'success').length
  const errorCount = results.filter((r) => r.outcome === 'error').length
  const partialCount = results.filter((r) => r.outcome === 'partial').length

  onEvent?.({ type: 'end', totalJobs, completedJobs: completed })

  return {
    results,
    successCount,
    errorCount,
    partialCount,
    totalDurationMs: Math.round(performance.now() - startedAt),
  }
}

// ── Helpers to build SyncJob[] from connections-data shapes ────────────────

import type { ExchangeConnectionRow, WalletAddressRow } from '@/lib/connections-data'

const EXCHANGE_LABEL: Record<ExchangeConnectionRow['exchange'], string> = {
  bitvavo: 'Bitvavo',
  kraken: 'Kraken',
  coinbase: 'Coinbase',
}

const CHAIN_LABEL: Record<WalletAddressRow['chain'], string> = {
  bitcoin: 'Bitcoin-wallet',
  ethereum: 'Ethereum-wallet',
  polygon: 'Polygon-wallet',
  arbitrum: 'Arbitrum-wallet',
  base: 'Base-wallet',
  solana: 'Solana-wallet',
}

export function buildSyncJobs(params: {
  exchanges: ExchangeConnectionRow[]
  wallets: WalletAddressRow[]
  includePrices?: boolean
}): SyncJob[] {
  const { exchanges, wallets, includePrices = true } = params
  const jobs: SyncJob[] = []

  for (const e of exchanges) {
    jobs.push({
      id: e.id,
      kind: 'exchange',
      label: e.label?.trim() ? `${EXCHANGE_LABEL[e.exchange]} · ${e.label}` : EXCHANGE_LABEL[e.exchange],
      url: `/api/integrations/exchanges/${e.id}/sync`,
    })
  }

  for (const w of wallets) {
    jobs.push({
      id: w.id,
      kind: 'wallet',
      label: w.label?.trim() ? `${CHAIN_LABEL[w.chain]} · ${w.label}` : CHAIN_LABEL[w.chain],
      url: `/api/integrations/wallets/${w.id}/sync`,
    })
  }

  if (includePrices) {
    jobs.push({
      id: 'prices',
      kind: 'prices',
      label: 'Prijzen verversen',
      url: '/api/holdings/refresh-prices',
    })
  }

  return jobs
}
