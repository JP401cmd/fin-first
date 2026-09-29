import { AI_HEALTH_FAILURE_THRESHOLD, AI_HEALTH_META } from '@/lib/ai/ai-health'
import { PAGE_JITTER_MARGIN_HOURS } from '@/lib/job-health'
import { KOPPELING_TABELLEN, KOPPELING_TABEL_LABEL } from '@/lib/beheer/koppelingen-tellingen'
import { formatVitalValue, ratingForValue, type WebVitalMetric } from '@/lib/web-vitals/config'
import { dashboardHref, foutenHref, taakHref, webprestatiesHref } from './doorklik'
import { omgevingTelt, type DashboardFeiten } from './feiten'
import { PROBE_TAAK, metingVers } from './probe'
import {
  INGEST_TAAK,
  RECENT_DAGEN,
  opsomming,
  recentOnvolledigVanaf,
  taakProbleem,
  type AandachtItem,
  type Domein,
  type TaakProbleem,
} from './signalen'
import { recentVanafDag } from './fouten'
import {
  ERNST_RANG,
  MEET_STATUS_RANG,
  isZonderMeting,
  statusToon,
  type Ernst,
  type MeetStatus,
  type StatusToon,
} from './status'

/**
 * De statustabel van het beheerdashboard: per onderdeel één regel met de
 * toestand, de meting, hoe vers die is en de norm waartegen hij is afgezet.
 *
 * Puur. Deelt zijn afleidingen met de aandachtslijst (`signalen.ts`), zodat de
 * tabel en de lijst nooit een ander oordeel over hetzelfde feit vellen.
 *
 * Een onderdeel zonder geldige, actuele meting is nooit gezond: het krijgt
 * `geen-gegevens`, `verouderd` of `meting-mislukt`.
 */

export interface OnderdeelRij {
  id: string
  naam: string
  domein: Domein
  status: MeetStatus
  /** Alleen bij `afwijkend`. */
  ernst: Ernst | null
  /** De meting in één regel, met aantallen. */
  meting: string
  /** Aanvullende feiten en beperkingen, op aanvraag te tonen. */
  details: string[]
  /** Het moment waar de meting over gaat; `null` als de bron er geen draagt. */
  actueelOp: string | null
  /** Wat `actueelOp` is, bv. "laatste uitvoering". */
  actueelLabel: string
  /**
   * De meting is een telling op het moment van laden (geen vastgelegd tijdstip
   * in de bron). Alleen dan mag het scherm "bij het laden" zeggen; een
   * ontbrekend tijdstip zonder deze vlag betekent "nooit" of "niet gelezen".
   */
  geteldBijLaden: boolean
  /** Wanneer dit onderdeel afwijkend heet, en volgens welke bron. */
  norm: string
  href: string
  linkLabel: string
}

function zwaarste(ernsten: readonly Ernst[]): Ernst | null {
  if (ernsten.length === 0) return null
  return [...ernsten].sort((a, b) => ERNST_RANG[a] - ERNST_RANG[b])[0]
}

function nieuwste(momenten: readonly (string | null | undefined)[]): string | null {
  let beste: string | null = null
  for (const m of momenten) {
    if (!m) continue
    if (beste === null || Date.parse(m) > Date.parse(beste)) beste = m
  }
  return beste
}

const leesfout = (
  basis: Pick<OnderdeelRij, 'id' | 'naam' | 'domein' | 'norm' | 'href' | 'linkLabel'>,
): OnderdeelRij => ({
  ...basis,
  status: 'meting-mislukt',
  ernst: null,
  meting: 'De bron kon niet worden gelezen.',
  details: [],
  actueelOp: null,
  actueelLabel: 'gemeten',
  geteldBijLaden: false,
})

// ── Platform ────────────────────────────────────────────────────────

function platformRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'platform',
    naam: 'Platform-status',
    domein: 'technisch' as const,
    norm: 'Afwijkend zodra de onderhoudsmodus aan staat of de noodschakelaar voor AI uit.',
    href: '/beheer/platform',
    linkLabel: 'Platform-status',
  }
  if (feiten.platform.soort !== 'ok') return leesfout(basis)
  const { status, gewijzigdOp } = feiten.platform.data

  const afwijkingen: string[] = []
  if (status.maintenance.enabled) afwijkingen.push('onderhoudsmodus aan')
  if (!status.killSwitches.ai) afwijkingen.push('AI uit')
  const aankondiging = status.announcement.enabled ? 'aankondiging actief' : 'geen aankondiging'

  return {
    ...basis,
    status: afwijkingen.length > 0 ? 'afwijkend' : 'gezond',
    ernst: afwijkingen.length > 0 ? 'hoog' : null,
    meting:
      afwijkingen.length > 0
        ? `${afwijkingen.join(', ')} · ${aankondiging}`
        : `Geen onderhoud, AI-functies aan · ${aankondiging}`,
    details: [],
    actueelOp: gewijzigdOp,
    actueelLabel: 'laatst gewijzigd',
    geteldBijLaden: false,
  }
}

// ── Fin & AI ────────────────────────────────────────────────────────

function aiRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'ai',
    naam: 'Fin & AI',
    domein: 'technisch' as const,
    norm: `Afwijkend vanaf één mislukte aanroep sinds de laatste geslaagde; een storing vanaf ${AI_HEALTH_FAILURE_THRESHOLD}.`,
    href: dashboardHref('ai'),
    linkLabel: 'Fin & AI',
  }
  const { status, failureCount, lastSuccessAt } = feiten.ai

  if (feiten.platform.soort === 'ok' && !feiten.platform.data.status.killSwitches.ai) {
    return {
      ...basis,
      status: 'nvt',
      ernst: null,
      meting: 'Uitgeschakeld via de noodschakelaar; zie Platform-status.',
      details: [],
      actueelOp: lastSuccessAt,
      actueelLabel: 'laatste geslaagde aanroep',
      geteldBijLaden: false,
    }
  }
  if (status === 'unknown') return leesfout(basis)

  const kaart: Record<Exclude<typeof status, 'unknown'>, { status: MeetStatus; ernst: Ernst | null }> = {
    ok: { status: 'gezond', ernst: null },
    idle: { status: 'geen-gegevens', ernst: null },
    attention: { status: 'afwijkend', ernst: 'laag' },
    hapering: { status: 'afwijkend', ernst: 'hoog' },
    storing: { status: 'afwijkend', ernst: 'kritiek' },
  }
  const meting =
    status === 'ok'
      ? 'Laatste aanroep geslaagd, geen mislukte sindsdien.'
      : status === 'idle'
        ? 'Nog geen enkele AI-aanroep vastgelegd.'
        : `${AI_HEALTH_META[status].label}: ${failureCount} mislukte ${failureCount === 1 ? 'aanroep' : 'aanroepen'} sinds de laatste geslaagde.`

  return {
    ...basis,
    ...kaart[status],
    meting,
    details: [],
    actueelOp: lastSuccessAt,
    actueelLabel: 'laatste geslaagde aanroep',
    geteldBijLaden: false,
  }
}

// ── Achtergrondtaken ────────────────────────────────────────────────

const PROBLEEM_TEKST: Record<TaakProbleem, string> = {
  achterstallig: 'loopt achter',
  mislukt: 'laatste uitvoering mislukt',
  nooit: 'nog nooit gedraaid',
  deels: 'leverde niet alles op',
}

function takenRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'taken',
    naam: 'Achtergrondtaken',
    domein: 'technisch' as const,
    norm: `Per taak een eigen venster uit de taakcatalogus, plus ${PAGE_JITTER_MARGIN_HOURS} uur marge voor de spreiding waarmee crons starten.`,
    href: taakHref(),
    linkLabel: 'Achtergrondtaken',
  }
  if (feiten.taken.soort !== 'ok') return leesfout(basis)
  const { standen, cronSecret } = feiten.taken.data
  const nu = new Date(feiten.gemetenOp)
  // Een ontbrekende sleutel op een ontwikkelomgeving zegt niets over productie.
  const sleutelOntbreekt = !cronSecret && omgevingTelt(feiten)

  const bewaakt = standen.filter((s) => s.job.maxAgeHours != null)
  // De bereikbaarheidsmeting is actueel als ze recent liep, ook als ze een
  // onbereikbare dienst vond (zie `probe.ts`).
  const actueel = bewaakt.filter((s) => (s.job.key === PROBE_TAAK ? metingVers(s, nu) : s.health === 'ok')).length
  const onleesbaar = standen.filter((s) => s.health === 'unknown')
  const problemen = standen.flatMap((s) => {
    const p = taakProbleem(s, nu)
    return p ? [{ stand: s, probleem: p }] : []
  })

  const ernst = zwaarste(
    problemen.map(({ probleem }) => (probleem === 'achterstallig' || probleem === 'mislukt' ? 'hoog' : 'middel')),
  )
  const status: MeetStatus =
    problemen.length > 0 || sleutelOntbreekt ? 'afwijkend' : onleesbaar.length > 0 ? 'meting-mislukt' : 'gezond'

  const details = problemen.map(({ stand, probleem }) => `${stand.job.label}: ${PROBLEEM_TEKST[probleem]}`)
  if (sleutelOntbreekt) details.unshift('CRON_SECRET ontbreekt op productie')
  if (!omgevingTelt(feiten)) {
    details.push('De sleutel waarmee crons zich melden (CRON_SECRET) is op deze omgeving niet beoordeeld.')
  }
  for (const s of onleesbaar) details.push(`${s.job.label}: uitvoeringen niet te lezen`)
  const onbewaakt = standen.length - bewaakt.length
  if (onbewaakt > 0) details.push(`${onbewaakt} ${onbewaakt === 1 ? 'taak wordt' : 'taken worden'} bewust niet bewaakt`)

  return {
    ...basis,
    status,
    ernst: status === 'afwijkend' ? (ernst ?? 'kritiek') : null,
    meting: `${actueel} van ${bewaakt.length} bewaakte taken actueel${problemen.length > 0 ? ` · ${problemen.length} met een afwijking` : ''}`,
    details,
    actueelOp: nieuwste(standen.map((s) => s.last?.created_at)),
    actueelLabel: 'laatste uitvoering',
    geteldBijLaden: false,
  }
}

// ── Foutmeldingen ───────────────────────────────────────────────────

function foutenRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'fouten',
    naam: 'Foutmeldingen',
    domein: 'technisch' as const,
    norm: 'Afwijkend zolang er open foutsoorten zijn; een afgevinkte soort die terugkomt weegt zwaarder.',
    href: foutenHref(),
    linkLabel: 'Foutmeldingen',
  }
  if (feiten.fouten.soort !== 'ok') return leesfout(basis)
  const { soorten, afgekapt, vensterGrootte, voorvallen } = feiten.fouten.data

  const open = soorten.filter((s) => s.open)
  const terug = open.filter((s) => s.teruggekomen)
  const recent = soorten.reduce((s, x) => s + x.recent, 0)
  const details: string[] = []
  if (afgekapt) {
    details.push(`Het leesvenster bevat de laatste ${vensterGrootte.toLocaleString('nl-NL')} regels; oudere tellen niet mee.`)
  }
  // Dekt het venster de laatste dagen niet, dan is het aantal een ondergrens.
  const onvolledig =
    recentOnvolledigVanaf(
      feiten.fouten.data,
      recentVanafDag({ nu: new Date(feiten.gemetenOp), recentDagen: RECENT_DAGEN }),
    ) !== null
  const recentTekst = `${onvolledig ? 'minstens ' : ''}${recent} voorvallen in ${RECENT_DAGEN} dagen`

  if (soorten.length === 0) {
    return {
      ...basis,
      status: 'geen-gegevens',
      ernst: null,
      meting: 'Geen foutregels vastgelegd.',
      details: ['Een leeg logboek bewijst niet dat er niets misging: ook een stille logger geeft dit beeld.'],
      actueelOp: null,
      actueelLabel: 'laatste voorval',
      geteldBijLaden: false,
    }
  }

  return {
    ...basis,
    status: open.length > 0 ? 'afwijkend' : 'gezond',
    ernst: open.length === 0 ? null : terug.length > 0 ? 'hoog' : 'middel',
    meting:
      open.length > 0
        ? `${open.length} open van ${soorten.length} soorten${terug.length > 0 ? `, waarvan ${terug.length} teruggekomen` : ''} · ${recentTekst}`
        : `Alle ${soorten.length} soorten afgehandeld · ${recentTekst}`,
    details,
    actueelOp: nieuwste(voorvallen.map((v) => v.created_at)),
    actueelLabel: 'laatste voorval',
    geteldBijLaden: false,
  }
}

