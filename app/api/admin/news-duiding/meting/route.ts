import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import {
  bouwDuidingMeting,
  METING_KOLOMMEN,
  METING_WEKEN_MAX,
  METING_WEKEN_STANDAARD,
  type MetingRij,
} from '@/lib/krant/duiding-beheer'

/**
 * GET /api/admin/news-duiding/meting?weken=8 — de K1-meting van de duiding
 * (poort: dekking, teruggetrokken, foute getallen bij rekenende mechanismen).
 *
 * Leest alleen `news_articles` (platform-tabel, VRIJ_LEESBAAR in de ADR
 * 0146-gate) met een vaste kolomlijst — geen modeltekst, geen params: alleen
 * status, foutcode, reden, categorie en de mechanisme-soort/brontekst uit de
 * jsonb. Elke telling wordt bij elke lezing afgeleid (`bouwDuidingMeting`);
 * er is geen teller die wordt opgehoogd.
 *
 * PostgREST kapt een lezing af op `max_rows` (lokaal 1000 in
 * supabase/config.toml; de hosted instelling kan lager staan). Bij ~50
 * artikelen per dag is dat na drie weken bereikt, dus de route pagineert. Het
 * stopcriterium is de exacte telling van de eerste pagina, niet "een pagina
 * korter dan gevraagd" — anders zou een lagere hosted cap na één pagina stoppen
 * en `afgekapt: false` melden: precies de stil te lage dekking die dit voorkomt.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGINA = 1000
/** Veiligheidsplafond: 17 weken × ~60/dag ≈ 7.000 rijen; 20 pagina's is ruim. */
const MAX_PAGINAS = 20

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await isSuperAdmin(supabase))) return forbidden()

  const gevraagd = Number.parseInt(new URL(request.url).searchParams.get('weken') ?? '', 10)
  const weken = Number.isFinite(gevraagd) ? Math.min(Math.max(gevraagd, 1), METING_WEKEN_MAX) : METING_WEKEN_STANDAARD
  // Hele weken: de oudste getoonde week is die van (nu − (weken−1) × 7 dagen).
  // De lezing begint 8 dagen eerder dan dat moment (ruim over de maandag en de
  // Amsterdam↔UTC-verschuiving heen); weken vóór `eersteWeek` vallen weg, zodat
  // er nooit een half gelezen week als cijfer verschijnt.
  const DAG = 24 * 3600 * 1000
  const nu = Date.now()
  const eersteWeek = amsterdamWeekKey(new Date(nu - (weken - 1) * 7 * DAG))
  const vanaf = new Date(nu - ((weken - 1) * 7 + 8) * DAG).toISOString()

  const rijen: MetingRij[] = []
  let totaal: number | null = null
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const van = rijen.length
    const { data, error, count } = await supabase
      .from('news_articles')
      .select(METING_KOLOMMEN, p === 0 ? { count: 'exact' } : undefined)
      .gte('fetched_at', vanaf)
      .order('fetched_at', { ascending: false })
      .order('id', { ascending: true })
      .range(van, van + PAGINA - 1)
    if (error) return serverError(error, 'admin-news-duiding-meting:GET')
    if (p === 0) totaal = count ?? null
    const pagina = (data ?? []) as unknown as MetingRij[]
    rijen.push(...pagina)
    if (pagina.length === 0 || (totaal !== null && rijen.length >= totaal)) break
  }
  const afgekapt = totaal === null || rijen.length < totaal

  const perWeek = bouwDuidingMeting(rijen).filter((w) => w.week >= eersteWeek)
  return NextResponse.json({ weken: perWeek, eersteWeek, afgekapt })
}
