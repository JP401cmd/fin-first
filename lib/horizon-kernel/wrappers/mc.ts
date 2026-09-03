/**
 * Horizon-kernel · wrapper **Monte-Carlo** — port van de VBA-macro
 * `RunMonteCarlo` (Module1, `docs/horizon-oracle/vba.txt`) + de MC-tab-formules.
 *
 * `RunMonteCarlo` zet MC!B5=1 (MC-modus aan), wist MC!B14:B1013 en draait
 * `n = MC!B1` runs: per run `i` zet het MC!B11=i, herberekent het hele model en
 * schrijft MC!B(13+i) = MC!B8 (het 1/0-slaagcriterium van die run). Daarna
 * MC!B5=0, MC!B11=1. De slaagkans is MC!B4 = `AVERAGE(B14:B1013)`.
 *
 * ### Wat MC!B8 precies is (geverifieerd via openpyxl)
 * `MC!B8` = de model≥doel-toets per eindstrategie, geëvalueerd op de **live**
 * FIRE-leeftijd (P!B16 — NIET opnieuw gezocht per run) met de MC-verstoorde
 * rendementen:
 *  - **deplete**: Prognose!J@eindleeftijd ≥ 0                → identiek aan `gap ≥ 0`
 *  - **legacy**: (B54="Ja"?I:J)@eind ≥ B53·(1+B14)^(B35−B7) → identiek aan `gap ≥ 0`
 *  - **perpetual**: J@eind ≥ J@FIRE·(1+B14)^(B35−B16)        → identiek aan `gap ≥ 0`
 *  - **pensioen**: ROUND(P!B16,2) ≥ ES!C15 (AOW)             → losstaand criterium
 *
 * Voor alle niet-pensioen-strategieën is B8 dus exact `computeGap(...) ≥ 0` (met
 * dezelfde I/J-meetlatkeuze als de solver). Voor pensioen is B8 alleen `B16 ≥ AOW`;
 * omdat de live B16 bij pensioen kortsluit naar de AOW-leeftijd, is B8 daar altijd 1.
 *
 * ### De verstoring via een input-transform (tabellen onaangeraakt)
 * De MC-ruis raakt alleen het Bez-rendement van **investeringspotten** (bens!F=1):
 * `eff = basis + P!B43 + MC!B10 + MC!<col>12`. `tables/bez.ts` rekent al met
 * `eff = investering ? rendement + shift : rendement`. De wrapper bakt daarom per
 * run de gedeelde schok (MC!B10) én de per-pot-ruis (MC!<col>12) in `rendement`
 * van elke investeringspot; `onzekerheid.shift` (=P!B43) blijft staan. De tabellen
 * blijven ongewijzigd — de verstoring loopt puur over het invoer-pad. (Een scalar
 * `shift` kan de per-pot-ruis niet dragen; daarom het per-pot rendement-overschrijf
 * op de invoer, conform de opdracht.)
 *
 * Sinds **ADR 0117** wordt élke ruisterm nog geschaald met de markt-risicofactor van
 * de pot (`wrappers/risico.ts#potRisicoFactor`) — de binaire `investering`-vlag is
 * daarmee de TERUGVAL geworden, niet meer de poort. Ontbreekt de factor (het
 * fixture-pad zet 'm nooit) dan is de factor `investering ? 1 : 0` en verandert er
 * geen bit; met de factor krijgt een obligatiepot effectief 0,3·σ, een aandelenpot
 * 1,4·σ en beweegt een premieregeling-pensioenpot voor het eerst überhaupt mee.
 *
 * De live FIRE-leeftijd komt uit `solveFire` (de VBA draait vóór RunMonteCarlo
 * BepaalFIRE, die P!B16 op de echte solver-uitkomst zet — mét pensioen-kortsluiting).
 *
 * ### De percentielband (additief, buiten het oracle)
 * Elke run is een VOLLEDIGE `runKernelProjection` op de live FIRE-leeftijd — dus
 * inclusief overgang, onttrekking, AOW, pensioen en woonstrategie. Naast het
 * 1/0-criterium bewaart de wrapper daarom per run de netto-vermogensreeks
 * (Prognose!I) op de jaar-blokranden uit `jaarrand.ts`, en levert daaruit
 * p10/p25/p50/p75/p90 per leeftijd. Die band is de marktcheck op het HELE plan en
 * ligt per constructie op dezelfde leeftijdsas en dezelfde grondslag als de
 * hoofdlijn van de Toekomst-grafiek.
 *
 * Naast die I-band bewaart de wrapper per run ook de netto-LIQUIDE-reeks
 * (Prognose!J) op DEZELFDE blokranden → `bandLiquide`. Nodig omdat de Toekomst-grafiek
 * haar primaire lijn per woonstrategie van grondslag laat wisselen (I bij meetellen,
 * J bij uitsluiten): blijft de band dan op I terwijl de lijn J wordt, dan omhult de
 * band een ándere grootheid dan de lijn die erin ligt — en de bandtop bepaalt ook nog
 * eens de ashoogte mee. Grondslagvermenging op één Y-as is verboden (CLAUDE.md).
 *
 * `band`, `bandLiquide` en `sustainProbability` zijn AFGELEIDE, EXTRA velden: `outcomes` en
 * `successProbability` blijven cel-exact het Excel-oracle (`test/horizon-oracle/
 * parity-mc.test.ts` toetst uitsluitend die twee). Bak hier dus nooit een
 * afwijking van MC!B8 in — voeg een afgeleid veld toe.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { runKernelProjection } from '../engine'
import { solveFire } from '../solver'
import { computeEs, type EsRow } from '../tables/es'
import type { KernelInput } from '../types'
import { computeGap } from '../gap'
import { nettoLiquidePerLeeftijd, nettoVermogenPerLeeftijd } from '../jaarrand'
import { potIdiosyncraticNoise, sharedMarketShock } from './noise'
import { potRisicoFactor } from './risico'

/**
 * Percentielband over de MC-runs, op de grondslag **netto vermogen** (Prognose!I,
 * nominaal) — dezelfde grootheid als `SimRow.endPortfolio`, dus dezelfde als de
 * hoofdlijn van de Toekomst-grafiek. NOOIT mengen met de liquide/besteedbare
 * grondslag (Prognose!J).
 *
 * Elke reeks is geïndexeerd op leeftijds-offset vanaf `startAge`: index `i` hoort
 * bij leeftijd `startAge + i` (index 0 = de beginstand van vandaag, identiek in
 * alle runs — de band begint dus als één punt en waaiert daarna uit).
 */
