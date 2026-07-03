/**
 * Centralized financial constants for TriFinity.
 *
 * SINGLE SOURCE OF TRUTH for all shared financial assumptions.
 * No other file should define these values locally.
 *
 * Categories:
 * - Investment assumptions (returns, volatility)
 * - Withdrawal rates (SWR, NL-specific)
 * - Dutch tax system (Box 3 — jaargebonden, afgeleid uit box3-data.ts)
 * - Dutch social security (AOW)
 * - Inflation
 * - Transaction costs (verkoopkosten per asset-type)
 */

// Type-only import: bij compilatie geheel weg-erased, dus geen runtime-cycle
// (asset-data.ts importeert constants.ts niet). Houdt deze leaf vrij van runtime-deps.
import type { AssetType } from '@/lib/asset-data'
// Runtime-import van de canonieke Box 3-jaartabel. box3-data.ts is een pure leaf
// (alleen type-imports) en importeert constants.ts NIET terug → geen cycle. Hiermee
// zijn de NL-FIRE-belastingafgeleiden hieronder één-op-één afgeleid van de bron.
import { BOX3_PARAMS, CURRENT_TAX_YEAR } from '@/lib/box3-data'

// ── Investment Assumptions ──────────────────────────────────────

/** Default expected annual return on investments — 7% nominal, long-term global equity average. */
export const DEFAULT_RETURN = 0.07

/** Default annual portfolio volatility for Monte Carlo simulations — 15%. */
export const DEFAULT_VOLATILITY = 0.15

// ── Withdrawal Rates ────────────────────────────────────────────

/** Classic Safe Withdrawal Rate — 4% rule (Trinity Study / Bengen 1994). */
export const SWR = 0.04

/** Classic FIRE multiplier — 1 / SWR = 25× annual expenses. */
export const CLASSIC_MULTIPLIER = 1 / SWR // = 25

// ── Inflation ───────────────────────────────────────────────────

/** Default annual inflation rate — 2% (ECB target). */
export const INFLATION = 0.02

/** Jaarlijks onderhoud eigen woning als fractie van de woningwaarde — 1%. */
export const NL_HOME_MAINTENANCE_PCT = 0.01

/** Dutch long-term average inflation — 2% (CBS). Alias for NL-specific FIRE calculations. */
export const NL_INFLATIE = 0.02

// ── Dutch Social Security (AOW) ─────────────────────────────────

/** Dutch state pension (AOW) eligibility age. Source: SVB 2025. */
export const NL_AOW_AGE = 67

/** Dutch AOW netto monthly benefit, single person — €1 558. Source: SVB 2026. */
export const NL_AOW_MONTHLY = 1558

/** Dutch AOW netto monthly benefit, cohabiting/married — €1 072 per person. Source: SVB 2026. */
export const NL_AOW_MONTHLY_SAMENWONEND = 1072

// ── Dutch Tax System — Box 3 (jaargebonden) ────────────────────
//
// GEEN losse literals meer: forfait en tarief worden één-op-één afgeleid uit de
// canonieke jaartabel BOX3_PARAMS[CURRENT_TAX_YEAR] (lib/box3-data.ts). Zo kunnen
// het FIRE-forfait en de aangifte-engine nooit meer divergeren (was: 5,88% hier
// vs. 6,00% in de tabel). Het jaartal wisselt op één plek: CURRENT_TAX_YEAR.

/** Forfaitair rendement beleggingen — afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] (2026: 6,00%). Source: Belastingdienst. */
export const NL_FICTIEF_BELEGGINGEN = BOX3_PARAMS[CURRENT_TAX_YEAR].forfaitBeleggingen

/** Box 3 belastingtarief — afgeleid uit BOX3_PARAMS[CURRENT_TAX_YEAR] (2026: 36%). Source: Belastingdienst. */
export const BOX3_TARIEF = BOX3_PARAMS[CURRENT_TAX_YEAR].tarief

/** Effective annual Box 3 tax drag: forfait × tarief (2026 ≈ 2,16%). */
export const BOX3_DRAG = NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

// ── NL-FIRE Derived Constants ───────────────────────────────────

/** Netherlands-specific SWR: DEFAULT_RETURN − BOX3_DRAG − NL_INFLATIE (2026 ≈ 2,84%). */
export const NL_SWR = DEFAULT_RETURN - BOX3_DRAG - NL_INFLATIE

/** NL FIRE multiplier — 1 / NL_SWR (2026 ≈ 35,2× annual expenses). */
export const NL_MULTIPLIER = 1 / NL_SWR

// ── Transaction Costs — verkoopkosten per asset-type ────────────

/**
 * Verkoopkosten (transactiekosten) bij liquidatie van een niet-liquide asset, als
 * fractie van de verkoopprijs. Gebruikt door de generieke asset-liquidatie in de
 * v2-grootboek-engine (`buildGenericAssetLiquidations`, lib/horizon-engine/build-input.ts).
 *
 *  • Roerende zaken (voertuig/inboedel/overig/deelneming): ~2% — bemiddeling/
 *    overdracht, geen overdrachtsbelasting/notaris.
 *  • Vastgoed (real_estate ≠ eigen_huis, bv. beleggingspand): ~3% — makelaar +
 *    overdrachtskosten, lager dan een eigen-huis-verkoop omdat het downsize-pad
 *    (eigen_huis) zijn eigen, door de gebruiker instelbare salesCostsPct draagt.
 *
 * `eigen_huis` staat hier bewust NIET in: dat loopt via het housing-downsize-pad
 * (`buildV2DownsizeHousing`) met een door de gebruiker gekozen verkoopkosten-%.
 * Een type dat ontbreekt valt terug op `DEFAULT_SALES_COSTS_PCT` (= roerend 2%).
 * Per-event override via `metadata.verkoopkostenPct` (geldig in [0, 0.20]) wint.
 */
