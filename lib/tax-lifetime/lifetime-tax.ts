/**
 * Levenslange belastingdruk — **rapportagelaag NAAST de horizon-projectie**.
 *
 * Leidt uit een reeks unified-jaarrijen af hoeveel belasting een plan over de
 * hele horizon kost: de al-in-de-cashflow-verwerkte Box 3-heffing (geconsumeerd,
 * nooit herberekend) plus de Box 1-heffing die de cashflow NIET in mindering
 * bracht. Pure functie: geen fs/Supabase/Date.now/Math.random, geen React.
 *
 * ## Waarom "naast" en niet "in" de kernel (eigenaar-besluit, Fase 3)
 * De horizon-kernel is Excel-oracle-bewezen (ADR 0032) en draait onder ieders
 * FIRE-datum. Een Box 1-tabel die in de kernel-cashflow terugvloeit is een
 * buiten-oracle-extensie met te veel regressierisico. Daarom rekent deze module
 * BOVENOP de rijen en koppelt niets terug. **Bewust geaccepteerde prijs:** het
 * model rekent niet mee dat je extra BRUTO moet onttrekken om deze heffing te
 * kunnen betalen — de uitkomst is dus de heffing over het plan zoals de kernel
 * het doorrekende, niet het (hogere) plan dat de heffing zou financieren. Dat is
 * een gebruiker-zichtbare kanttekening, geen stille aanname.
 *
 * ## De som per jaarrij — dubbeltelling is per CONSTRUCTIE uitgesloten
 * `row.box1Streams` (kernel-bridge, weergaveveld) levert de deelstromen met hun
 * grondslag in de naam: AOW komt **netto** binnen, pensioen **bruto en onbelast**.
 * Naïef `computeBox1Tax(pensioen)` zou twee fouten maken: (a) de AOW-heffing
 * dubbel tellen of negeren, en (b) het pensioen vanaf €0 belasten in plaats van
 * op zijn werkelijke, marginale plek bovenóp de AOW. Vandaar de verschil-methode:
 *
 * ```
 * brutoAow    = grossFromNet(aowNetto, jaar, { aow })
 * alVerrekend = computeBox1Tax({ grossYearlyIncome: brutoAow, … }).tax
 * totaal      = computeBox1Tax({ grossYearlyIncome:
 *                 brutoAow + pensioenUitkeringBruto + pensioenOnttrekkingBruto, … }).tax
 * box1NietVerrekend = totaal − alVerrekend
 * ```
 *
 * `alVerrekend` is exact de heffing die al ín het netto AOW-bedrag zat, dus het
 * verschil is precies wat nog nergens is ingehouden. Zónder pensioen valt
 * `totaal` bit-voor-bit samen met `alVerrekend` en is `box1NietVerrekend`
 * **exact 0** — dat is de kern van de constructie, niet een afronding.
 *
 * **Naamgeving (ADR 0073 — grondslag in de veldnaam):** het heet
 * `box1NietVerrekend`, niet `box1Tax`. Het ís de heffing die nergens is
 * ingehouden; de naam moet dat zeggen, anders leest een consument 'm als "de
 * Box 1-belasting" en telt hem ergens nóg eens op.
 *
 * ## Twee expliciete modelkeuzes (beide getest)
 * 1. **`aow` per rij**, niet blanket `true`: `aowGerechtigd = row.age >=
 *    Math.round(aowLeeftijd)`. In de jaren vóór de AOW-leeftijd geldt het volle
 *    schijf-1-tarief inclusief AOW-premie (17,9 pp hoger). Blanket `true` zou de
 *    heffing op vroeg-onttrokken pensioen fors onderschatten.
 *
 *    **Waarom `Math.round` op de AOW-leeftijd.** `row.age` is een GEHEEL getal:
 *    de kernel-bridge zet `age = Math.round(startLeeftijd) + jaarindex`. De
 *    AOW-leeftijd is dat níét — `HorizonFireSim.aowAgeFractional` levert 67,25 of
 *    67,5. Een rechtstreekse `row.age >= aowLeeftijd` maakt `67 >= 67,25` onwaar
 *    en behandelt uitgerekend het SCHARNIERJAAR als een niet-AOW-jaar: volle
 *    schijf 1 inclusief AOW-premie, plus de grote niet-AOW-arbeidskorting. De
 *    vergelijking loopt daarom op dezelfde granulariteit als de rij, met dezelfde
 *    afrondingsconventie die de bridge op de startleeftijd gebruikt.
 *    `LifetimeTaxSeries.aowLeeftijd` blijft de FRACTIONELE waarde dragen — dat is
 *    de invoer, niet de rasterkeuze.
 * 2. **Schijven groeien mee met de inflatie.** `BOX1_PARAMS` kent alleen
 *    2025/2026; bevroren schijfgrenzen tegen nominaal geïndexeerde inkomens
 *    schuiven een plan over 30 jaar kunstmatig de hogere schijven in. Daarom:
 *    deflateer het inkomen met `row.inflationFactor`, belast het tegen de tabel
 *    van het lopende jaar, en vermenigvuldig de heffing weer met diezelfde
 *    factor. Dat is equivalent aan een tabel die exact met de inflatie
 *    meebeweegt — de gangbare NL-indexatiepraktijk.
 *
 * ## Arbeidskorting-grondslag: OPGELOST (11 aug 2026)
 * Tot aug 2026 rekende `computeBox1Tax` de **arbeidskorting** over het volledige
 * `grossYearlyIncome`, dus óók over AOW/pensioen — fiscaal geen arbeidsinkomen.
 * De korting viel te hoog uit en `box1Totaal` daarmee te laag; en omdat deze
 * reeks een VERSCHIL van twee motoraanroepen rapporteert (`box1Totaal −
 * box1AlVerrekend`) draaide het teken bij hoge pensioeninkomens zelfs om.
 *
 * De motor kent nu `Box1Input.arbeidsinkomen` als eigen grondslag. Deze module
 * geeft er **0** mee — voor de tariefstap (`box1TaxOnReal`) én voor de
 * netto→bruto-inversie van de AOW (`grossFromNet`), want een te lage
 * arbeidskorting-grondslag daar zou de fout via het bruto weer binnenlaten.
 * Er is nog steeds precies één tariefmotor; dit is de invoer, geen variant.
 *
 * Gemeten effect op `box1NietVerrekend` tegen `BOX1_PARAMS[2026]` (nieuw − oud):
 *
 * | AOW netto | pensioen  | vóór AOW | ná AOW   |
 * |-----------|-----------|----------|----------|
 * | € 0       | € 30.000  | +€ 5.381 | +€ 2.687 |
 * | € 0       | € 150.000 | € 0      | € 0      |
 * | € 16.000  | € 30.000  | +€ 3.572 | +€ 1.990 |
 * | € 16.000  | € 150.000 | −€ 1.858 | −€ 707   |
 *
 * Oftewel: de heffing gaat in het gangbare bereik OMHOOG (de reeks onderschatte
 * de last), en bij een hoog pensioeninkomen bovenop AOW iets omlaag. Het effect
 * was het grootst in de jaren vóór de AOW — precies waar "pensioen vroeg" zijn
 * onttrekkingen concentreert — dus de correctie raakt de RANGSCHIKKING van de
 * sweep en niet alleen het niveau. De zesde kanttekening op het scherm
 * (`optimizer-levenslang.tsx`) die dit meldde is daarmee ingetrokken.
 *
 * Bij een AOW-been schuift óók de grondslag: `grossFromNet(€16.000 netto, AOW)`
 * gaat van € 16.182 naar € 17.582 bruto — zonder arbeidskorting is er méér
 * bruto nodig voor hetzelfde netto. Beide benen bewegen dus mee, wat verklaart
 * waarom de correctie op de AOW-rijen kleiner is dan de weggevallen korting.
 *
 * ## Partner: volledig uitgesloten (ADR 0036)
 * Box 1 is per persoon en het partner-inkomen wordt niet als BRUTO grootheid
 * vastgehouden — elke partner-Box 1 zou verzonnen zijn. `partnerBatenNetto`
 * staat wél in `Box1Streams`, uitsluitend zodat de uitsluiting aantoonbaar en
 * testbaar is: deze module leest het veld nergens.
 *
 * ## Eenheden
 * Alle euro-bedragen in `LifetimeTaxSeries` zijn **NOMINAAL**, dezelfde
 * grondslag als de kernel-rijen. Deel door `row.inflationFactor` voor
 * koopkracht-nu. Het reëel-rekenen hierboven is een interne rekenstap, geen
 * uitvoer-eenheid.
 */

