import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { loadAiHealth, type AiHealthSnapshot } from '@/lib/ai/ai-health-loader'
import { INZAGE_ACTIES } from '@/lib/admin-audit-labels'
import { isPushConfigured } from '@/lib/alerts/push'
import { EMPTY_BEHEER_INBOX_COUNTS, loadBeheerInboxCounts } from '@/lib/beheer-inbox-counts'
import { laadGebruikAnalyse, type GebruikAnalyseResultaat } from '@/lib/beheer/gebruik-analyse/loader'
import { loadKoppelingTellingen } from '@/lib/beheer/koppelingen-tellingen'
import { isEmailConfigured } from '@/lib/email'
import type { ErrorGroup } from '@/lib/error-groups'
import { ERROR_GROUPS_MAX_ROWS, ERROR_LOG_COLUMNS_IMPACT, loadErrorGroups } from '@/lib/error-groups-loader'
import { FISCALE_DRIFT_PUNTEN, buildJaarChecklist } from '@/lib/fiscale-kerngetallen'
import { detectScheduleDrift } from '@/lib/job-health'
import { loadJobStanden, type JobStand } from '@/lib/job-health-loader'
import { bronKlasse, oorzaakVan } from '@/lib/news-bron-gezondheid'
import { BRON_OORZAAK_LABEL, type BronOorzaak } from '@/lib/news-sources'
import { resolveRuntimeEnvironment } from '@/lib/observability/runtime-environment'
import { parsePlatformStatus } from '@/lib/platform-status'
import { RELEASE_NOTES } from '@/lib/release-notes'
import { leesvensterTotEnMet } from '@/lib/observability/leesvenster'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { USER_REPORT_NIET_GESYNCT, USER_REPORT_SYNC_MAX_ATTEMPTS } from '@/lib/user-reports/sync-grens'
import { WEB_VITAL_METRICS, type WebVitalMetric } from '@/lib/web-vitals/config'
import { webprestatiesPeriode, type DashboardPeriode } from './doorklik'
import type {
  BankSyncFeit,
  DashboardFeiten,
  FoutenFeit,
  KoppelingenFeit,
  KrantFeit,
  MailFeit,
  MeldingenFeit,
  PlatformFeit,
  TakenFeit,
  VitalsFeit,
} from './feiten'
import { bouwFoutsoorten, isAiFout, naarVoorvallen } from './fouten'
import { bouwIngrepen, type AuditRij, type Ingreep } from './ingrepen'
import { probeUit } from './probe'
import { reeksLengteVoor } from './reeksen'
import { RECENT_DAGEN } from './signalen'
import { bronOk, type Bron } from './status'
import { amsterdamDag, beginVanDag, verschuifDag } from './tijd'

/**
 * Leesacties van het beheerdashboard.
 *
 * TOEGANG — twee sloten, zoals elders in beheer: (1) de superadmin-check hier,
 * op de sessie van de aanroeper; (2) RLS op de bronnen die via de sessie-client
 * gelezen worden. Cross-user tellingen gaan via de service-role, en pas NA
 * slot 1 (ADR 0006). Zonder rol leest geen enkele functie iets.
 *
 * GRENS — beheer ziet gebruik, geen inhoud (ADR 0146). Hier wordt alleen
 * gelezen wat `lib/beheer/geen-inhoud.test.ts` toestaat: logs, tellingen en
 * tijdstempels. Gebruikers-id's dienen uitsluitend om te tellen en verlaten
 * deze module niet: foutregels dragen na `naarVoorvallen` een volgnummer, de
 * banksynchronisatie en de AI-aanroepen alleen een telling of een ja/nee.
 *
 * VOLLEDIGHEID — elke leesactie met een bovengrens zegt het als die grens is
 * geraakt (`afgekapt`). Een afgekapte set die als volledig doorgaat, leest als
 * een daling of als "geen probleem".
 *
 * KOSTEN — elke functie is per verzoek gememoïseerd (`cache`), zodat secties
 * die dezelfde bron nodig hebben hem één keer lezen. De zware reeksen
 * (AI-aanroepen, webprestaties per dag) laadt alleen de weergave die ze toont.
 */

