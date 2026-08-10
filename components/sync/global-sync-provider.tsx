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
import { useRouter } from 'next/navigation'
import {
  runGlobalSync,
  buildSyncJobs,
  type SyncEvent,
  type SyncJob,
  type SyncJobResult,
  type GlobalSyncResult,
  type BankSyncTarget,
  type SkippedBankSync,
} from '@/lib/sync/global-sync'
import { useToast } from '@/components/app/toast-provider'
import { formatCurrency } from '@/lib/format'
import type { ExchangeConnectionRow, WalletAddressRow } from '@/lib/connections-data'

export type SyncPhase = 'idle' | 'syncing' | 'partial'

/**
 * De uitkomst per koppeling zoals de UI hem toont. `skipped` bestaat alleen voor
 * bankkoppelingen: die kunnen bewust overgeslagen worden (uur-rem, dagrem,
 * kapotte verbinding) en dat is géén fout — de rode dot mag er niet van aan.
 */
export type ConnectionOutcome = SyncJobResult['outcome'] | 'skipped'

export interface ConnectionResult {
  jobId: string
  kind: SyncJob['kind']
  label: string
  outcome: ConnectionOutcome
  error?: string
  itemsSynced?: number
  totalEur?: number | null
  finishedAt: string
  /** Alleen bij `outcome: 'skipped'` — waarom deze koppeling niet meeging. */
  skipReason?: SkippedBankSync['reason']
  /**
   * Alleen bij `skipReason: 'recent'` — wanneer deze koppeling weer vanzelf
   * meegaat. Reist mee zodat de melding én de terugleesbare vorm in het rapport
   * dezelfde tijd noemen; het rapport is juist de plek waar de melding naar
   * verwijst.
   */
  nextEligibleAt?: string | null
  /** Deeplink naar het oppervlak waar deze koppeling handmatig te syncen is. */
  manualHref?: string
}

interface State {
  phase: SyncPhase
  /**
   * Aantal BRONNEN in deze ronde: elke job die daadwerkelijk een verzoek doet —
   * exchanges, wallets, bankkoppelingen én de prijzenverversing.
   *
   * Dit is de ENIGE telling in de app, en dat is sinds 10 aug 2026 met opzet zo.
   * Daarvóór telde de voortgangsteller alleen "koppelingen" (prijzen expliciet
   * niet) terwijl de eindmelding álle jobs telde. Eén ronde sprak zichzelf dan
   * tegen: de melding zei "2 van 2 bronnen", de teller zag er 1 en verborg
   * zichzelf. Voeg hier geen tweede noemer aan toe.
   *
   * Een OVERGESLAGEN bankkoppeling is géén bron: die doet geen verzoek en heeft
   * haar eigen melding.
   */
  totalJobs: number
  completedJobs: number
  /** The job currently in flight — used to detect the prices-step for label rendering. */
  currentJob: { id: string; kind: SyncJob['kind']; label: string } | null
  lastResult: GlobalSyncResult | null
  lastFinishedAt: string | null
  /** Per-connection results from the last (or in-progress) run. */
  perConnection: Record<string, ConnectionResult>
}

type Action =
  | {
      type: 'sync-start'
      totalJobs: number
      /** Bankkoppelingen die deze ronde bewust niet meegaan — meteen als resultaat. */
      skipped: ConnectionResult[]
    }
  | { type: 'job-start'; job: SyncJob; completedJobs: number }
  | { type: 'job-end'; job: SyncJob; result: SyncJobResult; completedJobs: number }
  | { type: 'sync-end'; aggregate: GlobalSyncResult; finishedAt: string }
  | { type: 'acknowledge-partial' }

