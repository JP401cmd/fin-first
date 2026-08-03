// ── Deterministische standaardwaarden voor de lokale vrije-tekst-extractie ────
//
// De cloud-prompt (lib/ai/extraction-system-prompt.ts, sectie STANDAARDWAARDEN)
// laat het model zélf rendementen, rentes en aflossingen invullen. Voor een
// groot model is dat een tabel napraten; voor Gemma 4 E2B on-device is het twee
// keer verkeerd:
//
//  1. BUDGET. Die sectie is ~25 regels tabel en heuristiek. In een venster van
//     8192 tokens dat systeemprompt + vrije tekst + antwoord samen moeten delen,
//     is dat ruimte die de vrije tekst zelf nodig heeft.
//  2. REKENFOUTEN. "schat op basis van annuïteit 30 jaar" is een sóm. Een
//     2B-model dat een annuïteit uit het hoofd doet, levert een getal dat er
//     plausibel uitziet en niet klopt — precies de klasse fouten die de
//     codebase elders met "consume, don't recompute" verbiedt.
//
// Daarom is de taak hersneden: het model levert alleen wat er ECHT in de tekst
// staat ({name, asset_type, bedrag} resp. {event_type, target_age}); alle
// afgeleide velden komen hier deterministisch vandaan. Zelfde uitkomst, halve
// prompt, nul verzonnen euro's.
//
// BRON VAN DE GETALLEN. De rendementen en rentes zijn LETTERLIJK overgenomen uit
// de STANDAARDWAARDEN-sectie van de cloud-prompt — dat is de bestaande, door de
// eigenaar vastgestelde norm, en cloud/lokaal moeten dezelfde uitkomst geven.
// De levensgebeurtenis-defaults komen NIET uit die prompt maar uit
// `LIFE_EVENT_CATALOG` (lib/horizon/life-events-catalog.ts): dat is de canonieke
// bron die het formulier op /toekomst óók gebruikt. Zou de prompt-tabel hier
// overgetypt worden, dan hadden we een tweede waarheid over wat een kind kost.
//
// De wóórding van de prompt blijft eigendom van `ai-specialist-prompt-dna`; dit
// bestand bezit alleen de getallen die uit die prompt zijn WEGGEHAALD.

import { LIFE_EVENT_CATALOG } from '@/lib/horizon/life-events-catalog'
import type {
  ExtractionAsset,
  ExtractionAssetType,
  ExtractionDebt,
  ExtractionDebtType,
  ExtractionLifeEvent,
} from '@/lib/ai/extraction-schema'

// ── Bezittingen ─────────────────────────────────────────────────────────────

/** Verwacht jaarrendement in % per bezittingstype (cloud-prompt r25-28). */
export const ASSET_EXPECTED_RETURN: Record<ExtractionAssetType, number> = {
  cash: 0,
  savings: 2.5,
  investment: 7,
  retirement: 6,
  eigen_huis: 3.5,
  real_estate: 3.5,
  crypto: 0,
  vehicle: -15,
  physical: 0,
  other: 0,
}

/**
 * Liquiditeit per type (cloud-prompt, sectie ASSET TYPES).
 *
 * `other` staat bewust op `false` terwijl de prompt er niets over zegt: liquide
 * vermogen telt mee in de FIRE-portefeuille, dus een fout naar bóven maakt
 * iemands vrijheidsdatum te rooskleurig. Onbekend → niet meetellen.
 */
export const ASSET_IS_LIQUID: Record<ExtractionAssetType, boolean> = {
  cash: true,
  savings: true,
  investment: true,
  retirement: false,
  eigen_huis: false,
  real_estate: false,
  crypto: true,
  vehicle: false,
  physical: false,
  other: false,
}

/** Subtype-default; alleen gezet waar de cloud-prompt er één noemt. */
export const ASSET_SUBTYPE: Partial<Record<ExtractionAssetType, string>> = {
  cash: 'checking',
  savings: 'savings_account',
}

// ── Schulden ────────────────────────────────────────────────────────────────

/** Jaarrente in % per schuldtype (cloud-prompt r30-33). */
export const DEBT_INTEREST_RATE: Record<ExtractionDebtType, number> = {
  mortgage: 4.0,
  personal_loan: 6.5,
  // DUO nieuw stelsel 2024/2025.
  student_loan: 0.46,
  car_loan: 5.5,
  credit_card: 14.0,
  revolving_credit: 10.0,
  payment_plan: 4.0,
  belastingschuld: 4.0,
  familielening: 2.0,
  other: 5.0,
}

/**
 * Fiscale aftrekbaarheid van de rente. Alleen de eigenwoningschuld is aftrekbaar;
 * `other` blijft `null` omdat we het bij een onbekend schuldtype simpelweg niet
 * weten — en `false` beweren is ook een bewering.
 */
export const DEBT_TAX_DEDUCTIBLE: Record<ExtractionDebtType, boolean | null> = {
  mortgage: true,
  personal_loan: false,
  student_loan: false,
  car_loan: false,
  credit_card: false,
  revolving_credit: false,
  payment_plan: false,
  belastingschuld: false,
  familielening: false,
  other: null,
}