export interface MonteCarloBand {
  /** Leeftijd bij index 0 = `round(input.startLeeftijd)` — de as van de hoofdlijn. */
  readonly startAge: number
  readonly p10: readonly number[]
  readonly p25: readonly number[]
  readonly p50: readonly number[]
  readonly p75: readonly number[]
  readonly p90: readonly number[]
}

/** Uitkomst van een Monte-Carlo-run over `n` deterministische runs. */
export interface MonteCarloResult {
  /** Per run het 1/0-slaagcriterium (MC!B14 … MC!B(13+n)). */
  readonly outcomes: readonly number[]
  /** MC!B4 — slaagkans = gemiddelde van de outcomes (`NaN` als n = 0). */
  readonly successProbability: number
  /**
   * Kans dat het plan het volhoudt = het deel van de runs met `gap ≥ 0` (P!B38:
   * modelwaarde op de eindleeftijd ≥ het doelbedrag van de eindstrategie).
   *
   * Voor deplete/legacy/perpetual is dit per constructie IDENTIEK aan
   * `successProbability` — daar ís MC!B8 die toets. Het verschilt alleen bij de
   * **pensioen**-eindstrategie: MC!B8 toetst daar `B16 ≥ AOW`, wat door de
   * pensioen-kortsluiting in de solver altijd 1 is (oracle-getrouw, maar als
   * getal betekenisloos). Dit veld past dáár de inhoudelijke toets toe
   * (Prognose!J op de eindleeftijd ≥ 0), zodat een oppervlak dat "kans dat je
   * geld het volhoudt" belooft dat ook waarmaakt.
   *
   * BEWUST een AFGELEID, EXTRA veld: `outcomes` en `successProbability` blijven
   * byte-identiek aan het Excel-oracle (parity-suite raakt dit veld niet).
   * `NaN` als n = 0.
   */
  readonly sustainProbability: number
  /**
   * P!B16 — de live FIRE-leeftijd waarop élke run is geëvalueerd (uit `solveFire`,
   * mét pensioen-kortsluiting). Doorgegeven zodat consumenten kunnen zien of er
   * binnen de horizon überhaupt een onttrekkingsfase ís: ligt deze op of voorbij
   * de eindleeftijd, dan toetst de gap niets en is een slaagkans betekenisloos.
   */
  readonly liveFireAge: number
  /** Aantal runs (n = MC!B1). */
  readonly runs: number
  /** Aantal engine-runs (solver + n perturbaties) — voor rapportage. */
  readonly engineRuns: number
  /** Per-leeftijd percentielband over de runs (grondslag: netto vermogen, Prognose!I). */
  readonly band: MonteCarloBand
  /**
   * Dezelfde percentielband op de netto-LIQUIDE grondslag (Prognose!J) — de J-spiegel
   * van `band`, uit `nettoLiquidePerLeeftijd` op exact dezelfde leeftijdsas, met
   * dezelfde `buildBand`/`percentiel`-ordestatistiek en dezelfde `startAge`.
   *
   * Voor het oppervlak dat zijn primaire lijn op J tekent (woonstrategie "niet
   * meetellen"): band en lijn MOETEN dan dezelfde grootheid dragen. Bij `include_full`
   * is niets niet-liquide en is deze band element-voor-element gelijk aan `band`.
   *
   * BEWUST een AFGELEID, EXTRA veld, net als `band`/`sustainProbability`: `outcomes`
   * en `successProbability` blijven byte-identiek aan het Excel-oracle.
   */
  readonly bandLiquide: MonteCarloBand
}

