import { AI_HEALTH_FAILURE_THRESHOLD } from '@/lib/ai/ai-health'
import { PAGE_JITTER_MARGIN_HOURS, pageStaleAfterHours } from '@/lib/job-health'
import { verliesRegels, type JobStand } from '@/lib/job-health-loader'
import {
  WEB_VITAL_THRESHOLDS,
  formatVitalValue,
  ratingForValue,
  type WebVitalMetric,
} from '@/lib/web-vitals/config'
import { KOPPELING_TABELLEN, KOPPELING_TABEL_LABEL } from '@/lib/beheer/koppelingen-tellingen'
import { auditHref, dashboardHref, foutenHref, taakHref, webprestatiesHref } from './doorklik'
import { TAAK_GEVOLG, omgevingTelt, type DashboardFeiten, type FoutenFeit } from './feiten'
import {
  AI_FOUT_CONTEXT_PREFIX,
  isAiFout,
  recentVanafDag,
  telGebruikers,
  voorvallenVan,
  type FoutsoortBeeld,
} from './fouten'
import { PROBE_TAAK, heeftMeetuitkomst, metingVers } from './probe'
import { ERNST_RANG, impactRang, type Ernst, type Impact } from './status'
import { dagLabel, dagVanIso } from './tijd'

/**
 * De aandachtslijst van het beheerdashboard: wat vraagt nu ingrijpen, waarom,
 * en met welke gevolgen voor gebruikers.
 *
 * Puur: uit `DashboardFeiten` volgt de lijst, zonder IO en zonder eigen klok.
 *
 * DRIE REGELS DIE HIER VASTLIGGEN
 *
 *  1. Geen eigen drempels. Elk signaal rust op een afleiding die al bestaat
 *     (`deriveJobHealth`, `deriveAiHealth`, de Core Web Vitals-grenzen, de
 *     open-stand van een foutsoort) of op de aanwezigheid van een feit (een
 *     mislukte e-mail is mislukt). Het veld `grond` noemt de regel en zijn bron.
 *  2. Eén incident, één regel. Wat dezelfde oorzaak heeft, staat onder elkaar
 *     in `onderdelen` en niet als losse regels:
 *       - AI-foutsoorten vallen onder de AI-storing;
 *       - taken op hetzelfde cron-pad vallen samen;
 *       - zonder CRON_SECRET vallen alle stille taken onder die ene oorzaak
 *         (stil = geen enkele recente uitvoering; een taak die wél liep en
 *         faalde, heeft een eigen oorzaak en houdt zijn eigen regel);
 *       - de uitkomst van de bereikbaarheidsmeting telt onder Koppelingen, niet
 *         nog eens als gefaalde taak.
 *  3. Samenloop is geen oorzaak. Waar twee signalen samenvallen zonder dat de
 *     bron het verband legt, staat dat in `samenloop`, als waarneming.
 *  4. Alleen een verse meting mag iets beweren. Een signaal dat op een oude
 *     ronde rust (bereikbaarheid, nieuwsbronnen) vervalt; de achterstallige
 *     taak staat dan zelf in de lijst.
 *  5. Instellingen uit de omgeving tellen alleen op productie (`omgevingTelt`).
 *     Op een ontwikkel- of voorbeeldomgeving zegt een ontbrekende sleutel niets
 *     over productie.
 */

export type Baan = 'nu' | 'inplannen'
export type Domein = 'technisch' | 'functioneel'

export interface AandachtActie {
  label: string
  href: string
}

export interface AandachtItem {
  id: string
  /** `nu` = dagelijks beheer; `inplannen` = structurele verbetering of onderhoud. */
  baan: Baan
  ernst: Ernst
  domein: Domein
  titel: string
  /** Wat er aan de hand is. */
  waarom: string
  impact: Impact
  /** Sinds wanneer dit speelt (ISO); `null` als de bron dat niet draagt. */
  sinds: string | null
  /** Wat `sinds` precies is, bv. "laatste geslaagde run". */
  sindsLabel: string
  /** De regel waarop het signaal rust, met zijn bron. */
  grond: string
  /** Wat de beheerder kan onderzoeken of doen. */
  acties: AandachtActie[]
  /** Gebundelde delen van hetzelfde incident. */
  onderdelen: string[]
  samenloop: string | null
}

/** Hoeveel gebundelde delen een regel hoogstens opsomt; de rest staat op het doelscherm. */
export const MAX_ONDERDELEN = 4

/** Venster van "recent" voor fouten, e-mail en banksynchronisatie op het dashboard. */
export const RECENT_DAGEN = 7

const FOUTTEKST_MAX = 160

function kort(tekst: string, max = FOUTTEKST_MAX): string {
  const schoon = tekst.replace(/\s+/g, ' ').trim()
  return schoon.length > max ? `${schoon.slice(0, max - 1)}…` : schoon
}

function meervoud(n: number, enkel: string, meer: string): string {
  return `${n.toLocaleString('nl-NL')} ${n === 1 ? enkel : meer}`
}

