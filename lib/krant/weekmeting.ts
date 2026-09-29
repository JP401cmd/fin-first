// ── De weekmeting van de Krant in de app (B41) ──────────────────────────────
//
// Elke maandag legt de app zelf de K1-maat vast, als één record met alleen
// tellingen in `job_runs` (taak `krant-weekmeting`). Tot deze kaart deed een
// sessie dat met het draaiboek op kaart 1G; dit bestand is dat draaiboek in
// code.
//
// PUUR: geen IO. `weekmeting-run.ts` leest de tabellen met de service-client en
// geeft de rijen hier doorheen. Drie regels, dezelfde als de rest van de meting:
//
//   1. Herleiden, niet ophogen (importtoets 3). Elk getal is een telling over
//      rijen van één afgesloten Amsterdamse ISO-week, afgeleid op het
//      meetmoment; er is geen teller die wordt opgehoogd. Uitzondering:
//      `backfillResterend` is de stand van de hele tabel op het meetmoment.
//   2. Alleen tellingen (ADR 0146). Geen artikeltekst, geen URL, geen user_id.
//      Lege edities als totaal, per profieltype voor echte lezers
//      k=5-onderdrukt (`onderdrukPerProfieltype`, hetzelfde algoritme als de
//      weekcron) en ongedrukt voor de testaccounts (fictieve persona's).
//      Besluit eigenaar 29 sep: de verdeling van echte lezers staat wél in dit
//      record. Het restrisico uit de security-run (twee correct onderdrukte
//      tabellen over een net iets andere populatie — editie-summary en dit
//      record bij een herhaalde run — geven samen de cel van het verschil
//      prijs) is bewust aanvaard.
//   3. Een drempel is een WAARSCHUWING in het record, geen fout. De runner
//      schrijft het record dan als `partial` (ADR 0178: zichtbaar op
//      /beheer/jobs, geen melding) — een poort die elke week alarmeert, wordt
//      genegeerd.
//
// De G-codes volgen de tekstpoort van 1F fase 2 (B26/B30), afgeleid uit
// `bouwDuidingMeting` zodat er geen tweede telling ontstaat:
//   G1 ongegrond getal/verwijzing (`g1:*`) · G2 datum · G3 meta-commentaar ·
//   G4 kop niet van de bron · G5 grondslag als modeltekst ·
//   G6 doelgroepwoord (poort + harde afwijzing).

import { amsterdamDateString, amsterdamWeekKey } from '@/lib/briefing/snapshot'
import { doelgroepAfwijzingen, type WeekMeting } from './duiding-beheer'
import { isMechanismeId } from './mechanismen'
import { onderdrukPerProfieltype, telProfieltype, type OnderdrukteTelling, type ProfieltypeTelling } from './meting'

export const WEEKMETING_VERSIE = 1

/** De vaste bronsoorten (ADR 0176, CHECK op news_articles.bron_soort). */
export const WEEKMETING_BRONSOORTEN = ['rss', 'web_lijst', 'web_pagina'] as const
export type WeekmetingBronsoort = (typeof WEEKMETING_BRONSOORTEN)[number]

/**
 * Daling van het aandeel met samenvatting t.o.v. de week ervoor die een
 * waarschuwing geeft, in procentpunten. Kleiner is week-op-weekruis bij
 * ~300 artikelen (1 pp ≈ 3 artikelen).
 */
export const SAMENVATTING_DALING_PP = 5

/**
 * Aandeel van de binnengekomen artikelen dat nog in de duidingswachtrij mag
 * staan voordat de week "voorlopig" heet. Daarboven zeggen de dekkingscijfers
 * (rekenend, samenvatting) iets over de wachtrij, niet over de duiding: na
 * een duidingsbump (zoals v3 op 27 sep) staat een hele week weer op `wacht`
 * en duidt de ingest nieuwste eerst, dus een afgesloten week komt als laatste.
 */
export const WACHTRIJ_VOORLOPIG_AANDEEL = 0.1

