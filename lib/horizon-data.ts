/**
 * Horizon calculation engine — FIRE projections, Monte Carlo, scenarios,
 * withdrawal strategies, life event impact, resilience scoring.
 *
 * Pure functions, no Supabase dependency.
 */

import {
  computeEffectiveExpenses,
  computeFireTarget,
  computeFreedomPercentage,
  computeFreedomTime,
  computeSavingsRate,
} from './core-metrics'
import { MSCI_REAL_RETURNS, NAMED_PERIODS } from './msci-data'
import type { FinancialInput } from './core-metrics'
import type { CamelCaseKeys } from './db-mapper'

export type { FinancialInput } from './core-metrics'

// ── Constants (canonical source: lib/constants.ts) ──────────────
// Re-exported for backward compatibility — many files import from here.
export {
  SWR,
  DEFAULT_RETURN,
  DEFAULT_VOLATILITY,
  NL_AOW_AGE,
  NL_AOW_MONTHLY,
  NL_AOW_MONTHLY_SAMENWONEND,
  INFLATION,
  NL_FICTIEF_BELEGGINGEN,
  BOX3_TARIEF,
  BOX3_DRAG,
  NL_INFLATIE,
  NL_SWR,
  NL_MULTIPLIER,
  CLASSIC_MULTIPLIER,
} from './constants'
import {
  SWR, DEFAULT_RETURN, DEFAULT_VOLATILITY,
  NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, INFLATION,
  NL_SWR,
} from './constants'

export type FireMethod = 'nl'

export function getSwrForMethod(_method: FireMethod): number {
  return NL_SWR
}

// ── Types ────────────────────────────────────────────────────


export interface FutureCashflow {
  id: string
  name: string
  monthlyAmount: number    // positief = inkomen, negatief = uitgave
  fromAge: number          // leeftijd waarop de kasstroom begint
  toAge: number | null     // null = levenslang (tot levensverwachting 90)
  oneTimeAmount?: number   // eenmalig bedrag op fromAge (erfenis etc.)
}

export const CASHFLOW_CATALOG: Omit<FutureCashflow, 'id'>[] = [
  { name: 'AOW (alleenstaand)',  monthlyAmount: 1558, fromAge: 67, toAge: null },
  { name: 'AOW (per partner)',   monthlyAmount: 1072, fromAge: 67, toAge: null },
  { name: 'Aanvullend pensioen', monthlyAmount: 0,    fromAge: 65, toAge: null },
  { name: 'Deeltijds werken',    monthlyAmount: 0,    fromAge: 55, toAge: 67 },
  { name: 'Erfenis',             monthlyAmount: 0,    fromAge: 0,  toAge: null, oneTimeAmount: 0 },
]

export interface FireProjection {
  fireTarget: number
  netWorth: number
  freedomPercentage: number
  fireAge: number | null // null if no DOB
  currentAge: number | null
  fireDate: string // 'mrt 2038' or 'Bereikt!'
  countdownDays: number
  countdownYears: number
  countdownMonths: number
  freedomYears: number
  freedomMonths: number
  monthlyPassiveIncome: number
  monthlySavings: number
  savingsRate: number
}

export interface FireRange {
  optimistic: FireProjection
  expected: FireProjection
  pessimistic: FireProjection
}

export interface ProjectionMonth {
  month: number
  date: string
  netWorth: number
  passiveIncome: number
  age: number | null
  contributions: number
  growth: number
}

export interface ScenarioPath {
  name: string
  label: string
  color: string
  months: ProjectionMonth[]
  fireAge: number | null
  fireMonth: number | null
}

export interface MonteCarloResult {
  simulations: number
  years: number
  percentiles: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] }
  fireAges: number[]
  fireProb: number // 0-1
  p10FireAge: number | null
  p50FireAge: number | null
  p90FireAge: number | null
}

export type WithdrawalStrategy = 'classic' | 'variable' | 'guardrails' | 'bucket'

export interface GuardrailsConfig {
  floor: number       // 0-1, default 0.80
  ceiling: number     // 1+, default 1.20
  raiseStep: number   // 0-1, default 0.10
  cutStep: number     // 0-1, default 0.10
}

export interface BucketConfig {
  cashPct: number      // 0-1, default 0.15
  bondPct: number      // 0-1, default 0.30
  bondReturn: number   // annual decimal, default 0.03
  cashBufferYears: number // default 3
}

export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  floor: 0.80,
  ceiling: 1.20,
  raiseStep: 0.10,
  cutStep: 0.10,
}

export const DEFAULT_BUCKET: BucketConfig = {
  cashPct: 0.15,
  bondPct: 0.30,
  bondReturn: 0.03,
  cashBufferYears: 3,
}

