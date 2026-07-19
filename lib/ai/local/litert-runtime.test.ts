import { describe, it, expect, vi, afterEach } from 'vitest'

// ── Mock @litert-lm/core (WASM) — de Engine wordt NIET echt geladen ────────────
// Alleen de sessie-paden hieronder raken de core (via loadModelSession); de
// cache-helpers (isModelCached/clearModelCache) niet. `callOrder` legt de
// volgorde loader→create vast (no-egress-pinning). sendMessageStreaming levert
// een ECHTE ReadableStream<Message> terug — de productievorm (dekt de
// getReader-consumptie i.p.v. async-iteratie).
const { loaderSpy, engineCreateSpy, engineDeleteSpy, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = []
  const engineDeleteSpy = vi.fn(async () => {})
  const loaderSpy = vi.fn(async (path?: string) => {
    callOrder.push(`load:${path}`)
  })
  // Bouwt een echte ReadableStream die de gegeven Message-chunks emit en sluit.
  const streamOf = (chunks: unknown[]) =>
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })
  const engineCreateSpy = vi.fn(async () => {
    callOrder.push('create')
    return {
      createConversation: async () => ({
        sendMessageStreaming: () => streamOf([{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] }]),
      }),
      delete: engineDeleteSpy,
    }
  })
  return { loaderSpy, engineCreateSpy, engineDeleteSpy, callOrder }
})

vi.mock('@litert-lm/core', () => ({
  getOrLoadGlobalLiteRtLm: loaderSpy,
  Engine: { create: engineCreateSpy },
}))

import {
  isModelCached,
  clearModelCache,
  loadModelSession,
  disposeSession,
  LOCAL_MODEL_URL,
} from './litert-runtime'

const CACHE_NAME = 'litert-lm-model'

/** Stub een cold streaming-download: één chunk `bytes`, met (of zonder) content-length. */
function stubStreamingFetch(bytes: Uint8Array, contentLength: string | null) {
  let sent = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: {
        getReader: () => ({
          read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })),
        }),
      },
      headers: { get: (h: string) => (h === 'content-length' ? contentLength : null) },
    })),
  )
}

/** Stub een warm pad (cache-hit op de exacte model-URL). */
function stubWarmCache() {
  vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response('x') }) })
}

const SAMPLE_MESSAGES = [
  { role: 'system' as const, content: 's' },
  { role: 'user' as const, content: 'u' },
]

afterEach(async () => {
  await disposeSession() // reset de module-cache van de sessie tussen tests
  vi.unstubAllGlobals()
  engineDeleteSpy.mockClear()
  loaderSpy.mockClear()
  engineCreateSpy.mockClear()
  callOrder.length = 0
})

// ── isModelCached: één atomaire Cache-API-entry onder de exacte URL ────────────
describe('isModelCached — exacte-URL-entry (atomaire bundel)', () => {
  function stubCachesWith(entryUrl: string | null) {
    const cache = {
      match: async (url: string) => (entryUrl !== null && url === entryUrl ? new Response('x') : undefined),
    }
    vi.stubGlobal('caches', {
      open: async (name: string) => {
        expect(name).toBe(CACHE_NAME)
        return cache
      },
    })
  }

  it('entry onder LOCAL_MODEL_URL aanwezig → true', async () => {
    stubCachesWith(LOCAL_MODEL_URL)
    expect(await isModelCached()).toBe(true)
  })

  it('geen entry → false', async () => {
    stubCachesWith(null)
    expect(await isModelCached()).toBe(false)
  })

  it('andere URL gecacht → false (exacte match vereist)', async () => {
    stubCachesWith('https://huggingface.co/ander/model/resolve/main/ander.litertlm')
    expect(await isModelCached()).toBe(false)
  })

  it('caches.open werpt → false, zonder throw', async () => {
    vi.stubGlobal('caches', {
      open: async () => {
        throw new Error('geen toegang')
      },
    })
    expect(await isModelCached()).toBe(false)
  })

  it('geen caches-API (SSR/oude browser) → false', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await isModelCached()).toBe(false)
  })
})

// ── clearModelCache: wist de hele bundel-cache in één keer ─────────────────────
describe('clearModelCache', () => {
  it('caches.delete(CACHE_NAME) true → true', async () => {
    const deleteSpy = vi.fn(async (name: string) => name === CACHE_NAME)
    vi.stubGlobal('caches', { delete: deleteSpy })
    expect(await clearModelCache()).toBe(true)
    expect(deleteSpy).toHaveBeenCalledWith(CACHE_NAME)
  })

  it('niets te wissen (delete false) → false', async () => {
    vi.stubGlobal('caches', { delete: async () => false })
    expect(await clearModelCache()).toBe(false)
  })

  it('caches.delete werpt → false, zonder throw', async () => {
    vi.stubGlobal('caches', {
      delete: async () => {
        throw new Error('boom')
      },
    })
    expect(await clearModelCache()).toBe(false)
  })

  it('geen caches-API → false', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await clearModelCache()).toBe(false)
  })
})

