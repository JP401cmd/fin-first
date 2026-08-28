/**
 * Box 2 aanmerkelijk belang belasting — pure calculation engine.
 *
 * Box 2 belast inkomen uit aanmerkelijk belang (≥5% deelneming):
 * - Dividend uit deelnemingen
 * - Vervreemdingswinst (verkoop aandelen)
 *
 * Tarief 2025/2026: 24,5% in de eerste schijf, daarboven 31%
 * (het toptarief is per 2025 verlaagd van 33% naar 31%).
 * Eerste-schijfgrens: 2025 €67.804 (partner €135.608),
 * 2026 €68.843 (partner €137.686 — fiscaal partner verdubbelt de grens).
 *
 * Pure functions, no Supabase dependency. Follows the pattern of box3-data.ts.
 */

import { formatCurrency } from './format'
import type { TaxYear } from './box3-data'
export type { TaxYear } from './box3-data'

// ── Types ────────────────────────────────────────────────────

export interface Box2Params {
  tariefLaag: number    // 24,5%
  tariefHoog: number    // 31% (toptarief per 2025 verlaagd van 33%)
  grens: number         // eerste-schijfgrens (single)
  grensPartner: number  // eerste-schijfgrens met fiscaal partner (verdubbeld)
}

export interface Box2Deelneming {
  name: string
  /**
   * Jaarlijks dividend. `null` = NIET INGEVULD, en dat is iets anders dan 0.
   *
   * Bevinding H26: de route mapte `Number(a.annual_dividend) || 0`, waardoor een
   * lege kolom stil €0 werd. De Box 2-kop toonde dan "€0 per jaar" — wat een
   * DGA leest als "ik betaal geen Box 2", terwijl de app het simpelweg nooit
   * gevraagd heeft. In een fiscale context is een verzonnen nul een
   * vertrouwensbreuk; het onderscheid moet dus door de motor heen blijven
   * bestaan (zie `Box2Result.dividendOnbekend`).
   */
  annual_dividend: number | null
  disposal_gain: number  // vervreemdingswinst
}

export interface Box2Input {
  deelnemingen: Box2Deelneming[]
  year: TaxYear
  hasPartner: boolean
  dailyExpenses: number  // for freedom-days calculation
  dgaLeningenTotal?: number  // totaal DGA-leningen (vorderingen subtype dga_lening)
}

export interface Box2PerDeelneming {
  name: string
  dividend: number
  disposalGain: number
  totalIncome: number
  shareOfTotal: number  // percentage of total Box 2 income
  /** true = deze deelneming heeft géén ingevuld dividend (NULL, niet 0). */
  dividendOnbekend: boolean
}

export interface Box2Result {
  year: TaxYear
  hasPartner: boolean
  params: Box2Params

  // Per-deelneming breakdown
  perDeelneming: Box2PerDeelneming[]

  // Totals
  totalDividend: number
  totalDisposalGain: number
  totalIncome: number

  /**
   * true zodra MINSTENS ÉÉN deelneming geen ingevuld dividend heeft. Het
   * getoonde bedrag is dan een ONDERGRENS, geen aanslag — een oppervlak hoort
   * hier "nog niet ingevuld" van te maken i.p.v. een zelfverzekerde €0
   * (bevinding H26). Zonder deelnemingen is er niets onbekend → false.
   */
  dividendOnbekend: boolean
  /** Aantal deelnemingen zonder ingevuld dividend (voor "1 van de 2"-teksten). */
  dividendOnbekendCount: number

  // Schijfverdeling van het Box 2-inkomen (de grondslag ónder taxLow/taxHigh).
  // Bewust ONDERDEEL VAN DE MOTOR: de dividend-schijfsimulator tekende deze
  // splitsing tot 26-08-2026 met een eigen `splitDividend()` na — een tweede
  // staffel-implementatie die ongerond rekende en `dgaExcessTax` niet kende
  // (bevinding H26, "one formula, one home").
  incomeLow: number    // deel van het inkomen in de eerste schijf
  incomeHigh: number   // deel van het inkomen boven de eerste-schijfgrens

  // Tax calculation
  taxLow: number       // belasting tegen laag tarief
  taxHigh: number      // belasting tegen hoog tarief
  totalTax: number
  effectiveRate: number // effectief tarief (0–1)