interface Toegang {
  supabase: SupabaseClient
  service: SupabaseClient
}

const toegang = cache(async (): Promise<Toegang | null> => {
  try {
    const supabase = await createClient()
    if (!(await isSuperAdmin(supabase))) return null
    return { supabase, service: getServiceClient() }
  } catch {
    return null
  }
})

/** Mag de aanroeper het dashboard zien? Fail-closed. */
export async function magDashboardZien(): Promise<boolean> {
  return (await toegang()) !== null
}

/** Eén leesactie in een `Bron`; een exception is een leesfout, geen lege uitkomst. */
async function lees<T>(tag: string, actie: () => Promise<Bron<T>>): Promise<Bron<T>> {
  try {
    return await actie()
  } catch (err) {
    console.error(`[beheer:dashboard] ${tag}`, err instanceof Error ? err.message : err)
    return { soort: 'fout' }
  }
}

/**
 * Begin van "de laatste `dagen` dagen": kalenderdagen in Amsterdam, vandaag
 * inbegrepen. Zelfde venster als de foutsoorten (`recentVanafDag`), zodat
 * "7 dagen" op het scherm overal dezelfde zeven dagen zijn.
 */
function vanafKalenderdag(nu: Date, dagen: number): string {
  return beginVanDag(verschuifDag(amsterdamDag(nu), -(dagen - 1)))
}

// ── Foutvenster ─────────────────────────────────────────────────────

interface Foutvenster {
  feit: FoutenFeit
  groups: ErrorGroup[]
}

/**
 * Het leesvenster van `/beheer/errors`, één keer per verzoek. Zelfde venster,
 * zelfde groepering, dus hetzelfde "open"-getal als op dat scherm.
 */
const laadFoutvenster = cache(async (): Promise<Bron<Foutvenster>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('foutvenster', async () => {
    const nu = new Date()
    const venster = await loadErrorGroups(t.supabase, ERROR_LOG_COLUMNS_IMPACT, nu)
    if ('error' in venster) return { soort: 'fout' }
    const voorvallen = naarVoorvallen(venster.rows)
    const oudste = venster.rows.length > 0 ? venster.rows[venster.rows.length - 1].created_at : null
    return bronOk({
      groups: venster.groups,
      feit: {
        soorten: bouwFoutsoorten(voorvallen, venster.groups, { nu, recentDagen: RECENT_DAGEN }),
        voorvallen,
        afgekapt: venster.truncated,
        vensterVanaf: oudste,
        vensterGrootte: ERROR_GROUPS_MAX_ROWS,
      },
    })
  })
})

// ── Instellingen ────────────────────────────────────────────────────

interface InstellingRij {
  key: string
  value: unknown
  updated_at: string | null
}

const laadInstellingen = cache(async (): Promise<Bron<Map<string, InstellingRij>>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('instellingen', async () => {
    const { data, error } = await t.service
      .from('app_settings')
      .select('key, value, updated_at')
      .in('key', ['platform_status', 'news_source_health'])
    if (error) return { soort: 'fout' }
    return bronOk(new Map(((data ?? []) as InstellingRij[]).map((r) => [r.key, r])))
  })
})

function platformUit(instellingen: Bron<Map<string, InstellingRij>>): Bron<PlatformFeit> {
  if (instellingen.soort !== 'ok') return instellingen
  const rij = instellingen.data.get('platform_status')
  return bronOk({
    status: parsePlatformStatus(typeof rij?.value === 'string' ? rij.value : null),
    gewijzigdOp: rij?.updated_at ?? null,
  })
}

interface BronGezondheid {
  checkedAt?: unknown
  sources?: unknown
}

