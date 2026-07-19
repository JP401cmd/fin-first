// Model-download + Cache-Storage-caching + LiteRT-LM-runtime-facade.
//
// De @litert-lm/core-API wordt bewust achter een handgeschreven facade als `any`
// benaderd (net als de Transformers.js-facade in de fase-0-spike): (a) we
// importeren 'm dynamisch zodat de zware WASM-bundle pas bij het laden binnenkomt,
// en (b) de exacte type-signaturen kunnen per patch-versie verschuiven — voor
// wegwerp-spikecode is een losse facade robuuster dan strak getypte imports.
//
// Recept (geverifieerd 19 jul 2026):
//   const engine = await Engine.create({ model: <URL|ReadableStream|Blob>, mainExecutorSettings: { maxNumTokens } })
//   const conversation = await engine.createConversation({ preface: { messages: [{ role: 'system', content }] } })
//   const stream = conversation.sendMessageStreaming('…')  // for await chunk → chunk.content[].type==='text' → .text
//   await engine.delete()
// WebGPU is default (geen backend-config). GEEN sampling-parameters op web.

import { CACHE_NAME, MAX_NUM_TOKENS, MODEL_URL } from './litert-config.ts'
import { metric, roundMs } from './metric.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyCore = any

/** Resultaat van één streaming-batch: volledige tekst + timings. */
export type StreamResult = {
  text: string
  /** ms tot de eerste tekst-chunk (TTFT), of null als er niets terugkwam. */
  ttftMs: number | null
  /** wandkloktijd van sendMessageStreaming (start → laatste chunk). */
  wallMs: number
}

/** Facade rond een geïnitialiseerde LiteRT-LM-engine. */
export type LitertEngine = {
  /**
   * Draai één batch met een VERSE conversatie (systeemprompt als preface, geen
   * geschiedenis-opbouw) en stream het antwoord binnen voor de TTFT-meting.
   */
  runBatch: (systemPrompt: string, userMessage: string) => Promise<StreamResult>
  /** Geef de engine + WebGPU-resources vrij. */
  delete: () => Promise<void>
}

/** Uitkomst van de init (cold = download+init, warm = cache+init). */
export type InitOutcome = {
  engine: LitertEngine
  source: 'cold' | 'warm'
  downloadMs: number
  initMs: number
  loadedBytes: number
}

// ── Dynamische, lui geladen core-import ─────────────────────────────────────────
let cachedCore: AnyCore = null
async function loadCore(): Promise<AnyCore> {
  if (!cachedCore) {
    // Literal specifier zodat Vite 'm kan resolven/chunken; het pakket levert eigen
    // types, dus dit is getypt — we casten bewust naar `any` voor de losse facade.
    cachedCore = await import('@litert-lm/core')
  }
  return cachedCore
}

// ── Cache Storage ───────────────────────────────────────────────────────────────
/** Staat het model al in de eigen cache (voor cold/warm-classificatie)? */
export async function isModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const cache = await caches.open(CACHE_NAME)
    return (await cache.match(MODEL_URL)) !== undefined
  } catch {
    return false
  }
}

/** Wis de eigen model-cache; volgende laad is weer "cold". */
export async function clearModelCache(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    return await caches.delete(CACHE_NAME)
  } catch {
    return false
  }
}

type BlobOutcome = {
  blob: Blob
  source: 'cold' | 'warm'
  /** Netwerk-download (cold) of cache-lees (warm) in ms. */
  downloadMs: number
  loadedBytes: number
}

/**
 * Haal de model-Blob op: uit de cache (warm) of via een streaming-download met
 * byteteller (cold). Bij een cold download wordt de Blob in Cache Storage gezet
 * zodat een herstart 'm warm kan serveren.
 */
