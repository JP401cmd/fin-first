/**
 * `runKernelAsync` & co — de dunne aanroep-abstractie die de zware horizon-kernel-
 * runs van de main thread haalt (Task 4.2, ADR 0054). Publiek:
 *
 *  - `runKernelAsync(rawContext)`   → hoofd- én scenario-projectie
 *  - `runForcedStopPathAsync(input)`→ het gekozen-stop-pad
 *  - `runScenarioPresetsAsync(ctx)` → de zes preset-kaarten + de tweede run (ADR 0129 D7)
 *  - `runLabGrenzenAsync(ctx)`      → de grenzen op de vijf lab-knoppen (ADR 0170)
 *  - `runMarktcheckAsync(ctx)`      → kernel-marktcheck (percentielband /toekomst)
 *  - `runMonteCarloAsync(...)`      → losstaande legacy-MC (fase-modals/radar)
 *
 * ## Twee paden — worker of synchrone fallback
 *  - **Browser met `Worker`**: één lazy-gecreëerde `module`-worker
 *    (`kernel.worker.ts`), gemultiplext op een oplopende request-id zodat parallelle
 *    runs (hoofd/scenario/stop/MC/presets) elkaars antwoorden niet kruisen.
 *  - **Geen `Worker` (jsdom-tests / SSR / oude runtime)**: `executeKernelRequest`
 *    draait direct op de aanroepende thread en geeft een resolved Promise terug.
 *    Zo blijven de bestaande contract-/parity-tests byte-identiek groen (de
 *    rekenkern verandert niet; alleen wáár hij draait) en blijft de SSR-render
 *    kernel-vrij (de server-scalar voedt de first paint, niet deze fallback).
 *
 * De hook (`use-horizon-fire-sim`) kiest zélf sync-vs-async op basis van
 * `isKernelWorkerAvailable()`: in jsdom/SSR blijft de synchrone `useMemo`-tak intact
 * (identiek resultaat op de eerste render), in de browser draait de worker-tak.
 */

import {
  executeKernelRequest,
  type KernelWorkerRequest,
  type KernelWorkerResponse,
} from '@/lib/horizon-kernel/worker/kernel-protocol'
import type {
  ConvergentieRawContext,
  ConvergentieProjectionOutcome,
} from '@/lib/horizon-kernel/convergentie-router'
import type { MarktcheckOutcome } from '@/lib/horizon-kernel/marktcheck'
import type {
  ForcedStopPathInput,
  ForcedStopPathResult,
  ScenarioPresetBatch,
  ScenarioPresetContext,
} from '@/lib/horizon/scenario-presets'
import type { FinancialInput, FutureCashflow, MonteCarloResult } from '@/lib/horizon-data'
import type {
  VariantenSweepResultaat,
  VariantenSweepSnapshot,
} from '@/lib/tax-lifetime/varianten-sweep'
import type { LabGrenzenContext, LabGrenzenResultaat } from '@/lib/horizon/lab-grenzen-types'
import {
  createLaneDispatcher,
  KERNEL_SUPERSEDED,
  KERNEL_SUPERSEDED_REASON,
  type KernelLane,
} from './kernel-lanes'

export { KERNEL_SUPERSEDED, KERNEL_SUPERSEDED_REASON, type KernelLane } from './kernel-lanes'

/**
 * Is een echte `Worker` beschikbaar? False in jsdom (tests) en tijdens SSR
 * (`typeof Worker === 'undefined'`). SSR-veilig: raakt geen `window`/`document`.
 */
export function isKernelWorkerAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

// ── Lazy worker-singleton + request-multiplexing ─────────────────────────────

interface PendingRequest {
  resolve: (res: KernelWorkerResponse) => void
  reject: (err: unknown) => void
}

let workerInstance: Worker | null = null
let workerBroken = false
let nextRequestId = 1
const pending = new Map<number, PendingRequest>()

