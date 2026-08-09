/**
 * Horizon-kernel — **de marktcheck**: het gedeelde contract voor "draai dit plan n
 * keer opnieuw met verstoorde rendementen en vertel me waar het uitkomt".
 *
 * ## Waarom een eigen module
 * Twee routers voeden dezelfde marktcheck met hún eigen context: de convergentie-
 * router (/toekomst, `ConvergentieRawContext`) en de what-if-router
 * (/toekomst/whatif, `WhatifRawContext` — inclusief de rendement-slider). Alleen de
 * INVOER-assemblage verschilt; de begrenzing, de aanroep van `wrappers/mc.ts` en de
 * uitkomstvorm horen op één plek te leven, anders drijven de twee oppervlakken uit
 * elkaar — precies de foutklasse die deze fix opruimt.
 *
 * ## Wat de marktcheck NIET is
 * Geen tweede rekenmotor. De band komt integraal uit
 * `wrappers/mc.ts#runMonteCarlo`; de marge uit `rendement-marge.ts`. Deze module
 * begrenst alleen het aantal runs en mapt beide uitkomsten naar het
 * consumer-contract.
 *
 * ## Band ↔ marge — twee vragen, één plan
 *  - **band** = "waar kan dit plan uitkomen?" → 200 verstoorde projecties op de
 *    door de solver gevonden FIRE-leeftijd, grondslag Prognose!I (netto vermogen).
 *  - **marge** = "hoeveel mag er tegenvallen voordat het omvalt?" → 14 projecties
 *    met een binaire zoektocht op de rendement-shift, op een VASTE stopleeftijd,
 *    grondslag = de gap-toets (Prognose!J bij deplete/perpetual).
 * Beide op exact dezelfde `KernelInput`.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { runMonteCarlo, type MonteCarloBand } from './wrappers/mc'
import { computeEs } from './tables/es'
import { eindleeftijdVan } from './gap'
import { computeRendementMarge, type RendementMarge } from './rendement-marge'
import type { KernelInput } from './types'

/**
 * Bovengrens voor het aantal Monte-Carlo-runs van een marktcheck-overlay. Elke run
 * is een VOLLEDIGE kernel-projectie (gemeten 13–25 ms per run op de oracle-
 * fixtures), dus dit is een PRESTATIE-, geen rekengrens — en de reden dat elke
 * marktcheck verplicht in de web worker draait. Gelijk aan de Excel-parity-default
 * `EXCEL_ONZEKERHEID_DEFAULTS.mcAantalRuns` en aan `TOTAALPLAN_MC_RUNS`, zodat de
 * overlays en het totaalplan-rapport op hetzelfde aantal marktverlopen rekenen.
 *
 * LET OP — géén gedeelde METRIEK: de overlays tonen sinds 2026-08-09 de
 * rendement-marge en géén kans meer, terwijl het totaalplan-rapport nog
 * `successProbability` als "slagingskans" toont. Zie de note bij calc
 * `marktcheck-band` in `lib/architecture/calculations.ts`.
 */
export const MARKTCHECK_MAX_RUNS = 200

/**
 * Wachttijd vóór een marktcheck de worker in gaat. Ruim onder de duur van één
 * run (2,6–5,1 s) maar lang genoeg om de tussenstanden van een gebaar op te
 * slokken (een marker-drag op /toekomst, de rendement-slider op /toekomst/whatif),
 * zodat er nooit meer dan één job per gebaar in de seriële worker-wachtrij
 * belandt.
 *
 * Woont hier en niet in een component: **beide** marktcheck-surfaces moeten
 * dezelfde rem hebben. Stond deze constante in de component-body van
 * `horizon-client.tsx`, dan kon de zustersurface hem niet lezen — en precies dat
 * liet de what-if-slider ongeremd jobs versturen.
 */
export const MARKTCHECK_DEBOUNCE_MS = 400

/**
 * Schaal `MC!B3` van JAARvolatiliteit naar de onzekerheid in het GEMIDDELDE
 * jaarrendement over de plan-looptijd: **σ_eff = σ / √T**.
 *
 * ## Waarom dit moet
 * `wrappers/mc.ts` trekt één getal uit N(0, σ) en bakt dat PERMANENT in
 * `pot.rendement`, waarna de kernel er de hele looptijd mee compoundeert. Maar σ
 * (default 0,15) is blijkens `types.ts#McParams` de **jaarvolatiliteit**. Een
 * jaarlijkse schommeling en een levenslange verschuiving van het gemiddelde zijn
 * twee verschillende grootheden: jaarvolatiliteit middelt uit over de looptijd,
 * een permanente shift doet dat per definitie niet en compoundeert.
 *
 * Ongecorrigeerd rekende een p90-run daardoor 25,1% rendement per jaar, 49 jaar
 * achter elkaar — de band eindigde op een factor 1689 boven de mediaan en de
 * grafiek-Y-as schoot naar miljarden, waardoor de hele plan-lijn tot een streep
 * op nul werd platgedrukt.
 *
 * ## De schaling
 * Bij i.i.d. jaarrendementen met volatiliteit σ heeft het *gemiddelde* rendement
 * over T jaar een spreiding van σ/√T. Eén trekking uit N(0, σ/√T) die T jaar lang
 * wordt doorgerekend reproduceert dus de juiste spreiding in het EINDvermogen,
 * terwijl de kernel één scalair rendement per pot blijft krijgen — geen
 * motor-verbouwing, geen aanraking van de tabellen.
 *
 * ## Wat dit NIET modelleert
 * **Volgorde-risico (sequence-of-returns).** Een levenslang constant rendement
 * kan per definitie niet tonen dat een slecht jaar vlák ná je stopmoment harder
 * aankomt dan hetzelfde jaar twintig jaar later. Daarvoor is de losstaande
 * SORR-analyse (`lib/phase-monte-carlo.ts#runSORRAnalysis`), die wél per jaar
 * opnieuw trekt. Wil je dat hier ook, dan moet de engine een rendementREEKS per
 * pot aankunnen — dat raakt `tables/bez.ts` en daarmee de oracle-pariteit.
 *
 * `T` = de looptijd van het plan (`P!B35` eindleeftijd − startleeftijd), met een
 * ondergrens van 1 jaar zodat een degenerate/negatieve horizon nooit door nul of
 * door een wortel van nul deelt.
 */
