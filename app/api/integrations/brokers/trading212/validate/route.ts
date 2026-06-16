// POST /api/integrations/brokers/trading212/validate
//
// Stateless probe: takes the same key as /connect but only runs the adapter
// validation and returns the result. Used by the "Test verbinding" button so
// the user can confirm their key works before committing it to storage.
//
// Privacy: the supplied credential is NEVER stored, hashed, or logged. The
// response is a plain { ok, error?, code? } shape — no echo of the input.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBrokerAdapter } from '@/lib/integrations/broker-adapter'

const MIN_KEY_LEN = 16

// Literal `trading212/` folder → no `[broker]` param. Fixed to 'trading212',
// mirroring the literal `bitvavo/` validate route.
const BROKER = 'trading212' as const

interface ValidateBody {
  apiKey?: unknown
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
  if (apiKey.length < MIN_KEY_LEN) {
    return NextResponse.json({ ok: false, error: 'API-key is vereist.' }, { status: 400 })
  }

  let adapter
  try {
    adapter = getBrokerAdapter(BROKER)
  } catch {
    return NextResponse.json({ ok: false, error: 'Broker wordt niet ondersteund.' }, { status: 400 })
  }

  const result = await adapter.validateCredentials(apiKey)
  return NextResponse.json({
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    ...(result.code ? { code: result.code } : {}),
  })
}
