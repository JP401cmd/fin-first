import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'

/**
 * Notion-koppeling voor testgebruiker-meldingen (bug / vraag / aanbeveling).
 *
 * Elke melding in `public.user_reports` wordt een kaartje in de bestaande
 * Trifinity-queue, zodat de triage-workflows (`/trifinity-next`,
 * `/trifinity-drain`) ze meteen oppakken. Supabase blijft de bron: de push is
 * best-effort en de syncstatus staat op de rij (`notion_sync_status`), zodat de
 * dagelijkse cron kan herstellen wat live misging.
 *
 * Server-only: dit bestand leest het token uitsluitend via de
 * service-role-client en er is bewust geen client-side Notion-call.
 *
 * LET OP — dat maakt de sleutels nog niet onbereikbaar voor de browser. De
 * SELECT-policy op `app_settings` is een DENYLIST: alles wat niet in een
 * hardcoded lijst staat, is leesbaar voor rol `authenticated`. `notion_api_token`
 * en `notion_reports_data_source_id` stonden daar aanvankelijk NIET in en waren
 * dus gewoon via PostgREST op te vragen. Migratie
 * `20260806160000_app_settings_denylist_notion_secrets` heeft ze toegevoegd
 * (plus het hele `notion_`-voorvoegsel). Zet je hier ooit een nieuwe sleutel
 * bij, breid dan in dezelfde PR de denylist uit — het lek ontstaat bij het
 * INRICHTEN van de koppeling, niet bij het schrijven van deze code. Het
 * structurele punt (fail-open denylist) staat in
 * `lib/architecture/archimate-concerns.ts`.
 */

/** Bucket met de (privé) screenshots; alleen via signed URL benaderbaar. */
const SCREENSHOT_BUCKET = 'user-report-screenshots'

/**
 * 48 uur. Een signed URL is een BEARER-CREDENTIAL: wie de link kopieert haalt
 * het screenshot op zonder in te loggen, en het kaartje leeft in een gedeelde
 * Notion-queue. De houdbaarheid hoort dus bij de triage-duur (uren) en niet bij
 * de bewaartermijn van de melding (een maand was ruim een orde te lang).
 * Verlopen link ≠ verloren beeld: Supabase blijft de bron en er kan altijd een
 * verse URL getekend worden.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 48

/**
 * De houdbaarheid zoals hij op het kaartje komt te staan — AFGELEID van de
 * constante hierboven, nooit los ingetypt. Anders kan de tekst ("geldig 30
 * dagen") stil uit de pas gaan lopen met de werkelijke TTL, en dat is precies
 * hoe de vorige waarde ongemerkt een maand lang bleef staan.
 */
const SIGNED_URL_TTL_LABEL = `${Math.round(SIGNED_URL_TTL_SECONDS / 3600)} uur`

/**
 * Vastgepinde Notion API-versie. `parent: { type: 'data_source_id' }` bestaat
 * pas vanaf 2025-09-03 (de versie die databases opsplitst in data sources);
 * op een oudere versie faalt exact deze payload met een 400. Pin dus expliciet
 * en verhoog alleen bewust, samen met een hertest van de property-mapping.
 */
const NOTION_VERSION = '2025-09-03'

/** Data source van de 🧩 Trifinity-queue; overschrijfbaar via app_settings. */
const DEFAULT_DATA_SOURCE_ID = 'd87e54c5-fb52-4607-a72a-52e4b58ee806'

/** Notion cap't een rich_text-fragment op 2000 tekens; 1900 houdt marge. */
const RICH_TEXT_CAP = 1900

/** Time-out op de Notion-call: een melding mag nooit op de API blijven hangen. */
const NOTION_TIMEOUT_MS = 8000

export type UserReportType = 'bug' | 'vraag' | 'aanbeveling'

/** Rij uit `public.user_reports` zoals de push 'm nodig heeft. */
export interface UserReportRow {
  id: string
  user_id: string
  email: string | null
  report_type: UserReportType
  screen_label: string | null
  description: string
  expected: string | null
  consent_inzage: boolean
  route: string | null
  page_title: string | null
  user_agent: string | null
  viewport: string | null
  app_version: string | null
  screenshot_path: string | null
  notion_page_id: string | null
  notion_sync_status: 'pending' | 'synced' | 'error'
  notion_sync_attempts: number
  notion_last_error: string | null
  created_at: string
}

/** Kolomlijst voor selects — expliciet, nooit `*`. */
export const USER_REPORT_COLUMNS =
  'id, user_id, email, report_type, screen_label, description, expected, consent_inzage, route, page_title, user_agent, viewport, app_version, screenshot_path, notion_page_id, notion_sync_status, notion_sync_attempts, notion_last_error, created_at'

