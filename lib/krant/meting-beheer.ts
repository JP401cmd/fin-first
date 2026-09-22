// ── De K1-meting van de schaduweditie, klaar voor /beheer/nieuws ─────────────
//
// De weekcron (app/api/krant/cron) schrijft per run een summary in `job_runs`
// (`job = 'krant-editie'`). Die summary IS de meting: tellingen per run, met de
// verdeling per profieltype al k=5-onderdrukt voor echte gebruikers
// (lib/krant/meting.ts) en ongedrukt voor de vijf testaccounts. Dit bestand
// leest die summary terug en maakt er een tabelvorm van.
//
// CONSUME, DON'T RECOMPUTE — bewust twee dingen NIET:
//  1. De onderdrukking wordt hier niet herhaald of ongedaan gemaakt. Wat de
//     cron als 'klein'/'verborgen' schreef, blijft dat. Er wordt ook nooit een
//     ruwe editie of een profiel gelezen: de cijfers komen uitsluitend uit
//     `job_runs`, dat in de ADR 0146-gate op VRIJ_LEESBAAR staat.
//  2. De verdeling per profieltype van ECHTE gebruikers wordt niet over runs
//     opgeteld. Een onderdrukte cel ('klein') heeft geen getal om op te tellen,
//     en optellen van user-weken is géén k-anonimiteit over personen: dezelfde
//     zestien lezers komen elke week terug. Alleen wat veilig optelbaar is telt
//     op in `totalen`: de publieke totalen (edities/leeg/fouten) en de
//     testaccounts (fictieve persona's).
//
// De summary is jsonb zonder schema-garantie — een oudere run kan een ander
// veld dragen. Alles wordt daarom defensief gelezen: ontbreekt een veld, dan
// is het 0/leeg, en een run zonder herkenbare week valt weg (in plaats van als
// "week undefined" in de tabel te verschijnen).
//
// PUUR: geen IO.

import { celTekst, GEBRUIK_K } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import type { OnderdrukteTelling, MetingCel, ProfieltypeTelling } from './meting'

/** Hoeveel runs de meting standaard toont (≈ een kwartaal aan weekruns). */
export const KRANT_METING_RUNS_STANDAARD = 12
/** Bovengrens op `?runs=`. */
export const KRANT_METING_RUNS_MAX = 52

/** De kolommen die de route uit `job_runs` leest — tellingen, geen inhoud. */
export const KRANT_METING_KOLOMMEN = 'status, started_at, finished_at, duration_ms, summary, error'

/** De rijvorm zoals PostgREST hem levert; `summary` is ongevalideerd jsonb. */
export interface RuweJobRun {
  status: string | null
  started_at: string | null
  finished_at?: string | null
  duration_ms?: number | null
  summary: unknown
  error: string | null
}

export interface KrantMetingTestaccounts {
  gemeten: number
  overlapBeide: number
  alleenMatcher: number
  alleenModel: number
  /** Ongedrukt: de vijf persona's zijn fictief (ADR 0146 raakt ze niet). */
  perProfieltype: Record<string, ProfieltypeTelling>
}

export interface KrantMetingRun {
  /** ISO-week uit de summary (`2026-W39`). */
  week: string
  startedAt: string | null
  durationMs: number | null
  status: 'success' | 'error'
  gebruikers: number
  edities: number
  leeg: number
  overgeslagen: number
  fouten: number
  opgeruimd: number
  kandidaten: number
  kandidatenOngeldig: number
  tijdBudgetOp: boolean
  /** Echte gebruikers — exact zoals de cron ze onderdrukte. Niet optelbaar. */
  perProfieltype: Record<string, OnderdrukteTelling>
  testaccounts: KrantMetingTestaccounts
  fout: string | null
}

export interface KrantMetingTotalen {
  runs: number
  /** Runs waarvan de summary onleesbaar was (oud formaat, of leeg). */
  zonderSummary: number
  edities: number
  leeg: number
  fouten: number
  /** Aandeel lege edities over alle getoonde runs, of null zonder editie. */
  leegAandeel: number | null
  /** Testaccounts opgeteld over de runs — fictief, dus optelbaar. */
  testaccounts: KrantMetingTestaccounts
}

