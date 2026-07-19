import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'

/**
 * GET /api/subscriptions
 *
 * Detects recurring expense patterns from the last 12 months of transaction
 * history (plus confirmed recurring_transactions). Returns subscriptions and
 * fixed costs (vaste kosten) with monthly cost totals.
 *
 * De detectie-/classificatie-logica leeft in `lib/vaste-lasten-summary.ts`
 * zodat de cashflow-landingskaart exact hetzelfde totaal kan tonen.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip
    // (ADR 0051). loadVasteLastenSummary() doet zelf nog een interne getUser()-
    // call (gedeelde lib, buiten deze route) — ongewijzigd.
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const summary = await loadVasteLastenSummary(supabase)
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[/api/subscriptions]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
