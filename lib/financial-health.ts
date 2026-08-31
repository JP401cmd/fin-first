/**
 * Financial Health Score — v2: vier gedragspijlers, 7 actieve indicatoren (0–100)
 *
 * Herstructurering van de v1 7-vlakke-pijler-score (ADR 0010). De score is nu
 * gegroepeerd in vier gedragspijlers met basisgewichten (som 0.95 → herverdeeld
 * naar 1.0 via getRedistributedWeightForSet):
 *
 *   Rondkomen (35%) — Spaarquote 0.20 · Budgetdiscipline 0.10
 *   Buffer    (20%) — Noodfonds 0.20
 *   Schuld    (20%) — DSTI (schuldenlast/inkomen) 0.12 · Schuldratio 0.08
 *   Vrijheid  (25%) — FIRE-voortgang 0.18 · Vermogensconcentratie 0.07
 *
 * `tax_optimization` en `diversification` zijn uit de score verwijderd (ADR 0010):
 * geen toonaangevend framework gebruikt ze als gezondheidsindicator, en ze
 * draaiden vaak op een neutrale dummy. De helpers (scoreTaxOptimization,
 * buildTaxData, computeAssetTypeCount) blijven bestaan voor educatieve
 * "kans"-inzichten buiten de score; ze voeden geen pijler meer.
 *
 * No-data-beleid (ADR 0010, FR-5/6): een indicator zonder betekenisvolle data is
 * inactief — het gewicht wordt proportioneel herverdeeld via
 * getRedistributedWeightForSet. Geen neutrale dummies (50/70) meer. Alle 7
 * inactief → total 0, label 'Kritiek', zonder divide-by-zero.
 */

import type { DashboardData } from '@/lib/types/dashboard'
import type { ModuleId } from '@/lib/module-registry'
import { TARGET_EMERGENCY_SALARY_MONTHS, emergencyScoreTargetMonths } from '@/lib/emergency-fund'
import { budgetLimitStatus } from '@/lib/budget-alerts'
import { DEFAULT_RETURN } from '@/lib/constants'
import { firePeerAgeForAge, FIRE_PEER_CURVE_START_AGE } from '@/lib/benchmark/fire-peer-lat'

// ── Lightweight input for server-side / snapshot usage ───────
// Allows computing the health score without a full DashboardData bundle.

export interface HealthScoreInput {
  savingsRate6m: number
  totalAssets: number
  totalDebts: number
  /**
   * Buffer-dekking in maanden op de NORM-grondslag: liquide pot ÷ netto
   * maandsalaris (of ÷ maanduitgaven wanneer er geen salaris bekend is).
   */
  emergencyFundMonths: number
  /**
   * Norm voor de noodbuffer in maanden: 3 op de salaris-grondslag, 6 op de
   * uitgaven-terugval. Komt uit `emergencyTargetBasis` — altijd dezelfde
   * grondslag als `emergencyFundMonths`. Afwezig → 3.
   */
  emergencyTargetMonths?: number
  freedomPct: number
  /**
   * Leeftijd van de gebruiker (jaren, fractioneel toegestaan). Maakt de
   * fire_progress-pijler PEER-RELATIEF (koers + voortgang-op-leeftijd t.o.v.
   * de FIRE-nastrevers-lat, lib/benchmark/fire-peer-lat.ts). `null` →
   * de pijler valt terug op de leeftijdsblinde freedomPct-score.
   * VERPLICHT (geen `?`): een vergeten veld hoort een compile-fout te zijn,
   * niet een stil legacy-pad (review M1).
   */
  currentAge: number | null
  /**
   * FIRE-leeftijd uit de canonieke projectie van het eigen pad (kernel-run,
   * scalar-FIRE of snapshot-terugval) — consume, don't recompute. `null` =
   * geen haalbare FIRE-leeftijd bekend: dan telt alleen het
   * voortgang-op-leeftijd-signaal. VERPLICHT (geen `?`), zie currentAge.
   */
  fireAgeFractional: number | null
  /**
   * Netto maandinkomen — dezelfde canonieke inkomensbron die `savingsRate6m`
   * voedt (income6m/6 resp. effectiveMonthlyIncome). Noemer van de DSTI-pijler.
   */
  netMonthlyIncome: number
  /** Σ maandlasten (monthly_payment) van actieve schulden. Teller DSTI. */
  debtMonthlyPayments: number
  /**
   * Grootste asset_type als fractie (0–1) van het totaal excl. eigen woning, of
   * `null` wanneer de concentratie-pijler inactief is (starter: grootste type
   * < €10.000, of geen vermogen). Vooraf berekend via
   * `computeLargestAssetTypeShare`.
   */
  largestAssetTypeShare: number | null
  /** Budget categories with limit/spent; empty array if no budgets */
  budgetCategories: { limit: number; spent: number }[]
  /**
   * @deprecated Voedt sinds v2 geen pijler meer (ADR 0010). Blijft als optioneel
   * backward-compat-veld voor het educatieve Box 3-"kans"-inzicht.
   */
  assetTypeCount?: number
  /**
   * @deprecated Voedt sinds v2 geen pijler meer (ADR 0010). Blijft als optioneel
   * backward-compat-veld; gebruikt door het educatieve Box 3-"kans"-inzicht in
   * de kassabon-receipt, buiten de score.
   */
  taxData?: {
    box3Bezittingen: number       // spaargeld + beleggingen
    box3Tax: number               // jaarlijkse Box 3-heffing
    heffingsvrijVermogen: number  // vrijstelling single/partner
    rendementsgrondslag: number   // belastbare grondslag na vrijstelling
  } | null
}

// ── Types ────────────────────────────────────────────────────

