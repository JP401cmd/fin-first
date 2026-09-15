import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { ACTIVITY_MODULES } from '@/lib/activity/modules'

/**
 * POST /api/activity/module — "vandaag gebruikte ik dit app-deel" (ADR 0147,
 * fase 2: gebruik per app-deel voor de waardestromen).
 *
 * WAT HIER BINNENKOMT — EN WAT NIET. Alleen een module-sleutel uit de gesloten
 * lijst {@link ACTIVITY_MODULES}. Geen route, geen tijdstip, geen aantal kliks,
 * geen tijd-op-pagina, geen inhoud. De dag is een kolom-default (Amsterdam) en
 * de INSERT-policy dwingt `user_id = auth.uid()` én `day = vandaag` af, dus de
 * client kan niet terugdateren of voor een ander schrijven. De CHECK op
 * `module` weigert elke vrije tekst — ook als deze route ooit iets doorlaat.
 *
 * Meten mag nooit breken: na een geldige body is het antwoord altijd
 * `{ ok: true }`. Een ontbrekende tabel (migratie nog niet uitgerold), een
 * dubbele dag of een netwerkfout wordt ingeslikt.
 */

const BodySchema = z.object({ module: z.enum(ACTIVITY_MODULES) }).strict()

export async function POST(req: Request) {
  const supabase = await createClient()
  // Lokale JWT-verificatie volstaat: de RLS-policy is de echte grens (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const parsed = await parseBody(BodySchema, req)
  if (!parsed.ok) return parsed.response

  try {
    // ignoreDuplicates = ON CONFLICT DO NOTHING: een tweede melding op dezelfde
    // dag voor hetzelfde app-deel is een no-op, geen fout.
    await supabase
      .from('user_activity_modules')
      .upsert(
        { user_id: claims.sub, module: parsed.data.module },
        { onConflict: 'user_id,day,module', ignoreDuplicates: true },
      )
  } catch {
    // Meten is nooit kritiek.
  }

  return NextResponse.json({ ok: true })
}
