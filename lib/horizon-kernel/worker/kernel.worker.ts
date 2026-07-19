/**
 * Kernel-worker entry (Task 4.2, ADR 0055) — draait de zware horizon-kernel-runs
 * (hoofd/scenario-projectie, gekozen-stop-pad, scenario-presets, Monte-Carlo) op
 * een aparte thread, weg van de main thread van /toekomst.
 *
 * De worker importeert ALLEEN het pure gedeelde protocol (`kernel-protocol.ts`),
 * dat op zijn beurt de pure reken-modules aanroept — géén react/window/document/
 * Supabase. De rekenkern zelf is ongewijzigd; dit bestand is enkel de thread-grens.
 *
 * Bericht-contract: ontvangt een `KernelWorkerRequest`, post een
 * `KernelWorkerResponse` met dezelfde `id` terug (multiplexing in `run-in-worker.ts`).
 */

import { executeKernelRequest, type KernelWorkerRequest } from '@/lib/horizon-kernel/worker/kernel-protocol'

// In een module-worker is `self` de `DedicatedWorkerGlobalScope`. We typen 'm
// bewust smal (onmessage + postMessage) om geen DOM-lib-aannames te maken.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<KernelWorkerRequest>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e: MessageEvent<KernelWorkerRequest>) => {
  const response = executeKernelRequest(e.data)
  ctx.postMessage(response)
}