export interface WithdrawalYear {
  age: number
  year: number
  startBalance: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

export interface WithdrawalResult {
  strategy: WithdrawalStrategy
  monthlyWithdrawal: number
  yearlySustainable: number
  successYears: number
  totalYears: number
  schedule: WithdrawalYear[]
  depleted: boolean
}

export interface LifeEvent {
  id: string
  name: string
  event_type: string
  target_age: number | null
  target_date: string | null
  one_time_cost: number
  monthly_cost_change: number
  monthly_income_change: number
  duration_months: number
  icon: string
  is_active: boolean
  sort_order: number
  is_indexed: boolean
  /** Event-type-specific details (stored as JSONB in life_events table) */
  metadata?: Record<string, unknown>
}

/** LifeEvent with camelCase keys (frontend representation). */
export type LifeEventFe = CamelCaseKeys<LifeEvent>

/** User-editable cashflow definition, stored in metadata.cashflows (JSONB). */
export interface UserDefinedCashflow {
  id: string
  name: string
  type: 'one_time' | 'recurring'
  direction: 'income' | 'expense'
  amount: number       // always positive
  durationMonths: number // 0 = one-time, >0 = duration in months
  indexed: boolean
}

// ── Per-event-type metadata interfaces (type-safe access) ────────────

export interface ChildrenMetadata {
  aantalKinderen?: number
  kinderopvangDagen?: number
  kinderbijslag?: boolean
  babyuitzet?: number
}

export interface AOWMetadata {
  leefsituatie?: 'alleenstaand' | 'samenwonend'
  jarenInNL?: number       // legacy — use jarenBuitenNL
  jarenBuitenNL?: number   // years abroad (0 = full AOW)
}

/**
 * Metadata voor een aanvullend pensioen-event. Drie pensioentypes worden expliciet
 * onderscheiden i.v.m. wettelijke uitkeringskenmerken:
 *
 * 1. `lijfrente_levenslang` (verzekeraar) — pot vervalt bij overlijden tenzij
 *    partneruitkering. Ca. €5.200/jr per €100K bij 70% partner-pct.
 * 2. `lijfrente_bancair` (banksparen) — wettelijk minimaal 20 jr uitkering,
 *    restant naar erfgenamen.
 * 3. `tijdelijke_oudedagslijfrente` — minimaal 5 jr vanaf AOW, wettelijk plafond
 *    €27.192/jr in 2026 indien looptijd < 20 jr (front-loaded).
 *
 * Legacy waarden 'lijfrente' en 'banksparen' blijven behouden voor backwards-
 * compat in opgeslagen events; ze worden via `normalizePensionType()` gemapt.
 */
export interface PensionMetadata {
  pensioenType?:
    | 'bedrijf'
    | 'lijfrente_levenslang'
    | 'lijfrente_bancair'
    | 'tijdelijke_oudedagslijfrente'
    /** @deprecated gebruik 'lijfrente_levenslang' — zie normalizePensionType() */
    | 'lijfrente'
    /** @deprecated gebruik 'lijfrente_bancair' — zie normalizePensionType() */
    | 'banksparen'
  brutoBedrag?: number
  ingangLeeftijd?: number
  uitkeringsduur?: 'levenslang' | '20' | '10' | '5'
  isGeindexeerd?: boolean
  /** Eenmalige inleg in euro's. Indien > 0 wordt brutoBedrag berekend via annuitizePension(). */
  inlegBedrag?: number
  /** Alleen bij 'lijfrente_levenslang': percentage van uitkering dat doorloopt voor partner. Default 70. */
  partnerUitkeringPct?: number
}

export interface CarPurchaseMetadata {
  brandstof?: 'benzine' | 'diesel' | 'elektrisch' | 'hybride'
  nieuwOfTweedehands?: 'nieuw' | 'tweedehands'
  jaarlijkseKm?: number
  vervangtHuidigeAuto?: boolean
  huidigeAutoKosten?: number
}

export interface HousePurchaseMetadata {
  aankoopprijs?: number
  hypotheekRente?: number
  eersteWoning?: boolean
  huidigeHuur?: number
  hypotheekLasten?: number
  nhg?: boolean
}

export interface HouseSaleMetadata {
  verkoopprijs?: number
  resterendeHypotheek?: number
  makelaarskosten?: number // percentage, default 1.5%
  nieuweSituatie?: 'huren' | 'goedkoper_kopen' | 'bij_partner'
  nieuweWoonlasten?: number // maandelijkse woonlasten na verkoop
  oudeHypotheeklasten?: number // huidige maandelijkse hypotheeklasten
}

export interface InheritanceMetadata {
  brutoBedrag?: number
  erfbelastingSchijf?: 'kind' | 'partner' | 'kleinkind' | 'overig'
  bevatWoning?: boolean
}

export interface SabbaticalMetadata {
  reiskosten?: number
  bestemming?: 'nederland' | 'europa' | 'wereldwijd'
  behoudtZorgverzekering?: boolean
  doorbetalingsPct?: number
  nettoInkomen?: number
  extraKosten?: number
}

export interface WorldTripMetadata {
  aantalPersonen?: number
  reistype?: 'backpacking' | 'comfort' | 'luxe'
  reisstijl?: 'budget' | 'gemiddeld' | 'comfort'
  vasteLastenThuis?: boolean
  vasteLastenBedrag?: number
  vertrekkosten?: number
  woningVerhuren?: boolean
}

/** Monthly travel budget presets per travel style (per person) */
export const WERELDREIS_STIJL_PRESETS: Record<string, { label: string; bedrag: number }> = {
  budget:    { label: 'Budget',    bedrag: 1200 },
  gemiddeld: { label: 'Gemiddeld', bedrag: 2000 },
  comfort:   { label: 'Comfort',  bedrag: 3000 },
}

export interface RenovationMetadata {
  type?: 'keuken' | 'badkamer' | 'uitbouw' | 'dakkapel' | 'energetisch' | 'totaal'
  waardevermeerdering?: number
}

/** Default cost presets per renovation type */
export const VERBOUWING_TYPE_KOSTEN: Record<string, { label: string; bedrag: number; waardePct: number }> = {
  keuken:       { label: 'Keuken',            bedrag: 15000, waardePct: 60 },
  badkamer:     { label: 'Badkamer',          bedrag: 12000, waardePct: 55 },
  uitbouw:      { label: 'Uitbouw / aanbouw', bedrag: 50000, waardePct: 70 },
  dakkapel:     { label: 'Dakkapel',          bedrag: 14000, waardePct: 65 },
  energetisch:  { label: 'Energetisch',       bedrag: 20000, waardePct: 50 },
  totaal:       { label: 'Totale renovatie',  bedrag: 80000, waardePct: 65 },
}

export interface StudyMetadata {
  studieType?: 'cursus' | 'mbo' | 'bachelor' | 'master' | 'mba' | 'promotie'
  parttime?: boolean
  salarisstijging?: number
  collegegeld?: number
}

/** Default cost presets per study type */
export const STUDIE_TYPE_KOSTEN: Record<string, { label: string; bedrag: number; duur: number }> = {
  cursus:    { label: 'Korte cursus / certificering', bedrag: 1000,  duur: 3 },
  mbo:       { label: 'MBO opleiding',               bedrag: 3000,  duur: 24 },
  bachelor:  { label: 'HBO / WO Bachelor',            bedrag: 7500,  duur: 36 },
  master:    { label: 'Master',                       bedrag: 5000,  duur: 12 },
  mba:       { label: 'MBA',                          bedrag: 30000, duur: 18 },
  promotie:  { label: 'Promotietraject',              bedrag: 2000,  duur: 48 },
}

export interface CareerChangeMetadata {
  huidigNettoSalaris?: number
  verwachtNieuwNettoSalaris?: number
  periodeZonderInkomen?: number
  overgangsperiodeMaanden?: number
  omscholingskosten?: number
  /** @deprecated replaced by periodeZonderInkomen */
  tussenperiode?: number
  /** @deprecated replaced by omscholingskosten */
  omscholing?: number
  /** @deprecated replaced by explicit salary fields */
  salarisstijging?: number
}

export interface PartTimeMetadata {
  huidigUren?: number
  nieuwUren?: number
  nettoInkomen?: number
  isPermanent?: boolean
  behoudtPensioen?: boolean
}

export interface EarlyRetirementMetadata {
  pensioenLeeftijd?: number
  heeftPensioenregeling?: boolean
  overbruggingsUitkering?: number
  vroegpensioenUitkering?: number
  vroegpensioenVanafLeeftijd?: number
}

export interface WeddingMetadata {
  budgetPreset?: 'intiem' | 'gemiddeld' | 'uitgebreid'
  aantalGasten?: number
  huwelijksreis?: number
  huwelijksvoorwaarden?: boolean
}

/** Wedding budget presets based on Dutch average of €23.675 (ThePerfectWedding, 2025) */
export const BRUILOFT_BUDGET_PRESETS: Record<string, { label: string; bedrag: number; gasten: number }> = {
  intiem:     { label: 'Intiem (€5K–€10K)',     bedrag: 8000,  gasten: 30 },
  gemiddeld:  { label: 'Gemiddeld (€15K–€25K)',  bedrag: 20000, gasten: 80 },
  uitgebreid: { label: 'Uitgebreid (€25K–€40K)', bedrag: 32000, gasten: 120 },
}

export interface MoveMetadata {
  afstand?: 'lokaal' | 'regionaal' | 'internationaal'
  verhuiskosten?: number
  inrichtingskosten?: number
  dubbeleLastenMaanden?: number
  dubbeleLastenBedrag?: number
  huurverschil?: number
  verschilPermanent?: boolean
}

export interface SideHustleMetadata {
  type?: 'freelance' | 'verhuur' | 'ecommerce' | 'content' | 'overig'
  brutoOmzet?: number
  kostenPerMaand?: number
  opstartkosten?: number
  opbouwperiode?: number
  opbouwOmzetPct?: number
  doorlopend?: boolean
}

export interface ScheidingMetadata {
  advocaatKosten?: number
  vermogensBehoudPct?: number
  partneralimentatieBedrag?: number
  partneralimentatieDuur?: number
  partneralimentatieRichting?: 'betalen' | 'ontvangen'
  kinderalimentatieBedrag?: number
  kinderalimentatieDuur?: number
  extraWoonlasten?: number
}

export interface WerkloosheidMetadata {
  huidigBruto?: number
  huidigNetto?: number
  dienstjaren?: number
  wwDuur?: number
  transitievergoeding?: number
  zoektijd?: number
}

export interface SchenkingMetadata {
  relatieOntvanger?: 'kind' | 'kleinkind' | 'overig'
  eenmaligOfJaarlijks?: 'eenmalig' | 'jaarlijks'
  aantalOntvangers?: number
  aantalJaren?: number
  doelBestemming?: 'vrij' | 'studie' | 'woning' | 'onderneming'
}

export interface BegrafenisMetadata {
  uitvaartType?: 'begraven' | 'crematie' | 'natuurbegraven'
  uitvaartkosten?: number
  heeftVerzekering?: boolean
  verzekeringDekking?: number
  grafrechtenJaar?: number
  extraWensen?: number
}

/** Schenkingsvrijstellingen 2026 (Belastingdienst) per jaar per ontvanger */
export const SCHENKING_VRIJSTELLING: Record<string, number> = {
  kind: 6633,
  kleinkind: 2658,
  overig: 2658,
}

/** Schenkbelasting tarieven 2026 (Belastingdienst) */
export const SCHENKING_TARIEVEN: Record<string, { laag: number; hoog: number; grens: number }> = {
  kind: { laag: 0.10, hoog: 0.20, grens: 154197 },
  kleinkind: { laag: 0.18, hoog: 0.36, grens: 154197 },
  overig: { laag: 0.30, hoog: 0.40, grens: 154197 },
}

/** Bereken schenkbelasting per ontvanger */
export function berekenSchenkbelasting(bedrag: number, relatie: string): { vrijstelling: number; belastbaar: number; belasting: number } {
  const vrijstelling = SCHENKING_VRIJSTELLING[relatie] ?? 2658
  const tarief = SCHENKING_TARIEVEN[relatie] ?? SCHENKING_TARIEVEN.overig
  const belastbaar = Math.max(0, bedrag - vrijstelling)
  if (belastbaar <= 0) return { vrijstelling, belastbaar: 0, belasting: 0 }
  const laagDeel = Math.min(belastbaar, tarief.grens)
  const hoogDeel = Math.max(0, belastbaar - tarief.grens)
  const belasting = Math.round(laagDeel * tarief.laag + hoogDeel * tarief.hoog)
  return { vrijstelling, belastbaar, belasting }
}

/** Erfbelasting 2026 vrijstellingen (Belastingdienst) */
export const ERFBELASTING_VRIJSTELLING: Record<string, number> = {
  partner: 804698,
  kind: 25490,
  kleinkind: 25490,
  overig: 2658,
}

/** Erfbelasting 2026 tarieven (Belastingdienst) */
export const ERFBELASTING_TARIEVEN: Record<string, { laag: number; hoog: number; grens: number }> = {
  partner: { laag: 0.10, hoog: 0.20, grens: 154197 },
  kind: { laag: 0.10, hoog: 0.20, grens: 154197 },
  kleinkind: { laag: 0.18, hoog: 0.36, grens: 154197 },
  overig: { laag: 0.30, hoog: 0.40, grens: 154197 },
}

/** Bereken erfbelasting op basis van bruto erfenis en relatie tot erflater */
export function berekenErfbelasting(brutoBedrag: number, relatie: string): {
  vrijstelling: number; belastbaar: number; belastingLaag: number; belastingHoog: number; totaalBelasting: number; netto: number; effectiefTarief: number
} {
  const vrijstelling = ERFBELASTING_VRIJSTELLING[relatie] ?? 2658
  const tarief = ERFBELASTING_TARIEVEN[relatie] ?? ERFBELASTING_TARIEVEN.overig
  const belastbaar = Math.max(0, brutoBedrag - vrijstelling)
  if (belastbaar <= 0) {
    return { vrijstelling, belastbaar: 0, belastingLaag: 0, belastingHoog: 0, totaalBelasting: 0, netto: brutoBedrag, effectiefTarief: 0 }
  }
  const laagDeel = Math.min(belastbaar, tarief.grens)
  const hoogDeel = Math.max(0, belastbaar - tarief.grens)
  const belastingLaag = Math.round(laagDeel * tarief.laag)
  const belastingHoog = Math.round(hoogDeel * tarief.hoog)
  const totaalBelasting = belastingLaag + belastingHoog
  const netto = brutoBedrag - totaalBelasting
  const effectiefTarief = brutoBedrag > 0 ? Math.round((totaalBelasting / brutoBedrag) * 1000) / 10 : 0
  return { vrijstelling, belastbaar, belastingLaag, belastingHoog, totaalBelasting, netto, effectiefTarief }
}

/** NIBUD/ANWB gemiddelde maandkosten auto per brandstoftype (2025/2026) */
export const AUTO_MAANDKOSTEN: Record<string, { verzekering: number; wegenbelasting: number; onderhoud: number; brandstof: number }> = {
  benzine:     { verzekering: 50, wegenbelasting: 50, onderhoud: 80, brandstof: 130 },
  diesel:      { verzekering: 55, wegenbelasting: 75, onderhoud: 85, brandstof: 110 },
  elektrisch:  { verzekering: 60, wegenbelasting: 0,  onderhoud: 40, brandstof: 65 },
  hybride:     { verzekering: 55, wegenbelasting: 30, onderhoud: 70, brandstof: 95 },
}

/** Bereken totale maandkosten auto op basis van brandstof en km */
export function berekenAutoMaandkosten(brandstof: string, jaarlijkseKm: number = 15000): {
  verzekering: number; wegenbelasting: number; onderhoud: number; brandstof: number; totaal: number
} {
  const base = AUTO_MAANDKOSTEN[brandstof] ?? AUTO_MAANDKOSTEN.benzine
  // Schaal brandstofkosten naar kilometers (basis = 15.000 km/jaar)
  const kmFactor = jaarlijkseKm / 15000
  const brandstofKosten = Math.round(base.brandstof * kmFactor)
  const result = {
    verzekering: base.verzekering,
    wegenbelasting: base.wegenbelasting,
    onderhoud: base.onderhoud,
    brandstof: brandstofKosten,
    totaal: 0,
  }
  result.totaal = result.verzekering + result.wegenbelasting + result.onderhoud + result.brandstof
  return result
}

/** Union of all typed metadata interfaces per event_type key. */
export type LifeEventMetadataMap = {
  children: ChildrenMetadata
  aow: AOWMetadata
  pension: PensionMetadata
  car_purchase: CarPurchaseMetadata
  house_purchase: HousePurchaseMetadata
  house_sale: HouseSaleMetadata
  inheritance: InheritanceMetadata
  sabbatical: SabbaticalMetadata
  world_trip: WorldTripMetadata
  renovation: RenovationMetadata
  study: StudyMetadata
  career_change: CareerChangeMetadata
  part_time: PartTimeMetadata
  early_retirement: EarlyRetirementMetadata
  wedding: WeddingMetadata
  move: MoveMetadata
  side_hustle: SideHustleMetadata
  scheiding: ScheidingMetadata
  werkloosheid: WerkloosheidMetadata
  schenking: SchenkingMetadata
  begrafenis: BegrafenisMetadata
  custom: Record<string, unknown>
}

export interface LifeEventImpact {
  event: LifeEvent
  fireDelayMonths: number
  totalCost: number
  freedomDaysLost: number
}

// ── Life Event Classification ────────────────────────────────

export type LifeEventClassification = 'opbouwen' | 'investeren'

/**
 * Compute the net financial impact of a life event.
 * Positive = net gain (freedom-building), negative/zero = net cost (freedom-investing).
 *
 * When duration_months > 0: one_time_cost + (monthly_income_change - monthly_cost_change) × duration_months
 * When duration_months = 0 (permanent/indefinite): one_time_cost + (monthly_income_change - monthly_cost_change) × 240
 *   240 months (20 years) is used as a reasonable proxy for permanent changes, consistent with AOW duration conventions.
 * Note: one_time_cost is positive for costs, negative for income (same as DB/cashflow convention).
 */
export function computeLifeEventNetImpact(event: LifeEvent): number {
  const { one_time_cost, monthly_income_change, monthly_cost_change, duration_months } = event
  // duration_months === 0 means permanent/indefinite (see lifeEventsToCashflows); use 240 months as proxy
  const effectiveDuration = duration_months > 0 ? duration_months : 240
  // Negate one_time_cost: positive in DB = expense (reduces freedom), negative = income (builds freedom)
  return -one_time_cost + (monthly_income_change * effectiveDuration) - (monthly_cost_change * effectiveDuration)
}

/**
 * Classify a life event based on its net financial impact.
 * Positive net impact → 'opbouwen' (building freedom)
 * Zero or negative net impact → 'investeren' (investing in freedom, conservative default)
 */
export function classifyLifeEvent(event: LifeEvent): LifeEventClassification {
  return computeLifeEventNetImpact(event) > 0 ? 'opbouwen' : 'investeren'
}

/**
 * Split an array of life events into two groups based on classification.
 */
export function splitLifeEvents(events: LifeEvent[]): { opbouwen: LifeEvent[]; investeren: LifeEvent[] } {
  const opbouwen: LifeEvent[] = []
  const investeren: LifeEvent[] = []
  for (const event of events) {
    if (classifyLifeEvent(event) === 'opbouwen') {
      opbouwen.push(event)
    } else {
      investeren.push(event)
    }
  }
  return { opbouwen, investeren }
}

export interface ResilienceBreakdown {
  emergency: number // 0-25
  diversification: number // 0-25
  debtRatio: number // 0-25
  savingsRate: number // 0-25
}

export interface ResilienceScore {
  total: number // 0-100
  breakdown: ResilienceBreakdown
  label: string
}

// ── Life Event Catalog ───────────────────────────────────────

/** Field type definitions for context-specific life event fields. */
export type CatalogFieldType = 'number' | 'select' | 'toggle' | 'percentage'

export interface CatalogFieldOption {
  value: string | number
  label: string
}

export interface CatalogField {
  /** Unique key — maps to metadata[key] on the LifeEvent */
  key: string
  /** Display label (Dutch) */
  label: string
  /** Input type */
  fieldType: CatalogFieldType
  /** Default value */
  default: string | number | boolean
  /** Help text / tooltip */
  tip?: string
  /** Options for 'select' type fields */
  options?: CatalogFieldOption[]
  /** Optional suffix shown after the input (e.g. "maanden", "%") */
  suffix?: string
}

export type LifeEventGroup = 'leven' | 'wonen' | 'werk' | 'pensioen' | 'vermogen' | 'vrije_tijd' | 'anders'

export const LIFE_EVENT_GROUPS: Record<LifeEventGroup, { label: string; order: number }> = {
  leven:      { label: 'Leven & Relatie',       order: 0 },
  wonen:      { label: 'Wonen',                 order: 1 },
  werk:       { label: 'Werk & Inkomen',        order: 2 },
  pensioen:   { label: 'Pensioen & Uitkering',  order: 3 },
  vermogen:   { label: 'Vermogen',              order: 4 },
  vrije_tijd: { label: 'Vrije tijd',            order: 5 },
  anders:     { label: 'Anders',                order: 6 },
}

export interface LifeEventCatalogEntry {
  label: string
  icon: string
  defaultCost: number
  defaultMonthlyCost: number
  defaultMonthlyIncome: number
  defaultDuration: number
  defaultAge?: number
  description: string
  tip?: string
  /** Estimated total impact range string, e.g. "€100K–€200K totaal" */
  impactRange?: string
  /** Grouping category for catalog display */
  group: LifeEventGroup
  /** Context-specific fields for this event type */
  fields?: CatalogField[]
  /** If true, this event is only available in household mode */
  householdOnly?: boolean
}

/**
 * NIBUD-gebaseerde maandelijkse kosten per aantal kinderen.
 * Kosten schalen niet lineair: elk extra kind kost minder dan het vorige.
 * Bron: NIBUD "Wat kost een kind?" — modaal inkomen, gemiddeld over leeftijd.
 */
export const NIBUD_CHILDREN_MONTHLY_COST: Record<number, number> = {
  1: 500,
  2: 830,
  3: 1100,
  4: 1320,
}

/** Get NIBUD-based monthly cost for given number of children */
export function nibudChildrenCost(count: number): number {
  if (count <= 0) return 0
  return NIBUD_CHILDREN_MONTHLY_COST[Math.min(count, 4)] ?? NIBUD_CHILDREN_MONTHLY_COST[4]!
}

/**
 * Kinderopvang bruto kosten per dag per maand (2026).
 * Dagopvang: ca. 10,5 uur/dag × €9,65/uur = ~€101/dag → ~€440/mnd per dag/week.
 * Bron: Rijksoverheid, max uurtarief kinderopvangtoeslag 2026.
 */
export const KINDEROPVANG_BRUTO_PER_DAG_PER_MAAND = 440

/**
 * Kinderopvangtoeslag: netto kosten als percentage van bruto, per inkomenscategorie.
 * Toeslag dekt 33%–96%. We gebruiken een conservatief gemiddelde van 70% dekking
 * (= 30% netto eigen bijdrage). Werkelijke toeslag is inkomensafhankelijk.
 */
export const KINDEROPVANG_TOESLAG_DEKKING_PCT = 0.70

/** Bereken geschatte netto kinderopvangkosten per maand na toeslag */
export function berekenKinderopvangNetto(dagenPerWeek: number, aantalKinderen: number): number {
  if (dagenPerWeek <= 0 || aantalKinderen <= 0) return 0
  const brutoPM = dagenPerWeek * KINDEROPVANG_BRUTO_PER_DAG_PER_MAAND * aantalKinderen
  const nettoPM = Math.round(brutoPM * (1 - KINDEROPVANG_TOESLAG_DEKKING_PCT))
  return nettoPM
}

/**
 * Kinderbijslag bedragen per kwartaal per kind (SVB 2026).
 * Gebaseerd op leeftijdscategorie — we nemen gemiddelde over 0-17 jaar.
 */
export const KINDERBIJSLAG_PER_KWARTAAL: Record<string, number> = {
  '0-5': 279,
  '6-11': 339,
  '12-17': 399,
}

/** Gemiddelde kinderbijslag per maand per kind (gewogen over 18 jaar) */
export function kinderbijslagPerMaand(aantalKinderen: number): number {
  if (aantalKinderen <= 0) return 0
  // Gewogen gemiddelde: 6 jr × €279 + 6 jr × €339 + 6 jr × €399 = gemiddeld €339/kwartaal
  const gemiddeldPerKwartaal = (279 * 6 + 339 * 6 + 399 * 6) / 18
  return Math.round((gemiddeldPerKwartaal / 3) * aantalKinderen)
}

export const LIFE_EVENT_CATALOG: Record<string, LifeEventCatalogEntry> = {
  sabbatical: {
    label: 'Sabbatical',
    icon: 'Palmtree',
    group: 'werk',
    impactRange: '€15K–€25K totaal',
    defaultCost: 2000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -3000,
    defaultDuration: 6,
    description: 'Onbetaald verlof van het werk',
    tip: 'Gemiddeld netto inkomensverlies €2.000–€3.500/mnd. Vul je netto maandinkomen als negatieve inkomenswijziging in. Check je cao voor eventuele sabbaticalregelingen.',
    fields: [
      { key: 'nettoInkomen', label: 'Netto maandinkomen', fieldType: 'number', default: 3000, tip: 'Je huidige netto maandinkomen. Wordt gebruikt om het inkomensverlies te berekenen.' },
      { key: 'doorbetalingsPct', label: 'Doorbetalingspercentage', fieldType: 'percentage', default: 0, suffix: '%', tip: 'Sommige werkgevers betalen (gedeeltelijk) door tijdens sabbatical. 0% = volledig onbetaald, 50% = halve doorbetaling. Check je cao of arbeidsvoorwaarden.' },
      { key: 'extraKosten', label: 'Extra kosten (reis, activiteiten)', fieldType: 'number', default: 2000, tip: 'Eenmalige extra kosten: vluchten, verblijf, cursussen, uitrusting. Europa €1.000–€3.000, wereldwijd €3.000–€8.000.' },
      { key: 'bestemming', label: 'Bestemming', fieldType: 'select', default: 'europa', options: [
        { value: 'nederland', label: 'Nederland' },
        { value: 'europa', label: 'Europa' },
        { value: 'wereldwijd', label: 'Wereldwijd' },
      ]},
      { key: 'behoudtZorgverzekering', label: 'Zorgverzekering doorlopend', fieldType: 'toggle', default: true, tip: 'Basisverzekering ca. €130/mnd (2026). Bij langer verblijf buiten EU mogelijk aanvullende reisverzekering nodig.' },
    ],
  },
  world_trip: {
    label: 'Wereldreis',
    icon: 'Globe',
    group: 'vrije_tijd',
    impactRange: '€25K–€60K totaal',
    defaultCost: 4000,
    defaultMonthlyCost: 1200,
    defaultMonthlyIncome: -3000,
    defaultDuration: 12,
    description: 'Langdurige reis rond de wereld',
    tip: 'Budget per persoon: Budget €1.200/mnd, Gemiddeld €2.000/mnd, Comfort €3.000/mnd. Inclusief verblijf, eten en dagelijkse kosten.',
    fields: [
      { key: 'reisstijl', label: 'Reisstijl', fieldType: 'select', default: 'budget', options: [
        { value: 'budget', label: 'Budget — €1.200/mnd' },
        { value: 'gemiddeld', label: 'Gemiddeld — €2.000/mnd' },
        { value: 'comfort', label: 'Comfort — €3.000/mnd' },
      ]},
      { key: 'aantalPersonen', label: 'Aantal reizigers', fieldType: 'number', default: 1, tip: 'Kosten worden vermenigvuldigd per persoon. Twee samen is ca. 1,6× één persoon.' },
      { key: 'vasteLastenThuis', label: 'Vaste lasten thuis aanhouden', fieldType: 'toggle', default: true, tip: 'Huur/hypotheek, verzekeringen, abonnementen die doorlopen tijdens je reis. Opzeggen bespaart, maar je moet bij terugkomst alles opnieuw regelen.' },
      { key: 'vasteLastenBedrag', label: 'Vaste lasten per maand', fieldType: 'number', default: 800, suffix: '/mnd', tip: 'Schat je doorlopende vaste lasten: huur/hypotheek, verzekeringen, abonnementen. Gemiddeld €600–€1.200/mnd.' },
      { key: 'vertrekkosten', label: 'Vertrekkosten (vluchten, gear, visa)', fieldType: 'number', default: 4000, tip: 'Eenmalige kosten: retourvluchten €1.500–€3.000, reisuitrusting €500–€1.000, visa en vaccinaties €200–€500.' },
      { key: 'woningVerhuren', label: 'Woning verhuren tijdens reis', fieldType: 'toggle', default: false, tip: 'Tijdelijke verhuur kan €800–€1.500/mnd opleveren. Check je hypotheekvoorwaarden en gemeentelijke regels.' },
    ],
  },
  children: {
    label: 'Kinderen',
    icon: 'Baby',
    group: 'leven',
    impactRange: '€100K–€200K totaal',
    defaultCost: 5000,
    defaultMonthlyCost: 500,
    defaultMonthlyIncome: 0,
    defaultDuration: 216,
    description: 'Opvoedkosten 0–18 jaar',
    tip: 'NIBUD gemiddelde: €463–€1.000/mnd per kind (afhankelijk van leeftijd en inkomen). Totale kosten 0–18 jaar: ca. €100K–€170K per kind. Kinderbijslag en kinderopvangtoeslag verlagen de netto kosten.',
    fields: [
      { key: 'aantalKinderen', label: 'Aantal kinderen', fieldType: 'select', default: 1, options: [
        { value: 1, label: '1 kind' },
        { value: 2, label: '2 kinderen' },
        { value: 3, label: '3 kinderen' },
        { value: 4, label: '4 kinderen' },
      ], tip: 'NIBUD: kosten schalen niet lineair. 1 kind: €500/mnd, 2 kinderen: €830/mnd, 3: €1.100/mnd, 4: €1.320/mnd.' },
      { key: 'kinderopvangDagen', label: 'Kinderopvang (dagen/week)', fieldType: 'select', default: 0, options: [
        { value: 0, label: 'Geen opvang' },
        { value: 2, label: '2 dagen/week' },
        { value: 3, label: '3 dagen/week' },
        { value: 4, label: '4 dagen/week' },
        { value: 5, label: '5 dagen/week' },
      ], tip: 'Dagopvang ca. €9,50/uur (2026). Kinderopvangtoeslag vergoedt 33%–96% afhankelijk van inkomen (Belastingdienst).' },
      { key: 'kinderbijslag', label: 'Kinderbijslag meenemen', fieldType: 'toggle', default: true, tip: 'Kinderbijslag 2026: ca. €279/kwartaal (0–5 jr), €339 (6–11 jr), €399 (12–17 jr) per kind (SVB).' },
      { key: 'babyuitzet', label: 'Eenmalige kosten (uitzet, kinderkamer)', fieldType: 'number', default: 3000, tip: 'Gemiddelde eenmalige kosten voor babyuitzet, kinderkamer inrichten, autostoel, kinderwagen etc. Bron: Nibud, ca. €2.500–€5.000.' },
    ],
  },
  renovation: {
    label: 'Verbouwing',
    icon: 'Hammer',
    group: 'wonen',
    impactRange: '€10K–€80K eenmalig',
    defaultCost: 30000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Grote verbouwing of renovatie',
    tip: 'Richtprijzen 2026: keuken €10K–€30K, badkamer €8K–€20K, uitbouw €25K–€60K, dakkapel €10K–€18K, isolatie+zonnepanelen €15K–€30K. Kan de waarde van je woning verhogen.',
    fields: [
      { key: 'type', label: 'Type verbouwing', fieldType: 'select', default: 'keuken', options: [
        { value: 'keuken', label: 'Keuken' },
        { value: 'badkamer', label: 'Badkamer' },
        { value: 'uitbouw', label: 'Uitbouw / aanbouw' },
        { value: 'dakkapel', label: 'Dakkapel' },
        { value: 'energetisch', label: 'Energetisch (isolatie, zonnepanelen)' },
        { value: 'totaal', label: 'Totale renovatie' },
      ]},
      { key: 'waardevermeerdering', label: 'Geschatte waardevermeerdering', fieldType: 'percentage', default: 50, tip: 'Keuken/badkamer: 50–70% terugverdiend. Uitbouw: 60–80%. Energetisch: 40–60% (Vereniging Eigen Huis).', suffix: '%' },
    ],
  },
  study: {
    label: 'Studie',
    icon: 'GraduationCap',
    group: 'vrije_tijd',
    impactRange: '€1K–€30K totaal',
    defaultCost: 5000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 12,
    description: 'Opleiding of cursus',
    tip: 'Collegegeld 2025/2026: wettelijk €2.530/jr (bachelor/master). MBA: €15K–€40K totaal. STAP-budget (max €1.000) en scholingsaftrek kunnen de kosten verlagen.',
    fields: [
      { key: 'studieType', label: 'Type opleiding', fieldType: 'select', default: 'master', options: [
        { value: 'cursus', label: 'Korte cursus / certificering — ~€1.000' },
        { value: 'mbo', label: 'MBO opleiding — ~€3.000' },
        { value: 'bachelor', label: 'HBO / WO Bachelor — ~€7.500' },
        { value: 'master', label: 'Master — ~€5.000' },
        { value: 'mba', label: 'MBA — ~€30.000' },
        { value: 'promotie', label: 'Promotietraject — ~€2.000' },
      ]},
      { key: 'collegegeld', label: 'Collegegeld / cursuskosten (totaal)', fieldType: 'number', default: 5000, tip: 'Totale studiekosten inclusief boeken en materiaal. Het bedrag wordt automatisch ingesteld o.b.v. type, maar is handmatig aanpasbaar.' },
      { key: 'parttime', label: 'Parttime studie (naast werk)', fieldType: 'toggle', default: false, tip: 'Bij fulltime studie valt je netto inkomen weg. Sommige werkgevers bieden studieverlof of scholingsbudget.' },
      { key: 'salarisstijging', label: 'Verwachte salarisverhoging na afronding', fieldType: 'number', default: 300, suffix: '/mnd', tip: 'Gemiddeld €200–€500/mnd netto meer na een master. MBA: €500–€1.500/mnd. Cursus: €0–€200/mnd. Dit creëert een positieve inkomenswijziging na je studieduur.' },
    ],
  },
  career_change: {
    label: 'Carrière switch',
    icon: 'Briefcase',
    group: 'werk',
    impactRange: '€5K–€30K totaal',
    defaultCost: 3000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 18,
    description: 'Overgang naar ander werk met salarisverschil en overgangsperiode',
    tip: 'Modelleert drie fasen: (1) gap — geen inkomen, (2) overgangsperiode — lager salaris, (3) nieuw normaal — verwacht salaris. Inclusief eenmalige omscholingskosten.',
    fields: [
      { key: 'huidigNettoSalaris', label: 'Huidig netto salaris', fieldType: 'number', default: 3000, tip: 'Je huidige netto maandinkomen. Gemiddeld netto salaris NL: ca. €2.800/mnd (CBS, 2025).', suffix: '/mnd' },
      { key: 'verwachtNieuwNettoSalaris', label: 'Verwacht nieuw netto salaris', fieldType: 'number', default: 3000, tip: 'Je verwachte netto maandinkomen na de switch. Laterale switch: gelijk. Stap omhoog: +10–20%. Bewuste downshift: -10% tot -30%.', suffix: '/mnd' },
      { key: 'periodeZonderInkomen', label: 'Periode zonder inkomen', fieldType: 'number', default: 3, tip: 'Gemiddeld 2–4 maanden zoektijd/omscholing zonder salaris. WW-uitkering mogelijk als je >26 weken hebt gewerkt.', suffix: 'maanden' },
      { key: 'overgangsperiodeMaanden', label: 'Overgangsperiode lager salaris', fieldType: 'number', default: 12, tip: 'Periode waarin je in je nieuwe baan een lager (ingroei)salaris ontvangt. Bij zij-instap of omscholing vaak 6–18 maanden.', suffix: 'maanden' },
      { key: 'omscholingskosten', label: 'Omscholingskosten', fieldType: 'number', default: 2000, tip: 'Cursus/certificering €500–€3.000. Volledige omscholing €5.000–€15.000. STAP-budget: €1.000 subsidie (eenmalig).' },
    ],
  },
  part_time: {
    label: 'Part-time werken',
    icon: 'Clock',
    group: 'werk',
    impactRange: '€500–€1.500/mnd inkomensverlies',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -1000,
    defaultDuration: 60,
    description: 'Minder uren werken',
    tip: 'Van 40 naar 32 uur = 20% minder inkomen (ca. €500–€1.000/mnd netto bij modaal). Populairste keuze in NL: 32 of 36 uur. Check je cao voor recht op deeltijd (Wet flexibel werken).',
    fields: [
      { key: 'huidigUren', label: 'Huidige werkuren per week', fieldType: 'number', default: 40 },
      { key: 'nieuwUren', label: 'Nieuwe werkuren per week', fieldType: 'number', default: 32, tip: 'Populairste opties: 32 uur (4 dagen) of 36 uur (4,5 dagen). Het inkomensverschil wordt automatisch berekend.' },
      { key: 'nettoInkomen', label: 'Huidig netto maandinkomen', fieldType: 'number', default: 3000, suffix: '/mnd', tip: 'Je netto maandinkomen bij voltijd. Het inkomensverlies wordt berekend op basis van de verhouding oude/nieuwe uren.' },
      { key: 'isPermanent', label: 'Permanent (geen einddatum)', fieldType: 'toggle', default: false, tip: 'Kies permanent als je structureel minder wilt werken. Bij tijdelijk kun je een duur opgeven.' },
      { key: 'behoudtPensioen', label: 'Pensioenopbouw volledig', fieldType: 'toggle', default: false, tip: 'Bij sommige cao\'s kun je pensioen over voltijdsalaris opbouwen. Check je pensioenreglement of UPO (mijnpensioenoverzicht.nl).' },
    ],
  },
  early_retirement: {
    label: 'Vervroegd pensioen',
    icon: 'Sunset',
    group: 'pensioen',
    impactRange: '€50K–€200K overbrugging',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -2500,
    defaultDuration: 0,
    description: 'Eerder stoppen met werken',
    tip: 'AOW-leeftijd is 67 jaar (2026). Eerder stoppen = overbruggen zonder AOW-inkomen. RVU-drempelvrijstelling 2026: ca. €2.182/mnd bruto (max 3 jaar vóór AOW). Check mijnpensioenoverzicht.nl voor je verwachte pensioeninkomen.',
    fields: [
      { key: 'pensioenLeeftijd', label: 'Gewenste pensioenleeftijd', fieldType: 'number', default: 62, tip: 'AOW-leeftijd is 67 (2026). Elke jaar eerder stoppen = extra jaar overbruggen uit eigen vermogen.' },
      { key: 'vroegpensioenUitkering', label: 'Vroegpensioen uitkering (optioneel)', fieldType: 'number', default: 0, suffix: '/mnd', tip: 'Sommige regelingen bieden een vroegpensioenuitkering (bijv. 70% van je pensioen). Check mijnpensioenoverzicht.nl. Laat op 0 als je geen regeling hebt.' },
      { key: 'vroegpensioenVanafLeeftijd', label: 'Uitkering vanaf leeftijd', fieldType: 'number', default: 63, tip: 'Leeftijd waarop de vroegpensioenuitkering ingaat. Vaak 60-65 jaar.' },
      { key: 'heeftPensioenregeling', label: 'Aanvullende pensioenregeling', fieldType: 'toggle', default: false, tip: 'Check mijnpensioenoverzicht.nl. Sommige regelingen staan vervroegde opname toe vanaf 60 jaar (met actuariële korting).' },
      { key: 'overbruggingsUitkering', label: 'Verwachte overbruggingsuitkering', fieldType: 'number', default: 0, suffix: '/mnd', tip: 'RVU-regeling: max €2.182/mnd bruto (2026). Alleen beschikbaar als je werkgever meedoet. Anders uit eigen vermogen overbruggen.' },
    ],
  },
  house_purchase: {
    label: 'Huis kopen',
    icon: 'Home',
    group: 'wonen',
    impactRange: '€15K–€40K kosten koper',
    defaultCost: 25000,
    defaultMonthlyCost: 300,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Eerste woning of overstap',
    tip: 'Kosten koper ca. 5–6% van aankoopprijs (notaris, taxatie, overdrachtsbelasting). Gemiddelde koopsom NL 2025: ca. €430.000. Maximale hypotheek: 100% van marktwaarde.',
    fields: [
      { key: 'aankoopprijs', label: 'Aankoopprijs', fieldType: 'number', default: 350000, tip: 'Gemiddelde koopsom NL 2025: ca. €430.000. In Randstad hoger, buiten Randstad lager.' },
      { key: 'hypotheekRente', label: 'Hypotheekrente', fieldType: 'percentage', default: 4.0, tip: 'Indicatie 2026: 10-jarig vast ca. 3,8–4,2%. NHG-rente ca. 0,2% lager. Check hypotheker.nl voor actuele tarieven.', suffix: '%' },
      { key: 'eersteWoning', label: 'Eerste woning (starter)', fieldType: 'toggle', default: true, tip: 'Starters (18–35 jaar) zijn vrijgesteld van 2% overdrachtsbelasting tot €510.000 (Belastingdienst, 2026).' },
      { key: 'hypotheekLasten', label: 'Verwachte hypotheeklasten/mnd', fieldType: 'number', default: 1200, tip: 'Geschatte bruto hypotheeklasten per maand. Indicatie: €350K hypotheek à 4% = ca. €1.200/mnd annuïteit. Check hypotheker.nl voor je persoonlijke berekening.', suffix: '/mnd' },
      { key: 'huidigeHuur', label: 'Huidige huur/mnd', fieldType: 'number', default: 1000, tip: 'Gemiddelde vrije sector huur NL: ca. €1.100–€1.400/mnd. Dit bedrag bespaar je — verschil met hypotheek + onderhoud is de netto maandlast.', suffix: '/mnd' },
      { key: 'nhg', label: 'Nationale Hypotheek Garantie (NHG)', fieldType: 'toggle', default: false, tip: 'NHG-grens 2026: €435.000. Eenmalige kosten: 0,6% van hypotheeksom. Levert ca. 0,2% rentekorting op.' },
    ],
  },
  house_sale: {
    label: 'Huis verkopen',
    icon: 'HandCoins',
    group: 'wonen',
    impactRange: 'Overwaarde vrijval + maandlastenverschil',
    defaultCost: -50000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Huis verkopen met overwaarde-vrijval',
    tip: 'Verkoopkosten: makelaar (1–2%), notaris (€500–€1.000), taxatie (€400–€600). Netto overwaarde = verkoopprijs − hypotheek − kosten. Vergeet niet het huis als asset te verwijderen na verkoop.',
    fields: [
      { key: 'verkoopprijs', label: 'Verwachte verkoopprijs', fieldType: 'number', default: 400000, tip: 'Check WOZ-waarde als indicatie. Funda en vergelijkbare verkopen in je buurt geven een betere schatting.' },
      { key: 'resterendeHypotheek', label: 'Resterende hypotheek', fieldType: 'number', default: 200000, tip: 'Openstaand hypotheekbedrag op moment van verkoop. Check je jaaroverzicht of hypotheekverstrekker.' },
      { key: 'makelaarskosten', label: 'Makelaarskosten', fieldType: 'percentage', default: 1.5, suffix: '%', tip: 'Gemiddeld 1,0–1,5% van de verkoopprijs (NVM). Bij €400K = €4.000–€6.000.' },
      { key: 'nieuweSituatie', label: 'Nieuwe woonsituatie', fieldType: 'select', default: 'huren', options: [
        { value: 'huren', label: 'Huren' },
        { value: 'goedkoper_kopen', label: 'Goedkoper kopen' },
        { value: 'bij_partner', label: 'Bij partner intrekken' },
      ], tip: 'Dit bepaalt je nieuwe maandelijkse woonlasten' },
      { key: 'nieuweWoonlasten', label: 'Nieuwe maandelijkse woonlasten', fieldType: 'number', default: 1200, tip: 'Huur of hypotheeklasten van de nieuwe situatie' },
      { key: 'oudeHypotheeklasten', label: 'Huidige hypotheeklasten', fieldType: 'number', default: 1500, tip: 'Je huidige maandelijkse hypotheeklasten die wegvallen' },
    ],
  },
  move: {
    label: 'Verhuizing',
    icon: 'Truck',
    group: 'wonen',
    impactRange: '€3K–€10K eenmalig + maandlasten',
    defaultCost: 5000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Verhuizen naar ander huis of stad',
    tip: 'Verhuiskosten: lokaal €1.500–€3.000, regionaal €3.000–€5.000, internationaal €5.000–€15.000. Denk ook aan dubbele woonlasten tijdens de overlap en inrichtingskosten voor je nieuwe woning.',
    fields: [
      { key: 'afstand', label: 'Verhuisafstand', fieldType: 'select', default: 'regionaal', options: [
        { value: 'lokaal', label: 'Lokaal (zelfde stad)' },
        { value: 'regionaal', label: 'Regionaal (andere stad)' },
        { value: 'internationaal', label: 'Internationaal' },
      ], tip: 'De afstand bepaalt de verhuiskosten. Lokaal: €1.500, regionaal: €3.000, internationaal: €8.000.' },
      { key: 'verhuiskosten', label: 'Verhuiskosten', fieldType: 'number', default: 1500, tip: 'Kosten voor verhuisbedrijf, dozen, transport. Lokaal: €1.000–€2.000. Regionaal: €2.000–€4.000. Internationaal: €5.000–€15.000.' },
      { key: 'inrichtingskosten', label: 'Inrichtingskosten', fieldType: 'number', default: 3000, tip: 'Meubels, apparatuur, gordijnen, verf. Eerste woning: €5.000–€10.000. Vervanging: €2.000–€5.000.' },
      { key: 'dubbeleLastenMaanden', label: 'Dubbele woonlasten (maanden)', fieldType: 'number', default: 2, tip: 'Overlap tussen oude en nieuwe woning. Gemiddeld 1–3 maanden dubbele huur/hypotheek.', suffix: 'maanden' },
      { key: 'dubbeleLastenBedrag', label: 'Dubbele woonlasten per maand', fieldType: 'number', default: 1200, tip: 'Je huidige maandlasten die je extra betaalt tijdens de overlap (huur of hypotheek).', suffix: '/mnd' },
      { key: 'huurverschil', label: 'Verschil maandlasten nieuw vs oud', fieldType: 'number', default: 0, tip: 'Positief = duurder wonen, negatief = goedkoper. Randstad vs. buiten: verschil van €300–€600/mnd.', suffix: '/mnd' },
      { key: 'verschilPermanent', label: 'Maandlastenverschil is permanent', fieldType: 'toggle', default: true, tip: 'Permanent: het verschil loopt door tot FIRE. Tijdelijk: alleen tijdens de opgegeven duur (bijv. bij tijdelijke huur).' },
    ],
  },
  wedding: {
    label: 'Trouwerij',
    icon: 'Heart',
    group: 'leven',
    impactRange: '€15K–€25K eenmalig',
    defaultCost: 20000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Bruiloft en huwelijk',
    tip: 'Gemiddelde bruiloft in NL: €23.675 (ThePerfectWedding, 2025). Budget per gast: ca. €150–€250. Fiscaal partnerschap: na trouwen gezamenlijke Box 3 aangifte mogelijk. Dat kan voordelig zijn als één partner veel vermogen heeft — de vrijstelling (€57.000 p.p. in 2025) wordt gedeeld.',
    fields: [
      { key: 'budgetPreset', label: 'Budget preset', fieldType: 'select', default: 'gemiddeld', options: [
        { value: 'intiem', label: 'Intiem — €5K–€10K (kleine kring)' },
        { value: 'gemiddeld', label: 'Gemiddeld — €15K–€25K (NL gemiddelde)' },
        { value: 'uitgebreid', label: 'Uitgebreid — €25K–€40K (groots feest)' },
      ], tip: 'Kies een budget-niveau gebaseerd op Nederlands gemiddelde. Het bedrag wordt automatisch ingesteld maar is handmatig aanpasbaar.' },
      { key: 'aantalGasten', label: 'Aantal gasten', fieldType: 'number', default: 80, tip: 'Gemiddeld 80 gasten. Locatie + catering is 40–50% van het budget. Per gast €150–€250.' },
      { key: 'huwelijksreis', label: 'Budget huwelijksreis', fieldType: 'number', default: 3000, tip: 'Europa: €2.000–€4.000. Verre bestemming: €4.000–€10.000. All-inclusive: €3.000–€6.000. Wordt opgeteld bij het bruiloftsbudget.' },
      { key: 'huwelijksvoorwaarden', label: 'Huwelijkse voorwaarden', fieldType: 'toggle', default: false, tip: 'Notariskosten huwelijksvoorwaarden: €800–€1.500. Sinds 2018 geldt beperkte gemeenschap van goederen als standaard.' },
    ],
  },
  car_purchase: {
    label: 'Auto kopen',
    icon: 'Car',
    group: 'vermogen',
    impactRange: '€15K–€50K + €350/mnd',
    defaultCost: 20000,
    defaultMonthlyCost: 350,
    defaultMonthlyIncome: 0,
    defaultDuration: 72,
    description: 'Nieuwe of tweedehands auto',
    tip: 'Totale maandkosten auto (NIBUD): €350–€600/mnd inclusief afschrijving, verzekering (€50–€120/mnd), wegenbelasting (€30–€80/mnd), onderhoud en brandstof.',
    fields: [
      { key: 'brandstof', label: 'Brandstoftype', fieldType: 'select', default: 'benzine', options: [
        { value: 'benzine', label: 'Benzine' },
        { value: 'diesel', label: 'Diesel' },
        { value: 'elektrisch', label: 'Elektrisch' },
        { value: 'hybride', label: 'Hybride' },
      ], tip: 'Benzine: ca. €0,12/km. Elektrisch: ca. €0,05/km (thuis laden). Diesel: ca. €0,10/km. Hogere wegenbelasting voor diesel.' },
      { key: 'nieuwOfTweedehands', label: 'Staat', fieldType: 'select', default: 'tweedehands', options: [
        { value: 'nieuw', label: 'Nieuw' },
        { value: 'tweedehands', label: 'Tweedehands' },
      ]},
      { key: 'jaarlijkseKm', label: 'Geschatte jaarkilometers', fieldType: 'number', default: 15000, tip: 'NL gemiddelde: 12.000–15.000 km/jaar. Brandstofkosten benzine bij 15.000 km: ca. €1.800/jaar.' },
      { key: 'vervangtHuidigeAuto', label: 'Vervangt huidige auto?', fieldType: 'toggle', default: false, tip: 'Indien ja, wordt het verschil in maandkosten berekend ten opzichte van je huidige auto.' },
      { key: 'huidigeAutoKosten', label: 'Huidige maandkosten auto', fieldType: 'number', default: 300, tip: 'Huidige totale maandkosten (verzekering + wegenbelasting + onderhoud + brandstof). Gemiddeld €300–€500/mnd.' },
    ],
  },
  inheritance: {
    label: 'Erfenis ontvangen',
    icon: 'Gift',
    group: 'vermogen',
    impactRange: '€10K–€500K+ ontvangst',
    defaultCost: -50000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Vermogen ontvangen uit erfenis',
    tip: 'Negatieve kosten = je ontvangt geld. Erfbelasting 2026: 10–20% (kinderen), 30–40% (overig). Vrijstellingen: kind €25.187, partner €795.156 (Belastingdienst).',
    fields: [
      { key: 'brutoBedrag', label: 'Bruto erfenis', fieldType: 'number', default: 50000, tip: 'Gemiddelde erfenis NL: ca. €50.000–€100.000. Vul het totale bedrag vóór erfbelasting in.' },
      { key: 'erfbelastingSchijf', label: 'Relatie tot erflater', fieldType: 'select', default: 'kind', options: [
        { value: 'kind', label: 'Kind (vrijstelling €25.490)' },
        { value: 'partner', label: 'Partner (vrijstelling €804.698)' },
        { value: 'kleinkind', label: 'Kleinkind (vrijstelling €25.490)' },
        { value: 'overig', label: 'Overig familielid / geen familie' },
      ], tip: 'Kind/kleinkind: vrijstelling €25.490, tarief 10–20%. Partner: vrijstelling €804.698, tarief 10–20%. Overig: vrijstelling €2.658, tarief 30–40% (Belastingdienst, 2026).' },
      { key: 'bevatWoning', label: 'Bevat onroerend goed', fieldType: 'toggle', default: false, tip: 'Woning wordt gewaardeerd op WOZ-waarde. Mogelijk recht op bedrijfsopvolgingsregeling (BOR) bij verhuurde panden.' },
    ],
  },
  side_hustle: {
    label: 'Bijverdienste starten',
    icon: 'Zap',
    group: 'werk',
    impactRange: '+€300–€1.500/mnd extra',
    defaultCost: 1000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 500,
    defaultDuration: 36,
    description: 'Extra inkomstenbron naast je baan',
    tip: 'Gemiddeld bijverdieninkomen ZZP naast loondienst: €300–€1.500/mnd. Let op: boven €7.500/jaar resultaat geldt Box 1-heffing. Zelfstandigenaftrek 2026: ca. €2.470.',
    fields: [
      { key: 'type', label: 'Type bijverdienste', fieldType: 'select', default: 'freelance', options: [
        { value: 'freelance', label: 'Freelance / ZZP' },
        { value: 'verhuur', label: 'Verhuur (kamer, parkeerplaats)' },
        { value: 'ecommerce', label: 'Webshop / e-commerce' },
        { value: 'content', label: 'Content creatie' },
        { value: 'overig', label: 'Overig' },
      ]},
      { key: 'brutoOmzet', label: 'Verwachte bruto omzet/mnd', fieldType: 'number', default: 1500, tip: 'Gemiddelde bruto omzet ZZP naast loondienst: €1.000–€3.000/mnd. Dit is vóór aftrek van kosten en belastingen.' },
      { key: 'kostenPerMaand', label: 'Kosten/mnd', fieldType: 'number', default: 300, tip: 'Vaste kosten: software, werkplek, marketing, verzekeringen, administratie. Gemiddeld 20–40% van de omzet.' },
      { key: 'opstartkosten', label: 'Opstartkosten', fieldType: 'number', default: 1000, tip: 'Freelance: €500–€2.000 (laptop, website). Webshop: €1.000–€5.000 (voorraad, platform). KvK-inschrijving: €75.' },
      { key: 'opbouwperiode', label: 'Opbouwperiode (maanden)', fieldType: 'number', default: 0, tip: 'Aantal maanden met lagere omzet in het begin. Typisch 3–6 maanden voor freelance, 6–12 voor webshop.' },
      { key: 'opbouwOmzetPct', label: 'Omzet tijdens opbouw', fieldType: 'percentage', default: 30, tip: 'Percentage van de verwachte bruto omzet tijdens de opbouwperiode. Typisch 20–50%.', suffix: '%' },
      { key: 'doorlopend', label: 'Doorlopend', fieldType: 'toggle', default: true, tip: 'Doorlopende bijverdienste of tijdelijk project met een einddatum.' },
    ],
  },
  aow: {
    label: 'AOW',
    icon: 'Landmark',
    group: 'pensioen',
    impactRange: '+€1.072–€1.558/mnd netto',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 1558,
    defaultDuration: 0,
    defaultAge: 67,
    description: 'AOW staatspension (alleenstaand netto, 2026)',
    tip: 'AOW-leeftijd: 67 jaar (2026). Netto bedragen 2026: alleenstaand ca. €1.558/mnd, samenwonend ca. €1.072/mnd per persoon. Geïndexeerd aan minimumloon (SVB).',
    fields: [
      { key: 'leefsituatie', label: 'Leefsituatie bij AOW-leeftijd', fieldType: 'select', default: 'alleenstaand', options: [
        { value: 'alleenstaand', label: 'Alleenstaand (€1.558/mnd netto)' },
        { value: 'samenwonend', label: 'Samenwonend/gehuwd (€1.072/mnd netto p.p.)' },
      ], tip: 'Alleenstaand: 70% minimumloon. Samenwonend: 50% minimumloon per persoon. Check svb.nl voor actuele bedragen.' },
      { key: 'jarenBuitenNL', label: 'Jaren buiten Nederland', fieldType: 'number', default: 0, tip: '2% korting per jaar niet woonachtig in NL (leeftijd 15–67). Maximaal 50 opbouwjaren. Check svb.nl voor je opbouwoverzicht.' },
    ],
  },
  pension: {
    label: 'Aanvullend pensioen',
    icon: 'PiggyBank',
    group: 'pensioen',
    impactRange: '+€200–€2.000/mnd bruto',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 675,
    defaultDuration: 0,
    description: 'Aanvullend bedrijfspensioen of privépensioen',
    tip: 'Check mijnpensioenoverzicht.nl voor je verwachte pensioenuitkering. Gemiddeld aanvullend pensioen NL: ca. €675/mnd bruto. Nieuwe pensioenwet (Wtp) sinds 2025: premieregeling i.p.v. eindloon/middelloon.',
    fields: [
      { key: 'brutoBedrag', label: 'Verwacht bruto bedrag per maand', fieldType: 'number', default: 675, suffix: '/mnd', tip: 'Check mijnpensioenoverzicht.nl voor je verwachte pensioenuitkering.' },
      { key: 'pensioenType', label: 'Type pensioen', fieldType: 'select', default: 'bedrijf', options: [
        { value: 'bedrijf', label: 'Bedrijfspensioen' },
        { value: 'lijfrente', label: 'Lijfrente' },
        { value: 'banksparen', label: 'Banksparen' },
      ]},
      { key: 'ingangLeeftijd', label: 'Ingangsdatum (leeftijd)', fieldType: 'number', default: 67, tip: 'AOW-leeftijd: 67 jaar (2026). Pensioenrichtleeftijd: 68 jaar. Eerder kan, maar met actuariële korting (ca. 6–7% per jaar eerder). Check je UPO op mijnpensioenoverzicht.nl.' },
      { key: 'uitkeringsduur', label: 'Uitkeringsduur', fieldType: 'select', default: 'levenslang', options: [
        { value: 'levenslang', label: 'Levenslang' },
        { value: '20', label: '20 jaar' },
        { value: '10', label: '10 jaar' },
        { value: '5', label: '5 jaar' },
      ]},
      { key: 'isGeindexeerd', label: 'Wordt geïndexeerd', fieldType: 'toggle', default: false, tip: 'Bedrijfspensioenen worden niet altijd geïndexeerd. Lijfrente/banksparen is doorgaans niet geïndexeerd.' },
    ],
    defaultAge: 67,
  },
  overlijden_partner: {
    label: 'Overlijden partner',
    icon: 'HeartHandshake',
    group: 'leven',
    impactRange: 'Hoog — inkomensafhankelijk',
    defaultCost: -10000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -2500,
    defaultDuration: 0,
    description: 'Wegvallen partnerinkomen en nabestaandenvoorzieningen',
    tip: 'Cruciaal voor risicoplanning. Modelleert inkomensverlies, Anw-uitkering (SVB), nabestaandenpensioen en levensverzekering. Check je ORV-polis en UPO op mijnpensioenoverzicht.nl.',
    householdOnly: true,
    fields: [
      { key: 'nettoInkomenPartner', label: 'Netto maandinkomen partner', fieldType: 'number', default: 2500, tip: 'Modaal netto inkomen 2026: ca. €2.800/mnd. Het volledige netto maandinkomen van je partner valt weg.' },
      { key: 'nabestaandenpensioen', label: 'Nabestaandenpensioen', fieldType: 'number', default: 0, tip: 'Typisch 35–70% van het ouderdomspensioen. Check je UPO op mijnpensioenoverzicht.nl voor het exacte bedrag.' },
      { key: 'anwUitkering', label: 'Anw-uitkering', fieldType: 'select', default: 'kinderen', options: [
        { value: 'geen', label: 'Geen Anw-recht' },
        { value: 'kinderen', label: 'Met kinderen <18 (~€1.380/mnd bruto)' },
        { value: 'beperkt', label: 'Beperkt recht (zonder kinderen <18)' },
      ], tip: 'Anw-uitkering (SVB): met kinderen <18 ca. €1.380/mnd bruto (halfwezenuitkering). Zonder kinderen: beperkt of nihil. Eigen inkomen wordt verrekend.' },
      { key: 'anwBedrag', label: 'Anw-bedrag per maand (bruto)', fieldType: 'number', default: 1380, tip: 'Halfwezenuitkering 2026: ca. €1.380/mnd bruto. Nabestaandenuitkering (zonder kinderen): ca. €1.380/mnd bruto maar inkomensafhankelijk (SVB).', suffix: '/mnd' },
      { key: 'levensverzekering', label: 'Levensverzekering uitkering', fieldType: 'number', default: 0, tip: 'Gemiddelde ORV-uitkering: €100.000–€300.000. Premie: €5–€25/mnd. Check je polis voor het exacte bedrag.' },
      { key: 'kostendalingPct', label: 'Verwachte daling gedeelde kosten', fieldType: 'percentage', default: 30, tip: 'Na overlijden partner dalen gedeelde kosten (boodschappen, energie, verzekeringen) gemiddeld met 25–35%. Woonlasten (hypotheek/huur) blijven gelijk.', suffix: '%' },
    ],
  },
  scheiding: {
    label: 'Scheiding',
    icon: 'HeartCrack',
    group: 'leven',
    impactRange: '€20K–€200K+ totaal',
    defaultCost: 7500,
    defaultMonthlyCost: 500,
    defaultMonthlyIncome: 0,
    defaultDuration: 60,
    description: 'Echtscheiding met vermogensverdeling en alimentatie',
    tip: 'Gemiddelde kosten scheiding NL: €10.000–€50.000 (mediation goedkoper dan advocaat). Modelleert eenmalige kosten én structurele maandlasten (alimentatie, dubbele woonlasten).',
    fields: [
      { key: 'advocaatKosten', label: 'Advocaat/mediationkosten', fieldType: 'number', default: 7500, tip: 'Mediation: €3.000–€7.000. Twee advocaten: €8.000–€25.000+. Vechtscheiding: €15.000–€50.000+. Rechtsbijstand: check je polis.' },
      { key: 'vermogensBehoudPct', label: 'Vermogensverdeling: % dat je behoudt', fieldType: 'percentage', default: 50, tip: 'Gemeenschap van goederen (vóór 2018): standaard 50/50. Beperkte gemeenschap (na 2018): alleen gezamenlijk vermogen 50/50. Huwelijkse voorwaarden: volgens akte.', suffix: '%' },
      { key: 'partneralimentatieRichting', label: 'Partneralimentatie', fieldType: 'select', default: 'betalen', options: [
        { value: 'betalen', label: 'Ik betaal alimentatie' },
        { value: 'ontvangen', label: 'Ik ontvang alimentatie' },
      ], tip: 'De meest verdienende partner betaalt doorgaans alimentatie' },
      { key: 'partneralimentatieBedrag', label: 'Partneralimentatie bedrag', fieldType: 'number', default: 800, tip: 'Netto maandbedrag partneralimentatie', suffix: '/mnd' },
      { key: 'partneralimentatieDuur', label: 'Partneralimentatie duur', fieldType: 'number', default: 60, tip: 'Maximaal 5 jaar (60 maanden) bij huwelijk <15 jaar, langer bij kinderen <12', suffix: 'maanden' },
      { key: 'kinderalimentatieBedrag', label: 'Kinderalimentatie bedrag', fieldType: 'number', default: 0, tip: 'Maandbedrag per kind, afhankelijk van inkomen en zorgverdeling. Vul 0 in als er geen kinderen zijn.', suffix: '/mnd' },
      { key: 'kinderalimentatieDuur', label: 'Kinderalimentatie duur', fieldType: 'number', default: 0, tip: 'Tot het kind 21 wordt. Vul het aantal resterende maanden in.', suffix: 'maanden' },
      { key: 'extraWoonlasten', label: 'Extra woonlasten (dubbele huishouding)', fieldType: 'number', default: 500, tip: 'Het verschil met je huidige situatie: extra huur, inrichting, vaste lasten', suffix: '/mnd' },
    ],
  },
  werkloosheid: {
    label: 'Werkloosheid / Ontslag',
    icon: 'UserMinus',
    group: 'werk',
    impactRange: '€2.000–€3.500/mnd inkomensverlies',
    defaultCost: -5000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -1500,
    defaultDuration: 12,
    description: 'Onvrijwillig verlies van baan met WW-uitkering en transitievergoeding',
    tip: 'WW-uitkering: 75% dagloon eerste 2 maanden, daarna 70%. Maximaal 24 maanden (afhankelijk van arbeidsverleden). Max dagloon 2026: ca. €274/dag bruto (UWV).',
    fields: [
      { key: 'huidigBruto', label: 'Huidig bruto maandsalaris', fieldType: 'number', default: 4000, tip: 'Je bruto maandsalaris. Nodig voor berekening WW-uitkering en transitievergoeding.' },
      { key: 'huidigNetto', label: 'Huidig netto maandinkomen', fieldType: 'number', default: 3000, tip: 'Je netto maandsalaris. Het verschil met WW bepaalt je maandelijkse inkomensgat.' },
      { key: 'dienstjaren', label: 'Dienstjaren bij werkgever', fieldType: 'number', default: 5, tip: 'Nodig voor berekening transitievergoeding: ~1/3 bruto maandsalaris per dienstjaar.' },
      { key: 'transitievergoeding', label: 'Transitievergoeding (berekend)', fieldType: 'number', default: 6667, tip: 'Automatisch berekend: ~1/3 bruto maandsalaris × dienstjaren. Handmatig aanpasbaar.' },
      { key: 'wwDuur', label: 'WW-duur', fieldType: 'select', default: 12, options: [
        { value: 3, label: '3 maanden (basisrecht)' },
        { value: 6, label: '6 maanden' },
        { value: 12, label: '12 maanden' },
        { value: 18, label: '18 maanden' },
        { value: 24, label: '24 maanden (maximaal)' },
      ], tip: 'Basisrecht: 3 mnd. Per jaar arbeidsverleden +1 mnd. Max 24 mnd bij 38+ jaar arbeidsverleden (UWV).' },
      { key: 'zoektijd', label: 'Verwachte werkloosheidsduur', fieldType: 'number', default: 6, tip: 'Totale periode zonder werk (incl. WW). Na afloop WW eventueel bijstand.', suffix: 'maanden' },
    ],
  },
  schenking: {
    label: 'Schenking doen',
    icon: 'HandCoins',
    group: 'vermogen',
    impactRange: '€1K–€200K+ weggeschonken',
    defaultCost: 10000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Vermogen schenken aan kinderen of anderen',
    tip: 'Jaarlijkse schenkingsvrijstelling 2026: ca. €6.633 (kind), €2.658 (overig). Belastingtarief boven vrijstelling: 10–20% (kind) of 30–40% (overig). Schenken verlaagt je Box 3-vermogen.',
    fields: [
      { key: 'relatieOntvanger', label: 'Relatie tot ontvanger', fieldType: 'select', default: 'kind', options: [
        { value: 'kind', label: 'Kind (vrijstelling ~€6.633/jr)' },
        { value: 'kleinkind', label: 'Kleinkind (vrijstelling ~€2.658/jr)' },
        { value: 'overig', label: 'Overig (vrijstelling ~€2.658/jr)' },
      ], tip: 'Vrijstellingsbedragen 2026 (Belastingdienst). Bij hogere bedragen geldt schenkbelasting.' },
      { key: 'aantalOntvangers', label: 'Aantal ontvangers', fieldType: 'number', default: 1, tip: 'Per ontvanger geldt een aparte vrijstelling. Bij 2 kinderen = 2× vrijstelling.' },
      { key: 'eenmaligOfJaarlijks', label: 'Frequentie', fieldType: 'select', default: 'eenmalig', options: [
        { value: 'eenmalig', label: 'Eenmalig' },
        { value: 'jaarlijks', label: 'Jaarlijks (binnen vrijstelling)' },
      ], tip: 'Jaarlijks schenken binnen de vrijstelling is belastingvrij en verlaagt je Box 3-grondslag structureel.' },
      { key: 'aantalJaren', label: 'Aantal jaren schenken', fieldType: 'number', default: 10, tip: 'Hoe lang je jaarlijks wilt schenken. Wordt alleen gebruikt bij jaarlijkse schenking.' },
      { key: 'doelBestemming', label: 'Doel van schenking', fieldType: 'select', default: 'vrij', options: [
        { value: 'vrij', label: 'Vrij besteedbaar' },
        { value: 'studie', label: 'Studie' },
        { value: 'woning', label: 'Woning (jubelton afgeschaft)' },
        { value: 'onderneming', label: 'Onderneming' },
      ], tip: 'De jubelton (eenmalige verhoogde vrijstelling voor woning) is afgeschaft per 2024. Andere doelen hebben geen extra fiscaal voordeel.' },
    ],
  },
  begrafenis: {
    label: 'Begrafenis / Uitvaart',
    icon: 'Flower2',
    group: 'leven',
    impactRange: '€7.000–€15.000 eenmalig',
    defaultCost: 9000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Kosten van je eigen uitvaart, inclusief verzekering en nalatenschap',
    tip: 'Gemiddelde uitvaartkosten NL 2026: €8.000–€12.000. Crematie is gemiddeld €1.000–€2.000 goedkoper dan begraven. Een naturapolis dekt de diensten, een sommenpolis keert een vast bedrag uit. Zonder verzekering vallen de kosten op je nabestaanden.',
    fields: [
      { key: 'uitvaartType', label: 'Type uitvaart', fieldType: 'select', default: 'begraven', options: [
        { value: 'begraven', label: 'Begraven' },
        { value: 'crematie', label: 'Crematie' },
        { value: 'natuurbegraven', label: 'Natuurbegraven' },
      ], tip: 'Begraven: €9.000–€14.000. Crematie: €6.000–€10.000. Natuurbegraven: €3.000–€6.000. Prijzen incl. uitvaartverzorging, kist/urn, rouwkaarten, koffietafel.' },
      { key: 'uitvaartkosten', label: 'Geschatte uitvaartkosten', fieldType: 'number', default: 9000, tip: 'Totale geschatte uitvaartkosten. Nibud 2026: gemiddeld €8.000–€12.000. Inclusief: verzorging (€2.500), kist (€500–€3.000), begraafplaats/crematorium (€1.500–€4.000), rouwkaarten, bloemen, koffietafel, grafsteen.' },
      { key: 'heeftVerzekering', label: 'Uitvaartverzekering', fieldType: 'toggle', default: false, tip: 'Heb je een uitvaartverzekering? Naturapolis: uitvaartondernemer regelt alles. Sommenpolis: vast bedrag (check of het nog toereikend is, veel oude polissen dekken maar €3.000–€5.000).' },
      { key: 'verzekeringDekking', label: 'Dekkingsbedrag verzekering', fieldType: 'number', default: 0, suffix: '€', tip: 'Dekkingsbedrag van je uitvaartverzekering. Naturapolis: vul de geschatte waarde in. Sommenpolis: het verzekerde bedrag. Verschil met uitvaartkosten = restkosten voor nabestaanden.' },
      { key: 'grafrechtenJaar', label: 'Grafrechten (jaren)', fieldType: 'number', default: 20, suffix: 'jaar', tip: 'Grafrechten worden afgekocht voor 10–30 jaar. Kosten: €1.500–€5.000 voor 20 jaar, afhankelijk van gemeente. Bij crematie niet van toepassing.' },
      { key: 'extraWensen', label: 'Extra wensen', fieldType: 'number', default: 0, tip: 'Rouwadvertentie (€500–€2.000), bijzondere locatie, muzikanten, speciale kist, uitgebreide koffietafel, etc.' },
    ],
  },
  custom: {
    label: 'Anders',
    icon: 'Calendar',
    group: 'anders',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Eigen levensgebeurtenis',
  },
}

export const MARKET_WEATHER = {
  normal: { label: 'Normaal', return: 0.07, volatility: 0.15, description: 'Gemiddeld marktrendement' },
  bull: { label: 'Bull markt', return: 0.12, volatility: 0.12, description: 'Sterke markt, hoog rendement' },
  bear: { label: 'Bear markt', return: -0.20, volatility: 0.25, description: 'Crash in jaar 1, daarna herstel' },
  stagflation: { label: 'Stagflatie', return: 0.02, volatility: 0.18, description: 'Laag rendement, hoge inflatie' },
  historical: { label: 'Historisch', return: 0.08, volatility: 0.17, description: 'AEX-achtige patronen' },
} as const

export type MarketWeather = keyof typeof MARKET_WEATHER

// ── Helpers ──────────────────────────────────────────────────

export function ageAtDate(dob: string, date: Date = new Date()): number {
  const birth = new Date(dob)
  let age = date.getFullYear() - birth.getFullYear()
  const m = date.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && date.getDate() < birth.getDate())) age--
  return age
}

