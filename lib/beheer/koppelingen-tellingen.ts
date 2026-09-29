import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Platform-brede tellingen van gebruikerskoppelingen: hoeveel zijn er, en
 * hoeveel dragen een sync-fout. Gedeeld door `/beheer/integraties` en het
 * beheerdashboard.
 *
 * Operator-telemetrie achter een superadmin-check: alleen COUNT (`head: true`),
 * nooit rij-payloads. Vereist de service-role (ADR 0006).
 */

export const KOPPELING_TABELLEN = [
  'exchange_connections',
  'broker_connections',
  'wallet_addresses',
  'bank_connections',
] as const
export type KoppelingTabel = (typeof KOPPELING_TABELLEN)[number]

export const KOPPELING_TABEL_LABEL: Record<KoppelingTabel, string> = {
  exchange_connections: 'Exchanges',
  broker_connections: 'Brokers',
  wallet_addresses: 'Wallets',
  bank_connections: 'Bankkoppelingen',
}

// Niet alle tabellen hebben een last_sync_error-kolom.
// Verificatie via migraties (supabase/migrations/):
//   exchange_connections  → 20260501000001: heeft last_sync_error ✓
//   wallet_addresses      → 20260501000001: heeft last_sync_error ✓
//   broker_connections    → 20260616010000: heeft last_sync_error ✓
//   bank_connections      → enkel ALTER TABLE in 20260408000001, geen last_sync_error ✗
const TABELLEN_MET_SYNCFOUT_KOLOM: ReadonlySet<KoppelingTabel> = new Set([
  'exchange_connections',
  'broker_connections',
  'wallet_addresses',
])

export interface KoppelingTelling {
  total: number
  /** 0 als de tabel geen sync-fout-kolom heeft; lees dan `syncfoutGemeten`. */
  withError: number
  /**
   * false = voor deze tabel is geen sync-fout per koppeling bekend. `withError: 0`
   * betekent dan "niet gemeten", niet "geen fouten". De reden staat in
   * `syncfoutLeesfout`.
   */
  syncfoutGemeten: boolean
  /**
   * true = de tabel legt de fout wél vast, maar de telling kon niet worden
   * gelezen. Dat is een mislukte meting, iets anders dan een tabel zonder
   * foutkolom.
   */
  syncfoutLeesfout: boolean
}

/** `null` per tabel = de telling kon niet worden gelezen. */
export type KoppelingTellingen = Record<KoppelingTabel, KoppelingTelling | null>

export async function loadKoppelingTellingen(service: SupabaseClient): Promise<KoppelingTellingen> {
  const uit = {} as KoppelingTellingen

  await Promise.all(
    KOPPELING_TABELLEN.map(async (table) => {
      try {
        const syncfoutGemeten = TABELLEN_MET_SYNCFOUT_KOLOM.has(table)
        const [totalRes, errorRes] = await Promise.all([
          service.from(table).select('id', { count: 'exact', head: true }),
          // Alleen queriën als de kolom bestaat — anders geeft Supabase een 400.
          syncfoutGemeten
            ? service
                .from(table)
                .select('id', { count: 'exact', head: true })
                .not('last_sync_error', 'is', null)
            : Promise.resolve({ count: 0, error: null }),
        ])
        if (totalRes.error) {
          uit[table] = null
          return
        }
        uit[table] = {
          total: totalRes.count ?? 0,
          withError: errorRes.error ? 0 : (errorRes.count ?? 0),
          // Een gefaalde fout-telling is óók "niet gemeten": anders leest een
          // leesfout als nul fouten.
          syncfoutGemeten: syncfoutGemeten && !errorRes.error,
          syncfoutLeesfout: syncfoutGemeten && Boolean(errorRes.error),
        }
      } catch {
        uit[table] = null
      }
    }),
  )

  return uit
}
