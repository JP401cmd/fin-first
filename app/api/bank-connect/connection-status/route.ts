import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { badRequest, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { deriveConnectionOutcome } from '@/lib/truelayer/connection-outcome'

/**
 * GET /api/bank-connect/connection-status?id=<bank_connections.id>
 *
 * Is de bank klaar met déze ene koppelpoging? Voor het wachtscherm van de
 * geïnstalleerde app (B-051): daar opent de bank in een apart venster en landt de
 * terugkeer vaak in de browser, dus de app moet zelf kunnen zien dat de callback
 * geslaagd is.
 *
 * Waarom de pending-rij en niet de lijst koppelingen: `auth-link` maakt per poging
 * precies één `bank_connections`-rij, en de callback hangt de koppelrijen — bij
 * een nieuwe koppeling én bij een herautorisatie — aan die rij
 * (`connection_id`). Dat is het enige signaal dat bij beide paden verandert; de
 * gezondheid van de lijst doet dat niet (`token_expires_at` is de looptijd van
 * het toegangstoken, niet van de consent).
 *
 * Levert alleen een uitkomst, geen rekeninggegevens — en leest geen enkele
 * versleutelde kolom. Scope: eigen rij, `user_id` expliciet naast RLS.
 */

const QuerySchema = z.object({ id: z.uuid() })

export async function GET(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = QuerySchema.safeParse({ id: new URL(req.url).searchParams.get('id') })
  if (!parsed.success) return badRequest('Ongeldige koppeling', 'validation_error')

  try {
    const { data: connection, error } = await supabase
      .from('bank_connections')
      .select('id, status, authorized_at')
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return serverError(error, 'bankconnect-connection-status:GET')
    if (!connection) return notFound()

    const { count, error: countError } = await supabase
      .from('bank_connection_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connection.id)
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (countError) return serverError(countError, 'bankconnect-connection-status:GET')

    const outcome = deriveConnectionOutcome({
      status: connection.status as string | null,
      authorizedAt: connection.authorized_at as string | null,
      linkedAccounts: count ?? 0,
      now: new Date(),
    })

    return NextResponse.json({ outcome }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return serverError(err, 'bankconnect-connection-status:GET')
  }
}