// ── Koppelingen ─────────────────────────────────────────────────────

function koppelingenRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'koppelingen',
    naam: 'Koppelingen',
    domein: 'technisch' as const,
    norm: 'Afwijkend bij een onbereikbare dienst, een koppeling met een synchronisatiefout of een mislukte laatste banksynchronisatie.',
    href: '/beheer/integraties',
    linkLabel: 'Integraties',
  }
  if (feiten.koppelingen.soort !== 'ok') return leesfout(basis)
  const { tellingen, probe, banksync } = feiten.koppelingen.data
  const probeStand =
    feiten.taken.soort === 'ok' ? feiten.taken.data.standen.find((s) => s.job.key === PROBE_TAAK) : undefined
  // Vers = de laatste uitvoering is recent, ongeacht haar status (zie `probe.ts`).
  const probeVers = metingVers(probeStand, new Date(feiten.gemetenOp))

  const gemetenTabellen = KOPPELING_TABELLEN.flatMap((t) => {
    const telling = tellingen[t]
    return telling && telling.syncfoutGemeten ? [telling] : []
  })
  const koppelingen = gemetenTabellen.reduce((s, t) => s + t.total, 0)
  const metFout = gemetenTabellen.reduce((s, t) => s + t.withError, 0)
  const bankMislukt = banksync.soort === 'ok' ? banksync.data.gebruikersLaatsteMislukt : 0
  const onbereikbaar = probe && probeVers ? probe.onbereikbaar.length : 0
  // Een telling die niet te lezen was, is een mislukte meting en geen nul.
  const onleesbaar = KOPPELING_TABELLEN.filter((t) => {
    const telling = tellingen[t]
    return telling === null || telling.syncfoutLeesfout
  })

  const delen: string[] = []
  if (probe) delen.push(`${probe.bereikbaar} van ${probe.gemeten} meetbare diensten bereikbaar`)
  delen.push(
    gemetenTabellen.length > 0
      ? `${metFout} van ${koppelingen} koppelingen met een fout`
      : 'koppelingen met een fout: niet te lezen',
  )
  if (banksync.soort === 'ok') {
    const minstens = banksync.data.afgekapt ? 'minstens ' : ''
    delen.push(
      banksync.data.pogingen > 0
        ? `bank: bij ${bankMislukt} van ${minstens}${banksync.data.gebruikers} gebruikers mislukte de laatste synchronisatie`
        : `bank: geen synchronisaties in ${banksync.data.dagen} dagen`,
    )
  }

  const details: string[] = []
  for (const t of KOPPELING_TABELLEN) {
    const telling = tellingen[t]
    if (telling === null) details.push(`${KOPPELING_TABEL_LABEL[t]}: het aantal koppelingen was niet te lezen`)
    else if (telling.syncfoutLeesfout) {
      details.push(`${KOPPELING_TABEL_LABEL[t]}: ${telling.total} koppelingen; hoeveel er een fout dragen, was niet te lezen`)
    } else if (!telling.syncfoutGemeten) {
      details.push(`${KOPPELING_TABEL_LABEL[t]}: ${telling.total} koppelingen; een fout per koppeling wordt niet vastgelegd`)
    }
  }
  if (banksync.soort === 'fout') details.push('Banksynchronisatie: logboek niet te lezen')
  if (banksync.soort === 'ok' && banksync.data.afgekapt) {
    details.push('Banksynchronisatie: de leesactie raakte haar bovengrens; de aantallen zijn een ondergrens.')
  }
  if (probe && probe.begrensd > 0) {
    details.push(`${probe.begrensd} ${probe.begrensd === 1 ? 'dienst begrenst' : 'diensten begrenzen'} ons (telt als bereikbaar)`)
  }
  if (probe && probe.nietMeetbaar > 0) {
    details.push(
      `${probe.nietMeetbaar} ${probe.nietMeetbaar === 1 ? 'dienst is' : 'diensten zijn'} niet van buitenaf te meten (inloggegevens nodig); hun bereikbaarheid is onbekend`,
    )
  }

  const afwijkend = onbereikbaar > 0 || metFout > 0 || bankMislukt > 0
  let status: MeetStatus
  if (afwijkend) status = 'afwijkend'
  else if (probeStand?.health === 'unknown' || banksync.soort === 'fout' || onleesbaar.length > 0) {
    status = 'meting-mislukt'
  } else if (!probe) status = 'geen-gegevens'
  else if (!probeVers) status = 'verouderd'
  else status = 'gezond'

  if (!probeVers && probe) details.unshift('De bereikbaarheidsmeting is verouderd; het aantal bereikbare diensten is van de laatste meting.')

  return {
    ...basis,
    status,
    ernst: afwijkend ? 'hoog' : null,
    meting: delen.join(' · '),
    details,
    actueelOp: probe?.gemetenOp ?? null,
    actueelLabel: 'bereikbaarheid gemeten',
    geteldBijLaden: false,
  }
}

