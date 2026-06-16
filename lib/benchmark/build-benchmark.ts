/**
 * Orchestrator: stelt het `BenchmarkReportData`-object samen uit de canonieke
 * gebruikerscijfers (uit `loadDashboardData`) + de doelgroep-referentie. Pure functie
 * zonder I/O — de API-route levert de gegevens aan, dit bestand bevat de logica
 * (en is daardoor los te testen).
 *
 * Herrekent géén kerngetallen: `userValue`s komen 1-op-1 binnen; alleen de
 * referentie-zijde wordt hier opgebouwd (gemeten CBS-cijfers + gemodelleerde peer).
 */

import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type {
  BenchmarkReportData,
  BenchmarkMetric,
  BenchmarkSource,
  GlobalRealityCheck,
} from '@/lib/benchmark-report-data'
import type { BenchmarkCohort } from './cohort'
import { bandMidAge } from './cohort'
import {
  getCohortReference,
  SOURCE_CBS_VERMOGEN,
  SOURCE_CBS_INKOMEN,
  SOURCE_SPAARQUOTE,
  SOURCE_HOUSEHOLD_ADJUST,
} from './nl-reference'
import { computeReferencePeer } from './reference-peer'
import {
  wealthTopPercent,
  incomeTopPercent,
  SOURCE_GLOBAL_WEALTH,
  SOURCE_GLOBAL_INCOME,
} from './global-reference'
import { buildMuskComparison } from './perspective'

const SOURCE_MODELLED_PEER: BenchmarkSource = {
  label: 'TriFinity-rekenmotor op CBS-mediane invoer',
  year: 2024,
  note: 'Gemodelleerde "typische peer": cohort-medianen door dezelfde motoren als jouw eigen cijfers.',
}

export interface BenchmarkUserMetrics {
  healthScoreTotal: number | null
  fireAgeFractional: number | null
  savingsRate6m: number | null
  netWorth: number | null
  /** Geschat jaarinkomen — canoniek effectief inkomen (dashboardData.monthlyIncome×12), bruto jaarinkomen als fallback. */
  yearlyIncome: number | null
  /** Canoniek dagtarief (uit `dailyExpenseRate(monthlyExpenses)`) voor vrijheidstijd-duiding. */
  dailyExpenseRate: number
}

export interface BuildBenchmarkArgs {
  user: BenchmarkUserMetrics
  cohort: BenchmarkCohort
  displayName: string | null
  generatedAt: string
  now?: Date
}

/** Vrijheidstijd-duiding van een euro-verschil (bv. vermogen boven/onder mediaan). */
function freedomDelta(deltaEur: number, dailyRate: number): string | null {
  if (dailyRate <= 0 || Math.abs(deltaEur) < 100) return null
  const bd = calculateFreedomTime(Math.abs(deltaEur), dailyRate)
  const tijd = formatFreedomTimeString(bd, 'short')
  if (tijd === '0d') return null
  return deltaEur >= 0 ? `${tijd} voorsprong` : `${tijd} achterstand`
}

