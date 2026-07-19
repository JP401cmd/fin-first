/**
 * `runKernelAsync` & co — de dunne aanroep-abstractie die de zware horizon-kernel-
 * runs van de main thread haalt (Task 4.2, ADR 0054). Publiek:
 *
 *  - `runKernelAsync(rawContext)`   → hoofd- én scenario-projectie
 *  - `runForcedStopPathAsync(input)`→ het gekozen-stop-pad
 *  - `runScenarioPresetsAsync(ctx)` → de vijf preset-kaarten (~5 solves)
 *  - `runMonteCarloAsync(...)`      → Monte-Carlo (radar + volledige overlay)
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
import type {
  ForcedStopPathInput,
  ForcedStopPathResult,
  ScenarioPresetContext,
  ScenarioPresetResult,
} from '@/lib/horizon/scenario-presets'
import type { FinancialInput, FutureCashflow, MonteCarloResult } from '@/lib/horizon-data'

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
 * Dispatch één verzoek: via de worker wanneer beschikbaar, anders synchroon.
 * Bij een worker-fout valt deze aanroep alsnog terug op de synchrone runner,
 * zodat een kapotte worker de projectie hooguit trager maakt, nooit stuk.
 */
function dispatch(req: KernelWorkerRequest): Promise<KernelWorkerResponse> {
  const worker = isKernelWorkerAvailable() ? getWorker() : null
  if (!worker) {
    // Synchrone fallback (test/SSR/oude runtime/kapotte worker).
    return Promise.resolve(executeKernelRequest(req))
  }
  return new Promise<KernelWorkerResponse>((resolve) => {
    pending.set(req.id, {
      resolve,
      reject: () => {
        // Worker onderweg gesneuveld → val terug op de synchrone runner.
        resolve(executeKernelRequest(req))
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
      resolve(executeKernelRequest(req))
    }
  })
}

function claimId(): number {
  const id = nextRequestId
  nextRequestId += 1
  return id
}

// ── Publieke async-wrappers (één per run-vorm) ───────────────────────────────

/** Hoofd- of scenario-projectie via de worker (of synchrone fallback). */
export async function runKernelAsync(
  rawContext: ConvergentieRawContext,
): Promise<ConvergentieProjectionOutcome> {
  const res = await dispatch({ id: claimId(), kind: 'projection', rawContext })
  if (res.ok && res.kind === 'projection') return res.result
  // Vangnet: onverwachte/foutieve response-vorm → synchroon herberekenen (byte-identiek).
  const sync = executeKernelRequest({ id: 0, kind: 'projection', rawContext })
  if (sync.ok && sync.kind === 'projection') return sync.result
  return { ok: false, reason: 'kernel-worker-fout' }
}

/** Gekozen-stop-pad via de worker (of synchrone fallback). */
export async function runForcedStopPathAsync(
  input: ForcedStopPathInput,
): Promise<ForcedStopPathResult | null> {
  const res = await dispatch({ id: claimId(), kind: 'stoppad', input })
  if (res.ok && res.kind === 'stoppad') return res.result
  return null
}

/** Vijf scenario-preset-kaarten via de worker (of synchrone fallback). */
export async function runScenarioPresetsAsync(
  ctx: ScenarioPresetContext,
): Promise<ScenarioPresetResult[]> {
  const res = await dispatch({ id: claimId(), kind: 'presets', ctx })
  if (res.ok && res.kind === 'presets') return res.result
  return []
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