/**
 * Percentiel via nearest-rank op de oplopend gesorteerde reeks:
 * `waarden[clamp(floor(n·q), 0, n−1)]`. Bewust dezelfde ordestatistiek als de
 * band die de grafiek altijd al tekende (geen interpolatie), zodat de visuele
 * betekenis van p10…p90 niet verandert — alleen de motor eronder.
 */
function percentiel(gesorteerd: readonly number[], q: number): number {
  if (gesorteerd.length === 0) return 0
  const idx = Math.min(Math.max(Math.floor(gesorteerd.length * q), 0), gesorteerd.length - 1)
  return gesorteerd[idx]
}

/**
 * Bouw de percentielband uit de per-run reeksen. Grondslag-agnostisch: dezelfde
 * ordestatistiek voor de I-band (`band`) en de J-band (`bandLiquide`), zodat de twee
 * alleen in hun invoerreeks verschillen — niet in hun statistiek.
 */
function buildBand(startAge: number, paden: readonly number[][]): MonteCarloBand {
  const lengte = paden.reduce((max, p) => Math.max(max, p.length), 0)
  const p10: number[] = []
  const p25: number[] = []
  const p50: number[] = []
  const p75: number[] = []
  const p90: number[] = []
  for (let i = 0; i < lengte; i++) {
    const kolom = paden.map((p) => p[i] ?? 0).sort((a, b) => a - b)
    p10.push(percentiel(kolom, 0.1))
    p25.push(percentiel(kolom, 0.25))
    p50.push(percentiel(kolom, 0.5))
    p75.push(percentiel(kolom, 0.75))
    p90.push(percentiel(kolom, 0.9))
  }
  return { startAge, p10, p25, p50, p75, p90 }
}

/**
 * MC!B8 — 1/0-slaagcriterium van een doorgerekende (verstoorde) stand op de live
 * FIRE-leeftijd.
 *
 * **Generiek over elk stop-anker (ADR 0129 D3):** `gap ≥ 0` — model ≥ doel op de
 * eindleeftijd. Dat is de inhoudelijke vraag ("houdt dit plan het?") en hij geldt
 * even goed wanneer het stopmoment vastligt als wanneer de solver 'm zoekt.
 *
 * De **pensioen-oracle-tak** (`ROUND(P!B16,2) ≥ ES!C15`) blijft staan voor de
 * fixtures — maar alléén op het oracle-pad (geen `stopAnker`-blok). Die toets is
 * per constructie 1: de solver kortsluit B16 juist naar de AOW-leeftijd, dus MC!B8
 * vergelijkt een getal met zichzelf. Byte-exact Excel, maar als *slaagkans*
 * betekenisloos — het is precies waarom de marktcheck voor pensioen-gebruikers
 * altijd 100% meldde (bevinding 2 van het onderzoek van 3 sep 2026). Zodra het
 * anker als blok binnenkomt draait ook pensioen een échte simulatie; vastgelegd
 * als de D9-oracle-afwijking (klasse ADR 0033).
 *
 * `outcomes`/`successProbability` blijven daarmee byte-identiek op het fixture-pad:
 * geen fixture draagt `stopAnker` (`input-from-fixture` zet 'm nooit).
 */
function successCriterion(
  input: KernelInput,
  es: EsRow,
  proj: ReturnType<typeof runKernelProjection>,
  liveFireAge: number,
): number {
  if (es.interneCode === 'pensioen' && input.stopAnker === undefined) {
    // ROUND(P!B16, 2) ≥ ES!C15 (AOW). Live B16 sluit kort naar AOW → altijd 1.
    return Math.round(liveFireAge * 100) / 100 >= es.pensioenleeftijd ? 1 : 0
  }
  return computeGap(input, es, proj, liveFireAge) >= 0 ? 1 : 0
}

