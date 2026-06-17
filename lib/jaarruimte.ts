/**
 * Jaarruimte (pensioen-aftrekruimte Box 1) — NL-specifieke fiscale tool.
 *
 * Plan-backlog: "Belasting totaaloverzicht + jaarruimte-tracker".
 *
 * Formule (stelsel sinds Wet toekomst pensioenen, art. 3.127 Wet IB 2001):
 *   jaarruimte = max(0,
 *     OPBOUW_PCT × premiegrondslag
 *     − FACTOR_A_IMPUTATIE × factorA
 *   )
 *   premiegrondslag = min(
 *     max(0, grossYearlyIncome − FRANCHISE),
 *     MAX_PREMIE_INKOMEN − FRANCHISE      // grondslag-cap
 *   )
 *
 * Waarden:
 *  - OPBOUW_PCT: 30% (Wet toekomst pensioenen, per 2023). LET OP: WTP
 *    VERHOOGDE dit opbouwpercentage van ~13,3% (oude stelsel) naar 30%. De
 *    eerdere constante `JAARRUIMTE_FACTOR_A = 0.133` was zowel verouderd ALS
 *    verkeerd benoemd: 0,133 was het oude opbouwpercentage, niet factor A.
 *  - FACTOR_A_IMPUTATIE: 6,27 — vaste vermenigvuldiger waarmee factor A
 *    (jaarlijkse pensioenaangroei volgens UPO) wordt afgetrokken.
 *  - factorA: de jaarlijkse pensioenaangroei in EUR uit het UPO (toename van de
 *    jaarlijkse pensioenuitkering). Geen werkgeverspensioen → factor A = 0. De
 *    motor doet intern × 6,27. (FOR is per 2023 afgeschaft; geen dotatie-term.)
 *  - FRANCHISE: AOW-drempel. Onder deze grens geen jaarruimte.
 *    €18.475 (2025) → €19.172 (2026).
 *  - MAX_PREMIE_INKOMEN: €137.800 (2024/2025/2026, ongewijzigd) — het
 *    premiegrondslag wordt op (dit − FRANCHISE) afgetopt (grondslag-cap).
 *  - MAX_JAARRUIMTE: afgeleide verificatie-constante, = 30% × (MAX_PREMIE_INKOMEN
 *    − FRANCHISE). €35.798 (2025) → €35.589 (2026). Niet langer de actieve cap
 *    in de formule (die loopt via de grondslag-cap, zie hieronder) maar een
 *    self-consistent referentiegetal voor de voetregel/tests.
 *
 * Cap-strategie — GRONDSLAG-CAP (niet uitkomst-cap):
 *   We toppen de PREMIEGRONDSLAG af op (MAX_PREMIE_INKOMEN − FRANCHISE) i.p.v.
 *   het EINDRESULTAAT op MAX_JAARRUIMTE. Dit is zuiverder en self-consistent:
 *   de jaargebonden MAX_JAARRUIMTE is per definitie 30% × (137.800 − franchise),
 *   dus een losse uitkomst-cap zou dat magische getal moeten dupliceren én bij
 *   een factor-A-aftrek het verkeerde plafond geven (de aftrek hoort ná de cap
 *   te komen, niet erna geknepen). Met de grondslag-cap is MAX_JAARRUIMTE alleen
 *   nog een afgeleide verificatie, geen tweede bron van waarheid.
 *
 * Reserveringsruimte (tien voorgaande jaren onbenut) zit niet in MVP —
 * vereist historische data. Toekomst: scrape via Mijnpensioenoverzicht.
 *
 * Bronnen (juni 2026): Belastingdienst (art. 3.127 Wet IB 2001 / Kennisgroepen
 * KG:070:2024:3), Evi van Lanschot. ADR 0023.
 */

import type { LeverageStatus } from '@/lib/leverage-status'

/**
 * Opbouwpercentage in de jaarruimteformule: 30% sinds Wet toekomst pensioenen
 * (per 2023). VROEGER ~13,3% — WTP verhóógde dit naar 30%.
 */