  // Wet excessief lenen DGA
  dgaLeningenTotal: number       // totaal uitstaande DGA-leningen
  dgaLeningenDrempel: number     // drempel (€500.000)
  dgaLeningenExcess: number      // bovenmatig deel
  dgaExcessTax: number           // extra belasting op bovenmatig deel
  totalTaxInclDga: number        // totalTax + dgaExcessTax

  // Freedom metric
  freedomDays: number
  dailyExpenses: number
}

// ── Constants ────────────────────────────────────────────────

export const BOX2_PARAMS: Record<TaxYear, Box2Params> = {
  2025: {
    tariefLaag: 0.245,
    tariefHoog: 0.31,
    grens: 67_804,
    grensPartner: 135_608,
  },
  2026: {
    tariefLaag: 0.245,
    tariefHoog: 0.31,
    grens: 68_843,
    grensPartner: 137_686,
  },
}

/** Wet excessief lenen bij eigen vennootschap — drempel */
export const DGA_LENING_DREMPEL = 500_000

// ── Vennootschapsbelasting (Vpb) ─────────────────────────────
//
// De Vpb belast de winst van een BV vóórdat die als dividend naar privé (Box 2)
// stroomt. Vpb hoort alleen thuis in de context van Box 2 (winst-via-dividend),
// daarom leeft de canonieke tabel hier i.p.v. in een los bestand.

export interface VpbParams {
  tariefLaag: number   // opstaptarief (eerste schijf)
  tariefHoog: number   // algemeen tarief
  grens: number        // schijfgrens (opstap → algemeen)
}

/**
 * Vpb-tarieven per jaar. Bron: Belastingdienst, Vpb-tarieven 2025 & 2026
 * (ongewijzigd t.o.v. elkaar): 19% opstaptarief tot €200.000 winst, 25,8%
 * daarboven. Enige canonieke bron — importeer i.p.v. lokaal her-declareren.
 */
export const VPB_PARAMS: Record<TaxYear, VpbParams> = {
  2025: { tariefLaag: 0.19, tariefHoog: 0.258, grens: 200_000 },
  2026: { tariefLaag: 0.19, tariefHoog: 0.258, grens: 200_000 },
}

export const BOX2_TOOLTIPS: Record<string, string> = {
  box2: 'Box 2 belast inkomen uit aanmerkelijk belang — dividend en verkoopwinst van deelnemingen (≥5%).',
  aanmerkelijkBelang: 'Je hebt een aanmerkelijk belang als je (direct of indirect) 5% of meer van de aandelen bezit.',
  tariefStaffel: 'In de eerste schijf betaal je 24,5% (2026 tot €68.843; 2025 tot €67.804). Daarboven geldt 31% — het toptarief is per 2025 verlaagd van 33% naar 31%. Met fiscaal partner verdubbelt de eerste-schijfgrens (2026 €137.686).',
  dividend: 'Winstuitkering die je ontvangt van een BV of deelneming waarin je aanmerkelijk belang hebt.',
  dividendOnbekend: 'Je jaarlijks dividend is nog niet ingevuld bij je deelneming. We tonen daarom geen bedrag: €0 zou hier suggereren dat je niets betaalt, terwijl we het simpelweg nog niet weten.',
  vervreemdingswinst: 'Winst bij verkoop van je aandelen: verkoopprijs minus verkrijgingsprijs.',
  fiscaalPartner: 'Met een fiscaal partner verdubbelt de eerste-schijfgrens voor het lage tarief (2026 naar €137.686, 2025 €135.608).',
  // S17: het bedrag komt uit DGA_LENING_DREMPEL, niet uit een letterlijke
  // string. Een hardgecodeerde "€500.000" tien regels onder de constante die
  // hem hoort te leveren driftet zodra de wetgever de drempel verzet.
  wetExcessiefLenen: `De Wet excessief lenen bij eigen vennootschap belast leningen boven ${formatCurrency(DGA_LENING_DREMPEL)} van je BV als fictief regulier voordeel in Box 2. Het bovenmatige deel wordt belast tegen Box 2 tarieven.`,
}

// ── Core Calculation ─────────────────────────────────────────