// ── Quota-fout bij cache.put is GEEN run-blokker (spike-les) ────────────────────
describe('cold download — quota-fout op cache.put wordt gelogd, sessie draait door', () => {
  it('put werpt QuotaExceededError → console.error + sessie bruikbaar', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const putSpy = vi.fn(async () => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    // Cold pad: match → undefined zodat er gedownload wordt; put werpt.
    const cache = { match: async () => undefined, put: putSpy }
    vi.stubGlobal('caches', { open: async () => cache })

    // Volledige download: 4 bytes body, content-length 4 → integriteitscheck OK.
    stubStreamingFetch(new Uint8Array([1, 2, 3, 4]), '4')

    const session = await loadModelSession()
    // De quota-fout is gelogd met de kanarie-prefix, niet gegooid.
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0][0])).toContain('[lokale-ai]')
    expect(putSpy).toHaveBeenCalledTimes(1)

    // Sessie is ondanks de quota-fout bruikbaar (draait op de al gedownloade Blob).
    const out = await session.generate(SAMPLE_MESSAGES, 128)
    expect(out).toBe('ok')

    errorSpy.mockRestore()
  })
})

// ── Integriteit: onvolledige download poisoned de cache NIET (sticky-poisoning) ─
describe('cold download — truncatie (content-length ≠ ontvangen)', () => {
  it('content-length 100, body 50 → throw "onvolledig", géén cache.put, géén Engine.create', async () => {
    const putSpy = vi.fn(async () => {})
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: putSpy }) })
    // Schone vroege EOF: 50 bytes ontvangen terwijl content-length 100 belooft.
    stubStreamingFetch(new Uint8Array(50), '100')

    await expect(loadModelSession()).rejects.toThrow(/onvolledig/i)
    // Niet gecachet (anders zou de corrupte bundel permanent 'compleet' ogen)...
    expect(putSpy).not.toHaveBeenCalled()
    // ...en de init is nooit bereikt (integriteitsfout vóór Engine.create).
    expect(engineCreateSpy).not.toHaveBeenCalled()
  })
})

// ── Warm pad: cache-hit → geen netwerk-fetch ───────────────────────────────────
describe('warm pad — cache-hit serveert de Blob, geen fetch', () => {
  it('bij een cache-hit wordt fetch niet aangeroepen en draait de sessie', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    stubWarmCache()

    const session = await loadModelSession()
    expect(fetchSpy).not.toHaveBeenCalled()
    const out = await session.generate(SAMPLE_MESSAGES, 64)
    expect(out).toBe('ok')
  })
})

// ── Init-fout → reject, en de sessionPromise-reset laat een 2e poging slagen ────
describe('init-fout — loadModelSession reject, tweede poging slaagt', () => {
  it('Engine.create werpt de eerste keer → reject; verse retry bouwt opnieuw en slaagt', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stubWarmCache()
    engineCreateSpy.mockImplementationOnce(async () => {
      throw new Error('init boom #2572')
    })

    await expect(loadModelSession()).rejects.toThrow('init boom')
    // De gecachte (gefaalde) promise is gereset → tweede aanroep bouwt vers.
    const session = await loadModelSession()
    const out = await session.generate(SAMPLE_MESSAGES, 64)
    expect(out).toBe('ok')
    expect(engineCreateSpy).toHaveBeenCalledTimes(2)

    errorSpy.mockRestore()
  })
})

// ── No-egress: WASM van eigen origin, nooit van de jsdelivr-CDN ────────────────
describe('no-egress — WASM-loader gepind op eigen origin vóór Engine.create', () => {
  it('roept getOrLoadGlobalLiteRtLm("/litert-wasm") aan vóór Engine.create, nooit jsdelivr', async () => {
    // Warm pad: cache-hit zodat er niet gedownload hoeft te worden.
    stubWarmCache()

    await loadModelSession()

    // De loader is met het EIGEN-ORIGIN-pad aangeroepen...
    expect(loaderSpy).toHaveBeenCalledWith('/litert-wasm')
    // ...en wel VÓÓR Engine.create (anders pakt create's interne no-arg-call de CDN).
    expect(callOrder).toEqual(['load:/litert-wasm', 'create'])
    // ...en nooit met een jsdelivr/CDN-pad.
    for (const call of loaderSpy.mock.calls) {
      expect(String(call[0])).not.toContain('jsdelivr')
      expect(String(call[0])).not.toMatch(/^https?:\/\//)
    }
  })
})
