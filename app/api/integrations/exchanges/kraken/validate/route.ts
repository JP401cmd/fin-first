// POST /api/integrations/exchanges/kraken/validate
//
// Stateless probe: takes the same body as /connect but only runs the adapter
// validation and returns the result. Used by the AddExchangeModal "Test
// verbinding" button so the user can confirm their key works before
// committing it to storage.
//
// Privacy: the supplied credentials are NEVER stored, hashed, or logged. The
// response is a plain { ok, error?, code? } shape — no echo of the input.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getExchangeAdapter } from '@/lib/integrations/exchange-adapter'

const MIN_KEY_LEN = 16
const MIN_SECRET_LEN = 16

interface ValidateBody {
  apiKey?: unknown
  apiSecret?: unknown
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: ValidateBody
  try {
    body = (await request.json()) as ValidateBody
  } catch {
    return NextResponse.json({ ok: false, error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const apiKey = safeString(body.apiKey)
  const apiSecret = safeString(body.apiSecret)

  if (apiKey.length < MIN_KEY_LEN || apiSecret.length < MIN_SECRET_LEN) {
    return NextResponse.json({ ok: false, error: 'API-key en private key zijn vereist.' }, { status: 400 })
  }

  const adapter = getExchangeAdapter('kraken')
  const result = await adapter.validateCredentials(apiKey, apiSecret)
  return NextResponse.json({
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    ...(result.code ? { code: result.code } : {}),
  })
}