/** Staat meer dan `WACHTRIJ_VOORLOPIG_AANDEEL` van de week nog op `wacht`? */
export function isVoorlopig(artikelen: { binnen: number; wacht: number }): boolean {
  return artikelen.binnen > 0 && artikelen.wacht / artikelen.binnen > WACHTRIJ_VOORLOPIG_AANDEEL
}

// ── Weekgrenzen ──────────────────────────────────────────────────────────────

const UUR = 3600 * 1000
const DAG = 24 * UUR

/** Het UTC-moment waarop de Amsterdamse kalenderdag `datum` (YYYY-MM-DD) begint. */
function amsterdamMiddernacht(datum: string): Date {
  const [y, m, d] = datum.split('-').map(Number)
  const utcMiddernacht = Date.UTC(y, m - 1, d)
  // Amsterdam is UTC+1 (winter) of UTC+2 (zomer); middernacht valt dus om 22:00
  // of 23:00 UTC de dag ervoor. De eerste kandidaat waarop het in Amsterdam al
  // `datum` is en een milliseconde eerder nog niet, is het begin van de dag.
  for (const offset of [2, 1, 0]) {
    const t = utcMiddernacht - offset * UUR
    if (amsterdamDateString(new Date(t)) === datum && amsterdamDateString(new Date(t - 1)) !== datum) {
      return new Date(t)
    }
  }
  return new Date(utcMiddernacht - UUR)
}

/**
 * Begin (inclusief) en eind (exclusief) van een Amsterdamse ISO-week als
 * UTC-ISO-strings — dezelfde weekindeling als `amsterdamWeekKey`, zodat de
 * grenzen van de lezing en de sleutel van de cohort nooit uiteenlopen.
 */
export function amsterdamWeekGrenzen(weekKey: string): { van: string; tot: string } {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  if (!m) throw new Error(`Ongeldige weeksleutel: ${weekKey}`)
  const jaar = Number(m[1])
  const week = Number(m[2])
  // ISO-week 1 bevat 4 januari; zoek de maandag daarvan en tel door.
  const jan4 = new Date(Date.UTC(jaar, 0, 4))
  const maandag1 = Date.UTC(jaar, 0, 4 - ((jan4.getUTCDay() + 6) % 7))
  const maandag = new Date(maandag1 + (week - 1) * 7 * DAG)
  const volgendeMaandag = new Date(maandag.getTime() + 7 * DAG)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    van: amsterdamMiddernacht(iso(maandag)).toISOString(),
    tot: amsterdamMiddernacht(iso(volgendeMaandag)).toISOString(),
  }
}

/** De weeksleutel zeven dagen vóór `weekKey`. */
export function vorigeWeekKey(weekKey: string): string {
  const { van } = amsterdamWeekGrenzen(weekKey)
  return amsterdamWeekKey(new Date(new Date(van).getTime() - 3 * DAG))
}

// ── Invoer (wat de runner uit de tabellen leest) ─────────────────────────────

/** Eén rij van `news_articles` voor de dekking per bronsoort — alleen status- en soortkolommen. */
export interface WeekmetingArtikelRij {
  id: string
  bron_soort: string | null
  bron_detail: string | null
  duiding_status: string
  /** `duiding->mechanisme->>soort` */
  mechanisme: string | null
  /** `duiding->themas->0->>thema` */
  eerste_thema: string | null
}

/** Eén rij van `krant_edities` (geldende schaduweditie) — geen inhoud, geen profiel. */
export interface WeekmetingEditieRij {
  user_id: string
  profiel_type: string
  leeg: boolean
}

/** Eén rij van `ai_token_usage` — geen user_id. */
export interface WeekmetingTokenRij {
  feature: string
  input_tokens: number | null
  output_tokens: number | null
}