/**
 * Draai de Monte-Carlo-simulatie: `n` deterministische runs met de sin-hash-ruis
 * op de investeringspotten, geëvalueerd op de live FIRE-leeftijd. Reproduceert
 * `RunMonteCarlo` (de bevroren MC!B14…-reeks) + de slaagkans MC!B4.
 */
export function runMonteCarlo(input: KernelInput): MonteCarloResult {
  const es = computeEs(input)
  const sigma = input.onzekerheid.mc.sigma // MC!B3
  const n = input.onzekerheid.mc.aantalRuns // MC!B1

  // Live FIRE-leeftijd (P!B16 na BepaalFIRE — mét pensioen-kortsluiting).
  const solved = solveFire(input)
  const liveFireAge = solved.fireAge
  let engineRuns = solved.engineRuns

  const outcomes: number[] = []
  const sustainOutcomes: number[] = []
  const paden: number[][] = []
  const padenLiquide: number[][] = []
  for (let i = 1; i <= n; i++) {
    const shock = sharedMarketShock(i, sigma) // MC!B10 (gedeeld over marktgevoelige potten)
    // Bak MC!B10 + MC!<col>12 in het rendement van elke marktgevoelige pot; potten met
    // risicofactor 0 blijven ongemoeid. `onzekerheid.shift` (P!B43) blijft staan.
    //
    // ADR 0117 — beide ruistermen worden geschaald met de markt-risicofactor
    // (`wrappers/risico.ts`). Omdat `normInv(u, 0, σ) = σ·x`, is schalen van de
    // TREKKING identiek aan een per-pot σ: een obligatiepot krijgt effectief 0,3·σ,
    // een aandelenpot 1,4·σ, en een premieregeling-pensioenpot zit voor het eerst
    // überhaupt in de simulatie. De seed-reeks (`i`, `p.slot`) verandert niet, dus de
    // correlatiestructuur — één gedeelde marktschok, per pot verschillend hard —
    // blijft exact die van het Excel-model.
    //
    // Byte-identiteit zonder overlay: zonder `risicoFactor` is de factor
    // `investering ? 1 : 0`. Bewust `+ shock * f + ruis * f` en NIET
    // `+ (shock + ruis) * f`: bij f = 1 is `y * 1 === y` exact, waardoor de
    // OPTELVOLGORDE (en dus de laatste bit) gelijk blijft aan vóór ADR 0117 —
    // drijvende-komma-optelling is niet associatief. Bij f = 0 gaat de pot
    // ongewijzigd door. Het fixture-pad zet `risicoFactor` nooit → `parity-mc` blijft
    // cel-exact.
    const perturbed: KernelInput = {
      ...input,
      assetPotten: input.assetPotten.map((p) => {
        const factor = potRisicoFactor(p)
        if (factor === 0) return p
        return {
          ...p,
          rendement:
            p.rendement + shock * factor + potIdiosyncraticNoise(i, p.slot, sigma) * factor,
        }
      }),
    }
    engineRuns += 1
    // Eén VOLLEDIGE projectie op de LIVE FIRE-leeftijd: de run stopt op het
    // geplande moment en rekent daarna de onttrekking door (inclusief AOW,
    // pensioen, woonstrategie en grootboek). Daardoor volgt de band de hele
    // plan-curve — opbouw, overgang én afbouw — i.p.v. de opbouw door te zetten.
    const proj = runKernelProjection(perturbed, { fireAge: liveFireAge })
    outcomes.push(successCriterion(input, es, proj, liveFireAge))
    sustainOutcomes.push(computeGap(input, es, proj, liveFireAge) >= 0 ? 1 : 0)
    paden.push(nettoVermogenPerLeeftijd(perturbed, proj))
    padenLiquide.push(nettoLiquidePerLeeftijd(perturbed, proj))
  }

  const gemiddelde = (xs: readonly number[]): number =>
    xs.length === 0 ? Number.NaN : xs.reduce((sum, v) => sum + v, 0) / xs.length

  return {
    outcomes,
    successProbability: gemiddelde(outcomes),
    sustainProbability: gemiddelde(sustainOutcomes),
    liveFireAge,
    runs: n,
    engineRuns,
    band: buildBand(Math.round(input.startLeeftijd), paden),
    bandLiquide: buildBand(Math.round(input.startLeeftijd), padenLiquide),
  }
}