export function formatFireAge(age: number | null): string {
  if (age === null) return '—'
  const years = Math.floor(age)
  const months = Math.round((age - years) * 12)
  return months > 0 ? `${years} jaar en ${months} mnd` : `${years} jaar`
}

export function formatFireAgeShort(age: number | null): string {
  if (age === null) return '—'
  return `${Math.floor(age)} jaar`
}

export function formatFireAgeDelta(delta: number): string {
  return `${delta < 0 ? '' : '+'}${delta.toFixed(1)} jaar`
}

export function formatCountdown(days: number): string {
  if (days <= 0) return 'Bereikt!'
  const years = Math.floor(days / 365)
  const remaining = days % 365
  const months = Math.floor(remaining / 30)
  if (years > 0 && months > 0) return `${years}j ${months}mnd`
  if (years > 0) return `${years}j`
  return `${months}mnd`
}

/** Box-Muller transform for normal distribution */
export function normalRandom(mean: number, stddev: number, seed?: number): number {
  // Simple seeded PRNG (xorshift32) when seed provided
  let u1: number, u2: number
  if (seed !== undefined) {
    let s = seed
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    u1 = Math.abs(s) / 2147483647
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    u2 = Math.abs(s) / 2147483647
    u1 = Math.max(u1, 0.0001)
    u2 = Math.max(u2, 0.0001)
  } else {
    u1 = Math.random()
    u2 = Math.random()
    u1 = Math.max(u1, 0.0001)
  }
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + stddev * z
}

