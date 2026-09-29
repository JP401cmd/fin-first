import { NextResponse } from 'next/server'
import { z } from 'zod'
import { serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { zetSchaduwBezwaar } from '@/lib/krant/tijdlijn-keuzes'

/**
 * PUT /api/krant/bezwaar { bezwaar: boolean } — bezwaar tegen de verwerking
 * van de Krant op de achtergrond (art. 21 AVG; grondslag gerechtvaardigd
 * belang, besluit 28-09 grondslag B, ADR 0183).
 *
 * true:  de weekcron en de dagelijkse tijdlijncron slaan deze lezer over, de
 *        schaduwedities worden gewist, en bij de AI-Krant ook de banden van
 *        het nieuwsprofiel (lib/krant/tijdlijn-keuzes.ts).
 * false: het bezwaar ingetrokken; de volgende run leidt weer af.
 *
 * Het id komt uit de sessie. Service-role voor het wissen, uitsluitend voor
 * dat id. Beheer zet hetzelfde na een bezwaar via het contactkanaal.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Schema = z.object({ bezwaar: z.boolean() }).strict()

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(Schema, request)
  if (!parsed.ok) return parsed.response

  try {
    const uitkomst = await zetSchaduwBezwaar(getServiceClient(), user.id, parsed.data.bezwaar)
    return NextResponse.json(uitkomst)
  } catch (err) {
    return serverError(err, 'krant-bezwaar:PUT')
  }
}
