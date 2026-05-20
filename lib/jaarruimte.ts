/**
 * Jaarruimte (pensioen-aftrekruimte Box 1) — NL-specifieke fiscale tool.
 *
 * Plan-backlog: "Belasting totaaloverzicht + jaarruimte-tracker".
 *
 * Formule (2025/2026 stelsel):
 *   jaarruimte = max(0,
 *     min(MAX_JAARRUIMTE, FACTOR_A × max(0, grossYearlyIncome − FRANCHISE))
 *     − pensioenAangroei
 *   )
 *
 * Waarden:
 *  - FACTOR_A: 13.3% (sinds Wet toekomst pensioenen)
 *  - FRANCHISE: €17.545 voor 2025 — drempel waarover je AOW al pensioen
 *    krijgt. Onder deze grens geen jaarruimte
 *  - MAX_JAARRUIMTE: €34.310 per persoon (2025 cap)
 *  - pensioenAangroei: wat je werkgever al opbouwt — niet beschikbaar
 *    voor lijfrente-aftrek
 *
 * Reserveringsruimte (zes voorgaande jaren onbenut) zit niet in MVP —
 * vereist historische data. Toekomst: scrape via Mijnpensioenoverzicht.
 */

export const JAARRUIMTE_FACTOR_A = 0.133
export const JAARRUIMTE_FRANCHISE_2025 = 17_545
export const JAARRUIMTE_MAX_2025 = 34_310

export type JaarruimteResult = {
  /** Onbenutte jaarruimte 2025 in EUR. */
  jaarruimte: number
  /** Of de berekening kon worden uitgevoerd (gross-income > 0). */
  hasData: boolean
  /** Rauwe input voor transparantie. */
  grossYearlyIncome: number
  pensioenAangroei: number
}

export function computeJaarruimte(
  grossYearlyIncome: number,
  pensioenAangroei: number = 0,
): JaarruimteResult {
  if (grossYearlyIncome <= 0) {
    return {
      jaarruimte: 0,
      hasData: false,
      grossYearlyIncome,
      pensioenAangroei,
    }
  }
  const grondslag = Math.max(0, grossYearlyIncome - JAARRUIMTE_FRANCHISE_2025)
  const basis = grondslag * JAARRUIMTE_FACTOR_A
  const capped = Math.min(JAARRUIMTE_MAX_2025, basis)
  const onbenut = Math.max(0, capped - Math.max(0, pensioenAangroei))
  return {
    jaarruimte: Math.round(onbenut),
    hasData: true,
    grossYearlyIncome,
    pensioenAangroei,
  }
}
