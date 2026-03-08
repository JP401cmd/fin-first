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
  NL_AOW_AGE, NL_AOW_MONTHLY, INFLATION,
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
  { name: 'AOW (alleenstaand)',  monthlyAmount: 1380, fromAge: 67, toAge: null },
  { name: 'AOW (per partner)',   monthlyAmount: 940,  fromAge: 67, toAge: null },
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

// ── Per-event-type metadata interfaces (type-safe access) ────────────

export interface ChildrenMetadata {
  aantalKinderen?: number
  kinderopvangDagen?: number
  kinderbijslag?: boolean
}

export interface AOWMetadata {
  leefsituatie?: 'alleenstaand' | 'samenwonend'
  jarenInNL?: number
}

export interface PensionMetadata {
  pensioenType?: 'bedrijf' | 'lijfrente' | 'privaat'
  ingangLeeftijd?: number
  uitkeringsduur?: 'levenslang' | '20' | '10' | '5'
}

export interface CarPurchaseMetadata {
  brandstof?: 'benzine' | 'diesel' | 'elektrisch' | 'hybride'
  nieuwOfTweedehands?: 'nieuw' | 'tweedehands'
  jaarlijkseKm?: number
}

export interface HousePurchaseMetadata {
  aankoopprijs?: number
  hypotheekRente?: number
  eersteWoning?: boolean
  huidigeHuur?: number
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
  erfbelastingSchijf?: 'ouder' | 'partner' | 'overig'
  bevatWoning?: boolean
}

export interface SabbaticalMetadata {
  reiskosten?: number
  bestemming?: 'nederland' | 'europa' | 'wereldwijd'
  behoudtZorgverzekering?: boolean
}

export interface WorldTripMetadata {
  aantalPersonen?: number
  reistype?: 'backpacking' | 'comfort' | 'luxe'
  woningVerhuren?: boolean
}

export interface RenovationMetadata {
  type?: 'keuken' | 'badkamer' | 'uitbouw' | 'dakkapel' | 'energetisch' | 'totaal'
  waardevermeerdering?: number
}

export interface StudyMetadata {
  studieType?: 'cursus' | 'bachelor' | 'master' | 'promotie'
  parttime?: boolean
  salarisstijging?: number
}

export interface CareerChangeMetadata {
  tussenperiode?: number
  omscholing?: number
  salarisstijging?: number
}

export interface PartTimeMetadata {
  huidigUren?: number
  nieuwUren?: number
  behoudtPensioen?: boolean
}

export interface EarlyRetirementMetadata {
  pensioenLeeftijd?: number
  heeftPensioenregeling?: boolean
  overbruggingsUitkering?: number
}

export interface WeddingMetadata {
  aantalGasten?: number
  huwelijksreis?: number
  huwelijksvoorwaarden?: boolean
}

export interface MoveMetadata {
  afstand?: 'lokaal' | 'regionaal' | 'internationaal'
  huurverschil?: number
}

export interface SideHustleMetadata {
  type?: 'freelance' | 'verhuur' | 'ecommerce' | 'content' | 'overig'
  opstartkosten?: number
  groeipercentage?: number
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
  custom: Record<string, unknown>
}