// Seeded PRNG class for Monte Carlo
export class SeededRandom {
  private state: number
  constructor(seed: number) {
    this.state = seed | 0 || 1
  }
  next(): number {
    this.state ^= this.state << 13
    this.state ^= this.state >> 17
    this.state ^= this.state << 5
    return Math.abs(this.state) / 2147483647
  }
  normal(mean: number, stddev: number): number {
    const u1 = Math.max(this.next(), 0.0001)
    const u2 = this.next()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + stddev * z
  }
}

// ── Core Computations ────────────────────────────────────────

/**
 * Compute FIRE projection from financial inputs.
 */
export function computeFireProjection(
  input: FinancialInput,
  annualReturn: number = DEFAULT_RETURN,
  swrOverride?: number,
  inflationOverride?: number,
  strategyOptions?: {
    strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    endAge?: number
  },
): FireProjection {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, monthlyContributions, yearlyMustExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const inflationRate = inflationOverride ?? INFLATION
  const netWorth = totalAssets - totalDebts
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses, yearlyExpenses)
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const realReturn = (1 + annualReturn) / (1 + inflationRate) - 1
  const yearsInRetirement = (strategyOptions?.strategy === 'deplete' && strategyOptions.endAge && currentAge != null)
    ? Math.max(1, strategyOptions.endAge - Math.round(currentAge))
    : undefined
  const fireTarget = computeFireTarget(effectiveYearlyExpenses, swr, {
    strategy: strategyOptions?.strategy,
    yearsInRetirement,
    realReturn,
  })
  const freedomPercentage = computeFreedomPercentage(netWorth, fireTarget)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses)
  const monthlyPassiveIncome = (netWorth * swr) / 12

  // Freedom time (shared primitives from core-metrics.ts)
  const { years: freedomYears, months: freedomMonths } = computeFreedomTime(netWorth, effectiveYearlyExpenses)

  // FIRE date calculation (inflation-adjusted real return)
  const monthlyReturn = realReturn / 12
  let projected = netWorth
  let months = 0
  let fireDate = ''
  let countdownDays = 0
  let countdownYears = 0
  let countdownMonths = 0
  let fireAge: number | null = null

  if (netWorth >= fireTarget && fireTarget > 0) {
    fireDate = 'Bereikt!'
    fireAge = currentAge
  } else if (monthlySavings > 0 && fireTarget > netWorth) {
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    if (months < 600) {
      const fd = new Date()
      fd.setMonth(fd.getMonth() + months)
      fireDate = fd.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
      countdownDays = Math.round(months * 30.44)
      countdownYears = Math.floor(months / 12)
      countdownMonths = months % 12

      if (currentAge !== null) {
        fireAge = currentAge + months / 12
      }
    } else {
      fireDate = 'Niet haalbaar'
    }
  } else if (fireTarget > 0) {
    fireDate = 'Niet haalbaar'
  }

  return {
    fireTarget,
    netWorth,
    freedomPercentage,
    fireAge,
    currentAge,
    fireDate,
    countdownDays,
    countdownYears,
    countdownMonths,
    freedomYears,
    freedomMonths,
    monthlyPassiveIncome,
    monthlySavings,
    savingsRate,
  }
}

