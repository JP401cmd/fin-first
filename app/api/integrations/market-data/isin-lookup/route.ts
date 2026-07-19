// GET /api/integrations/market-data/isin-lookup?isin=NL0000xxxxxx
//
// Server-side proxy in front of the Financial Modeling Prep ISIN-resolver.
// The FMP_API_KEY never reaches the client — only the resolved ticker, name,
// currency and exchange are returned.
//
// Headers:
//   x-cache: hit | miss   (true cache hit on the FMP module-level cache)
//
// Status codes:
//   200 — ISIN resolved
//   400 — Missing or malformed ISIN
//   401 — Not signed in
//   404 — ISIN not found upstream
//   429 — Either the per-user lookup budget OR the shared FMP daily quota
//         is exhausted. The response body discriminates between the two.
//   503 — FMP_API_KEY is not configured server-side

import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  FmpNotConfiguredError,
  FmpQuotaExhaustedError,
  isValidIsinShape,
  lookupIsin,
  normalizeIsin,
} from '@/lib/integrations/fmp-client'

// Per-user daily budget so a single user can't burn the shared FMP quota.
const USER_DAILY_LIMIT = 50

interface UserCounter {
  utcDayKey: string
  count: number
}

const userCounters = new Map<string, UserCounter>()

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function bumpUserCounter(userId: string): { allowed: boolean; count: number } {
  const today = utcDayKey(new Date())
  const existing = userCounters.get(userId)
  if (!existing || existing.utcDayKey !== today) {
    userCounters.set(userId, { utcDayKey: today, count: 1 })
    return { allowed: true, count: 1 }
  }
  if (existing.count >= USER_DAILY_LIMIT) {
    return { allowed: false, count: existing.count }
  }
  existing.count += 1
  return { allowed: true, count: existing.count }
}

function decrementUserCounter(userId: string): void {
  // Roll back when the upstream call short-circuited (e.g. cache hit). This
  // keeps the per-user budget honest — only network calls count.
  const today = utcDayKey(new Date())
  const existing = userCounters.get(userId)
  if (!existing || existing.utcDayKey !== today) return
  existing.count = Math.max(0, existing.count - 1)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip
  // (ADR 0052). Pure read: claims.sub scoopt alleen de in-memory quota-teller.
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const rawIsin = request.nextUrl.searchParams.get('isin') ?? ''
  const isin = normalizeIsin(rawIsin)

  if (!isin) {
    return NextResponse.json({ error: 'ISIN ontbreekt' }, { status: 400 })
  }
  if (!isValidIsinShape(isin)) {
    return NextResponse.json(
      { error: 'Ongeldige ISIN — verwacht 12 tekens, bijv. NL0011794037.' },
      { status: 400 },
    )
  }

  const budget = bumpUserCounter(claims.sub)
  if (!budget.allowed) {
    return NextResponse.json(
      { error: 'Je dagelijkse ISIN-zoekbudget is bereikt. Vul ticker en naam handmatig in.', reason: 'user_quota' },
      { status: 429 },
    )
  }

  try {
    // The FMP client maintains its own module-level cache. We treat a "no
    // network call happened" as a cache hit, so any time the call resolves
    // before the FMP daily counter is touched we can refund the user budget.
    const beforeCalls = (await import('@/lib/integrations/fmp-client')).getFmpQuotaStatus().callsToday
    const result = await lookupIsin(isin)
    const afterCalls = (await import('@/lib/integrations/fmp-client')).getFmpQuotaStatus().callsToday
    const cacheHit = afterCalls === beforeCalls

    if (cacheHit) {
      decrementUserCounter(claims.sub)
    }

    if (!result) {
      return NextResponse.json(
        { error: 'ISIN niet gevonden', reason: 'not_found' },
        { status: 404, headers: { 'x-cache': cacheHit ? 'hit' : 'miss' } },
      )
    }

    return NextResponse.json(result, {
      headers: { 'x-cache': cacheHit ? 'hit' : 'miss' },
    })
  } catch (err) {
    decrementUserCounter(claims.sub)
    if (err instanceof FmpNotConfiguredError) {
      return NextResponse.json(
        { error: 'ISIN-resolver is niet geconfigureerd op deze server.', reason: 'not_configured' },
        { status: 503 },
      )
    }
    if (err instanceof FmpQuotaExhaustedError) {
      return NextResponse.json(
        {
          error: 'ISIN-resolver vandaag uitgeput — vul handmatig in. Probeer morgen opnieuw.',
          reason: 'fmp_quota',
        },
        { status: 429 },
      )
    }
    return NextResponse.json({ error: 'ISIN-lookup mislukt' }, { status: 502 })
  }
}
