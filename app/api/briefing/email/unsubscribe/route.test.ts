import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signUnsubscribeToken } from '@/lib/briefing/email-token'

/**
 * Tests voor /api/briefing/email/unsubscribe:
 *   - geldig token → pref false gezet voor precies die uid (200);
 *   - geknoeid/ongeldig token → 400 zonder mutatie;
 *   - POST (RFC 8058 one-click) → 200 json bij geldig token.
 */

const updates: Array<{ payload: unknown; filterId: unknown }> = []

function makeService() {
  function from() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      update: (payload: unknown) => {
        b._payload = payload
        return b
      },
      eq: (_col: string, val: unknown) => {
        updates.push({ payload: b._payload, filterId: val })
        return Promise.resolve({ error: null })
      },
    }
    return b
  }
  return { from }
}

vi.mock('@/lib/supabase/service', () => ({ getServiceClient: () => makeService() }))

import { GET, POST } from './route'

const SECRET = 'unsub-secret'
const UID = 'a1b2c3d4-0000-4000-8000-000000000009'
const ORIG = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  process.env.EMAIL_UNSUB_SECRET = SECRET
  process.env.NEXT_PUBLIC_APP_URL = 'https://trifinity.app'
})

afterEach(() => {
  process.env = { ...ORIG }
})

function url(token: string | null): Request {
  const q = token === null ? '' : `?token=${encodeURIComponent(token)}`
  return new Request(`https://x.test/api/briefing/email/unsubscribe${q}`)
}

describe('unsubscribe GET', () => {
  it('geldig token → 200 + pref false voor die uid', async () => {
    const token = signUnsubscribeToken(UID, SECRET)
    const res = await GET(url(token))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ weekly_briefing_email: false })
    expect(updates[0].filterId).toBe(UID)
  })

  it('geknoeid token → 400 zonder mutatie', async () => {
    const token = signUnsubscribeToken(UID, SECRET)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    const res = await GET(url(tampered))
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('ontbrekend token → 400 zonder mutatie', async () => {
    const res = await GET(url(null))
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })
})

describe('unsubscribe POST (one-click)', () => {
  it('geldig token → 200 json success', async () => {
    const token = signUnsubscribeToken(UID, SECRET)
    const res = await POST(url(token))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].filterId).toBe(UID)
  })

  it('ongeldig token → 400 zonder mutatie', async () => {
    const res = await POST(url('rommel.zonderhandtekening'))
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })
})
