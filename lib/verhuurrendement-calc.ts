/**
 * Verhuurrendement berekenings-engine.
 *
 * Per real_estate-asset rekenen we de complete cashflow- en rendements-
 * keten door: bruto huur → kosten (rente, onderhoud, VVE) → netto cashflow
 * (vóór belasting) → twee Box 3-paden (forfaitair vs werkelijk) → ROI.
 *
 * Regels:
 *  1. **Geen aannames stilzwijgend.** Onderhoud krijgt een 1%-schatting alleen
 *     als de gebruiker geen override (`monthly_maintenance_cost > 0`) heeft.
 *     De UI markeert dit verschil expliciet (zie `RentalROICard`).
 *  2. **Box 3-engine consumeren, niet kopiëren.** We importeren
 *     `BOX3_TARIEF` en `NL_FICTIEF_BELEGGINGEN` uit `lib/horizon-data.ts`
 *     (de single source of truth). Geen lokale getallen.
 *  3. **Eigen geld** — bij gekoppelde mortgage rekenen we ROI op de
 *     equity (marktwaarde − schuld), bij vrij bezit op de marktwaarde.
 *     Zo blijft de ROI-vergelijking tussen objecten met en zonder
 *     financiering eerlijk.
 *  4. **Werkelijk Box 3 vanaf 2027** — de berekening volgt het wetsontwerp
 *     "Wet werkelijk rendement Box 3": belasting over werkelijke
 *     huurinkomsten + waardestijging; verlies wordt naar nul afgetopt
 *     (geen verrekening met andere bronnen voor één-asset weergave).
 */

import {
  BOX3_TARIEF,
  NL_FICTIEF_BELEGGINGEN,
} from '@/lib/horizon-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Constants ────────────────────────────────────────────────

/**
 * Default onderhoud-schatting: 1% van de marktwaarde per jaar. Marktconventie
 * voor verhuurd vastgoed; zie ook NVM-onderhoudsrichtlijn. Override mogelijk
 * via `Asset.monthly_maintenance_cost`.
 */
const MAINTENANCE_ESTIMATE_PCT = 0.01

// ── Types ────────────────────────────────────────────────────

export interface RentalCalculation {
  // ── Maandelijkse cashflow ──
  /** Bruto huurinkomsten per maand (uit `Asset.rental_income`). */
  monthlyRent: number
  /** Rentekosten per maand op de gekoppelde hypotheek (0 zonder mortgage). */
  monthlyInterest: number
  /** Onderhoudskosten per maand — override of 1%-schatting. */
  monthlyMaintenance: number
  /** Of `monthlyMaintenance` een schatting is (1%-regel) of een override. */
  maintenanceIsEstimate: boolean
  /** VVE / verzekering per maand (uit `Asset.vva_fee`). */
  monthlyVva: number
  /** Netto cashflow per maand vóór Box 3. */
  monthlyNetCashflow: number
  /** Netto cashflow op jaarbasis vóór Box 3. */
  yearlyNetCashflow: number

  // ── Kapitaal ──
  /** Marktwaarde van het pand. */
  currentValue: number
  /** Eigen geld (marktwaarde − schuld), minimaal 0. */
  ownEquity: number
  /** Resterende hypotheekschuld (0 bij vrij bezit). */
  mortgageBalance: number

  // ── Box 3 forfaitair (huidig stelsel) ──
  /** Fictief rendement volgens Belastingdienst: waarde × forfaitair-tarief. */
  forfaitairRendement: number
  /** Belasting hierover. */
  forfaitairBelasting: number
  /** Netto na belasting (yearlyNetCashflow − belasting). */
  netNaForfaitair: number
  /** ROI op eigen geld in deze methode (procent, 0 als ownEquity = 0). */
  roiForfaitair: number

  // ── Waardestijging (slider-input) ──
  /** Jaarlijkse waardestijging in € op basis van slider-percentage. */
  waardestijgingPerYear: number

  // ── Box 3 werkelijk (vanaf 2027) ──
  /** Werkelijk rendement: cashflow + waardestijging. */
  werkelijkRendement: number
  /** Belasting alleen op positief rendement. */
  werkelijkBelasting: number
  /** Netto cashflow na werkelijke belasting (excl. waardestijging). */
  netNaWerkelijk: number
  /** ROI op eigen geld bij werkelijk Box 3. */
  roiWerkelijk: number

  // ── Totaal-rendement (cashflow + waardestijging op eigen geld) ──
  /** Totaal-ROI bij forfaitair: cashflow-ROI + waardestijging-ROI. */
  totaalRendementForfaitair: number
  /** Totaal-ROI bij werkelijk Box 3: idem, na werkelijke belasting. */
  totaalRendementWerkelijk: number
}

// ── Engine ───────────────────────────────────────────────────

/**
 * Bereken alle cashflow- en rendements-cijfers voor één verhuurd pand.
 *
 * - Bij ontbrekende `mortgage`: rekent puur op marktwaarde, geen rente in
 *   de cashflow, eigen geld = marktwaarde.
 * - Bij `growthRatePct` (slider) wordt waardestijging toegevoegd aan het
 *   werkelijk-rendement (basis voor Box 3 werkelijk en totaal-ROI).
 * - Onderhoud-override (`monthly_maintenance_cost > 0`) voorkomt de 1%-schatting.
 *
 * @param asset       Het real_estate-asset met `rental_income`, `current_value`,
 *                    `monthly_maintenance_cost`, `vva_fee`.
 * @param mortgage    Optionele gekoppelde hypotheek (`linked_asset_id === asset.id`).
 * @param growthRatePct Verwachte jaarlijkse waardestijging in procenten (slider).
 */