// ── Countdown derived from simulation ────────────────────────

export interface FireCountdown {
  countdownYears: number
  countdownMonths: number
  countdownDays: number
  fireDate: string
}

/**
 * Derive countdown values from the simulation engine's fireAgeFractional.
 * This ensures consistency between the displayed FIRE age and the countdown.
 */
export function deriveCountdown(
  fireAgeFractional: number | null,
  currentAge: number | null,
): FireCountdown {
  if (fireAgeFractional == null || currentAge == null) {
    return { countdownYears: 0, countdownMonths: 0, countdownDays: 0, fireDate: 'Niet haalbaar' }
  }
  const yearsToFire = fireAgeFractional - currentAge
  if (yearsToFire <= 0) {
    return { countdownYears: 0, countdownMonths: 0, countdownDays: 0, fireDate: 'Bereikt!' }
  }
  const countdownYears = Math.floor(yearsToFire)
  const countdownMonths = Math.round((yearsToFire - countdownYears) * 12)
  const countdownDays = Math.round(yearsToFire * 365.25)
  const fd = new Date()
  fd.setMonth(fd.getMonth() + Math.round(yearsToFire * 12))
  const fireDate = fd.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  return { countdownYears, countdownMonths, countdownDays, fireDate }
}

/**
 * Compute optimistic / expected / pessimistic FIRE projections.
 */
