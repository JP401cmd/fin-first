// ── On-device Transformers.js-runtime (Gemma 4 E2B, WebGPU) ───────────────────
//
// Dunne facade rond @huggingface/transformers, met een BEWUST dynamische import
// zodat de zware bundel (onnxruntime-web + wasm) pas binnenkomt wanneer de
// gebruiker de lokale privé-modus echt gebruikt — nooit in het reguliere pad.
//
// Model + laad-API volgen de modelkaart en de geverifieerde fase-0-spike
// (spikes/lokale-categorisatie/loader.ts):
//   onnx-community/gemma-4-E2B-it-ONNX · AutoProcessor +
//   Gemma4ForConditionalGeneration · device 'webgpu' · per-module dtype q4f16 ·
//   tekst-only · enable_thinking:false · greedy (do_sample:false).
//
// De facade wordt getypeerd als een smalle interface en de import wordt daarop
// gecast: dat houdt tsc stabiel ongeacht welke class-namen de geïnstalleerde
// @huggingface/transformers-versie exпорteert (de exacte namen driften per
// versie — de modelkaart is leidend).

export type LocalChatMessage = { role: 'system' | 'user'; content: string }

export type LocalModelLoadProgress = {
  loadedBytes: number
  totalBytes: number | null
  file?: string
}

/** Repo-id van de vaste productiekandidaat (ADR 0043). */
export const LOCAL_MODEL_REPO = 'onnx-community/gemma-4-E2B-it-ONNX'

/**
 * Per-module q4f16 pinnen (download-dieet). Zonder pinning kan bv. embed_tokens
 * naar fp16 (~5,5 GB) vallen en blaast de download op (fase-0-meting: 6,32 GB
 * i.p.v. ~3,2 GB). vision/audio zijn klein maar kunnen niet schoon worden
 * overgeslagen via de API — ook op q4f16 pinnen.
 */
const LOCAL_MODEL_DTYPE: Record<string, string> = {
  embed_tokens: 'q4f16',
  decoder_model_merged: 'q4f16',
  vision_encoder: 'q4f16',
  audio_encoder: 'q4f16',
}

const MAX_NEW_TOKENS_CAP = 4096

// ── Smalle facade-typen (zie kop) ─────────────────────────────────────────────
type TokenizerLike = ((text: string, opts: Record<string, unknown>) => unknown) & Record<string, unknown>

type ProcessorLike = {
  apply_chat_template(messages: LocalChatMessage[], opts: Record<string, unknown>): string
  tokenizer: TokenizerLike
}

type ModelLike = {
  generate(opts: Record<string, unknown>): Promise<unknown>
  dispose?: () => Promise<void> | void
}

type FromPretrained<T> = {
  from_pretrained(repo: string, opts: Record<string, unknown>): Promise<T>
}

type TransformersModule = {
  AutoProcessor: FromPretrained<ProcessorLike>
  Gemma4ForConditionalGeneration: FromPretrained<ModelLike>
  TextStreamer: new (tokenizer: unknown, opts: Record<string, unknown>) => unknown
}

export type LocalSession = {
  /** Genereer greedy tekst voor de chat-messages; retourneert de ruwe uitvoer. */
  generate(messages: LocalChatMessage[], maxNewTokens: number): Promise<string>
}

// ── Download-voortgang aggregeren over alle model-shards ──────────────────────
class ProgressTracker {
  private files = new Map<string, { loaded: number; total: number }>()

  update(info: unknown): void {
    if (!info || typeof info !== 'object') return
    const i = info as Record<string, unknown>
    // Transformers.js vuurt naast per-bestand progress-events óók een AGGREGAAT-
    // event met de repo-id als naam; dat dubbeltelt de download. We tellen alleen
    // echte bestanden (herkenbaar aan een extensie in de basename).
    if (i.status === 'progress_total') return
    const key = (i.file || i.name || i.url) as string | undefined
    if (!key) return
    const base = key.split(/[\\/]/).pop() ?? key
    if (!base.includes('.')) return
    const loaded = Number(i.loaded) || 0
    const total = Number(i.total) || 0
    if (loaded > 0 || total > 0) {
      const prev = this.files.get(key) ?? { loaded: 0, total: 0 }
      this.files.set(key, { loaded: Math.max(prev.loaded, loaded), total: Math.max(prev.total, total) })
    }
  }

  snapshot(lastFile?: string): LocalModelLoadProgress {
    let loaded = 0
    let total = 0
    for (const v of this.files.values()) {
      loaded += v.loaded
      total += v.total
    }
    return { loadedBytes: loaded, totalBytes: total > 0 ? total : null, file: lastFile }
  }
}