function krantUit(instellingen: Bron<Map<string, InstellingRij>>, standen: JobStand[] | null): Bron<KrantFeit> {
  if (instellingen.soort !== 'ok') return instellingen

  let bronnen: KrantFeit['bronnen'] = null
  const rauw = instellingen.data.get('news_source_health')?.value
  if (typeof rauw === 'string') {
    try {
      const gezondheid = JSON.parse(rauw) as BronGezondheid
      if (typeof gezondheid.checkedAt === 'string' && Array.isArray(gezondheid.sources)) {
        const regels = gezondheid.sources as { label?: unknown; items?: unknown; oorzaak?: unknown }[]
        const nietGoed: NonNullable<KrantFeit['bronnen']>['nietGoed'] = []
        for (const r of regels) {
          const regel = {
            oorzaak: typeof r.oorzaak === 'string' ? (r.oorzaak as BronOorzaak) : null,
            items: typeof r.items === 'number' ? r.items : 0,
          }
          const klasse = bronKlasse(regel)
          if (klasse === 'goed') continue
          const oorzaak = oorzaakVan(regel)
          nietGoed.push({
            label: typeof r.label === 'string' ? r.label : 'onbekende bron',
            klasse,
            oorzaak: oorzaak ? (BRON_OORZAAK_LABEL[oorzaak] ?? oorzaak) : 'oorzaak onbekend',
          })
        }
        bronnen = { gecontroleerdOp: gezondheid.checkedAt, totaal: regels.length, nietGoed }
      }
    } catch {
      // Onleesbare JSON: er is dan geen bruikbare ophaalronde vastgelegd.
      bronnen = null
    }
  }

  const ingest = standen?.find((s) => s.job.key === 'news-ingest')?.last?.summary
  const wacht = (ingest as { duiding?: { wacht?: unknown } } | null | undefined)?.duiding?.wacht
  return bronOk({ bronnen, wachtrij: typeof wacht === 'number' ? wacht : null })
}

// ── Achtergrondtaken ────────────────────────────────────────────────

const laadTaken = cache(async (): Promise<Bron<TakenFeit>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('taken', async () =>
    bronOk({
      standen: await loadJobStanden(t.supabase, new Date()),
      cronSecret: Boolean(process.env.CRON_SECRET),
      pushKanaal: isPushConfigured(),
      drift: detectScheduleDrift(),
    }),
  )
})

export { probeUit }

// ── Koppelingen ─────────────────────────────────────────────────────

/** Bovengrens van één leesactie op het banklogboek. */
const BANKSYNC_MAX_RIJEN = 1000

async function laadBanksync(service: SupabaseClient, nu: Date): Promise<Bron<BankSyncFeit>> {
  return lees('banksync', async () => {
    // Alleen wie, wanneer en of het lukte; de fouttekst en de tellingen per
    // synchronisatie blijven op hun eigen scherm.
    const { data, error } = await service
      .from('bank_sync_log')
      .select('user_id, status, created_at')
      .gte('created_at', vanafKalenderdag(nu, RECENT_DAGEN))
      // Een gebruiker mag zijn eigen rijen in dit logboek schrijven, met een
      // zelfgekozen tijdstip. Zonder bovenkant vullen rijen met een datum in de
      // toekomst het venster en vallen de echte mislukte synchronisaties weg.
      .lte('created_at', leesvensterTotEnMet(nu))
      .order('created_at', { ascending: false })
      .limit(BANKSYNC_MAX_RIJEN)
    if (error) return isOntbrekendSchema(error) ? { soort: 'niet-uitgerold' } : { soort: 'fout' }

    const rijen = (data ?? []) as { user_id: string | null; status: string; created_at: string }[]
    // Nieuwste eerst: de eerste regel per gebruiker is zijn laatste synchronisatie.
    const laatste = new Map<string, string>()
    for (const r of rijen) if (r.user_id && !laatste.has(r.user_id)) laatste.set(r.user_id, r.status)
    return bronOk({
      dagen: RECENT_DAGEN,
      pogingen: rijen.length,
      mislukt: rijen.filter((r) => r.status === 'error').length,
      gebruikers: laatste.size,
      gebruikersLaatsteMislukt: [...laatste.values()].filter((s) => s === 'error').length,
      // De bovengrens geraakt: oudere pogingen in de periode zijn niet gelezen.
      afgekapt: rijen.length >= BANKSYNC_MAX_RIJEN,
    })
  })
}

