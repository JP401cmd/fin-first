import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'
import {
  errorResponse,
  unauthorized,
  forbidden,
  badRequest,
  notFound,
  conflict,
  serverError,
} from './respond'
import { parseBody } from './parse-body'

async function readBody(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: await res.json() }
}

describe('respond helpers', () => {
  afterEach(() => vi.restoreAllMocks())

  it('errorResponse produces flat { error } without code by default', async () => {
    const { status, body } = await readBody(errorResponse('boom', 418))
    expect(status).toBe(418)
    expect(body).toEqual({ error: 'boom' })
  })

  it('errorResponse includes code only when given', async () => {
    const { body } = await readBody(errorResponse('boom', 400, 'my_code'))
    expect(body).toEqual({ error: 'boom', code: 'my_code' })
  })

  it('unauthorized → 401 with default NL text', async () => {
    const { status, body } = await readBody(unauthorized())
    expect(status).toBe(401)
    expect(body.error).toBe('Niet ingelogd')
    expect(body.code).toBe('unauthorized')
  })

  it('forbidden → 403', async () => {
    const { status } = await readBody(forbidden())
    expect(status).toBe(403)
  })

  it('badRequest → 400 with message', async () => {
    const { status, body } = await readBody(badRequest('slecht'))
    expect(status).toBe(400)
    expect(body.error).toBe('slecht')
  })

  it('notFound → 404', async () => {
    const { status } = await readBody(notFound())
    expect(status).toBe(404)
  })

  it('conflict → 409', async () => {
    const { status } = await readBody(conflict('dubbel'))
    expect(status).toBe(409)
  })

  it('serverError → 500 with generic text, does NOT leak the raw message, logs with tag', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status, body } = await readBody(
      serverError(new Error('SELECT * blew up: column x does not exist'), 'test:route'),
    )
    expect(status).toBe(500)
    // De rauwe DB-boodschap mag NIET in de response-body staan.
    expect(JSON.stringify(body)).not.toContain('column x does not exist')
    expect(body.error).not.toContain('SELECT')
    expect(body.code).toBe('server_error')
    // Wel server-side gelogd met de tag.
    expect(spy).toHaveBeenCalled()
    expect(String(spy.mock.calls[0][0])).toContain('[test:route]')
  })

  it('serverError accepts an explicit upstream status (502)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status } = await readBody(serverError(new Error('upstream'), 'x', 'Kon niet ophalen', 502))
    expect(status).toBe(502)
  })
})

describe('parseBody', () => {
  const Schema = z.object({ name: z.string().min(1), age: z.number() })

  function reqWith(body: unknown): Request {
    return new Request('http://x/api/test', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns typed data on valid body', async () => {
    const parsed = await parseBody(Schema, reqWith({ name: 'Jan', age: 30 }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.name).toBe('Jan')
  })

  it('returns a 400 response on invalid body', async () => {
    const parsed = await parseBody(Schema, reqWith({ name: '', age: 'nope' }))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      const { status, body } = await readBody(parsed.response)
      expect(status).toBe(400)
      expect(body.code).toBe('validation_error')
    }
  })

  it('returns a 400 response on malformed JSON', async () => {
    const badReq = new Request('http://x/api/test', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const parsed = await parseBody(Schema, badReq)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      const { status } = await readBody(parsed.response)
      expect(status).toBe(400)
    }
  })
})