export function computeFireRange(
  input: FinancialInput,
  swrOverride?: number,
  inflationOverride?: number,
  baseReturn: number = DEFAULT_RETURN,
  strategyOptions?: {
    strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    endAge?: number
  },
): FireRange {
  return {
    optimistic: computeFireProjection(input, Math.min(0.20, baseReturn + 0.02), swrOverride, inflationOverride, strategyOptions),
    expected: computeFireProjection(input, baseReturn, swrOverride, inflationOverride, strategyOptions),
    pessimistic: computeFireProjection(input, Math.max(0.01, baseReturn - 0.03), swrOverride, inflationOverride, strategyOptions),
  }
}

/**
 * Month-by-month forward projection.
 * Optionally accepts future cashflows (AOW, pension, part-time) to include age-based income adjustments.
 */
export function projectForward(
  input: FinancialInput,
  months: number,
  annualReturn: number = DEFAULT_RETURN,
  swrOverride?: number,
  cashflows?: FutureCashflow[],
): ProjectionMonth[] {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const monthlyReturn = annualReturn / 12
  const baseMonthlySavings = monthlyIncome - monthlyExpenses
  let netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const result: ProjectionMonth[] = []

  for (let m = 0; m <= months; m++) {
    const date = new Date(now)
    date.setMonth(date.getMonth() + m)
    const age = currentAge !== null ? currentAge + m / 12 : null
    const passiveIncome = (netWorth * swr) / 12

    // Cashflow adjustments based on age
    let cashflowIncome = 0
    if (age !== null && cashflows && cashflows.length > 0) {
      for (const cf of cashflows) {
        const toAgeBound = cf.toAge ?? 90
        if (age >= cf.fromAge && age <= toAgeBound) {
          cashflowIncome += cf.monthlyAmount
        }
        // One-time amount: add when crossing fromAge threshold
        if (cf.oneTimeAmount && m > 0) {
          const prevAge = currentAge !== null ? currentAge + (m - 1) / 12 : null
          if (prevAge !== null && prevAge < cf.fromAge && age >= cf.fromAge) {
            netWorth += cf.oneTimeAmount
          }
        }
      }
    }

    const effectiveMonthlySavings = baseMonthlySavings + cashflowIncome

    result.push({
      month: m,
      date: date.toISOString().split('T')[0],
      netWorth: Math.round(netWorth),
      passiveIncome: Math.round(passiveIncome),
      age,
      contributions: m === 0 ? 0 : effectiveMonthlySavings,
      growth: m === 0 ? 0 : Math.round(netWorth * monthlyReturn),
    })

    if (m < months) {
      const growth = netWorth * monthlyReturn
      netWorth = netWorth + growth + effectiveMonthlySavings
    }
  }

  return result
}