export interface KrantMeting {
  runs: KrantMetingRun[]
  totalen: KrantMetingTotalen
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getal(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function cel(v: unknown): MetingCel {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  // Alles wat geen getal en geen 'klein' is (ook een onleesbaar veld uit een
  // oudere run) wordt 'verborgen': dat markeert "niet getoond" zonder iets over
  // de grootte te beweren, terwijl 'klein' "1 t/m k−1" zou zeggen.
  return v === 'klein' ? 'klein' : 'verborgen'
}

/**
 * De tekst van één onderdrukte cel — via de canonieke {@link celTekst} van de
 * onderdrukking, zodat "< 5" en "verborgen" hier niet opnieuw worden bedacht.
 */
export function metingCelTekst(c: MetingCel, k: number = GEBRUIK_K): string {
  return celTekst(typeof c === 'number' ? { soort: 'waarde', n: c } : { soort: c }, k)
}

/** `{ type: { edities, leeg } }` — de ongedrukte vorm (testaccounts). */
function leesTellingen(v: unknown): Record<string, ProfieltypeTelling> {
  if (!isObject(v)) return {}
  const uit: Record<string, ProfieltypeTelling> = {}
  for (const [type, t] of Object.entries(v)) {
    if (!isObject(t)) continue
    uit[type] = { edities: getal(t.edities), leeg: getal(t.leeg) }
  }
  return uit
}

/** `{ type: { edities, leeg } }` waarbij elk getal ook 'klein'/'verborgen' kan zijn. */
function leesOnderdrukt(v: unknown): Record<string, OnderdrukteTelling> {
  if (!isObject(v)) return {}
  const uit: Record<string, OnderdrukteTelling> = {}
  for (const [type, t] of Object.entries(v)) {
    if (!isObject(t)) continue
    uit[type] = { edities: cel(t.edities), leeg: cel(t.leeg) }
  }
  return uit
}

function leesTestaccounts(v: unknown): KrantMetingTestaccounts {
  const t = isObject(v) ? v : {}
  return {
    gemeten: getal(t.gemeten),
    overlapBeide: getal(t.overlapBeide),
    alleenMatcher: getal(t.alleenMatcher),
    alleenModel: getal(t.alleenModel),
    perProfieltype: leesTellingen(t.perProfieltype),
  }
}

/** Telt de testaccount-verdeling van één run bij het totaal op (muteert `doel`). */
function telTestaccountsOp(doel: Record<string, ProfieltypeTelling>, bron: Record<string, ProfieltypeTelling>): void {
  for (const [type, t] of Object.entries(bron)) {
    const d = (doel[type] ??= { edities: 0, leeg: 0 })
    d.edities += t.edities
    d.leeg += t.leeg
  }
}

/**
 * Zet de ruwe `job_runs`-rijen van `krant-editie` om in de tabel van het
 * meting-paneel. Rijen zonder leesbare week vallen weg en tellen als
 * `zonderSummary`; de volgorde van de invoer blijft behouden (de route
 * sorteert op `started_at desc`).
 */
export function bouwKrantMeting(rijen: readonly RuweJobRun[]): KrantMeting {
  const runs: KrantMetingRun[] = []
  const totalen: KrantMetingTotalen = {
    runs: 0,
    zonderSummary: 0,
    edities: 0,
    leeg: 0,
    fouten: 0,
    leegAandeel: null,
    testaccounts: { gemeten: 0, overlapBeide: 0, alleenMatcher: 0, alleenModel: 0, perProfieltype: {} },
  }

  for (const rij of rijen) {
    totalen.runs++
    const s = isObject(rij.summary) ? rij.summary : null
    const week = s && typeof s.week === 'string' && s.week.length > 0 ? s.week : null
    if (!s || !week) {
      totalen.zonderSummary++
      continue
    }
    const testaccounts = leesTestaccounts(s.testaccounts)
    const run: KrantMetingRun = {
      week,
      startedAt: rij.started_at ?? null,
      durationMs: typeof rij.duration_ms === 'number' ? rij.duration_ms : null,
      status: rij.status === 'error' ? 'error' : 'success',
      gebruikers: getal(s.gebruikers),
      edities: getal(s.edities),
      leeg: getal(s.leeg),
      overgeslagen: getal(s.overgeslagen),
      fouten: getal(s.fouten),
      opgeruimd: getal(s.opgeruimd),
      kandidaten: getal(s.kandidaten),
      kandidatenOngeldig: getal(s.kandidatenOngeldig),
      tijdBudgetOp: s.tijdBudgetOp === true,
      perProfieltype: leesOnderdrukt(s.perProfieltype),
      testaccounts,
      fout: rij.error ?? null,
    }
    runs.push(run)

    totalen.edities += run.edities
    totalen.leeg += run.leeg
    totalen.fouten += run.fouten
    totalen.testaccounts.gemeten += testaccounts.gemeten
    totalen.testaccounts.overlapBeide += testaccounts.overlapBeide
    totalen.testaccounts.alleenMatcher += testaccounts.alleenMatcher
    totalen.testaccounts.alleenModel += testaccounts.alleenModel
    telTestaccountsOp(totalen.testaccounts.perProfieltype, testaccounts.perProfieltype)
  }

  totalen.leegAandeel = totalen.edities > 0 ? totalen.leeg / totalen.edities : null
  return { runs, totalen }
}
