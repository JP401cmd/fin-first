import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  allowServerErrorLog,
  resetServerErrorThrottle,
  buildServerErrorLog,
  captureServerError,
  errorClassOf,
  maskErrorMessage,
  stackFramesOnly,
} from './server-error-log'

function fakeClient() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const client = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient
  return { client, insert }
}

describe('maskErrorMessage', () => {
  it('haalt waarden weg en laat schema-namen staan', () => {
    expect(maskErrorMessage('column "iban_encrypted" does not exist')).toBe('column "iban_encrypted" does not exist')
    expect(maskErrorMessage('duplicate key value violates unique constraint "profiles_email_key"')).toBe(
      'duplicate key value violates unique constraint "profiles_email_key"',
    )
    expect(maskErrorMessage('invalid input syntax for type uuid: "jan de vries"')).toBe(
      'invalid input syntax for type uuid: "…"',
    )
  })

  it('maskeert e-mail, IBAN, uuid, bedragen en =(…)-waarden', () => {
    const m = maskErrorMessage(
      'faal voor jan@example.nl op NL91ABNA0417164300 id 3f2b1c4e-1111-2222-3333-444455556666 bedrag 1.234,56 Key (x)=(geheim)',
    )
    expect(m).not.toMatch(/jan@example|NL91ABNA|3f2b1c4e|1\.234|geheim/)
    expect(m).toContain('[email]')
    expect(m).toContain('[iban]')
    expect(m).toContain('[id]')
    expect(m).toContain('[n]')
    expect(m).toContain('=(…)')
  })

  it('een waarde na een schema-woord blijft alleen staan als hij de vorm van een identifier heeft', () => {
    expect(maskErrorMessage('Onbekend type "Salaris Jan de Vries"')).toBe('Onbekend type "…"')
    expect(maskErrorMessage('unknown role "petra.devries@x"')).not.toContain('petra')
    expect(maskErrorMessage('relation "public.budgets" does not exist')).toBe('relation "public.budgets" does not exist')
  })

  it('maskeert ook typografische quotes, backticks, %40-e-mail, IBAN met spaties en een afgekapte quote', () => {
    const m = maskErrorMessage('budget “Zorg Petra” en `AAPL Jan` voor jan%40example.nl rekening NL91 ABNA 0417 1643 00')
    expect(m).not.toMatch(/Petra|AAPL Jan|jan%40|ABNA|0417/)
    expect(maskErrorMessage('upstream gaf {"naam":"Jan de Vr')).not.toContain('Jan')
  })

  it('een aangehaalde waarde met een regeleinde gaat óók weg', () => {
    expect(maskErrorMessage('Onbekend budget "Jan\nde Vries"')).toBe('Onbekend budget "…"')
  })

  it('blijft lineair op enorme invoer en kapt een half woord op de knip af', () => {
    const t0 = performance.now()
    const uit = maskErrorMessage('a'.repeat(1_000_000))
    expect(performance.now() - t0).toBeLessThan(50)
    expect(uit.length).toBeLessThanOrEqual(301)
    const met = maskErrorMessage(`${'x '.repeat(598)}jan.devries@example.nl rest`)
    expect(met).not.toMatch(/jan|devries/)
  })

  it('laat korte getallen (statuscodes) staan en kapt af op 300 tekens', () => {
    expect(maskErrorMessage('upstream gaf 429')).toBe('upstream gaf 429')
    expect(maskErrorMessage('x'.repeat(500))).toHaveLength(301)
  })
})

describe('errorClassOf / stackFramesOnly', () => {
  it('onderscheidt Error-subklassen, PostgREST-vormen en primitieven', () => {
    expect(errorClassOf(new TypeError('x'))).toBe('TypeError')
    expect(errorClassOf({ code: '23505', message: 'dup' })).toBe('PostgrestError')
    expect(errorClassOf('boom')).toBe('string')
  })

  it('bewaart alleen de at-frames, niet de kopregel met de melding', () => {
    const stack = 'Error: jan@example.nl kapot\n    at foo (a.ts:1:1)\n    at bar (b.ts:2:2)'
    expect(stackFramesOnly(stack)).toBe('    at foo (a.ts:1:1)\n    at bar (b.ts:2:2)')
    expect(stackFramesOnly(undefined)).toBeUndefined()
  })

  it('een meldingsregel die met "at" begint maar geen frame is, valt weg', () => {
    const stack = 'Error: kop\n    at Jan de Vries woont hier\n    at foo (a.ts:1:1)\n    at new Promise (<anonymous>)'
    expect(stackFramesOnly(stack)).toBe('    at foo (a.ts:1:1)\n    at new Promise (<anonymous>)')
  })
})

describe('allowServerErrorLog — throttle', () => {
  beforeEach(() => resetServerErrorThrottle())

  it('hooguit 20 rijen per tag per minuut, daarna weer open', () => {
    const t0 = 1_000_000
    const toegestaan = Array.from({ length: 25 }, () => allowServerErrorLog('x:GET', t0)).filter(Boolean)
    expect(toegestaan).toHaveLength(20)
    expect(allowServerErrorLog('y:GET', t0)).toBe(true) // per tag
    expect(allowServerErrorLog('x:GET', t0 + 60_000)).toBe(true)
  })
})

describe('buildServerErrorLog', () => {
  it('draagt tag, klasse, pg-code en status; nooit details of hint', () => {
    const log = buildServerErrorLog(
      { code: '23505', message: 'duplicate key value', details: 'Key (email)=(jan@example.nl) already exists', hint: 'geheim' },
      'profiles:PUT',
      500,
    )
    expect(log.context).toBe('serverError:profiles:PUT')
    expect(log.message).toBe('PostgrestError 23505 · 500 · duplicate key value')
    expect(JSON.stringify(log)).not.toMatch(/jan@example|geheim/)
  })
})

describe('captureServerError', () => {
  beforeEach(() => resetServerErrorThrottle())
  afterEach(() => vi.unstubAllEnvs())

  it('schrijft in productie één gemaskeerde rij zonder user_id of url', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const { client, insert } = fakeClient()
    await captureServerError(new Error('kapot voor jan@example.nl'), 'x:GET', 502, { getClient: () => client })
    expect(insert).toHaveBeenCalledTimes(1)
    const row = insert.mock.calls[0][0]
    expect(row.context).toBe('serverError:x:GET')
    expect(row.message).toBe('Error · 502 · kapot voor [email]')
    expect(row.user_id).toBeNull()
    expect(row.url).toBeNull()
  })

  it('schrijft lokaal niets en tuigt geen client op', async () => {
    vi.stubEnv('VERCEL_ENV', 'development')
    const getClient = vi.fn()
    await captureServerError(new Error('x'), 'x:GET', 500, { getClient })
    expect(getClient).not.toHaveBeenCalled()
  })

  it('gooit nooit, ook niet als de client faalt', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    await expect(
      captureServerError(new Error('x'), 'x:GET', 500, {
        getClient: () => {
          throw new Error('geen env')
        },
      }),
    ).resolves.toBeUndefined()
  })
})
