import { describe, it, expect, afterEach } from 'vitest'
import { checkLocalAiCapability, MIN_STORAGE_BUFFER_BINDING_BYTES } from './webgpu-capability'

// ── Gemockte navigator.gpu ────────────────────────────────────────────────────
// We zetten navigator.gpu per test en ruimen 'm daarna op. De check mag nooit
// werpen — elke faal-tak wordt een ok:false met een concrete NL-reden.

function setGpu(gpu: unknown): void {
  Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true })
}

function makeAdapter(opts: { shaderF16: boolean; maxStorageBufferBindingSize: number }) {
  return {
    features: { has: (name: string) => (name === 'shader-f16' ? opts.shaderF16 : false) },
    limits: { maxStorageBufferBindingSize: opts.maxStorageBufferBindingSize, maxBufferSize: opts.maxStorageBufferBindingSize },
    info: { vendor: 'nvidia', architecture: 'ada' },
  }
}

afterEach(() => {
  // Verwijder de gestubde property zodat andere suites een schone navigator zien.
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'gpu')
})

describe('checkLocalAiCapability', () => {
  it('faalt eerlijk zonder WebGPU', async () => {
    setGpu(undefined)
    const cap = await checkLocalAiCapability()
    expect(cap.ok).toBe(false)
    expect(cap.reasons[0]).toMatch(/WebGPU/i)
    expect(cap.shaderF16).toBe(false)
  })

  it('faalt wanneer er geen adapter is', async () => {
    // adapterRetryDelayMs: 0 → de flap-herpoging is instant (geen echte 400ms-sleep).
    setGpu({ requestAdapter: async () => null })
    const cap = await checkLocalAiCapability({ adapterRetryDelayMs: 0 })
    expect(cap.ok).toBe(false)
    expect(cap.reasons[0]).toMatch(/grafische chip|adapter/i)
  })

  it('dempt een transiënte adapter-flap: null bij de 1e poging, geldige adapter bij de 2e → ok', async () => {
    // requestAdapter geeft soms kortstondig null bij een GPU-proces-herstart /
    // driver-update; de eenmalige herpoging vangt dat op i.p.v. het toestel af te
    // keuren.
    let calls = 0
    setGpu({
      requestAdapter: async () => {
        calls++
        return calls === 1
          ? null
          : makeAdapter({ shaderF16: true, maxStorageBufferBindingSize: MIN_STORAGE_BUFFER_BINDING_BYTES })
      },
    })
    const cap = await checkLocalAiCapability({ adapterRetryDelayMs: 0 })
    expect(cap.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('dempt ook een transiënte throw: throw bij de 1e poging, geldige adapter bij de 2e → ok', async () => {
    let calls = 0
    setGpu({
      requestAdapter: async () => {
        calls++
        if (calls === 1) throw new Error('gpu process restarting')
        return makeAdapter({ shaderF16: true, maxStorageBufferBindingSize: MIN_STORAGE_BUFFER_BINDING_BYTES })
      },
    })
    const cap = await checkLocalAiCapability({ adapterRetryDelayMs: 0 })
    expect(cap.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('adapter blijft null bij beide pogingen → ok:false (echt ongeschikt)', async () => {
    let calls = 0
    setGpu({
      requestAdapter: async () => {
        calls++
        return null
      },
    })
    const cap = await checkLocalAiCapability({ adapterRetryDelayMs: 0 })
    expect(cap.ok).toBe(false)
    expect(cap.reasons[0]).toMatch(/grafische chip|adapter/i)
    expect(calls).toBe(2)
  })

  it('slaagt op een desktop-GPU met shader-f16 en genoeg buffergeheugen', async () => {
    setGpu({ requestAdapter: async () => makeAdapter({ shaderF16: true, maxStorageBufferBindingSize: MIN_STORAGE_BUFFER_BINDING_BYTES }) })
    const cap = await checkLocalAiCapability()
    expect(cap.ok).toBe(true)
    expect(cap.reasons).toHaveLength(0)
    expect(cap.shaderF16).toBe(true)
    expect(cap.adapterInfo).toEqual({ vendor: 'nvidia', architecture: 'ada' })
  })

  it('faalt zonder shader-f16', async () => {
    setGpu({ requestAdapter: async () => makeAdapter({ shaderF16: false, maxStorageBufferBindingSize: MIN_STORAGE_BUFFER_BINDING_BYTES }) })
    const cap = await checkLocalAiCapability()
    expect(cap.ok).toBe(false)
    expect(cap.reasons.some((r) => /shader-f16|16-bits/i.test(r))).toBe(true)
  })

  it('faalt bij te weinig storage-buffergeheugen (mobiel-profiel)', async () => {
    setGpu({ requestAdapter: async () => makeAdapter({ shaderF16: true, maxStorageBufferBindingSize: 256 * 1024 * 1024 }) })
    const cap = await checkLocalAiCapability()
    expect(cap.ok).toBe(false)
    expect(cap.reasons.some((r) => /geheugen|1,2 GiB/i.test(r))).toBe(true)
  })

  it('werpt nooit, ook niet als requestAdapter faalt', async () => {
    setGpu({ requestAdapter: async () => { throw new Error('boom') } })
    const cap = await checkLocalAiCapability({ adapterRetryDelayMs: 0 })
    expect(cap.ok).toBe(false)
  })
})