export interface NotionCredentials {
  token: string
  dataSourceId: string
}

/**
 * Lees het Notion-token + de data source uit `app_settings`.
 *
 * Spiegelt het TrueLayer-patroon (`lib/truelayer/client.ts#getCredentials`):
 * lezen gebeurt via de service-role-client, en de sleutels staan sinds
 * `20260806160000` op de SELECT-denylist van `app_settings` zodat een ingelogde
 * gebruiker ze niet rechtstreeks via PostgREST kan opvragen. Die twee dingen
 * horen bij elkaar — zie de waarschuwing in de modulekop: de service-role-client
 * gebruiken schermt op zichzelf niets af.
 *
 * Ontbreekt het token, dan is de koppeling simpelweg niet geconfigureerd — dat
 * is geen fout maar `null`, zodat de melding gewoon in Supabase landt en de cron
 * 'm later alsnog kan pushen.
 *
 * Twee queries per aanroep: roep dit in een lus NIET per rij aan maar één keer
 * ervóór, en geef de uitkomst door aan {@link pushReportToNotion}.
 */
export async function getNotionCredentials(): Promise<NotionCredentials | null> {
  const service = getServiceClient()

  const { data: tokenRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'notion_api_token')
    .maybeSingle()

  const token = typeof tokenRow?.value === 'string' ? tokenRow.value.trim() : ''
  if (!token) return null

  const { data: dataSourceRow } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'notion_reports_data_source_id')
    .maybeSingle()

  const configured =
    typeof dataSourceRow?.value === 'string' ? dataSourceRow.value.trim() : ''

  return { token, dataSourceId: configured || DEFAULT_DATA_SOURCE_ID }
}

// ── Mapping-helpers (puur) ──────────────────────────────────────────────────

/** `Type`-select per meldingssoort. `Vraag` is nieuw; de API maakt 'm aan. */
const NOTION_TYPE_BY_REPORT: Record<UserReportType, string> = {
  bug: 'Bug',
  vraag: 'Vraag',
  aanbeveling: 'Feature',
}

/** Titel-infix per meldingssoort (`…-testbug-…`). */
const TITLE_SLUG_BY_REPORT: Record<UserReportType, string> = {
  bug: 'testbug',
  vraag: 'testvraag',
  aanbeveling: 'testwens',
}

/**
 * `Prioriteit`-select per meldingssoort. Zonder deze property landt elk kaartje
 * uit de app leeg in de queue-sortering, en zakt het weg onder alles wat wél een
 * prio draagt — precies het tegenovergestelde van wat een signaal uit echt
 * gebruik verdient.
 *
 * LET OP — prio en ernst lopen hier BEWUST uiteen: een bug krijgt `P1` terwijl
 * de Severity op `S2 - medium` blijft staan. Dat is geen inconsistentie maar de
 * kern van de keuze: `Severity` beschrijft hoe erg het defect op zichzelf is (dat
 * weten we bij binnenkomst niet, dus een neutrale middenwaarde), `Prioriteit`
 * beschrijft hoe snel we ernaar kijken — en dát is hoog juist omdát een
 * testgebruiker het in de praktijk tegenkwam. Verlaag hier niets "voor de
 * consistentie" met Severity; verhoog de Severity dan liever bij triage.
 *
 * Vragen en wensen zijn geen productieverstoring en gaan onder de lopende
 * backlog door (`P3`); triage mag altijd bijstellen.
 */
const NOTION_PRIORITY_BY_REPORT: Record<UserReportType, string> = {
  bug: 'P1',
  vraag: 'P3',
  aanbeveling: 'P3',
}

/**
 * Zone-tag uit de pathname. UITSLUITEND bestaande `Tags`-opties — een nieuwe
 * optie zou de queue-filters vervuilen. Volgorde = specifiek vóór generiek
 * (budget vóór cashflow, deelpagina's vóór `/overzicht`).
 */