/**
 * Three diverging scenario paths: Drifter, Current, Optimizer.
 * Optionally accepts a market weather key to adjust return rates.
 */
export function computeScenarios(
  input: FinancialInput,
  maxYears: number = 40,
  weather: MarketWeather = 'normal',
): ScenarioPath[] {
  const months = maxYears * 12
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const netWorth = totalAssets - totalDebts
  const now = new Date()
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
  const weatherReturn = MARKET_WEATHER[weather].return

  function simulate(
    name: string,
    label: string,
    color: string,
    expenseGrowth: number, // annual % change in expenses
    savingsGrowthRate: number, // annual % change in savings rate
    expenseMultiplier: number, // initial expense change
    contributionMultiplier: number, // initial contribution change
  ): ScenarioPath {
    let nw = netWorth
    let mExpenses = monthlyExpenses * expenseMultiplier
    let mSavings = (monthlyIncome - mExpenses) * contributionMultiplier
    const monthlyReturn = weatherReturn / 12
    const pts: ProjectionMonth[] = []
    let fireMonth: number | null = null
    let fireAge: number | null = null

    for (let m = 0; m <= months; m++) {
      const date = new Date(now)
      date.setMonth(date.getMonth() + m)
      const age = currentAge !== null ? currentAge + m / 12 : null

      pts.push({
        month: m,
        date: date.toISOString().split('T')[0],
        netWorth: Math.round(nw),
        passiveIncome: Math.round((nw * NL_SWR) / 12),
        age,
        contributions: m === 0 ? 0 : Math.round(mSavings),
        growth: 0,
      })

      // Check FIRE
      const currentFireTarget = (mExpenses * 12) / NL_SWR
      if (fireMonth === null && nw >= currentFireTarget && currentFireTarget > 0) {
        fireMonth = m
        fireAge = age
      }

      if (m < months) {
        nw = nw * (1 + monthlyReturn) + mSavings
        // Annual adjustments
        if (m > 0 && m % 12 === 0) {
          mExpenses *= (1 + expenseGrowth)
          const newSavings = monthlyIncome - mExpenses
          mSavings = Math.max(0, newSavings) * (1 + savingsGrowthRate)
        }
      }
    }

    return { name, label, color, months: pts, fireAge, fireMonth }
  }

  return [
    simulate('drifter', 'Drifter', '#ef4444', 0.03, -0.02, 1.05, 0.8),
    simulate('current', 'Huidige Koers', '#8B5CB8', 0, 0, 1, 1),
    simulate('optimizer', 'Optimizer', '#10b981', -0.01, 0.02, 0.9, 1.2),
  ]
}

/**
 * Monte Carlo simulation: 1000 paths over N years.
 * Optionally accepts future cashflows (AOW, pension, part-time) to adjust yearly savings.
 */
export function runMonteCarlo(
  input: FinancialInput,
  sims: number = 1000,
  years: number = 40,
  swrOverride?: number,
  volatilityOverride?: number,
  cashflows?: FutureCashflow[],
): MonteCarloResult {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const volatility = volatilityOverride ?? DEFAULT_VOLATILITY
  const netWorth = totalAssets - totalDebts
  const baseMonthlySavings = monthlyIncome - monthlyExpenses
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swr : 0
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

  // Each simulation: year-by-year net worth
  const allPaths: number[][] = []
  const fireAges: number[] = []
  let fireCount = 0

  for (let s = 0; s < sims; s++) {
    const rng = new SeededRandom(s * 7919 + 42)
    let nw = netWorth
    const path: number[] = [nw]
    let fired = false

    for (let y = 1; y <= years; y++) {
      const annualReturn = rng.normal(DEFAULT_RETURN, volatility)

      // Cashflow adjustments for this year
      let cashflowYearly = 0
      if (cashflows && cashflows.length > 0 && currentAge !== null) {
        const age = currentAge + y
        for (const cf of cashflows) {
          const toAgeBound = cf.toAge ?? 90
          if (age >= cf.fromAge && age <= toAgeBound) {
            cashflowYearly += cf.monthlyAmount * 12
          }
        }
      }

      nw = nw * (1 + annualReturn) + baseMonthlySavings * 12 + cashflowYearly
      nw = Math.max(0, nw)
      path.push(Math.round(nw))

      if (!fired && nw >= fireTarget && fireTarget > 0) {
        fired = true
        const age = currentAge !== null ? currentAge + y : y
        fireAges.push(age)
        fireCount++
      }
    }

    allPaths.push(path)
  }

  // Compute percentiles per year
  const percentiles = {
    p10: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p90: [] as number[],
  }

  for (let y = 0; y <= years; y++) {
    const values = allPaths.map(p => p[y]).sort((a, b) => a - b)
    percentiles.p10.push(values[Math.floor(sims * 0.10)])
    percentiles.p25.push(values[Math.floor(sims * 0.25)])
    percentiles.p50.push(values[Math.floor(sims * 0.50)])
    percentiles.p75.push(values[Math.floor(sims * 0.75)])
    percentiles.p90.push(values[Math.floor(sims * 0.90)])
  }

  // FIRE age percentiles
  const sortedFireAges = [...fireAges].sort((a, b) => a - b)
  const p10FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.10)] : null
  const p50FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.50)] : null
  const p90FireAge = sortedFireAges.length > 0 ? sortedFireAges[Math.floor(sortedFireAges.length * 0.90)] : null

  return {
    simulations: sims,
    years,
    percentiles,
    fireAges: sortedFireAges,
    fireProb: fireCount / sims,
    p10FireAge,
    p50FireAge,
    p90FireAge,
  }
}