export const SALES_COSTS_BY_TYPE: Partial<Record<AssetType, number>> = {
  vehicle: 0.02,
  physical: 0.02,
  other: 0.02,
  deelneming: 0.02,
  real_estate: 0.03,
}

/** Fallback-verkoopkosten voor een asset-type dat niet in SALES_COSTS_BY_TYPE staat — roerend 2%. */
export const DEFAULT_SALES_COSTS_PCT = 0.02

/**
 * Verkoopkosten eigen-woning-downsize (makelaar + notaris + verhuizen) als fractie
 * van de verkoopprijs — 4%. Door de gebruiker overschrijfbaar via de downsize-config;
 * dit is de default. Hoger dan SALES_COSTS_BY_TYPE.real_estate (3%, beleggingspand)
 * omdat een eigen-woning-verkoop verhuiskosten meeneemt.
 */
export const DOWNSIZE_DEFAULT_SALES_COSTS_PCT = 0.04

/**
 * Geschatte maandelijkse woonlast ná verkoop (huur of kleinere hypotheek) als fractie
 * van de WOZ-waarde, op jaarbasis — 4%/jaar ≈ NL-gemiddelde middenhuur-niveau
 * (bij €400K WOZ ≈ €1.333/mnd). Door de gebruiker overschrijfbaar via de downsize-config.
 */
export const HOUSING_COST_AFTER_SALE_PCT = 0.04

// ── Opeethypotheek (reverse mortgage) ───────────────────────────

/**
 * Max % van de overwaarde dat als opeethypotheek (verzilverhypotheek) kan worden
 * opgenomen — 50%. NL-marktstandaard ligt tussen 35–65% afhankelijk van leeftijd;
 * 50% is een conservatieve middenwaarde. Dit is de leen-RUIMTE-cap én de FIRE-
 * eligibility-fractie van de overwaarde (één grondslag, zie reverseMortgageBorrowable).
 */
export const REVERSE_MORTGAGE_DEFAULT_MAX_LOAN_PCT = 0.5

/**
 * Jaarlijkse rente op een opeethypotheek (decimaal) — 5,5% (NL marktrate 2026).
 * Bewust LAGER dan een ongedekte lening: de woning dient als onderpand
 * (onderpand-korting). Genoteerd als NOMINALE rente; de v2-grootboek-engine accrued
 * 'm — net als élke andere schuldrente in blok 3 — direct op het (reëel gegroeide)
 * saldo zónder reëel-conversie, zodat opeethypotheek-rente en gewone hypotheekrente
 * op dezelfde grondslag stapelen (zie engine.ts comment bij de opeetschuld).
 */
export const REVERSE_MORTGAGE_DEFAULT_RATE = 0.055

// ── Kosten koper — aankoop eigen woning (hoofdverblijf) ─────────
//
// Fiscale grenzen/tarieven zijn JAARGEBONDEN — verifieer jaarlijks bij de bron.
// Deze constanten voeden lib/kosten-koper.ts (computeKostenKoper), de enige bron
// voor het life-event 'house_purchase' in de Horizon-scenario/projectie. Het
// totaal stroomt als eenmalige uitgave in de FIRE-berekening; verkeerde grenzen =
// verkeerd bedrag. Geen losse literals meer in de UI dupliceren.

/** Overdrachtsbelasting eigen woning (hoofdverblijf, niet-starter) — 2%. Bron: Belastingdienst, 2026 — jaarlijks verifiëren. */
export const OVB_TARIEF_EIGEN_WONING = 0.02

/** Startersvrijstelling overdrachtsbelasting: vrijgesteld tot deze woningwaarde — €555.000. Bron: Belastingdienst, 2026 — jaarlijks verifiëren. */
export const STARTERSVRIJSTELLING_MAX = 555000

/** NHG-kostengrens: max koopsom om NHG te kunnen afsluiten — €470.000. Bron: nhg.nl, 2026 — jaarlijks verifiëren. */
export const NHG_KOSTENGRENS = 470000

/** NHG borgtochtprovisie: eenmalig over de hypotheeksom — 0,4%. Bron: nhg.nl, 2026 — jaarlijks verifiëren. */
export const NHG_BORGTOCHTPROVISIE_PCT = 0.004

/** Notariskosten (leverings- + hypotheekakte), vaste indicatie — €1.200. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_NOTARIS = 1200

/** Taxatiekosten woning, vaste indicatie — €500. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_TAXATIE = 500

/** Bankgarantie (waarborgsom-garantie), als fractie van de aankoopprijs — 0,1%. Bron: marktgemiddelde, 2026 — jaarlijks verifiëren. */
export const KOSTEN_KOPER_BANKGARANTIE_PCT = 0.001
