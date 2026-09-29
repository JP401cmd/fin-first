// Krant-ochtendroutine (skill .claude/skills/krant-ochtend). Drie opdrachten:
//
//   npx tsx scripts/krant/ochtend.ts status --env .env.local
//     ALLEEN LEZEN. Toont per Krant-job wat er moet gebeuren: hartslag, laatste
//     ingest, duidingswachtrij, ongecategoriseerde artikelen, weekjob van deze
//     week en de laatste weekmeting. Eindigt met een regel "TE DOEN: …".
//
//   npx tsx scripts/krant/ochtend.ts weekjob --env .env.local --ja
//     Draait de ECHTE weekcron (GET uit app/api/krant/cron/route.ts) lokaal
//     tegen de database: schaduweditie + weekmeting, idempotent per week.
//     Geen AI. Alleen vanaf een schone checkout van origin/master.
//
//   npx tsx scripts/krant/ochtend.ts hartslag --env .env.local --ja
//     Schrijft de hartslag: één job_runs-rij 'krant-ochtend' (success). Zolang
//     die jonger is dan 48 uur slaat de news-ingest-cron de duiding over
//     (lib/krant/ochtend-hartslag.ts). Weigert als er na de sessie nog meer dan
//     HARTSLAG_MAX_OPEN duidingen open staan.
//
// De service-sleutel komt uit het opgegeven env-bestand en wordt nooit gelogd.

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { amsterdamWeekKey } from '../../lib/briefing/snapshot'
import { DUIDING_MAX_POGINGEN, WACHTENDE_STATUSSEN } from '../../lib/krant/duiding'
import { DUIDING_VERSIE } from '../../lib/krant/duiding-schema'
import { OCHTEND_HARTSLAG_MAX_UUR, leesOchtendHartslag } from '../../lib/krant/ochtend-hartslag'
import { amsterdamWeekGrenzen } from '../../lib/krant/weekmeting'
import { recordJobRun } from '../../lib/job-runs'
import { arg, client, eisSchoneCheckout, eisVerwachteHost, laadEnv, stop, vlag } from './cli-gedeeld'

/** Dezelfde termijn als de standaard van de categorisatie-inhaalslag. */
const CATEGORISATIE_DAGEN = 14
/** Een ingest die langer geleden draaide dan dit, is een gemiste dag. */
const INGEST_MAX_UUR = 26
/**
 * Hoogstens zoveel duidingen mogen na de sessie nog open staan om een
 * hartslag te schrijven. Een hartslag houdt de cron 48 uur tegen; loopt de
 * achterstand op, dan moet de cron het juist overnemen (review 29 sep, 🟡-4).
 */
export const HARTSLAG_MAX_OPEN = 10
/** De weekcron draait maandag 06:00 UTC (+ jitter); vóór dit uur na de weekstart is hij nog niet te laat. */
const WEEKJOB_NIET_VOOR_UUR = 9

interface JobRij {
  status: string
  started_at: string
  finished_at: string | null
  summary: Record<string, unknown> | null
  error: string | null
}

async function laatsteRuns(supabase: SupabaseClient, job: string, aantal: number): Promise<JobRij[]> {
  const { data, error } = await supabase
    .from('job_runs')
    .select('status, started_at, finished_at, summary, error')
    .eq('job', job)
    .order('started_at', { ascending: false })
    .limit(aantal)
  if (error) stop(`job_runs niet te lezen (${job}): ${error.message}`)
  return (data ?? []) as JobRij[]
}

async function tel(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, wat: string): Promise<number> {
  const { count, error } = await q
  if (error) stop(`${wat} niet te tellen: ${error.message}`)
  return count ?? 0
}

const uurGeleden = (iso: string | null | undefined, nu: Date) =>
  iso ? Math.round(((nu.getTime() - Date.parse(iso)) / 3_600_000) * 10) / 10 : null

export interface OchtendStatus {
  nu: string
  week: string
  hartslag: { laatste: string | null; vers: boolean; uurGeleden: number | null }
  ingest: { laatste: string | null; status: string | null; uurGeleden: number | null; nieuw: number | null; uitbesteed: boolean | null }
  duiding: { wacht: number; mislukt: number; teBumpen: number }
  categorisatie: { open: number; dagen: number }
  weekjob: { week: string; gedaan: boolean; laatste: string | null; status: string | null; tijdBudgetOp: boolean }
  weekmeting: { laatste: string | null; week: string | null; status: string | null; waarschuwingen: string[]; naMetingGeduid: number }
  teDoen: string[]
}