export interface LifeEventImpact {
  event: LifeEvent
  fireDelayMonths: number
  totalCost: number
  freedomDaysLost: number
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

export type LifeEventGroup = 'leven' | 'wonen' | 'werk' | 'inkomen' | 'vrije_tijd' | 'anders'

export const LIFE_EVENT_GROUPS: Record<LifeEventGroup, { label: string; order: number }> = {
  leven:      { label: 'Leven',      order: 0 },
  wonen:      { label: 'Wonen',      order: 1 },
  werk:       { label: 'Werk',       order: 2 },
  inkomen:    { label: 'Inkomen',    order: 3 },
  vrije_tijd: { label: 'Vrije tijd', order: 4 },
  anders:     { label: 'Anders',     order: 5 },
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
    tip: 'Vul je netto maandinkomen als negatieve inkomenswijziging in',
    fields: [
      { key: 'reiskosten', label: 'Reiskosten (eenmalig)', fieldType: 'number', default: 2000, tip: 'Vluchten, visa, vaccinaties etc.' },
      { key: 'bestemming', label: 'Bestemming', fieldType: 'select', default: 'europa', options: [
        { value: 'nederland', label: 'Nederland' },
        { value: 'europa', label: 'Europa' },
        { value: 'wereldwijd', label: 'Wereldwijd' },
      ]},
      { key: 'behoudtZorgverzekering', label: 'Zorgverzekering doorlopend', fieldType: 'toggle', default: true, tip: 'Houd je je zorgverzekering aan tijdens sabbatical?' },
    ],
  },
  world_trip: {
    label: 'Wereldreis',
    icon: 'Globe',
    group: 'vrije_tijd',
    impactRange: '€25K–€60K totaal',
    defaultCost: 15000,
    defaultMonthlyCost: 2000,
    defaultMonthlyIncome: -3000,
    defaultDuration: 12,
    description: 'Langdurige reis rond de wereld',
    tip: 'Inclusief vluchten, verblijf en dagelijkse kosten',
    fields: [
      { key: 'aantalPersonen', label: 'Aantal reizigers', fieldType: 'number', default: 1, tip: 'Kosten worden vermenigvuldigd per persoon' },
      { key: 'reistype', label: 'Reistype', fieldType: 'select', default: 'backpacking', options: [
        { value: 'backpacking', label: 'Backpacking (budget)' },
        { value: 'comfort', label: 'Comfort (middenklasse)' },
        { value: 'luxe', label: 'Luxe' },
      ]},
      { key: 'woningVerhuren', label: 'Woning verhuren tijdens reis', fieldType: 'toggle', default: false, tip: 'Verhuurinkomsten compenseren een deel van de reiskosten' },
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
    tip: 'Gemiddeld ca. 500/mnd. Kinderbijslag en kinderopvangtoeslag verlagen de netto kosten',
    fields: [
      { key: 'aantalKinderen', label: 'Aantal kinderen', fieldType: 'select', default: 1, options: [
        { value: 1, label: '1 kind' },
        { value: 2, label: '2 kinderen' },
        { value: 3, label: '3 kinderen' },
        { value: 4, label: '4 kinderen' },
      ], tip: 'Kosten schalen niet lineair (NIBUD): 2e kind kost minder dan het 1e' },
      { key: 'kinderopvangDagen', label: 'Kinderopvang (dagen/week)', fieldType: 'select', default: 0, options: [
        { value: 0, label: 'Geen opvang' },
        { value: 2, label: '2 dagen/week' },
        { value: 3, label: '3 dagen/week' },
        { value: 4, label: '4 dagen/week' },
        { value: 5, label: '5 dagen/week' },
      ], tip: 'Ca. €8-10/uur, deels vergoed door kinderopvangtoeslag' },
      { key: 'kinderbijslag', label: 'Kinderbijslag meenemen', fieldType: 'toggle', default: true, tip: 'Ca. €260/kwartaal per kind (0-5 jaar)' },
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
    tip: 'Kan de waarde van je woning verhogen (update je asset daarna)',
    fields: [
      { key: 'type', label: 'Type verbouwing', fieldType: 'select', default: 'keuken', options: [
        { value: 'keuken', label: 'Keuken' },
        { value: 'badkamer', label: 'Badkamer' },
        { value: 'uitbouw', label: 'Uitbouw / aanbouw' },
        { value: 'dakkapel', label: 'Dakkapel' },
        { value: 'energetisch', label: 'Energetisch (isolatie, zonnepanelen)' },
        { value: 'totaal', label: 'Totale renovatie' },
      ]},
      { key: 'waardevermeerdering', label: 'Geschatte waardevermeerdering', fieldType: 'percentage', default: 50, tip: 'Hoeveel % van de investering komt terug als woningwaarde?', suffix: '%' },
    ],
  },
  study: {
    label: 'Studie',
    icon: 'GraduationCap',
    group: 'werk',
    impactRange: '€5K–€30K totaal',
    defaultCost: 8000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 24,
    description: 'Opleiding of cursus',
    tip: 'Studiekosten zijn soms fiscaal aftrekbaar',
    fields: [
      { key: 'studieType', label: 'Type studie', fieldType: 'select', default: 'master', options: [
        { value: 'cursus', label: 'Korte cursus / certificering' },
        { value: 'bachelor', label: 'Bachelor' },
        { value: 'master', label: 'Master / MBA' },
        { value: 'promotie', label: 'Promotietraject' },
      ]},
      { key: 'parttime', label: 'Parttime studie (naast werk)', fieldType: 'toggle', default: false, tip: 'Bij fulltime studie valt je inkomen (deels) weg' },
      { key: 'salarisstijging', label: 'Verwachte salarisstijging na afronding', fieldType: 'percentage', default: 15, tip: 'Hoeveel % verwacht je meer te verdienen?', suffix: '%' },
    ],
  },
  career_change: {
    label: 'Carriere switch',
    icon: 'Briefcase',
    group: 'werk',
    impactRange: '€5K–€15K totaal',
    defaultCost: 3000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 6,
    description: 'Overgang naar ander werk',
    tip: 'Pas inkomenswijziging aan als je salaris verandert',
    fields: [
      { key: 'tussenperiode', label: 'Tussenperiode zonder inkomen', fieldType: 'number', default: 3, tip: 'Aantal maanden zonder salaris tussen banen', suffix: 'maanden' },
      { key: 'omscholing', label: 'Omscholingskosten', fieldType: 'number', default: 2000, tip: 'Kosten voor cursussen, certificeringen, coaching' },
      { key: 'salarisstijging', label: 'Verwachte salarisstijging', fieldType: 'percentage', default: 0, tip: 'Positief bij stap omhoog, negatief bij bewuste downshift', suffix: '%' },
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
    tip: 'Vul het verschil met je huidige inkomen in als negatieve inkomenswijziging',
    fields: [
      { key: 'huidigUren', label: 'Huidige werkuren per week', fieldType: 'number', default: 40 },
      { key: 'nieuwUren', label: 'Nieuwe werkuren per week', fieldType: 'number', default: 32, tip: 'Het inkomensverschil wordt automatisch berekend' },
      { key: 'behoudtPensioen', label: 'Pensioenopbouw volledig', fieldType: 'toggle', default: false, tip: 'Sommige werkgevers bieden volledige opbouw bij parttime' },
    ],
  },
  early_retirement: {
    label: 'Vervroegd pensioen',
    icon: 'Sunset',
    group: 'inkomen',
    impactRange: '€50K–€200K overbrugging',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: -2500,
    defaultDuration: 0,
    description: 'Eerder stoppen met werken',
    tip: 'Let op: AOW gaat pas in bij de wettelijke pensioenleeftijd',
    fields: [
      { key: 'pensioenLeeftijd', label: 'Gewenste pensioenleeftijd', fieldType: 'number', default: 60 },
      { key: 'heeftPensioenregeling', label: 'Aanvullende pensioenregeling', fieldType: 'toggle', default: false, tip: 'Heb je een bedrijfspensioen dat eerder ingaat?' },
      { key: 'overbruggingsUitkering', label: 'Verwachte overbruggingsuitkering', fieldType: 'number', default: 0, tip: 'Maandelijks bedrag tot AOW-leeftijd' },
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
    tip: 'Kosten koper ca. 5-6% van aankoopprijs. Maandlasten = hypotheek min huidige huur',
    fields: [
      { key: 'aankoopprijs', label: 'Aankoopprijs', fieldType: 'number', default: 350000, tip: 'De totale koopprijs van de woning' },
      { key: 'hypotheekRente', label: 'Hypotheekrente', fieldType: 'percentage', default: 4.0, tip: 'Huidige marktrente voor 10-jarig vast', suffix: '%' },
      { key: 'eersteWoning', label: 'Eerste woning (starter)', fieldType: 'toggle', default: true, tip: 'Starters betalen geen overdrachtsbelasting (2%)' },
      { key: 'huidigeHuur', label: 'Huidige maandhuur', fieldType: 'number', default: 1000, tip: 'Dit bedrag bespaar je — verschil met hypotheek is de netto maandlast' },
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
    tip: 'Vergeet niet het huis als asset te verwijderen na verkoop. De netto overwaarde (verkoopprijs - hypotheek - kosten) komt vrij als vermogen.',
    fields: [
      { key: 'verkoopprijs', label: 'Verwachte verkoopprijs', fieldType: 'number', default: 400000, tip: 'Geschatte marktwaarde van de woning' },
      { key: 'resterendeHypotheek', label: 'Resterende hypotheek', fieldType: 'number', default: 200000, tip: 'Openstaand hypotheekbedrag op moment van verkoop' },
      { key: 'makelaarskosten', label: 'Makelaarskosten', fieldType: 'percentage', default: 1.5, suffix: '%', tip: 'Gemiddeld 1-2% van de verkoopprijs' },
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
    impactRange: '€3K–€10K eenmalig',
    defaultCost: 5000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Verhuizen naar ander huis of stad',
    fields: [
      { key: 'afstand', label: 'Verhuisafstand', fieldType: 'select', default: 'regionaal', options: [
        { value: 'lokaal', label: 'Lokaal (zelfde stad)' },
        { value: 'regionaal', label: 'Regionaal (andere stad)' },
        { value: 'internationaal', label: 'Internationaal' },
      ]},
      { key: 'huurverschil', label: 'Maandelijks huurverschil', fieldType: 'number', default: 0, tip: 'Positief als nieuwe woning duurder is, negatief als goedkoper' },
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
    tip: 'Gemiddelde bruiloft in NL kost 15.000-25.000',
    fields: [
      { key: 'aantalGasten', label: 'Aantal gasten', fieldType: 'number', default: 80, tip: 'Meer gasten = hogere locatie- en cateringkosten' },
      { key: 'huwelijksreis', label: 'Budget huwelijksreis', fieldType: 'number', default: 3000 },
      { key: 'huwelijksvoorwaarden', label: 'Huwelijkse voorwaarden', fieldType: 'toggle', default: false, tip: 'Kosten notaris ca. €800-1.500' },
    ],
  },
  car_purchase: {
    label: 'Auto kopen',
    icon: 'Car',
    group: 'vrije_tijd',
    impactRange: '€15K–€50K + €350/mnd',
    defaultCost: 20000,
    defaultMonthlyCost: 350,
    defaultMonthlyIncome: 0,
    defaultDuration: 72,
    description: 'Nieuwe of tweedehands auto',
    tip: 'Maandelijkse kosten: verzekering, wegenbelasting, onderhoud, brandstof',
    fields: [
      { key: 'brandstof', label: 'Brandstoftype', fieldType: 'select', default: 'benzine', options: [
        { value: 'benzine', label: 'Benzine' },
        { value: 'diesel', label: 'Diesel' },
        { value: 'elektrisch', label: 'Elektrisch' },
        { value: 'hybride', label: 'Hybride' },
      ], tip: 'Elektrisch: lagere brandstofkosten maar hogere aanschaf' },
      { key: 'nieuwOfTweedehands', label: 'Staat', fieldType: 'select', default: 'tweedehands', options: [
        { value: 'nieuw', label: 'Nieuw' },
        { value: 'tweedehands', label: 'Tweedehands' },
      ]},
      { key: 'jaarlijkseKm', label: 'Geschatte jaarkilometers', fieldType: 'number', default: 15000, tip: 'Beïnvloedt brandstof- en onderhoudskosten' },
    ],
  },
  inheritance: {
    label: 'Erfenis ontvangen',
    icon: 'Gift',
    group: 'inkomen',
    impactRange: '€10K–€500K+ ontvangst',
    defaultCost: -50000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Vermogen ontvangen uit erfenis',
    tip: 'Negatieve kosten = je ontvangt geld. Let op erfbelasting',
    fields: [
      { key: 'brutoBedrag', label: 'Bruto erfenis', fieldType: 'number', default: 50000, tip: 'Het totale bedrag vóór erfbelasting' },
      { key: 'erfbelastingSchijf', label: 'Relatie tot erflater', fieldType: 'select', default: 'ouder', options: [
        { value: 'ouder', label: 'Ouder (vrijstelling ~€25.000)' },
        { value: 'partner', label: 'Partner (vrijstelling ~€795.000)' },
        { value: 'overig', label: 'Overig familielid / derde' },
      ], tip: 'De vrijstelling en het tarief hangen af van de relatie' },
      { key: 'bevatWoning', label: 'Bevat onroerend goed', fieldType: 'toggle', default: false, tip: 'Woning moet mogelijk verkocht worden om de erfenis liquide te maken' },
    ],
  },
  side_hustle: {
    label: 'Bijverdienste starten',
    icon: 'Zap',
    group: 'inkomen',
    impactRange: '+€300–€1.500/mnd extra',
    defaultCost: 1000,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 500,
    defaultDuration: 36,
    description: 'Extra inkomstenbron naast je baan',
    tip: 'Positieve inkomenswijziging versnelt je FIRE-datum',
    fields: [
      { key: 'type', label: 'Type bijverdienste', fieldType: 'select', default: 'freelance', options: [
        { value: 'freelance', label: 'Freelance / ZZP' },
        { value: 'verhuur', label: 'Verhuur (kamer, parkeerplaats)' },
        { value: 'ecommerce', label: 'Webshop / e-commerce' },
        { value: 'content', label: 'Content creatie' },
        { value: 'overig', label: 'Overig' },
      ]},
      { key: 'opstartkosten', label: 'Opstartkosten', fieldType: 'number', default: 1000, tip: 'Eenmalige investering om te beginnen' },
      { key: 'groeipercentage', label: 'Jaarlijkse inkomstengroei', fieldType: 'percentage', default: 10, tip: 'Verwachte groei van het extra inkomen per jaar', suffix: '%' },
    ],
  },
  aow: {
    label: 'AOW',
    icon: 'Landmark',
    group: 'inkomen',
    impactRange: '+€950–€1.380/mnd bruto',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 1380,
    defaultDuration: 0,
    defaultAge: 67,
    description: 'AOW staatspension (alleenstaand, 2025)',
    tip: 'AOW start op leeftijd 67 en wordt jaarlijks geïndexeerd. Het bedrag is bruto.',
    fields: [
      { key: 'leefsituatie', label: 'Leefsituatie bij AOW-leeftijd', fieldType: 'select', default: 'alleenstaand', options: [
        { value: 'alleenstaand', label: 'Alleenstaand (€1.380/mnd bruto)' },
        { value: 'samenwonend', label: 'Samenwonend/gehuwd (€948/mnd bruto)' },
      ], tip: 'Het AOW-bedrag verschilt per leefsituatie' },
      { key: 'jarenInNL', label: 'Aantal opbouwjaren in NL', fieldType: 'number', default: 50, tip: '50 jaar = volledige AOW. Per gemist jaar 2% korting.' },
    ],
  },
  pension: {
    label: 'Aanvullend pensioen',
    icon: 'PiggyBank',
    group: 'inkomen',
    impactRange: '+€200–€2.000/mnd bruto',
    defaultCost: 0,
    defaultMonthlyCost: 0,
    defaultMonthlyIncome: 0,
    defaultDuration: 0,
    description: 'Aanvullend bedrijfspensioen of privépensioen',
    fields: [
      { key: 'pensioenType', label: 'Type pensioen', fieldType: 'select', default: 'bedrijf', options: [
        { value: 'bedrijf', label: 'Bedrijfspensioen' },
        { value: 'lijfrente', label: 'Lijfrente / banksparen' },
        { value: 'privaat', label: 'Privé pensioensparen' },
      ]},
      { key: 'ingangLeeftijd', label: 'Ingangsdatum (leeftijd)', fieldType: 'number', default: 68, tip: 'Leeftijd waarop de uitkering start' },
      { key: 'uitkeringsduur', label: 'Uitkeringsduur', fieldType: 'select', default: 'levenslang', options: [
        { value: 'levenslang', label: 'Levenslang' },
        { value: '20', label: '20 jaar' },
        { value: '10', label: '10 jaar' },
        { value: '5', label: '5 jaar' },
      ]},
    ],
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
    tip: 'Modelleert het verlies van partnerinkomen, nabestaandenpensioen, Anw-uitkering en eventuele levensverzekering. Cruciaal voor risicoplanning.',
    householdOnly: true,
    fields: [
      { key: 'nettoInkomenPartner', label: 'Netto maandinkomen partner', fieldType: 'number', default: 2500, tip: 'Het netto maandinkomen dat wegvalt bij overlijden' },
      { key: 'nabestaandenpensioen', label: 'Nabestaandenpensioen', fieldType: 'number', default: 0, tip: 'Check je pensioenoverzicht of UPO (Uniform Pensioenoverzicht) voor het exacte bedrag' },
      { key: 'anwUitkering', label: 'Anw-uitkering', fieldType: 'select', default: 'kinderen', options: [
        { value: 'geen', label: 'Geen Anw-recht' },
        { value: 'kinderen', label: 'Met kinderen <18 (~\u20AC1.380/mnd bruto)' },
        { value: 'beperkt', label: 'Beperkt recht (zonder kinderen <18)' },
      ], tip: 'De Anw (Algemene nabestaandenwet) biedt een uitkering als je partner overlijdt. De halfwezenuitkering (~\u20AC1.380/mnd bruto) geldt bij kinderen onder 18.' },
      { key: 'anwBedrag', label: 'Anw-bedrag per maand (bruto)', fieldType: 'number', default: 1380, tip: 'Ca. \u20AC1.380/mnd bruto bij kinderen <18, anders beperkt of nihil', suffix: '/mnd' },
      { key: 'levensverzekering', label: 'Levensverzekering uitkering', fieldType: 'number', default: 0, tip: 'Eenmalig bedrag uit levensverzekering of overlijdensrisicoverzekering (ORV)' },
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
    tip: 'Modelleert eenmalige kosten (advocaat, vermogensverdeling) én structurele maandelijkse veranderingen (alimentatie, dubbele woonlasten)',
    fields: [
      { key: 'advocaatKosten', label: 'Advocaat/mediationkosten', fieldType: 'number', default: 7500, tip: 'Eenmalig: gemiddeld €5.000–€10.000 voor mediation, meer bij vechtscheiding' },
      { key: 'vermogensBehoudPct', label: 'Vermogensverdeling: % dat je behoudt', fieldType: 'percentage', default: 50, tip: 'Bij gemeenschap van goederen standaard 50%. Bij huwelijkse voorwaarden kan dit afwijken.', suffix: '%' },
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
class SeededRandom {
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
): FireProjection {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, monthlyContributions, yearlyMustExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const inflationRate = inflationOverride ?? INFLATION
  const netWorth = totalAssets - totalDebts
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses, yearlyExpenses)
  const fireTarget = computeFireTarget(effectiveYearlyExpenses, swr)
  const freedomPercentage = computeFreedomPercentage(netWorth, fireTarget)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses)
  const monthlyPassiveIncome = (netWorth * swr) / 12

  // Freedom time (shared primitives from core-metrics.ts)
  const { years: freedomYears, months: freedomMonths } = computeFreedomTime(netWorth, effectiveYearlyExpenses)

  // FIRE date calculation (inflation-adjusted real return)
  const realReturn = (1 + annualReturn) / (1 + inflationRate) - 1
  const monthlyReturn = realReturn / 12
  let projected = netWorth
  let months = 0
  let fireDate = ''
  let countdownDays = 0
  let countdownYears = 0
  let countdownMonths = 0
  let fireAge: number | null = null
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null

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
): FireRange {
  return {
    optimistic: computeFireProjection(input, Math.min(0.20, baseReturn + 0.02), swrOverride, inflationOverride),
    expected: computeFireProjection(input, baseReturn, swrOverride, inflationOverride),
    pessimistic: computeFireProjection(input, Math.max(0.01, baseReturn - 0.03), swrOverride, inflationOverride),
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
 */
export function computeResilienceScore(input: FinancialInput): ResilienceScore {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses } = input
  const netWorth = totalAssets - totalDebts
  const monthlySavings = monthlyIncome - monthlyExpenses

  // Emergency fund: months of expenses covered by liquid assets (assume 30% is liquid)
  const liquidAssets = totalAssets * 0.3
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const emergency = Math.min(25, Math.round((emergencyMonths / 6) * 25))

  // Diversification: simple heuristic (better with actual asset types, but works from totals)
  const assetToDebtRatio = totalDebts > 0 ? totalAssets / totalDebts : totalAssets > 0 ? 10 : 0
  const diversification = Math.min(25, Math.round(Math.min(assetToDebtRatio / 3, 1) * 25))

  // Debt ratio: debt as % of assets
  const debtPct = totalAssets > 0 ? totalDebts / totalAssets : 1
  const debtScore = Math.min(25, Math.round((1 - Math.min(debtPct, 1)) * 25))

  // Savings rate
  const sr = monthlyIncome > 0 ? monthlySavings / monthlyIncome : 0
  const savingsScore = Math.min(25, Math.round(Math.min(sr / 0.30, 1) * 25))

  const total = emergency + diversification + debtScore + savingsScore

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