import { computeBox1Tax, grossFromNet, type Box1TaxYear } from '@/lib/box1-tax'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import type { Box1Streams } from '@/lib/unified-projection'

// ── Invoer ───────────────────────────────────────────────────────────────────

/**
 * De rij-velden die deze module leest. Structurele subset van
 * `UnifiedProjectionRow` — een `UnifiedProjectionRow[]` is hier zonder mapping
 * bruikbaar (gepind door een compile-time-assertie in de test), maar de module
 * hoeft daardoor niet de volledige rij-vorm te eisen.
 */
export interface LifetimeTaxRowInput {
  /** Jaar-index (0 = huidig jaar). */
  readonly year: number
  /** Leeftijd in dit projectiejaar — bepaalt de AOW-vlag. */
  readonly age: number
  /** `(1 + inflatie)^year`, ≥ 1 — de deflator voor de schijf-indexatie. */
  readonly inflationFactor: number
  /** Box 3-heffing dit jaar (kernel-canoniek; alléén doorgegeven). */
  readonly totalBox3: number
  /** Cumulatieve Box 3 t/m dit jaar — **geconsumeerd**, nooit herberekend. */
  readonly cumulativeBox3: number
  /** Box 1-deelstromen; afwezig = geen AOW/pensioen/partner in dit jaar. */
  readonly box1Streams?: Box1Streams
}

