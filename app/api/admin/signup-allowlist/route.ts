import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, conflict, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * Beheer-API voor de registratie-allowlist van de besloten testfase (ADR 0047).
 *
 * De harde poort op accountaanmaak zit in de `before_user_created`-auth-hook;
 * deze route is uitsluitend de superadmin-beheer-UI erachter — lijst tonen,
 * adressen toevoegen en verwijderen. Toegang: superadmin-gate (`isSuperAdmin`
 * op de ingelogde client). Alle DB-toegang loopt via `getServiceClient`
 * (BYPASSRLS, conform ADR 0006 + ADR 0047): de tabel is bewust niet
 * client-leesbaar, dus beheer schrijft/leest server-side achter de rolcheck.
 *
 * Normalisatie is server-side IDENTIEK aan de hook (`lower(trim(email))`), zodat
 * de beheer-match exact overeenkomt met wat de poort bij signup controleert.
 */

const AddSchema = z.object({
  // .trim() vóór .email(): een adres met randspaties is geldig ná normalisatie
  // (AC2) — zonder trim keurt zod het af vóór de normalisatie kan draaien.
  email: z.string().trim().email(),
  label: z.string().max(200).optional(),
})

const RemoveSchema = z.object({
  id: z.string().uuid(),
})

/** Ingelogd-én-superadmin poort; 401 als niet ingelogd, 403 als geen superadmin. */
type GateResult =
  | { ok: true; userId: string; userEmail: string | null }
  | { ok: false; response: NextResponse }

async function gateSuperAdmin(): Promise<GateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true, userId: user.id, userEmail: user.email ?? null }
}

/** GET — de volledige allowlist, nieuwste eerst. */
export async function GET() {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('signup_email_allowlist')
    .select('id, email_normalized, label, created_at')
    .order('created_at', { ascending: false })

  if (error) return serverError(error, 'admin-signup-allowlist:GET')

  return NextResponse.json({ entries: data ?? [] })
}

/** POST — voeg een genormaliseerd adres toe aan de allowlist. */
export async function POST(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(AddSchema, req)
  if (!parsed.ok) return parsed.response
  const { email, label } = parsed.data

  // Server-side normalisatie IDENTIEK aan de before_user_created-hook.
  const emailNormalized = email.trim().toLowerCase()

  const service = getServiceClient()
  const { data: inserted, error } = await service
    .from('signup_email_allowlist')
    .insert({
      email_normalized: emailNormalized,
      label: label?.trim() || null,
      created_by: gate.userId,
    })
    .select('id, email_normalized, label, created_at')
    .single()

  if (error) {
    // Unique-violation op email_normalized: het adres staat er al op.
    if (error.code === '23505') {
      return conflict('Dit adres staat al op de lijst.')
    }
    return serverError(error, 'admin-signup-allowlist:POST')
  }

  await logAdminAction(service, {
    actorId: gate.userId,
    actorEmail: gate.userEmail,
    action: 'allowlist.add',
    targetLabel: inserted.email_normalized,
  })

  return NextResponse.json({ entry: inserted }, { status: 201 })
}

/** DELETE — haal een adres van de allowlist op basis van `id`. */
export async function DELETE(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(RemoveSchema, req)
  if (!parsed.ok) return parsed.response
  const { id } = parsed.data

  const service = getServiceClient()
  const { data: deleted, error } = await service
    .from('signup_email_allowlist')
    .delete()
    .eq('id', id)
    .select('email_normalized')

  if (error) return serverError(error, 'admin-signup-allowlist:DELETE')
  if (!deleted || deleted.length === 0) return notFound()

  await logAdminAction(service, {
    actorId: gate.userId,
    actorEmail: gate.userEmail,
    action: 'allowlist.remove',
    // Bij voorkeur het verwijderde adres in de audit-log; anders de id.
    targetLabel: deleted[0]?.email_normalized ?? id,
  })

  return NextResponse.json({ ok: true })
}
