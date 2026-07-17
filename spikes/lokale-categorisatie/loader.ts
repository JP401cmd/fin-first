// Model-loader + generatie-facade rond @huggingface/transformers.
//
// De transformers-API wordt bewust als `any` benaderd: (a) we importeren 'm
// dynamisch zodat de zware bundle pas bij het laden binnenkomt, en (b) de exacte
// class-namen (o.a. Gemma4ForConditionalGeneration) verschillen per versie —
// een losse facade is voor wegwerp-spikecode robuuster dan strak getypte named
// imports. De gebruikte API volgt de modelkaart:
// https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX

import type { ModelEntry } from './registry.ts'
import type { ChatMessage } from './types.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyTransformers = any

export type GenResult = {
  text: string
  ttftMs: number | null
  wallMs: number
  inputTokens: number
  generatedTokens: number
  decodeTokPerSec: number | null
}

export type LoadedModel = {
  entry: ModelEntry
  runChat: (messages: ChatMessage[], opts: { maxNewTokens: number }) => Promise<GenResult>
}

export type ProgressSnapshot = {
  loaded: number
  total: number
  percent: number
  fileCount: number
}

/** Per-bestand download-omvang (download-dieet-diagnose, metriek 4). */
export type FileBytes = { file: string; loaded: number; total: number }

export type LoadOutcome = {
  model: LoadedModel
  loadMs: number
  wasCached: boolean
  downloadBytes: number
  /** Elk gedownload bestand met naam + bytes, aflopend gesorteerd. */
  perFile: FileBytes[]
}

// ── Download-voortgang aggregeren over alle model-shards ──────────────────────
class ProgressTracker {
  private files = new Map<string, { loaded: number; total: number }>()

  update(info: any): void {
    if (!info) return
    // Transformers.js vuurt naast per-bestand progress-events óók een
    // AGGREGAAT-event met de repo-id als naam (bv. "onnx-community/gemma-4-…").
    // Dat aggregaat dubbeltelt de download (meting v1: 6,32 = 2×3,16 GB). We
    // tellen alleen echte bestanden — herkenbaar aan een extensie in de basename
    // (embed_tokens_q4f16.onnx_data, config.json, …); repo-/aggregaat-keys hebben
    // die niet. Ook expliciete aggregaat-statussen negeren.
    if (info.status === 'progress_total') return
    const key: string | undefined = info.file || info.name || info.url
    if (!key) return
    const base = key.split(/[\\/]/).pop() ?? key
    if (!base.includes('.')) return // repo-/aggregaat-event, geen bestand
    const loaded = Number(info.loaded) || 0
    const total = Number(info.total) || 0
    if (loaded > 0 || total > 0) {
      const prev = this.files.get(key) ?? { loaded: 0, total: 0 }
      this.files.set(key, { loaded: Math.max(prev.loaded, loaded), total: Math.max(prev.total, total) })
    }
  }

  snapshot(): ProgressSnapshot {
    let loaded = 0
    let total = 0
    for (const v of this.files.values()) {
      loaded += v.loaded
      total += v.total
    }
    return { loaded, total, percent: total > 0 ? (loaded / total) * 100 : 0, fileCount: this.files.size }
  }

  perFile(): FileBytes[] {
    return Array.from(this.files.entries())
      .map(([file, v]) => ({ file, loaded: v.loaded, total: v.total }))
      .sort((a, b) => b.loaded - a.loaded)
  }
}

let cachedTransformers: AnyTransformers | null = null
async function loadTransformers(): Promise<AnyTransformers> {
  if (!cachedTransformers) {
    cachedTransformers = await import('@huggingface/transformers')
  }
  return cachedTransformers
}

/** Zit een repo al in de Cache Storage (voor cold/warm-classificatie)? */
async function isRepoCached(repo: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    const keys = await caches.keys()
    for (const k of keys) {
      const c = await caches.open(k)
      const reqs = await c.keys()
      if (reqs.some((r) => r.url.includes(repo))) return true
    }
  } catch {
    /* negeer */
  }
  return false
}

/** Wis alle Cache-Storage-caches (transformers.js cachet model-shards daar). */
export async function clearModelCache(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const keys = await caches.keys()
  let n = 0
  for (const k of keys) {
    if (await caches.delete(k)) n++
  }
  return n
}