/** De vier gedragspijler-groepen waarin de 7 indicatoren vallen (ADR 0010). */
export type PillarGroup = 'rondkomen' | 'buffer' | 'schuld' | 'vrijheid'

export interface HealthPillar {
  id: string
  name: string
  score: number        // 0–100
  weight: number       // 0–1 (herverdeeld binnen de actieve set)
  explanation: string  // what this pillar measures
  improvementTip: string
  /** Link to the page where the user can act on this tip */
  actionHref: string
  /** Short CTA label for the action link (e.g. "Budget instellen") */
  actionLabel: string
  rawValue: string     // human-readable current value
  /** Gedragspijler-groep waartoe deze indicator behoort (ADR 0010, additief). */
  pillarGroup?: PillarGroup
  /** Leesbare groepslabel ("Rondkomen", "Buffer", "Schuld", "Vrijheid"). */
  groupLabel?: string
}

export interface HealthScore {
  total: number        // 0–100 weighted average
  label: string        // Uitstekend / Sterk / Redelijk / Kwetsbaar / Kritiek
  pillars: HealthPillar[]
  previousMonth: number | null  // total score for previous month (null if insufficient data)
  trend: number        // delta vs previous month (positive = improving)
  /** Number of active pillars/indicators included in the score */
  activePillarCount: number
  /** Whether budget discipline is included in the score */
  budgetingActive: boolean
}

// ── Pillar group metadata ────────────────────────────────────

const PILLAR_GROUP_LABELS: Record<PillarGroup, string> = {
  rondkomen: 'Rondkomen',
  buffer: 'Buffer',
  schuld: 'Schuld',
  vrijheid: 'Vrijheid',
}

/** Gedragspijler-groep per indicator-id (ADR 0010 / FR-1). */
const PILLAR_GROUP: Record<string, PillarGroup> = {
  savings_rate: 'rondkomen',
  budget_discipline: 'rondkomen',
  emergency_fund: 'buffer',
  debt_service_ratio: 'schuld',
  debt_ratio: 'schuld',
  fire_progress: 'vrijheid',
  asset_concentration: 'vrijheid',
}

// ── Pillar action mapping ────────────────────────────────────
// Elke pijler krijgt een verb-first "doe"-CTA (geen passief "X bekijken")
// die de gebruiker van inzicht → naar de hefboom-pagina brengt waar de
// daad plaatsvindt. Sluit aan op de vrijheids-loop (zie tips-lijst).

const PILLAR_ACTION: Record<string, { href: string; label: string }> = {
  savings_rate:       { href: '/overzicht/cashflow',    label: 'Verhoog je spaarquote' },
  budget_discipline:  { href: '/overzicht/cashflow',    label: 'Stel je budget bij' },
  emergency_fund:     { href: '/toekomst/doelen',       label: 'Stel je noodfondsdoel' },
  debt_service_ratio: { href: '/overzicht/schulden',    label: 'Verlaag je maandlasten' },
  debt_ratio:         { href: '/overzicht/schulden',    label: 'Versnel je aflossing' },
  fire_progress:      { href: '/toekomst',              label: 'Versnel je vrijheid' },
  asset_concentration:{ href: '/overzicht/bezittingen', label: 'Spreid je vermogen' },
}

// ── Score curves ─────────────────────────────────────────────

/** Spaarquote: 30%+ = 100, 20% = 80, 10% = 50, 0% = 0 */
function scoreSavingsRate(ratePercent: number): number {
  if (ratePercent <= 0) return 0
  if (ratePercent >= 30) return 100
  // Piecewise linear: 0→0, 10→50, 20→80, 30→100
  if (ratePercent <= 10) return Math.round((ratePercent / 10) * 50)
  if (ratePercent <= 20) return Math.round(50 + ((ratePercent - 10) / 10) * 30)
  return Math.round(80 + ((ratePercent - 20) / 10) * 20)
}

/**
 * Schuldratio als percentage (schuld / totaal vermogen × 100). Canonieke bron
 * voor het schuld-aandeel-getal; consumenten (health-score, widgets) ronden of
 * clampen zelf naar behoefte. Geen vermogen → 100% als er schuld is, anders 0%.
 */
export function debtRatioPercent(totalAssets: number, totalDebts: number): number {
  if (totalAssets > 0) return (totalDebts / totalAssets) * 100
  return totalDebts > 0 ? 100 : 0
}

/** Schuldratio: debt-to-asset ratio. 0% = 100, 50% = 50, 100%+ = 0 */
function scoreDebtRatio(totalAssets: number, totalDebts: number): number {
  if (totalAssets <= 0) return totalDebts > 0 ? 0 : 50 // no assets no debts = neutral
  const ratio = totalDebts / totalAssets
  if (ratio <= 0) return 100
  if (ratio >= 1) return 0
  return Math.round((1 - ratio) * 100)
}

/**
 * DSTI — Debt-Service-To-Income (FR-2.2). Maandlasten op schulden als % van het
 * netto maandinkomen. FHN/Nibud-drempels:
 *   ≤20%  → 100
 *   20–36% lineair 100 → 70
 *   36–43% lineair  70 → 40
 *   43–60% lineair  40 →  0
 *   ≥60%  → 0
 *
 * Pure curve op het reeds berekende DSTI-percentage. De activatie-logica (geen
 * schulden → actief 100; schulden zonder inkomen → inactief) zit in de
 * pijler-assemblage, niet hier.
 */
export function scoreDSTI(dstiPercent: number): number {
  if (dstiPercent <= 20) return 100
  if (dstiPercent >= 60) return 0
  if (dstiPercent <= 36) return Math.round(100 - ((dstiPercent - 20) / 16) * 30) // 100 → 70
  if (dstiPercent <= 43) return Math.round(70 - ((dstiPercent - 36) / 7) * 30)   // 70 → 40
  return Math.round(40 - ((dstiPercent - 43) / 17) * 40)                          // 40 → 0
}

