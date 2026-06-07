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
 *  - FACTOR_A: 13.3% (sinds Wet toekomst pensioenen) — gelijk in 2025 en 2026
 *  - FRANCHISE: drempel waarover je AOW al pensioen krijgt. Onder deze grens
 *    geen jaarruimte. €17.545 (2025) → €19.172 (2026)
 *  - MAX_JAARRUIMTE: cap per persoon. €34.310 (2025) → €35.589 (2026)
 *  - pensioenAangroei: wat je werkgever al opbouwt — niet beschikbaar
 *    voor lijfrente-aftrek
 *
 * Reserveringsruimte (tien voorgaande jaren onbenut) zit niet in MVP —
 * vereist historische data. Toekomst: scrape via Mijnpensioenoverzicht.
 *
 * Bron 2026-waarden: Belastingdienst / Evi van Lanschot (juni 2026):
 * franchise €19.172, max jaarruimte €35.589, factor A 13,3%.
 */

export const JAARRUIMTE_FACTOR_A = 0.133

// ── 2025 ──────────────────────────────────────────────────────
export const JAARRUIMTE_FRANCHISE_2025 = 17_545
export const JAARRUIMTE_MAX_2025 = 34_310

// ── 2026 ──────────────────────────────────────────────────────
export const JAARRUIMTE_FRANCHISE_2026 = 19_172
export const JAARRUIMTE_MAX_2026 = 35_589

/** Ondersteunde jaren voor de jaarruimte-berekening. */
export type JaarruimteJaar = 2025 | 2026

/** Franchise + cap per jaar — bron van waarheid voor jaar-afhankelijke params. */
export const JAARRUIMTE_PARAMS: Record<
  JaarruimteJaar,
  { franchise: number; max: number }
> = {
  2025: { franchise: JAARRUIMTE_FRANCHISE_2025, max: JAARRUIMTE_MAX_2025 },
  2026: { franchise: JAARRUIMTE_FRANCHISE_2026, max: JAARRUIMTE_MAX_2026 },
}

export type JaarruimteResult = {
  /** Onbenutte jaarruimte in EUR (voor het gekozen jaar). */
  jaarruimte: number
  /** Of de berekening kon worden uitgevoerd (gross-income > 0). */
  hasData: boolean
  /** Rauwe input voor transparantie. */
  grossYearlyIncome: number
  pensioenAangroei: number
  /** Het jaar waarvoor gerekend is (default 2026). */
  year: JaarruimteJaar
  /** De gebruikte franchise en cap — handig voor de voetregel. */
  franchise: number
  max: number
}

/**
 * Bereken de onbenutte jaarruimte.
 *
 * Achterwaarts compatibel: bestaande callers die alleen
 * `(grossYearlyIncome, pensioenAangroei)` doorgeven krijgen nu de **2026**-
 * waarden (het actieve belastingjaar). Geef expliciet `2025` door voor het
 * oude gedrag. Het 3e argument mag ofwel een jaar zijn (2025 | 2026) ofwel
 * een options-object voor toekomstige uitbreiding.
 */
export function computeJaarruimte(
  grossYearlyIncome: number,
  pensioenAangroei: number = 0,
  yearOrOptions: JaarruimteJaar | { year?: JaarruimteJaar } = 2026,
): JaarruimteResult {
  const year: JaarruimteJaar =
    typeof yearOrOptions === 'number' ? yearOrOptions : yearOrOptions.year ?? 2026
  const { franchise, max } = JAARRUIMTE_PARAMS[year]

  if (grossYearlyIncome <= 0) {
    return {
      jaarruimte: 0,
      hasData: false,
      grossYearlyIncome,
      pensioenAangroei,
      year,
      franchise,
      max,
    }
  }
  const grondslag = Math.max(0, grossYearlyIncome - franchise)
  const basis = grondslag * JAARRUIMTE_FACTOR_A
  const capped = Math.min(max, basis)
  const onbenut = Math.max(0, capped - Math.max(0, pensioenAangroei))
  return {
    jaarruimte: Math.round(onbenut),
    hasData: true,
    grossYearlyIncome,
    pensioenAangroei,
    year,
    franchise,
    max,
  }
}
