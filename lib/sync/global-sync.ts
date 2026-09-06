// Global-sync orchestrator (pure async function, runs in the browser).
//
// Coordinates a one-shot batch sync across:
//   1. Exchange connections (`POST /api/integrations/exchanges/[id]/sync`)
//   2. Wallet addresses     (`POST /api/integrations/wallets/[id]/sync`)
//   3. Bankkoppelingen      (`POST /api/bank-connect/sync`) — geremd, zie hieronder
//   4. Holdings prices      (`POST /api/holdings/refresh-prices`)
//
// Concurrency: max 3 in-flight requests at a time to keep the browser, our own
// API routes, and upstream APIs (Bitvavo, Blockchair, Yahoo, CoinGecko) happy.
// We use a sliding-window pool — as soon as one finishes, the next slot starts.
//
// Per-step events are emitted via the `onEvent` callback so the UI can render
// determinate progress without the orchestrator owning React state. The final
// aggregate is returned for the toast / partial-failure indicator.

import { fetchWithRetry } from './fetch-with-retry'

export type SyncJobKind = 'exchange' | 'wallet' | 'prices' | 'bank'

export interface SyncJob {
  id: string                  // unique job identifier (connection id, or 'prices')
  kind: SyncJobKind
  label: string               // human-friendly ("Bitvavo", "Bitcoin wallet", "Prijzen")
  url: string                 // POST endpoint
  /**
   * Optionele JSON-body. Alleen de bank-route heeft er één nodig
   * (`{ connection_account_id }`); exchanges, wallets en prijzen posten leeg.
   */
  body?: string
  /**
   * Deeplink naar het oppervlak waar de gebruiker deze koppeling zélf kan
   * synchroniseren. Voedt de knop in de melding — een melding die zegt "nog niet
   * gesynchroniseerd" hoort de handeling erbij te leveren.
   */
  manualHref?: string
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
  /** `POST /api/bank-connect/sync` telt nieuwe transacties in `new`. */
  new?: number
}

