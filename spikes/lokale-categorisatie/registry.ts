// Model-registry. Twee entries:
//  - primair: de vastgestelde productiekandidaat (Gemma 4 E2B).
//  - secundair: klein smoke-model om de harnasmechanica te testen vóór de
//    3,1 GB-download. Puur harnas-verificatie, geen strategisch alternatief.
//
// De twee entries gebruiken bewust verschillende laad-API's — zie loader.ts.
// De primaire volgt exact de modelkaart (AutoProcessor +
// Gemma4ForConditionalGeneration). De secundaire is een gewoon causaal
// LM (AutoTokenizer + AutoModelForCausalLM) zodat we identieke timing-metingen
// (TTFT/decode via streamer) kunnen doen als bij de primaire.

export type ModelKind = 'gemma4-conditional' | 'causal-lm'

export type ModelEntry = {
  id: string
  label: string
  repo: string
  kind: ModelKind
  /**
   * dtype voor from_pretrained. String = zelfde dtype voor álle modules; object
   * = per-module dtype (embed_tokens/decoder_model_merged/vision_encoder/
   * audio_encoder). Transformers.js ondersteunt beide (zie Florence-2-voorbeeld
   * in de docs). Voor het multimodale Gemma 4 E2B PINNEN we elke module op
   * q4f16 — anders kan bv. embed_tokens naar fp16 (~5,5 GB!) vallen en blaast de
   * download op (meting v1: 6,32 GB i.p.v. ~3,1 GB).
   */
  dtype: string | Record<string, string>
  device: 'webgpu'
  /** Ruwe download-schatting (GB) — puur voor de UI-waarschuwing. */
  approxDownloadGB: number
  /** q4f16 leunt op shader-f16; zonder valt ORT terug op f32 (langzamer/zwaarder). */
  needsShaderF16: boolean
  /** Heuristische ondergrens voor maxStorageBufferBindingSize (MB). */
  minStorageBufferBindingMB: number
  note: string
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: 'gemma-4-e2b',
    label: 'Gemma 4 E2B-it (ONNX, q4f16) — PRIMAIR / productiekandidaat',
    repo: 'onnx-community/gemma-4-E2B-it-ONNX',
    kind: 'gemma4-conditional',
    // Per-module q4f16 pinnen (download-dieet). embed_tokens_q4f16 ≈ 1,59 GB +
    // decoder_model_merged_q4f16 ≈ 1,52 GB ≈ 3,11 GB. vision/audio q4f16 zijn
    // klein (~99 + ~171 MB) en kunnen niet schoon worden overgeslagen via de API.
    dtype: {
      embed_tokens: 'q4f16',
      decoder_model_merged: 'q4f16',
      vision_encoder: 'q4f16',
      audio_encoder: 'q4f16',
    },
    device: 'webgpu',
    approxDownloadGB: 3.4,
    needsShaderF16: true,
    minStorageBufferBindingMB: 1024,
    note: 'Multimodaal model, hier tekst-only gebruikt (geen beeld/audio). Per-module q4f16 → verwacht ~3,1 GB tekstkern (embed ~1,59 GB + decoder ~1,52 GB) + ~0,27 GB vision/audio q4f16. Zónder per-module pinning viel de download op meting v1 uit op 6,32 GB.',
  },
  {
    id: 'gemma-3-1b',
    label: 'Gemma 3 1B-it (ONNX, q4f16) — SMOKE / harnas-verificatie',
    repo: 'onnx-community/gemma-3-1b-it-ONNX',
    kind: 'causal-lm',
    dtype: 'q4f16',
    device: 'webgpu',
    approxDownloadGB: 1.0,
    needsShaderF16: true,
    minStorageBufferBindingMB: 512,
    note: 'Klein Gemma-instruct-model om de harnasmechanica snel te verifiëren vóór de 3,1 GB-download. Géén strategisch alternatief.',
  },
]

export function findEntry(id: string): ModelEntry {
  const e = MODEL_REGISTRY.find((m) => m.id === id)
  if (!e) throw new Error(`Onbekende model-id: ${id}`)
  return e
}