/**
 * Splits een Box 2-inkomen over de twee schijven. ÉÉN home voor de staffel-
 * geometrie: zowel de gewone heffing als de fictief-regulier-voordeel-tak van de
 * Wet excessief lenen gebruiken hem, en sinds bevinding H26 ook de dividend-
 * schijfsimulator (via `Box2Result.incomeLow/incomeHigh`).
 */
export function splitBox2Brackets(
  income: number,
  grens: number,
): { incomeLow: number; incomeHigh: number } {
  return {
    incomeLow: Math.min(income, grens),
    incomeHigh: Math.max(0, income - grens),
  }
}

export function calculateBox2(input: Box2Input): Box2Result {
  const params = BOX2_PARAMS[input.year]

  // Per-deelneming breakdown
  let totalDividend = 0
  let totalDisposalGain = 0
  let dividendOnbekendCount = 0

  const perDeelneming: Box2PerDeelneming[] = input.deelnemingen.map(d => {
    // NULL ≠ 0: een niet-ingevuld dividend telt als 0 in de SOM (we kunnen niets
    // beters weten), maar het feit dát het ontbreekt reist mee naar buiten.
    const dividendOnbekend = d.annual_dividend == null
    if (dividendOnbekend) dividendOnbekendCount += 1
    const dividend = Math.max(0, d.annual_dividend ?? 0)
    const disposalGain = d.disposal_gain // can be negative (loss)
    const totalIncome = dividend + disposalGain

    totalDividend += dividend
    totalDisposalGain += disposalGain

    return {
      name: d.name,
      dividend,
      disposalGain,
      totalIncome,
      shareOfTotal: 0, // calculated after totals
      dividendOnbekend,
    }
  })

  const totalIncome = Math.max(0, totalDividend + totalDisposalGain)

  // Update share percentages
  for (const pd of perDeelneming) {
    pd.shareOfTotal = totalIncome > 0 ? pd.totalIncome / totalIncome : 0
  }

  // Apply bracket tax (staffeltarief)
  const grens = input.hasPartner ? params.grensPartner : params.grens

  const { incomeLow, incomeHigh } = splitBox2Brackets(totalIncome, grens)
  const taxLow = incomeLow * params.tariefLaag
  const taxHigh = incomeHigh * params.tariefHoog

  const baseTax = Math.round((taxLow + taxHigh) * 100) / 100

  // Wet excessief lenen DGA — bovenmatig deel als fictief regulier voordeel
  const dgaLeningenTotal = input.dgaLeningenTotal ?? 0
  const dgaLeningenExcess = Math.max(0, dgaLeningenTotal - DGA_LENING_DREMPEL)

  // Het bovenmatige deel wordt belast tegen Box 2 tarieven (staffel)
  let dgaExcessTax = 0
  if (dgaLeningenExcess > 0) {
    // Fictief regulier voordeel adds to Box 2 income — apply bracket tax on excess
    const totalIncomeWithDga = totalIncome + dgaLeningenExcess
    const full = splitBox2Brackets(totalIncomeWithDga, grens)
    const fullTax =
      Math.round(
        (full.incomeLow * params.tariefLaag + full.incomeHigh * params.tariefHoog) * 100,
      ) / 100
    dgaExcessTax = Math.round((fullTax - baseTax) * 100) / 100
  }

  const totalTax = baseTax
  const totalTaxInclDga = Math.round((baseTax + dgaExcessTax) * 100) / 100
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0

  // Freedom metric (including DGA excess tax)
  const freedomDays = input.dailyExpenses > 0
    ? Math.round(totalTaxInclDga / input.dailyExpenses)
    : 0

  return {
    year: input.year,
    hasPartner: input.hasPartner,
    params,
    perDeelneming,
    totalDividend,
    totalDisposalGain,
    totalIncome,
    dividendOnbekend: dividendOnbekendCount > 0,
    dividendOnbekendCount,
    incomeLow,
    incomeHigh,
    taxLow: Math.round(taxLow * 100) / 100,
    taxHigh: Math.round(taxHigh * 100) / 100,
    totalTax,
    effectiveRate,
    dgaLeningenTotal,
    dgaLeningenDrempel: DGA_LENING_DREMPEL,
    dgaLeningenExcess,
    dgaExcessTax,
    totalTaxInclDga,
    freedomDays,
    dailyExpenses: input.dailyExpenses,
  }
}