/**
 * Creëer (of hergebruik) de kernel-worker. Turbopack-syntax:
 * `new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })`
 * — de statische URL laat de bundler een aparte worker-chunk maken. Alleen
 * aangeroepen wanneer `isKernelWorkerAvailable()` (dus nooit tijdens SSR).
 */
function getWorker(): Worker | null {
  if (workerBroken) return null
  if (workerInstance) return workerInstance
  try {
    const w = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<KernelWorkerResponse>) => {
      const res = e.data
      const p = pending.get(res.id)
      if (!p) return
      pending.delete(res.id)
      p.resolve(res)
    }
    w.onerror = (event: ErrorEvent) => {
      // Een fatale worker-fout mag de UI niet vastzetten: markeer de worker als
      // stuk en reject alle openstaande requests (de aanroepers vallen dan op de
      // synchrone runner terug — zie `dispatch`). Bewuste keuze: géén herbouw-loop
      // binnen deze sessie — eenmaal `workerBroken` blijft de rest van de sessie
      // permanent synchroon (zie de `if (workerBroken) return null` hierboven).
      if (!workerBroken) {
        console.warn('[horizon-worker] worker faalde — synchrone fallback actief', event)
      }
      workerBroken = true
      workerInstance = null
      const err = new Error('kernel-worker onbereikbaar')
      for (const [, req] of pending) req.reject(err)
      pending.clear()
    }
    workerInstance = w
    return w
  } catch {
    workerBroken = true
    return null
  }
}

/**
 * Antwoord wanneer `workerOnly` geldt en er geen bruikbare worker is. Bewust een
 * gewone `ok:false`-response zodat de aanroepers hun bestaande uitpak-tak volgen
 * (die levert dan `null`) — geen throw, geen stille main-thread-run.
 */
function geenWorkerResponse(id: number): KernelWorkerResponse {
  return { id, ok: false, error: 'kernel-worker niet beschikbaar' }
}

// ── Rijstroken: één-in-vlucht-per-soort met "laatste wacht" (B-057 / B4) ─────
// Logica in `kernel-lanes.ts` (puur, getest zonder Worker); hier alleen de
// instantie die op het echte posten is aangesloten. Zonder `lane`
// (marktcheck/MC/sweep) blijft de dispatch ongewijzigd FIFO.
const laneDispatcher = createLaneDispatcher<KernelWorkerRequest, KernelWorkerResponse>(
  (req, workerOnly) => postRequest(req, workerOnly),
  (req) => ({ id: req.id, ok: false, error: KERNEL_SUPERSEDED }),
)

/**
 * Dispatch één verzoek: via de worker wanneer beschikbaar, anders synchroon.
 * Bij een worker-fout valt deze aanroep alsnog terug op de synchrone runner,
 * zodat een kapotte worker de projectie hooguit trager maakt, nooit stuk.
 *
 * `workerOnly` schakelt die terugval UIT. Nodig voor runs die te zwaar zijn om
 * ooit op de main thread te belanden (de marktcheck: tot 200 volledige
 * kernel-projecties, 2,6–5,1 s). Let op dat `workerBroken` sticky is voor de hele
 * sessie: zonder deze vlag zou één eerdere worker-fout élke volgende marktcheck
 * in een meerdere-seconden-freeze veranderen.
 *
 * `lane` zet het verzoek op een rijstrook (zie boven). Zonder worker (synchrone
 * tak) is er niets te verdringen: dan rekent de aanroep direct.
 */
function dispatch(
  req: KernelWorkerRequest,
  opts?: { workerOnly?: boolean; lane?: KernelLane },
): Promise<KernelWorkerResponse> {
  const workerOnly = opts?.workerOnly === true
  const worker = isKernelWorkerAvailable() ? getWorker() : null
  if (!worker) {
    // Synchrone fallback (test/SSR/oude runtime/kapotte worker) — tenzij de
    // aanroeper die expliciet verbiedt.
    return Promise.resolve(workerOnly ? geenWorkerResponse(req.id) : executeKernelRequest(req))
  }
  if (opts?.lane) return laneDispatcher.dispatch(opts.lane, req, workerOnly)
  return postRequest(req, workerOnly)
}

