import type { SupabaseClient } from '@supabase/supabase-js'

/** Canonieke actie-codes; vrije string toegestaan voor toekomstige acties. */
export type AdminActionName =
  | 'subscription.update'
  | 'user.role'
  | 'user.block'
  | 'user.unblock'
  | 'config.update'

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
