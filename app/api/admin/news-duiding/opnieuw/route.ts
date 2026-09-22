import { NextResponse } from 'next/server'
import { conflict, forbidden, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import { OPNIEUW_TE_DUIDEN, opnieuwBodySchema } from '@/lib/krant/duiding-beheer'

/**
 * POST /api/admin/news-duiding/opnieuw — zet een afgewezen of mislukte duiding
 * terug op 'wacht', zodat de volgende ingest-run hem opnieuw duidt (analyse
 * 1A §2e: "Opnieuw duiden" op afgewezen/mislukt).
 *
 * Bewust NIET voor 'geduid' of 'teruggetrokken': een teruggetrokken duiding
 * gaat niet via een knop terug in omloop (B4 — terugtrekken is de menselijke
 * beslissing; herduiden gebeurt bij een versie-bump, zie lib/krant/duiding.ts).
 * Geen modelcall hier: de route zet alleen de wachtrij-status, de duidingsstap
 * in de cron doet de rest (tokenkosten blijven onder `nieuws_duiding`).
 *
 * Idempotent: staat de rij al op 'wacht', dan 200 zonder auditregel.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const parsed = await parseBody(opnieuwBodySchema, request)
  if (!parsed.ok) return parsed.response
  const { id } = parsed.data

  const { data: geraakt, error: updateFout } = await supabase
    .from('news_articles')
    .update({
      duiding_status: 'wacht',
      duiding_pogingen: 0,
      duiding_fout: null,
      duiding: null,
      duiding_versie: null,
      geduid_at: null,
    })
    .eq('id', id)
    .in('duiding_status', [...OPNIEUW_TE_DUIDEN])
    .select('id, title')
  if (updateFout) return serverError(updateFout, 'admin-news-duiding-opnieuw:POST')

  if (!geraakt || geraakt.length === 0) {
    const { data: huidig, error: leesFout } = await supabase
      .from('news_articles')
      .select('id, duiding_status')
      .eq('id', id)
      .maybeSingle()
    if (leesFout) return serverError(leesFout, 'admin-news-duiding-opnieuw:POST')
    if (!huidig) return notFound('Artikel niet gevonden')
    if (huidig.duiding_status === 'wacht') return NextResponse.json({ status: 'wacht', alInWachtrij: true })
    return conflict('Alleen een afgewezen of mislukte duiding kun je opnieuw laten duiden', 'niet_opnieuw')
  }

  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: 'nieuws.duiding.opnieuw',
    targetLabel: geraakt[0].title ?? null,
    detail: { articleId: id },
  })

  return NextResponse.json({ status: 'wacht', alInWachtrij: false })
}
