/**
 * Sociale zekerheid — de canonieke, JAARGELAAGDE bron voor de Nederlandse
 * uitkeringsparameters die de risico-levensgebeurtenissen voeden (WW en Anw).
 *
 * ## Waarom dit bestand bestaat
 * De WW- en Anw-parameters stonden hardgecodeerd én GEDUPLICEERD in
 * `components/app/horizon/horizon-client.tsx` — met een verschil tussen de twee
 * kopieën: de wettelijke 75%-trap (eerste twee maanden) zat alleen in de
 * tooltip-preview, terwijl de berekening die het event daadwerkelijk voedt kaal
 * 70% rekende. Twee getallen voor dezelfde grootheid op hetzelfde scherm.
 * Bovendien waren de bedragen twee indexatierondes verouderd (max dagloon €274 =
 * het niveau van 1-1-2024).
 *
 * Dit is dus dezelfde defectklasse als `lib/kosten-koper.ts`: een jaargebonden
 * wettelijk bedrag dat in een UI-component woonde. De vorm volgt bewust het
 * bestaande precedent `SCHENK_ERF_PARAMS` (`lib/horizon/schenk-erf-belasting.ts`)
 * en `BOX3_PARAMS` (`lib/box3-data.ts`): een jaartabel + een resolver met
 * fallback naar het dichtstbijzijnde bekende jaar, plus generatorfuncties voor de
 * UI-teksten zodat een tip nooit meer los kan drijven van de berekening.
 *
 * ## Onderhoud
 * Deze bedragen wijzigen TWEE keer per jaar (1 januari en 1 juli, gekoppeld aan
 * het wettelijk minimumloon). Ze horen daarmee op de radar van de
 * `fiscale-wijzigingslog`-skill. Voeg bij een nieuwe indexatie een jaarlaag toe;
 * de resolver houdt oudere jaren vanzelf op hun eigen niveau.
 *
 * Pure module, geen React, geen DB. Enige bron van waarheid.
 */

/** Jaargebonden sociale-zekerheidsparameters (UWV / SVB). */
export interface SocialeZekerheidYearParams {
  /**
   * Maximumdagloon: het bruto dagloon waarboven UWV niet verder rekent voor
   * WW/ZW/WIA. Inclusief vakantiegeld.
   */
  maxDagloon: number
  ww: {
    /** Uitkeringspercentage van het dagloon in de eerste periode (wettelijk 75%). */
    pctEerstePeriode: number
    /** Uitkeringspercentage daarna (wettelijk 70%). */
    pctDaarna: number
    /** Lengte van de eerste (75%-)periode in maanden — wettelijk 2. */
    eerstePeriodeMaanden: number
    /** Maximale WW-duur in maanden bij een volledig arbeidsverleden. */
    maxDuurMaanden: number
  }
  anw: {
    /** Volledige Anw-nabestaandenuitkering, bruto per maand (zonder vakantiegeld). */
    nabestaandenBrutoPerMaand: number
    /** Het los opgebouwde vakantiegeld per maand dat bij die uitkering hoort. */
    vakantiegeldPerMaand: number
  }
}

/**
 * Rekennorm UWV: het dagloon is het bruto jaarloon gedeeld door 261 werkdagen.
 * Wettelijke rekennorm, jaaronafhankelijk — geen bedrag, dus niet jaargelaagd.
 */
export const UWV_WERKDAGEN_PER_JAAR = 261

/**
 * Rekennorm UWV: een uitkeringsmaand telt 21,75 uitkeringsdagen (261 / 12).
 * Wettelijke rekennorm, jaaronafhankelijk.
 */
export const UWV_WERKDAGEN_PER_MAAND = 21.75

/**
 * BENADERING (geen wettelijk cijfer): bruto Anw → netto ≈ 75%. De werkelijke
 * inhouding hangt af van loonheffingskorting en het overige inkomen van de
 * nabestaande; die kent de app niet. Bewust als NAMED aanname vastgelegd i.p.v.
 * als losse 0.75 in een component, zodat de aanname zichtbaar is in de
 * Berekeningen-view. Verfijnen kan later via `lib/box1-tax.ts`.
 */
export const ANW_NETTO_BENADERING_FACTOR = 0.75

/**
 * Jaargelaagde parameters. Op dit moment is uitsluitend 2026 gelaagd: de
 * historische jaarlagen zijn BEWUST niet ingevuld omdat er geen geverifieerde
 * bron voor 2024/2025 in dit traject is nagelopen, en een niet-geverifieerd
 * bedrag erger is dan geen bedrag. De resolver valt daarom voor elk jaar terug
 * op 2026; voeg een laag toe zodra een jaar geverifieerd is.
 *
 * Bronnen (geverifieerd 29-08-2026):
 *  - Maximumdagloon per 1-7-2026 = € 309,91 bruto/dag (UWV, "Maximumdagloon
 *    2026"; per 1-1-2026 was dit € 304,25 — het wijzigt elk half jaar).
 *  - Anw-nabestaandenuitkering per 1-7-2026 = € 1.676,53 bruto/maand plus
 *    € 127,25 vakantiegeld (SVB / Rijksoverheid, uitkeringsbedragen 1-7-2026).
 *  - WW 75% de eerste 2 maanden, daarna 70%, maximaal 24 maanden (UWV) —
 *    wettelijke systematiek, ongewijzigd.
 *
 * Conventie gelijk aan `NL_AOW_MONTHLY` in `lib/constants.ts`: we hanteren het
 * bedrag dat op dit moment GELDT (de 1-juli-tranche), niet de januari-tranche.
 */