export function calculateRental(
  asset: Asset,
  mortgage: Debt | null,
  growthRatePct: number,
): RentalCalculation {
  // ── Waarden veiligstellen ──
  // `Number()` om strings uit Supabase numeric-kolommen te casten naar number.
  const currentValue = Math.max(0, Number(asset.current_value) || 0)
  const monthlyRent = Math.max(0, Number(asset.rental_income) || 0)
  const monthlyVva = Math.max(0, Number(asset.vva_fee) || 0)

  // Mortgage-derived bedragen — alleen wanneer er daadwerkelijk schuld is.
  const mortgageBalance = mortgage ? Math.max(0, Number(mortgage.current_balance) || 0) : 0
  const interestRate = mortgage ? Math.max(0, Number(mortgage.interest_rate) || 0) : 0
  // Maandelijkse rente: jaarlijks rentepercentage × balance / 12.
  // Dit is de actuele rente-component, niet de rente-aflossings-split. Voor
  // de cashflow van een verhuurder is dit de juiste benadering: aflossing
  // verlaagt cashflow maar bouwt equity, wat niet als kosten telt.
  const monthlyInterest = (mortgageBalance * (interestRate / 100)) / 12

  // ── Onderhoud ──
  // Override = `monthly_maintenance_cost > 0`. Bij 0 vallen we terug op de
  // 1%-schatting. Dit moet 1-op-1 matchen met wat we in de UI tonen.
  const overrideRaw = Number(asset.monthly_maintenance_cost) || 0
  const maintenanceIsEstimate = overrideRaw <= 0
  const monthlyMaintenance = maintenanceIsEstimate
    ? (currentValue * MAINTENANCE_ESTIMATE_PCT) / 12
    : overrideRaw

  // ── Netto cashflow vóór belasting ──
  const monthlyNetCashflow =
    monthlyRent - monthlyInterest - monthlyMaintenance - monthlyVva
  const yearlyNetCashflow = monthlyNetCashflow * 12

  // ── Eigen geld ──
  // Bij negatieve equity (zelden, maar mogelijk) klampen we naar 0 zodat
  // ROI niet ineens explodeert door deling door een klein negatief getal.
  const ownEquity = Math.max(0, currentValue - mortgageBalance)
  // Wanneer er geen eigen geld is (volledig gefinancierd of overwaarde 0)
  // is ROI op eigen geld niet zinvol — we geven 0 terug.
  const denom = ownEquity > 0 ? ownEquity : 0

  // ── Box 3 forfaitair ──
  // Bij forfaitair geldt: belasting wordt geheven over fictief rendement,
  // ongeacht je werkelijke huurinkomsten. We berekenen hier dus alleen
  // de belasting-aftrek op de netto cashflow.
  const forfaitairRendement = currentValue * NL_FICTIEF_BELEGGINGEN
  const forfaitairBelasting = forfaitairRendement * BOX3_TARIEF
  const netNaForfaitair = yearlyNetCashflow - forfaitairBelasting
  const roiForfaitair = denom > 0 ? (netNaForfaitair / denom) * 100 : 0

  // ── Werkelijk Box 3 (vanaf 2027) ──
  // Belasting wordt geheven over werkelijk behaald rendement: huurinkomsten
  // + waardestijging. Verlies wordt afgetopt op 0 (geen verrekening met
  // andere bronnen in deze single-asset weergave).
  const waardestijgingPerYear = currentValue * (growthRatePct / 100)
  const werkelijkRendement = yearlyNetCashflow + waardestijgingPerYear
  const werkelijkBelastingBasis = Math.max(0, werkelijkRendement)
  const werkelijkBelasting = werkelijkBelastingBasis * BOX3_TARIEF
  const netNaWerkelijk = yearlyNetCashflow - werkelijkBelasting
  const roiWerkelijk = denom > 0 ? (netNaWerkelijk / denom) * 100 : 0

  // ── Totaal-rendement: cashflow + waardestijging op eigen geld ──
  // Waardestijging telt volledig mee voor de eigenaar (niet alleen op
  // equity-deel) — de eigenaar profiteert van de hele woningwaarde-toename.
  const waardestijgingRoi = denom > 0 ? (waardestijgingPerYear / denom) * 100 : 0
  const totaalRendementForfaitair = roiForfaitair + waardestijgingRoi
  const totaalRendementWerkelijk = roiWerkelijk + waardestijgingRoi

  return {
    monthlyRent,
    monthlyInterest,
    monthlyMaintenance,
    maintenanceIsEstimate,
    monthlyVva,
    monthlyNetCashflow,
    yearlyNetCashflow,
    currentValue,
    ownEquity,
    mortgageBalance,
    forfaitairRendement,
    forfaitairBelasting,
    netNaForfaitair,
    roiForfaitair,
    waardestijgingPerYear,
    werkelijkRendement,
    werkelijkBelasting,
    netNaWerkelijk,
    roiWerkelijk,
    totaalRendementForfaitair,
    totaalRendementWerkelijk,
  }
}
