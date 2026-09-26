import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Wie een AI-aanroep deed, bepaalt de AANROEPER — niet een `auth.getUser()`
 * achteraf. De middleware logt bij `finish` van de stream, en dat kan ná de
 * request-context vallen (sessie-cookie/refresh niet meer beschikbaar). Faalde
 * getUser daar, dan landde een gebruikersaanroep als `user_id = null` en telde
 * /beheer/jobs hem als systeem. Drie gevallen, één contract:
 *   - string    → die userId, géén getUser
 *   - null      → expliciete systeemcall, géén getUser
 *   - undefined → de oude fallback (getUser), voor een niet-omgezette aanroeper
 */

const { mockInsert, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }))
  const mockFrom = vi.fn((_table: string) => ({ insert: mockInsert }))
  return { mockInsert, mockFrom }
})

vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => ({ from: mockFrom }) }))

import { logAiTokens, tokenLoggingMiddleware } from './token-usage'

function fakeSupabase(userId: string | null = 'sessie-user') {
  const getUser = vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } }))
  return { client: { auth: { getUser } } as never, getUser }
}

const usage = { inputTokens: { total: 120 }, outputTokens: { total: 30 } }
const base = { feature: 'chat', provider: 'anthropic', modelId: 'claude-test' }

function insertedRow(): Record<string, unknown> {
  expect(mockInsert).toHaveBeenCalledTimes(1)
  return mockInsert.mock.calls[0][0]
}

beforeEach(() => {
  mockInsert.mockClear()
  mockFrom.mockClear()
})

describe('logAiTokens — userId van de aanroeper', () => {
  it('een meegegeven userId wordt gelogd zonder getUser aan te roepen', async () => {
    const { client, getUser } = fakeSupabase('sessie-user')
    await logAiTokens({ supabase: client, ...base, usage, userId: 'aanroeper-user' })

    expect(getUser).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('ai_token_usage')
    expect(insertedRow()).toMatchObject({
      user_id: 'aanroeper-user',
      feature: 'chat',
      provider: 'anthropic',
      model: 'claude-test',
      input_tokens: 120,
      output_tokens: 30,
    })
  })

  it('expliciet null logt een systeemcall (user_id null) zonder getUser', async () => {
    const { client, getUser } = fakeSupabase('sessie-user')
    await logAiTokens({ supabase: client, ...base, usage, userId: null })

    expect(getUser).not.toHaveBeenCalled()
    expect(insertedRow().user_id).toBeNull()
  })

  it('undefined valt terug op getUser (niet-omgezette aanroeper)', async () => {
    const { client, getUser } = fakeSupabase('sessie-user')
    await logAiTokens({ supabase: client, ...base, usage })

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(insertedRow().user_id).toBe('sessie-user')
  })

  it('een falende getUser in de fallback breekt niets en logt niets', async () => {
    const getUser = vi.fn(async () => {
      throw new Error('sessie weg')
    })
    await expect(
      logAiTokens({ supabase: { auth: { getUser } } as never, ...base, usage }),
    ).resolves.toBeUndefined()
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('tokenLoggingMiddleware — geeft userId door', () => {
  it('wrapGenerate logt met de meegegeven userId, zonder getUser', async () => {
    const { client, getUser } = fakeSupabase('sessie-user')
    const mw = tokenLoggingMiddleware({ supabase: client, ...base, userId: 'aanroeper-user' })

    const doGenerate = vi.fn(async () => ({ usage }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mw.wrapGenerate as any)({ doGenerate })
    // log is fire-and-forget — één microtask-ronde laten lopen
    await new Promise((r) => setTimeout(r, 0))

    expect(getUser).not.toHaveBeenCalled()
    expect(insertedRow().user_id).toBe('aanroeper-user')
  })

  it('wrapStream logt bij finish met expliciet null, zonder getUser', async () => {
    const { client, getUser } = fakeSupabase('sessie-user')
    const mw = tokenLoggingMiddleware({ supabase: client, ...base, userId: null })

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', delta: 'hoi' })
        controller.enqueue({ type: 'finish', usage })
        controller.close()
      },
    })
    const doStream = vi.fn(async () => ({ stream: source }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { stream } = await (mw.wrapStream as any)({ doStream })
    const reader = (stream as ReadableStream).getReader()
    while (!(await reader.read()).done) {
      // stream leegtrekken
    }
    await new Promise((r) => setTimeout(r, 0))

    expect(getUser).not.toHaveBeenCalled()
    expect(insertedRow().user_id).toBeNull()
  })
})