export const SOCIALE_ZEKERHEID_PARAMS: Record<number, SocialeZekerheidYearParams> = {
  2026: {
    maxDagloon: 309.91,
    ww: {
      pctEerstePeriode: 0.75,
      pctDaarna: 0.70,
      eerstePeriodeMaanden: 2,
      maxDuurMaanden: 24,
    },
    anw: {
      nabestaandenBrutoPerMaand: 1676.53,
      vakantiegeldPerMaand: 127.25,
    },
  },
}

/**
 * Kies de sociale-zekerheidsparameters voor een jaar. Default = lopend jaar.
 * Fallback bij onbekend/toekomstig jaar: het dichtstbijzijnde bekende jaar ≤ het
 * gevraagde jaar (en anders het vroegst bekende jaar). Identiek gedrag aan
 * `resolveSchenkErfParams`, zodat 2027 op 2026-niveau blijft tot er een
 * 2027-laag is.
 */
export function resolveSocialeZekerheidParams(
  jaar: number = new Date().getFullYear(),
): SocialeZekerheidYearParams {
  const exact = SOCIALE_ZEKERHEID_PARAMS[jaar]
  if (exact) return exact
  const years = Object.keys(SOCIALE_ZEKERHEID_PARAMS).map(Number).sort((a, b) => a - b)
  const eerdere = years.filter((y) => y <= jaar)
  const gekozen = eerdere.length > 0 ? eerdere[eerdere.length - 1] : years[0]
  return SOCIALE_ZEKERHEID_PARAMS[gekozen]
}

/**
 * Dagloon uit het bruto MAANDsalaris, afgetopt op het maximumdagloon.
 * Formule (UWV): dagloon = bruto maandsalaris × 12 / 261, met cap.
 */
export function berekenDagloon(
  brutoMaandsalaris: number,
  jaar: number = new Date().getFullYear(),
): number {
  const { maxDagloon } = resolveSocialeZekerheidParams(jaar)
  if (!Number.isFinite(brutoMaandsalaris) || brutoMaandsalaris <= 0) return 0
  return Math.min((brutoMaandsalaris * 12) / UWV_WERKDAGEN_PER_JAAR, maxDagloon)
}

/** Uitkomst van `berekenWwUitkering`. Alle maandbedragen in hele euro's. */
export interface WwUitkering {
  /** Het (afgetopte) dagloon in euro's per dag. */
  dagloon: number
  /** Maandbedrag in de eerste periode (75% van het dagloon). */
  maandEerstePeriode: number
  /** Maandbedrag daarna (70% van het dagloon). */
  maandDaarna: number
  /** Lengte van de 75%-periode, begrensd door de werkelijke WW-duur. */
  eerstePeriodeMaanden: number
  /** Wettelijke lengte van de eerste periode in maanden (ongeacht de WW-duur) — voor labels. */
  wettelijkeEerstePeriodeMaanden: number
  /** Uitkeringspercentage eerste periode (0-1) — voor labels. */
  pctEerstePeriode: number
  /** Uitkeringspercentage daarna (0-1) — voor labels. */
  pctDaarna: number
  /** Totaal uitgekeerde WW over de hele WW-duur. */
  totaalOverWwDuur: number
  /**
   * Gemiddelde WW per maand OVER HET GEKOZEN VENSTER (`overDuurMaanden`). Is dat
   * venster langer dan de WW-duur, dan tellen de maanden zónder WW als 0 mee —
   * dat is de juiste grondslag zodra het inkomensgat over de volledige
   * werkloosheidsperiode wordt toegepast.
   */
  gemiddeldPerMaand: number
}

export interface BerekenWwInput {
  /** Bruto maandsalaris vóór werkloosheid. */
  brutoMaandsalaris: number
  /** Aantal maanden WW-recht (arbeidsverleden-afhankelijk). */
  wwDuurMaanden: number
  /**
   * Venster waarover het gemiddelde wordt bepaald. Default = de WW-duur zelf.
   * Geef hier de TOTALE werkloosheidsduur wanneer het inkomensgat over die
   * periode wordt toegepast — anders wordt het gat in de staart (na afloop van
   * de WW) stelselmatig onderschat.
   */
  overDuurMaanden?: number
  jaar?: number
}