export interface LifetimeTaxOptions {
  /**
   * AOW-leeftijd van de gebruiker (`KernelInput.persoon.aowLeeftijd`). Enige
   * bron voor de per-rij AOW-vlag; deze module leidt 'm nooit zelf af. Mag
   * FRACTIONEEL zijn (67,25 / 67,5) — de vlag rondt af naar het rij-raster, de
   * waarde zelf wordt onafgerond doorgegeven in `LifetimeTaxSeries.aowLeeftijd`.
   */
  readonly aowLeeftijd: number
  /**
   * Box 1-tariefjaar. Default `CURRENT_TAX_YEAR` — in lockstep met de jaarlijks
   * vernieuwde beheer-parameters, net als de rest van de belastinglaag.
   */
  readonly year?: Box1TaxYear
}

// ── Uitvoer ──────────────────────────────────────────────────────────────────

/** Eén jaarrij van de levenslange-belastingreeks. Alle bedragen NOMINAAL. */
export interface LifetimeTaxYearRow {
  /** Jaar-index, 1-op-1 met de invoerrij. */
  readonly year: number
  readonly age: number
  /**
   * `age >= Math.round(aowLeeftijd)` — koos de AOW-schijventabel (geen
   * AOW-premie). Afgerond omdat `age` een geheel jaar is; zie de module-doc.
   */
  readonly aowGerechtigd: boolean
  /** De deflator die deze rij gebruikte (doorgegeven, voor herleidbaarheid). */
  readonly inflationFactor: number

  // ── Grondslag ──────────────────────────────────────────────
  /** Geconsumeerd `box1Streams.aowNetto` — netto, heffing al ingehouden. */
  readonly aowNetto: number
  /** `grossFromNet(aowNetto)` — het bruto dat dat netto oplevert. */
  readonly aowBruto: number
  /** Geconsumeerd `box1Streams.pensioenUitkeringBruto` (Geb rij 15-20). */
  readonly pensioenUitkeringBruto: number
  /** Geconsumeerd `box1Streams.pensioenOnttrekkingBruto` (Verdeling 'Pensioen'). */
  readonly pensioenOnttrekkingBruto: number
  /** `aowBruto + pensioenUitkeringBruto + pensioenOnttrekkingBruto`. */
  readonly box1GrondslagBruto: number