export interface WeekmetingInvoer {
  /** De gemeten (afgesloten) week: cohort op `fetched_at`. */
  week: string
  /** De week van de verversing (editie) waarvan de lege edities zijn geteld. */
  editieWeek: string
  gemetenOp: string
  /** `bouwDuidingMeting(...)` voor `week`; null = geen enkel artikel in die week. */
  duiding: WeekMeting | null
  artikelen: readonly WeekmetingArtikelRij[]
  /** Aantal geduide artikelen met samenvatting per bronsoort (exacte count-query). */
  metSamenvattingPerBronsoort: Readonly<Record<WeekmetingBronsoort, number>>
  /**
   * Idem, over alle rijen van de week zonder bronsoortfilter — de teller van
   * het aandeel, zodat teller en noemer (`geduid`) dezelfde rijen tellen, net
   * als de count van de week ervoor.
   */
  metSamenvattingTotaal: number
  /** De editierun van deze week liep niet volledig (fouten of tijdbudget): de lege edities zijn een ondergrens. */
  editieOnvolledig: boolean
  /** Idem voor de week ervoor — alleen voor de dalingstoets. */
  vorigeWeek: { week: string; geduid: number; metSamenvatting: number } | null
  /** Rijen die de backfill nog moet oppakken (exacte count, zelfde filter als de ingest). */
  backfillResterend: number | null
  edities: readonly WeekmetingEditieRij[]
  /** user_id's van de testaccounts (is_demo_user): hun edities blijven ongedrukt en apart. */
  testaccountIds: ReadonlySet<string>
  tokens: readonly WeekmetingTokenRij[]
  /** Een lezing die op het plafond stopte: het record zegt dat eerlijk. */
  afgekapt: boolean
  /** Leesstappen die mislukten (grep-bare codes, geen foutteksten van de DB). */
  leesfouten: readonly string[]
  /** Rekent een mechanisme? Uit de catalogus in code, nooit uit de modeluitvoer. */
  rekent: (mechanisme: string) => boolean
}

// ── Uitvoer (het record in job_runs.summary) ─────────────────────────────────

export interface BronsoortDekking {
  artikelen: number
  geduid: number
  metSamenvatting: number
  metMechanisme: number
  rekenend: number
  metThema: number
}

export interface WeekmetingWaarschuwing {
  code: string
  tekst: string
}

export interface WeekmetingRecord {
  versie: typeof WEEKMETING_VERSIE
  week: string
  editieWeek: string
  gemetenOp: string
  artikelen: {
    binnen: number
    geduid: number
    wacht: number
    afgewezen: number
    mislukt: number
    teruggetrokken: number
    metMechanisme: number
    rekenend: number
    metThema: number
    /** Door een handmatige inhaalslag geduid — geen meting van het productiemodel. Optioneel voor oude records. */
    handmatig?: number
    metSamenvatting: number
    /** metSamenvatting / geduid (0–1), of null bij 0 geduid. */
    aandeelSamenvatting: number | null
    aandeelThema: number | null
    foutGetalRekenend: number
  }
  /** De tekstpoort per G-code (B30). */
  poort: { g1: number; g2: number; g3: number; g4: number; g5: number; g6: number; groen: number; gedegradeerd: number }
  perBronsoort: Record<WeekmetingBronsoort | 'onbekend', BronsoortDekking>
  artikelpaginas: { gelezen: number; terugval: number; geenHtml: number; backfillResterend: number | null }
  /** Lege edities van de editieweek (zie de kop voor de onderdrukking). */
  verversingen: {
    edities: number
    leeg: number
    /** De editierun liep niet volledig: de tellingen zijn een ondergrens. */
    onvolledig: boolean
    /**
     * Echte lezers, k=5-onderdrukt tegen hun eigen totaal. Optioneel: records
     * van vóór 29 sep dragen dit veld niet.
     */
    perProfieltype?: Record<string, OnderdrukteTelling>
    /** De vijf persona's: fictief, dus ongedrukt. */
    testaccounts: Record<string, ProfieltypeTelling>
  }
  tokens: {
    perFeature: Record<string, { aanroepen: number; input: number; output: number }>
    totaal: { aanroepen: number; input: number; output: number }
  }
  vorigeWeek: { week: string; aandeelSamenvatting: number | null } | null
  afgekapt: boolean
  leesfouten: string[]
  waarschuwingen: WeekmetingWaarschuwing[]
}

function legeDekking(): BronsoortDekking {
  return { artikelen: 0, geduid: 0, metSamenvatting: 0, metMechanisme: 0, rekenend: 0, metThema: 0 }
}