/** Subtype-default; alleen waar de cloud-prompt er één voorschrijft. */
export const DEBT_SUBTYPE: Partial<Record<ExtractionDebtType, string>> = {
  mortgage: 'annuiteit',
  student_loan: 'nieuw_stelsel',
}

/**
 * Standaard-looptijd in maanden waarover we de aflossing annuïtair uitrekenen.
 *
 * De cloud-prompt noemt alleen hypotheek (30 jaar) en persoonlijke lening (60
 * maanden) expliciet. De overige termijnen zijn hier vastgelegd omdat een
 * `monthly_payment` van 0 óók een bewering is: in de projectie wordt zo'n schuld
 * dan nooit afgelost. Alles is en blijft een startwaarde die de gebruiker in de
 * review-stap kan bijstellen.
 *
 * `credit_card` en `revolving_credit` ontbreken bewust — die kennen geen
 * looptijd maar een minimumtermijn als percentage van het saldo (zie
 * {@link REVOLVING_MIN_PAYMENT_PCT}). `student_loan` ontbreekt omdat de
 * DUO-aflossing draagkracht-afhankelijk is: zonder inkomen is 0 het eerlijke
 * antwoord, precies zoals de cloud-prompt voorschrijft.
 */
export const DEBT_TERM_MONTHS: Partial<Record<ExtractionDebtType, number>> = {
  mortgage: 360,
  personal_loan: 60,
  car_loan: 60,
  payment_plan: 24,
  belastingschuld: 24,
  familielening: 120,
  other: 60,
}

/** Minimale maandtermijn als fractie van het saldo (creditcard/doorlopend krediet). */
export const REVOLVING_MIN_PAYMENT_PCT = 0.02

/**
 * Annuïtaire maandtermijn: `P · r / (1 − (1+r)^−n)`, met r de maandrente.
 * Bij een rente van (vrijwel) nul valt de formule terug op lineair — anders
 * deelt hij door nul.
 */
export function annuityMonthlyPayment(balance: number, annualRatePct: number, months: number): number {
  if (!(balance > 0) || !(months > 0)) return 0
  const r = annualRatePct / 100 / 12
  if (Math.abs(r) < 1e-9) return balance / months
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

/**
 * Deterministische maandaflossing per schuldtype. Vervangt de heuristiek-regels
 * uit de cloud-prompt ("schat op basis van annuïteit 30 jaar", "minimaal 2% van
 * saldo", "saldo / 60 maanden") door de som zelf.
 */
export function defaultMonthlyPayment(debtType: ExtractionDebtType, balance: number): number {
  if (!(balance > 0)) return 0

  // DUO: aflossing volgt de draagkracht, niet het saldo. Zonder bekend inkomen
  // is 0 het eerlijke antwoord (cloud-prompt: "€0 als inkomen onbekend").
  if (debtType === 'student_loan') return 0

  if (debtType === 'credit_card' || debtType === 'revolving_credit') {
    return Math.round(balance * REVOLVING_MIN_PAYMENT_PCT)
  }

  const months = DEBT_TERM_MONTHS[debtType]
  if (!months) return 0
  return Math.round(annuityMonthlyPayment(balance, DEBT_INTEREST_RATE[debtType], months))
}

// ── Samenstellers: model-minimum → volledig schema-item ─────────────────────

/** Wat het model per bezitting mag leveren — verder niets. */
export interface AssetDraft {
  name: string
  asset_type: ExtractionAssetType
  estimated_value: number
}

/** Wat het model per schuld mag leveren — verder niets. */
export interface DebtDraft {
  name: string
  debt_type: ExtractionDebtType
  estimated_balance: number
}

/** Vul een bezitting deterministisch aan tot een volledig schema-item. */
export function completeAsset(draft: AssetDraft): ExtractionAsset {
  return {
    name: draft.name,
    asset_type: draft.asset_type,
    estimated_value: draft.estimated_value,
    expected_return: ASSET_EXPECTED_RETURN[draft.asset_type],
    // Maandelijkse inleg is geen afleidbare grootheid: die staat er wél of niet.
    // Het model levert 'm niet, dus 0 — de gebruiker vult 'm aan in de review.
    monthly_contribution: 0,
    is_liquid: ASSET_IS_LIQUID[draft.asset_type],
    subtype: ASSET_SUBTYPE[draft.asset_type] ?? null,
  }
}

/** Vul een schuld deterministisch aan tot een volledig schema-item. */
export function completeDebt(draft: DebtDraft): ExtractionDebt {
  return {
    name: draft.name,
    debt_type: draft.debt_type,
    estimated_balance: draft.estimated_balance,
    interest_rate: DEBT_INTEREST_RATE[draft.debt_type],
    monthly_payment: defaultMonthlyPayment(draft.debt_type, draft.estimated_balance),
    is_tax_deductible: DEBT_TAX_DEDUCTIBLE[draft.debt_type],
    subtype: DEBT_SUBTYPE[draft.debt_type] ?? null,
  }
}

// ── Levensgebeurtenissen ────────────────────────────────────────────────────
//
// De gesloten soortenlijst is die van `LIFE_EVENT_CATALOG` — niet de losse
// slugs uit de cloud-prompt ('huis_kopen', 'kind', 'pensioen'). Reden: de
// catalogus is de bron van de bedragen, dus elke soort die er niet in staat
// levert per definitie een gebeurtenis zonder cijfers. `custom` valt om dezelfde
// reden af (alle defaults 0). Dit spiegelt de keuze in local-whatif-prompt.ts.

export const LOCAL_EXTRACTION_EVENT_TYPES = [
  'children',
  'house_purchase',
  'house_sale',
  'wedding',
  'move',
  'renovation',
  'study',
  'career_change',
  'part_time',
  'sabbatical',
  'world_trip',
  'early_retirement',
  'pension',
  'aow',
  'car_purchase',
  'camper_purchase',
  'holiday_home_purchase',
  'inheritance',
  'side_hustle',
  'werkloosheid',
  'scheiding',
  'schenking',
] as const

export type LocalExtractionEventType = (typeof LOCAL_EXTRACTION_EVENT_TYPES)[number]

export const LOCAL_EXTRACTION_EVENT_TYPE_SET: ReadonlySet<string> = new Set(LOCAL_EXTRACTION_EVENT_TYPES)

/**
 * Synoniemenkaart voor de slugs die de HUIDIGE cloud-prompt aan het model leert
 * ('huis_kopen', 'kind', 'trouwen', …). Een lokaal model dat op die woorden
 * getraind-of-geïnstrueerd raakt, mag niet stuklopen op een naamsverschil dat
 * puur historisch is. Alles wat hier niet in staat en niet in de catalogus zit,
 * vervalt — een gebeurtenis zonder bedragen is ruis.
 */
export const EVENT_TYPE_ALIASES: Record<string, LocalExtractionEventType> = {
  kind: 'children',
  kinderen: 'children',
  child: 'children',
  huis_kopen: 'house_purchase',
  huis_verkopen: 'house_sale',
  trouwen: 'wedding',
  verhuizen: 'move',
  verbouwing: 'renovation',
  studie: 'study',
  pensioen: 'early_retirement',
  vervroegd_pensioen: 'early_retirement',
  parttime: 'part_time',
  wereldreis: 'world_trip',
  erfenis: 'inheritance',
  auto_kopen: 'car_purchase',
  ontslag: 'werkloosheid',
  bijverdienste: 'side_hustle',
}

/** Normaliseer een door het model geleverde soort naar een catalogus-sleutel. */
export function normalizeEventType(raw: unknown): LocalExtractionEventType | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (LOCAL_EXTRACTION_EVENT_TYPE_SET.has(key)) return key as LocalExtractionEventType
  return EVENT_TYPE_ALIASES[key] ?? null
}

