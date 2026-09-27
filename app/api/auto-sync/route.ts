import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { serverError, unauthorized } from '@/lib/api/respond'

/**
 * PUT /api/auto-sync
 *
 * De schakelaar "Automatisch bijwerken" (W-018, ADR 0182): mag /overzicht bij
 * openen bank- en brokerkoppelingen die langer dan twaalf uur stilstaan op de
 * achtergrond bijwerken? Body: `{ enabled: boolean }` → `{ ok: true, enabled }`.
 *
 * Lezen gaat NIET via deze route: /overzicht en /mijn/koppelingen lezen
 * `profiles.auto_sync_enabled` uit de profielrij die hun loader al heeft (ADR
 * 0058 — lezen via loader, muteren via API). Dit is het enige schrijfpad.
 *
 * SECURITY: own-row update via de anon RLS-client (`.eq('id', user.id)`), NOOIT
 * service-role; de eigen-rij ALL-policy op `profiles` dekt de kolom. De sessie
 * wordt geverifieerd met `auth.getUser()` (niet alleen de JWT lokaal gelezen):
 * een schrijfactie hoort een ingetrokken sessie te weigeren. Eén scalar boolean,
 * geen PII.
 *
 * CONVENTIE (ADR 0044): zod via `parseBody` + de respond-helpers — één platte
 * `{ error: string }`-envelope, nooit een rauwe `error.message` naar de client.
 */

const AutoSyncBodySchema = z.object({
  enabled: z.boolean(),
})

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const parsed = await parseBody(AutoSyncBodySchema, request)
    if (!parsed.ok) return parsed.response
    const { enabled } = parsed.data

    // Own-row scalar update — uitsluitend de eigen rij (RLS), geen service-role.
    const { error } = await supabase
      .from('profiles')
      .update({ auto_sync_enabled: enabled })
      .eq('id', user.id)

    if (error) throw error

    return NextResponse.json({ ok: true, enabled })
  } catch (err) {
    return serverError(err, 'auto-sync:PUT')
  }
}