function isBronsoort(waarde: string | null): waarde is WeekmetingBronsoort {
  return waarde !== null && (WEEKMETING_BRONSOORTEN as readonly string[]).includes(waarde)
}

const aandeel = (deel: number, geheel: number): number | null => (geheel > 0 ? deel / geheel : null)

const GEDUID = new Set(['geduid', 'teruggetrokken'])

/** De G-codes uit de duidingsmeting van één week — hergebruik, geen tweede telling. */
export function poortCodes(w: WeekMeting | null): WeekmetingRecord['poort'] {
  if (!w) return { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, groen: 0, gedegradeerd: 0 }
  const perReden = w.poort.perReden
  const g1 = Object.entries(perReden)
    .filter(([code]) => code.startsWith('g1:'))
    .reduce((som, [, n]) => som + n, 0)
  const g6Hard = doelgroepAfwijzingen(w.afgewezenPerCode).reduce((som, [, n]) => som + n, 0)
  return {
    g1,
    g2: perReden['g2:datum'] ?? 0,
    g3: perReden['g3:meta'] ?? 0,
    g4: w.kopNietVanBron,
    g5: w.metModeltekst,
    g6: (perReden['g6:lexicon'] ?? 0) + g6Hard,
    groen: w.poort.groen,
    gedegradeerd: w.poort.gedegradeerd,
  }
}

/** De drempels. Volgorde = ernst: eerst de gebroken beloftes, dan de dekking. */
export function bepaalWaarschuwingen(r: Omit<WeekmetingRecord, 'waarschuwingen'>): WeekmetingWaarschuwing[] {
  const uit: WeekmetingWaarschuwing[] = []
  const p = r.poort
  if (p.g4 > 0) uit.push({ code: 'g4', tekst: `G4: ${p.g4} geduide kop(pen) kwamen niet van de bron` })
  if (p.g5 > 0) uit.push({ code: 'g5', tekst: `G5: ${p.g5} grondslag(en) gemarkeerd als modeltekst` })
  if (r.artikelen.foutGetalRekenend > 0) {
    uit.push({ code: 'fout-getal', tekst: `${r.artikelen.foutGetalRekenend} duiding(en) teruggetrokken om een fout getal bij een rekenend mechanisme` })
  }
  // G1–G3 zijn de tekstpoort die iets tegenhield: een telling in `poort`, geen
  // waarschuwing (besluit eigenaar 29 sep).
  // Staat de week nog grotendeels in de duidingswachtrij, dan zeggen
  // "0 rekenend" en een gedaalde samenvatting niets over de duiding. Dan één
  // waarschuwing "voorlopig" in hun plaats; een herhaalde run later in de week
  // meet dezelfde week opnieuw en wint in de weekreeks.
  const voorlopig = isVoorlopig(r.artikelen)
  if (voorlopig) {
    uit.push({
      code: 'voorlopig',
      tekst: `Voorlopig: ${r.artikelen.wacht} van ${r.artikelen.binnen} artikelen staan nog in de duidingswachtrij`,
    })
  }
  if (!voorlopig && r.artikelen.geduid > 0 && r.artikelen.rekenend === 0) {
    uit.push({ code: 'nul-rekenend', tekst: 'Geen enkel geduid artikel met een rekenend mechanisme deze week' })
  }
  const nu = r.artikelen.aandeelSamenvatting
  const toen = r.vorigeWeek?.aandeelSamenvatting ?? null
  if (!voorlopig && nu !== null && toen !== null && (toen - nu) * 100 >= SAMENVATTING_DALING_PP) {
    uit.push({
      code: 'samenvatting-daalt',
      tekst: `Aandeel met samenvatting daalde van ${Math.round(toen * 100)}% naar ${Math.round(nu * 100)}%`,
    })
  }
  if (r.artikelen.binnen === 0) uit.push({ code: 'geen-artikelen', tekst: 'Geen enkel artikel binnengekomen deze week' })
  const handmatig = r.artikelen.handmatig ?? 0
  if (handmatig > 0) {
    uit.push({
      code: 'handmatig-geduid',
      tekst: `${handmatig} van ${r.artikelen.geduid} duidingen komen uit een handmatige inhaalslag: geen meting van het productiemodel`,
    })
  }
  if (r.verversingen.onvolledig) {
    uit.push({ code: 'editierun-onvolledig', tekst: 'De editierun liep niet volledig: de lege edities zijn een ondergrens' })
  }
  if (r.afgekapt) uit.push({ code: 'afgekapt', tekst: 'Een lezing stopte op het plafond: de tellingen zijn een ondergrens' })
  for (const f of r.leesfouten) uit.push({ code: `lees:${f}`, tekst: `Leesstap mislukt: ${f}` })
  return uit
}

