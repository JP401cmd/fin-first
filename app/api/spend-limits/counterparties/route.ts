import { NextResponse } from 'next/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { SPEND_LIMIT_WINDOW_PERIODS } from '@/lib/spend-limits/loader'
import type { SpendLimitCounterpartyOption } from '@/lib/spend-limits/types'

/**
 * GET /api/spend-limits/counterparties — keuzelijst voor een tegenpartij-pot.
 *
 * ON-DEMAND, bewust niet in de pagina-bundel: deze lijst is pas nodig zodra
 * iemand het formulier opent. In de loader zou hij op élke laadbeurt van de
 * transactiepagina een extra aggregaat kosten, ook voor gebruikers die nooit een
 * grenzenpot aanmaken.
 *
 * De bron is de RPC `tx_counterparty_suggestions` — een AGGREGAAT, geen rij-lus:
 * PostgREST kapt elk antwoord af op max_rows (=1000), dus een distinct-over-
 * rijen zou voor tx-rijke gebruikers stil een onvolledige lijst geven. De RPC is
 * SECURITY INVOKER en draait dus onder de RLS van de aanroeper.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const now = new Date()
  const { data, error } = await supabase.rpc('tx_counterparty_suggestions', {
    p_from: localMonthStartMonthsAgo(now, SPEND_LIMIT_WINDOW_PERIODS - 1),
    p_to: localMonthBounds(now).end,
    p_limit: 40,
    p_own_only: false,
  })

  if (error) return serverError(error, 'spend-limits-counterparties:GET')

  const options: SpendLimitCounterpartyOption[] = (
    (data ?? []) as {
      counterparty_key: string
      label: string
      total_uitgegeven: number | string
      count: number | string
    }[]
  ).map((r) => ({
    key: r.counterparty_key,
    label: r.label,
    totalSpentInWindow: Number(r.total_uitgegeven),
    transactionCount: Number(r.count),
  }))

  return NextResponse.json({ options })
}