async function laadKoppelingen(
  service: SupabaseClient,
  standen: JobStand[] | null,
  nu: Date,
): Promise<Bron<KoppelingenFeit>> {
  return lees('koppelingen', async () => {
    const [tellingen, banksync] = await Promise.all([loadKoppelingTellingen(service), laadBanksync(service, nu)])
    return bronOk({ tellingen, probe: standen ? probeUit(standen) : null, banksync })
  })
}

// ── E-mail ──────────────────────────────────────────────────────────

async function laadMail(supabase: SupabaseClient, nu: Date): Promise<Bron<MailFeit>> {
  return lees('mail', async () => {
    const vanaf = vanafKalenderdag(nu, RECENT_DAGEN)
    const tel = (status: 'sent' | 'failed' | 'skipped') =>
      supabase
        .from('mail_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
        .gte('created_at', vanaf)
    const [verzonden, mislukt, overgeslagen, laatste] = await Promise.all([
      tel('sent'),
      tel('failed'),
      tel('skipped'),
      supabase.from('mail_log').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (verzonden.error || mislukt.error || overgeslagen.error || laatste.error) return { soort: 'fout' }
    if (verzonden.count == null || mislukt.count == null || overgeslagen.count == null) return { soort: 'fout' }
    return bronOk({
      ingericht: isEmailConfigured(),
      dagen: RECENT_DAGEN,
      verzonden: verzonden.count,
      mislukt: mislukt.count,
      overgeslagen: overgeslagen.count,
      laatstePoging: (laatste.data as { created_at: string } | null)?.created_at ?? null,
    })
  })
}

// ── Webprestaties ───────────────────────────────────────────────────

function isMetric(waarde: unknown): waarde is WebVitalMetric {
  return (WEB_VITAL_METRICS as readonly unknown[]).includes(waarde)
}

async function laadVitals(service: SupabaseClient): Promise<Bron<VitalsFeit>> {
  return lees('vitals', async () => {
    const { data, error } = await service.rpc('web_vitals_p75_summary', {
      p_days: RECENT_DAGEN,
      p_environment: 'production',
    })
    if (error) return isOntbrekendSchema(error) ? { soort: 'niet-uitgerold' } : { soort: 'fout' }
    const rijen = (data ?? []) as { metric: unknown; p75: unknown; sample_count: unknown }[]
    return bronOk({
      dagen: RECENT_DAGEN,
      omgeving: 'production' as const,
      metrics: rijen.flatMap((r) =>
        isMetric(r.metric) && typeof r.p75 === 'number'
          ? [{ metric: r.metric, p75: r.p75, metingen: Number(r.sample_count) || 0 }]
          : [],
      ),
    })
  })
}

// ── Meldingen van gebruikers ────────────────────────────────────────

async function laadMeldingen(supabase: SupabaseClient, nu: Date): Promise<Bron<MeldingenFeit>> {
  return lees('meldingen', async () => {
    const nietGesynct = () =>
      supabase
        .from('user_reports')
        .select('id', { count: 'exact', head: true })
        .in('notion_sync_status', [...USER_REPORT_NIET_GESYNCT])
    const [nieuw, wachtend, vastgelopen] = await Promise.all([
      supabase
        .from('user_reports')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', vanafKalenderdag(nu, RECENT_DAGEN)),
      nietGesynct().lt('notion_sync_attempts', USER_REPORT_SYNC_MAX_ATTEMPTS),
      nietGesynct().gte('notion_sync_attempts', USER_REPORT_SYNC_MAX_ATTEMPTS),
    ])
    for (const r of [nieuw, wachtend, vastgelopen]) {
      if (r.error) return isOntbrekendSchema(r.error) ? { soort: 'niet-uitgerold' } : { soort: 'fout' }
      if (r.count == null) return { soort: 'fout' }
    }
    return bronOk({
      dagen: RECENT_DAGEN,
      nieuw: nieuw.count ?? 0,
      wachtend: wachtend.count ?? 0,
      vastgelopen: vastgelopen.count ?? 0,
      maxPogingen: USER_REPORT_SYNC_MAX_ATTEMPTS,
    })
  })
}

// ── Alle feiten van "nu" ────────────────────────────────────────────

const AI_ONBEKEND: AiHealthSnapshot = { status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null }

/**
 * De feiten achter de aandachtslijst en de statustabel. `null` = geen toegang.
 * Alle bronnen worden naast elkaar gelezen; één falende bron trekt de andere
 * niet mee.
 */
export const laadDashboardFeiten = cache(async (): Promise<DashboardFeiten | null> => {
  const t = await toegang()
  if (!t) return null
  const nu = new Date()

  const [instellingen, taken, foutvenster, ai, mail, vitals, meldingen] = await Promise.all([
    laadInstellingen(),
    laadTaken(),
    laadFoutvenster(),
    loadAiHealth(t.supabase).catch(() => AI_ONBEKEND),
    laadMail(t.supabase, nu),
    laadVitals(t.service),
    laadMeldingen(t.supabase, nu),
  ])

  const standen = taken.soort === 'ok' ? taken.data.standen : null
  const [koppelingen, inbakken] = await Promise.all([
    laadKoppelingen(t.service, standen, nu),
    loadBeheerInboxCounts(t.supabase, {
      errorGroups: foutvenster.soort === 'ok' ? foutvenster.data.groups : null,
    }).catch(() => ({ ...EMPTY_BEHEER_INBOX_COUNTS })),
  ])

  const checklist = buildJaarChecklist()
  return {
    gemetenOp: nu.toISOString(),
    omgeving: resolveRuntimeEnvironment(),
    platform: platformUit(instellingen),
    ai,
    taken,
    fouten: foutvenster.soort === 'ok' ? bronOk(foutvenster.data.feit) : foutvenster,
    koppelingen,
    mail,
    vitals,
    meldingen,
    krant: krantUit(instellingen, standen),
    inbakken,
    fiscaal: {
      doeljaar: checklist.targetYear,
      open: checklist.openCount,
      driftOpen: FISCALE_DRIFT_PUNTEN.filter((d) => d.status === 'open').length,
    },
  }
})

// ── Reeksen ─────────────────────────────────────────────────────────

/** Eén AI-aanroep, teruggebracht tot verbruiksmeta. Geen gebruiker, geen inhoud. */
export interface AiAanroep {
  created_at: string
  feature: string
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** Aanroep zonder gebruiker: vrijwel altijd een achtergrondtaak. */
  systeem: boolean
}

interface AiRij {
  created_at: string
  feature: string
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number | null
  cache_write_tokens: number | null
  user_id: string | null
}

export interface AiAanroepen {
  rijen: AiAanroep[]
  /**
   * Oudste gelezen aanroep als de bovengrens is geraakt, anders `null`. Dagen
   * tot en met die dag zijn dan niet volledig gelezen en tellen als niet gemeten.
   */
  afgekaptVanaf: string | null
}

const AI_PAGINA = 1000
/**
 * Bovengrens van één lezing: 20 pagina's. Geen norm voor het verbruik, maar een
 * rem op de kosten van dit scherm, dat zichzelf elke tien minuten ververst.
 * Wordt de grens geraakt, dan zegt de lezing dat (`afgekaptVanaf`).
 */
export const AI_MAX_PAGINAS = 20

/**
 * Geslaagde AI-aanroepen over twee periodes plus vandaag. Gepagineerd, want
 * PostgREST kapt stil af op 1000 rijen; een afgekapte reeks zou als een daling
 * lezen.
 *
 * De paginering is stabiel gemaakt: het venster heeft een vaste bovenkant (het
 * moment van lezen), zodat aanroepen die tijdens het lezen binnenkomen de
 * pagina's niet opschuiven, en de volgorde is eenduidig (tijdstip, dan id).
 */
export const laadAiAanroepen = cache(async (dagen: DashboardPeriode): Promise<Bron<AiAanroepen>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('ai-aanroepen', async () => {
    const nu = new Date()
    const vanaf = beginVanDag(verschuifDag(amsterdamDag(nu), -(reeksLengteVoor(dagen) - 1)))
    const uit: AiAanroep[] = []
    let afgekaptVanaf: string | null = null
    for (let pagina_nr = 0; ; pagina_nr++) {
      if (pagina_nr >= AI_MAX_PAGINAS) {
        afgekaptVanaf = uit.length > 0 ? uit[uit.length - 1].created_at : nu.toISOString()
        break
      }
      const from = pagina_nr * AI_PAGINA
      const { data, error } = await t.service
        .from('ai_token_usage')
        .select(
          'id, created_at, feature, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, user_id',
        )
        .gte('created_at', vanaf)
        // Een vaste bovenkant: het moment van lezen. Geen klokmarge hier, want
        // de bovenkant moet over alle pagina's dezelfde zijn en een aanroep van
        // deze tel mag gerust in de volgende lezing vallen.
        .lte('created_at', nu.toISOString())
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + AI_PAGINA - 1)
      if (error) return isOntbrekendSchema(error) ? { soort: 'niet-uitgerold' } : { soort: 'fout' }
      const pagina = (data ?? []) as AiRij[]
      for (const r of pagina) {
        uit.push({
          created_at: r.created_at,
          feature: r.feature,
          provider: r.provider,
          model: r.model,
          input: r.input_tokens,
          output: r.output_tokens,
          cacheRead: r.cache_read_tokens ?? 0,
          cacheWrite: r.cache_write_tokens ?? 0,
          systeem: r.user_id === null,
        })
      }
      if (pagina.length < AI_PAGINA) break
    }
    return bronOk({ rijen: uit, afgekaptVanaf })
  })
})

/** Tijdstempels van foutregels, met de grens van het leesvenster. */
export interface FoutMomenten {
  alle: string[]
  ai: string[]
  /** Oudste regel van een AFGEKAPT venster; `null` als het venster volledig is. */
  afgekaptVanaf: string | null
  vensterGrootte: number
}

export const laadFoutMomenten = cache(async (): Promise<Bron<FoutMomenten>> => {
  const venster = await laadFoutvenster()
  if (venster.soort !== 'ok') return venster
  const { voorvallen, afgekapt, vensterVanaf, vensterGrootte } = venster.data.feit
  return bronOk({
    alle: voorvallen.map((v) => v.created_at),
    ai: voorvallen.filter((v) => isAiFout(v.context)).map((v) => v.created_at),
    afgekaptVanaf: afgekapt ? vensterVanaf : null,
    vensterGrootte,
  })
})

/** Gebruik per week, extern segment, band "laatste 30 dagen" (k-onderdrukt, ADR 0153). */
export const laadGebruik = cache(async (): Promise<GebruikAnalyseResultaat> => {
  const t = await toegang()
  if (!t) return { status: 'fout', vensterDagen: 30, intern: false }
  try {
    return await laadGebruikAnalyse(t.service, { dagen: 30, intern: false })
  } catch (err) {
    console.error('[beheer:dashboard] gebruik', err instanceof Error ? err.message : err)
    return { status: 'fout', vensterDagen: 30, intern: false }
  }
})

export interface VitalsDag {
  dag: string
  metric: WebVitalMetric
  p75: number
  metingen: number
}

export interface VitalsReeks {
  dagen: number
  samenvatting: VitalsFeit['metrics']
  perDag: VitalsDag[]
}

/** p75 per dag en over de periode, productie. De bron kent 7, 28 en 90 dagen. */
export const laadVitalsReeks = cache(async (dagen: DashboardPeriode): Promise<Bron<VitalsReeks>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('vitals-reeks', async () => {
    const p_days = webprestatiesPeriode(dagen)
    const [samenvatting, perDag] = await Promise.all([
      t.service.rpc('web_vitals_p75_summary', { p_days, p_environment: 'production' }),
      t.service.rpc('web_vitals_p75_daily', { p_days, p_environment: 'production' }),
    ])
    for (const r of [samenvatting, perDag]) {
      if (r.error) return isOntbrekendSchema(r.error) ? { soort: 'niet-uitgerold' } : { soort: 'fout' }
    }
    const som = (samenvatting.data ?? []) as { metric: unknown; p75: unknown; sample_count: unknown }[]
    const dag = (perDag.data ?? []) as { day: unknown; metric: unknown; p75: unknown; sample_count: unknown }[]
    return bronOk({
      dagen: p_days,
      samenvatting: som.flatMap((r) =>
        isMetric(r.metric) && typeof r.p75 === 'number'
          ? [{ metric: r.metric, p75: r.p75, metingen: Number(r.sample_count) || 0 }]
          : [],
      ),
      perDag: dag.flatMap((r) =>
        isMetric(r.metric) && typeof r.p75 === 'number' && typeof r.day === 'string'
          ? [{ dag: r.day.slice(0, 10), metric: r.metric, p75: r.p75, metingen: Number(r.sample_count) || 0 }]
          : [],
      ),
    })
  })
})