/** Het record van één week. Puur: dezelfde invoer geeft hetzelfde record. */
export function bouwWeekmeting(inv: WeekmetingInvoer): WeekmetingRecord {
  const perBronsoort: WeekmetingRecord['perBronsoort'] = {
    rss: legeDekking(),
    web_lijst: legeDekking(),
    web_pagina: legeDekking(),
    onbekend: legeDekking(),
  }
  const artikelpaginas = { gelezen: 0, terugval: 0, geenHtml: 0, backfillResterend: inv.backfillResterend }
  const gezien = new Set<string>()
  for (const a of inv.artikelen) {
    if (gezien.has(a.id)) continue
    gezien.add(a.id)
    const d = perBronsoort[isBronsoort(a.bron_soort) ? a.bron_soort : 'onbekend']
    d.artikelen++
    if (a.bron_detail === 'gelezen') artikelpaginas.gelezen++
    else if (a.bron_detail === 'terugval') artikelpaginas.terugval++
    else if (a.bron_detail === 'geen_html') artikelpaginas.geenHtml++
    if (!GEDUID.has(a.duiding_status)) continue
    d.geduid++
    // Zelfde regel als bouwDuidingMeting: alleen een mechanisme uit de catalogus telt.
    if (a.mechanisme && isMechanismeId(a.mechanisme)) {
      d.metMechanisme++
      if (inv.rekent(a.mechanisme)) d.rekenend++
    }
    if (a.eerste_thema) d.metThema++
  }
  for (const soort of WEEKMETING_BRONSOORTEN) perBronsoort[soort].metSamenvatting = inv.metSamenvattingPerBronsoort[soort] ?? 0

  const metSamenvatting = inv.metSamenvattingTotaal
  const w = inv.duiding
  const geduid = w?.geduid ?? 0

  // Lege verversingen: één geldende editie per lezer (dubbelen van een
  // gelijktijdige run tellen één keer — dezelfde check-then-act als de cron).
  // Echte lezers per profieltype k=5-onderdrukt tegen hun eigen totaal;
  // testaccounts ongedrukt.
  const testaccounts: Record<string, ProfieltypeTelling> = {}
  const perTypeRuw: Record<string, ProfieltypeTelling> = {}
  const totaalEcht: ProfieltypeTelling = { edities: 0, leeg: 0 }
  const lezers = new Set<string>()
  let edities = 0
  let leeg = 0
  for (const e of inv.edities) {
    if (lezers.has(e.user_id)) continue
    lezers.add(e.user_id)
    edities++
    if (e.leeg) leeg++
    if (inv.testaccountIds.has(e.user_id)) {
      telProfieltype(testaccounts, e.profiel_type, e.leeg)
    } else {
      telProfieltype(perTypeRuw, e.profiel_type, e.leeg)
      totaalEcht.edities++
      if (e.leeg) totaalEcht.leeg++
    }
  }

  const perFeature: WeekmetingRecord['tokens']['perFeature'] = {}
  const totaal = { aanroepen: 0, input: 0, output: 0 }
  for (const t of inv.tokens) {
    const f = (perFeature[t.feature] ??= { aanroepen: 0, input: 0, output: 0 })
    const i = Number.isFinite(t.input_tokens) ? Number(t.input_tokens) : 0
    const o = Number.isFinite(t.output_tokens) ? Number(t.output_tokens) : 0
    f.aanroepen++
    f.input += i
    f.output += o
    totaal.aanroepen++
    totaal.input += i
    totaal.output += o
  }

  const zonderWaarschuwingen: Omit<WeekmetingRecord, 'waarschuwingen'> = {
    versie: WEEKMETING_VERSIE,
    week: inv.week,
    editieWeek: inv.editieWeek,
    gemetenOp: inv.gemetenOp,
    artikelen: {
      binnen: w?.binnen ?? 0,
      geduid,
      wacht: w?.wacht ?? 0,
      afgewezen: w?.afgewezenTotaal ?? 0,
      mislukt: w?.mislukt ?? 0,
      teruggetrokken: w?.teruggetrokkenTotaal ?? 0,
      metMechanisme: w?.metMechanisme ?? 0,
      rekenend: w?.rekenend ?? 0,
      metThema: w?.metThema ?? 0,
      handmatig: w?.handmatig ?? 0,
      metSamenvatting,
      aandeelSamenvatting: aandeel(metSamenvatting, geduid),
      aandeelThema: aandeel(w?.metThema ?? 0, geduid),
      foutGetalRekenend: w?.foutGetalRekenend ?? 0,
    },
    poort: poortCodes(w),
    perBronsoort,
    artikelpaginas,
    verversingen: {
      edities,
      leeg,
      onvolledig: inv.editieOnvolledig,
      perProfieltype: onderdrukPerProfieltype(perTypeRuw, totaalEcht),
      testaccounts,
    },
    tokens: { perFeature, totaal },
    vorigeWeek: inv.vorigeWeek
      ? { week: inv.vorigeWeek.week, aandeelSamenvatting: aandeel(inv.vorigeWeek.metSamenvatting, inv.vorigeWeek.geduid) }
      : null,
    afgekapt: inv.afgekapt,
    leesfouten: [...inv.leesfouten],
  }
  return { ...zonderWaarschuwingen, waarschuwingen: bepaalWaarschuwingen(zonderWaarschuwingen) }
}

