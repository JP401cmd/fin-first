import type { SupabaseClient } from '@supabase/supabase-js'

export type ContractEventKind = 'format_drift' | 'contract_violation' | 'version_watch'
export type ContractEventSeverity = 'info' | 'warn' | 'error'

/**
 * Schrijf één contractdrift-event weg in `contract_events` via de atomaire
 * RPC `increment_contract_event`.
 *
 * Bewust defensief: logging mag een sync of upload NOOIT laten falen. Een
 * ontbrekende tabel, netwerkprobleem of RPC-fout wordt stil ingeslikt —
 * de aanroepende flow blijft altijd leidend. `service` is de service-role-
 * client (omzeilt RLS); nooit de interactieve Supabase-sessieclient doorgeven.
 *
 * Privacy by construction: geef in `fingerprint` en `diff` uitsluitend
 * kolom/header-NAMEN of structurele hashes mee — nooit financiële waarden
 * of transactierijen.
 */
export async function recordContractEvent(
  service: SupabaseClient,
  params: {
    kind: ContractEventKind
    surface: string
    severity: ContractEventSeverity
    /** Structurele hash van kolom/header-namen — geen ruwe data. */
    fingerprint: string
    /** Alleen kolom/header-NAMEN als object of array; nooit transactierijen. */
    diff?: unknown
  },
): Promise<void> {
  try {
    await service.rpc('increment_contract_event', {
      p_kind:        params.kind,
      p_surface:     params.surface,
      p_severity:    params.severity,
      p_fingerprint: params.fingerprint,
      p_diff:        params.diff ?? null,
    })
  } catch {
    // Logging mag een sync of upload nooit breken.
  }
}
