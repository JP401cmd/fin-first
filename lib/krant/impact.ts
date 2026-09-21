// ── Impact per mechanisme: de rekenfuncties op de bandranden ─────────────────
//
// De duiding (1A) levert per artikel een mechanisme met NIEUW aangekondigde
// params, gegrond en plausibel. Dit bestand legt die naast de HUIDIGE waarde
// en rekent op de twee randen van de profielband uit wat het scheelt:
// `{ lo, hi }` in euro's per jaar (of maanden, bij de AOW-leeftijd).
//
// Grondslag-regel (zwaarste reviewbevinding van 1A): een getal hier komt
// UITSLUITEND uit
//   (a) de canonieke rekenmotoren — computeBox3Heffing, computeBox1Tax,
//       grossFromNet, lookupAowAge — of de canonieke constanten
//       (BOX3_PARAMS, BOX1_PARAMS, ZORG_EIGEN_RISICO, DUO_RENTE_PCT), of
//   (b) de mechanisme-params die de 1A-codecontroles doorstonden.
// Nooit uit `summary`, nooit uit modeltekst. De uitkomst is een BEREIK, geen
// puntschatting: de Krant kent banden, geen bedragen.
//
// Drie uitkomsten, alle drie eerlijk:
//   bereik     — lo/hi (hi = null bij een open band: "minstens")
//   ontbreekt  — een profielveld is null; het sjabloon "wat mist" vraagt erom
//   onbekend   — de som is niet te maken zonder te gokken (de drempel valt
//                binnen de band, het jaar ervóór is niet canoniek bekend, de
//                richting verschilt per rand, het besluit raakt een ander
//                cohort). Dan blijft het bericht `relevant`.
//
// Alles wat de uitkomst beïnvloedt komt via `ImpactContext` binnen (geen
// Date.now(), geen directe tabel-import in de rekenfuncties zelf), zodat de
// golden tests reproduceerbaar zijn en een parameter-jaar bewust wisselt.
//
// euro-only (B2, ADR 0172): geen dagtarief, geen vrijheidstijd — bewaakt door
// lib/krant/euro-only.test.ts.
//
// PUUR: geen IO.

import { computeBox3Heffing, BOX3_PARAMS, type Box3Params, type TaxYear } from '@/lib/box3-data'
import { computeBox1Tax, grossFromNet, BOX1_PARAMS, type Box1Params, type Box1TaxYear } from '@/lib/box1-tax'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { ZORG_EIGEN_RISICO, ZORG_EIGEN_RISICO_VANAF_LEEFTIJD, DUO_RENTE_PCT, KRANT_GEVOELIGHEID_STAP_PP } from '@/lib/constants'
import { type MechanismeParams, type MechanismeVorm, MECHANISMEN } from './mechanismen'
import type { DuidingV1 } from './duiding-schema'
import type { DoelgroepSleutel } from './profiel-velden'
import {
  BELEGGINGEN_BANDEN,
  HYPOTHEEK_RESTSCHULD_BANDEN,
  INKOMEN_BANDEN,
  SPAARGELD_BANDEN,
  STUDIESCHULD_BANDEN,
  isStudieschuldBand,
  type Band,
  type NieuwsprofielV1,
} from './profiel'

// ── Types ────────────────────────────────────────────────────────────────────

export type ImpactEenheid = 'eur-per-jaar' | 'maanden'
export type ImpactRichting = 'meer' | 'minder' | 'geen'

export type OnbekendReden =
  | 'drempel-in-band'
  | 'jaar-onbekend'
  | 'geen-canonieke-waarde'
  | 'richting-onbepaald'
  | 'open-band'
  | 'rente-staat-vast'
  | 'niet-afleidbaar'
  | 'buiten-besluit'
  | 'niet-rekenend'

