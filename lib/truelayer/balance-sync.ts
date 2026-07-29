import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountBalance } from './client'
import type { TLBalance } from './types'

export type BalanceSyncResult = {
  /** Rauwe TrueLayer-saldi, zoals de balances-route ze bij uitblijvende sync teruggeeft. */
  balances: TLBalance[]
  /** Gevuld zodra het saldo daadwerkelijk is weggeschreven; null als er niets te schrijven viel. */
  synced: { balance: number; currency: string } | null
}

/**
 * Haalt het saldo bij TrueLayer op en schrijft het weg naar `bank_accounts.balance`
 * én — via `linked_asset_id` — naar de gekoppelde cash-asset, zodat het saldo in
 * één keer klopt op de Kas-pagina én in het netto vermogen.
 *
 * Gedeeld tussen de balances-route (expliciete saldo-verversing) en de sync-route
 * (saldo hoort bij elke sync, zie de aanroep daar). Eén implementatie: anders
 * dreigt drift tussen "saldo via de knop" en "saldo via de sync" — precies het
 * soort dubbele som dat de bundel-conventie verbiedt.
 *
 * De caller levert een al ontsleuteld/ververst accessToken; deze helper doet
 * bewust geen tokenbeheer en geen rate-limit-boekhouding.
 */
export async function syncAccountBalance(
  supabase: SupabaseClient,
  opts: {
    accessToken: string
    dataUrl: string
    externalAccountId: string
    bankAccountId: string | null
  },
): Promise<BalanceSyncResult> {
  const balances = await getAccountBalance(opts.accessToken, opts.dataUrl, opts.externalAccountId)

  const preferred = balances[0]
  if (!preferred || !opts.bankAccountId) {
    return { balances, synced: null }
  }

  // `current` (niet `available`): het boekhoudkundige saldo is de grootheid die
  // met de transactiereeks meeloopt; `available` verrekent nog niet-geboekte
  // reserveringen en zou het vermogen laten schommelen zonder transactie.
  const balance = preferred.current

  await supabase
    .from('bank_accounts')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('id', opts.bankAccountId)

  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('linked_asset_id')
    .eq('id', opts.bankAccountId)
    .maybeSingle()

  if (bankAccount?.linked_asset_id) {
    await supabase
      .from('assets')
      .update({ current_value: balance, updated_at: new Date().toISOString() })
      .eq('id', bankAccount.linked_asset_id)
  }

  return { balances, synced: { balance, currency: preferred.currency } }
}