const ZONE_TAG_RULES: { match: (path: string) => boolean; tag: string }[] = [
  { match: (p) => p.startsWith('/beheer'), tag: 'BEHEER' },
  { match: (p) => p.includes('budget'), tag: 'BUDGET' },
  { match: (p) => p.includes('belasting'), tag: 'BELAST' },
  { match: (p) => p.includes('schuld'), tag: 'SCHULD' },
  { match: (p) => p.includes('cashflow') || p.includes('cash'), tag: 'CASH' },
  { match: (p) => p.startsWith('/toekomst'), tag: 'TOEK' },
  { match: (p) => p.startsWith('/mijn'), tag: 'MIJN' },
  // /nieuws en /berichten zijn de Will-oppervlakken in de hoofdnavigatie
  // (lib/nav-config.ts: globalNav) — daar hoort de WILL-tag bij.
  { match: (p) => p.startsWith('/nieuws') || p.startsWith('/berichten'), tag: 'WILL' },
  { match: (p) => p.startsWith('/onboarding') || p === '/start', tag: 'START' },
  { match: (p) => p.startsWith('/overzicht'), tag: 'OVZ' },
]

/** Eén zone-tag uit de pathname; geen match → lege array (geen verzonnen tag). */
export function zoneTagsForPath(pathname: string | null | undefined): string[] {
  if (!pathname) return []
  const path = pathname.toLowerCase().split('?')[0]
  const rule = ZONE_TAG_RULES.find((r) => r.match(path))
  return rule ? [rule.tag] : []
}

/**
 * Vaste herkomst-tag op élk kaartje uit de app. Hiermee filter je in de queue
 * in één klik alles wat uit de meldknop van een testgebruiker komt, los van de
 * zone. Dit is bewust de ENIGE nieuwe Tags-optie die deze koppeling toevoegt —
 * Notion maakt 'm aan bij de eerste push; alle andere tags moeten al bestaan.
 */
export const REPORTER_TAG = 'Testgebruiker'

/** Alle tags voor één melding: herkomst eerst, daarna de zone (indien bekend). */
export function notionTagsForReport(pathname: string | null | undefined): string[] {
  return [REPORTER_TAG, ...zoneTagsForPath(pathname)]
}

/** Kapt een tekst af op `max` tekens met een leesbare ellips. */
function cap(text: string, max = RICH_TEXT_CAP): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** Datum (YYYY-MM-DD) in Europe/Amsterdam — de queue leest Nederlandse dagen. */
function amsterdamDate(iso: string | null | undefined): string {
  const parsed = iso ? new Date(iso) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  // en-CA levert exact het ISO-achtige YYYY-MM-DD-formaat.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Leesbaar tijdstip in Europe/Amsterdam voor het technische codeblok. */
function amsterdamTimestamp(iso: string | null | undefined): string {
  const parsed = iso ? new Date(iso) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date)
}

/** Eerste 6 tekens van de uuid — kort genoeg voor een titel, uniek genoeg. */
function shortId(id: string): string {
  return (id || '').slice(0, 6)
}

/** Het scherm zoals de melder het zag; valt terug op de route. */
function screenLabelOf(row: UserReportRow): string {
  return row.screen_label?.trim() || row.page_title?.trim() || row.route?.trim() || 'onbekend scherm'
}

type RichText = { type: 'text'; text: { content: string } }

function richText(content: string, max = RICH_TEXT_CAP): RichText[] {
  const value = cap(content, max)
  return value ? [{ type: 'text', text: { content: value } }] : []
}

function richTextProp(content: string | null | undefined) {
  return { rich_text: richText((content ?? '').trim()) }
}

/**
 * Een lange tekst als reeks alinea-blokken. Props cappen op ~2000 tekens, de
 * pagina-body niet — daar hoort de VOLLEDIGE tekst te staan, dus knippen we
 * 'm in blokken van maximaal één rich_text-fragment.
 */
function paragraphBlocks(text: string): unknown[] {
  const value = text.trim()
  if (!value) return []
  const chunks: string[] = []
  for (let i = 0; i < value.length; i += RICH_TEXT_CAP) {
    chunks.push(value.slice(i, i + RICH_TEXT_CAP))
  }
  return chunks.map((chunk) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] },
  }))
}

function headingBlock(text: string): unknown {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: richText(text) },
  }
}

/** De technische context als één codeblok — makkelijk te kopiëren bij triage. */
function technicalContext(row: UserReportRow): string {
  return [
    `pathname:   ${row.route ?? '—'}`,
    `pagina:     ${row.page_title ?? '—'}`,
    `user-agent: ${row.user_agent ?? '—'}`,
    `viewport:   ${row.viewport ?? '—'}`,
    `app-versie: ${row.app_version ?? '—'}`,
    `report-id:  ${row.id}`,
    `tijdstip:   ${amsterdamTimestamp(row.created_at)} (Europe/Amsterdam)`,
  ].join('\n')
}

