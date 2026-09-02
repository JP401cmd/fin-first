/**
 * Horizon-kernel · tabel **ES** (Eindstrategie-spiegel) — Excel-tab `ES` (A1:F21).
 *
 * ES is GEEN maandtabel maar een klein **afgeleid blok** dat de eindstrategie-keuze
 * en -parameters van tabblad P spiegelt/vertaalt. Het voedt de solver-doelcellen
 * (P!B35/B36/B37) en de Monte-Carlo-slaagcriteria (MC!B8): met name ES!C7 (interne
 * code) en ES!C13 (niet-liquide meetellen ← P!B54). ES heeft geen eigen invoer —
 * alle rekencellen zijn zuivere functies van de P-eindstrategie-parameters.
 *
 * De **berekende cellen** (kolom C + de actief-markers in kolom E):
 *   - **C5** gekozen eindstrategie   = P!B48 (spiegel).
 *   - **C6** "wat dit betekent"       = SWITCH op de interne code → één-regel-uitleg.
 *   - **C7** interne code             = IFS(P!B48): opeten→deplete, nalatenschap→legacy,
 *                                        eeuwigdurend→perpetual, pensioenleeftijd→pensioen.
 *   - **C10** eindleeftijd opeten     = P!B51.
 *   - **C11** eindleeftijd nalatenschap = P!B52.
 *   - **C12** nalatenschapbedrag      = P!B53 (koopkracht-nu).
 *   - **C13** niet-liquide meetellen  = P!B54 (Ja/Nee) → P!B37 én MC!B8.
 *   - **C14** eeuwigdurend            = constante "n.v.t." (geen invoer — afgeleid).
 *   - **C15** pensioenleeftijd (AOW)  = P!B55.
 *   - **E10:E15** actief-markers      = "◀ actief" op de parameterrijen die bij de
 *     gekozen strategie horen (deplete→E10; legacy→E11/E12/E13; perpetual→E14;
 *     pensioen→E15), anders "" (leeg — de IF-formule levert een lege string).
 *
 * De rest van ES (kolommen A/B/D/F, de sectiekoppen en het "3 · Toelichting"-blok)
 * is **statische documentatie**: in alle 19 fixtures identiek, niet uit de P-invoer
 * afgeleid. Die valt bewust buiten de parity (zie parity-es.test.ts).
 *
 * Pure functie, geen fs/Supabase/Date.now/Math.random.
 */

import type { Eindstrategie, KernelInput } from '../types'

/**
 * Interne eindstrategie-code (ES!C7) — de canonieke sleutel die de solver/MC gebruikt.
 * `'nu'` (ADR 0127) bestaat niet in het Excel-oracle: FIRE = startleeftijd (maand 0),
 * eindleeftijd = B51, doel €0 — zie solver.ts en gap.ts.
 */
export type EindstrategieCode = 'deplete' | 'legacy' | 'perpetual' | 'pensioen' | 'nu'

/** ES!C7 — mapping van de P!B48-keuze naar de interne code (Excel-IFS). */
const CODE_PER_EINDSTRATEGIE: Record<Eindstrategie, EindstrategieCode> = {
  'Vermogen opeten': 'deplete',
  Nalatenschap: 'legacy',
  Eeuwigdurend: 'perpetual',
  Pensioenleeftijd: 'pensioen',
  'Nu stoppen': 'nu',
}

/** ES!C6 — "wat dit betekent"-uitleg per interne code (Excel-SWITCH). */
const BETEKENIS_PER_CODE: Record<EindstrategieCode, string> = {
  deplete: 'De pot mag op de gekozen eindleeftijd tot €0 dalen.',
  legacy: 'Eindigt met een doelbedrag dat op de eindleeftijd nog in de pot moet zitten.',
  perpetual: 'Alleen het reële rendement wordt onttrokken; de koopkracht van de pot blijft intact.',
  pensioen: 'Je stopt met werken op de AOW-leeftijd; de rest is een gevolg.',
  nu: 'Werken stopt vandaag; het vermogen moet tot de gekozen eindleeftijd reiken (doel €0).',
}

/** ES!E-actief-marker (BLACK LEFT-POINTING TRIANGLE + " actief"); leeg = "". */
export const ACTIEF_MARKER = '◀ actief'

/** ES!C14 — vaste tekst (Eeuwigdurend heeft geen invoer; afgeleid). */
export const EEUWIGDUREND_NVT = 'n.v.t.'