  // ── Heffing ────────────────────────────────────────────────
  /** Box 1 over uitsluitend `aowBruto` — al verrekend in het netto AOW-bedrag. */
  readonly box1AlVerrekend: number
  /** Box 1 over de volledige grondslag (pensioen op zijn marginale plek). */
  readonly box1Totaal: number
  /**
   * `box1Totaal − box1AlVerrekend` — de heffing die de kernel-cashflow NIET in
   * mindering bracht. Is ≥ 0 zolang `computeBox1Tax` monotoon niet-dalend is in
   * het inkomen; die invariant wordt getest in plaats van weggeclamped, zodat
   * een echte niet-monotoniteit zichtbaar wordt in plaats van stil verdwijnt.
   */
  readonly box1NietVerrekend: number

  // ── Box 3 (doorgegeven) ────────────────────────────────────
  /** `row.totalBox3` — doorgegeven, niet herberekend. */
  readonly box3: number

  // ── Cumulatief t/m dit jaar ────────────────────────────────
  /** `row.cumulativeBox3` — **geconsumeerd** uit de rij, nooit herberekend. */
  readonly cumulatiefBox3: number
  readonly cumulatiefBox1NietVerrekend: number
  /** `cumulatiefBox3 + cumulatiefBox1NietVerrekend`. */
  readonly cumulatiefTotaal: number
}

/**
 * Levenslange belastingdruk van één doorgerekend plan.
 *
 * BEWUST een eigen returntype en NIET drie extra velden op
 * `UnifiedProjectionRow`: `totalBox1`/`cumulativeBox1`/`cumulativeTotalTax` op de
 * rij zouden suggereren dat de kernel de Box 1-heffing berekende. Dat doet hij
 * niet — en die suggestie is precies wat een consument ertoe verleidt de
 * cashflow ermee te corrigeren.
 */
export interface LifetimeTaxSeries {
  readonly rows: readonly LifetimeTaxYearRow[]
  /** Gebruikt Box 1-tariefjaar (welke `BOX1_PARAMS`-tabel de reeks droeg). */
  readonly year: Box1TaxYear
  /** AOW-leeftijd die de per-rij AOW-vlag bepaalde. */
  readonly aowLeeftijd: number
  /** Eindstand `cumulatiefBox3` (= `cumulativeBox3` van de laatste rij). */
  readonly cumulatiefBox3: number
  /** Eindstand `cumulatiefBox1NietVerrekend`. */
  readonly cumulatiefBox1NietVerrekend: number
  /** Eindstand `cumulatiefTotaal`. */
  readonly cumulatiefTotaal: number
}

// ── Interne helpers ──────────────────────────────────────────────────────────

/**
 * Box 1-heffing over een REËEL (koopkracht-nu) bruto jaarinkomen tegen de tabel
 * van `year`. `computeBox1Tax` is de enige tariefmotor in de app — hier bewust
 * zonder eigen-woning-velden: het eigenwoningforfait/de hypotheekrenteaftrek
 * lopen in het model via de woonlasten in de kernel-cashflow, niet via deze
 * rapportagelaag (ze twee keer aanzetten zou dubbeltellen).
 *
 * `arbeidsinkomen: 0` — ELKE stroom in deze reeks (AOW, pensioenuitkering,
 * pensioenonttrekking) is naar zijn aard géén arbeidsinkomen. Zie de module-doc:
 * dit is de grondslag, geen tariefvariant. De motor blijft de enige.
 */
function box1TaxOnReal(grossReal: number, year: Box1TaxYear, aow: boolean): number {
  if (!(grossReal > 0)) return 0
  return computeBox1Tax({ grossYearlyIncome: grossReal, year, aow, arbeidsinkomen: 0 }).tax
}

// ── Publieke motor ───────────────────────────────────────────────────────────

/**
 * Leid de levenslange belastingdruk af uit een reeks unified-jaarrijen.
 *
 * Pure functie; laat de invoerrijen ongemoeid en leest `box1Streams` alleen als
 * die aanwezig is (rij zonder AOW/pensioen → alle Box 1-velden 0, Box 3 blijft
 * gewoon doorgegeven zodat de reeks 1-op-1 met de invoer meeloopt).
 */