/** "A", "A en B", "A, B en C". */
export function opsomming(delen: readonly string[]): string {
  if (delen.length <= 1) return delen[0] ?? ''
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`
}

function beperk(delen: readonly string[]): string[] {
  if (delen.length <= MAX_ONDERDELEN) return [...delen]
  const rest = delen.length - MAX_ONDERDELEN
  return [...delen.slice(0, MAX_ONDERDELEN), `en ${rest} meer`]
}

/** Bewakingsvenster leesbaar: 26 uur blijft uren, 768 uur wordt dagen. */
export function vensterTekst(uren: number): string {
  return uren < 48 ? `${uren} uur` : `${Math.round(uren / 24)} dagen`
}

// ── Platform ────────────────────────────────────────────────────────

function platformItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.platform.soort !== 'ok') return []
  const { status, gewijzigdOp } = feiten.platform.data
  const uit: AandachtItem[] = []

  if (status.maintenance.enabled) {
    uit.push({
      id: 'platform-onderhoud',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: 'Onderhoudsmodus staat aan',
      waarom:
        'Iedereen ziet de onderhoudsbanner, die niet weg te klikken is. Zet de modus uit zodra het onderhoud klaar is.',
      impact: { soort: 'iedereen', toelichting: 'Alle ingelogde gebruikers zien de banner.' },
      sinds: gewijzigdOp,
      sindsLabel: 'instelling laatst gewijzigd',
      grond: 'Instelling platform_status: onderhoud staat aan. Handmatig gezet op Platform-status.',
      acties: [
        { label: 'Platform-status', href: '/beheer/platform' },
        { label: 'Wie wijzigde dit', href: auditHref('config.update') },
      ],
      onderdelen: [],
      samenloop: null,
    })
  }

  if (!status.killSwitches.ai) {
    // De open AI-foutsoorten vallen onder deze regel, wat de AI-gezondheid ook
    // zegt: ze staan dan niet los in de lijst en mogen hier dus niet ontbreken.
    const soorten = aiFoutsoorten(feiten)
    const gestoord = feiten.ai.status === 'storing' || feiten.ai.status === 'hapering'
    const samenloop: string[] = []
    if (soorten.length > 0) {
      samenloop.push(
        `${meervoud(soorten.length, 'open AI-foutsoort valt', 'open AI-foutsoorten vallen')} onder deze regel en ${soorten.length === 1 ? 'staat' : 'staan'} niet apart in de lijst. Op Foutmeldingen ${soorten.length === 1 ? 'blijft hij' : 'blijven ze'} open.`,
      )
    }
    if (gestoord) {
      samenloop.push('Mislukte AI-aanroepen in deze periode vallen samen met de uitgeschakelde AI.')
    }
    uit.push({
      id: 'platform-ai-uit',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: 'AI staat uit via de noodschakelaar',
      waarom: 'Alle AI-functies zijn geblokkeerd: Fin, de briefing, categoriseren en de rekenhulp.',
      impact: { soort: 'iedereen', toelichting: 'Iedereen die een AI-functie gebruikt.' },
      sinds: gewijzigdOp,
      sindsLabel: 'instelling laatst gewijzigd',
      grond: 'Instelling platform_status: de noodschakelaar voor AI staat uit. Handmatig gezet op Platform-status.',
      acties: [
        { label: 'Platform-status', href: '/beheer/platform' },
        { label: 'Wie wijzigde dit', href: auditHref('config.update') },
        ...(soorten.length > 0
          ? [{ label: 'AI-foutmeldingen', href: foutenHref({ context: AI_FOUT_CONTEXT_PREFIX }) }]
          : []),
      ],
      onderdelen: beperk(soorten.map((s) => `${s.context ?? 'ai'} · ${s.voorbeeld}`)),
      samenloop: samenloop.length > 0 ? samenloop.join(' ') : null,
    })
  }

  return uit
}

// ── Fin & AI ────────────────────────────────────────────────────────

/** Is AI bewust uitgezet? Dan is een AI-storing het verwachte gevolg, geen tweede incident. */
function aiBewustUit(feiten: DashboardFeiten): boolean {
  return feiten.platform.soort === 'ok' && !feiten.platform.data.status.killSwitches.ai
}

/** Draagt de lijst een regel waaronder AI-foutsoorten vallen? */
function aiBundelActief(feiten: DashboardFeiten): boolean {
  return aiBewustUit(feiten) || feiten.ai.status === 'storing' || feiten.ai.status === 'hapering'
}

function aiFoutsoorten(feiten: DashboardFeiten): FoutsoortBeeld[] {
  if (feiten.fouten.soort !== 'ok') return []
  return feiten.fouten.data.soorten.filter((s) => s.open && isAiFout(s.context))
}

function aiItems(feiten: DashboardFeiten): AandachtItem[] {
  if (aiBewustUit(feiten)) return []
  const { status, sinceAt, failureCount } = feiten.ai
  if (status !== 'storing' && status !== 'hapering') return []

  const soorten = aiFoutsoorten(feiten)
  const storing = status === 'storing'
  return [
    {
      id: 'ai-gezondheid',
      baan: 'nu',
      ernst: storing ? 'kritiek' : 'hoog',
      domein: 'technisch',
      titel: storing ? 'Fin en de AI-functies werken niet' : 'Fin en de AI-functies haperen',
      waarom: storing
        ? `${meervoud(failureCount, 'aanroep is', 'aanroepen zijn')} mislukt sinds de laatste geslaagde; de provider weigert. Meestal is het tegoed op of is de sleutel ongeldig.`
        : `${meervoud(failureCount, 'aanroep is', 'aanroepen zijn')} mislukt sinds de laatste geslaagde; de laatste fout was tijdelijk van aard.`,
      impact: { soort: 'iedereen', toelichting: 'Iedereen die Fin of een andere AI-functie gebruikt.' },
      sinds: sinceAt,
      sindsLabel: 'eerste mislukte aanroep',
      grond: `${AI_HEALTH_FAILURE_THRESHOLD} of meer mislukte aanroepen sinds de laatste geslaagde (AI-gezondheid, eigenaarsbesluit 5 sep 2026).`,
      acties: [
        { label: 'AI-instellingen', href: '/beheer/ai' },
        { label: 'AI-foutmeldingen', href: foutenHref({ context: AI_FOUT_CONTEXT_PREFIX }) },
        { label: 'Verloop van AI-aanroepen', href: dashboardHref('ai') },
      ],
      onderdelen: beperk(soorten.map((s) => `${s.context ?? 'ai'} · ${s.voorbeeld}`)),
      samenloop:
        soorten.length > 0
          ? `${meervoud(soorten.length, 'open foutsoort hoort', 'open foutsoorten horen')} bij deze storing en ${soorten.length === 1 ? 'staat' : 'staan'} daarom niet apart in de lijst.`
          : null,
    },
  ]
}

// ── Achtergrondtaken ────────────────────────────────────────────────

export type TaakProbleem = 'achterstallig' | 'mislukt' | 'nooit' | 'deels'

/**
 * De bereikbaarheidsmeting is een meting, geen gewone taak (zie `probe.ts`):
 * een uitvoering die op `error` eindigt mét een meetuitkomst, heeft gewoon
 * gemeten. Dat een dienst onbereikbaar was, staat onder Koppelingen.
 */
function probeProbleem(stand: JobStand, nu: Date): TaakProbleem | null {
  if (stand.health === 'never') return 'nooit'
  if (stand.health === 'unknown' || !stand.last) return null
  if (!metingVers(stand, nu)) return 'achterstallig'
  if (stand.last.status === 'error') return heeftMeetuitkomst(stand) ? null : 'mislukt'
  if (stand.last.status === 'partial') return 'deels'
  if (stand.last.status === 'success' && stand.last.error) return 'deels'
  return null
}

/** Wat er met een taak aan de hand is, of `null` als er niets te melden valt. */
export function taakProbleem(stand: JobStand, nu: Date): TaakProbleem | null {
  if (stand.job.key === PROBE_TAAK) return probeProbleem(stand, nu)
  if (stand.health === 'overdue') return 'achterstallig'
  if (stand.health === 'never') return 'nooit'
  // `unknown` is een leesfout, geen eigenschap van de taak: zie metingMislukt.
  if (stand.health === 'unknown' || !stand.last) return null
  if (stand.last.status === 'error') return 'mislukt'
  if (stand.last.status === 'partial') return 'deels'
  // Geslaagd mét fouttekst: de taak liep, maar een deeltaak faalde.
  if (stand.last.status === 'success' && stand.last.error) return 'deels'
  return null
}

const PROBLEEM_ERNST: Record<TaakProbleem, Ernst> = {
  achterstallig: 'hoog',
  mislukt: 'hoog',
  nooit: 'middel',
  deels: 'middel',
}

const PROBLEEM_RANG: Record<TaakProbleem, number> = { achterstallig: 0, mislukt: 1, nooit: 2, deels: 3 }

function zwaarsteImpact(impacts: readonly Impact[]): Impact {
  return [...impacts].sort((a, b) => impactRang(b) - impactRang(a))[0]
}

function taakTitel(labels: readonly string[], probleem: TaakProbleem): string {
  const wie = opsomming(labels)
  const meer = labels.length > 1
  switch (probleem) {
    case 'achterstallig':
      return `${wie} ${meer ? 'lopen' : 'loopt'} achter`
    case 'mislukt':
      return `${wie}: laatste uitvoering mislukt`
    case 'nooit':
      return `${wie} ${meer ? 'hebben' : 'heeft'} nog nooit gedraaid`
    case 'deels':
    default:
      return `${wie} leverde${meer ? 'n' : ''} niet alles op`
  }
}

function taakItem(
  standen: readonly JobStand[],
  probleem: TaakProbleem,
  samenloop: string | null = null,
): AandachtItem {
  const eerste = standen[0]
  const isMeting = eerste.job.key === PROBE_TAAK
  const labels = standen.map((s) => s.job.label)
  const venster = eerste.job.maxAgeHours

  const onderdelen: string[] = []
  for (const s of standen) {
    const voor = standen.length > 1 ? `${s.job.label}: ` : ''
    if (probleem === 'deels') {
      const verlies = verliesRegels(s.last?.summary)
      if (verlies.length > 0) onderdelen.push(...verlies.map((v) => `${voor}${kort(v)}`))
      else if (s.last?.error) onderdelen.push(`${voor}${kort(s.last.error)}`)
    } else if (probleem === 'mislukt' && s.last?.error) {
      onderdelen.push(`${voor}${kort(s.last.error)}`)
    }
  }

  let waarom: string
  let grond: string
  let sinds: string | null
  let sindsLabel: string
  switch (probleem) {
    case 'achterstallig': {
      // Voor de meting telt de laatste uitvoering, ongeacht haar uitkomst.
      const soort = isMeting ? 'uitvoering' : 'geslaagde uitvoering'
      waarom = isMeting
        ? 'De meting is niet op haar geplande moment uitgevoerd.'
        : eerste.last?.status === 'error'
          ? 'De taak draait wel, maar eindigt steeds met een fout.'
          : 'De taak is niet op zijn geplande moment uitgevoerd.'
      grond =
        venster != null
          ? `Geen ${soort} binnen ${vensterTekst(pageStaleAfterHours(venster))} (venster van de taak plus ${PAGE_JITTER_MARGIN_HOURS} uur marge, taakcatalogus).`
          : `Geen ${soort} binnen het venster van de taak (taakcatalogus).`
      sinds = isMeting ? (eerste.last?.created_at ?? null) : eerste.lastSuccessAt
      sindsLabel = isMeting ? 'laatste meting' : 'laatste geslaagde uitvoering'
      break
    }
    case 'mislukt':
      waarom = 'De laatste uitvoering eindigde met een fout. De taak valt nog binnen zijn venster en probeert het op zijn volgende moment opnieuw.'
      grond = 'Laatste regel in job_runs heeft status error.'
      sinds = eerste.last?.created_at ?? null
      sindsLabel = 'mislukte uitvoering'
      break
    case 'nooit':
      waarom = 'De taak wordt bewaakt, maar heeft geen enkele uitvoering vastgelegd.'
      grond = 'Geen regel in job_runs voor een taak met een bewakingsvenster (taakcatalogus).'
      sinds = null
      sindsLabel = 'sinds'
      break
    case 'deels':
    default:
      waarom =
        'De taak liep op tijd, maar een stap leverde niets op. Bij AI-stappen is een leeg tegoed of een uitgeschakeld model de gebruikelijke oorzaak.'
      grond = 'Laatste regel in job_runs heeft status partial, of status success met een fouttekst.'
      sinds = eerste.last?.created_at ?? null
      sindsLabel = 'laatste uitvoering'
      break
  }

  const acties: AandachtActie[] = standen.map((s) => ({
    label: standen.length > 1 ? s.job.label : 'Open de taak',
    href: taakHref(s.job.key),
  }))
  if (standen.some((s) => s.job.key.startsWith('krant-') || s.job.key === 'news-ingest')) {
    acties.push({ label: 'Nieuws en Krant', href: '/beheer/nieuws' })
  }

  return {
    id: `taak-${probleem}-${standen.map((s) => s.job.key).join('+')}`,
    baan: 'nu',
    ernst: PROBLEEM_ERNST[probleem],
    domein: 'technisch',
    titel: taakTitel(labels, probleem),
    waarom,
    impact: zwaarsteImpact(standen.map((s) => TAAK_GEVOLG[s.job.key])),
    sinds,
    sindsLabel,
    grond,
    acties,
    onderdelen: beperk(onderdelen),
    samenloop,
  }
}

/**
 * Stil = de taak legde geen enkele recente uitvoering vast. Een taak die wél
 * liep (en faalde) is aantoonbaar gestart: die valt niet onder een ontbrekende
 * CRON_SECRET.
 */
function isStil(stand: JobStand, probleem: TaakProbleem, nu: Date): boolean {
  if (probleem === 'nooit') return true
  return probleem === 'achterstallig' && !metingVers(stand, nu)
}

function takenItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.taken.soort !== 'ok') return []
  const { standen, cronSecret } = feiten.taken.data
  const nu = new Date(feiten.gemetenOp)
  const uit: AandachtItem[] = []

  const metProbleem = standen
    .map((stand) => ({ stand, probleem: taakProbleem(stand, nu) }))
    .filter((x): x is { stand: JobStand; probleem: TaakProbleem } => x.probleem !== null)

  // Zonder CRON_SECRET weigeren de cron-routes zichzelf vóórdat ze een regel
  // schrijven: elke stille taak heeft dan dezelfde oorzaak. Alleen op
  // productie: elders zegt de sleutel van deze server niets over de crons.
  let stil: typeof metProbleem = []
  let rest = metProbleem
  if (!cronSecret && omgevingTelt(feiten)) {
    stil = metProbleem.filter((x) => isStil(x.stand, x.probleem, nu))
    rest = metProbleem.filter((x) => !isStil(x.stand, x.probleem, nu))
    uit.push({
      id: 'taken-cron-secret',
      baan: 'nu',
      ernst: 'kritiek',
      domein: 'technisch',
      titel: 'CRON_SECRET ontbreekt: geplande taken weigeren zichzelf',
      waarom:
        'Zonder deze sleutel antwoorden de meeste cron-routes met een fout voordat ze iets doen of vastleggen.',
      impact:
        stil.length > 0
          ? zwaarsteImpact(stil.map((x) => TAAK_GEVOLG[x.stand.job.key]))
          : { soort: 'onbekend', toelichting: 'Nog geen taak loopt achter; dat volgt vanzelf.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Omgevingsvariabele CRON_SECRET is niet gezet op productie.',
      acties: [{ label: 'Achtergrondtaken', href: taakHref() }],
      onderdelen: beperk(stil.map((x) => x.stand.job.label)),
      samenloop:
        stil.length > 0
          ? `${meervoud(stil.length, 'stille taak valt', 'stille taken vallen')} onder deze oorzaak en ${stil.length === 1 ? 'staat' : 'staan'} niet apart in de lijst.`
          : null,
    })
  }

  // Taken op hetzelfde cron-pad draaien in één uitvoering: samen één regel.
  const perPad = new Map<string, typeof rest>()
  for (const x of rest) {
    const bak = perPad.get(x.stand.job.path)
    if (bak) bak.push(x)
    else perPad.set(x.stand.job.path, [x])
  }
  // Een taak die niet alles opleverde terwijl de AI gestoord of uitgeschakeld
  // is: dat valt samen. De taak legt de oorzaak niet vast, dus het blijft een
  // waarneming en een eigen regel.
  const naastAi = (probleem: TaakProbleem): string | null =>
    probleem === 'deels' && aiBundelActief(feiten)
      ? 'Valt samen met de AI-storing in deze lijst. Of dat de oorzaak is, legt de taak niet vast.'
      : null

  for (const groep of perPad.values()) {
    const zwaarste = [...groep].sort((a, b) => PROBLEEM_RANG[a.probleem] - PROBLEEM_RANG[b.probleem])[0].probleem
    const zelfde = groep.filter((x) => x.probleem === zwaarste)
    const anders = groep.filter((x) => x.probleem !== zwaarste)
    uit.push(taakItem(zelfde.map((x) => x.stand), zwaarste, naastAi(zwaarste)))
    for (const x of anders) uit.push(taakItem([x.stand], x.probleem, naastAi(x.probleem)))
  }

  return uit
}

// ── Foutmeldingen ───────────────────────────────────────────────────

/**
 * Dekt het leesvenster de recente periode niet? Bij een foutvloed bevat het
 * venster van de laatste regels bijvoorbeeld maar twee dagen. Tellingen over
 * "de laatste 7 dagen" zijn dan een ondergrens. Geeft de dag waarop het venster
 * begint, of `null` als de periode volledig gelezen is.
 */
export function recentOnvolledigVanaf(fouten: FoutenFeit, recentVanaf: string): string | null {
  if (!fouten.afgekapt) return null
  const begin = dagVanIso(fouten.vensterVanaf)
  return begin !== null && begin >= recentVanaf ? begin : null
}

function foutImpact(fouten: FoutenFeit, soorten: readonly FoutsoortBeeld[], recentVanaf: string): Impact {
  const recent = voorvallenVan(fouten.voorvallen, new Set(soorten.map((s) => s.signature)), recentVanaf)
  const telling = telGebruikers(recent)
  const onvolledigVanaf = recentOnvolledigVanaf(fouten, recentVanaf)
  const venster = onvolledigVanaf
    ? ` Het leesvenster begint op ${dagLabel(onvolledigVanaf)}: oudere voorvallen in deze periode zijn niet gelezen.`
    : ''
  if (telling.voorvallen === 0) {
    return onvolledigVanaf
      ? { soort: 'onbekend', toelichting: `Geen voorvallen gelezen in de laatste ${RECENT_DAGEN} dagen.${venster}` }
      : { soort: 'geen-direct', toelichting: `Geen voorvallen in de laatste ${RECENT_DAGEN} dagen.` }
  }
  const zonder =
    telling.zonderGebruiker > 0
      ? `${meervoud(telling.zonderGebruiker, 'voorval draagt', 'voorvallen dragen')} geen gebruiker en ${telling.zonderGebruiker === 1 ? 'telt' : 'tellen'} hier niet mee.`
      : 'Elk voorval draagt een gebruiker.'
  if (telling.gebruikers === 0) {
    return { soort: 'onbekend', toelichting: `${meervoud(telling.voorvallen, 'voorval', 'voorvallen')} in de laatste ${RECENT_DAGEN} dagen, geen enkele met een gebruiker.${venster}` }
  }
  return {
    soort: 'aantal',
    aantal: telling.gebruikers,
    eenheid: 'gebruikers',
    ondergrens: telling.zonderGebruiker > 0 || onvolledigVanaf !== null,
    toelichting: `In de laatste ${RECENT_DAGEN} dagen. ${zonder}${venster}`,
  }
}

function oudste(momenten: readonly (string | null)[]): string | null {
  let beste: string | null = null
  for (const m of momenten) {
    if (!m) continue
    if (beste === null || Date.parse(m) < Date.parse(beste)) beste = m
  }
  return beste
}

function foutRegel(s: FoutsoortBeeld, ondergrens: boolean): string {
  const bron = s.context ? `${s.context} · ` : ''
  return `${bron}${s.voorbeeld} (${ondergrens ? 'minstens ' : ''}${s.recent}× in ${RECENT_DAGEN} dagen)`
}

function foutenItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.fouten.soort !== 'ok') return []
  const fouten = feiten.fouten.data
  const recentVanaf = recentVanafDag({ nu: new Date(feiten.gemetenOp), recentDagen: RECENT_DAGEN })
  const onderAi = aiBundelActief(feiten)

  const open = fouten.soorten.filter((s) => s.open && !(onderAi && isAiFout(s.context)))
  const teruggekomen = open.filter((s) => s.teruggekomen)
  const nieuw = open.filter((s) => !s.teruggekomen)
  const opRecent = (a: FoutsoortBeeld, b: FoutsoortBeeld) => b.recent - a.recent
  const onvolledig = recentOnvolledigVanaf(fouten, recentVanaf) !== null
  const regel = (s: FoutsoortBeeld) => foutRegel(s, onvolledig)
  const vensterNoot = fouten.afgekapt
    ? `Het leesvenster bevat de laatste ${fouten.vensterGrootte.toLocaleString('nl-NL')} regels; oudere voorvallen tellen niet mee.`
    : null
  const uit: AandachtItem[] = []

  if (teruggekomen.length > 0) {
    uit.push({
      id: 'fouten-teruggekomen',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: `${meervoud(teruggekomen.length, 'afgehandelde foutsoort is', 'afgehandelde foutsoorten zijn')} teruggekomen`,
      waarom: 'Deze fouten waren afgevinkt en komen sindsdien opnieuw voor: de oplossing hield geen stand.',
      impact: foutImpact(fouten, teruggekomen, recentVanaf),
      sinds: oudste(teruggekomen.map((s) => s.teruggekomenSinds)),
      sindsLabel: 'eerste voorval na het afvinken',
      grond: 'Een afgevinkte foutsoort met voorvallen na het afvinken heropent zichzelf (foutgroepering, ADR 0113).',
      acties:
        teruggekomen.length === 1
          ? [{ label: 'Open de foutsoort', href: foutenHref({ soort: teruggekomen[0].signature }) }]
          : [{ label: 'Foutmeldingen', href: foutenHref() }],
      onderdelen: beperk([...teruggekomen].sort(opRecent).map(regel)),
      samenloop: vensterNoot,
    })
  }

  if (nieuw.length > 0) {
    uit.push({
      id: 'fouten-open',
      baan: 'nu',
      ernst: 'middel',
      domein: 'technisch',
      titel: `${meervoud(nieuw.length, 'foutsoort staat', 'foutsoorten staan')} open`,
      waarom: 'Nog niet beoordeeld. Vink een soort af zodra hij is afgehandeld; komt hij terug, dan heropent hij zichzelf.',
      impact: foutImpact(fouten, nieuw, recentVanaf),
      sinds: oudste(nieuw.map((s) => s.eerstGezien)),
      sindsLabel: 'oudste open soort',
      grond: 'Open = nooit afgevinkt (foutgroepering, ADR 0113). Dezelfde fout met andere getallen of ids telt als één soort.',
      acties: [
        { label: 'Foutmeldingen', href: foutenHref() },
        { label: 'Verloop per dag', href: dashboardHref('betrouwbaarheid') },
      ],
      onderdelen: beperk([...nieuw].sort(opRecent).map(regel)),
      samenloop: vensterNoot,
    })
  }

  return uit
}

// ── Koppelingen ─────────────────────────────────────────────────────

function koppelingenItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.koppelingen.soort !== 'ok') return []
  const { tellingen, probe, banksync } = feiten.koppelingen.data
  const uit: AandachtItem[] = []

  // Alleen een VERSE meting mag iets beweren; een verouderde staat als
  // achterstallige taak in de lijst en als "verouderd" in de statustabel.
  // Vers = de laatste uitvoering is recent, ook als die op `error` eindigde:
  // dat doet ze juist wanneer een dienst onbereikbaar is (zie `probe.ts`).
  const probeStand =
    feiten.taken.soort === 'ok' ? feiten.taken.data.standen.find((s) => s.job.key === PROBE_TAAK) : undefined
  if (probe && probe.onbereikbaar.length > 0 && probeStand && metingVers(probeStand, new Date(feiten.gemetenOp))) {
    uit.push({
      id: 'koppelingen-onbereikbaar',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: `${meervoud(probe.onbereikbaar.length, 'externe dienst is', 'externe diensten zijn')} onbereikbaar`,
      waarom: `${probe.bereikbaar} van de ${probe.gemeten} meetbare diensten antwoordden. Een dienst die ons begrenst telt als bereikbaar.`,
      impact: {
        soort: 'onbekend',
        toelichting: 'Wie een koppeling bij zo’n dienst heeft, kan niet synchroniseren. Hoeveel gebruikers dat zijn, legt de meting niet vast.',
      },
      sinds: probeStand.lastSuccessAt,
      sindsLabel: 'laatste meting zonder uitval',
      grond: 'Dagelijkse bereikbaarheidsmeting (Integraties liveness); alleen echte onbereikbaarheid telt als uitval.',
      acties: [
        { label: 'Integraties', href: '/beheer/integraties' },
        { label: 'Open de meting', href: taakHref(PROBE_TAAK) },
      ],
      onderdelen: beperk(probe.onbereikbaar),
      samenloop: null,
    })
  }

  const metFout = KOPPELING_TABELLEN.flatMap((tabel) => {
    const t = tellingen[tabel]
    return t && t.syncfoutGemeten && t.withError > 0 ? [{ tabel, ...t }] : []
  })
  if (metFout.length > 0) {
    const totaal = metFout.reduce((s, t) => s + t.withError, 0)
    uit.push({
      id: 'koppelingen-syncfout',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: `${meervoud(totaal, 'koppeling heeft', 'koppelingen hebben')} een synchronisatiefout`,
      waarom: 'De laatste synchronisatie van deze koppelingen mislukte; hun saldi en posities lopen achter.',
      impact: {
        soort: 'aantal',
        aantal: totaal,
        eenheid: 'koppelingen',
        ondergrens: false,
        toelichting: 'Eén gebruiker kan meer dan één koppeling hebben.',
      },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'De koppeling draagt een fouttekst van haar laatste synchronisatie (last_sync_error).',
      acties: [{ label: 'Integraties', href: '/beheer/integraties' }],
      onderdelen: metFout.map((t) => `${KOPPELING_TABEL_LABEL[t.tabel]}: ${t.withError} van ${t.total}`),
      samenloop: null,
    })
  }

  if (banksync.soort === 'ok' && banksync.data.gebruikersLaatsteMislukt > 0) {
    const b = banksync.data
    uit.push({
      id: 'koppelingen-banksync',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: `Bij ${meervoud(b.gebruikersLaatsteMislukt, 'gebruiker', 'gebruikers')} mislukte de laatste banksynchronisatie`,
      waarom: `${b.afgekapt ? 'Minstens ' : ''}${b.mislukt} van de ${b.afgekapt ? 'gelezen ' : ''}${b.pogingen} synchronisaties in de laatste ${b.dagen} dagen mislukten. Bij deze gebruikers was de meest recente er één van.`,
      impact: {
        soort: 'aantal',
        aantal: b.gebruikersLaatsteMislukt,
        eenheid: 'gebruikers',
        ondergrens: b.afgekapt,
        toelichting: b.afgekapt
          ? `Van minstens ${b.gebruikers} gebruikers met een banksynchronisatie in deze periode. De leesactie raakte haar bovengrens; oudere pogingen zijn niet gelezen.`
          : `Van de ${b.gebruikers} gebruikers met een banksynchronisatie in deze periode.`,
      },
      sinds: null,
      sindsLabel: 'sinds',
      grond: `Laatste regel per gebruiker in bank_sync_log van de laatste ${b.dagen} dagen heeft status error.`,
      acties: [
        { label: 'Bank Connect', href: '/beheer/bank-connect' },
        { label: 'Integraties', href: '/beheer/integraties' },
      ],
      onderdelen: [],
      samenloop: null,
    })
  }

  return uit
}

// ── E-mail ──────────────────────────────────────────────────────────

function mailItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.mail.soort !== 'ok') return []
  const m = feiten.mail.data
  const uit: AandachtItem[] = []

  if (m.mislukt > 0) {
    uit.push({
      id: 'mail-mislukt',
      baan: 'nu',
      ernst: 'middel',
      domein: 'technisch',
      titel: `${meervoud(m.mislukt, 'e-mail is', 'e-mails zijn')} niet verzonden`,
      waarom: `In de laatste ${m.dagen} dagen: ${m.verzonden} verzonden, ${m.mislukt} mislukt, ${m.overgeslagen} overgeslagen.`,
      impact: {
        soort: 'aantal',
        aantal: m.mislukt,
        eenheid: 'e-mails',
        ondergrens: false,
        toelichting: 'De ontvanger kreeg het bericht niet; een uitnodiging blijft wel via de link werken.',
      },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Elke poging met status failed in mail_log telt; er is geen drempel vastgelegd.',
      acties: [{ label: 'E-mail', href: '/beheer/email' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  if (!m.ingericht && omgevingTelt(feiten)) {
    uit.push({
      id: 'mail-niet-ingericht',
      baan: 'inplannen',
      ernst: 'middel',
      domein: 'technisch',
      titel: 'Er is geen e-mailprovider ingericht',
      waarom: 'Elke poging wordt als overgeslagen vastgelegd. Uitnodigingen werken via de link; de briefing per e-mail gaat niet uit.',
      impact: { soort: 'onbekend', toelichting: 'Wie een e-mail verwacht, krijgt hem niet.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Omgevingsvariabele RESEND_API_KEY is niet gezet op productie.',
      acties: [{ label: 'E-mail', href: '/beheer/email' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  return uit
}

// ── Webprestaties ───────────────────────────────────────────────────

function vitalsItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.vitals.soort !== 'ok') return []
  const v = feiten.vitals.data
  const slecht = v.metrics.filter((m) => m.metingen > 0 && ratingForValue(m.metric, m.p75) === 'poor')
  if (slecht.length === 0) return []

  const regel = (m: { metric: WebVitalMetric; p75: number; metingen: number }) =>
    `${m.metric}: ${formatVitalValue(m.metric, m.p75)} (grens ${formatVitalValue(m.metric, WEB_VITAL_THRESHOLDS[m.metric].poor)}, ${m.metingen.toLocaleString('nl-NL')} metingen)`

  return [
    {
      id: 'prestaties-slecht',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'technisch',
      titel: `${opsomming(slecht.map((m) => m.metric))} ${slecht.length === 1 ? 'valt' : 'vallen'} in de categorie slecht`,
      waarom: 'De p75 is de waarde die driekwart van de bezoeken haalt of beter; een kwart is dus trager dan dit.',
      impact: { soort: 'iedereen', toelichting: 'Alle bezoekers van de productieomgeving.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: `Officiële Core Web Vitals-grenzen (web.dev/vitals), p75 over de laatste ${v.dagen} dagen op productie.`,
      acties: [{ label: 'Webprestaties', href: webprestatiesHref(7, slecht[0].metric) }],
      onderdelen: slecht.map(regel),
      samenloop: null,
    },
  ]
}

// ── Meldingen van gebruikers ────────────────────────────────────────

function meldingenItems(feiten: DashboardFeiten): AandachtItem[] {
  const uit: AandachtItem[] = []

  if (feiten.meldingen.soort === 'ok' && feiten.meldingen.data.vastgelopen > 0) {
    const m = feiten.meldingen.data
    uit.push({
      id: 'meldingen-vastgelopen',
      baan: 'nu',
      ernst: 'hoog',
      domein: 'functioneel',
      titel: `${meervoud(m.vastgelopen, 'melding van een gebruiker bereikt', 'meldingen van gebruikers bereiken')} de werkqueue niet`,
      waarom: `Het doorzetten naar de werkqueue is ${m.maxPogingen} keer mislukt; de herstel-taak probeert het niet meer. Zet ze met de hand door.`,
      impact: {
        soort: 'aantal',
        aantal: m.vastgelopen,
        eenheid: 'meldingen',
        ondergrens: false,
        toelichting: 'De melder hoort niets terug tot de melding is doorgezet.',
      },
      sinds: null,
      sindsLabel: 'sinds',
      grond: `Melding zonder pagina in de werkqueue na ${m.maxPogingen} pogingen (grens van de herstel-taak).`,
      acties: [{ label: 'Open de herstel-taak', href: taakHref('user-reports-notion-sync') }],
      onderdelen: [],
      samenloop: null,
    })
  }

  const rekenhulp = feiten.inbakken.calculator_reports
  if (rekenhulp != null && rekenhulp > 0) {
    uit.push({
      id: 'inbak-rekenhulp',
      baan: 'nu',
      ernst: 'middel',
      domein: 'functioneel',
      titel: `${meervoud(rekenhulp, 'gemelde rekenhulp wacht', 'gemelde rekenhulpen wachten')} op beoordeling`,
      waarom: 'Een gebruiker meldde een gedeelde rekenhulp. Tot de beoordeling blijft die zichtbaar in de bibliotheek.',
      impact: { soort: 'onbekend', toelichting: 'Iedereen die de bibliotheek opent, kan de gemelde rekenhulp gebruiken.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Meldingen met status open (rekenhulp-meldingen).',
      acties: [{ label: 'Rekenhulp-meldingen', href: '/beheer/calculator-reports' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  const feedback = feiten.inbakken.feedback
  if (feedback != null && feedback > 0) {
    uit.push({
      id: 'inbak-feedback',
      baan: 'inplannen',
      ernst: 'laag',
      domein: 'functioneel',
      titel: `${meervoud(feedback, 'oud feedbackbericht is', 'oude feedbackberichten zijn')} nog niet bekeken`,
      waarom: 'Het formulier is gesloten; dit archief groeit niet meer. Nieuwe meldingen komen via de chat binnen.',
      impact: { soort: 'geen-direct', toelichting: 'Er komt niets nieuws bij.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Berichten met status new in het feedbackarchief (ADR 0096).',
      acties: [{ label: 'Feedback (archief)', href: '/beheer/feedback' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  return uit
}

// ── Krant ───────────────────────────────────────────────────────────

/** De taak die de nieuwsbronnen ophaalt en hun gezondheid vastlegt. */
export const INGEST_TAAK = 'news-ingest'

/**
 * Is de laatste ophaalronde recent genoeg om iets over de bronnen te zeggen?
 * Zonder taakgegevens is dat niet vast te stellen, en dan beweert het
 * dashboard niets.
 */
export function ophaalrondeVers(feiten: DashboardFeiten): boolean {
  if (feiten.taken.soort !== 'ok') return false
  const ingest = feiten.taken.data.standen.find((s) => s.job.key === INGEST_TAAK)
  return ingest !== undefined && (ingest.health === 'ok' || ingest.health === 'unmonitored')
}

function krantItems(feiten: DashboardFeiten): AandachtItem[] {
  if (feiten.krant.soort !== 'ok' || !feiten.krant.data.bronnen) return []
  // Een oude ronde zegt niets over de bronnen van nu; de achterstallige
  // ophaaltaak staat dan zelf in de lijst.
  if (!ophaalrondeVers(feiten)) return []
  const { bronnen } = feiten.krant.data
  const kapot = bronnen.nietGoed.filter((b) => b.klasse === 'fout')
  if (kapot.length === 0) return []

  return [
    {
      id: 'krant-bronnen',
      baan: 'nu',
      ernst: 'middel',
      domein: 'functioneel',
      titel: `${meervoud(kapot.length, 'nieuwsbron is', 'nieuwsbronnen zijn')} niet te lezen`,
      waarom: `In de laatste ophaalronde leverden ${bronnen.totaal - bronnen.nietGoed.length} van de ${bronnen.totaal} bronnen. Een bron die zelf een storing meldt of niets nieuws had, telt hier niet mee.`,
      impact: { soort: 'iedereen', toelichting: 'De Krant mist het nieuws van deze bronnen.' },
      sinds: bronnen.gecontroleerdOp,
      sindsLabel: 'laatste ophaalronde',
      grond: 'Oorzaak per bron uit de laatste ophaalronde; onbereikbaar of onbruikbaar antwoord telt als fout (brongezondheid, ADR 0176).',
      acties: [{ label: 'Nieuwsbronnen', href: '/beheer/nieuws' }],
      onderdelen: beperk(kapot.map((b) => `${b.label}: ${b.oorzaak}`)),
      samenloop: null,
    },
  ]
}

// ── Inplannen: onderhoud zonder haast ───────────────────────────────

function onderhoudItems(feiten: DashboardFeiten): AandachtItem[] {
  const uit: AandachtItem[] = []

  if (feiten.taken.soort === 'ok') {
    const { drift, pushKanaal } = feiten.taken.data
    const regels = [
      ...drift.unscheduledJobs.map((j) => `${j.label} staat in de catalogus, maar is niet ingepland`),
      ...drift.unknownCrons.map((c) => `${c.path} is ingepland, maar wordt niet bewaakt`),
    ]
    if (regels.length > 0) {
      uit.push({
        id: 'taken-drift',
        baan: 'inplannen',
        ernst: 'middel',
        domein: 'technisch',
        titel: 'Het cron-schema en de taakcatalogus lopen uiteen',
        waarom: 'Een taak zonder cron draait niet vanzelf; een cron zonder catalogusregel wordt niet bewaakt.',
        impact: { soort: 'geen-direct', toelichting: 'Pas merkbaar als de betreffende taak uitblijft.' },
        sinds: null,
        sindsLabel: 'sinds',
        grond: 'Vergelijking van de paden in vercel.json met de taakcatalogus.',
        acties: [{ label: 'Achtergrondtaken', href: taakHref() }],
        onderdelen: beperk(regels),
        samenloop: null,
      })
    }
    if (!pushKanaal && omgevingTelt(feiten)) {
      uit.push({
        id: 'taken-push',
        baan: 'inplannen',
        ernst: 'laag',
        domein: 'technisch',
        titel: 'Het meldkanaal is niet ingericht',
        waarom: 'De meldingen-sweep draait en legt zijn uitkomst vast, maar stuurt niets. Nieuwe fouten en stille taken zie je alleen hier.',
        impact: { soort: 'geen-direct', toelichting: 'Gebruikers merken niets; een storing valt later op.' },
        sinds: null,
        sindsLabel: 'sinds',
        grond: 'NTFY_TOPIC ontbreekt of NTFY_SERVER is geen https-adres op productie.',
        acties: [{ label: 'Achtergrondtaken', href: taakHref('alerts-sweep') }],
        onderdelen: [],
        samenloop: null,
      })
    }
  }

  if (feiten.fiscaal.open > 0) {
    uit.push({
      id: 'fiscaal-checklist',
      baan: 'inplannen',
      ernst: 'laag',
      domein: 'functioneel',
      titel: `${meervoud(feiten.fiscaal.open, 'fiscaal kerngetal is', 'fiscale kerngetallen zijn')} nog niet nagelopen voor ${feiten.fiscaal.doeljaar}`,
      waarom: 'Jaargebonden constanten krijgen elk jaar een nieuwe waarde. Zonder die waarde rekent de app door met het oude jaar.',
      impact: { soort: 'geen-direct', toelichting: `Pas merkbaar bij berekeningen over ${feiten.fiscaal.doeljaar}.` },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Jaar-checklist: kerngetallen zonder jaarlaag voor het doeljaar, of zonder jaarlagen.',
      acties: [{ label: 'Fiscale kerngetallen', href: '/beheer/fiscale-kerngetallen' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  if (feiten.fiscaal.driftOpen > 0) {
    uit.push({
      id: 'fiscaal-drift',
      baan: 'inplannen',
      ernst: 'middel',
      domein: 'functioneel',
      titel: `${meervoud(feiten.fiscaal.driftOpen, 'fiscaal getal staat', 'fiscale getallen staan')} op meer dan één plek`,
      waarom: 'Een getal dat twee keer is vastgelegd, loopt bij de volgende jaarwissel uiteen.',
      impact: { soort: 'onbekend', toelichting: 'Twee schermen kunnen een ander bedrag tonen.' },
      sinds: null,
      sindsLabel: 'sinds',
      grond: 'Drift-punten met status open in de inventaris van fiscale kerngetallen.',
      acties: [{ label: 'Fiscale kerngetallen', href: '/beheer/fiscale-kerngetallen' }],
      onderdelen: [],
      samenloop: null,
    })
  }

  return uit
}

// ── Metingen die mislukten ──────────────────────────────────────────

/** Onderdelen waarvan de bron niet gelezen kon worden. */
export function mislukteMetingen(feiten: DashboardFeiten): string[] {
  const uit: string[] = []
  const bronnen: [string, { soort: string }][] = [
    ['Platform-status', feiten.platform],
    ['Achtergrondtaken', feiten.taken],
    ['Foutmeldingen', feiten.fouten],
    ['Koppelingen', feiten.koppelingen],
    ['E-mail', feiten.mail],
    ['Webprestaties', feiten.vitals],
    ['Meldingen van gebruikers', feiten.meldingen],
    ['Krant', feiten.krant],
  ]
  for (const [naam, bron] of bronnen) if (bron.soort === 'fout') uit.push(naam)
  if (feiten.ai.status === 'unknown') uit.push('Fin & AI')
  if (feiten.taken.soort === 'ok') {
    for (const s of feiten.taken.data.standen) if (s.health === 'unknown') uit.push(`Taak ${s.job.label}`)
  }
  if (feiten.koppelingen.soort === 'ok') {
    const { tellingen, banksync } = feiten.koppelingen.data
    if (banksync.soort === 'fout') uit.push('Banksynchronisatie')
    for (const tabel of KOPPELING_TABELLEN) {
      const telling = tellingen[tabel]
      if (telling === null) uit.push(`${KOPPELING_TABEL_LABEL[tabel]}: aantal koppelingen`)
      else if (telling.syncfoutLeesfout) uit.push(`${KOPPELING_TABEL_LABEL[tabel]}: koppelingen met een fout`)
    }
  }
  if (feiten.inbakken.calculator_reports === null) uit.push('Rekenhulp-meldingen')
  if (feiten.inbakken.feedback === null) uit.push('Feedbackarchief')
  return uit
}

function metingItems(feiten: DashboardFeiten): AandachtItem[] {
  const mislukt = mislukteMetingen(feiten)
  if (mislukt.length === 0) return []
  return [
    {
      id: 'meting-mislukt',
      baan: 'nu',
      ernst: 'middel',
      domein: 'technisch',
      titel: `${meervoud(mislukt.length, 'onderdeel kon', 'onderdelen konden')} niet worden gemeten`,
      waarom: 'De bron was niet te lezen. Dat zegt niets over het onderdeel zelf, alleen dat dit scherm er nu geen zicht op heeft.',
      impact: { soort: 'onbekend', toelichting: 'Zonder meting is niet te zeggen of gebruikers iets merken.' },
      sinds: feiten.gemetenOp,
      sindsLabel: 'gemeten op',
      grond: 'Een leesfout telt nooit als gezond.',
      acties: [{ label: 'Foutmeldingen', href: foutenHref() }],
      onderdelen: beperk(mislukt),
      samenloop: null,
    },
  ]
}

// ── Samenstellen en ordenen ─────────────────────────────────────────

const BAAN_RANG: Record<Baan, number> = { nu: 0, inplannen: 1 }

/**
 * Volgorde: baan, dan ernst, dan gebruikersimpact, dan duur (langst lopend
 * eerst). Een signaal zonder bekend begin komt na de signalen mét.
 */
export function sorteerAandacht(items: readonly AandachtItem[]): AandachtItem[] {
  const tijd = (i: AandachtItem) => {
    const ms = i.sinds ? Date.parse(i.sinds) : NaN
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
  }
  return [...items].sort(
    (a, b) =>
      BAAN_RANG[a.baan] - BAAN_RANG[b.baan] ||
      ERNST_RANG[a.ernst] - ERNST_RANG[b.ernst] ||
      impactRang(b.impact) - impactRang(a.impact) ||
      tijd(a) - tijd(b) ||
      a.id.localeCompare(b.id),
  )
}

export function bouwAandacht(feiten: DashboardFeiten): AandachtItem[] {
  return sorteerAandacht([
    ...platformItems(feiten),
    ...aiItems(feiten),
    ...takenItems(feiten),
    ...foutenItems(feiten),
    ...koppelingenItems(feiten),
    ...mailItems(feiten),
    ...vitalsItems(feiten),
    ...meldingenItems(feiten),
    ...krantItems(feiten),
    ...metingItems(feiten),
    ...onderhoudItems(feiten),
  ])
}
