/**
 * Shared client-side helper voor het triggeren van een sync op één
 * asset-koppeling (exchange of wallet). Geëxtraheerd uit
 * `components/core/asset-edit-connection-section.tsx` zodat zowel die sectie
 * als de actie-knop op `<VermogenAssetCard>` dezelfde endpoint-resolution +
 * response-parsing delen.
 *
 * Side-effects (toast, lokale state-update, router.refresh) blijven bij de
 * caller — die context verschilt per call-site (de edit-sectie patcht een
 * eigen `connection`-state met `lastSyncedAt`, de card hoeft alleen te
 * refreshen). De helper retourneert dus puur het result-object.
 */

import type { AssetConnectionSummary } from '@/lib/connections-data'

export interface TriggerSyncResult {
  ok: boolean
  /** ISO-timestamp van de afronding zoals de server het meldt. */
  lastSyncedAt?: string
  /** Totaal in EUR — alleen voor exchanges + wallets met balance-resolutie. */
  totalEur?: number
  /** Native balance — alleen voor wallets. */
  nativeBalance?: number
  /** Foutmelding bij `ok === false`. */
  error?: string
}

/**
 * Roept de sync-endpoint aan voor de eerste actieve koppeling in de summary.
 * Per asset bestaat hooguit één van beide (1-op-1 contract, zie R1-migratie),
 * dus exchange heeft voorrang als beide gezet zouden zijn.
 */
export async function triggerAssetSync(
  connection: AssetConnectionSummary,
): Promise<TriggerSyncResult> {
  const isExchange = !!connection.exchange
  const id = (connection.exchange?.id ?? connection.wallet?.id) as string | undefined
  if (!id) {
    return { ok: false, error: 'Geen koppeling om te synchroniseren.' }
  }

  const endpoint = isExchange
    ? `/api/integrations/exchanges/${id}/sync`
    : `/api/integrations/wallets/${id}/sync`

  try {
    const res = await fetch(endpoint, { method: 'POST' })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

    if (!res.ok || json?.status === 'error') {
      const error = typeof json?.error === 'string' ? json.error : 'Synchronisatie mislukt.'
      return { ok: false, error }
    }

    return {
      ok: true,
      lastSyncedAt:
        typeof json?.lastSyncedAt === 'string'
          ? json.lastSyncedAt
          : new Date().toISOString(),
      totalEur: typeof json?.totalEur === 'number' ? json.totalEur : undefined,
      nativeBalance:
        typeof json?.nativeBalance === 'number' ? json.nativeBalance : undefined,
    }
  } catch {
    return { ok: false, error: 'Sync kon niet worden uitgevoerd. Probeer opnieuw.' }
  }
}
