import { describe, it, expect, vi, beforeEach } from 'vitest'
import { APICallError } from 'ai'

/**
 * UR3-09 / ADR 0132 — élke mislukte cloud-AI-call krijgt een `error_logs`-rij.
 * `getServiceClient`/`logError` zijn geen DI-parameters van deze module (ze
 * worden intern geïmporteerd), dus die twee worden hier gemockt; de rest
 * (classifyProviderError) draait echt.
 */

const { mockLogError, mockGetServiceClient } = vi.hoisted(() => ({
  // Expliciet getypeerd (niet `async () => {}`): zonder parameters infereert
  // vitest `.mock.calls` als `[]` (0-tuple), en elke destructure/cast naar de
  // echte 2-argumenten-vorm hieronder wordt dan een TS2352/TS2493-fout.
  mockLogError: vi.fn(
    async (_client: unknown, _params: { userId?: string | null; context?: string; message: string }) => {},
  ),
  mockGetServiceClient: vi.fn(() => ({ __marker: 'service-client' })),
}))

vi.mock('@/lib/log-error', () => ({ logError: mockLogError }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mockGetServiceClient }))

import { logAiFailure, aiFailureMiddleware } from './ai-failure-middleware'

function fakeSupabase(userId: string | null = null) {
  return { auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) } }
}

beforeEach(() => {
  mockLogError.mockClear()
  mockLogError.mockImplementation(async () => {})
  mockGetServiceClient.mockClear()
})

describe('logAiFailure — berichtvorm', () => {
  it('formatteert kind (statusCode/errorName): message en kapt af op 500 tekens', async () => {
    const err = new APICallError({
      message: 'x'.repeat(600),
      url: 'https://api.anthropic.com/v1/messages',
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    })
    await logAiFailure('ai:chat', err)

    expect(mockLogError).toHaveBeenCalledTimes(1)
    const [client, params] = mockLogError.mock.calls[0] as [unknown, { context: string; message: string }]
    expect(client).toBe(mockGetServiceClient.mock.results[0]?.value)
    expect(params.context).toBe('ai:chat')
    expect(params.message.startsWith('refused (400/AI_APICallError): ')).toBe(true)
    expect(params.message.length).toBe(500)
  })

  it('gebruikt "—" als er geen numerieke statusCode is', async () => {
    await logAiFailure('ai:config', new TypeError('fetch failed'))
    const params = mockLogError.mock.calls[0][1] as { message: string }
    expect(params.message).toBe('transient (—/TypeError): fetch failed')
  })

  it('een niet-Error-waarde krijgt errorName "Error" en de String()-representatie als tekst', async () => {
    await logAiFailure('ai:chat', 'kale string-fout')
    const params = mockLogError.mock.calls[0][1] as { message: string }
    expect(params.message).toBe('unknown (—/Error): kale string-fout')
  })
})

describe('logAiFailure — dedup en foutbestendigheid', () => {
  it('hetzelfde fout-object levert maar één logError-call op (WeakSet-dedup)', async () => {
    const shared = new Error('boom')
    await logAiFailure('ai:chat', shared)
    await logAiFailure('ai:chat', shared)
    await logAiFailure('ai:briefing', shared) // ook onder een andere tag: nog steeds hetzelfde object
    expect(mockLogError).toHaveBeenCalledTimes(1)
  })

  it('twee verschillende Error-instanties met dezelfde message krijgen elk hun eigen call', async () => {
    const a = new Error('boom')
    const b = new Error('boom')
    await logAiFailure('ai:chat', a)
    await logAiFailure('ai:chat', b)
    expect(mockLogError).toHaveBeenCalledTimes(2)
  })

  it('gooit nooit, ook niet als logError zelf faalt', async () => {
    mockLogError.mockRejectedValueOnce(new Error('db onbereikbaar'))
    await expect(logAiFailure('ai:chat', new Error('x'))).resolves.toBeUndefined()
  })

  it('haalt userId op uit opts.supabase indien gegeven', async () => {
    await logAiFailure('ai:chat', new Error('x'), { supabase: fakeSupabase('user-1') as never })
    const params = mockLogError.mock.calls[0][1] as { userId: string | null }
    expect(params.userId).toBe('user-1')
  })

  it('userId is null zonder opts.supabase', async () => {
    await logAiFailure('ai:chat', new Error('x'))
    const params = mockLogError.mock.calls[0][1] as { userId: string | null }
    expect(params.userId).toBeNull()
  })
})

describe('aiFailureMiddleware — wrapGenerate', () => {
  it('logt de fout precies één keer en gooit hem ongewijzigd door', async () => {
    const err = new Error('generate mislukt')
    const mw = aiFailureMiddleware({ supabase: fakeSupabase() as never, feature: 'chat' })
    const doGenerate = vi.fn(async () => {
      throw err
    })

    await expect(mw.wrapGenerate!({ doGenerate } as never)).rejects.toBe(err)
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect((mockLogError.mock.calls[0][1] as { context: string }).context).toBe('ai:chat')
  })
})

describe('aiFailureMiddleware — wrapStream', () => {
  it('een error-stream-part gaat ongewijzigd door de stream én logt precies één keer', async () => {
    const streamErr = new Error('provider ging stuk midden in de stream')
    const mw = aiFailureMiddleware({ supabase: fakeSupabase() as never, feature: 'briefing' })
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-delta', textDelta: 'hoi' })
          controller.enqueue({ type: 'error', error: streamErr })
          controller.close()
        },
      }),
    }))

    const result = await mw.wrapStream!({ doStream } as never)
    const reader = (result.stream as ReadableStream).getReader()
    const parts: unknown[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
    }

    expect(parts).toEqual([
      { type: 'text-delta', textDelta: 'hoi' },
      { type: 'error', error: streamErr },
    ])

    // logAiFailure wordt fire-and-forget aangeroepen in de transform (`void
    // logAiFailure(...)`) — flush de microtask-queue vóór de assert.
    await Promise.resolve()
    await Promise.resolve()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect((mockLogError.mock.calls[0][1] as { context: string }).context).toBe('ai:briefing')
  })

  it('een doStream die zelf reject krijgt hetzelfde rethrow+log-contract als wrapGenerate', async () => {
    const err = new Error('stream-setup mislukt')
    const mw = aiFailureMiddleware({ supabase: fakeSupabase() as never, feature: 'chat' })
    const doStream = vi.fn(async () => {
      throw err
    })

    await expect(mw.wrapStream!({ doStream } as never)).rejects.toBe(err)
    expect(mockLogError).toHaveBeenCalledTimes(1)
  })
})