/**
 * Bouwt de volledige body voor `POST /v1/pages`. PUUR — geen IO, geen fetch —
 * zodat de mapping los te testen is (property-namen zijn de kwetsbaarste kant
 * van deze koppeling; ze drift'en zodra iemand in Notion iets hernoemt).
 *
 * `signedUrl` is de tijdelijke link naar het screenshot (of `null`).
 */
export function buildReportPagePayload(
  row: UserReportRow,
  signedUrl: string | null,
  dataSourceId: string = DEFAULT_DATA_SOURCE_ID,
): Record<string, unknown> {
  const isBug = row.report_type === 'bug'
  const date = amsterdamDate(row.created_at)
  const slug = TITLE_SLUG_BY_REPORT[row.report_type]
  const title =
    row.report_type === 'aanbeveling'
      ? `${date}-${slug}-${shortId(row.id)}`
      : `${date}-${slug}-${shortId(row.id)} — ${screenLabelOf(row)}`

  const properties: Record<string, unknown> = {
    Feature: { title: richText(title, 200) },
    Type: { select: { name: NOTION_TYPE_BY_REPORT[row.report_type] } },
    // LET OP: `Status` is in deze database een STATUS-property, geen select.
    // `{ select: … }` levert hier een 400 — de bekendste valkuil van deze koppeling.
    Status: { status: { name: 'Nieuw' } },
    'CC-actie': { select: { name: 'Backlog' } },
    // Op ÉLK kaartje, ook bij vraag/wens — anders sorteert een prio-loze rij
    // onderaan de queue in plaats van op zijn eigen niveau.
    Prioriteit: { select: { name: NOTION_PRIORITY_BY_REPORT[row.report_type] } },
    Tags: { multi_select: notionTagsForReport(row.route).map((name) => ({ name })) },
    'Actual result': richTextProp(row.description),
    Environment: richTextProp(
      [
        row.route ?? '—',
        row.app_version ? `app ${row.app_version}` : null,
        row.viewport,
        row.user_agent,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  }

  if (isBug) {
    // Testgebruikers vullen geen stappen in; het scherm waar het misging is
    // wél het startpunt van elke reproductie — dus dat zetten we hier neer.
    properties['Steps to reproduce'] = richTextProp(
      `Gemeld vanaf: ${screenLabelOf(row)} (${row.route ?? 'route onbekend'}). Zie de omschrijving op de pagina.`,
    )
    properties['Expected result'] = richTextProp(row.expected)
    properties.Severity = { select: { name: 'S2 - medium' } }
  }

  const descriptionHeading =
    row.report_type === 'bug'
      ? 'Wat ging er mis?'
      : row.report_type === 'vraag'
        ? 'De vraag'
        : 'De wens'

  const children: unknown[] = [
    headingBlock(descriptionHeading),
    ...paragraphBlocks(row.description),
  ]

  if (isBug && row.expected?.trim()) {
    children.push(headingBlock('Wat had de melder verwacht?'))
    children.push(...paragraphBlocks(row.expected))
  }

  // Informatieve regel: de toestemming is een bereidheid van de melder, geen
  // technische toegang. Bewust zo geformuleerd dat niemand denkt dat TriFinity
  // hiermee in het account kan kijken — dat kan het niet.
  //
  // ── HET E-MAILADRES VOLGT DE TOESTEMMING ────────────────────────────────────
  // De vraag in het formulier luidt "Mogen we contact met je opnemen …?"; bij een
  // wens wordt hij niet eens gesteld (consent is dan hard `false`). Het adres
  // meesturen naar een verwerker buiten de EU terwijl de melder "nee" antwoordde,
  // is een belofte die het datapad niet nakomt. Operationeel verliezen we niets:
  // `report-id` staat in het technische blok en leidt via `user_reports.user_id`
  // terug naar de melder zodra daar een grond voor is.
  const melderRegel = row.consent_inzage
    ? `Melder: ${row.email ?? 'onbekend'}.`
    : 'Melder: e-mailadres op verzoek (melder gaf geen toestemming voor contact).'

  children.push({
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '🔎' },
      rich_text: richText(
        `Toestemming inzage: ${row.consent_inzage ? 'JA' : 'NEE'} · ${melderRegel} ` +
          'Informatief — dit geeft geen technische toegang tot het account; neem contact op met de melder als je meer nodig hebt.',
      ),
    },
  })

  children.push(headingBlock('Technische context'))
  children.push({
    object: 'block',
    type: 'code',
    code: {
      language: 'plain text',
      rich_text: richText(technicalContext(row), RICH_TEXT_CAP),
    },
  })

  if (signedUrl) {
    children.push({
      object: 'block',
      type: 'image',
      image: { type: 'external', external: { url: signedUrl } },
    })
    children.push(
      ...paragraphBlocks(
        `Signed link, geldig ${SIGNED_URL_TTL_LABEL} — bron blijft Supabase (${row.screenshot_path ?? 'pad onbekend'}). ` +
          'Verlopen? Vraag een verse link op; het beeld zelf blijft bewaard.',
      ),
    )
  }

  return {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties,
    children,
  }
}