export interface ImpactBereik {
  soort: 'bereik'
  lo: number
  /** null = open band: alleen een ondergrens bekend ("minstens"). */
  hi: number | null
  eenheid: ImpactEenheid
  /** Richting van het verschil voor de lezer: meer/minder belasting, rente, kosten. */
  richting: ImpactRichting
  /** De vorm waarin het sjabloon dit brengt; kan gedegradeerd zijn (direct → gevoeligheid). */
  vorm: MechanismeVorm
  /** Het jaar waarvoor de nieuwe waarde geldt (de huidige waarde is die van het jaar ervoor of het laatst bekende). */
  jaar: number | null
  /** Alleen bij aow-leeftijd: oud en nieuw als fractionele leeftijd, per bandrand. */
  aow?: { oud: [number, number]; nieuw: [number, number] }
  /** Alleen bij eigen-risico: oud en nieuw bedrag. */
  eigenRisico?: { oud: number; nieuw: number }
}

export type ImpactUitkomst =
  | ImpactBereik
  | { soort: 'ontbreekt'; velden: DoelgroepSleutel[] }
  | { soort: 'onbekend'; reden: OnbekendReden }

export interface ImpactContext {
  /** Rijen uit `aow_leeftijd` (via getAowLeeftijden) — nooit zelf gelezen hier. */
  aowRows: AowLeeftijdRow[]
  /** Het jaar van `now`, voor leeftijd en "al met AOW". */
  peiljaar: number
  box3: Readonly<Record<TaxYear, Box3Params>>
  box1: Readonly<Record<Box1TaxYear, Box1Params>>
  eigenRisico: Readonly<Record<number, number>>
  duoRente: Readonly<Record<number, { readonly sf15: number; readonly sf35: number }>>
  /** Stap voor de gevoeligheidsvorm, in procentpunten (B5). */
  gevoeligheidStapPp: number
}