async function bepaalStatus(supabase: SupabaseClient): Promise<OchtendStatus> {
  const nu = new Date()
  const week = amsterdamWeekKey(nu)
  const hartslag = await leesOchtendHartslag(supabase, nu)

  const [ingestRuns, editieRuns, metingRuns] = await Promise.all([
    laatsteRuns(supabase, 'news-ingest', 1),
    laatsteRuns(supabase, 'krant-editie', 10),
    laatsteRuns(supabase, 'krant-weekmeting', 1),
  ])

  const wachtrij = () =>
    supabase.from('news_articles').select('id', { count: 'exact', head: true }).not('bron_soort', 'is', null).lt('duiding_pogingen', DUIDING_MAX_POGINGEN)
  const sinds = new Date(nu.getTime() - CATEGORISATIE_DAGEN * 24 * 3_600_000).toISOString()
  const [wacht, mislukt, open, teBumpen] = await Promise.all([
    tel(wachtrij().eq('duiding_status', WACHTENDE_STATUSSEN[0]), 'duidingswachtrij'),
    tel(wachtrij().eq('duiding_status', WACHTENDE_STATUSSEN[1]), 'mislukte duidingen'),
    tel(
      supabase.from('news_articles').select('id', { count: 'exact', head: true }).not('bron_soort', 'is', null).is('category', null).gte('fetched_at', sinds),
      'ongecategoriseerde artikelen',
    ),
    // Oudere DUIDING_VERSIE: de volgende ingest zet ze op wacht (ook in de ochtendmodus).
    tel(
      supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true })
        .not('bron_soort', 'is', null)
        .in('duiding_status', ['geduid', 'afgewezen'])
        .lt('duiding_versie', DUIDING_VERSIE),
      'duidingen van een oudere versie',
    ),
  ])

  const ingest = ingestRuns[0]
  const ochtendInIngest = ingest?.summary?.ochtend as { uitbesteed?: boolean } | undefined
  // De weekjob van deze week: een geslaagde (of partiële) run voor `week` die niet op het tijdbudget afbrak.
  const dezeWeek = editieRuns.filter((r) => r.summary?.week === week && r.status !== 'error')
  const volledig = dezeWeek.find((r) => r.summary?.tijdBudgetOp !== true)
  const meting = metingRuns[0]
  const waarschuwingen = ((meting?.summary?.waarschuwingen as { code?: string }[] | undefined) ?? []).map((w) => w.code ?? '?')
  // Werd er ná de laatste meting nog iets in de gemeten week geduid (door een
  // inhaalslag of de cron), dan is die meting verouderd.
  const gemetenWeek = (meting?.summary?.week as string | undefined) ?? null
  let naMetingGeduid = 0
  if (gemetenWeek && meting?.started_at) {
    const { van, tot } = amsterdamWeekGrenzen(gemetenWeek)
    naMetingGeduid = await tel(
      supabase
        .from('news_articles')
        .select('id', { count: 'exact', head: true })
        .gte('fetched_at', van)
        .lt('fetched_at', tot)
        .gt('geduid_at', meting.started_at),
      'duidingen na de meting',
    )
  }

  const status: OchtendStatus = {
    nu: nu.toISOString(),
    week,
    hartslag: { ...hartslag, uurGeleden: uurGeleden(hartslag.laatste, nu) },
    ingest: {
      laatste: ingest?.started_at ?? null,
      status: ingest?.status ?? null,
      uurGeleden: uurGeleden(ingest?.started_at, nu),
      nieuw: typeof ingest?.summary?.inserted === 'number' ? (ingest.summary.inserted as number) : null,
      uitbesteed: ochtendInIngest?.uitbesteed ?? null,
    },
    duiding: { wacht, mislukt, teBumpen },
    categorisatie: { open, dagen: CATEGORISATIE_DAGEN },
    weekjob: {
      week,
      gedaan: volledig !== undefined,
      laatste: dezeWeek[0]?.started_at ?? null,
      status: dezeWeek[0]?.status ?? null,
      tijdBudgetOp: dezeWeek.length > 0 && volledig === undefined,
    },
    weekmeting: { laatste: meting?.started_at ?? null, week: gemetenWeek, status: meting?.status ?? null, waarschuwingen, naMetingGeduid },
    teDoen: [],
  }

  const teDoen = status.teDoen
  if (status.ingest.uurGeleden === null || status.ingest.uurGeleden > INGEST_MAX_UUR) teDoen.push('ingest-gemist')
  else if (status.ingest.status === 'error') teDoen.push('ingest-fout')
  if (wacht + mislukt > 0) teDoen.push('duiding')
  if (open > 0) teDoen.push('categorisatie')
  // Op maandagochtend vóór de Vercel-run is de weekjob nog niet te laat.
  const weekStart = Date.parse(amsterdamWeekGrenzen(week).van)
  const weekjobVerwacht = nu.getTime() >= weekStart + WEEKJOB_NIET_VOOR_UUR * 3_600_000
  if (!status.weekjob.gedaan && weekjobVerwacht) teDoen.push('weekjob')
  else if (status.weekjob.gedaan && (naMetingGeduid > 0 || meting?.status === 'error')) teDoen.push('weekjob-hermeten')
  teDoen.push('hartslag')
  return status
}