// ── E-mail ──────────────────────────────────────────────────────────

function mailRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'mail',
    naam: 'E-mail',
    domein: 'technisch' as const,
    norm: 'Afwijkend bij een mislukte verzending. Er is geen afleverdoel vastgelegd.',
    href: '/beheer/email',
    linkLabel: 'E-mail',
  }
  if (feiten.mail.soort !== 'ok') return leesfout(basis)
  const m = feiten.mail.data
  const pogingen = m.verzonden + m.mislukt + m.overgeslagen
  const meting = `${m.verzonden} verzonden, ${m.mislukt} mislukt, ${m.overgeslagen} overgeslagen in ${m.dagen} dagen`

  // Of de provider is ingericht, is een instelling van de omgeving: buiten
  // productie zegt die niets over productie en telt dan alleen het logboek.
  const nietIngericht = !m.ingericht && omgevingTelt(feiten)

  let status: MeetStatus
  if (m.mislukt > 0) status = 'afwijkend'
  else if (nietIngericht) status = 'nvt'
  else if (pogingen === 0) status = 'geen-gegevens'
  else if (m.verzonden === 0) status = 'geen-gegevens'
  else status = 'gezond'

  const details: string[] = []
  if (!omgevingTelt(feiten)) {
    details.push('Of de e-mailprovider op productie is ingericht, is op deze omgeving niet beoordeeld.')
  }
  if (status === 'geen-gegevens' && pogingen > 0) {
    details.push('Er is in deze periode niets verzonden; alle pogingen zijn overgeslagen. Dat bewijst niet dat verzenden werkt.')
  }

  return {
    ...basis,
    status,
    ernst: status === 'afwijkend' ? 'middel' : null,
    meting: nietIngericht ? `Geen provider ingericht · ${meting}` : meting,
    details,
    actueelOp: m.laatstePoging,
    actueelLabel: 'laatste poging',
    geteldBijLaden: false,
  }
}