/**
 * De actief-markers (ES!E10:E15) per interne code: "◀ actief" op de parameterrijen
 * die bij de gekozen strategie horen, anders "". Rij-mapping:
 *   deplete → E10 · legacy → E11/E12/E13 · perpetual → E14 · pensioen → E15 ·
 *   nu → E10 (dezelfde eindleeftijd-parameter B51 als deplete; ADR 0127).
 */
const ACTIEVE_RIJEN_PER_CODE: Record<EindstrategieCode, ReadonlySet<number>> = {
  deplete: new Set([10]),
  legacy: new Set([11, 12, 13]),
  perpetual: new Set([14]),
  pensioen: new Set([15]),
  nu: new Set([10]),
}

/** De actief-marker voor E-rij `rij` (10..15) bij interne code `code`. */
function actiefMarker(code: EindstrategieCode, rij: number): string {
  return ACTIEVE_RIJEN_PER_CODE[code].has(rij) ? ACTIEF_MARKER : ''
}

/** De berekende ES-cellen (kolom C + de actief-markers E10:E15). */
export interface EsRow {
  /** C5 — gekozen eindstrategie (spiegel P!B48). */
  readonly gekozen: Eindstrategie
  /** C6 — "wat dit betekent"-uitleg. */
  readonly betekenis: string
  /** C7 — interne code. */
  readonly interneCode: EindstrategieCode
  /** C10 — eindleeftijd opeten (P!B51). */
  readonly eindleeftijdOpeten: number
  /** C11 — eindleeftijd nalatenschap (P!B52). */
  readonly eindleeftijdNalatenschap: number
  /** C12 — nalatenschapbedrag (P!B53). */
  readonly nalatenschapBedrag: number
  /** C13 — niet-liquide meetellen (P!B54, Ja/Nee). */
  readonly nietLiquideMeetellen: string
  /** C14 — vaste tekst "n.v.t." (Eeuwigdurend). */
  readonly eeuwigdurend: string
  /** C15 — pensioenleeftijd/AOW (P!B55). */
  readonly pensioenleeftijd: number
  /** E10 — actief-marker "Vermogen opeten". */
  readonly actiefOpeten: string
  /** E11 — actief-marker "Nalatenschap · eindleeftijd". */
  readonly actiefNalatenschapEindleeftijd: string
  /** E12 — actief-marker "Nalatenschap · bedrag". */
  readonly actiefNalatenschapBedrag: string
  /** E13 — actief-marker "Nalatenschap · niet-liquide meetellen". */
  readonly actiefNietLiquide: string
  /** E14 — actief-marker "Eeuwigdurend". */
  readonly actiefEeuwigdurend: string
  /** E15 — actief-marker "Pensioenleeftijd". */
  readonly actiefPensioen: string
}

/**
 * Bereken het ES-blok (de spiegel/afleiding van de P-eindstrategie-parameters).
 * Zuivere functie van `KernelInput`; geen maand-afhankelijkheid.
 */
export function computeEs(input: KernelInput): EsRow {
  const { eindstrategie, persoon } = input
  const gekozen = eindstrategie.selector
  const interneCode = CODE_PER_EINDSTRATEGIE[gekozen]

  return {
    gekozen,
    betekenis: BETEKENIS_PER_CODE[interneCode],
    interneCode,
    eindleeftijdOpeten: eindstrategie.eindleeftijdOpeten, // P!B51
    eindleeftijdNalatenschap: eindstrategie.eindleeftijdNalatenschap, // P!B52
    nalatenschapBedrag: eindstrategie.nalatenschapBedrag, // P!B53
    nietLiquideMeetellen: eindstrategie.nietLiquideMeetellen, // P!B54
    eeuwigdurend: EEUWIGDUREND_NVT, // C14 constante
    pensioenleeftijd: persoon.aowLeeftijd, // P!B55
    actiefOpeten: actiefMarker(interneCode, 10),
    actiefNalatenschapEindleeftijd: actiefMarker(interneCode, 11),
    actiefNalatenschapBedrag: actiefMarker(interneCode, 12),
    actiefNietLiquide: actiefMarker(interneCode, 13),
    actiefEeuwigdurend: actiefMarker(interneCode, 14),
    actiefPensioen: actiefMarker(interneCode, 15),
  }
}
