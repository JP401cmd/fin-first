/**
 * Centralized financial constants for TriFinity.
 *
 * SINGLE SOURCE OF TRUTH for all shared financial assumptions.
 * No other file should define these values locally.
 *
 * Categories:
 * - Investment assumptions (returns, volatility)
 * - Withdrawal rates (SWR, NL-specific)
 * - Dutch tax system (Box 3, 2025)
 * - Dutch social security (AOW)
 * - Inflation
 */

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

// ── Dutch Tax System — Box 3 (2025) ────────────────────────────

/** Forfaitair rendement beleggingen — 5.88%. Source: Belastingdienst 2025. */
export const NL_FICTIEF_BELEGGINGEN = 0.0588

/** Box 3 belastingtarief — 36%. Source: Belastingdienst 2025. */
export const BOX3_TARIEF = 0.36

/** Effective annual Box 3 tax drag: forfait × tarief ≈ 2.117%. */
export const BOX3_DRAG = NL_FICTIEF_BELEGGINGEN * BOX3_TARIEF

// ── NL-FIRE Derived Constants ───────────────────────────────────

/** Netherlands-specific SWR: DEFAULT_RETURN − BOX3_DRAG − NL_INFLATIE ≈ 2.883%. */
export const NL_SWR = DEFAULT_RETURN - BOX3_DRAG - NL_INFLATIE

/** NL FIRE multiplier — 1 / NL_SWR ≈ 34.7× annual expenses. */
export const NL_MULTIPLIER = 1 / NL_SWR