// ── Webprestaties ───────────────────────────────────────────────────

/** De drie Core Web Vitals; FCP en TTFB zijn hulpmetingen en staan op het detailscherm. */
const KERN_VITALS: readonly WebVitalMetric[] = ['LCP', 'INP', 'CLS']

function vitalsRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'vitals',
    naam: 'Webprestaties',
    domein: 'technisch' as const,
    norm: 'Officiële Core Web Vitals-grenzen op de p75: goed, aandacht of slecht.',
    href: webprestatiesHref(7),
    linkLabel: 'Webprestaties',
  }
  if (feiten.vitals.soort === 'fout') return leesfout(basis)
  if (feiten.vitals.soort === 'niet-uitgerold') {
    return {
      ...basis,
      status: 'nvt',
      ernst: null,
      meting: 'De meting is op deze omgeving nog niet uitgerold.',
      details: [],
      actueelOp: null,
      actueelLabel: 'gemeten',
      geteldBijLaden: false,
    }
  }
  const v = feiten.vitals.data
  const gemeten = v.metrics.filter((m) => m.metingen > 0)
  if (gemeten.length === 0) {
    return {
      ...basis,
      status: 'geen-gegevens',
      ernst: null,
      meting: `Geen metingen van productie in de laatste ${v.dagen} dagen.`,
      details: [],
      actueelOp: null,
      actueelLabel: 'gemeten',
      geteldBijLaden: true,
    }
  }

  const oordelen = gemeten.map((m) => ratingForValue(m.metric, m.p75))
  const slecht = oordelen.includes('poor')
  const matig = oordelen.includes('needs-improvement')
  const kern = KERN_VITALS.flatMap((naam) => {
    const m = gemeten.find((x) => x.metric === naam)
    return m ? [`${naam} ${formatVitalValue(naam, m.p75)}`] : []
  })
  const metingen = Math.max(...gemeten.map((m) => m.metingen))

  return {
    ...basis,
    status: slecht || matig ? 'afwijkend' : 'gezond',
    ernst: slecht ? 'hoog' : matig ? 'laag' : null,
    meting: `${kern.join(' · ')} (p75, ${v.dagen} dagen, tot ${metingen.toLocaleString('nl-NL')} metingen per maat)`,
    details: gemeten
      .filter((m) => ratingForValue(m.metric, m.p75) !== 'good')
      .map((m) => `${m.metric} ${formatVitalValue(m.metric, m.p75)}: ${ratingForValue(m.metric, m.p75) === 'poor' ? 'slecht' : 'aandacht'}`),
    actueelOp: null,
    actueelLabel: 'gemeten',
    geteldBijLaden: true,
  }
}

// ── Meldingen van gebruikers ────────────────────────────────────────

function meldingenRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'meldingen',
    naam: 'Meldingen van gebruikers',
    domein: 'functioneel' as const,
    norm: 'Afwijkend als een melding de werkqueue niet bereikt of een gemelde rekenhulp op beoordeling wacht.',
    href: taakHref('user-reports-notion-sync'),
    linkLabel: 'Doorzetten naar de werkqueue',
  }
  if (feiten.meldingen.soort !== 'ok') return leesfout(basis)
  const m = feiten.meldingen.data
  const rekenhulp = feiten.inbakken.calculator_reports

  const delen = [
    `${m.nieuw} nieuw in ${m.dagen} dagen`,
    `${m.wachtend} wachten op doorzetten`,
    `${m.vastgelopen} vastgelopen`,
  ]
  if (rekenhulp != null) delen.push(`${rekenhulp} rekenhulp-meldingen open`)

  const afwijkend = m.vastgelopen > 0 || (rekenhulp ?? 0) > 0
  return {
    ...basis,
    status: afwijkend ? 'afwijkend' : 'gezond',
    ernst: m.vastgelopen > 0 ? 'hoog' : afwijkend ? 'middel' : null,
    meting: delen.join(' · '),
    details: [
      'De afhandeling van meldingen loopt in de werkqueue buiten de app; hoeveel er daar nog open staan, is hier niet te zien.',
      ...(rekenhulp === null ? ['Rekenhulp-meldingen: telling niet te lezen'] : []),
    ],
    actueelOp: null,
    actueelLabel: 'gemeten',
    geteldBijLaden: true,
  }
}