function eur(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function buildBenchmarkReport(args: BuildBenchmarkArgs): BenchmarkReportData {
  const { user, cohort, displayName, generatedAt } = args
  const now = args.now ?? new Date()

  const metrics: BenchmarkMetric[] = []
  const usedSources = new Map<string, BenchmarkSource>()
  const addSource = (s: BenchmarkSource) => usedSources.set(s.label, s)

  // ── Cohort-vergelijkingen (alleen met bekende leeftijd) ──
  if (cohort.ageBand) {
    const ref = getCohortReference(cohort.ageBand, cohort.household)
    const peer = computeReferencePeer(ref, bandMidAge(cohort.ageBand), now)
    if (ref.householdAdjusted) addSource(SOURCE_HOUSEHOLD_ADJUST)

    // 1. Gezondheidsscore (gemodelleerde peer)
    metrics.push(buildHealthMetric(user.healthScoreTotal, peer.healthScoreTotal))
    addSource(SOURCE_MODELLED_PEER)

    // 2. Vrijheidsleeftijd (gemodelleerde peer; lager = eerder vrij = beter)
    metrics.push(buildFireAgeMetric(user.fireAgeFractional, peer.fireAge))

    // 3. Spaarquote (indicatieve referentie)
    metrics.push(buildSavingsMetric(user.savingsRate6m, ref.savingsRatePct))
    addSource(SOURCE_SPAARQUOTE)

    // 4. Netto vermogen (CBS-mediaan + gemiddeld)
    metrics.push(buildNetWorthMetric(user.netWorth, ref.netWorthMedian, ref.netWorthMean, user.dailyExpenseRate))
    addSource(SOURCE_CBS_VERMOGEN)

    // 5. Geschat jaarinkomen (CBS gestandaardiseerd inkomen, geraamd per huishoudtype)
    metrics.push(buildIncomeMetric(user.yearlyIncome, ref.incomeMedian))
    addSource(SOURCE_CBS_INKOMEN)
  }

  // ── Wereld-reality-check (werkt ook zonder cohort) ──
  const global = buildGlobalRealityCheck(user)
  if (global.income || global.wealth) {
    addSource(SOURCE_GLOBAL_WEALTH)
    addSource(SOURCE_GLOBAL_INCOME)
  }

  // ── Jij vs. Musk (gimmick; werkt ook zonder cohort) ──
  const musk = buildMuskComparison(user.netWorth, user.dailyExpenseRate)
  if (musk) addSource(musk.source)

  return {
    generatedAt,
    displayName,
    cohort: {
      ageBandLabel: cohort.ageBandLabel,
      householdLabel: cohort.householdLabel,
      complete: cohort.complete,
      missing: cohort.missing,
    },
    metrics,
    global,
    musk,
    sources: Array.from(usedSources.values()),
  }
}

// ── Per-metric builders ──────────────────────────────────────

function buildHealthMetric(userValue: number | null, ref: number): BenchmarkMetric {
  let caption = 'Onvoldoende gegevens voor je gezondheidsscore.'
  if (userValue != null) {
    const d = Math.round(userValue - ref)
    caption = d === 0
      ? 'Gelijk aan een typische peer in jouw doelgroep.'
      : `${Math.abs(d)} ${Math.abs(d) === 1 ? 'punt' : 'punten'} ${d > 0 ? 'boven' : 'onder'} een typische peer.`
  }
  return {
    key: 'health', label: 'Financiële gezondheid', unit: 'score',
    userValue, referenceValue: ref, higherIsBetter: true, tier: 'modelled',
    caption,
    explanation: 'Je gezondheidsscore (0–100) vat spaarquote, buffer, schuld en vrijheid samen. '
      + 'De vergelijking is een gemodelleerde "typische peer": we draaien de cohort-mediane cijfers '
      + 'door dezelfde rekenmotor als bij jou — geen gemeten gemiddelde, maar wel appels met appels.',
    source: SOURCE_MODELLED_PEER,
  }
}

function buildFireAgeMetric(userValue: number | null, ref: number | null): BenchmarkMetric {
  let caption = 'Je vrijheidsleeftijd is nog niet in zicht.'
  if (userValue != null && ref != null) {
    const d = userValue - ref // negatief = eerder vrij = beter
    const yrs = Math.abs(d)
    const label = yrs < 0.5 ? 'rond dezelfde leeftijd' :
      `${yrs.toFixed(yrs < 10 ? 1 : 0)} jaar ${d < 0 ? 'eerder' : 'later'}`
    caption = yrs < 0.5
      ? 'Je wordt rond dezelfde leeftijd vrij als de doelgroep.'
      : `Je wordt ${label} vrij dan een typische peer.`
  } else if (userValue != null && ref == null) {
    caption = 'Jij hebt een vrijheidsleeftijd in zicht; de doelgroep gemiddeld niet.'
  }
  return {
    key: 'fire_age', label: 'Vrijheidsleeftijd', unit: 'age',
    userValue, referenceValue: ref, higherIsBetter: false, tier: 'modelled',
    caption,
    explanation: 'Je vrijheidsleeftijd is de leeftijd waarop werken een keuze wordt. '
      + 'De referentie is een gemodelleerde peer op basis van cohort-mediane invoer — '
      + 'lager betekent eerder vrij.',
    source: SOURCE_MODELLED_PEER,
  }
}

function buildSavingsMetric(userValue: number | null, ref: number): BenchmarkMetric {
  let caption = 'Onvoldoende gegevens voor je spaarquote.'
  if (userValue != null) {
    const d = Math.round(userValue - ref)
    caption = d === 0
      ? 'Gelijk aan de indicatieve NL-spaarquote voor jouw leeftijd.'
      : `${Math.abs(d)}%-punt ${d > 0 ? 'meer' : 'minder'} dan gemiddeld in jouw leeftijdsgroep.`
  }
  return {
    key: 'savings_rate', label: 'Spaarquote', unit: 'pct',
    userValue, referenceValue: ref, higherIsBetter: true, tier: 'modelled',
    caption,
    explanation: 'Je spaarquote is het deel van je inkomen dat je opzijzet (6-maands gemiddelde). '
      + 'De referentie is een indicatieve NL-spaarquote voor jouw leeftijd (CBS/DNB); per cohort '
      + 'niet exact gepubliceerd, daarom een richtcijfer.',
    source: SOURCE_SPAARQUOTE,
  }
}

function buildNetWorthMetric(
  userValue: number | null, median: number, mean: number, dailyRate: number,
): BenchmarkMetric {
  let caption = 'Voeg bezittingen toe om je vermogen te vergelijken.'
  let deltaFreedom: string | null = null
  if (userValue != null) {
    const d = userValue - median
    deltaFreedom = freedomDelta(d, dailyRate)
    caption = `${eur(Math.abs(d))} ${d >= 0 ? 'boven' : 'onder'} de mediaan van jouw doelgroep`
      + (deltaFreedom ? ` — ${deltaFreedom}.` : '.')
  }
  const curveMax = Math.round(Math.max(userValue ?? 0, mean, median) * 1.6) || 1
  return {
    key: 'net_worth', label: 'Netto vermogen', unit: 'eur',
    userValue, referenceValue: median, referenceMean: mean,
    higherIsBetter: true, tier: 'measured', deltaFreedom,
    caption,
    explanation: 'De mediaan is het middelste vermogen in jouw doelgroep: de helft heeft meer, de helft '
      + 'minder. Het NL-gemiddelde ligt hoger doordat een kleine groep zeer rijke huishoudens het optrekt — '
      + 'daarom is de mediaan een eerlijker ijkpunt. De leeftijdscijfers komen van CBS; de verdeling naar '
      + 'huishoudtype is een geraamde correctie (CBS publiceert geen vermogen per leeftijd × huishoudtype). '
      + 'Bron: CBS, Vermogen van huishoudens (Materiële welvaart 2024).',
    curve: { mode: median, max: curveMax, spread: 0.95 },
    source: SOURCE_CBS_VERMOGEN,
  }
}

function buildIncomeMetric(userValue: number | null, median: number): BenchmarkMetric {
  let caption = 'Vul je geschatte jaarinkomen in je profiel in om te vergelijken.'
  if (userValue != null) {
    const d = userValue - median
    caption = Math.abs(d) < 500
      ? 'Rond de referentie van jouw doelgroep.'
      : `${eur(Math.abs(d))} ${d >= 0 ? 'boven' : 'onder'} de referentie van jouw doelgroep.`
  }
  const curveMax = Math.round(Math.max(userValue ?? 0, median) * 2.5) || 1
  return {
    key: 'income', label: 'Geschat jaarinkomen', unit: 'eur',
    userValue, referenceValue: median, higherIsBetter: true, tier: 'measured',
    caption,
    explanation: 'De referentie is het gemiddeld besteedbaar inkomen voor jouw leeftijdsgroep, geraamd naar '
      + 'jouw huishoudtype via de CBS-equivalentiefactoren (CBS publiceert het inkomen per leeftijd '
      + 'gestandaardiseerd — herrekend naar een alleenstaande — en niet per leeftijd × huishoudtype). We '
      + 'vergelijken je netto inkomen. Bron: CBS, Besteedbaar inkomen (Materiële welvaart 2024).',
    curve: { mode: median, max: curveMax, spread: 0.5 },
    source: SOURCE_CBS_INKOMEN,
  }
}

function buildGlobalRealityCheck(user: BenchmarkUserMetrics): GlobalRealityCheck {
  const incomeTop = user.yearlyIncome != null ? incomeTopPercent(user.yearlyIncome) : null
  const wealthTop = user.netWorth != null ? wealthTopPercent(user.netWorth) : null

  return {
    income: user.yearlyIncome != null ? {
      value: user.yearlyIncome,
      topPercent: incomeTop,
      caption: incomeTop != null
        ? `Je inkomen plaatst je bij de rijkste ${incomeTop}% van de wereld.`
        : 'Je inkomen valt onder de mondiale top — een groot deel van de wereld leeft van minder dan dit.',
    } : null,
    wealth: user.netWorth != null && user.netWorth > 0 ? {
      value: user.netWorth,
      topPercent: wealthTop,
      caption: wealthTop != null
        ? `Je vermogen plaatst je bij de rijkste ${wealthTop}% wereldwijd.`
        : 'Je vermogen valt (nog) onder de mondiale topgroepen.',
    } : null,
    source: SOURCE_GLOBAL_WEALTH,
  }
}