/**
 * WW-uitkering volgens de wettelijke trap: `pctEerstePeriode` gedurende
 * `eerstePeriodeMaanden`, daarna `pctDaarna`, over een dagloon dat is afgetopt op
 * het maximumdagloon.
 *
 * Afronding is ABSOLUUT op hele euro's (`Math.round`) en gebeurt per
 * maandbedrag vóór de middeling — bewust identiek aan de bestaande UI-berekening,
 * zodat de deduplicatie het getoonde bedrag niet verschuift. Een relatieve
 * tolerantie zou hier niet passen: het zijn maandbedragen in de orde van enkele
 * duizenden euro's die de gebruiker als heel bedrag ziet.
 */
export function berekenWwUitkering(input: BerekenWwInput): WwUitkering {
  const { brutoMaandsalaris, wwDuurMaanden, overDuurMaanden, jaar } = input
  const params = resolveSocialeZekerheidParams(jaar)
  const dagloon = berekenDagloon(brutoMaandsalaris, jaar)

  const maandEerstePeriode = Math.round(dagloon * UWV_WERKDAGEN_PER_MAAND * params.ww.pctEerstePeriode)
  const maandDaarna = Math.round(dagloon * UWV_WERKDAGEN_PER_MAAND * params.ww.pctDaarna)

  const wwDuur = Math.max(0, Number.isFinite(wwDuurMaanden) ? wwDuurMaanden : 0)
  const eerstePeriodeMaanden = Math.min(params.ww.eerstePeriodeMaanden, wwDuur)
  const restMaanden = Math.max(0, wwDuur - eerstePeriodeMaanden)
  const totaalOverWwDuur = eerstePeriodeMaanden * maandEerstePeriode + restMaanden * maandDaarna

  const venster = overDuurMaanden !== undefined && Number.isFinite(overDuurMaanden)
    ? Math.max(0, overDuurMaanden)
    : wwDuur
  const gemiddeldPerMaand = venster > 0 ? Math.round(totaalOverWwDuur / venster) : 0

  return {
    dagloon,
    maandEerstePeriode,
    maandDaarna,
    eerstePeriodeMaanden,
    wettelijkeEerstePeriodeMaanden: params.ww.eerstePeriodeMaanden,
    pctEerstePeriode: params.ww.pctEerstePeriode,
    pctDaarna: params.ww.pctDaarna,
    totaalOverWwDuur,
    gemiddeldPerMaand,
  }
}

/** De volledige Anw-nabestaandenuitkering, bruto per maand, voor een jaar. */
export function anwNabestaandenBruto(jaar: number = new Date().getFullYear()): number {
  return resolveSocialeZekerheidParams(jaar).anw.nabestaandenBrutoPerMaand
}

/**
 * Bruto Anw → netto per maand, via de gedocumenteerde benadering
 * `ANW_NETTO_BENADERING_FACTOR`. Afronding absoluut op hele euro's.
 */
export function berekenAnwNetto(brutoPerMaand: number): number {
  if (!Number.isFinite(brutoPerMaand) || brutoPerMaand <= 0) return 0
  return Math.round(brutoPerMaand * ANW_NETTO_BENADERING_FACTOR)
}

// ── Generator-functies voor UI-teksten (uit de jaartabel, geen losse literals) ──

/** Formatteer een euro-bedrag met NL-scheidingstekens, zonder valutasymbool. */
function euro(bedrag: number, decimalen = 0): string {
  return bedrag.toLocaleString('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
  })
}

/** Tip-tekst voor het werkloosheid-event, samengesteld uit de jaartabel. */
export function formatWwTipTekst(jaar: number = new Date().getFullYear()): string {
  const p = resolveSocialeZekerheidParams(jaar)
  const pct1 = Math.round(p.ww.pctEerstePeriode * 100)
  const pct2 = Math.round(p.ww.pctDaarna * 100)
  return `WW-uitkering: ${pct1}% van het dagloon de eerste ${p.ww.eerstePeriodeMaanden} maanden, daarna ${pct2}%. Maximaal ${p.ww.maxDuurMaanden} maanden (afhankelijk van arbeidsverleden). Max dagloon: €${euro(p.maxDagloon, 2)}/dag bruto (UWV).`
}

/** Tip-tekst voor het Anw-bedragveld, samengesteld uit de jaartabel. */
export function formatAnwTipTekst(jaar: number = new Date().getFullYear()): string {
  const p = resolveSocialeZekerheidParams(jaar)
  return `Volledige Anw-nabestaandenuitkering: €${euro(p.anw.nabestaandenBrutoPerMaand)}/mnd bruto (SVB), plus €${euro(p.anw.vakantiegeldPerMaand)} vakantiegeld. Het bedrag is inkomensafhankelijk — eigen inkomen wordt verrekend, dus vul in wat de SVB voor jouw situatie noemt.`
}

/** Label voor de "met kinderen"-optie in de Anw-select, uit de jaartabel. */
export function formatAnwOptieLabel(jaar: number = new Date().getFullYear()): string {
  const p = resolveSocialeZekerheidParams(jaar)
  return `Recht op Anw (~€${euro(p.anw.nabestaandenBrutoPerMaand)}/mnd bruto)`
}