/**
 * Noodfonds-dekking geschaald tegen de norm. Vorm: 100 bij monthsCovered ≥
 * target, ~60 bij target/2, 0 bij 0. Op de salaris-norm (3) betekent dat:
 * 3 maandsalarissen → 100, 1,5 → 60, 0 → 0.
 *
 * ANTI-GAMING: de curve gebruikt `emergencyScoreTargetMonths(targetMonths)`, die
 * de target op MIN_EMERGENCY_SCORE_TARGET_MONTHS (3) floort en op
 * MAX_EMERGENCY_DISPLAY_TARGET_MONTHS (24) plafonneert. Sinds de norm zelf 3 is,
 * is de vloer een no-op op het salaris-pad; hij blijft de uitgaven-terugval en
 * eventuele toekomstige gebruikerskeuzes begrenzen.
 */
function scoreEmergencyFund(
  monthsCovered: number,
  targetMonths: number = TARGET_EMERGENCY_SALARY_MONTHS,
): number {
  if (monthsCovered <= 0) return 0
  const target = emergencyScoreTargetMonths(targetMonths)
  if (monthsCovered >= target) return 100
  const half = target / 2
  // Piecewise linear: 0→0, half→60, target→100.
  if (monthsCovered <= half) return Math.round((monthsCovered / half) * 60)
  return Math.round(60 + ((monthsCovered - half) / (target - half)) * 40)
}

/**
 * FIRE-voortgang, leeftijdsblind: freedomPct (0–100+), cap op 100. Sinds de
 * peer-relatieve score alleen nog de TERUGVAL voor aanroepers zonder leeftijd
 * (oude snapshots, mocks, de referentie-peer vóór zijn eigen leeftijd bekend is).
 */
function scoreFireProgress(freedomPct: number): number {
  return Math.max(0, Math.min(Math.round(freedomPct), 100))
}

/**
 * FIRE-voortgang, PEER-RELATIEF (eigenaar-akkoord 31 aug 2026). Twee signalen
 * tegen de FIRE-nastrevers-lat (lib/benchmark/fire-peer-lat.ts):
 *
 *   A — koers (60%): haalt de kernel-projectie de peer-FIRE-leeftijd?
 *       delta = peerFireAge − fireAgeFractional (jaren vóór)
 *       scoreA = clamp(70 + 6·delta, 0, 100)  → op de lat = 70, 5 jr eerder = 100
 *   B — voortgang-op-leeftijd (40%): ligt freedomPct op de samengestelde
 *       opbouwcurve die bij de peer-lat hoort?
 *       verwachtPct(lft) = 100·((1+r)^(lft−25) − 1)/((1+r)^(peer−25) − 1)
 *       met r = DEFAULT_RETURN — precies op de curve = 75.
 *
 * FIRE onhaalbaar/onbekend (fireAgeFractional null) → alleen B. Geen leeftijd →
 * legacy leeftijdsblinde score. freedomPct ≥ 100 → 100, ongeacht de koers.
 * Waarom: de leeftijdsblinde score las een 30-jarige óp schema als "zwak" en
 * kan een 55-jarige mét achterstand geruststellen — de vraag is niet "hoe vol
 * is de pot" maar "gaat je koers de lat van je leeftijdsgenoten halen".
 */
export function scoreFireProgressVsPeers(
  input: Pick<HealthScoreInput, 'freedomPct' | 'currentAge' | 'fireAgeFractional'>,
): number {
  const { freedomPct } = input
  const age = input.currentAge
  if (age == null || !Number.isFinite(age)) return scoreFireProgress(freedomPct)
  if (freedomPct >= 100) return 100

  const peerAge = firePeerAgeForAge(age)

  // Signaal B — voortgang-op-leeftijd. Vloer op 1% zodat een prille twintiger
  // met íets opbouw niet door een ~0-noemer schiet.
  const growth = (a: number) =>
    Math.pow(1 + DEFAULT_RETURN, Math.max(0, a - FIRE_PEER_CURVE_START_AGE)) - 1
  const peerGrowth = growth(peerAge)
  const expectedPct = peerGrowth > 0
    ? Math.max(1, Math.min(100, (growth(Math.min(age, peerAge)) / peerGrowth) * 100))
    : 100
  const scoreB = Math.max(0, Math.min(Math.round((75 * Math.max(0, freedomPct)) / expectedPct), 100))

  // Signaal A — koers t.o.v. de peer-lat; zonder haalbare FIRE telt alleen B.
  const fireAge = input.fireAgeFractional
  if (fireAge == null || !Number.isFinite(fireAge)) return scoreB
  const scoreA = Math.max(0, Math.min(Math.round(70 + 6 * (peerAge - fireAge)), 100))

  return Math.round(0.6 * scoreA + 0.4 * scoreB)
}

/**
 * Vermogensconcentratie (FR-3.2). Grootste asset_type als % van het totaal
 * vermogen excl. eigen woning. Lager (beter gespreid) = hogere score.
 *   ≤40%  → 100
 *   40–70% lineair 100 → 40
 *   70–90% lineair  40 →  0
 *   ≥90%  → 0
 *
 * @param sharePercent grootste-type-aandeel in procenten (0–100).
 */
export function scoreAssetConcentration(sharePercent: number): number {
  if (sharePercent <= 40) return 100
  if (sharePercent >= 90) return 0
  if (sharePercent <= 70) return Math.round(100 - ((sharePercent - 40) / 30) * 60) // 100 → 40
  return Math.round(40 - ((sharePercent - 70) / 20) * 40)                          // 40 → 0
}

