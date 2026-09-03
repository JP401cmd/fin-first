import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from './log-error'

/**
 * `logError` is de gedeelde SINK van het server-schrijfpad naar `error_logs`
 * (captureRequestError + de snapshot-routes). De dev/prod-guard hoort daarom
 * hier — één plek dekt elke server-side aanroeper.
 *
 * Vitest draait zonder VERCEL_ENV en met NODE_ENV='test': dat is per definitie
 * "aantoonbaar lokaal", dus elke test die een insert verwacht stubt de omgeving
 * expliciet. Dat is geen testkunstje maar precies het gedrag dat we willen —
 * een testrun schrijft niets in de productie-inbox.
 */

function makeMockClient() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('logError — dev/prod-guard', () => {
  it('persisteert in productie', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { client, from, insert } = makeMockClient()
    await logError(client, { context: 'x:POST', message: 'boom' })
    expect(from).toHaveBeenCalledWith('error_logs')
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('persisteert ook op een preview-deploy', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { client, insert } = makeMockClient()
    await logError(client, { context: 'x:POST', message: 'boom' })
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('persisteert NIET vanuit een lokale ontwikkelomgeving', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { client, from, insert } = makeMockClient()
    await logError(client, { context: 'x:POST', message: 'boom' })
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('laat de lokale fout niet stil vallen — hij gaat naar de console', async () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')
    const { client } = makeMockClient()
    await logError(client, { context: 'x:POST', message: 'boom' })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('boom'))
  })

  it('blijft defensief: een kapotte client mag de aanroeper nooit breken', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const throwing = {
      from: () => {
        throw new Error('db weg')
      },
    } as unknown as SupabaseClient
    await expect(logError(throwing, { message: 'boom' })).resolves.toBeUndefined()
  })
})
