import type { SupabaseClient } from '@supabase/supabase-js'
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { recordJobRun } from '@/lib/job-runs'
import { backfillUrlFilter } from '@/lib/news-ingest'
import { bouwDuidingMeting, METING_KOLOMMEN, type MetingRij } from './duiding-beheer'
import { MECHANISMEN, isMechanismeId } from './mechanismen'
import {
  amsterdamWeekGrenzen,
  bouwWeekmeting,
  vorigeWeekKey,
  WEEKMETING_BRONSOORTEN,
  type WeekmetingArtikelRij,
  type WeekmetingBronsoort,
  type WeekmetingEditieRij,
  type WeekmetingRecord,
  type WeekmetingTokenRij,
} from './weekmeting'

// ── De weekmeting uitvoeren en vastleggen (B41) ─────────────────────────────
//
// Draait aan het eind van de weekcron (/api/krant/cron, maandag 06:00 UTC):
// ná de ingest + duiding van 05:00 en ná de editierun, zodat de lege edities
// van deze week al bestaan. Gemeten wordt de AFGESLOTEN week ervoor (cohort op
// fetched_at); de edities zijn die van de week van de run.
//
// Service-role-client, want de meting telt over alle lezers. Daarom leest elke
// query een vaste, smalle kolomlijst en verlaat alleen de telling deze module:
//  - news_articles: status- en soortkolommen (METING_KOLOMMEN + bron_soort/detail);
//    de titels die bouwDuidingMeting voor beheer bijhoudt, komen niet in het record;
//  - krant_edities: user_id, profiel_type, leeg (geen snapshot, geen items);
//  - profiles: alleen id waar is_demo_user;
//  - ai_token_usage: feature en tokenaantallen, géén user_id.
//
// Werpt nooit: een meting mag de weekcron niet breken. Een mislukte leesstap
// komt als code in `leesfouten` en maakt het record `partial`.

/** PostgREST kapt af op max_rows; zelfde paginering als de meting-route. */
const PAGINA = 1000
const MAX_PAGINAS = 20

interface Pagineerbaar<T> {
  range: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>
}

async function leesAlles<T>(
  bouw: (metTelling: boolean) => Pagineerbaar<T>,
): Promise<{ rijen: T[]; afgekapt: boolean; fout: boolean }> {
  const rijen: T[] = []
  let totaal: number | null = null
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const van = rijen.length
    const { data, error, count } = await bouw(p === 0).range(van, van + PAGINA - 1)
    if (error) return { rijen, afgekapt: true, fout: true }
    if (p === 0) totaal = count ?? null
    const pagina = data ?? []
    rijen.push(...pagina)
    if (pagina.length === 0 || (totaal !== null && rijen.length >= totaal)) break
  }
  return { rijen, afgekapt: totaal === null || rijen.length < totaal, fout: false }
}

const GEDUIDE_STATUSSEN = ['geduid', 'teruggetrokken']

/** Exacte telling geduide artikelen met samenvatting in [van, tot), eventueel per bronsoort. */
async function telSamenvattingen(
  service: SupabaseClient,
  van: string,
  tot: string,
  bronSoort?: WeekmetingBronsoort,
): Promise<number | null> {
  let q = service
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .gte('fetched_at', van)
    .lt('fetched_at', tot)
    .in('duiding_status', GEDUIDE_STATUSSEN)
    .not('duiding->>samenvatting', 'is', null)
  if (bronSoort) q = q.eq('bron_soort', bronSoort)
  const { count, error } = await q
  return error ? null : (count ?? 0)
}

async function telGeduid(service: SupabaseClient, van: string, tot: string): Promise<number | null> {
  const { count, error } = await service
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .gte('fetched_at', van)
    .lt('fetched_at', tot)
    .in('duiding_status', GEDUIDE_STATUSSEN)
  return error ? null : (count ?? 0)
}

function rekent(mechanisme: string): boolean {
  return isMechanismeId(mechanisme) && MECHANISMEN[mechanisme].rekent
}

export interface WeekmetingOpties {
  /** De editierun van deze week liep niet volledig (fouten > 0): lege edities zijn een ondergrens. */
  editieOnvolledig?: boolean
}