// ── Krant ───────────────────────────────────────────────────────────

function krantRij(feiten: DashboardFeiten): OnderdeelRij {
  const basis = {
    id: 'krant',
    naam: 'Krant',
    domein: 'functioneel' as const,
    norm: 'Afwijkend als een nieuwsbron in de laatste ophaalronde niet te lezen was. Een bron zonder nieuws, zonder model of met een eigen storing telt niet als afwijking.',
    href: '/beheer/nieuws',
    linkLabel: 'Nieuws',
  }
  if (feiten.krant.soort !== 'ok') return leesfout(basis)
  const { bronnen, wachtrij } = feiten.krant.data
  const ingest =
    feiten.taken.soort === 'ok' ? feiten.taken.data.standen.find((s) => s.job.key === INGEST_TAAK) : undefined

  // De telling is van de laatste ophaalronde zelf; een duiding die daarna liep
  // (de ochtendsessie) staat er nog niet in.
  const wachtTekst =
    wachtrij === null
      ? 'wachtrij niet vastgelegd'
      : `${wachtrij} ${wachtrij === 1 ? 'artikel wachtte' : 'artikelen wachtten'} na die ronde op duiding`
  if (!bronnen) {
    return {
      ...basis,
      status: 'geen-gegevens',
      ernst: null,
      meting: `Nog geen ophaalronde vastgelegd · ${wachtTekst}`,
      details: [],
      actueelOp: null,
      actueelLabel: 'laatste ophaalronde',
      geteldBijLaden: false,
    }
  }

  // Alleen een bron die niet te lezen was, is een afwijking. Een bron zonder
  // nieuws of met een eigen storing (klasse let-op) is dat niet: daar valt
  // voor ons niets te repareren. Een bron zonder oorzaak (een ronde van vóór
  // ADR 0176) is niet beoordeeld. Beide staan wel in de details.
  const kapot = bronnen.nietGoed.filter((b) => b.klasse === 'fout')
  const onbeoordeeld = bronnen.nietGoed.filter((b) => b.klasse === 'onbekend')
  const leveren = bronnen.totaal - bronnen.nietGoed.length

  let status: MeetStatus
  if (ingest?.health === 'overdue' || ingest?.health === 'never') status = 'verouderd'
  else if (ingest?.health === 'unknown') status = 'meting-mislukt'
  else if (kapot.length > 0) status = 'afwijkend'
  else if (onbeoordeeld.length === bronnen.totaal && bronnen.totaal > 0) status = 'geen-gegevens'
  else status = 'gezond'

  return {
    ...basis,
    status,
    ernst: status === 'afwijkend' ? 'middel' : null,
    meting: `${leveren} van ${bronnen.totaal} bronnen leveren${kapot.length > 0 ? ` · ${kapot.length} niet te lezen` : ''} · ${wachtTekst}`,
    details: bronnen.nietGoed.map((b) => `${b.label}: ${b.oorzaak}`),
    actueelOp: bronnen.gecontroleerdOp,
    actueelLabel: 'laatste ophaalronde',
    geteldBijLaden: false,
  }
}

// ── Samenstellen ────────────────────────────────────────────────────