const initialState: State = {
  phase: 'idle',
  totalJobs: 0,
  completedJobs: 0,
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
        currentJob: null,
        // Reset per-connection map for the new run; keep lastResult so the UI
        // can still show "X min ago" until the new run finishes.
        // De overgeslagen bankkoppelingen staan er meteen in: ze doen geen
        // verzoek en krijgen dus nooit een `job-end`, maar horen wél in het
        // rapport te staan als uitkomst van déze ronde.
        perConnection: Object.fromEntries(action.skipped.map((r) => [r.jobId, r])),
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
        manualHref: job.manualHref,
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
    /**
     * Actieve bankkoppelingen. Weglaten = geen bankstap; een gebruiker zonder
     * bankkoppeling of een aanroeper die ze niet kon laden krijgt exact de
     * sync-ronde van vóór deze uitbreiding.
     */
    banks?: BankSyncTarget[]
    /** When true, only runs the prices refresh (used when no connections exist). */
    pricesOnly?: boolean
  }) => Promise<GlobalSyncResult | null>
  /** Mark partial-failure as acknowledged (clears the red dot on the header button). */
  acknowledgePartial: () => void
  /**
   * Wanneer elke bankkoppeling in deze browsersessie voor het laatst is
   * gepróbeerd (`connection_account_id` → ISO-stempel), uit te lezen op het
   * moment dat je 'm nodig hebt. De aanroeper mengt dit in zijn
   * `BankSyncTarget`s, zodat een koppeling die faalt niet bij élke druk op de
   * knop opnieuw een tik van de dagrem kost.
   *
   * Bewust een FUNCTIE en geen kale waarde: de onderliggende ref-identiteit
   * verandert nooit, dus als contextwaarde zou hij reactiviteit suggereren die
   * er niet is (een `useMemo` erop zou nooit hergedraaid worden).
   */
  getBankAttempts: () => Record<string, string>
  /**
   * Stempel een handmatige sync van één bankkoppeling.
   *
   * Ook een sync buiten de globale knop om kost een tik van de dagrem. Zonder
   * deze stempel is de eerstvolgende "Alles synchroniseren" meteen weer een tik
   * — precies de drain die de uur-rem hoort te voorkomen.
   *
   * Restrisico: de stempel leeft in dít tabblad. Twee tabbladen tellen los, en
   * `last_synced_at` beweegt bij een mislukte sync niet. Duurzaam hoort dit een
   * server-feit te zijn (`bank_sync_log` schrijft al bij élke uitkomst een rij);
   * dat is een uitbreiding van het wire-contract en staat als vervolg genoteerd.
   */
  noteBankAttempt: (connectionAccountId: string) => void
}

const GlobalSyncContext = createContext<GlobalSyncContextValue | null>(null)

/** Tekst onder een blauwe melding: wanneer deze koppeling weer vanzelf meegaat. */
function nextEligibleLabel(nextEligibleAt: string | null): string {
  if (!nextEligibleAt) return ''
  const d = new Date(nextEligibleAt)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return ` Gaat vanzelf weer mee vanaf ${pad(d.getHours())}:${pad(d.getMinutes())}.`
}