/** Het echte posten naar de worker (met de bestaande terugval-paden). Settelt
 *  altijd precies één keer. */
function postRequest(req: KernelWorkerRequest, workerOnly: boolean): Promise<KernelWorkerResponse> {
  const worker = getWorker()
  if (!worker) {
    return Promise.resolve(workerOnly ? geenWorkerResponse(req.id) : executeKernelRequest(req))
  }
  return new Promise<KernelWorkerResponse>((resolve) => {
    pending.set(req.id, {
      resolve,
      reject: () => {
        // Worker onderweg gesneuveld → val terug op de synchrone runner.
        resolve(workerOnly ? geenWorkerResponse(req.id) : executeKernelRequest(req))
      },
    })
    try {
      worker.postMessage(req)
    } catch (err) {
      // Niet-serialiseerbare payload o.i.d. — synchroon afhandelen.
      if (!workerBroken) {
        console.warn('[horizon-worker] worker faalde — synchrone fallback actief', err)
      }
      pending.delete(req.id)
      resolve(workerOnly ? geenWorkerResponse(req.id) : executeKernelRequest(req))
    }
  })
}

function claimId(): number {
  const id = nextRequestId
  nextRequestId += 1
  return id
}

// ── Publieke async-wrappers (één per run-vorm) ───────────────────────────────

/**
 * Hoofd- of scenario-projectie via de worker (of synchrone fallback).
 *
 * `lane` (B-057/B4): rijstrook zodat een nieuwere run een nog niet geposte
 * oudere verdringt. Een verdrongen verzoek levert `{ ok: false, reason:
 * KERNEL_SUPERSEDED_REASON }` — bewust ZONDER het synchrone vangnet: dat zou
 * verouderd werk alsnog op de main thread zetten. De aanroeper negeert het
 * antwoord toch al (reqId-guard).
 */
export async function runKernelAsync(
  rawContext: ConvergentieRawContext,
  opts?: { lane?: KernelLane },
): Promise<ConvergentieProjectionOutcome> {
  const res = await dispatch({ id: claimId(), kind: 'projection', rawContext }, { lane: opts?.lane })
  if (res.ok && res.kind === 'projection') return res.result
  if (!res.ok && res.error === KERNEL_SUPERSEDED) return { ok: false, reason: KERNEL_SUPERSEDED_REASON }
  // Vangnet: onverwachte/foutieve response-vorm → synchroon herberekenen (byte-identiek).
  const sync = executeKernelRequest({ id: 0, kind: 'projection', rawContext })
  if (sync.ok && sync.kind === 'projection') return sync.result
  return { ok: false, reason: 'kernel-worker-fout' }
}

/** Gekozen-stop-pad via de worker (of synchrone fallback). `lane`: zie `runKernelAsync`. */
export async function runForcedStopPathAsync(
  input: ForcedStopPathInput,
  opts?: { lane?: KernelLane },
): Promise<ForcedStopPathResult | null> {
  const res = await dispatch({ id: claimId(), kind: 'stoppad', input }, { lane: opts?.lane })
  if (res.ok && res.kind === 'stoppad') return res.result
  return null
}

/**
 * De scenario-batch via de worker (of synchrone fallback): de zes preset-kaarten PLUS
 * de tweede run ("vrij mogelijk vanaf", ADR 0129 D7). Bewust één oversteek — zie
 * `runScenarioPresetBatch`. Bij een worker-fout: lege kaarten, geen opgeloste leeftijd.
 */
export async function runScenarioPresetsAsync(
  ctx: ScenarioPresetContext,
  opts?: { lane?: KernelLane },
): Promise<ScenarioPresetBatch> {
  const res = await dispatch({ id: claimId(), kind: 'presets', ctx }, { lane: opts?.lane })
  if (res.ok && res.kind === 'presets') return res.result
  return { presets: [], solvedFireAge: null, solvedFireEndAge: null, haalbareUitgave: null }
}