export const JAARRUIMTE_OPBOUW_PCT = 0.3

/**
 * @deprecated Gebruik {@link JAARRUIMTE_OPBOUW_PCT}. Behouden als alias zodat
 * bestaande UI-callers (de voetregel-tekst in `jaarruimte-card.tsx`) niet breken.
 * De naam "FACTOR_A" was historisch fout: dit is het OPBOUWPERCENTAGE, niet
 * factor A (= de pensioenaangroei in €). Verwijst nu naar de gecorrigeerde 30%.
 */
export const JAARRUIMTE_FACTOR_A = JAARRUIMTE_OPBOUW_PCT

/** Vaste vermenigvuldiger waarmee factor A (pensioenaangroei €) wordt afgetrokken. */
export const JAARRUIMTE_FACTOR_A_IMPUTATIE = 6.27

/** Maximaal premie-inkomen waarover je jaarruimte mag berekenen (2024/2025/2026). */
export const JAARRUIMTE_MAX_PREMIE_INKOMEN = 137_800

// ── 2025 ──────────────────────────────────────────────────────
export const JAARRUIMTE_FRANCHISE_2025 = 18_475
/** Afgeleide verificatie: 30% × (137.800 − 18.475) = 35.797,5 ≈ 35.798. */
export const JAARRUIMTE_MAX_2025 = 35_798

// ── 2026 ──────────────────────────────────────────────────────
export const JAARRUIMTE_FRANCHISE_2026 = 19_172
/** Afgeleide verificatie: 30% × (137.800 − 19.172) = 35.588,4 ≈ 35.589. */
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

/**
 * Fiscaal maximum middelloon-opbouwpercentage per dienstjaar (1,875%). Default
 * voor de salaris-gebaseerde factor-A-schatter. Bron: art. 18a Wet LB.
 */
export const JAARRUIMTE_MIDDELLOON_OPBOUW_PCT = 0.01875

export type JaarruimteResult = {
  /** Onbenutte jaarruimte in EUR (voor het gekozen jaar). */
  jaarruimte: number
  /** Of de berekening kon worden uitgevoerd (gross-income > 0). */
  hasData: boolean
  /** Rauwe input voor transparantie. */
  grossYearlyIncome: number
  /** Factor A: jaarlijkse pensioenaangroei in € (UPO). Wordt intern × 6,27. */
  factorA: number
  /** Het jaar waarvoor gerekend is (default 2026). */
  year: JaarruimteJaar
  /** De gebruikte franchise en cap — handig voor de voetregel. */
  franchise: number
  max: number
}

/**
 * Bereken de onbenutte jaarruimte (pensioen-aftrekruimte Box 1).
 *
 *   jaarruimte = max(0, 30% × min(grondslag, MAX_PREMIE_INKOMEN − franchise)
 *                       − 6,27 × factorA)
 *
 * @param grossYearlyIncome  Bruto jaarinkomen (Box 1: loon + winst + EW-forfait).
 * @param factorA            **Factor A**: de jaarlijkse pensioenaangroei in € uit
 *                           het UPO (toename van de jaarlijkse pensioenuitkering).
 *                           De motor doet intern × 6,27. 0 = geen werkgeverspensioen
 *                           (zzp). Negatief wordt op 0 geclamped. (Was vóór de
 *                           fiscale correctie een rauwe euro-aftrek; nu factor A.)
 * @param yearOrOptions      Belastingjaar (2025 | 2026) of `{ year }`. Default 2026.
 *
 * Achterwaarts compatibel: bestaande callers die alleen
 * `(grossYearlyIncome, factorA)` doorgeven krijgen de **2026**-waarden.
 */
