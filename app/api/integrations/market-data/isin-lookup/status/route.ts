// GET /api/integrations/market-data/isin-lookup/status
//
// Returns the current FMP-resolver health for the koppelingen-page status
// card. Auth required so we don't leak quota information publicly.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFmpQuotaStatus } from '@/lib/integrations/fmp-client'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  return NextResponse.json(getFmpQuotaStatus())
}
