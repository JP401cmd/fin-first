import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { aggregateDividends } from '@/lib/dividends/aggregate'

/**
 * GET /api/dividends
 *
 * Returns aggregate dividend data across all holdings:
 * - Per-holding dividend summaries with yield, history, projected annual income
 * - Aggregate totals: total dividend income, projected annual income
 * - Freedom-day equivalent of dividend income
 *
 * De aggregatielogica leeft in `lib/dividends/aggregate.ts` (één bron van
 * waarheid) — zowel deze route als de server-side horizon-loader consumeren
 * die zodat de cijfers byte-identiek zijn.
 *
 * Query params:
 *   ?holding_id=<uuid>  — optional, filter to single holding
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const holdingIdFilter = request.nextUrl.searchParams.get('holding_id')

  try {
    const result = await aggregateDividends(supabase, {
      userId: user.id,
      holdingIdFilter,
    })
    return NextResponse.json(result)
  } catch (err) {
    return serverError(err, 'dividends:GET')
  }
}
