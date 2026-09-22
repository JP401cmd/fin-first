import { NextResponse } from 'next/server'
import { conflict, forbidden, notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'
import {
  artikelVerwijderBodySchema,
  duidingWeergave,
  NIET_TE_VERWIJDEREN,
  isDuidingStatus,
  REKENENDE_MECHANISMEN,
  veiligeZoekterm,
} from '@/lib/krant/duiding-beheer'

// ── GET — Lijst van artikelen met duiding, filters en paginering ─────
//
// /beheer/nieuws (1A fase 2, ADR 0171). `news_articles` is de platform-brede
// artikelbak (geen user_id; VRIJ_LEESBAAR in de ADR 0146-gate). Per artikel
// gaat de duiding als weergavevorm mee (`duidingWeergave`: geparsed tegen het
// leescontract, per param het grond-citaat ernaast) — nooit de ruwe jsonb.
//
// Query: `search` (titel/samenvatting/bron), `status` (duiding_status),
// `rekenend=1` (alleen rekenende mechanismen — de nalooplijst van de poort),
// `pagina` (0-based) × PAGINA_GROOTTE. Sinds 1A bewaart de ingest 120 dagen
// zonder grens van 100, dus paginering is nodig.

const PAGINA_GROOTTE = 50

const KOLOMMEN =
  'id, title, summary, source_url, source_name, category, published_at, fetched_at, potential_impact, is_used, ' +
  'duiding, duiding_status, duiding_versie, duiding_fout, geduid_at, teruggetrokken_at, teruggetrokken_reden'

interface ArtikelRij {
  id: string
  title: string
  summary: string | null
  source_url: string
  source_name: string
  category: string | null
  published_at: string | null
  fetched_at: string
  potential_impact: string | null
  is_used: boolean
  duiding: unknown
  duiding_status: string
  duiding_versie: number | null
  duiding_fout: string | null
  geduid_at: string | null
  teruggetrokken_at: string | null
  teruggetrokken_reden: string | null
}

export async function GET(request: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const url = new URL(request.url)
  const search = veiligeZoekterm(url.searchParams.get('search'))
  const status = url.searchParams.get('status') ?? ''
  const rekenend = url.searchParams.get('rekenend') === '1'
  const paginaRuw = Number.parseInt(url.searchParams.get('pagina') ?? '0', 10)
  const pagina = Number.isFinite(paginaRuw) && paginaRuw > 0 ? Math.min(paginaRuw, 1000) : 0

  let query = supabase
    .from('news_articles')
    .select(KOLOMMEN, { count: 'exact' })
    .order('fetched_at', { ascending: false })
    .order('id', { ascending: true })
    .range(pagina * PAGINA_GROOTTE, (pagina + 1) * PAGINA_GROOTTE - 1)

  if (isDuidingStatus(status)) query = query.eq('duiding_status', status)
  if (rekenend) query = query.in('duiding->mechanisme->>soort', [...REKENENDE_MECHANISMEN])

  // Case-insensitive zoeken over titel, samenvatting en bron. De term is
  // ontdaan van PostgREST-syntax (komma's, haakjes, wildcards) — anders kan
  // een zoekopdracht het filter openbreken.
  if (search) {
    query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%,source_name.ilike.%${search}%`)
  }

  const { data, error, count } = await query

  if (error) {
    return serverError(error, 'admin-news-articles:GET')
  }

  const articles = ((data ?? []) as unknown as ArtikelRij[]).map(({ duiding, source_url, ...rest }) => ({
    ...rest,
    // Alleen http(s)-links naar de bron; een `javascript:`-URL uit een feed
    // wordt nooit een klikbare href.
    source_url: /^https?:\/\//i.test(source_url) ? source_url : null,
    duiding: duidingWeergave(duiding),
  }))
  const total = count ?? 0

  return NextResponse.json({
    articles,
    total,
    pagina,
    paginaGrootte: PAGINA_GROOTTE,
    heeftMeer: (pagina + 1) * PAGINA_GROOTTE < total,
  })
}

// ── DELETE — Eén artikel verwijderen ─────────────────────────────────
//
// Sinds 1A fase 2 (ADR 0171) NIET voor een artikel met status 'geduid' of
// 'teruggetrokken': verwijderen zou de terugtrek-audit (B4) omzeilen, een
// fout getal uit de K1-meting laten verdwijnen, een gat in de schaduweditie
// laten (krant_editie_items.article_id → set null, zonder herberekening), en
// de ingest haalt het artikel bij de volgende run gewoon terug op 'wacht' — een
// stille reset. Een geduid artikel trek je dus eerst terug; een teruggetrokken
// artikel ruimt de 120-dagen-retentie op. Elke verwijdering wordt gelogd.

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const parsed = await parseBody(artikelVerwijderBodySchema, request)
  if (!parsed.ok) return parsed.response
  const { id } = parsed.data

  const { data: verwijderd, error } = await supabase
    .from('news_articles')
    .delete()
    .eq('id', id)
    .not('duiding_status', 'in', `(${NIET_TE_VERWIJDEREN.join(',')})`)
    .select('id, title, duiding_status')
  if (error) {
    return serverError(error, 'admin-news-articles:DELETE')
  }

  if (!verwijderd || verwijderd.length === 0) {
    const { data: huidig, error: leesFout } = await supabase
      .from('news_articles')
      .select('id, duiding_status')
      .eq('id', id)
      .maybeSingle()
    if (leesFout) return serverError(leesFout, 'admin-news-articles:DELETE')
    if (!huidig) return notFound('Artikel niet gevonden')
    return conflict(
      huidig.duiding_status === 'geduid'
        ? 'Een geduid artikel verwijder je niet: trek de duiding terug'
        : 'Een teruggetrokken artikel blijft staan voor de meting; de retentie ruimt het op',
      'duiding_audit',
    )
  }

  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: 'nieuws.artikel.verwijderen',
    targetLabel: verwijderd[0].title ?? null,
    detail: { articleId: id, duidingStatus: verwijderd[0].duiding_status },
  })

  return NextResponse.json({ success: true })
}