let cachedModule: TransformersModule | null = null
async function loadTransformers(): Promise<TransformersModule> {
  if (!cachedModule) {
    cachedModule = (await import('@huggingface/transformers')) as unknown as TransformersModule
  }
  return cachedModule
}

let sessionPromise: Promise<LocalSession> | null = null
let loadedModel: ModelLike | null = null

async function buildSession(onProgress?: (p: LocalModelLoadProgress) => void): Promise<LocalSession> {
  const t = await loadTransformers()

  if (!t.Gemma4ForConditionalGeneration || !t.AutoProcessor) {
    throw new Error(
      'De lokale AI-runtime kon niet worden geladen (Gemma4ForConditionalGeneration/AutoProcessor ontbreekt in deze @huggingface/transformers-versie).',
    )
  }

  const tracker = new ProgressTracker()
  const progress_callback = (info: unknown) => {
    tracker.update(info)
    const key = info && typeof info === 'object' ? (info as Record<string, unknown>).file : undefined
    onProgress?.(tracker.snapshot(typeof key === 'string' ? key : undefined))
  }

  const processor = await t.AutoProcessor.from_pretrained(LOCAL_MODEL_REPO, { progress_callback })
  const model = await t.Gemma4ForConditionalGeneration.from_pretrained(LOCAL_MODEL_REPO, {
    dtype: LOCAL_MODEL_DTYPE,
    device: 'webgpu',
    progress_callback,
  })
  loadedModel = model

  const generate = async (messages: LocalChatMessage[], maxNewTokens: number): Promise<string> => {
    // Chat-template → string (tokenize:false via apply_chat_template), daarna
    // tekst-only tokeniseren zonder extra BOS (het template zet de speciale
    // tokens al). enable_thinking:false + greedy conform de spike.
    const prompt = processor.apply_chat_template(messages, {
      enable_thinking: false,
      add_generation_prompt: true,
    })
    const inputs = processor.tokenizer(prompt, { add_special_tokens: false }) as Record<string, unknown>

    let text = ''
    const streamer = new t.TextStreamer(processor.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk: string) => {
        text += chunk
      },
    })

    await model.generate({
      ...inputs,
      max_new_tokens: Math.min(MAX_NEW_TOKENS_CAP, Math.max(1, maxNewTokens)),
      do_sample: false,
      streamer,
    })

    return text.trim()
  }

  return { generate }
}

/**
 * Laad (of hergebruik) de on-device sessie. Idempotent: meerdere aanroepen delen
 * dezelfde geladen sessie. `onProgress` is alleen zinvol bij de éérste (koude)
 * load; daarna komt het model uit de Cache Storage.
 */
export async function loadModelSession(onProgress?: (p: LocalModelLoadProgress) => void): Promise<LocalSession> {
  if (!sessionPromise) {
    sessionPromise = buildSession(onProgress).catch((err) => {
      // Faalt de load, gooi de gecachte promise weg zodat een volgende poging
      // opnieuw probeert i.p.v. de fout te blijven herhalen.
      sessionPromise = null
      loadedModel = null
      throw err
    })
  }
  return sessionPromise
}

/**
 * Ontkoppel en verwijder de huidige sessie uit het geheugen (sessieherstel na
 * een WebGPU device-loss / poisoned session). De volgende loadModelSession bouwt
 * een verse sessie.
 */
export async function disposeSession(): Promise<void> {
  const model = loadedModel
  sessionPromise = null
  loadedModel = null
  if (model?.dispose) {
    try {
      await model.dispose()
    } catch {
      /* dispose faalt soms na een device-loss — negeren, de referentie is weg */
    }
  }
}

/** Zit het model al in de Cache Storage (transformers.js cachet shards daar)? */
export async function isModelCached(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    for (const k of await caches.keys()) {
      const c = await caches.open(k)
      const reqs = await c.keys()
      if (reqs.some((r) => r.url.includes(LOCAL_MODEL_REPO))) return true
    }
  } catch {
    /* geen cache-toegang → behandel als niet-gecacht */
  }
  return false
}

/** Wis de model-shards uit de Cache Storage. Retourneert het aantal gewiste caches. */
export async function clearModelCache(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  let n = 0
  for (const k of await caches.keys()) {
    const c = await caches.open(k)
    const reqs = await c.keys()
    const modelReqs = reqs.filter((r) => r.url.includes(LOCAL_MODEL_REPO))
    if (modelReqs.length === 0) continue
    for (const r of modelReqs) {
      if (await c.delete(r)) n++
    }
  }
  return n
}
