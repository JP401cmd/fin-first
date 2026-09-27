import { createClient } from '@/lib/supabase/server'
import { brokerConnectionLabel, loadBrokerConnectionsForUser } from '@/lib/broker-connections-data'
import type { BrokerAutoSyncCandidate } from '@/lib/sync/auto-sync'
import { AutomatischBijwerken } from './automatisch-bijwerken'

/**
 * Server-kant van het automatische bijwerken bij openen (W-018, ADR 0182).
 *
 * Hangt in een eigen `<Suspense fallback={null}>` op /overzicht, zodat de
 * broker-leesronde nooit op het kritieke pad van blok 1 ligt. Staat de
 * schakelaar uit, dan doet hij geen enkele query.
 *
 * Alleen PUBLIEKE kolommen gaan naar de client: `loadBrokerConnectionsForUser`
 * selecteert nooit de versleutelde sleutel of de hash, filtert op de eigen
 * `user_id`, en hier gaat daar nog eens alleen id/label/stempel/fout van door —
 * de RSC-payload serialiseert elke prop volledig.
 */
export async function AutomatischBijwerkenLoader({
  enabled,
  userId,
}: {
  enabled: boolean
  userId: string
}) {
  if (!enabled) return null

  const supabase = await createClient()
  const rows = await loadBrokerConnectionsForUser(supabase)
  const brokers: BrokerAutoSyncCandidate[] = rows.map((row) => ({
    id: row.id,
    label: brokerConnectionLabel(row),
    lastSyncedAt: row.lastSyncedAt,
    lastSyncError: row.lastSyncError,
  }))

  return <AutomatischBijwerken enabled userId={userId} brokers={brokers} />
}