/**
 * @deprecated Voedt sinds v2 geen pijler meer (ADR 0010). Blijft als helper voor
 * het educatieve "diversificatie"-inzicht, buiten de score.
 * Portefeuille-diversificatie: number of distinct asset types.
 *  1 type = 20, 2 = 40, 3 = 60, 4 = 80, 5+ = 100
 */
export function scoreDiversification(assetTypeCount: number): number {
  if (assetTypeCount <= 0) return 0
  if (assetTypeCount >= 5) return 100
  return Math.round((assetTypeCount / 5) * 100)
}

/**
 * @deprecated Voedt sinds v2 geen pijler meer (ADR 0010). Blijft als helper voor
 * het educatieve Box 3-"kans"-inzicht in de kassabon-receipt, buiten de score.
 *
 * Tax-optimalisatie-score (Box 3-context). Hybride benadering:
 *  - Geen Box 3-bezit (<€1.000) → neutraal 50
 *  - Anders: blend van vrijstellingsbenutting (40%) + tax-drag (40%) +
 *    allocatie-hygiene (20%).
 */
export function scoreTaxOptimization(
  taxData?: HealthScoreInput['taxData'],
): number {
  if (!taxData || taxData.box3Bezittingen < 1_000) return 50

  // Vrijstellingsbenutting: rendementsgrondslag / heffingsvrijVermogen.
  // Onder 80% → punten naar rato; boven 80% → 100.
  const vrijstellingPct = taxData.heffingsvrijVermogen > 0
    ? Math.min(1, taxData.rendementsgrondslag / taxData.heffingsvrijVermogen)
    : 0
  const vrijstellingScore = vrijstellingPct >= 0.8 ? 100 : Math.round(vrijstellingPct * 125)

  // Tax-drag: tax / bezittingen. <0.5% = 100, >2% = 0, lineair tussen.
  const drag = taxData.box3Bezittingen > 0 ? taxData.box3Tax / taxData.box3Bezittingen : 0
  const dragScore = drag <= 0.005
    ? 100
    : drag >= 0.02
    ? 0
    : Math.round((1 - (drag - 0.005) / 0.015) * 100)

  // Allocatie-hygiene: placeholder (geen partner-allocation-data nu beschikbaar).
  const allocScore = 100

  return Math.round(vrijstellingScore * 0.4 + dragScore * 0.4 + allocScore * 0.2)
}

/**
 * Telt de budget-discipline: hoeveel van de ACTIEVE categorieën (limiet > 0)
 * bleven binnen hun limiet?
 *
 * Sinds bevinding H4 (eigenaar-besluit 26 aug 2026) levert
 * `buildBudgetCategories` één entry per INDIVIDUELE categorie in plaats van
 * drie type-sommen — de teller is dus letterlijk het getal dat de omschrijving
 * belooft, en dezelfde populatie die de uitgaven-heatmap kleurt.
 *
 * De grensvergelijking loopt via de canonieke `budgetLimitStatus`
 * (lib/budget-alerts.ts): exact-op-de-limiet is `'bereikt'`, géén
 * overschrijding. Zonder die cent-tolerantie zou een vaste last waarvan de
 * limiet per constructie gelijk is aan de afschrijving (lib/budget-plan-diff.ts)
 * elke maand op float-ruis (1280.0000000000002 > 1280) als overschrijding
 * tellen — bevinding H16, dezelfde valkuil.
 */
function budgetDisciplineTally(
  budgetCategories: { limit: number; spent: number }[],
): { active: number; within: number } {
  const active = budgetCategories.filter(c => c.limit > 0)
  return {
    active: active.length,
    within: active.filter(c => budgetLimitStatus(c.spent, c.limit) !== 'over').length,
  }
}

/** Budget-discipline: % of individual budget categories within their limit. */
function scoreBudgetDiscipline(budgetCategories: { limit: number; spent: number }[]): number {
  const { active, within } = budgetDisciplineTally(budgetCategories)
  if (active === 0) return 0 // caller treats no-budget as inactive (FR-5)
  return Math.round((within / active) * 100)
}

// ── Label ────────────────────────────────────────────────────

