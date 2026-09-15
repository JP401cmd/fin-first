import type { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { forbidden, unauthorized } from '@/lib/api/respond'

/**
 * Ingelogd-én-superadmin poort voor beheer-routes: 401 zonder sessie, 403
 * zonder rol. Spiegelt het `gate()`-patroon van
 * `app/api/admin/questionnaires/[id]/verspreiding/route.ts`.
 *
 * Eerst de poort, dan pas iets anders: een route die de service-role gebruikt,
 * maakt die client pas aan ná `ok: true`, zodat een niet-superadmin nooit een
 * service-role-aanroep kan uitlokken.
 */
export type SuperadminGate =
  | { ok: true; supabase: SupabaseClient; userId: string; userEmail: string | null }
  | { ok: false; response: NextResponse }

export async function superadminGate(): Promise<SuperadminGate> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true, supabase, userId: user.id, userEmail: user.email ?? null }
}
