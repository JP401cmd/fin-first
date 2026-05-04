'use client'

// React Context dat globale sync-state beheert. Hoort BOVEN de router-outlet te
// hangen zodat een lopende sync zichtbaar blijft tijdens page-navigation. De
// header-knop én de rapport-modal lezen beide uit deze provider.
//
// State machine:
//   idle    → user heeft (nog) niets gesynced of laatste run was succesvol
//   syncing → één run is in progress; toont determinate progress + spinner
//   partial → laatste run had >=1 fout of partial; rode dot blijft staan tot
//             de modal geopend wordt (= acknowledged)

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { runGlobalSync, buildSyncJobs, type SyncEvent, type SyncJob, type SyncJobResult, type GlobalSyncResult } from '@/lib/sync/global-sync'
import { useToast } from '@/components/app/toast-provider'
import { formatCurrency } from '@/lib/format'
import type { ExchangeConnectionRow, WalletAddressRow } from '@/lib/connections-data'

export type SyncPhase = 'idle' | 'syncing' | 'partial'

export interface ConnectionResult {
  jobId: string
  kind: SyncJob['kind']
  label: string
  outcome: SyncJobResult['outcome']
  error?: string
  itemsSynced?: number
  totalEur?: number | null
  finishedAt: string
}

interface State {
  phase: SyncPhase
  /** Total number of sync-jobs (connections + prices-refresh). For the progress bar. */
  totalJobs: number
  completedJobs: number
  /**
   * Number of user-configured koppelingen (exchanges + wallets) — does NOT
   * include the implicit prices-refresh step. This is what the visible "X/Y"
   * counter shows so the count matches the "X koppelingen" summary.
   */
  totalConnections: number
  /** Whether this run includes a prices-refresh job (always true today, but tracked explicitly). */
  pricesIncluded: boolean
  /** The job currently in flight — used to detect the prices-step for label rendering. */
  currentJob: { id: string; kind: SyncJob['kind']; label: string } | null
  lastResult: GlobalSyncResult | null
  lastFinishedAt: string | null
  /** Per-connection results from the last (or in-progress) run. */
  perConnection: Record<string, ConnectionResult>
}

type Action =
  | { type: 'sync-start'; totalJobs: number; totalConnections: number; pricesIncluded: boolean }
  | { type: 'job-start'; job: SyncJob; completedJobs: number }
  | { type: 'job-end'; job: SyncJob; result: SyncJobResult; completedJobs: number }
  | { type: 'sync-end'; aggregate: GlobalSyncResult; finishedAt: string }
  | { type: 'acknowledge-partial' }

const initialState: State = {
  phase: 'idle',
  totalJobs: 0,
  completedJobs: 0,
  totalConnections: 0,
  pricesIncluded: false,
  currentJob: null,
  lastResult: null,
  lastFinishedAt: null,
  perConnection: {},
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'sync-start':
      return {
        ...state,
        phase: 'syncing',
        totalJobs: action.totalJobs,
        completedJobs: 0,
        totalConnections: action.totalConnections,
        pricesIncluded: action.pricesIncluded,
        currentJob: null,
        // Reset per-connection map for the new run; keep lastResult so the UI
        // can still show "X min ago" until the new run finishes.
        perConnection: {},
      }
    case 'job-start':
      return {
        ...state,
        currentJob: { id: action.job.id, kind: action.job.kind, label: action.job.label },
        completedJobs: action.completedJobs,
      }
    case 'job-end': {
      const { job, result, completedJobs } = action
      const connection: ConnectionResult = {
        jobId: job.id,
        kind: job.kind,
        label: job.label,
        outcome: result.outcome,
        error: result.error,
        itemsSynced: result.itemsSynced,
        totalEur: result.totalEur,
        finishedAt: new Date().toISOString(),
      }
      return {
        ...state,
        completedJobs,
        perConnection: { ...state.perConnection, [job.id]: connection },
      }
    }
    case 'sync-end': {
      const hasFailure = action.aggregate.errorCount > 0 || action.aggregate.partialCount > 0
      return {
        ...state,
        phase: hasFailure ? 'partial' : 'idle',
        currentJob: null,
        lastResult: action.aggregate,
        lastFinishedAt: action.finishedAt,
      }
    }
    case 'acknowledge-partial':
      return state.phase === 'partial' ? { ...state, phase: 'idle' } : state
    default:
      return state
  }
}

interface GlobalSyncContextValue {
  state: State
  /** Start a global sync. Resolves with the aggregate; multiple concurrent calls are deduped. */
  triggerGlobalSync: (params: {
    exchanges: ExchangeConnectionRow[]
    wallets: WalletAddressRow[]
    /** When true, only runs the prices refresh (used when no connections exist). */
    pricesOnly?: boolean
  }) => Promise<GlobalSyncResult | null>
  /** Mark partial-failure as acknowledged (clears the red dot on the header button). */
  acknowledgePartial: () => void
}

