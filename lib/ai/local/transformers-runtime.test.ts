import { describe, it, expect, vi, afterEach } from 'vitest'
import { isModelCached, LOCAL_MODEL_REPO } from './transformers-runtime'

/**
 * Completeness-check van isModelCached (les productie 19 jul 2026): Cache
 * Storage-eviction verwijdert shards SELECTIEF. Een "any-match" telde een half
 * ge-evict model als 'klaar', waarna de sessie-opbouw crashte met een
 * nietszeggende "niet gelukt"-melding. De check vereist daarom de kernbestanden
 * expliciet: embed_tokens- én decoder-shard én tokenizer — anders geldt het
 * model als niet-gedownload en stuurt de UI direct naar de download-flow.
 */

function stubCaches(urls: string[]) {
  const cache = {
    keys: async () => urls.map((u) => ({ url: u }) as Request),
  }
  vi.stubGlobal('caches', {
    keys: async () => ['transformers-cache'],
    open: async () => cache,
  })
}

const SHARD = (f: string) => `https://huggingface.co/${LOCAL_MODEL_REPO}/resolve/main/${f}`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isModelCached — completeness in plaats van any-match', () => {
  it('volledig model (embed_tokens + decoder + tokenizer) → true', async () => {
    stubCaches([
      SHARD('onnx/embed_tokens_q4f16.onnx'),
      SHARD('onnx/decoder_model_merged_q4f16.onnx'),
      SHARD('tokenizer.json'),
      SHARD('config.json'),
    ])
    expect(await isModelCached()).toBe(true)
  })

  it('partial eviction: alleen de decoder over → false (niet meer any-match)', async () => {
    stubCaches([SHARD('onnx/decoder_model_merged_q4f16.onnx')])
    expect(await isModelCached()).toBe(false)
  })

  it('partial eviction: tokenizer weg → false', async () => {
    stubCaches([
      SHARD('onnx/embed_tokens_q4f16.onnx'),
      SHARD('onnx/decoder_model_merged_q4f16.onnx'),
    ])
    expect(await isModelCached()).toBe(false)
  })

  it('lege cache → false', async () => {
    stubCaches([])
    expect(await isModelCached()).toBe(false)
  })

  it('andere repo-bestanden tellen niet mee', async () => {
    stubCaches([
      'https://huggingface.co/ander/model/resolve/main/onnx/embed_tokens_q4f16.onnx',
      'https://huggingface.co/ander/model/resolve/main/onnx/decoder_model_merged_q4f16.onnx',
      'https://huggingface.co/ander/model/resolve/main/tokenizer.json',
    ])
    expect(await isModelCached()).toBe(false)
  })

  it('geen caches-API (SSR/oude browser) → false, zonder throw', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await isModelCached()).toBe(false)
  })
})
