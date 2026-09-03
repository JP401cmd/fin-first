import { NextResponse } from 'next/server'
import { z } from 'zod'
import { forbidden, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { ERROR_SIGNATURE_RE } from '@/lib/alerts/error-signature'
import { summarizeErrorGroups } from '@/lib/error-groups'
import {
  ERROR_GROUPS_MAX_ROWS,
  ERROR_LOG_COLUMNS_LEAN,
  loadErrorGroups,
} from '@/lib/error-groups-loader'

/**
 * GET/POST/DELETE /api/admin/error-groups — de werkvoorraad achter
 * `/beheer/errors` (ADR 0113).
 *
 * GET     leest `error_logs` + `error_log_resolutions` en levert GEGROEPEERDE
 *         foutsoorten met een afgeleide open/afgehandeld-stand.
 * POST    vinkt één foutsoort af.
 * DELETE  haalt dat vinkje weg.
 *
 * TOEGANG — twee sloten, bewust:
 *  1. `isSuperAdmin()` in de route (snelle, leesbare 403);
 *  2. RLS op beide tabellen (`is_superadmin()`), want dit gaat NIET via
 *     service-role. Zou slot 1 ooit wegvallen, dan levert de query nul rijen in
 *     plaats van de hele foutenstapel.
 *
 * SLEUTEL IS SERVER-BEPAALD. De client stuurt alleen een `signature`; welke
 * rijen daarbij horen, hoeveel dat er zijn en wanneer ze voor het laatst
 * voorkwamen bepaalt de server opnieuw uit `error_logs`. De client kan die
 * cijfers dus niet meeleveren of ophogen.
 */

export const dynamic = 'force-dynamic'
// Node-runtime: de signature-digest gebruikt `node:crypto`.
export const runtime = 'nodejs'

// Leesvenster + groepering wonen in `lib/error-groups-loader.ts`, gedeeld met
// de inbak-teller op de /beheer-hub — één venster, één "open"-getal.

const SignatureSchema = z.object({
  signature: z
    .string()
    .regex(ERROR_SIGNATURE_RE, 'signature moet 16 hexadecimale tekens zijn'),
})

const ResolveSchema = SignatureSchema.extend({
  note: z.string().trim().max(500, 'notitie is maximaal 500 tekens').optional(),
})

const UnresolveSchema = SignatureSchema

interface AdminContext {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  email: string | null
}

/** 401 zonder sessie, 403 zonder superadmin-rol, anders de context. */
async function requireSuperAdmin(): Promise<AdminContext | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()
  return { supabase, userId: user.id, email: user.email ?? null }
}

export async function GET() {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx

  try {
    const loaded = await loadErrorGroups(ctx.supabase)
    if ('error' in loaded) return serverError(loaded.error, 'admin-error-groups:GET')
    return NextResponse.json(
      {
        groups: loaded.groups,
        summary: summarizeErrorGroups(loaded.groups),
        truncated: loaded.truncated,
        windowSize: ERROR_GROUPS_MAX_ROWS,
      },
      // De body draagt vrije-tekst foutmeldingen en stacktraces (deels
      // client-aangeleverd, dus mogelijk met PII erin). Die horen niet in een
      // browser-/bfcache achter te blijven op een gedeelde machine.
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return serverError(err, 'admin-error-groups:GET')
  }
}

export async function POST(req: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx

  const parsed = await parseBody(ResolveSchema, req)
  if (!parsed.ok) return parsed.response

  try {
    // Lean kolomset: POST gebruikt alleen `count` en `lastSeenAt`, geen stacktraces.
    const loaded = await loadErrorGroups(ctx.supabase, ERROR_LOG_COLUMNS_LEAN)
    if ('error' in loaded) return serverError(loaded.error, 'admin-error-groups:POST')

    const group = loaded.groups.find((g) => g.signature === parsed.data.signature)
    if (!group) {
      // Geen 400: de signature is vormelijk geldig, hij bestaat alleen niet (meer)
      // in het leesvenster — bv. omdat de retentie-cron de rijen wiste.
      return notFound('Deze foutsoort staat niet in het huidige leesvenster')
    }

    // Server-bepaalde cijfers: telling en laatst-gezien komen uit de zojuist
    // opnieuw gelezen rijen, nooit uit de request.
    const { error } = await ctx.supabase.from('error_log_resolutions').upsert(
      {
        signature: group.signature,
        resolved_at: new Date().toISOString(),
        resolved_by: ctx.userId,
        note: parsed.data.note || null,
        resolved_count: group.count,
        last_seen_at: group.lastSeenAt,
      },
      { onConflict: 'signature' },
    )
    if (error) return serverError(error, 'admin-error-groups:POST')

    // Bewust ZONDER de foutmelding zelf: `error_logs.message` is deels
    // client-aangeleverde vrije tekst en hoort niet in het auditlog gekopieerd.
    await logAdminAction(ctx.supabase, {
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'errors.resolve',
      targetLabel: group.signature,
      detail: { count: group.count, lastSeenAt: group.lastSeenAt, hasNote: Boolean(parsed.data.note) },
    })

    return NextResponse.json({ ok: true, signature: group.signature })
  } catch (err) {
    return serverError(err, 'admin-error-groups:POST')
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireSuperAdmin()
  if (ctx instanceof NextResponse) return ctx

  const parsed = await parseBody(UnresolveSchema, req)
  if (!parsed.ok) return parsed.response

  try {
    const { error, count } = await ctx.supabase
      .from('error_log_resolutions')
      .delete({ count: 'exact' })
      .eq('signature', parsed.data.signature)
    if (error) return serverError(error, 'admin-error-groups:DELETE')
    if (!count) return notFound('Deze foutsoort stond niet afgevinkt')

    await logAdminAction(ctx.supabase, {
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'errors.reopen',
      targetLabel: parsed.data.signature,
    })

    return NextResponse.json({ ok: true, signature: parsed.data.signature })
  } catch (err) {
    return serverError(err, 'admin-error-groups:DELETE')
  }
}