async function getModelBlob(onProgress: (loaded: number, total: number) => void): Promise<BlobOutcome> {
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null

  // ── Warm pad: uit cache ───────────────────────────────────────────────────────
  if (cache) {
    const hit = await cache.match(MODEL_URL)
    if (hit) {
      const t0 = performance.now()
      const blob = await hit.blob()
      const downloadMs = performance.now() - t0
      onProgress(blob.size, blob.size)
      return { blob, source: 'warm', downloadMs, loadedBytes: blob.size }
    }
  }

  // ── Cold pad: streaming-download met eigen byteteller ─────────────────────────
  const t0 = performance.now()
  const resp = await fetch(MODEL_URL)
  if (!resp.ok || !resp.body) {
    throw new Error(`Model-download faalde: HTTP ${resp.status} ${resp.statusText}`)
  }
  const totalBytes = Number(resp.headers.get('content-length')) || 0
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress(loaded, totalBytes)
    }
  }
  const downloadMs = performance.now() - t0
  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' })

  metric('download', { loadedBytes: loaded, totalBytes, ms: Math.round(downloadMs) })

  // Opslaan voor warme herstarts. Faalt dit (bv. quota), dan is dat geen
  // run-blokker: we loggen het en gaan door met de al gedownloade Blob.
  if (cache) {
    try {
      await cache.put(MODEL_URL, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }))
    } catch (e) {
      metric('error', { where: 'cache.put', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return { blob, source: 'cold', downloadMs, loadedBytes: loaded }
}

// ── Engine-facade ───────────────────────────────────────────────────────────────
function wrapEngine(engineRaw: any): LitertEngine {
  return {
    async runBatch(systemPrompt: string, userMessage: string): Promise<StreamResult> {
      // VERSE conversatie per batch: systeemprompt als preface, geen historie.
      const conversation = await engineRaw.createConversation({
        preface: { messages: [{ role: 'system', content: systemPrompt }] },
      })

      const start = performance.now()
      let firstAt: number | null = null
      let text = ''

      const stream = conversation.sendMessageStreaming(userMessage)
      for await (const chunk of stream as AsyncIterable<any>) {
        const parts: any[] = Array.isArray(chunk?.content) ? chunk.content : []
        for (const part of parts) {
          if (part?.type === 'text' && typeof part.text === 'string') {
            if (firstAt === null) firstAt = performance.now()
            text += part.text
          }
        }
      }

      const end = performance.now()
      return {
        text: text.trim(),
        ttftMs: firstAt !== null ? firstAt - start : null,
        wallMs: end - start,
      }
    },
    async delete(): Promise<void> {
      try {
        await engineRaw.delete()
      } catch (e) {
        metric('error', { where: 'engine.delete', message: e instanceof Error ? e.message : String(e) })
      }
    },
  }
}

/**
 * Volledige init: model-Blob ophalen (cold/warm) → Engine.create → facade.
 * Logt `[metric] download` (alleen cold) en `[metric] init` (cold én warm).
 *
 * Bekend risico (Windows/NVIDIA, LiteRT-LM issue #2572): de weight-cache kan met
 * "Access is denied" falen op de native tak. We vangen init-fouten expliciet en
 * loggen ze integraal (incl. stack) voordat we doorgooien.
 */
export async function initEngine(onProgress: (loaded: number, total: number) => void): Promise<InitOutcome> {
  const core = (await loadCore()) as AnyCore
  const { blob, source, downloadMs, loadedBytes } = await getModelBlob(onProgress)

  const t0 = performance.now()
  let engineRaw: any
  try {
    engineRaw = await core.Engine.create({
      model: blob,
      mainExecutorSettings: { maxNumTokens: MAX_NUM_TOKENS },
    })
  } catch (e) {
    metric('error', {
      where: 'Engine.create',
      source,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? (e.stack ?? '') : '',
    })
    throw e
  }
  const initMs = performance.now() - t0

  metric('init', { source, downloadMs: roundMs(downloadMs), initMs: roundMs(initMs) })

  return { engine: wrapEngine(engineRaw), source, downloadMs, initMs, loadedBytes }
}