export function marktcheckSigma(input: KernelInput): number {
  const looptijdJaren = Math.max(1, eindleeftijdVan(computeEs(input)) - input.startLeeftijd)
  return input.onzekerheid.mc.sigma / Math.sqrt(looptijdJaren)
}

/** Parameters van één marktcheck-run. */
export interface MarktcheckParams {
  /** Optionele extra begrenzing; effectief is altijd ≤ `MARKTCHECK_MAX_RUNS`. */
  readonly maxRuns?: number
  /**
   * De GEKOZEN stopleeftijd van het oppervlak (de stop-slider van /toekomst).
   * Ontbreekt hij, dan valt de marge terug op de AOW-leeftijd — zie
   * `rendement-marge.ts`. Raakt de BAND niet: die volgt altijd het gesolvede plan.
   */
  readonly stopAge?: number | null
}

/** Uitkomst van één marktcheck: de band + de marge, óf een expliciete fout. */
export type MarktcheckOutcome =
  | {
      readonly ok: true
      /** Percentielband op de netto-vermogensgrondslag (= de hoofdlijn-grondslag). */
      readonly band: MonteCarloBand
      /**
       * Hoeveel het rendement per jaar mag tegenvallen voordat het plan omvalt,
       * getoetst op een VASTE stopleeftijd (`null` = geen zinnige uitspraak).
       *
       * Verving op 2026-08-09 het `sustainProbability`-percentage. Dat percentage
       * werd geëvalueerd op de door de solver GEVONDEN FIRE-leeftijd — precies de
       * leeftijd waarop het plan bij het verwachte rendement op nul uitkomt —
       * waardoor het structureel ~51% was, ongeacht het plan (gemeten 0,77 · 0,51 ·
       * 0,52 · 0,51 · 0,51 over dezelfde persona met alleen andere uitgaven). Zie
       * `rendement-marge.ts` voor het anker en de degeneratie-regel.
       */
      readonly marge: RendementMarge | null
      /** Aantal doorgerekende marktverlopen. */
      readonly runs: number
    }
  | { readonly ok: false; readonly reason: string }

/**
 * Draai de marktcheck op een reeds samengestelde kernel-invoer. De routers bouwen
 * die invoer met hún eigen adapter — identiek aan de invoer van hun hoofdlijn —
 * zodat band en lijn per constructie van hetzelfde plan komen.
 *
 * ## De splitsing oracle ↔ product (bewust)
 * `wrappers/mc.ts#runMonteCarlo` REPRODUCEERT het Excel-oracle: met de fixture-σ
 * levert het cel-exact MC!B14…/MC!B4, en `test/horizon-oracle` pint dat. Deze
 * functie is het PRODUCT-oppervlak: hier mag — en moet — de invoer zó gezet
 * worden dat de gebruiker een statistisch zinnige spreiding ziet. De
 * σ-correctie leeft daarom uitsluitend hier, in de invoer die we aan de wrapper
 * meegeven. De wrapper zelf blijft onaangeraakt; het fixture-pad komt hier nooit
 * langs en blijft dus byte-groen.
 */
export function runMarktcheckOnKernelInput(
  input: KernelInput,
  params: MarktcheckParams = {},
): MarktcheckOutcome {
  try {
    const plafond = Math.min(params.maxRuns ?? MARKTCHECK_MAX_RUNS, MARKTCHECK_MAX_RUNS)
    const runs = Math.min(input.onzekerheid.mc.aantalRuns, plafond)
    const mc = runMonteCarlo({
      ...input,
      onzekerheid: {
        ...input.onzekerheid,
        mc: {
          ...input.onzekerheid.mc,
          aantalRuns: runs,
          // Jaarvolatiliteit → spreiding in het GEMIDDELDE rendement over de
          // looptijd. Zie `marktcheckSigma` voor het waarom.
          sigma: marktcheckSigma(input),
        },
      },
    })
    // De marge draait NIET mee in de 200 verstoorde runs: het is een eigen,
    // goedkope binaire zoektocht (14 projecties) naar de rendement-verschuiving
    // waarbij de gap door nul gaat, op een VASTE stopleeftijd. Zie
    // `rendement-marge.ts` voor het anker en de degeneratie-regel — die laatste
    // is dezelfde als bij de vervangen kans (geen onttrekkingsfase binnen de
    // horizon ⇒ geen getal), maar nu gemeten op het anker in plaats van op de
    // gesolvede FIRE-leeftijd. Daardoor krijgt óók het plan waarvan de
    // FIRE-leeftijd voorbij de eindleeftijd ligt een eerlijke uitspraak
    // ("er is X% méér rendement nodig") in plaats van het oude 100%-artefact.
    return {
      ok: true,
      band: mc.band,
      marge: computeRendementMarge(input, params.stopAge),
      runs: mc.runs,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'onbekende kernel-fout'
    return { ok: false, reason: message }
  }
}