/**
 * De grenzen-batch van het doelscenario-lab (ADR 0170) via de worker, of — zonder
 * worker (jsdom/SSR/oude runtime) — synchroon via dezelfde dispatch. Bewust NIET
 * `workerOnly`: de contract-tests draaien dan synchroon en byte-identiek.
 *
 * Eigen rijstrook `'grenzen'` (default): één in vlucht + één in de wachtkamer, een
 * nieuwere batch verdringt de wachtende. Een VERDRONGEN batch levert `null` — de
 * aanroeper laat dan de vorige grenzen staan (de nieuwere run is al onderweg). Ook
 * `null` bij een worker-fout of onverwachte response-vorm: geen synchroon vangnet,
 * dat zou ~90 kernel-runs alsnog op de main thread zetten.
 */
export async function runLabGrenzenAsync(
  ctx: LabGrenzenContext,
  opts?: { lane?: KernelLane },
): Promise<LabGrenzenResultaat | null> {
  const res = await dispatch({ id: claimId(), kind: 'grenzen', ctx }, { lane: opts?.lane ?? 'grenzen' })
  if (res.ok && res.kind === 'grenzen') return res.result
  return null
}

/**
 * Fiscale variantensweep (3 kernel-solves) via de worker, of — als er geen worker
 * is (jsdom/SSR/oude runtime) — synchroon via dezelfde dispatch.
 *
 * `null` bij een onverwachte response-vorm. BEWUST géén synchroon-herberekenen-
 * vangnet zoals `runKernelAsync`: dat zou drie solves alsnog op de main thread
 * zetten. De aanroeper toont dan zijn foutstaat en de gebruiker kan het opnieuw
 * vragen — de sweep zit sowieso achter een expliciete actie.
 */
export async function runVariantenSweepAsync(
  snapshot: VariantenSweepSnapshot,
): Promise<VariantenSweepResultaat | null> {
  const res = await dispatch({ id: claimId(), kind: 'taxvarianten', snapshot })
  if (res.ok && res.kind === 'taxvarianten') return res.result
  return null
}

/**
 * Marktcheck (kernel-Monte-Carlo, percentielband) — **uitsluitend** in de worker.
 *
 * `null` zodra er geen bruikbare worker is (jsdom/SSR/oude runtime/kapotte
 * worker) of bij een onverwachte response-vorm. Dat is een harde garantie, geen
 * voornemen: `workerOnly` schakelt de synchrone terugval in `dispatch` uit. Dit
 * zijn tot `MARKTCHECK_MAX_RUNS` VOLLEDIGE kernel-projecties (gemeten 13–25 ms
 * per run, samen 2,6–5,1 s); die horen nooit op de main thread. De overlay zit
 * achter een expliciete pil-klik en het oppervlak handelt "geen band" al af.
 */
export async function runMarktcheckAsync(
  rawContext: ConvergentieRawContext,
  maxRuns?: number,
  stopAge?: number | null,
): Promise<MarktcheckOutcome | null> {
  const res = await dispatch(
    { id: claimId(), kind: 'marktcheck', rawContext, maxRuns, stopAge },
    { workerOnly: true },
  )
  if (res.ok && res.kind === 'marktcheck') return res.result
  return null
}

/** Monte-Carlo (radar/overlay) via de worker (of synchrone fallback). */
export async function runMonteCarloAsync(
  input: FinancialInput,
  sims: number,
  years: number,
  swrOverride?: number,
  volatilityOverride?: number,
  cashflows?: FutureCashflow[],
): Promise<MonteCarloResult> {
  const res = await dispatch({
    id: claimId(),
    kind: 'mc',
    input,
    sims,
    years,
    swrOverride,
    volatilityOverride,
    cashflows,
  })
  if (res.ok && res.kind === 'mc') return res.result
  // Vangnet: synchroon herberekenen.
  const sync = executeKernelRequest({ id: 0, kind: 'mc', input, sims, years, swrOverride, volatilityOverride, cashflows })
  if (sync.ok && sync.kind === 'mc') return sync.result
  throw new Error('monte-carlo-worker-fout')
}