export async function loadModel(
  entry: ModelEntry,
  onProgress: (s: ProgressSnapshot) => void,
): Promise<LoadOutcome> {
  const t = await loadTransformers()
  const wasCached = await isRepoCached(entry.repo)
  const tracker = new ProgressTracker()
  const progress_callback = (info: any) => {
    tracker.update(info)
    onProgress(tracker.snapshot())
  }

  const start = performance.now()

  let tokenizer: any
  let model: any
  let processor: any = null

  if (entry.kind === 'gemma4-conditional') {
    if (!t.Gemma4ForConditionalGeneration || !t.AutoProcessor) {
      throw new Error(
        'Gemma4ForConditionalGeneration/AutoProcessor ontbreekt in deze @huggingface/transformers-versie — controleer de modelkaart-API.',
      )
    }
    processor = await t.AutoProcessor.from_pretrained(entry.repo, { progress_callback })
    model = await t.Gemma4ForConditionalGeneration.from_pretrained(entry.repo, {
      dtype: entry.dtype,
      device: entry.device,
      progress_callback,
    })
    tokenizer = processor.tokenizer
  } else {
    tokenizer = await t.AutoTokenizer.from_pretrained(entry.repo, { progress_callback })
    model = await t.AutoModelForCausalLM.from_pretrained(entry.repo, {
      dtype: entry.dtype,
      device: entry.device,
      progress_callback,
    })
  }

  const loadMs = performance.now() - start

  // Download-dieet-diagnose: log per bestand naam + bytes naar de console, zodat
  // meteen zichtbaar is welke component (embed_tokens/decoder/vision/audio) in
  // welke dtype binnenkwam en waar de bytes zitten.
  const perFile = tracker.perFile()
  const totalBytes = tracker.snapshot().loaded
  if (perFile.length) {
    console.groupCollapsed(
      `[download-dieet] ${entry.repo} — ${perFile.length} bestand(en), totaal ${(totalBytes / 1e9).toFixed(2)} GB`,
    )
    for (const f of perFile) {
      console.log(`${(f.loaded / 1e6).toFixed(1).padStart(9)} MB  ${f.file}`)
    }
    console.groupEnd()
  }

  const runChat = async (messages: ChatMessage[], opts: { maxNewTokens: number }): Promise<GenResult> => {
    // Chat-template + tokenisatie. apply_chat_template geeft een string
    // (tokenize:false); we tokeniseren daarna zonder extra BOS (add_special_tokens:false),
    // want het template zet de speciale tokens al.
    let inputs: any
    if (entry.kind === 'gemma4-conditional') {
      const prompt = processor.apply_chat_template(messages, {
        enable_thinking: false,
        add_generation_prompt: true,
      })
      // Tekst-only pad: we tokeniseren via processor.tokenizer i.p.v. de
      // multimodale processor-call, zodat we geen beeld/audio hoeven mee te geven.
      inputs = processor.tokenizer(prompt, { add_special_tokens: false })
    } else {
      const prompt = tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      })
      inputs = tokenizer(prompt, { add_special_tokens: false })
    }

    let firstTokenAt: number | null = null
    let generatedTokens = 0
    let text = ''

    const streamer = new t.TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk: string) => {
        if (firstTokenAt === null) firstTokenAt = performance.now()
        text += chunk
      },
      token_callback_function: (ids: any) => {
        if (firstTokenAt === null) firstTokenAt = performance.now()
        generatedTokens += Array.isArray(ids) ? ids.length : ids?.length ?? 1
      },
    })

    const startGen = performance.now()
    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: opts.maxNewTokens,
      do_sample: false,
      streamer,
    })
    const endGen = performance.now()

    const inputTokens = Number(inputs?.input_ids?.dims?.at?.(-1)) || 0
    if (generatedTokens === 0 && outputs?.dims?.at) {
      const outLen = Number(outputs.dims.at(-1)) || 0
      generatedTokens = Math.max(0, outLen - inputTokens)
    }

    const decodeMs = firstTokenAt !== null ? endGen - firstTokenAt : null
    const decodeTokPerSec = decodeMs && decodeMs > 0 && generatedTokens > 0 ? generatedTokens / (decodeMs / 1000) : null

    return {
      text: text.trim(),
      ttftMs: firstTokenAt !== null ? firstTokenAt - startGen : null,
      wallMs: endGen - startGen,
      inputTokens,
      generatedTokens,
      decodeTokPerSec,
    }
  }

  return {
    model: { entry, runChat },
    loadMs,
    wasCached,
    downloadBytes: totalBytes,
    perFile,
  }
}