export function computeJaarruimte(
  grossYearlyIncome: number,
  factorA: number = 0,
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
      factorA,
      year,
      franchise,
      max,
    }
  }

  // Premiegrondslag = inkomen − franchise, afgetopt op (max premie-inkomen −
  // franchise) — de grondslag-cap (zie module-JSDoc voor de keuze-onderbouwing).
  const grondslagCap = JAARRUIMTE_MAX_PREMIE_INKOMEN - franchise
  const grondslag = Math.min(Math.max(0, grossYearlyIncome - franchise), grondslagCap)

  const basis = grondslag * JAARRUIMTE_OPBOUW_PCT
  const aftrek = JAARRUIMTE_FACTOR_A_IMPUTATIE * Math.max(0, factorA)
  const onbenut = Math.max(0, basis - aftrek)

  return {
    jaarruimte: Math.round(onbenut),
    hasData: true,
    grossYearlyIncome,
    factorA,
    year,
    franchise,
    max,
  }
}

/**
 * Schat **factor A** uit het (pensioengevend) jaarsalaris — de "alternatieve
 * route" voor wie het UPO-getal niet bij de hand heeft.
 *
 * Voor een middelloonregeling geldt: factor A = opbouw% × pensioengrondslag,
 * met pensioengrondslag = pensioengevend salaris − AOW-franchise. Dit geeft
 * factor A DIRECT (de jaarlijkse aangroei van de uitkering), precies de input die
 * {@link computeJaarruimte} intern × 6,27 nodig heeft. We kiezen deze route boven
 * een premie-proxy (premie ≈ 6,27 × factor A) omdat de premie zelden zuiver
 * bekend is en sterk regelingsafhankelijk is.
 *
 * **Indicatie, geen exact UPO-getal.** Werkelijke regelingen wijken af in
 * franchise en opbouwpercentage; vul het echte factor-A-getal in als bekend.
 *
 * @param grossYearlySalary  Pensioengevend bruto jaarsalaris in €.
 * @param opts.year          Belastingjaar voor de default-franchise (default 2026).
 * @param opts.franchise     Override voor de AOW/pensioen-franchise (€).
 * @param opts.opbouwPct     Opbouwpercentage per dienstjaar als fractie
 *                           (default 1,875% = fiscaal middelloon-maximum).
 * @returns Geschatte factor A in € (≥ 0, afgerond op centen).
 *
 * Bron: art. 18a Wet LB (1,875% middelloon-maximum); Belastingdienst factor A.
 */
export function estimateFactorAFromSalary(
  grossYearlySalary: number,
  opts: {
    year?: JaarruimteJaar
    franchise?: number
    opbouwPct?: number
  } = {},
): number {
  const year = opts.year ?? 2026
  const franchise = opts.franchise ?? JAARRUIMTE_PARAMS[year].franchise
  const opbouwPct = opts.opbouwPct ?? JAARRUIMTE_MIDDELLOON_OPBOUW_PCT

  const pensioengrondslag = Math.max(0, grossYearlySalary - franchise)
  const factorA = pensioengrondslag * opbouwPct
  return Math.round(factorA * 100) / 100
}

/** Resultaat van {@link resolvePensionFactorA}. */
export interface ResolvedPensionFactorA {
  /**
   * Factor A in €, altijd een reëel getal ≥ 0 (geclampt). Dit is wat
   * {@link computeJaarruimte} als tweede argument verwacht. Bij onbekend → 0,
   * zodat de motor zonder factor-A-aftrek rekent.
   */
  factorA: number
  /** Herkomst van het getal: UPO-invoer of salaris-schatting. null = onbekend/ongeldig. */
  source: 'upo' | 'estimated' | null
  /**
   * Of er daadwerkelijk een waarde bekend is. Bewust GESCHEIDEN van `factorA`:
   * een UI kan zo "niet ingevuld" tonen i.p.v. een misleidende "€0 aangroei".
   */
  isKnown: boolean
}