export function computeLifetimeTax(
  rows: readonly LifetimeTaxRowInput[],
  opts: LifetimeTaxOptions,
): LifetimeTaxSeries {
  const year = opts.year ?? CURRENT_TAX_YEAR
  const out: LifetimeTaxYearRow[] = []
  let cumBox1 = 0

  for (const row of rows) {
    // Deflator: (1+i)^year, per contract ≥ 1. Defensief tegen een 0/negatieve/
    // niet-eindige factor uit een stub-rij → val terug op 1 (= geen indexatie).
    const factor = Number.isFinite(row.inflationFactor) && row.inflationFactor > 0
      ? row.inflationFactor
      : 1

    const streams = row.box1Streams
    const aowNetto = streams?.aowNetto ?? 0
    const pensioenUitkeringBruto = streams?.pensioenUitkeringBruto ?? 0
    const pensioenOnttrekkingBruto = streams?.pensioenOnttrekkingBruto ?? 0
    // `streams.partnerBatenNetto` wordt BEWUST niet gelezen — zie module-doc
    // (ADR 0036: Box 1 is per persoon, partner-bruto bestaat niet in dit model).

    // `row.age` is geheel (bridge: Math.round(startLeeftijd) + jaarindex), de
    // AOW-leeftijd fractioneel (67,25 / 67,5). Zonder dezelfde afronding zou
    // `67 >= 67,25` onwaar zijn en het scharnierjaar als niet-AOW-jaar rekenen.
    const aowGerechtigd = row.age >= Math.round(opts.aowLeeftijd)

    // ── Reëel rekenen (schijven groeien mee met de inflatie) ─────────────────
    const aowNettoReal = aowNetto / factor
    // Ook de netto→bruto-inversie draait op `arbeidsinkomen: 0`: zonder dat zou
    // ze het bruto zoeken waarbij een arbeidskorting meetelt die een AOW'er niet
    // krijgt, en daarmee een te LAAG aowBruto opleveren — de fout zou dan via de
    // grondslag alsnog binnenkomen nadat hij uit de tariefstap is gehaald.
    const aowBrutoReal =
      aowNettoReal > 0
        ? grossFromNet(aowNettoReal, year, { aow: aowGerechtigd, arbeidsinkomen: 0 })
        : 0
    const pensioenReal = (pensioenUitkeringBruto + pensioenOnttrekkingBruto) / factor

    const alVerrekendReal = box1TaxOnReal(aowBrutoReal, year, aowGerechtigd)
    const totaalReal = box1TaxOnReal(aowBrutoReal + pensioenReal, year, aowGerechtigd)

    // ── Terug naar nominaal ─────────────────────────────────────────────────
    const aowBruto = aowBrutoReal * factor
    const box1AlVerrekend = alVerrekendReal * factor
    const box1Totaal = totaalReal * factor
    // Verschil NA het inflateren, zodat de getoonde identiteit
    // `box1Totaal − box1AlVerrekend === box1NietVerrekend` float-exact geldt én
    // een pensioenloos jaar exact 0 oplevert (dezelfde operanden ⇒ dezelfde bits).
    const box1NietVerrekend = box1Totaal - box1AlVerrekend

    cumBox1 += box1NietVerrekend
    const cumulatiefBox3 = row.cumulativeBox3 // GECONSUMEERD, nooit herberekend

    out.push({
      year: row.year,
      age: row.age,
      aowGerechtigd,
      inflationFactor: row.inflationFactor,
      aowNetto,
      aowBruto,
      pensioenUitkeringBruto,
      pensioenOnttrekkingBruto,
      box1GrondslagBruto: aowBruto + pensioenUitkeringBruto + pensioenOnttrekkingBruto,
      box1AlVerrekend,
      box1Totaal,
      box1NietVerrekend,
      box3: row.totalBox3,
      cumulatiefBox3,
      cumulatiefBox1NietVerrekend: cumBox1,
      cumulatiefTotaal: cumulatiefBox3 + cumBox1,
    })
  }

  const last = out[out.length - 1]
  return {
    rows: out,
    year,
    aowLeeftijd: opts.aowLeeftijd,
    cumulatiefBox3: last?.cumulatiefBox3 ?? 0,
    cumulatiefBox1NietVerrekend: last?.cumulatiefBox1NietVerrekend ?? 0,
    cumulatiefTotaal: last?.cumulatiefTotaal ?? 0,
  }
}