export function GlobalSyncProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { addToast } = useToast()
  const router = useRouter()

  // De-dupe concurrent triggers — second click during a run is a no-op.
  const inFlightRef = useRef(false)

  /**
   * Laatste POGING per bankkoppeling in deze sessie. Bewust een ref en geen
   * state: dit stuurt geen render aan, alleen de volgende planning — en het als
   * state houden zou elke sync een extra render van de hele boom kosten.
   */
  const bankAttemptsRef = useRef<Record<string, string>>({})

  const getBankAttempts = useCallback(() => bankAttemptsRef.current, [])

  const noteBankAttempt = useCallback((connectionAccountId: string) => {
    bankAttemptsRef.current[connectionAccountId] = new Date().toISOString()
  }, [])

  /**
   * Eén bankkoppeling nú synchroniseren, los van de globale ronde.
   *
   * Dit is de handeling áchter de blauwe melding: "niet gesynchroniseerd — druk
   * hier om het zelf te doen". Bewust de sync zélf en geen navigatie: de knop
   * die de gebruiker aanwijst, hoort te doen wat hij belooft. Een link naar de
   * cashflow-pagina bracht hem bij een gemarkeerde kaart waar nog gezocht moest
   * worden naar een synchroniseer-knop — dat is een omweg met een verkeerd label.
   *
   * De uur-rem geldt hier NIET: dit is een expliciete opdracht. De harde grens
   * blijft de dagrem in de database.
   */
  const syncOneBank = useCallback(
    async (connectionAccountId: string, label: string) => {
      noteBankAttempt(connectionAccountId)
      try {
        const res = await fetch('/api/bank-connect/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ connection_account_id: connectionAccountId }),
        })
        const json = (await res.json().catch(() => null)) as
          | { new?: number; error?: string }
          | null
        if (!res.ok) {
          addToast({
            type: 'error',
            title: `${label} niet gelukt`,
            message:
              typeof json?.error === 'string'
                ? json.error
                : 'Synchroniseren is niet gelukt — probeer het later opnieuw.',
            duration: 9000,
          })
          return
        }
        const nieuw = Number(json?.new ?? 0)
        addToast({
          type: 'success',
          title: `${label} bijgewerkt`,
          message:
            nieuw === 0
              ? 'Geen nieuwe transacties — je stond al bij.'
              : `${nieuw} nieuwe ${nieuw === 1 ? 'transactie' : 'transacties'} opgehaald.`,
        })
        router.refresh()
      } catch {
        addToast({
          type: 'error',
          title: `${label} niet gelukt`,
          message: 'Synchroniseren kon niet worden uitgevoerd.',
          duration: 9000,
        })
      }
    },
    [addToast, noteBankAttempt, router],
  )

  const triggerGlobalSync = useCallback(
    async (params: {
      exchanges: ExchangeConnectionRow[]
      wallets: WalletAddressRow[]
      banks?: BankSyncTarget[]
      pricesOnly?: boolean
    }): Promise<GlobalSyncResult | null> => {
      if (inFlightRef.current) return null
      inFlightRef.current = true

      const { jobs, skippedBanks } = params.pricesOnly
        ? buildSyncJobs({ exchanges: [], wallets: [], banks: [], includePrices: true })
        : buildSyncJobs({
            exchanges: params.exchanges,
            wallets: params.wallets,
            banks: params.banks ?? [],
            includePrices: true,
          })

      // De poging-stempel wordt gezet vóór het verzoek, niet erna: een sync die
      // in een timeout eindigt IS bij de bank binnengekomen en heeft daar een
      // dagtik gekost. Achteraf stempelen zou zo'n ronde gratis maken.
      const attemptedAt = new Date().toISOString()
      for (const job of jobs) {
        if (job.kind === 'bank') bankAttemptsRef.current[job.id] = attemptedAt
      }

      const skippedResults: ConnectionResult[] = skippedBanks.map((bank) => ({
        jobId: bank.connectionAccountId,
        kind: 'bank' as const,
        label: bank.label,
        outcome: 'skipped' as const,
        finishedAt: attemptedAt,
        skipReason: bank.reason,
        nextEligibleAt: bank.nextEligibleAt,
        manualHref: bank.manualHref,
      }))

      const onEvent = (event: SyncEvent) => {
        if (event.type === 'start') {
          dispatch({
            type: 'sync-start',
            totalJobs: event.totalJobs,
            skipped: skippedResults,
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

        // Elke handmatige sync waarbij de prijzen daadwerkelijk ververst zijn,
        // legt een tijdstempel-punt vast in net_worth_history (intraday
        // vermogenscurve). De snapshot-route herberekent net_worth canoniek uit
        // de zojuist bijgewerkte assets.current_value. Fire-and-forget: mag de
        // sync-UX nooit blokkeren of laten falen.
        const pricesResult = aggregate.results.find((r) => r.job.kind === 'prices')
        if (pricesResult && pricesResult.outcome !== 'error') {
          fetch('/api/snapshots/auto?source=manual', { credentials: 'include' }).catch(() => {})
        }

        // ── Eén melding per actieve bankkoppeling ────────────────────────────
        //
        // Bewust per koppeling en niet samengevat: bij twee rekeningen kan de
        // ene wél en de andere niet meegaan, en dan is "1 van 2 bronnen" precies
        // het antwoord dat de gebruiker niet kan gebruiken. Groen = opgehaald,
        // rood = mislukt, blauw = deze ronde overgeslagen. Rood en blauw dragen
        // allebei de handeling die eruit volgt: naar de rekening, zelf syncen.
        //
        // Ná de ronde, niet ervoor: dan komen de drie kleuren als één set binnen
        // in plaats van blauw vóór en groen na de wachttijd.
        //
        // Twee soorten handeling, en het onderscheid is niet cosmetisch: de knop
        // moet doen wat zijn label zegt.
        //  • "Nu synchroniseren" → doet de sync meteen. Alleen zinvol wanneer een
        //    poging kán slagen: de uur-rem staat in de weg, verder is er niets mis.
        //  • "Naar de rekening" → navigeert. Voor een kwijtgeraakte verbinding
        //    (daar is "Verbind opnieuw" de handeling, niet syncen), voor een
        //    mislukte sync (de rekening toont de fout én het herstelaanbod) en
        //    voor een opgemaakte dagrem (een tweede poging wordt geweigerd).
        const syncNow = (id: string, label: string) => ({
          label: 'Nu synchroniseren',
          onClick: () => void syncOneBank(id, label),
        })
        const goToAccount = (href: string) => ({
          label: 'Naar de rekening',
          onClick: () => router.push(href),
        })

        for (const skipped of skippedResults) {
          if (skipped.skipReason === 'link-broken') {
            addToast({
              type: 'error',
              title: `${skipped.label} niet bijgewerkt`,
              message: 'De verbinding met je bank is kwijt. Verbind opnieuw om weer bij te werken.',
              duration: 9000,
              action: skipped.manualHref ? goToAccount(skipped.manualHref) : undefined,
            })
            continue
          }
          const rateLimited = skipped.skipReason === 'rate-limited'
          addToast({
            type: 'info',
            title: `${skipped.label} niet gesynchroniseerd`,
            message: rateLimited
              ? 'De laatste verzoeken van vandaag houden we vrij voor als je ze zelf nodig hebt. Morgen gaat deze rekening weer vanzelf mee.'
              : `Bankgegevens gaan hooguit één keer per uur automatisch mee.${nextEligibleLabel(
                  skipped.nextEligibleAt ?? null,
                )}`,
            duration: 9000,
            action: rateLimited
              ? skipped.manualHref
                ? goToAccount(skipped.manualHref)
                : undefined
              : syncNow(skipped.jobId, skipped.label),
          })
        }

        let bankSynced = false
        for (const result of aggregate.results) {
          if (result.job.kind !== 'bank') continue
          if (result.outcome === 'error') {
            addToast({
              type: 'error',
              title: `${result.job.label} niet gelukt`,
              message: result.error ?? 'Synchroniseren is niet gelukt — probeer het later opnieuw.',
              duration: 9000,
              action: result.job.manualHref ? goToAccount(result.job.manualHref) : undefined,
            })
            continue
          }
          bankSynced = true
          const nieuw = result.itemsSynced ?? 0
          addToast({
            type: 'success',
            title: `${result.job.label} bijgewerkt`,
            message:
              nieuw === 0
                ? 'Geen nieuwe transacties — je stond al bij.'
                : `${nieuw} nieuwe ${nieuw === 1 ? 'transactie' : 'transacties'} opgehaald.`,
            duration: 6000,
          })
        }

        // Verse banktransacties zitten in server-componenten (cashflow, budgetten);
        // zonder deze verversing ziet de gebruiker "bijgewerkt" staan naast een
        // scherm dat nog het oude beeld toont.
        if (bankSynced) router.refresh()

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
    [addToast, router, syncOneBank],
  )

  const acknowledgePartial = useCallback(() => {
    dispatch({ type: 'acknowledge-partial' })
  }, [])

  const value = useMemo<GlobalSyncContextValue>(
    () => ({
      state,
      triggerGlobalSync,
      acknowledgePartial,
      getBankAttempts,
      noteBankAttempt,
    }),
    [state, triggerGlobalSync, acknowledgePartial, getBankAttempts, noteBankAttempt],
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