// ── Terug lezen op /beheer/nieuws ───────────────────────────────────────────

/** De kolommen die de beheerroute uit job_runs leest. */
export const WEEKMETING_KOLOMMEN = 'status, started_at, summary, error'
export const WEEKMETING_WEKEN_STANDAARD = 12
export const WEEKMETING_WEKEN_MAX = 26

export interface RuweWeekmetingRun {
  status: string
  started_at: string | null
  summary: unknown
  error: string | null
}

export interface WeekmetingReeksRegel {
  status: string
  startedAt: string | null
  record: WeekmetingRecord
}

function isRecord(v: unknown): v is WeekmetingRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Partial<WeekmetingRecord>
  return (
    r.versie === WEEKMETING_VERSIE &&
    typeof r.week === 'string' &&
    !!r.artikelen &&
    !!r.poort &&
    !!r.perBronsoort &&
    !!r.verversingen &&
    !!r.tokens &&
    Array.isArray(r.waarschuwingen)
  )
}

/**
 * De weekreeks, nieuwste week eerst, één regel per week: de LAATSTE run van
 * die week wint (een handmatige herhaling meet dezelfde week opnieuw en geeft,
 * herleid, hetzelfde of een vollediger getal). Een summary die niet parst,
 * valt weg in plaats van een half getal te tonen.
 */
export function bouwWeekreeks(runs: readonly RuweWeekmetingRun[]): WeekmetingReeksRegel[] {
  const perWeek = new Map<string, WeekmetingReeksRegel>()
  for (const run of runs) {
    if (!isRecord(run.summary)) continue
    const regel: WeekmetingReeksRegel = { status: run.status, startedAt: run.started_at, record: run.summary }
    const bestaand = perWeek.get(run.summary.week)
    if (!bestaand || (run.started_at ?? '') > (bestaand.startedAt ?? '')) perWeek.set(run.summary.week, regel)
  }
  return [...perWeek.values()].sort((a, b) => (a.record.week < b.record.week ? 1 : a.record.week > b.record.week ? -1 : 0))
}