// ── Ingrepen ────────────────────────────────────────────────────────

/** Hoever terug de tijdlijn van ingrepen reikt: twee periodes, zodat de vóór-week van een oude ingreep erin valt. */
export function ingrepenVanafDag(nu: Date, dagen: DashboardPeriode): string {
  return verschuifDag(amsterdamDag(nu), -(reeksLengteVoor(dagen) - 1))
}

export interface IngrepenLezing {
  ingrepen: Ingreep[]
  /**
   * Oudste gelezen beheeractie als de bovengrens is geraakt, anders `null`.
   * Beheeracties van vóór dat moment kunnen ontbreken; releases zijn altijd
   * volledig, die komen uit de vrijgavenotities.
   */
  actiesAfgekaptVanaf: string | null
}

const INGREPEN_MAX_ACTIES = 500

/** PostgREST-lijst voor `not.in`: waarden met een punt horen tussen aanhalingstekens. */
const INZAGE_FILTER = `(${INZAGE_ACTIES.map((a) => `"${a}"`).join(',')})`

export const laadIngrepen = cache(async (dagen: DashboardPeriode): Promise<Bron<IngrepenLezing>> => {
  const t = await toegang()
  if (!t) return { soort: 'fout' }
  return lees('ingrepen', async () => {
    const nu = new Date()
    const vanafDag = ingrepenVanafDag(nu, dagen)
    // Inzage valt al in de query weg. Anders kan veel inzage de echte
    // wijzigingen uit het venster van de bovengrens drukken.
    const { data, error } = await t.supabase
      .from('admin_actions_log')
      .select('id, action, target_label, created_at')
      .gte('created_at', beginVanDag(vanafDag))
      .not('action', 'in', INZAGE_FILTER)
      .order('created_at', { ascending: false })
      .limit(INGREPEN_MAX_ACTIES)
    if (error) return { soort: 'fout' }
    const rijen = (data ?? []) as AuditRij[]
    return bronOk({
      ingrepen: bouwIngrepen(RELEASE_NOTES, rijen, vanafDag),
      actiesAfgekaptVanaf:
        rijen.length >= INGREPEN_MAX_ACTIES ? rijen[rijen.length - 1].created_at : null,
    })
  })
})