/** De statustabel, met wat ingrijpen vraagt bovenaan. */
export function bouwOnderdelen(feiten: DashboardFeiten): OnderdeelRij[] {
  const rijen = [
    platformRij(feiten),
    aiRij(feiten),
    takenRij(feiten),
    foutenRij(feiten),
    koppelingenRij(feiten),
    mailRij(feiten),
    vitalsRij(feiten),
    meldingenRij(feiten),
    krantRij(feiten),
  ]
  return rijen
    .map((rij, index) => ({ rij, index }))
    .sort(
      (a, b) =>
        MEET_STATUS_RANG[a.rij.status] - MEET_STATUS_RANG[b.rij.status] ||
        (a.rij.ernst ? ERNST_RANG[a.rij.ernst] : 9) - (b.rij.ernst ? ERNST_RANG[b.rij.ernst] : 9) ||
        a.index - b.index,
    )
    .map((x) => x.rij)
}

// ── Het oordeel in de kop ───────────────────────────────────────────

export interface DashboardOordeel {
  /** Signalen in de baan "nu". */
  nu: number
  /** Daarvan met ernst kritiek of hoog. */
  dringend: number
  inplannen: number
  /** Onderdelen zonder geldige, actuele meting. */
  zonderMeting: number
  /**
   * Onderdelen die van hun norm afwijken terwijl niets ingrijpen vraagt (een
   * enkele mislukte AI-aanroep, een webprestatie in de categorie aandacht).
   * Alleen gevuld als de lijst "nu" leeg is: dan mag de kop niet "zonder
   * afwijkingen" zeggen.
   */
  afwijkendZonderSignaal: string[]
  toon: StatusToon
  /** De zin voor de kop: `voor` + cursief `oordeel` + `na`. */
  zin: { voor: string; oordeel: string; na: string }
}

/**
 * Eén zin boven het dashboard. Geen samengestelde score: de zin telt wat er in
 * de lijst staat en zegt erbij wat niet gemeten kon worden.
 */
export function bouwOordeel(items: readonly AandachtItem[], rijen: readonly OnderdeelRij[]): DashboardOordeel {
  const nu = items.filter((i) => i.baan === 'nu')
  const dringend = nu.filter((i) => i.ernst === 'kritiek' || i.ernst === 'hoog').length
  const inplannen = items.length - nu.length
  const zonderMeting = rijen.filter((r) => isZonderMeting(r.status)).length

  const blind =
    zonderMeting > 0
      ? `${zonderMeting} ${zonderMeting === 1 ? 'onderdeel heeft' : 'onderdelen hebben'} geen actuele meting`
      : ''

  if (nu.length === 0) {
    const afwijkend = rijen.filter((r) => r.status === 'afwijkend').map((r) => r.naam)
    if (afwijkend.length > 0) {
      const wijkt = `${afwijkend.length === 1 ? opsomming(afwijkend) : `${afwijkend.length} onderdelen`} ${afwijkend.length === 1 ? 'wijkt' : 'wijken'} af van de norm`
      return {
        nu: 0,
        dringend: 0,
        inplannen,
        zonderMeting,
        afwijkendZonderSignaal: afwijkend,
        toon: 'warning',
        zin: {
          voor: 'Het platform vraagt',
          oordeel: 'geen ingrijpen',
          na: `, maar ${wijkt}${blind ? ` en ${blind}` : ''}`,
        },
      }
    }
    return {
      nu: 0,
      dringend: 0,
      inplannen,
      zonderMeting,
      afwijkendZonderSignaal: [],
      toon: zonderMeting > 0 ? 'warning' : 'positive',
      zin: {
        voor: 'Het platform draait',
        oordeel: 'zonder afwijkingen',
        na: blind ? `, maar ${blind}` : '',
      },
    }
  }

  const ergste = zwaarste(nu.map((i) => i.ernst))
  return {
    nu: nu.length,
    dringend,
    inplannen,
    zonderMeting,
    afwijkendZonderSignaal: [],
    toon: statusToon('afwijkend', ergste),
    zin: {
      voor: 'Het platform heeft',
      oordeel: `${nu.length} ${nu.length === 1 ? 'zaak die' : 'zaken die'} nu aandacht ${nu.length === 1 ? 'vraagt' : 'vragen'}`,
      na: dringend > 0 && dringend < nu.length ? `, waarvan ${dringend} dringend` : '',
    },
  }
}
