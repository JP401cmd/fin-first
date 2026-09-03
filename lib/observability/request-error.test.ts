import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureRequestError, isNextControlFlowError } from './request-error'

function makeMockClient() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

beforeEach(() => {
  // Vitest draait zonder VERCEL_ENV en met NODE_ENV='test' — voor de
  // dev/prod-guard is dat "aantoonbaar lokaal". Wie een insert verwacht, moet
  // dus expliciet een deploy-omgeving stellen.
  vi.stubEnv('VERCEL_ENV', 'production')
})

afterEach(() => {
  delete process.env.NEXT_RUNTIME
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('isNextControlFlowError', () => {
  it('herkent redirect/not-found/http-fallback als control-flow', () => {
    expect(isNextControlFlowError({ digest: 'NEXT_REDIRECT;replace;/x' })).toBe(true)
    expect(isNextControlFlowError({ digest: 'NEXT_NOT_FOUND' })).toBe(true)
    expect(isNextControlFlowError({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(true)
  })

  it('een echte fout is geen control-flow', () => {
    expect(isNextControlFlowError(new Error('kapot'))).toBe(false)
    expect(isNextControlFlowError({ digest: 42 })).toBe(false)
    expect(isNextControlFlowError(null)).toBe(false)
  })
})

describe('captureRequestError', () => {
  it('persisteert een echte fout naar error_logs met grep-bare tag', async () => {
    const { client, from, insert } = makeMockClient()
    await captureRequestError(
      new Error('boom'),
      { path: '/api/x', method: 'POST' },
      { routeType: 'route', routerKind: 'App Router' },
      { getClient: () => client },
    )
    expect(from).toHaveBeenCalledWith('error_logs')
    expect(insert).toHaveBeenCalledTimes(1)
    const row = insert.mock.calls[0][0]
    expect(row.context).toBe('onRequestError:route')
    expect(row.message).toBe('boom')
    expect(row.url).toBe('/api/x')
  })

  it('filtert Next control-flow (redirect/not-found) -> geen insert', async () => {
    const { client, insert } = makeMockClient()
    await captureRequestError(
      { digest: 'NEXT_REDIRECT;replace;/login' },
      { path: '/x' },
      { routeType: 'render' },
      { getClient: () => client },
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('doet niets op een niet-node-runtime (edge-guard)', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    const { client, insert } = makeMockClient()
    await captureRequestError(new Error('boom'), { path: '/x' }, { routeType: 'route' }, {
      getClient: () => client,
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('doet niets vanuit een lokale ontwikkelomgeving (dev/prod-guard)', async () => {
    // Regressie: een `next dev` tegen de productie-Supabase zette Turbopack/HMR-
    // ruis in error_logs en ondermijnde /beheer/errors als productiesignaal.
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { client, from, insert } = makeMockClient()
    await captureRequestError(new Error('boom'), { path: '/x' }, { routeType: 'route' }, {
      getClient: () => client,
    })
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('een preview-deploy logt wél — de guard mag de inbox niet blind maken', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { client, insert } = makeMockClient()
    await captureRequestError(new Error('boom'), { path: '/x' }, { routeType: 'route' }, {
      getClient: () => client,
    })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('slikt fouten in de client stil in (nooit throwen)', async () => {
    const throwing = {
      from: () => {
        throw new Error('db weg')
      },
    } as unknown as SupabaseClient
    await expect(
      captureRequestError(new Error('boom'), { path: '/x' }, { routeType: 'route' }, {
        getClient: () => throwing,
      }),
    ).resolves.toBeUndefined()
  })
})