const GlobalSyncContext = createContext<GlobalSyncContextValue | null>(null)

export function GlobalSyncProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { addToast } = useToast()

  // De-dupe concurrent triggers — second click during a run is a no-op.
  const inFlightRef = useRef(false)

  const triggerGlobalSync = useCallback(
    async (params: {
      exchanges: ExchangeConnectionRow[]
      wallets: WalletAddressRow[]
      pricesOnly?: boolean
    }): Promise<GlobalSyncResult | null> => {
      if (inFlightRef.current) return null
      inFlightRef.current = true

      const jobs = params.pricesOnly
        ? buildSyncJobs({ exchanges: [], wallets: [], includePrices: true })
        : buildSyncJobs({
            exchanges: params.exchanges,
            wallets: params.wallets,
            includePrices: true,
          })

      const totalConnections = jobs.filter((j) => j.kind !== 'prices').length
      const pricesIncluded = jobs.some((j) => j.kind === 'prices')

      const onEvent = (event: SyncEvent) => {
        if (event.type === 'start') {
          dispatch({
            type: 'sync-start',
            totalJobs: event.totalJobs,
            totalConnections,
            pricesIncluded,
          })
        } else if (event.type === 'job-start' && event.job) {
          dispatch({ type: 'job-start', job: event.job, completedJobs: event.completedJobs })
        } else if (event.type === 'job-end' && event.job && event.result) {
          dispatch({
            type: 'job-end',
            job: event.job,
            result: event.result,
            completedJobs: event.completedJobs,
          })
        }
      }

      addToast({
        type: 'info',
        title: 'Synchroniseren…',
        message:
          jobs.length === 1
            ? 'Prijzen worden bijgewerkt.'
            : `${jobs.length} bronnen worden bijgewerkt.`,
        duration: 2500,
      })

      try {
        const aggregate = await runGlobalSync(jobs, { concurrency: 3, onEvent })
        const finishedAt = new Date().toISOString()
        dispatch({ type: 'sync-end', aggregate, finishedAt })

        // End-toast — vertel de gebruiker wat er is gebeurd.
        if (aggregate.errorCount === 0 && aggregate.partialCount === 0) {
          const updatedItems = aggregate.results.reduce((acc, r) => acc + (r.itemsSynced ?? 0), 0)
          const totalValue = aggregate.results.reduce((acc, r) => acc + (r.totalEur ?? 0), 0)
          addToast({
            type: 'success',
            title: 'Bijgewerkt',
            message:
              jobs.length === 1
                ? 'Prijzen ververst.'
                : `${aggregate.successCount} van ${jobs.length} bronnen · ${updatedItems} items${
                    totalValue > 0 ? ` · ${formatCurrency(totalValue)}` : ''
                  }.`,
          })
        } else if (aggregate.errorCount > 0) {
          addToast({
            type: 'error',
            title: `${aggregate.errorCount} fout${aggregate.errorCount === 1 ? '' : 'en'}`,
            message: 'Open het sync-rapport voor details.',
            duration: 6000,
          })
        } else {
          addToast({
            type: 'warning',
            title: 'Deels gelukt',
            message: `${aggregate.partialCount} bron${aggregate.partialCount === 1 ? '' : 'nen'} met waarschuwing.`,
            duration: 6000,
          })
        }

        return aggregate
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Onbekende fout'
        addToast({
          type: 'error',
          title: 'Sync afgebroken',
          message,
        })
        // Treat as ended-with-error so the partial dot fires.
        dispatch({
          type: 'sync-end',
          aggregate: {
            results: [],
            successCount: 0,
            errorCount: 1,
            partialCount: 0,
            totalDurationMs: 0,
          },
          finishedAt: new Date().toISOString(),
        })
        return null
      } finally {
        inFlightRef.current = false
      }
    },
    [addToast],
  )

  const acknowledgePartial = useCallback(() => {
    dispatch({ type: 'acknowledge-partial' })
  }, [])

  const value = useMemo<GlobalSyncContextValue>(
    () => ({ state, triggerGlobalSync, acknowledgePartial }),
    [state, triggerGlobalSync, acknowledgePartial],
  )

  return <GlobalSyncContext.Provider value={value}>{children}</GlobalSyncContext.Provider>
}

export function useGlobalSync(): GlobalSyncContextValue {
  const ctx = useContext(GlobalSyncContext)
  if (!ctx) {
    throw new Error('useGlobalSync must be used within a GlobalSyncProvider')
  }
  return ctx
}