/**
 * Canonieke resolver voor **factor A** (jaarlijkse pensioenaangroei uit het UPO),
 * persistent opgeslagen als één bron in `profiles.pension_factor_a` (+ `_source`).
 *
 * **NULL ≠ 0 (kernsemantiek).** Een leeg `pension_factor_a` betekent
 * "niet ingevuld" (`isKnown: false`), NIET "geen pensioenaangroei (€0)". Beide
 * leiden tot `factorA: 0` zodat de jaarruimte-motor faal-zacht zonder aftrek
 * rekent, maar `isKnown` laat de UI het verschil tonen. Een EXPLICIETE 0
 * (gebruiker geeft aan: geen werkgeverspensioen) is wél bekend (`isKnown: true`).
 *
 * **Geen automatische salaris-schatting hier (bewust).** `estimateFactorAFromSalary`
 * wordt NIET als fallback aangeroepen: een schatting is een expliciete
 * gebruikersactie (stap 2) die als `_source='estimated'` wordt weggeschreven.
 * Stil schatten zou een geraden getal als "bekend" presenteren en de bron
 * vertroebelen. Daarom geen `salaryFallback`-parameter.
 *
 * `factorA` wordt geclampt op `Math.max(0, value)` (negatief → 0, isKnown blijft
 * true) en NaN wordt als onbekend behandeld. `isKnown` volgt de NUMERIEKE waarde,
 * niet de bron — een geldige waarde met een onbekende bron-string is nog steeds
 * `isKnown: true` met `source: null`.
 *
 * @param profile  Structureel object met `pension_factor_a` (€, nullable) en
 *                 `pension_factor_a_source` ('upo' | 'estimated' | overig). Mag
 *                 null/undefined zijn → onbekend-tak.
 */
export function resolvePensionFactorA(
  profile:
    | { pension_factor_a?: number | null; pension_factor_a_source?: string | null }
    | null
    | undefined,
): ResolvedPensionFactorA {
  const raw = profile?.pension_factor_a
  // null/undefined → onbekend (NULL ≠ 0).
  if (raw === null || raw === undefined) {
    return { factorA: 0, source: null, isKnown: false }
  }
  const num = Number(raw)
  // NaN/oneindig → behandel als niet-bekend (defensief tegen corrupte data).
  if (!Number.isFinite(num)) {
    return { factorA: 0, source: null, isKnown: false }
  }
  const factorA = Math.max(0, num)
  const rawSource = profile?.pension_factor_a_source
  const source: 'upo' | 'estimated' | null =
    rawSource === 'upo' || rawSource === 'estimated' ? rawSource : null
  return { factorA, source, isKnown: true }
}

/**
 * Box 1-status uit netto-maandinkomen + marginaal tarief — SINGLE SOURCE voor
 * zowel de Belasting-landingskaart (Box 1) als de sidebar-status-dot.
 *
 * Het bruto jaarinkomen wordt afgeleid uit het netto-maandinkomen via
 * `bruto ≈ netto / (1 − marginaal)` (identiek aan de Belasting-pagina), en de
 * onbenutte jaarruimte bepaalt de status:
 *  - neutral: geen inkomen (grossYearly ≤ 0)
 *  - warn:    onbenutte jaarruimte > 0 → belastingbesparingskans
 *  - good:    ruimte volledig benut
 *
 * Geeft óók de afgeleide `grossYearly` terug zodat de pagina die kan hergebruiken
 * (geen tweede afleiding → geen drift). Factor A = 0 (status-heuristiek).
 */
export function box1JaarruimteStatus(input: {
  /** Netto maandinkomen (effectief — manual of transactie-afgeleid). */
  netMonthly: number
  /** Marginaal IB-tarief (0–1), bv. 0.3697 of 0.4950. */
  marginaalTarief: number
}): { status: LeverageStatus; grossYearly: number } {
  const { netMonthly, marginaalTarief } = input
  const grossYearly =
    netMonthly > 0 && marginaalTarief > 0 && marginaalTarief < 1
      ? (netMonthly * 12) / (1 - marginaalTarief)
      : 0
  const jaarruimte = computeJaarruimte(grossYearly, 0)
  const status: LeverageStatus = !jaarruimte.hasData
    ? 'neutral'
    : jaarruimte.jaarruimte > 0
      ? 'warn'
      : 'good'
  return { status, grossYearly }
}