/** Meet de afgesloten week vóór `now` en geeft het record terug (zonder te schrijven). */
export async function meetWeek(service: SupabaseClient, now: Date, opties: WeekmetingOpties = {}): Promise<WeekmetingRecord> {
  const editieWeek = amsterdamWeekKey(now)
  const week = vorigeWeekKey(editieWeek)
  const { van, tot } = amsterdamWeekGrenzen(week)
  const vorige = vorigeWeekKey(week)
  const vorigeGrenzen = amsterdamWeekGrenzen(vorige)
  const leesfouten: string[] = []
  let afgekapt = false

  // 1. Artikelen van de week: één lezing voor de duidingsmeting én de bronsoort.
  const artikelen = await leesAlles<MetingRij & WeekmetingArtikelRij>((metTelling) =>
    service
      .from('news_articles')
      .select(`${METING_KOLOMMEN}, bron_soort, bron_detail`, metTelling ? { count: 'exact' } : undefined)
      .gte('fetched_at', van)
      .lt('fetched_at', tot)
      .order('fetched_at', { ascending: false })
      .order('id', { ascending: true }) as unknown as Pagineerbaar<MetingRij & WeekmetingArtikelRij>,
  )
  if (artikelen.fout) leesfouten.push('news_articles')
  afgekapt ||= artikelen.afgekapt && !artikelen.fout
  const duiding = bouwDuidingMeting(artikelen.rijen).find((w) => w.week === week) ?? null

  // 2. Samenvattingen per bronsoort (exacte counts; de meting leest geen tekst).
  const metSamenvattingPerBronsoort = {} as Record<WeekmetingBronsoort, number>
  for (const soort of WEEKMETING_BRONSOORTEN) {
    const n = await telSamenvattingen(service, van, tot, soort)
    if (n === null) leesfouten.push(`samenvatting:${soort}`)
    metSamenvattingPerBronsoort[soort] = n ?? 0
  }
  // Teller van het aandeel zonder bronsoortfilter, net als de week ervoor.
  const metSamenvattingTotaal = await telSamenvattingen(service, van, tot)
  if (metSamenvattingTotaal === null) leesfouten.push('samenvatting')
  const [vorigeGeduid, vorigeMetSamenvatting] = await Promise.all([
    telGeduid(service, vorigeGrenzen.van, vorigeGrenzen.tot),
    telSamenvattingen(service, vorigeGrenzen.van, vorigeGrenzen.tot),
  ])
  if (vorigeGeduid === null || vorigeMetSamenvatting === null) leesfouten.push('vorige-week')

  // 3. Backfill die nog openstaat: hetzelfde filter als de ingest.
  const backfill = await service
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .is('bron_detail', null)
    .in('bron_soort', ['rss', 'web_lijst'])
    .neq('duiding_status', 'teruggetrokken')
    .or(backfillUrlFilter())
  if (backfill.error) leesfouten.push('backfill')

  // 4. Geldende schaduwedities van de week van de run + wie testaccount is.
  const [edities, demo] = await Promise.all([
    leesAlles<WeekmetingEditieRij>((metTelling) =>
      service
        .from('krant_edities')
        .select('user_id, profiel_type, leeg', metTelling ? { count: 'exact' } : undefined)
        .eq('week_key', editieWeek)
        .eq('bron', 'schaduw')
        .is('vervangen_door', null)
        .order('user_id', { ascending: true }) as unknown as Pagineerbaar<WeekmetingEditieRij>,
    ),
    service.from('profiles').select('id').eq('is_demo_user', true),
  ])
  if (edities.fout) leesfouten.push('krant_edities')
  if (demo.error) leesfouten.push('profiles')
  afgekapt ||= edities.afgekapt && !edities.fout

  // 5. Tokens per AI-feature in dezelfde week — zonder user_id.
  const tokens = await leesAlles<WeekmetingTokenRij>((metTelling) =>
    service
      .from('ai_token_usage')
      .select('feature, input_tokens, output_tokens', metTelling ? { count: 'exact' } : undefined)
      .gte('created_at', van)
      .lt('created_at', tot)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }) as unknown as Pagineerbaar<WeekmetingTokenRij>,
  )
  if (tokens.fout) leesfouten.push('ai_token_usage')
  afgekapt ||= tokens.afgekapt && !tokens.fout

  return bouwWeekmeting({
    week,
    editieWeek,
    gemetenOp: now.toISOString(),
    duiding,
    artikelen: artikelen.rijen,
    metSamenvattingPerBronsoort,
    metSamenvattingTotaal: metSamenvattingTotaal ?? 0,
    editieOnvolledig: opties.editieOnvolledig ?? false,
    vorigeWeek:
      vorigeGeduid !== null && vorigeMetSamenvatting !== null
        ? { week: vorige, geduid: vorigeGeduid, metSamenvatting: vorigeMetSamenvatting }
        : null,
    backfillResterend: backfill.error ? null : (backfill.count ?? 0),
    // Een mislukte demo-lezing: dan is niemand testaccount en valt iedereen
    // onder de onderdrukking — fail-closed richting privacy.
    edities: edities.rijen,
    testaccountIds: new Set(((demo.data ?? []) as Array<{ id: string }>).map((r) => r.id)),
    tokens: tokens.rijen,
    afgekapt,
    leesfouten,
    rekent,
  })
}

/**
 * Meet en schrijf het record weg als job_run `krant-weekmeting`. Status
 * `partial` bij minstens één waarschuwing (ADR 0178: zichtbaar op
 * /beheer/jobs, geen melding), anders `success`. Een uitzondering is een
 * codefout, geen drempel: die wordt `error` (en meldt via de cron-alert).
 * Werpt nooit.
 */
export async function legWeekmetingVast(
  service: SupabaseClient,
  now: Date = new Date(),
  opties: WeekmetingOpties = {},
): Promise<WeekmetingRecord | null> {
  const startedAt = new Date().toISOString()
  try {
    const record = await meetWeek(service, now, opties)
    const waarschuwt = record.waarschuwingen.length > 0
    await recordJobRun(service, {
      job: 'krant-weekmeting',
      status: waarschuwt ? 'partial' : 'success',
      startedAt,
      summary: record,
      error: waarschuwt ? record.waarschuwingen.map((w) => w.code).join(', ') : null,
    })
    return record
  } catch (err) {
    console.error('[krant/weekmeting] mislukt:', err instanceof Error ? err.message : err)
    await recordJobRun(service, {
      job: 'krant-weekmeting',
      status: 'error',
      startedAt,
      error: 'weekmeting mislukt — zie de serverlog (krant/weekmeting)',
    })
    return null
  }
}