async function toonStatus() {
  const s = await bepaalStatus(client())
  const ja = (b: boolean) => (b ? 'ja' : 'nee')
  console.log(`Krant-ochtend ${s.nu} · week ${s.week}`)
  console.log(`  hartslag      laatste ${s.hartslag.laatste ?? '—'} (${s.hartslag.uurGeleden ?? '—'} u) · vers (≤ ${OCHTEND_HARTSLAG_MAX_UUR} u): ${ja(s.hartslag.vers)}`)
  console.log(`  ingest        ${s.ingest.laatste ?? '—'} (${s.ingest.uurGeleden ?? '—'} u) · ${s.ingest.status ?? '—'} · nieuw ${s.ingest.nieuw ?? '—'} · AI aan sessie gelaten: ${s.ingest.uitbesteed === null ? '—' : ja(s.ingest.uitbesteed)}`)
  console.log(`  duiding       wacht ${s.duiding.wacht} · mislukt ${s.duiding.mislukt} · oudere versie (volgende ingest → wacht) ${s.duiding.teBumpen}`)
  console.log(`  categorisatie open ${s.categorisatie.open} (laatste ${s.categorisatie.dagen} dagen)`)
  console.log(`  weekjob       ${s.weekjob.week}: ${s.weekjob.gedaan ? 'gedaan' : s.weekjob.tijdBudgetOp ? 'afgebroken op tijdbudget' : 'nog niet'} (${s.weekjob.laatste ?? '—'})`)
  console.log(`  weekmeting    ${s.weekmeting.week ?? '—'} · ${s.weekmeting.laatste ?? '—'} · ${s.weekmeting.status ?? '—'} · waarschuwingen: ${s.weekmeting.waarschuwingen.join(', ') || 'geen'} · ná de meting geduid: ${s.weekmeting.naMetingGeduid}`)
  console.log(`TE DOEN: ${s.teDoen.join(', ')}`)
  console.log(`JSON ${JSON.stringify(s)}`)
}

async function weekjob() {
  if (!vlag('ja')) stop('weekjob schrijft naar de database: geef --ja (na akkoord van de eigenaar).')
  const commit = eisSchoneCheckout(['lib/krant', 'app/api/krant/cron', 'lib/briefing', 'lib/news-ingest.ts', 'scripts/krant'])
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) stop('NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY ontbreken in het env-bestand.')
  eisVerwachteHost(url)
  if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET) stop('NODE_ENV=production zonder CRON_SECRET: de route zou weigeren.')
  console.log(`→ database: ${new URL(url).host} · commit ${commit.slice(0, 9)}`)
  const route = (await import(pathToFileURL(resolve('app/api/krant/cron/route.ts')).href)) as { GET: (r: Request) => Promise<Response> }
  const headers: Record<string, string> = {}
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`
  const res = await route.GET(new Request('http://localhost/api/krant/cron', { headers }))
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  console.log(`HTTP ${res.status}`)
  // Alleen tellingen; de summary bevat geen inhoud (ADR 0146).
  console.log(JSON.stringify(body, null, 2))
  if (!res.ok) process.exitCode = 1
}

async function hartslag() {
  if (!vlag('ja')) stop('hartslag schrijft naar de database: geef --ja (na akkoord van de eigenaar).')
  const supabase = client()
  const startedAt = new Date().toISOString()
  const s = await bepaalStatus(supabase)
  const open = s.duiding.wacht + s.duiding.mislukt
  if (open > HARTSLAG_MAX_OPEN) {
    stop(`Nog ${open} duidingen open (> ${HARTSLAG_MAX_OPEN}): geen hartslag, zodat de cron het overneemt als de sessie het niet bijhoudt.`)
  }
  // Alleen tellingen: wat er na de sessie nog open staat.
  await recordJobRun(supabase, {
    job: 'krant-ochtend',
    status: 'success',
    startedAt,
    summary: { week: s.week, duiding: s.duiding, categorisatie: s.categorisatie, weekjob: s.weekjob.gedaan },
  })
  // recordJobRun slikt schrijffouten in: bevestig dat DEZE rij er staat, niet die van gisteren.
  const na = await leesOchtendHartslag(supabase, new Date())
  if (!na.vers || !na.laatste || Date.parse(na.laatste) < Date.parse(startedAt)) {
    stop('De nieuwe hartslag is niet terug te lezen — controleer job_runs (de insert kan stil mislukt zijn).')
  }
  console.log(`✓ hartslag geschreven (${na.laatste}). De ingest van morgen laat duiding en categorisatie aan de sessie over.`)
}

async function main() {
  const opdracht = process.argv[2]
  laadEnv(arg('env'))
  if (opdracht === 'status') await toonStatus()
  else if (opdracht === 'weekjob') await weekjob()
  else if (opdracht === 'hartslag') await hartslag()
  else stop('Gebruik: status | weekjob | hartslag (zie de kop van dit bestand).')
}

main().catch((err) => stop(err instanceof Error ? err.message : String(err)))