function getLabel(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

// ── Weight redistribution ────────────────────────────────────

/**
 * Basisgewichten voor de 7 v2-indicatoren (som 0.95, ADR 0010 / FR-1). De som
 * < 1.0 wordt door getRedistributedWeightForSet() automatisch geschaald naar
 * 1.0 over de ACTIEVE set; inactieve indicatoren (no-data) vallen weg en hun
 * gewicht wordt proportioneel herverdeeld.
 */
const BASE_WEIGHTS: Record<string, number> = {
  // Rondkomen (0.30)
  savings_rate: 0.20,
  // GEWICHT OPNIEUW GETOETST bij H4 (26 aug 2026) en BEWUST op 0.10 gelaten.
  // De pijler ging van drie type-sommen naar één entry per categorie. Dat maakt
  // 'm fijner (bij ~33 categorieën verschuift één overschrijding de pijler ~3pp
  // i.p.v. 33pp), niet zwaarder: hij meet nog steeds hetzelfde gedrag, alleen
  // zonder de weg-middeling. Verhogen zou de score-herweging van ADR 0010
  // openbreken zonder dat de indicator méér is gaan zeggen; verlagen zou de
  // enige per-categorie-signalering in de score verder verdunnen.
  // LET OP (bekende beperking, niet in deze kaart opgelost): een categorie met
  // een limiet maar zonder besteding telt als "binnen de limiet". Veel ongebruikte
  // categorieën tillen de pijler dus omhoog. Zie de kaartnotitie H4 punt 3.
  budget_discipline: 0.10,
  // Buffer (0.20)
  emergency_fund: 0.20,
  // Schuld (0.20)
  debt_service_ratio: 0.12,
  debt_ratio: 0.08,
  // Vrijheid (0.25)
  fire_progress: 0.18,
  asset_concentration: 0.07,
}

/**
 * Maps health score pillars to the module that must be active for them to be included.
 * Pillars mapped to `null` are always computed (foundation data, no module required).
 */
const PILLAR_MODULE_REQUIREMENTS: Record<string, ModuleId | null> = {
  savings_rate: 'budgetteren',
  budget_discipline: 'budgetteren',
  emergency_fund: null,          // Always available — core financial health indicator
  debt_service_ratio: 'vermogensregistratie',
  debt_ratio: 'vermogensregistratie',
  fire_progress: 'toekomstplannen',
  asset_concentration: 'vermogensregistratie',
}

/**
 * Determine which pillar IDs are active given a set of active modules.
 * Pillars with `null` requirement are always included.
 * When no `activeModules` array is provided, all pillars are included.
 */
function getActivePillarIds(activeModules?: ModuleId[]): Set<string> {
  if (!activeModules) {
    // Backward-compat: all pillars active
    return new Set(Object.keys(PILLAR_MODULE_REQUIREMENTS))
  }
  const active = new Set<string>()
  for (const [pillarId, requiredModule] of Object.entries(PILLAR_MODULE_REQUIREMENTS)) {
    if (requiredModule === null || activeModules.includes(requiredModule)) {
      active.add(pillarId)
    }
  }
  return active
}

/**
 * Compute redistributed weight for a pillar given the set of active pillar IDs.
 * Active pillar weights are scaled proportionally so they sum to 1.0.
 * Returns 0 for pillars not in the active set (or when the active set is empty).
 */
function getRedistributedWeightForSet(pillarId: string, activePillarIds: Set<string>): number {
  if (!activePillarIds.has(pillarId)) return 0
  const totalActiveWeight = Array.from(activePillarIds).reduce(
    (sum, id) => sum + (BASE_WEIGHTS[id] ?? 0),
    0,
  )
  if (totalActiveWeight === 0) return 0
  return (BASE_WEIGHTS[pillarId] ?? 0) / totalActiveWeight
}

// ── Pillar builders (shared between input- and DashboardData-paths) ──

/**
 * Construeert een enkele indicator-pijler met de juiste groep-metadata. De
 * `weight` wordt later toegekend op basis van de actieve set, dus deze builder
 * laat 'm op 0 staan tot de caller hem invult.
 */
function makePillar(
  id: string,
  name: string,
  score: number,
  explanation: string,
  improvementTip: string,
  rawValue: string,
): HealthPillar {
  const group = PILLAR_GROUP[id]
  return {
    id,
    name,
    score,
    weight: 0,
    explanation,
    improvementTip,
    actionHref: PILLAR_ACTION[id].href,
    actionLabel: PILLAR_ACTION[id].label,
    rawValue,
    pillarGroup: group,
    groupLabel: group ? PILLAR_GROUP_LABELS[group] : undefined,
  }
}

/**
 * Bepaalt de actieve indicator-set: module-gating (activeModules) ∩
 * data-beschikbaarheid (inactiveByData). Indicatoren zonder betekenisvolle data
 * worden hier uit de set gehaald zodat hun gewicht wordt herverdeeld (FR-6).
 */
function resolveActiveSet(
  activeModules: ModuleId[] | undefined,
  budgetingActive: boolean,
  inactiveByData: Set<string>,
): Set<string> {
  const moduleSet: Set<string> = activeModules !== undefined
    ? getActivePillarIds(activeModules)
    : new Set(budgetingActive
        ? Object.keys(BASE_WEIGHTS)
        : Object.keys(BASE_WEIGHTS).filter(id => id !== 'budget_discipline'))
  const active = new Set<string>()
  for (const id of moduleSet) {
    if (!inactiveByData.has(id)) active.add(id)
  }
  return active
}

// ── Main computation ─────────────────────────────────────────

/**
 * Compute health score from DashboardData.
 *
 * ⚠️ NIET CANONIEK. DashboardData draagt geen netto maandinkomen, schuld-
 * maandlasten of largestAssetTypeShare, dus de v2-indicatoren `debt_service_ratio`
 * en `asset_concentration` zijn hier per definitie INACTIEF (no-data → gewicht
 * herverdeeld). Gebruik deze variant NIET voor een gebruiker-zichtbaar totaal —
 * het canonieke pad is computeHealthScoreFromInputs / computeHealthScoreWithTrend
 * via buildHealthScoreInput (ADR 0008/0010). Blijft bestaan voor de regressie-
 * suite `wil-gezondheid` (pijler-scoring per as) en de core-landing-proxy.
 *
 * @param data - Full dashboard data bundle
 * @param budgetingActive - Whether the user has active budgeting. Kept for
 *   backward compatibility; ignored when `activeModules` is provided.
 * @param activeModules - Optional list of active module IDs. When provided,
 *   only pillars whose required module is in this list (or always-on pillars)
 *   are included, and weights are redistributed proportionally to sum to 1.0.
 */
export function computeHealthScore(
  data: DashboardData,
  budgetingActive = true,
  activeModules?: ModuleId[],
): HealthScore {
  // DashboardData lacks the inputs for the two new v2 indicators: concentratie
  // wordt inactief (null); DSTI volgt het geen-schulden-pad (actief, score 100).
  const input: HealthScoreInput = {
    savingsRate6m: data.savingsRate6m,
    totalAssets: data.totalAssets,
    totalDebts: data.totalDebts,
    emergencyFundMonths: data.emergencyFund.monthsCovered,
    emergencyTargetMonths: data.emergencyFund.targetMonths,
    freedomPct: data.freedomPct,
    // Peer-relatieve fire_progress: de bundel draagt beide velden al.
    currentAge: data.currentAge ?? null,
    fireAgeFractional: data.fireAgeFractional ?? null,
    netMonthlyIncome: 0,            // not available on DashboardData
    debtMonthlyPayments: 0,         // 0 = geen-schulden-pad → DSTI actief op 100
    largestAssetTypeShare: null,    // not available → concentration inactive
    budgetCategories: [
      data.budgetTotals.expense,
      data.budgetTotals.savings,
      data.budgetTotals.debt,
    ],
  }

  const current = computeHealthScoreFromInputs(input, budgetingActive, activeModules)

  // Previous-month trend from history, on the SAME active set as `current`.
  if (data.netWorthHistory.length < 2) return current

  const activeIds = new Set(current.pillars.map(p => p.id))
  const prevNetWorth = data.netWorthHistory[data.netWorthHistory.length - 2]?.value ?? data.netWorth
  const prevSavingsRate = data.savingsHistory.length >= 2
    ? data.savingsHistory[data.savingsHistory.length - 2]?.value ?? data.savingsRate6m
    : data.savingsRate6m

  const prevScores: Record<string, number> = {
    savings_rate: scoreSavingsRate(prevSavingsRate),
    budget_discipline: scoreBudgetDiscipline(input.budgetCategories),
    emergency_fund: scoreEmergencyFund(data.emergencyFund.monthsCovered, data.emergencyFund.targetMonths),
    debt_ratio: scoreDebtRatio(prevNetWorth + data.totalDebts, data.totalDebts),
    // Zelfde peer-relatieve scorer als `current`, alleen de vulling van vorige
    // maand; koers (fireAgeFractional) en leeftijd blijven de huidige.
    fire_progress: scoreFireProgressVsPeers({
      freedomPct: data.fireTarget > 0 ? (prevNetWorth / data.fireTarget) * 100 : data.freedomPct,
      currentAge: input.currentAge,
      fireAgeFractional: input.fireAgeFractional,
    }),
    // debt_service_ratio / asset_concentration are inactive on this path.
  }
  const previousMonth = Math.round(
    Array.from(activeIds).reduce(
      (sum, id) => sum + (prevScores[id] ?? 0) * getRedistributedWeightForSet(id, activeIds),
      0,
    ),
  )
  return { ...current, previousMonth, trend: current.total - previousMonth }
}

// ── Server-side / snapshot-compatible computation ────────────
// Uses lightweight HealthScoreInput instead of full DashboardData.

/**
 * Compute health score from lightweight inputs (server-side / snapshot context).
 * Dé canonieke berekening (ADR 0008/0010). No-data indicatoren worden inactief
 * en hun gewicht herverdeeld; alle 7 inactief → total 0, label 'Kritiek'.
 *
 * @param input - Lightweight health score inputs
 * @param budgetingActive - Whether the user has active budgeting. Kept for
 *   backward compatibility; ignored when `activeModules` is provided.
 * @param activeModules - Optional list of active module IDs. When provided,
 *   only pillars whose required module is active (or always-on pillars) are
 *   included, and weights are redistributed proportionally to sum to 1.0.
 */
export function computeHealthScoreFromInputs(
  input: HealthScoreInput,
  budgetingActive = true,
  activeModules?: ModuleId[],
): HealthScore {
  // ── Indicator scores + data-availability (inactivation) ──
  const inactiveByData = new Set<string>()

  // Spaarquote — always has a value (0 is a real score).
  const savingsRateScore = scoreSavingsRate(input.savingsRate6m)

  // Budgetdiscipline — inactief zonder budgetten (FR-5; geen 70-dummy meer).
  // Teller en score komen uit DEZELFDE tally, zodat de rawValue ("32/33") nooit
  // een andere lezing kan krijgen dan het percentage ernaast (H4 punt 3).
  const { active: budgetTotal, within: budgetWithin } = budgetDisciplineTally(input.budgetCategories)
  const budgetScore = scoreBudgetDiscipline(input.budgetCategories)
  if (budgetTotal === 0) inactiveByData.add('budget_discipline')

  // Noodfonds — always has a value. Target = gebruikerskeuze (doel) of default 6;
  // de curve floort de score-target zelf (anti-gaming).
  const emergencyScore = scoreEmergencyFund(input.emergencyFundMonths, input.emergencyTargetMonths)

  // DSTI — geen schulden → actief 100; schulden zonder inkomen → inactief.
  const dstiPercent = input.netMonthlyIncome > 0
    ? (input.debtMonthlyPayments / input.netMonthlyIncome) * 100
    : 0
  let dstiScore: number
  if (input.debtMonthlyPayments <= 0) {
    dstiScore = 100 // geen schuldlast = volledige score
  } else if (input.netMonthlyIncome > 0) {
    dstiScore = scoreDSTI(dstiPercent)
  } else {
    dstiScore = 0
    inactiveByData.add('debt_service_ratio') // schulden zonder inkomen → inactief
  }

  // Schuldratio — always has a value.
  const debtRatioScore = scoreDebtRatio(input.totalAssets, input.totalDebts)
  const debtRatio = Math.round(debtRatioPercent(input.totalAssets, input.totalDebts))

  // FIRE-voortgang — always has a value. Peer-relatief zodra de leeftijd
  // bekend is; anders de leeftijdsblinde terugval (zie scoreFireProgressVsPeers).
  const fireScore = scoreFireProgressVsPeers(input)
  const firePeerActive = input.currentAge != null && Number.isFinite(input.currentAge)
  const firePeerAge = firePeerActive ? firePeerAgeForAge(input.currentAge as number) : null
  const fireDelta = firePeerAge != null && input.fireAgeFractional != null && Number.isFinite(input.fireAgeFractional)
    ? firePeerAge - input.fireAgeFractional
    : null

  // Vermogensconcentratie — inactief wanneer largestAssetTypeShare === null.
  const concentrationPct = input.largestAssetTypeShare != null
    ? input.largestAssetTypeShare * 100
    : 0
  const concentrationScore = input.largestAssetTypeShare != null
    ? scoreAssetConcentration(concentrationPct)
    : 0
  if (input.largestAssetTypeShare == null) inactiveByData.add('asset_concentration')

  // ── Active set (module-gating ∩ data-availability) ──
  const activePillarSet = resolveActiveSet(activeModules, budgetingActive, inactiveByData)
  const resolvedBudgetingActive = activePillarSet.has('budget_discipline')

  // ── Build pillars ──
  const allPillars: HealthPillar[] = [
    makePillar(
      'savings_rate',
      'Spaarquote',
      savingsRateScore,
      'Hoeveel procent van je inkomen spaar je? (6-maands gemiddelde)',
      input.savingsRate6m < 10
        ? 'Begin met 10% van je inkomen automatisch opzij te zetten.'
        : input.savingsRate6m < 20
        ? 'Bekijk je abonnementen en vaste lasten — kleine besparingen tellen snel op.'
        : input.savingsRate6m < 30
        ? 'Je bent op de goede weg! Verhoog bij elke loonsverhoging je spaarpercentage.'
        : 'Uitstekende spaarquote — blijf dit volhouden.',
      `${Math.round(input.savingsRate6m)}%`,
    ),
    makePillar(
      'budget_discipline',
      'Budgetdiscipline',
      budgetScore,
      'Hoeveel van je budgetcategorieën blijven binnen de limiet?',
      budgetTotal === 0
        ? 'Stel budgetten in voor je belangrijkste uitgavencategorieën.'
        : budgetWithin < budgetTotal
        ? `${budgetTotal - budgetWithin} van je ${budgetTotal} categorieën zit over de limiet — kijk in de heatmap welke.`
        : 'Alle budgetten binnen de limiet — goed gedisciplineerd!',
      budgetTotal > 0 ? `${budgetWithin}/${budgetTotal}` : 'Geen budget',
    ),
    makePillar(
      'emergency_fund',
      'Noodfonds',
      emergencyScore,
      'Hoeveel maandsalarissen heb je als buffer? Het doel is 3.',
      input.emergencyFundMonths < 1
        ? 'Start met één maandsalaris buffer — automatiseer een vaste storting.'
        : input.emergencyFundMonths < 2
        ? 'Je hebt ruim een maandsalaris staan. Bouw door naar 3 — zet meevallers direct opzij.'
        : input.emergencyFundMonths < 3
        ? 'Bijna op het doel van 3 maandsalarissen. Elke extra euro geeft meer rust.'
        : 'Noodfonds compleet — drie maandsalarissen als vangnet.',
      `${input.emergencyFundMonths.toFixed(1)} × salaris`,
    ),
    makePillar(
      'debt_service_ratio',
      'Schuldenlast',
      dstiScore,
      'Welk deel van je netto maandinkomen gaat naar schuldaflossing?',
      input.debtMonthlyPayments <= 0
        ? 'Geen schuldlast — al je inkomen blijft beschikbaar.'
        : dstiPercent > 43
        ? 'Je maandlasten zijn hoog t.o.v. je inkomen — verlaag de duurste schuld eerst.'
        : dstiPercent > 36
        ? 'Je zit boven de comfortabele grens (36%) — bekijk herfinanciering of extra aflossing.'
        : dstiPercent > 20
        ? 'Beheersbaar, maar elke euro minder maandlast geeft meer ruimte.'
        : 'Lage maandlasten — gezonde verhouding tot je inkomen.',
      input.debtMonthlyPayments <= 0
        ? 'Geen schulden'
        : input.netMonthlyIncome > 0
        ? `${Math.round(dstiPercent)}%`
        : 'Geen inkomen',
    ),
    makePillar(
      'debt_ratio',
      'Schuldratio',
      debtRatioScore,
      'Verhouding tussen je schulden en je totale vermogen.',
      debtRatio > 50
        // S17: identieke string als lib/page-status/copy.ts — merknaam weg,
        // duiding blijft. (Het ontdubbelen van die twee hoort bij S1.)
        ? 'Focus op de duurste schuld eerst om sneller schuldenvrij te worden.'
        : debtRatio > 20
        ? 'Overweeg extra aflossingen op je duurste lening.'
        : debtRatio > 0
        ? 'Je schuldenlast is beheersbaar. Overweeg herfinanciering voor betere rente.'
        : 'Schuldenvrij — uitstekend!',
      `${debtRatio}%`,
    ),
    makePillar(
      'fire_progress',
      'FIRE-voortgang',
      fireScore,
      firePeerActive
        // "Onze lat", niet "leeftijdsgenoten": dit is een gecureerde
        // ambitie-richtlijn (fire-peer-lat.ts), géén gemeten statistiek — de
        // copy mag geen meting claimen (review H1, Wft: inzicht, geen feit
        // over anderen verzinnen).
        ? `Ligt je koers vóór of achter op onze vrijheidslat voor jouw leeftijd (vrij op ${firePeerAge})?`
        : 'Hoever ben je op weg naar financiële vrijheid?',
      // Peer-actief: de tip duidt de KOERS t.o.v. de lat; terugval: de oude
      // freedomPct-ladder. FIRE bereikt wint altijd.
      input.freedomPct >= 100
        ? 'FIRE bereikt — geniet van je financiële vrijheid!'
        : firePeerActive
        ? fireDelta == null
          ? 'Nog geen haalbare vrijheidsleeftijd in beeld op dit pad — elke verhoging van je inleg of verlaging van je doeluitgaven telt dubbel.'
          : fireDelta >= 5
          ? `Je koers ligt ${Math.round(fireDelta)} jaar vóór op onze lat van ${firePeerAge} jaar — houd je strategie vast.`
          : fireDelta > 0
          ? `Op koers om eerder vrij te zijn dan onze lat van ${firePeerAge} jaar.`
          : fireDelta === 0
          ? `Precies op onze lat van ${firePeerAge} jaar — elke extra inleg brengt je ervoor.`
          : fireDelta >= -5
          ? `Net achter op onze lat van ${firePeerAge} jaar — een hogere maandinleg verkleint het verschil.`
          : `Je koers ligt ${Math.round(-fireDelta)} jaar achter op onze lat van ${firePeerAge} jaar — verhoog je spaarquote of verlaag je doeluitgaven.`
        : input.freedomPct < 10
        ? 'Begin klein — elke euro opgebouwd vermogen brengt je dichter bij vrijheid.'
        : input.freedomPct < 25
        ? 'Verhoog je maandelijkse inleg in beleggingen voor versneld vermogensopbouw.'
        : input.freedomPct < 50
        ? 'Je bent halverwege! Overweeg je spaarquote te optimaliseren.'
        : input.freedomPct < 75
        ? 'Sterk op weg — de compound interest werkt steeds harder voor je.'
        : 'Bijna vrij! Focus op het volhouden van je strategie.',
      `${Math.round(input.freedomPct)}%`,
    ),
    makePillar(
      'asset_concentration',
      'Vermogensspreiding',
      concentrationScore,
      'Hoe sterk leunt je vermogen op één type bezit? (excl. eigen woning)',
      input.largestAssetTypeShare == null
        ? 'Bouw eerst vermogen op — spreiding wordt relevant vanaf ±€10.000.'
        : concentrationPct > 70
        ? 'Je vermogen is sterk geconcentreerd — overweeg te spreiden over meer typen.'
        : concentrationPct > 40
        ? 'Redelijk gespreid — een extra vermogenstype verlaagt je risico verder.'
        : 'Goed gespreid — monitor je allocatie periodiek.',
      input.largestAssetTypeShare == null
        ? 'Te weinig vermogen'
        : `${Math.round(concentrationPct)}% in 1 type`,
    ),
  ]

  // Assign redistributed weights and retain only the active indicators.
  const pillars = allPillars
    .filter(p => activePillarSet.has(p.id))
    .map(p => ({ ...p, weight: getRedistributedWeightForSet(p.id, activePillarSet) }))

  // Weighted total (0 when no active pillars — no divide-by-zero).
  const total = pillars.length === 0
    ? 0
    : Math.round(pillars.reduce((sum, p) => sum + p.score * p.weight, 0))

  return {
    total,
    label: getLabel(total),
    pillars,
    previousMonth: null,
    trend: 0,
    activePillarCount: pillars.length,
    budgetingActive: resolvedBudgetingActive,
  }
}

/**
 * Canonieke gezondheidsscore MÉT maand-op-maand-trend.
 *
 * Het "huidige" getal is exact `computeHealthScoreFromInputs(input, …)` — de
 * ÉNE canonieke berekening (ADR 0008/0010). De trend wordt afgeleid door dezelfde
 * canonieke functie nogmaals te draaien op een "vorige maand"-input (prev-month
 * vermogen → freedomPct/schuldratio, prev-month spaarquote), op DEZELFDE actieve
 * set. Zo blijft er één bron voor de pijler-scores; de trend is een afgeleide,
 * geen tweede berekenpad.
 *
 * Bedoeld voor surfaces die wél historie hebben (dashboard-widget). Surfaces
 * zonder historie (snapshot-routes, /toekomst) gebruiken computeHealthScore-
 * FromInputs rechtstreeks (trend = 0).
 */
export function computeHealthScoreWithTrend(
  input: HealthScoreInput,
  budgetingActive: boolean,
  history: {
    /** Vorige-maand netto vermogen (voor freedomPct + schuldratio-proxy). */
    prevNetWorth: number | null
    /** Vorige-maand spaarquote-%; valt terug op huidige savingsRate6m. */
    prevSavingsRate: number | null
    /** Canonieke benodigde portfolio (noemer freedomPct); valt terug op fireTarget. */
    requiredPortfolio: number | null
  },
  activeModules?: ModuleId[],
): HealthScore {
  const current = computeHealthScoreFromInputs(input, budgetingActive, activeModules)

  if (history.prevNetWorth == null || history.requiredPortfolio == null || history.requiredPortfolio <= 0) {
    return current
  }

  // Vorige-maand freedomPct op DEZELFDE noemer als de canonieke voortgang.
  const prevFreedomPct = Math.max(
    0,
    Math.min((history.prevNetWorth / history.requiredPortfolio) * 100, 100),
  )
  const prevInput: HealthScoreInput = {
    ...input,
    freedomPct: prevFreedomPct,
    savingsRate6m: history.prevSavingsRate ?? input.savingsRate6m,
    // Schuldratio-proxy: prev-month vermogen met huidige schuld.
    totalAssets: history.prevNetWorth + input.totalDebts,
  }
  const prev = computeHealthScoreFromInputs(prevInput, budgetingActive, activeModules).total

  return { ...current, previousMonth: prev, trend: current.total - prev }
}

/** Get health label from a numeric score (for use with snapshot data) */
export function getHealthLabel(score: number): string {
  return getLabel(score)
}