/** Wat het model per levensgebeurtenis mag leveren — verder niets. */
export interface LifeEventDraft {
  event_type: LocalExtractionEventType
  target_age: number | null
}

/**
 * Vul een levensgebeurtenis deterministisch aan met de CANONIEKE
 * catalogus-waarden. Geen enkel bedrag komt van het model.
 *
 * Tekenafspraak: de catalogus draagt de tekens al zoals het extractie-schema ze
 * verwacht (`defaultMonthlyIncome: -3000` bij sabbatical = inkomensverlies;
 * `defaultCost: -50000` bij erfenis = instroom). Eén-op-één overnemen dus, geen
 * eigen omkering — die zou stilzwijgend afwijken van /toekomst.
 *
 * Geeft `null` wanneer de soort geen enkel bedrag oplevert: een gebeurtenis
 * zonder effect is ruis in een tijdlijn die over effect gaat.
 */
export function completeLifeEvent(draft: LifeEventDraft): ExtractionLifeEvent | null {
  const entry = LIFE_EVENT_CATALOG[draft.event_type]
  if (!entry) return null

  const oneTime = Math.round(entry.defaultCost)
  const monthlyCost = Math.round(entry.defaultMonthlyCost)
  const monthlyIncome = Math.round(entry.defaultMonthlyIncome)
  if (oneTime === 0 && monthlyCost === 0 && monthlyIncome === 0) return null

  // Leeftijd: het model mag 'm noemen (die staat in de tekst — "als ik 60 ben");
  // ontbreekt hij, dan valt de catalogus-default in (aow/pension dragen die).
  const age =
    draft.target_age != null && Number.isFinite(draft.target_age)
      ? Math.round(draft.target_age)
      : (entry.defaultAge ?? null)

  return {
    name: entry.label,
    event_type: draft.event_type,
    target_age: age,
    description: entry.description,
    one_time_cost: oneTime,
    monthly_cost_change: monthlyCost,
    monthly_income_change: monthlyIncome,
    duration_months: Math.round(entry.defaultDuration),
    // Het icoon komt uit dezelfde catalogus-rij; lib/event-icon.ts resolvet die
    // Lucide-naam naar een component. Het model raakt dit veld niet aan.
    icon: entry.icon,
  }
}