/**
 * Withdrawal strategy simulation.
 */
export function computeWithdrawal(
  startPortfolio: number,
  retirementAge: number,
  targetAge: number,
  strategy: WithdrawalStrategy,
  yearlyExpenses: number,
  annualReturn: number = DEFAULT_RETURN,
  guardrailsConfig?: Partial<GuardrailsConfig>,
  bucketConfig?: Partial<BucketConfig>,
): WithdrawalResult {
  const totalYears = targetAge - retirementAge
  if (totalYears <= 0) {
    return { strategy, monthlyWithdrawal: 0, yearlySustainable: 0, successYears: 0, totalYears: 0, schedule: [], depleted: false }
  }

  const gr = { ...DEFAULT_GUARDRAILS, ...guardrailsConfig }
  const bk = { ...DEFAULT_BUCKET, ...bucketConfig }
  const stockPct = 1 - bk.cashPct - bk.bondPct

  const schedule: WithdrawalYear[] = []
  let balance = startPortfolio
  let depleted = false
  let successYears = 0

  // Initial withdrawal rate
  const baseWithdrawal = startPortfolio * NL_SWR
  let currentWithdrawal = baseWithdrawal

  // Bucket strategy pools
  let cashBucket = strategy === 'bucket' ? startPortfolio * bk.cashPct : 0
  let bondBucket = strategy === 'bucket' ? startPortfolio * bk.bondPct : 0
  let stockBucket = strategy === 'bucket' ? startPortfolio * stockPct : 0

  // Guardrails
  const guardrailFloor = baseWithdrawal * gr.floor
  const guardrailCeiling = baseWithdrawal * gr.ceiling

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const year = new Date().getFullYear() + y
    const aowIncome = age >= NL_AOW_AGE ? NL_AOW_MONTHLY * 12 : 0
    const neededFromPortfolio = Math.max(0, yearlyExpenses - aowIncome)

    let withdrawal = 0
    let growth = 0

    if (strategy === 'classic') {
      withdrawal = Math.min(neededFromPortfolio, balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'variable') {
      const variableWithdrawal = balance * NL_SWR
      withdrawal = Math.min(Math.max(variableWithdrawal, neededFromPortfolio * 0.5), balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'guardrails') {
      // Guyton-Klinger
      if (y === 0) {
        currentWithdrawal = neededFromPortfolio
      } else {
        const prevBalance = schedule[y - 1]?.startBalance || startPortfolio
        const returnPct = prevBalance > 0 ? (balance - prevBalance + schedule[y-1]?.withdrawal - schedule[y-1]?.aowIncome) / prevBalance : 0
        if (returnPct > 0.20) {
          currentWithdrawal = Math.min(currentWithdrawal * (1 + gr.raiseStep), guardrailCeiling)
        } else if (returnPct < -0.20) {
          currentWithdrawal = Math.max(currentWithdrawal * (1 - gr.cutStep), guardrailFloor)
        }
        currentWithdrawal = currentWithdrawal * (1 + INFLATION)
      }
      withdrawal = Math.min(currentWithdrawal, balance)
      growth = (balance - withdrawal) * annualReturn
    } else if (strategy === 'bucket') {
      // Cash bucket: 0%, Bonds: 3%, Stocks: 7%
      withdrawal = Math.min(neededFromPortfolio, cashBucket + bondBucket + stockBucket)

      // Withdraw from cash first
      const fromCash = Math.min(withdrawal, cashBucket)
      cashBucket -= fromCash
      const remaining = withdrawal - fromCash
      const fromBonds = Math.min(remaining, bondBucket)
      bondBucket -= fromBonds
      const fromStocks = remaining - fromBonds
      stockBucket -= fromStocks

      // Grow buckets
      bondBucket *= (1 + bk.bondReturn)
      stockBucket *= (1 + annualReturn)

      // Rebalance: refill cash from stocks
      const targetCash = yearlyExpenses * bk.cashBufferYears
      if (cashBucket < targetCash && stockBucket > targetCash) {
        const refill = Math.min(targetCash - cashBucket, stockBucket * 0.1)
        cashBucket += refill
        stockBucket -= refill
      }

      balance = cashBucket + bondBucket + stockBucket
      growth = 0 // already applied
    }

    if (strategy !== 'bucket') {
      const startBalance = balance
      balance = balance - withdrawal + growth
      schedule.push({
        age,
        year,
        startBalance: Math.round(startBalance),
        withdrawal: Math.round(withdrawal),
        aowIncome: Math.round(aowIncome),
        growth: Math.round(growth),
        endBalance: Math.round(Math.max(0, balance)),
      })
    } else {
      schedule.push({
        age,
        year,
        startBalance: Math.round(cashBucket + bondBucket + stockBucket + withdrawal),
        withdrawal: Math.round(withdrawal),
        aowIncome: Math.round(aowIncome),
        growth: Math.round(bondBucket * bk.bondReturn + stockBucket * annualReturn),
        endBalance: Math.round(Math.max(0, cashBucket + bondBucket + stockBucket)),
      })
    }

    if (balance <= 0 && !depleted) {
      depleted = true
      successYears = y + 1
    }

    balance = Math.max(0, balance)
  }

  if (!depleted) successYears = totalYears

  const firstYearWithdrawal = schedule[0]?.withdrawal || 0

  return {
    strategy,
    monthlyWithdrawal: Math.round(firstYearWithdrawal / 12),
    yearlySustainable: firstYearWithdrawal,
    successYears,
    totalYears,
    schedule,
    depleted,
  }
}

/**
 * Compute the FIRE delay caused by a single life event.
 */
export function computeLifeEventImpact(
  input: FinancialInput,
  event: LifeEvent,
): LifeEventImpact {
  const baseProjection = computeFireProjection(input)
  const baseFire = baseProjection.countdownDays

  // Compute adjusted input
  const totalCost = Number(event.one_time_cost) +
    (Number(event.monthly_cost_change) * Number(event.duration_months))
  const totalIncomeChange = Number(event.monthly_income_change) * Number(event.duration_months)

  const adjustedInput: FinancialInput = {
    ...input,
    totalAssets: input.totalAssets - Number(event.one_time_cost),
    monthlyExpenses: input.monthlyExpenses + Number(event.monthly_cost_change),
    monthlyIncome: input.monthlyIncome + Number(event.monthly_income_change),
  }

  const adjustedProjection = computeFireProjection(adjustedInput)
  const adjustedFire = adjustedProjection.countdownDays

  const fireDelayMonths = Math.round((adjustedFire - baseFire) / 30.44)
  const dailyExpense = input.yearlyMustExpenses > 0
    ? input.yearlyMustExpenses / 365
    : (input.monthlyExpenses > 0 ? (input.monthlyExpenses * 12) / 365 : 0)
  const freedomDaysLost = dailyExpense > 0 ? Math.round(totalCost / dailyExpense) : 0

  return {
    event,
    fireDelayMonths: Math.max(0, fireDelayMonths),
    totalCost: totalCost - totalIncomeChange,
    freedomDaysLost: Math.max(0, freedomDaysLost),
  }
}

/**
 * Compute resilience score (0-100).
 *
 * @deprecated This function uses the old 4-pillar resilience model.
 * Use `computeHealthScore()` from `lib/financial-health.ts` instead, which provides
 * a broader 6-pillar financial health assessment. This function is retained only for
 * backward compatibility with historical snapshots that store `resilience_score` values.
 *
 * @see computeHealthScore — the replacement function in lib/financial-health.ts
 */
export function computeResilienceScore(input: FinancialInput): ResilienceScore {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses } = input
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses

  // Emergency fund: months of expenses covered by liquid assets (assume 30% is liquid)
  const liquidAssets = totalAssets * 0.3
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const emergency = Math.max(0, Math.min(25, Math.round((emergencyMonths / 6) * 25)))

  // Diversification: simple heuristic (better with actual asset types, but works from totals)
  const assetToDebtRatio = totalDebts > 0 ? totalAssets / totalDebts : totalAssets > 0 ? 10 : 0
  const diversification = Math.max(0, Math.min(25, Math.round(Math.min(assetToDebtRatio / 3, 1) * 25)))

  // Debt ratio: debt as % of assets
  const debtPct = totalAssets > 0 ? totalDebts / totalAssets : 1
  const debtScore = Math.max(0, Math.min(25, Math.round((1 - Math.min(debtPct, 1)) * 25)))

  // Savings rate
  const sr = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
  const savingsScore = Math.max(0, Math.min(25, Math.round(Math.min(sr / 0.30, 1) * 25)))

  const total = Math.max(0, emergency + diversification + debtScore + savingsScore)

  let label: string
  if (total >= 80) label = 'Uitstekend'
  else if (total >= 60) label = 'Sterk'
  else if (total >= 40) label = 'Redelijk'
  else if (total >= 20) label = 'Kwetsbaar'
  else label = 'Kritiek'

  return {
    total,
    breakdown: { emergency, diversification, debtRatio: debtScore, savingsRate: savingsScore },
    label,
  }
}

// ── Backtesting ───────────────────────────────────────────────

export interface BacktestPath {
  startYear: number
  label?: string
  description?: string
  color?: string
  values: number[]        // portfolio value per year (year 0 = start)
  success: boolean        // portfolio intact at end of period
  depletionYear: number | null  // year portfolio ran out (null = never)
  fireAgeReached: number | null // age at which FIRE target was crossed
}

export interface BacktestResult {
  years: number
  allPaths: BacktestPath[]
  namedPaths: BacktestPath[]
  successRate: number
  worstCase: BacktestPath
  medianPath: BacktestPath
  bestCase: BacktestPath
  bandMin: number[]
  bandMax: number[]
  bandP25: number[]
  bandP75: number[]
}

/**
 * Backtest against historical MSCI World real returns (1970–2024).
 * Simulates all available start years and returns success rates and statistics.
 */
export function runBacktest(
  input: FinancialInput,
  years: number = 30,
  swrOverride?: number,
): BacktestResult {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses
  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swr : 0
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

  // Available start years: 1970 to (2024 - years)
  const maxStartYear = 2024 - years
  const startYears: number[] = []
  for (let y = 1970; y <= maxStartYear; y++) {
    startYears.push(y)
  }

  const allPaths: BacktestPath[] = startYears.map(startYear => {
    let nw = netWorth
    const values: number[] = [Math.round(nw)]
    let depletionYear: number | null = null
    let fireAgeReached: number | null = null

    for (let y = 1; y <= years; y++) {
      const dataYear = startYear + y - 1
      const realReturn = MSCI_REAL_RETURNS[dataYear] ?? DEFAULT_RETURN
      nw = nw * (1 + realReturn) + monthlySavings * 12
      if (nw <= 0) {
        nw = 0
        if (depletionYear === null) depletionYear = y
      }
      values.push(Math.round(nw))

      if (fireAgeReached === null && fireTarget > 0 && nw >= fireTarget && currentAge !== null) {
        fireAgeReached = currentAge + y
      }
    }

    // Match named period
    const namedPeriod = NAMED_PERIODS.find(p => p.startYear === startYear)

    return {
      startYear,
      label: namedPeriod?.label,
      description: namedPeriod?.description,
      color: namedPeriod?.color,
      values,
      success: nw > 0,
      depletionYear,
      fireAgeReached,
    }
  })

  const successCount = allPaths.filter(p => p.success).length
  const successRate = allPaths.length > 0 ? successCount / allPaths.length : 0

  // Named paths
  const namedPaths = NAMED_PERIODS
    .map(period => allPaths.find(p => p.startYear === period.startYear))
    .filter((p): p is BacktestPath => p !== undefined)

  // Sort by final value for worst/median/best
  const sortedByFinal = [...allPaths].sort((a, b) => (a.values[years] ?? 0) - (b.values[years] ?? 0))
  const worstCase = sortedByFinal[0] ?? allPaths[0]
  const medianPath = sortedByFinal[Math.floor(sortedByFinal.length / 2)] ?? allPaths[0]
  const bestCase = sortedByFinal[sortedByFinal.length - 1] ?? allPaths[allPaths.length - 1]

  // Band calculations per year
  const bandMin: number[] = []
  const bandMax: number[] = []
  const bandP25: number[] = []
  const bandP75: number[] = []

  for (let y = 0; y <= years; y++) {
    const vals = allPaths.map(p => p.values[y] ?? 0).sort((a, b) => a - b)
    bandMin.push(vals[0] ?? 0)
    bandMax.push(vals[vals.length - 1] ?? 0)
    bandP25.push(vals[Math.floor(vals.length * 0.25)] ?? 0)
    bandP75.push(vals[Math.floor(vals.length * 0.75)] ?? 0)
  }

  return {
    years,
    allPaths,
    namedPaths,
    successRate,
    worstCase,
    medianPath,
    bestCase,
    bandMin,
    bandMax,
    bandP25,
    bandP75,
  }
}