// ── Push ────────────────────────────────────────────────────────────────────

export type PushReportResult =
  | { ok: true; pageId: string }
  | { ok: false; reason: 'not-configured' }
  | { ok: false; reason: 'error'; error: string }

/**
 * Korte, servergerichte fouttekst voor `notion_last_error`.
 *
 * LET OP — dit veld is NIET onzichtbaar voor de melder. De eigen-rij
 * SELECT-policy op `user_reports` (nodig voor de throttle-telling) maakt élke
 * kolom van de eigen rij leesbaar, dus ook deze. Het uit onze eigen kolomlijst
 * weglaten zou daar niets aan veranderen — dat is de reden dat we het commentaar
 * corrigeren in plaats van het veld te verstoppen; verstoppen zou schijnzekerheid
 * zijn.
 *
 * De echte waarborg is dus INHOUDELIJK: hier mag uitsluitend een korte
 * technische fout over ONZE koppeling in staan (een Notion-statuscode, een
 * time-out). Nooit een token, nooit gegevens van een andere gebruiker. De
 * huidige bronnen zijn `Error.message` uit deze module en het afgekapte
 * Notion-antwoord; houd dat zo als je hier een foutbron toevoegt.
 */
function shortError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.slice(0, 400)
}

/**
 * Duw één melding naar Notion en werk de syncstatus op de rij bij.
 *
 * Gooit zelf NOOIT: zowel de live route (best-effort na de insert) als de cron
 * moeten door kunnen lopen als Notion plat ligt. `service` is de
 * service-role-client — de rij-update passeert RLS bewust.
 *
 * `credentials` is optioneel. Laat je 'm weg, dan haalt deze functie ze zelf op
 * (handig voor de losse aanroep vanuit de route). Roep je 'm in een LUS aan —
 * zoals de cron doet — geef ze dan mee: anders kost elke rij twee extra
 * `app_settings`-queries, en bij een niet-geconfigureerd token doet de cron dat
 * werk elke dag opnieuw voor dezelfde rijen (`not-configured` hoogt bewust geen
 * pogingen op, dus de batch krimpt nooit).
 */
export async function pushReportToNotion(
  service: SupabaseClient,
  row: UserReportRow,
  credentials?: NotionCredentials | null,
): Promise<PushReportResult> {
  try {
    const resolved = credentials !== undefined ? credentials : await getNotionCredentials()
    if (!resolved) {
      // Niet geconfigureerd is geen fout: attempts blijven staan, zodat de cron
      // het alsnog oppakt zodra het token er is.
      return { ok: false, reason: 'not-configured' }
    }

    // Screenshot als tijdelijke externe URL; mislukt dat, dan gaat het kaartje
    // gewoon zonder beeld mee (de melding is belangrijker dan de illustratie).
    let signedUrl: string | null = null
    if (row.screenshot_path) {
      const { data: signed } = await service.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(row.screenshot_path, SIGNED_URL_TTL_SECONDS)
      signedUrl = signed?.signedUrl ?? null
    }

    const payload = buildReportPagePayload(row, signedUrl, resolved.dataSourceId)

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(NOTION_TIMEOUT_MS),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Notion ${response.status}: ${detail.slice(0, 300)}`)
    }

    const created = (await response.json()) as { id?: string }
    const pageId = created.id ?? null

    await service
      .from('user_reports')
      .update({
        notion_page_id: pageId,
        notion_sync_status: 'synced',
        notion_last_error: null,
      })
      .eq('id', row.id)

    return { ok: true, pageId: pageId ?? '' }
  } catch (err) {
    const error = shortError(err)
    console.error(`[user-reports:notion] push mislukt voor ${row.id}: ${error}`)
    try {
      await service
        .from('user_reports')
        .update({
          notion_sync_status: 'error',
          notion_sync_attempts: (row.notion_sync_attempts ?? 0) + 1,
          notion_last_error: error,
        })
        .eq('id', row.id)
    } catch {
      // Statusbijwerking mag de push-afhandeling nooit alsnog laten klappen.
    }
    return { ok: false, reason: 'error', error }
  }
}
