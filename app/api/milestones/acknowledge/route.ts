import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'

/**
 * POST `/api/milestones/acknowledge`
 *
 * Zet de cross-device once-guard op één gelogde mijlpaal: `acknowledged_at`.
 * Dit is het enige client-geïnitieerde mutatiepad van de mijlpalen-motor —
 * de detectie zelf loopt server-side in-band bij de /overzicht-load (ADR 0123).
 *
 * WAT DEZE ROUTE BEWUST NIET KAN:
 *  - een rij AANMAKEN. Een mijlpaal ontstaat door detectie, nooit doordat de
 *    browser erom vraagt; anders kon een client zichzelf elke vlag toekennen.
 *  - `achieved_at` raken. De DB dwingt dat óók af via een kolom-gescoopte
 *    `GRANT UPDATE (acknowledged_at)` — RLS begrenst rijen, geen kolommen.
 *  - een reeds bevestigde mijlpaal opnieuw bevestigen: de `is('acknowledged_at',
 *    null)`-filter maakt de aanroep idempotent, zodat twee tabbladen die
 *    tegelijk sluiten geen tweede tijdstip schrijven.
 *
 * Body: `{ key: string }` — de `milestone_key`. Antwoord: `{ ok: true }`.
 * Een onbekende of al bevestigde sleutel is géén fout: de client heeft niets
 * meer te doen, en een 404 zou hem alleen maar laten raden.
 */
const AcknowledgeSchema = z.object({
  key: z.string().min(1, 'key is vereist').max(200),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const parsed = await parseBody(AcknowledgeSchema, request)
  if (!parsed.ok) return parsed.response

  try {
    const { error } = await supabase
      .from('achieved_milestones')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('milestone_key', parsed.data.key)
      .is('acknowledged_at', null)

    if (error) {
      return serverError(error, 'milestones:POST')
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError(err, 'milestones:POST')
  }
}