/** De context op de canonieke bronnen; alleen de AOW-rijen en het peiljaar komen van buiten. */
export function standaardImpactContext(aowRows: AowLeeftijdRow[], peiljaar: number): ImpactContext {
  return {
    aowRows,
    peiljaar,
    box3: BOX3_PARAMS,
    box1: BOX1_PARAMS,
    eigenRisico: ZORG_EIGEN_RISICO,
    duoRente: DUO_RENTE_PCT,
    gevoeligheidStapPp: KRANT_GEVOELIGHEID_STAP_PP,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Het jaar waarvoor de nieuwe waarde geldt: de param, anders het jaar van de ingangsdatum. */
export function resolveerJaar(paramJaar: number | null | undefined, ingangsdatum: string | null): number | null {
  if (paramJaar != null) return paramJaar
  if (ingangsdatum) return Number(ingangsdatum.slice(0, 4))
  return null
}

/**
 * De "huidige" kant van een wijziging is ALTIJD het jaar vóór het aangekondigde
 * jaar, exact — geen "laatst bekende" terugval. Anders vergelijkt een
 * 2028-artikel met de waarde van 2026 en, zodra de fiscale-wijzigingslog 2027
 * in de tabel zet, een 2027-artikel met zichzelf (Δ 0 → weg). Ontbreekt het
 * jaar, dan is de som `geen-canonieke-waarde`.
 */
function huidig<T>(tabel: Readonly<Record<number, T>>, jaar: number): T | null {
  return tabel[jaar - 1] ?? null
}

/**
 * Het jaar waarin een cohort de AOW-leeftijd bereikt, per bandrand van het
 * geboortejaar. Januari-rand: geboortejaar + jaren (de maanden vallen in
 * hetzelfde jaar); december-rand: mét maanden schuift het naar het volgende
 * jaar (31 dec 1966 + 67 jaar en 6 maanden = juni 2034).
 */
function aowJaarRanden(gj: number, rows: AowLeeftijdRow[]) {
  const oudLo = lookupAowAge(rows, `${gj}-01-01`)
  const oudHi = lookupAowAge(rows, `${gj}-12-31`)
  return { lo: gj + oudLo.years, hi: gj + oudHi.years + (oudHi.months > 0 ? 1 : 0), oudLo, oudHi }
}

function ontbreekt(velden: DoelgroepSleutel[]): ImpactUitkomst {
  return { soort: 'ontbreekt', velden }
}

function onbekend(reden: OnbekendReden): ImpactUitkomst {
  return { soort: 'onbekend', reden }
}

/**
 * Twee getekende verschillen (nieuw − oud) op de bandranden naar één bereik.
 * `dHi = null` = open band. Regels:
 *   beide 0            → bereik {0, 0, geen}   (raakt niet; scoort 1)
 *   lo 0, hi ≠ 0/open  → bij een DREMPEL-mechanisme (box 3, box 1: heffingsvrij
 *                        vermogen, heffingskortingen) valt de grens in de band en
 *                        is het gokken → drempel-in-band; bij een PROPORTIONEEL
 *                        mechanisme (studieschuld: band × rente) is 0 gewoon de
 *                        bandondergrens → bereik {0, hi} ("hoogstens")
 *   tekens verschillen → richting-onbepaald
 */
function naarBereik(
  dLo: number,
  dHi: number | null,
  eenheid: ImpactEenheid,
  vorm: MechanismeVorm,
  jaar: number | null,
  proportioneel = false,
): ImpactUitkomst {
  const rLo = Math.round(dLo)
  const rHi = dHi == null ? null : Math.round(dHi)
  if (rLo === 0 && rHi === 0) return { soort: 'bereik', lo: 0, hi: 0, eenheid, richting: 'geen', vorm, jaar }
  if (rLo === 0 && !proportioneel) return onbekend('drempel-in-band')
  if (rLo === 0 && rHi == null) return onbekend('open-band')
  if (rHi != null && rLo !== 0 && rHi !== 0 && Math.sign(rLo) !== Math.sign(rHi)) return onbekend('richting-onbepaald')
  const teken = rLo !== 0 ? Math.sign(rLo) : Math.sign(rHi!)
  const richting: ImpactRichting = teken > 0 ? 'meer' : 'minder'
  const aLo = Math.abs(rLo)
  const aHi = rHi == null ? null : Math.abs(rHi)
  return {
    soort: 'bereik',
    lo: aHi == null ? aLo : Math.min(aLo, aHi),
    hi: aHi == null ? null : Math.max(aLo, aHi),
    eenheid,
    richting,
    vorm,
    jaar,
  }
}

/** Gevoeligheid: band × stap, in euro's per jaar; richting is per definitie 'geen' (B5: geen voorspelling). */
function gevoeligheid(band: Band, stapPp: number, jaar: number | null): ImpactBereik {
  const factor = stapPp / 100
  return {
    soort: 'bereik',
    lo: Math.round(band.lo * factor),
    hi: band.hi == null ? null : Math.round(band.hi * factor),
    eenheid: 'eur-per-jaar',
    richting: 'geen',
    vorm: 'gevoeligheid',
    jaar,
  }
}

function studieschuldBand(profiel: NieuwsprofielV1): Band | null {
  const s = profiel.schulden?.find(isStudieschuldBand)
  return s ? STUDIESCHULD_BANDEN[s] : null
}

// ── Box 3 ────────────────────────────────────────────────────────────────────

type Box3Params1A = MechanismeParams<'box3-parameter'>

/** Nieuwe params = huidige params met de aangekondigde waarden erover; `_pct` → fractie (drempels.ts: DREMPEL_EENHEID). */
export function overlayBox3(oud: Box3Params, p: Box3Params1A): Box3Params {
  return {
    ...oud,
    heffingsvrijSingle: p.heffingsvrij_single ?? oud.heffingsvrijSingle,
    heffingsvrijPartner: p.heffingsvrij_partner ?? oud.heffingsvrijPartner,
    forfaitSpaargeld: p.forfait_spaargeld_pct != null ? p.forfait_spaargeld_pct / 100 : oud.forfaitSpaargeld,
    forfaitBeleggingen: p.forfait_beleggingen_pct != null ? p.forfait_beleggingen_pct / 100 : oud.forfaitBeleggingen,
    forfaitSchulden: p.forfait_schulden_pct != null ? p.forfait_schulden_pct / 100 : oud.forfaitSchulden,
    tarief: p.tarief_pct != null ? p.tarief_pct / 100 : oud.tarief,
  }
}

function box3Impact(p: Box3Params1A, ingangsdatum: string | null, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  const mist: DoelgroepSleutel[] = []
  if (profiel.huishouden == null) mist.push('huishouden')
  if (profiel.spaargeld == null) mist.push('spaargeld')
  if (profiel.beleggingen.band == null) mist.push('beleggingen')
  if (profiel.schulden == null) mist.push('schulden')
  if (mist.length) return ontbreekt(mist)

  const jaar = resolveerJaar(p.jaar, ingangsdatum)
  if (jaar == null) return onbekend('jaar-onbekend')
  const oud = huidig(ctx.box3, jaar)
  if (!oud) return onbekend('geen-canonieke-waarde')
  const nieuw = overlayBox3(oud, p)

  // Keuze 10: alleen 'fiscaal-partner' telt als partner; samenwonend zonder
  // fiscaal partnerschap rekent als alleenstaand op het eigen vermogen.
  const partner = profiel.huishouden === 'fiscaal-partner'
  const spaar = SPAARGELD_BANDEN[profiel.spaargeld!]
  const beleg = BELEGGINGEN_BANDEN[profiel.beleggingen.band!]
  // Studieschuld is een box 3-schuld; consumptief krediet kent geen band en
  // telt als 0 (dat overschat de heffing hooguit, het verschil zelden).
  const schuld = studieschuldBand(profiel) ?? { lo: 0, hi: 0 }
  // De laagste heffing hoort bij de hoogste schuld; een open schuldband heeft
  // die bovengrens niet → gokken → onbekend.
  if (schuld.hi == null) return onbekend('open-band')

  const heffing = (params: Box3Params, spaargeld: number, beleggingen: number, box3Schulden: number) =>
    computeBox3Heffing({ spaargeld, beleggingen, box3Schulden }, partner, params).tax

  const dLo = heffing(nieuw, spaar.lo, beleg.lo, schuld.hi) - heffing(oud, spaar.lo, beleg.lo, schuld.hi)
  const dHi =
    spaar.hi == null || beleg.hi == null
      ? null
      : heffing(nieuw, spaar.hi, beleg.hi, schuld.lo) - heffing(oud, spaar.hi, beleg.hi, schuld.lo)
  return naarBereik(dLo, dHi, 'eur-per-jaar', 'direct', jaar)
}

// ── Box 1 ────────────────────────────────────────────────────────────────────

type Box1Params1A = MechanismeParams<'box1-parameter'>

/**
 * Nieuwe params = huidige params met de aangekondigde waarden erover. De
 * AOW-schijf-1 (zonder AOW-premie) is uit een aangekondigd schijf-1-tarief
 * niet af te leiden; de aanroeper degradeert AOW-profielen dan naar onbekend.
 */
export function overlayBox1(oud: Box1Params, p: Box1Params1A): Box1Params {
  const schijf = (s: Box1Params['schijven'][number], i: number, aow: boolean) => {
    const tot = i === 0 ? (p.schijf_1_grens ?? s.tot) : i === 1 ? (p.schijf_2_grens ?? s.tot) : s.tot
    const pct = i === 0 ? (aow ? null : p.schijf_1_tarief_pct) : i === 1 ? p.schijf_2_tarief_pct : p.schijf_3_tarief_pct
    return { tot, tarief: pct != null ? pct / 100 : s.tarief }
  }
  return {
    ...oud,
    schijven: oud.schijven.map((s, i) => schijf(s, i, false)),
    schijvenAow: oud.schijvenAow.map((s, i) => schijf(s, i, true)),
    algemeneHeffingskorting: { ...oud.algemeneHeffingskorting, max: p.algemene_heffingskorting_max ?? oud.algemeneHeffingskorting.max },
    arbeidskorting: { ...oud.arbeidskorting, max: p.arbeidskorting_max ?? oud.arbeidskorting.max },
  }
}

/**
 * AOW-gerechtigd in het REGELJAAR, per cohortrand: het AOW-jaar van beide randen
 * ligt vóór het regeljaar → ja; erna → nee; anders verschilt het binnen het
 * geboortejaar of valt het in het regeljaar zelf → null (drempel-in-band).
 * `werk = pensioen` zegt niets over AOW (vroegpensioen bestaat); het bepaalt
 * alleen dat er geen arbeidsinkomen is.
 */
function isAowGerechtigd(gj: number, jaar: number, ctx: ImpactContext): boolean | null {
  const { lo, hi } = aowJaarRanden(gj, ctx.aowRows)
  if (hi < jaar) return true
  if (lo > jaar) return false
  return null
}

function box1Impact(p: Box1Params1A, ingangsdatum: string | null, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  const mist: DoelgroepSleutel[] = []
  if (profiel.inkomen == null) mist.push('inkomen')
  if (profiel.geboortejaar == null) mist.push('geboortejaar')
  if (profiel.werk == null) mist.push('werk')
  if (mist.length) return ontbreekt(mist)

  const jaar = resolveerJaar(p.jaar, ingangsdatum)
  if (jaar == null) return onbekend('jaar-onbekend')
  const oud = huidig(ctx.box1, jaar)
  if (!oud) return onbekend('geen-canonieke-waarde')
  const year = (jaar - 1) as Box1TaxYear
  const nieuw = overlayBox1(oud, p)

  if (ctx.aowRows.length === 0) return onbekend('geen-canonieke-waarde')
  const aow = isAowGerechtigd(profiel.geboortejaar!, jaar, ctx)
  if (aow == null) return onbekend('drempel-in-band')
  const raaktAowVariant = p.schijf_1_tarief_pct != null || p.algemene_heffingskorting_max != null || p.arbeidskorting_max != null
  if (aow && raaktAowVariant) return onbekend('niet-afleidbaar')

  // Arbeidskorting alleen op arbeidsinkomen (loon/winst); AOW, pensioen en
  // uitkering geven er geen recht op. Gemengd werk → de terugval van de motor.
  const werk = profiel.werk!
  const heeftArbeid = werk.some((w) => w === 'loondienst' || w === 'zelfstandig' || w === 'dga')
  const arbeidsinkomen = heeftArbeid ? undefined : 0

  const band = INKOMEN_BANDEN[profiel.inkomen!]
  const belasting = (params: Box1Params, nettoPerMaand: number) => {
    const gross = grossFromNet(nettoPerMaand * 12, year, { aow, arbeidsinkomen, params: oud })
    return computeBox1Tax({ grossYearlyIncome: gross, year, aow, arbeidsinkomen, params }).tax
  }
  const dLo = belasting(nieuw, band.lo) - belasting(oud, band.lo)
  const dHi = band.hi == null ? null : belasting(nieuw, band.hi) - belasting(oud, band.hi)
  return naarBereik(dLo, dHi, 'eur-per-jaar', 'direct', jaar)
}

// ── AOW-leeftijd ─────────────────────────────────────────────────────────────

type AowParams1A = MechanismeParams<'aow-leeftijd'>

function aowImpact(p: AowParams1A, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  if (profiel.geboortejaar == null) return ontbreekt(['geboortejaar'])
  if (p.vanaf_jaar == null) return onbekend('jaar-onbekend')
  if (ctx.aowRows.length === 0) return onbekend('geen-canonieke-waarde')
  const gj = profiel.geboortejaar
  const { lo, hi, oudLo, oudHi } = aowJaarRanden(gj, ctx.aowRows)
  const geen: ImpactBereik = { soort: 'bereik', lo: 0, hi: 0, eenheid: 'maanden', richting: 'geen', vorm: 'direct', jaar: p.vanaf_jaar }
  // Al AOW-gerechtigd vóór het peiljaar: een verschuiving raakt de lezer niet meer.
  if (hi < ctx.peiljaar) return geen
  // Een besluit "vanaf jaar X +m maanden" zet de leeftijd vast voor het cohort
  // dat in jaar X de AOW-leeftijd bereikt. Wie eerder aan de beurt is, wordt
  // niet geraakt; wie later aan de beurt is, draagt in de tabel al de
  // CBS-prognose (is_definitive = false) waar zulke stappen in zitten — daar
  // iets bovenop stapelen zou een verzonnen leeftijd zijn → buiten-besluit
  // (relevant zonder bedrag). Verschillen de randen van het geboortejaar →
  // drempel-in-band.
  const raaktLo = lo === p.vanaf_jaar
  const raaktHi = hi === p.vanaf_jaar
  if (raaktLo !== raaktHi) return onbekend('drempel-in-band')
  if (!raaktLo) return hi < p.vanaf_jaar ? geen : onbekend('buiten-besluit')
  const m = p.verschuiving_maanden
  return {
    ...geen,
    lo: m,
    hi: m,
    richting: m > 0 ? 'meer' : m < 0 ? 'minder' : 'geen',
    aow: { oud: [oudLo.fractional, oudHi.fractional], nieuw: [oudLo.fractional + m / 12, oudHi.fractional + m / 12] },
  }
}

// ── Studieschuld-rente ───────────────────────────────────────────────────────

type StudieschuldParams1A = MechanismeParams<'studieschuld-rente'>

function studieschuldImpact(p: StudieschuldParams1A, ingangsdatum: string | null, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  if (profiel.schulden == null) return ontbreekt(['schulden'])
  const band = studieschuldBand(profiel)
  const jaar = resolveerJaar(p.jaar, ingangsdatum)
  if (!band) return { soort: 'bereik', lo: 0, hi: 0, eenheid: 'eur-per-jaar', richting: 'geen', vorm: 'direct', jaar }
  // Keuze 11: de huidige rente is die van het jaar vóór de aankondiging;
  // onbekend → terugval op de gevoeligheidsvorm (B).
  const nu = jaar == null ? null : huidig(ctx.duoRente, jaar)
  if (!nu) return gevoeligheid(band, ctx.gevoeligheidStapPp, jaar)
  // Op vier decimalen: 3 − 2,33 is binair 0,6699…, en dat mag geen euro schelen.
  const delta = [p.rente_pct - nu.sf15, p.rente_pct - nu.sf35].map((d) => Math.round(d * 1e4) / 1e4)
  const tekens = new Set(delta.filter((d) => d !== 0).map(Math.sign))
  if (tekens.size > 1) return onbekend('richting-onbepaald')
  const dMin = Math.min(...delta.map(Math.abs))
  const dMax = Math.max(...delta.map(Math.abs))
  const teken = tekens.size ? [...tekens][0] : 0
  // Proportioneel: een bandondergrens van 0 is geen drempel maar "hoogstens".
  return naarBereik(teken * band.lo * (dMin / 100), band.hi == null ? null : teken * band.hi * (dMax / 100), 'eur-per-jaar', 'direct', jaar, true)
}

// ── Eigen risico ─────────────────────────────────────────────────────────────

type EigenRisicoParams1A = MechanismeParams<'eigen-risico'>

function eigenRisicoImpact(p: EigenRisicoParams1A, ingangsdatum: string | null, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  if (profiel.geboortejaar == null) return ontbreekt(['geboortejaar'])
  const jaar = resolveerJaar(p.jaar, ingangsdatum)
  if (jaar == null) return onbekend('jaar-onbekend')
  // Het eigen risico geldt vanaf de volwassen leeftijd, getoetst in het regeljaar.
  if (jaar - profiel.geboortejaar < ZORG_EIGEN_RISICO_VANAF_LEEFTIJD) {
    return { soort: 'bereik', lo: 0, hi: 0, eenheid: 'eur-per-jaar', richting: 'geen', vorm: 'direct', jaar }
  }
  const oud = huidig(ctx.eigenRisico, jaar)
  if (oud == null) return onbekend('geen-canonieke-waarde')
  const uitkomst = naarBereik(p.bedrag - oud, p.bedrag - oud, 'eur-per-jaar', 'direct', jaar)
  return uitkomst.soort === 'bereik' ? { ...uitkomst, eigenRisico: { oud, nieuw: p.bedrag } } : uitkomst
}

// ── Marktbewegingen (gevoeligheid, B5) ───────────────────────────────────────

function spaarrenteImpact(profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  if (profiel.spaargeld == null) return ontbreekt(['spaargeld'])
  return gevoeligheid(SPAARGELD_BANDEN[profiel.spaargeld], ctx.gevoeligheidStapPp, null)
}

function hypotheekrenteImpact(profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  if (profiel.wonen != null && profiel.wonen !== 'koop-met-hypotheek') {
    return { soort: 'bereik', lo: 0, hi: 0, eenheid: 'eur-per-jaar', richting: 'geen', vorm: 'gevoeligheid', jaar: null }
  }
  const mist: DoelgroepSleutel[] = []
  if (profiel.hypotheek.restschuld == null) mist.push('hypotheek_restschuld')
  if (profiel.hypotheek.rentevast == null) mist.push('hypotheek_rentevast')
  if (mist.length) return ontbreekt(mist)
  // Een rente die nog jaren vaststaat beweegt niet mee; dan is er geen bedrag.
  const rv = profiel.hypotheek.rentevast!
  if (rv !== 'tot-1-jaar' && rv !== 'variabel') return onbekend('rente-staat-vast')
  return gevoeligheid(HYPOTHEEK_RESTSCHULD_BANDEN[profiel.hypotheek.restschuld!], ctx.gevoeligheidStapPp, null)
}

// ── Register ─────────────────────────────────────────────────────────────────

/**
 * De impact van een geduid artikel op een profiel. Niet-rekenende
 * mechanismen (toeslag, huur, pensioenregeling, inflatie, beurs) geven
 * `onbekend: niet-rekenend`: relevant zonder bedrag, per catalogus.
 */
export function berekenImpact(duiding: DuidingV1, profiel: NieuwsprofielV1, ctx: ImpactContext): ImpactUitkomst {
  const mech = duiding.mechanisme
  if (!mech) return onbekend('niet-rekenend')
  if (!MECHANISMEN[mech.soort].rekent) return onbekend('niet-rekenend')
  // `mechanismeSchema` discrimineert op `soort`, maar `params` blijft op
  // typeniveau de unie van alle params-schema's (1A, lid()); de cast hier is
  // veilig omdat het schema per lid het bijbehorende params-schema afdwingt.
  switch (mech.soort) {
    case 'box3-parameter':
      return box3Impact(mech.params as Box3Params1A, duiding.ingangsdatum, profiel, ctx)
    case 'box1-parameter':
      return box1Impact(mech.params as Box1Params1A, duiding.ingangsdatum, profiel, ctx)
    case 'aow-leeftijd':
      return aowImpact(mech.params as AowParams1A, profiel, ctx)
    case 'studieschuld-rente':
      return studieschuldImpact(mech.params as StudieschuldParams1A, duiding.ingangsdatum, profiel, ctx)
    case 'eigen-risico':
      return eigenRisicoImpact(mech.params as EigenRisicoParams1A, duiding.ingangsdatum, profiel, ctx)
    case 'spaarrente-markt':
      return spaarrenteImpact(profiel, ctx)
    case 'hypotheekrente-markt':
      return hypotheekrenteImpact(profiel, ctx)
    default:
      return onbekend('niet-rekenend')
  }
}
