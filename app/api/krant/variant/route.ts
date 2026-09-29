import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { krantBronVoor } from '@/lib/krant/tijdlijn-bron'
import { zetKrantVariant } from '@/lib/krant/tijdlijn-keuzes'

/**
 * PUT /api/krant/variant { variant: 'ai' | 'tijdlijn' } — welke Krant de lezer
 * leest (Krant 1C fase 2, B40; betekenis sinds 1E, ADR 0190).
 *
 *   'tijdlijn'  zonder AI: terug naar de standaard (de variant leeg, K2).
 *   'ai'        de Krant MET AI — dezelfde tijdlijn met de AI-laag erop, alleen
 *               voor een Geheel-account met AI aan en een AI-abonnement
 *               (B10/B23). Een Krant-account krijgt nooit AI, ook niet via deze
 *               route (B11/K2: 403). Sinds 1E WIST DEZE KEUZE NIETS (K1).
 *
 * Het id komt uit de sessie; `krant_variant` schrijft alleen de service-role
 * (kolomgrant, migratie 20261004120000) — uitsluitend voor dat id.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Schema = z.object({ variant: z.enum(['ai', 'tijdlijn']) }).strict()

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const parsed = await parseBody(Schema, request)
  if (!parsed.ok) return parsed.response

  try {
    // De keuze bestaat pas als de tijdlijn voor deze lezer open is (security G3):
    // anders blijft een bij dichte vlag gezette 'ai' na het openen stil staan.
    const { krantAccount, kanAiKiezen, inBeta } = await krantBronVoor(supabase, user.id)
    if (!inBeta) return forbidden()
    if (parsed.data.variant === 'ai') {
      // Zelfde toets als de knop op /nieuws: geen Krant-account, AI aan
      // (kill-switch) én AI-abonnement (eindreview Y2).
      if (krantAccount) return forbidden('De Krant heeft geen AI-variant')
      if (!kanAiKiezen) return errorResponse('De Krant met AI vraagt AI aan en een AI-abonnement', 403, 'ai_niet_beschikbaar')
    }
    const uitkomst = await zetKrantVariant(getServiceClient(), user.id, parsed.data.variant)
    return NextResponse.json(uitkomst)
  } catch (err) {
    return serverError(err, 'krant-variant:PUT')
  }
}