async function runOne(job: SyncJob, signal?: AbortSignal): Promise<SyncJobResult> {
  const startedAt = performance.now()
  try {
    const res = await fetchWithRetry(
      job.url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(job.body ? { body: job.body } : {}),
      },
      // Bankkoppelingen NIET opnieuw proberen: elk verzoek reserveert server-side
      // atomair een tik op de 10/dag-rem (`reserve_bank_sync_slot`), óók als het
      // daarna stukloopt. Twee stille herhalingen zouden één klik dus drie tikken
      // laten kosten — en de gebruiker daarna van zijn handmatige sync afhouden.
      { signal, timeoutMs: 90_000, retries: job.kind === 'bank' ? 0 : 2 },
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
          : typeof body?.new === 'number'
            ? body.new
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
import { BANK_DAILY_REQUEST_LIMIT } from '@/lib/bank-connection-status'

// ── Bankkoppelingen: mee op de knop, maar hooguit één keer per uur ─────────
//
// De sync-knop is een prijzen-knop die de gebruiker vaak mág indrukken. Een
// banksync is duur op een manier die prijzen niet zijn: hij kost tot vijf
// verzoeken bij de bank en tikt een teller aan die op tien per dag per rekening
// staat (`public.reserve_bank_sync_slot`). Vier keer op de knop drukken zou dus
// de helft van het dagbudget opmaken en de gebruiker daarna van zijn HANDMATIGE
// sync afhouden — precies de handeling die hij nodig heeft als er iets mis is.
//
// Vandaar de uur-rem: bankgegevens liften mee, maar per koppeling ten hoogste
// één keer per uur. De rem geldt ALLEEN voor dit automatische meeliften; de
// knop op de rekeningdetail blijft ongeremd, want die is een expliciete opdracht.

/** Bankgegevens liften maximaal één keer per uur mee op de globale sync-knop. */
export const BANK_AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000

/**
 * Verzoeken die het automatische meeliften NOOIT opmaakt — gereserveerd voor de
 * gebruiker die zélf op synchroniseren drukt.
 *
 * Vóór deze uitbreiding kostte het automatische pad nul tikken: alleen expliciete
 * klikken telden (er is geen bank-cron). Nu kan het er tot één per uur per
 * rekening kosten, en dan is dit scenario echt: iemand houdt de app een werkdag
 * open, drukt tussendoor op sync, en staat 's avonds op 10/10 — precies wanneer
 * hij zélf iets wil ophalen omdat een saldo niet klopt. De uur-rem maakt dat
 * langzamer, niet onmogelijk.
 *
 * Daarom stopt het automatische pad drie verzoeken vóór de harde grens. De
 * handmatige knop houdt zijn volle 10; alleen het meeliften wijkt.
 */
export const BANK_AUTO_SYNC_HEADROOM = 3

/**
 * Waarom een bankkoppeling deze ronde niet is meegegaan.
 *
 * - `recent` — binnen het uur al gesynchroniseerd (of geprobeerd). Blauw.
 * - `rate-limited` — de 10/dag-rem is op; een poging zou gegarandeerd een 429 zijn. Blauw.
 * - `link-broken` — de autorisatie is kwijt. Rood: er is iets stuk, en een poging
 *   zou een dagtik kosten zonder kans van slagen.
 */
export type BankSkipReason = 'recent' | 'rate-limited' | 'link-broken'

/** Eén actieve bankkoppeling, in de vorm die de planner nodig heeft. */
export interface BankSyncTarget {
  /** `bank_connection_accounts.id` — de sleutel van `POST /api/bank-connect/sync`. */
  connectionAccountId: string
  /** Zoals de gebruiker de rekening herkent ("ING · ···· 1234"). */
  label: string
  /** `bank_accounts.id` — voedt de "handmatig synchroniseren"-link. */
  bankAccountId: string | null
  /** Server-feit: wanneer deze koppeling voor het laatst transacties ophaalde. */
  lastSyncedAt: string | null
  /**
   * Laatste POGING in deze browsersessie, geslaagd of niet.
   *
   * `lastSyncedAt` beweegt alleen bij een geslaagde sync. Zonder dit veld zou een
   * koppeling die stuk gaat bij élke druk op de knop opnieuw worden geprobeerd —
   * en dan is het dagbudget in tien klikken op, juist bij de rekening waar de
   * gebruiker het hardst nodig heeft dat hij nog handmatig kan syncen.
   */
  lastAttemptedAt?: string | null
  /** Is de autorisatie kwijt (`health.state === 'linked-broken'`)? */
  linkBroken?: boolean
  /** Stand van de 10/dag-rem voor vandáág (0 als de teller van gisteren is). */
  dailyRequests?: number
}

/** Een bankkoppeling die deze ronde is overgeslagen, mét de reden en de uitweg. */
export interface SkippedBankSync {
  connectionAccountId: string
  label: string
  bankAccountId: string | null
  reason: BankSkipReason
  /** Wanneer deze koppeling weer vanzelf meegaat — alleen zinvol bij `recent`. */
  nextEligibleAt: string | null
  /** Deeplink naar de rekening, voor de "handmatig synchroniseren"-knop. */
  manualHref: string
}

/**
 * Waar de gebruiker deze bankrekening zélf kan synchroniseren.
 *
 * `/core/assets/cash/[accountId]` is een server-redirect naar de focus-weergave
 * op de cashflow-landing — hergebruikt in plaats van hier een tweede mapping van
 * bankrekening naar bezitting te bouwen (die woont al op die pagina). Zonder
 * drager valt de link terug op de landing zelf.
 */
export function bankManualHref(bankAccountId: string | null): string {
  return bankAccountId ? `/core/assets/cash/${bankAccountId}` : '/overzicht/budget'
}

/**
 * Verdeel de actieve bankkoppelingen over "gaat mee" en "overgeslagen".
 *
 * Puur en tijd-injecteerbaar (`nowMs`) zodat de uur-grens testbaar is zonder
 * klok-truc. De volgorde van de regels is het contract: een kapotte verbinding
 * wint van de dagrem, en de dagrem wint van de uur-rem — dan leest de gebruiker
 * altijd de meest urgente reden, niet de eerst-gevonden.
 */
export function planBankSyncs(
  banks: BankSyncTarget[],
  nowMs: number,
): { jobs: SyncJob[]; skipped: SkippedBankSync[] } {
  const jobs: SyncJob[] = []
  const skipped: SkippedBankSync[] = []

  for (const bank of banks) {
    const manualHref = bankManualHref(bank.bankAccountId)
    const base = {
      connectionAccountId: bank.connectionAccountId,
      label: bank.label,
      bankAccountId: bank.bankAccountId,
      manualHref,
    }

    // Kapot, óf zonder dragende rekening. Dat tweede geval hoort hier omdat het
    // zich precies zo gedraagt: `POST /api/bank-connect/sync` weigert een
    // koppeling zonder `bank_account_id` met een 409 — en die 409 valt VÓÓR
    // `reserve_bank_sync_slot`, dus zo'n poging tikt de dagteller nooit aan.
    // Daarmee grijpt de dagrem hieronder er nooit op in, en `lastAttemptedAt`
    // is browsersessie-state die een refresh kwijtraakt. Zonder deze regel
    // levert élke klik op sync dus opnieuw een rode fout op, onbegrensd.
    // Zelfde reden om te tonen en zelfde uitweg als een kapotte koppeling
    // ("verbind de bank opnieuw"), dus bewust dezelfde skip-reden: geen nieuw
    // type, geen tweede tekst die hetzelfde zegt.
    if (bank.linkBroken || !bank.bankAccountId) {
      skipped.push({ ...base, reason: 'link-broken', nextEligibleAt: null })
      continue
    }

    // Niet de harde grens maar de grens mín de reserve: de laatste verzoeken
    // blijven voor de gebruiker die zélf op synchroniseren drukt.
    if ((bank.dailyRequests ?? 0) >= BANK_DAILY_REQUEST_LIMIT - BANK_AUTO_SYNC_HEADROOM) {
      skipped.push({ ...base, reason: 'rate-limited', nextEligibleAt: null })
      continue
    }

    // De verste van de twee stempels telt: een geslaagde sync én een mislukte
    // poging zetten allebei de klok van een uur opnieuw.
    const lastTouchMs = Math.max(
      toEpochMs(bank.lastSyncedAt),
      toEpochMs(bank.lastAttemptedAt ?? null),
    )
    const elapsed = nowMs - lastTouchMs
    // `elapsed < 0` betekent een stempel in de toekomst (klokverschil tussen
    // server en apparaat). Dan overslaan, niet syncen: te vroeg remmen is
    // hooguit lastig, te vaak syncen kost dagbudget.
    if (lastTouchMs > 0 && elapsed < BANK_AUTO_SYNC_INTERVAL_MS) {
      skipped.push({
        ...base,
        reason: 'recent',
        nextEligibleAt: new Date(lastTouchMs + BANK_AUTO_SYNC_INTERVAL_MS).toISOString(),
      })
      continue
    }

    jobs.push({
      id: bank.connectionAccountId,
      kind: 'bank',
      label: bank.label,
      url: '/api/bank-connect/sync',
      body: JSON.stringify({ connection_account_id: bank.connectionAccountId }),
      manualHref,
    })
  }

  return { jobs, skipped }
}

/** Epoch-ms van een ISO-stempel; `0` bij ontbrekend of onleesbaar. */
function toEpochMs(iso: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : 0
}

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

/**
 * Bouw de joblijst voor één sync-ronde.
 *
 * Geeft sinds de bankstap een OBJECT terug in plaats van een kale array: de
 * overgeslagen bankkoppelingen zijn geen jobs (ze doen geen verzoek en horen
 * dus niet in de voortgangsteller), maar de gebruiker moet er wél een melding
 * over krijgen. Ze buiten de array houden en apart teruggeven is de enige vorm
 * waarin allebei waar blijft.
 */
export function buildSyncJobs(params: {
  exchanges: ExchangeConnectionRow[]
  wallets: WalletAddressRow[]
  /** Actieve bankkoppelingen. Leeg laten = geen bankstap (regressie-veilig). */
  banks?: BankSyncTarget[]
  includePrices?: boolean
  /** Injecteerbare klok voor de uur-rem; standaard `Date.now()`. */
  nowMs?: number
}): { jobs: SyncJob[]; skippedBanks: SkippedBankSync[] } {
  const {
    exchanges,
    wallets,
    banks = [],
    includePrices = true,
    nowMs = Date.now(),
  } = params
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

  // Bankkoppelingen vóór de prijzen: de prijsstap is de afsluiter waar de
  // voortgangsstrip haar tekst op baseert ("… · prijzen verversen").
  const { jobs: bankJobs, skipped: skippedBanks } = planBankSyncs(banks, nowMs)
  jobs.push(...bankJobs)

  if (includePrices) {
    jobs.push({
      id: 'prices',
      kind: 'prices',
      label: 'Prijzen verversen',
      url: '/api/holdings/refresh-prices',
    })
  }

  return { jobs, skippedBanks }
}
