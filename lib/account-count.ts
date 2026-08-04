// lib/account-count.ts
//
// Aantal ZICHTBARE actieve bankrekeningen voor het gekozen perspectief — als
// count-query (`head: true`), dus zonder ook maar één rij op te halen.
//
// Waarom apart: /overzicht/cashflow/transacties draaide voor dit ENE getal (de
// koppel-banner) de volledige `loadCashflowData` — perspectief-keten, 6 maanden
// transactiepaginatie, recurring-detectie en een 500-rijen join-fetch. Pagina's
// die alleen het aantal nodig hebben, horen alleen het aantal op te halen.
//
// SCOPING = één-op-één die van `loadCashflowData` (lib/cashflow-data-loader.ts,
// `scopedAccounts`), zodat de banner in elk perspectief exact hetzelfde toont:
//   • RLS levert eigen-persoonlijk + gedeeld (huishouden) — voor beide paden
//     identiek, want het is dezelfde tabel onder dezelfde policies.
//   • personal / household → alles wat RLS levert (geen extra filter).
//   • partner              → alleen `ownership = 'shared'`; partner-persoonlijke
//                            rekeningen blijven bewust buiten beeld.
// `bank_accounts.ownership` is NOT NULL DEFAULT 'personal' (migratie
// 20260218000001), dus het in-memory `ownership ?? 'personal'` van de loader en
// dit SQL-filter vallen samen — ook als er ooit een NULL zou staan, want
// `ownership = 'shared'` sluit NULL net zo goed uit als de loader dat doet.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'

/**
 * Tel de actieve, in dit perspectief zichtbare bankrekeningen.
 *
 * Geen sessie of een fout op de query → 0, net als het EMPTY-pad respectievelijk
 * de `data ?? []`-terugval van `loadCashflowData`. Auth hoeft niet apart gecheckt
 * te worden: zonder geldige sessie levert RLS eenvoudigweg nul rijen.
 *
 * Een gefaalde telling is wél LUIDRUCHTIG in de logs. De 0-terugval is pariteit
 * met de oude loader en blijft staan (de banner mag niet klappen op een storing),
 * maar 0 is hier niet neutraal: het toont "koppel je rekening" aan iemand die er
 * wél heeft, en dit is sinds de omzetting het enige serverwerk op die pagina —
 * er is geen andere query meer die de storing zou verraden. Zelfde vorm als de
 * decoratie-storing die deze branch eerder luidruchtig maakte. Alleen
 * server-side: de melding bereikt de gebruiker nooit (AVG/security, ADR 0044).
 */
export async function loadAccountCount(
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<number> {
  let query = supabase
    .from('bank_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  if (perspective === 'partner') {
    query = query.eq('ownership', 'shared')
  }

  const { count, error } = await query
  if (error) {
    console.error(
      `[cashflow:account-count] telling faalde (perspectief ${perspective}): ${error.message}`,
    )
    return 0
  }
  return count ?? 0
}
