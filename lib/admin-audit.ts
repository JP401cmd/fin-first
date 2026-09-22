import type { SupabaseClient } from '@supabase/supabase-js'

/** Canonieke actie-codes; vrije string toegestaan voor toekomstige acties. */
export type AdminActionName =
  | 'subscription.update'
  | 'user.role'
  | 'user.block'
  | 'user.unblock'
  | 'user.activity'
  | 'config.update'
  | 'questionnaire.verspreiding'
  | 'group.create'
  | 'group.update'
  | 'group.delete'
  | 'group.leden'
  | 'allowlist.add'
  | 'allowlist.remove'
  // ADR 0171 / Krant 1A fase 2: beheer trekt een duiding terug (B4) of laat hem opnieuw duiden.
  | 'nieuws.duiding.terugtrekken'
  | 'nieuws.duiding.opnieuw'
  | 'nieuws.artikel.verwijderen'
  // Krant 1F fase 2: beheer legt de wekelijkse G7-steekproef vast. Het register
  // bewaart alleen de laatste telling per week, dus een overschrijving moet hier
  // een spoor achterlaten — G7 is de menselijke helft van een release-poort.
  | 'nieuws.duiding.steekproef'

/**
 * Schrijf één beheeractie weg in `admin_actions_log`.
 *
 * Defensief: audit-logging mag een beheeractie NOOIT laten falen. Elke fout
 * (ontbrekende tabel, RLS, netwerk) wordt stil ingeslikt. `client` mag de
 * service-role-client zijn (omzeilt RLS) of de ingelogde superadmin-client
 * (RLS staat insert toe) — beide werken.
 */
export async function logAdminAction(
  client: SupabaseClient,
  params: {
    actorId: string
    actorEmail?: string | null
    action: AdminActionName | string
    targetUser?: string | null
    targetLabel?: string | null
    detail?: unknown
  },
): Promise<void> {
  try {
    await client.from('admin_actions_log').insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail ?? null,
      action: params.action,
      target_user: params.targetUser ?? null,
      target_label: params.targetLabel ?? null,
      detail: params.detail ?? null,
    })
  } catch {
    // Audit-logging mag een beheeractie nooit breken.
  }
}
