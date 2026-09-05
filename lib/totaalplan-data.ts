/**
 * Totaalplan-rapport — types + pure assemblage.
 *
 * Het gecomponeerde "plan-als-document": de aannames-blokken van het
 * persoonlijk-plan-rapport (hergebruikt, byte-identiek) PLUS een
 * vermogensprojectie, een plan-brede slagingskans en deterministische inzichten.
 * Deelbaar via `window.print()` → PDF.
 *
 * ## CONSUME DON'T RECOMPUTE
 * Geen enkel kerngetal wordt hier lokaal herrekend. De projectie komt integraal
 * uit `computeConvergentieProjection()` (de horizon-kernel, dezelfde motor als
 * /toekomst en /overzicht) en de slagingskans uit `runMonteCarlo()` (de VBA-parity
 * MC-wrapper). Deze module mapt de kernel-uitvoer alleen naar het rapport-contract.
 *
 * ## Grondslag-scheiding (CLAUDE.md harde regel)
 * Het vermogenspad en het doel-marker staan op de grondslag `nettoVermogen`
 * (INCL. niet-liquide bezit / eigen woning). De liquide FIRE-pot
 * (`fireLiquidePot`, excl. woning) is een AFZONDERLIJKE grootheid en wordt NOOIT
 * op dezelfde as of marker gemengd — enkel als losse tekstduiding getoond.
 *
 * ## Lege staat
 * Zonder geboortedatum/parameters faalt de kernel bewust
 * (`computeConvergentieProjection.ok === false`) → `projectie.ok === false` met
 * reden; de UI toont dan een nette "—"/fout-staat (spiegel persoonlijk-plan).
 *
 * Pure module: geen Supabase/fs/Math.random (de MC-ruis is deterministisch;
 * `runMonteCarlo` is sin-hash-gebaseerd). Server- én test-bruikbaar.
 */
import { stopAnchorFromKernel, type FireEndStrategy } from '@/lib/fire-strategy'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { ankerReachFromSim, ankerReachesAge } from '@/lib/horizon/anker-copy'
import { solveFireAgeWithoutAnchor } from '@/lib/horizon/scenario-presets'
import { toSimResult } from '@/lib/unified-projection'
import {
  computeConvergentieProjection,
  buildConvergentieAdapterInput,
  type ConvergentieRawContext,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { runMonteCarlo } from '@/lib/horizon-kernel/wrappers/mc'
import type { KernelInput } from '@/lib/horizon-kernel/types'
import {
  buildPersoonlijkPlanSections,
  type PersoonlijkPlanRawInputs,
  type PersoonlijkPlanSections,
} from '@/lib/persoonlijk-plan-assembly'

// ── Performance-begrenzing ───────────────────────────────────────────

/**
 * Aantal Monte-Carlo-runs voor het rapport. `runMonteCarlo` draait n VOLLEDIGE
 * engine-runs server-side per request; we cappen op deze waarde (gelijk aan de
 * Excel-parity-default, `EXCEL_ONZEKERHEID_DEFAULTS.mcAantalRuns = 200`) zodat het
 * rapport niet traag/duur wordt, ongeacht een eventueel hogere profiel-config.
 */
export const TOTAALPLAN_MC_RUNS = 200

// ── Rapport-contract ─────────────────────────────────────────────────

/** Eén punt op het vermogenspad — grondslag `nettoVermogen` (incl. niet-liquide). */
export interface ProjectieVermogenspadPunt {
  /** Projectiejaar-index (0 = nu). */
  year: number
  /** Leeftijd in dit projectiejaar. */
  age: number
  /** Netto vermogen (INCL. eigen woning / niet-liquide bezit) — nominaal. */
  nettoVermogen: number
}

/**
 * Vermogensprojectie + FIRE-uitkomsten, geconsumeerd uit de horizon-kernel.
 * `ok === false` → kernel kon niet rekenen (bv. geen geboortedatum); alle
 * cijfervelden zijn dan null/leeg en de UI toont een fout-/lege staat.
 */
export interface ProjectieData {
  ok: boolean
  /** Nette Nederlandse reden bij `ok === false`. */
  reason: string | null
  /** Of FIRE bereikbaar is binnen de eindhorizon. */
  fireReachable: boolean
  /** FIRE-leeftijd (geheel) — null als niet bereikbaar/berekenbaar. */
  fireAge: number | null
  /** Fractionele FIRE-leeftijd (sub-jaar). */
  fireAgeFractional: number | null
  /** Huidige leeftijd (uit demografie). */
  currentAge: number | null
  /** Kalenderjaar van FIRE = huidig jaar + (fireAge − currentAge). Null indien onbekend. */
  fireCalendarYear: number | null
  /**
   * Doelbedrag op de grondslag NETTO VERMOGEN (incl. eigen woning) =
   * `requiredFireNetWorth`. Zelfde grondslag als het vermogenspad → mag als
   * marker op die as. Null als de kernel het veld niet levert.
   */
  doelbedragNettoVermogen: number | null
  /**
   * Liquide FIRE-pot (excl. eigen woning) = `requiredFirePortfolio`. AFZONDERLIJKE
   * grootheid — enkel losse tekstduiding, NOOIT op de vermogenspad-as/marker.
   */
  fireLiquidePot: number
  /** Effectieve eindleeftijd (x-as-einde grafiek). */
  displayEndAge: number
  /** Gebruikte eindstrategie. */
  strategy: FireEndStrategy
  /**
   * Het stop-anker van het plan (ADR 0129 F3a). Onder een vast anker (`aow`/`now`/`age`)
   * is `fireAge` het anker en geen vrijheidsleeftijd; het rapport toont dan de drie
   * velden hieronder i.p.v. "Vrijheidsleeftijd (FIRE)" (labels: F3b).
   */
  stopAnchor?: 'solved' | 'aow' | 'now' | 'age'
  /** GEKOZEN STOPMOMENT — `SimResult.vastStopLeeftijd` (fractioneel; 58,5 blijft 58,5). `null` onder `solved`. */
  gekozenStopmoment?: number | null
  /** VRIJ MOGELIJK VANAF — de opgeloste leeftijd zónder anker (tweede run, D7). `null` onder `solved` of onbereikbaar. */
  vrijMogelijkVanaf?: number | null
  /** REIKT TOT — tot welke leeftijd het liquide vermogen reikt (uitputting, eindleeftijd bij dekking). `null` onder `solved`/onbekend. */
  reiktTot?: number | null
  /** Volledig vermogenspad (nettoVermogen-grondslag). */
  vermogenspad: ProjectieVermogenspadPunt[]
  /** Eindwaarde netto vermogen (laatste projectierij). */
  eindwaardeNettoVermogen: number
}

/** Plan-brede slagingskans uit de Monte-Carlo-wrapper. */
export interface SlagingskansData {
  ok: boolean
  /** Slaagkans 0..1 (MC!B4). Null als er geen projectie mogelijk is. */
  successProbability: number | null
  /** Aantal MC-runs (n). */
  runs: number
  /** Gebruikte eindstrategie (context voor de duiding). */
  strategy: FireEndStrategy | null
}

/** Eén deterministisch inzicht (uit de aandachtspunten-bus). */
export interface InzichtItem {
  id: string
  title: string
  /** Korte toelichting (gewone taal); null indien geen. */
  detail: string | null
  /** Vrijheidsdagen-equivalent van de jaarbesparing. */
  freedomDays: number
  /** Geschatte besparing in EUR/jaar (0 = onbekend). */
  savingsPerYear: number
}

/** Volledige rapport-bundel. */
export interface TotaalplanData extends PersoonlijkPlanSections {
  generatedAt: string
  /** Daguitgaven voor de vrijheidstijd-framing (€ → tijd). */
  dailyExpenseRate: number
  projectie: ProjectieData
  slagingskans: SlagingskansData
  inzichten: InzichtItem[]
}

// ── Kernel-input voor de MC (gedeeld met de parity-test) ─────────────

/**
 * Bouw de `KernelInput` voor de Monte-Carlo uit dezelfde rawContext als de
 * projectie — zodat MC en projectie één grondslag delen (geen drift). Cap de
 * MC-runs op `TOTAALPLAN_MC_RUNS`. Returnt `null` bij een kern-fout (bv. geen
 * geboortedatum), zodat de aanroeper een nette lege slagingskans kan tonen.
 *
 * De adapter-mapping komt uit `buildConvergentieAdapterInput` — dezelfde als de
 * projectie en de marktcheck op /toekomst. De handgeschreven kopie die hier tot
 * 3 sep 2026 stond liet `marktVolatiliteit` (ADR 0117) vallen, waardoor de
 * slagingskans van het rapport op de default-σ bleef staan terwijl /toekomst met
 * de beheerde jaarlaag rekende: drie bandbreedtes zodra beheer de volatiliteit
 * wijzigde. Eén home, geen kopie meer.
 */
export function buildTotaalplanKernelInput(rawContext: ConvergentieRawContext): KernelInput | null {
  try {
    const input = buildKernelInputFromApp(buildConvergentieAdapterInput(rawContext))
    const cappedRuns = Math.min(input.onzekerheid.mc.aantalRuns, TOTAALPLAN_MC_RUNS)
    return {
      ...input,
      onzekerheid: {
        ...input.onzekerheid,
        mc: { ...input.onzekerheid.mc, aantalRuns: cappedRuns },
      },
    }
  } catch {
    return null
  }
}

// ── Assemblage ───────────────────────────────────────────────────────

/** Rauwe invoer voor de totaalplan-assemblage (pure). */
export interface TotaalplanRawInputs {
  generatedAt: string
  /** Daguitgaven voor de € → tijd-framing (canonieke `dailyExpenseRate`). */
  dailyExpenseRate: number
  /** Rauwe invoer voor de aannames-blokken (gedeeld met persoonlijk-plan). */
  persoonlijkPlan: PersoonlijkPlanRawInputs
  /** Rauwe kernel-context (zelfde vorm als /toekomst + fire-target-shared). */
  kernelContext: ConvergentieRawContext
  /** Deterministische aandachtspunten (al gesorteerd op besparing desc). */
  aandachtspunten: Aandachtspunt[]
}

/** Maximaal aantal inzichten in het rapport (spec: 3-5 punten). */
const MAX_INZICHTEN = 5

/**
 * Bouw de projectie-sectie uit de kernel-uitkomst. Grondslag-scheiding:
 * vermogenspad + doelbedrag op `nettoVermogen` (incl. woning); de liquide
 * FIRE-pot apart.
 */
function buildProjectie(
  rawContext: ConvergentieRawContext,
  currentAge: number | null,
  nowYear: number,
): ProjectieData {
  const outcome = computeConvergentieProjection({ rawContext })
  if (!outcome.ok) {
    return {
      ok: false,
      reason: outcome.reason,
      fireReachable: false,
      fireAge: null,
      fireAgeFractional: null,
      currentAge,
      fireCalendarYear: null,
      doelbedragNettoVermogen: null,
      fireLiquidePot: 0,
      displayEndAge: 0,
      strategy: 'perpetual',
      stopAnchor: 'solved',
      gekozenStopmoment: null,
      vrijMogelijkVanaf: null,
      reiktTot: null,
      vermogenspad: [],
      eindwaardeNettoVermogen: 0,
    }
  }

  const result = outcome.result
  const sim = toSimResult(result)

  // ADR 0129 F3a — onder een vast anker: stopmoment uit de run (nooit `fireAge`, die is
  // `ceil`), "vrij mogelijk vanaf" uit de tweede run (één bisectie, alleen hier), en
  // het bereik uit dezelfde run als de rijen. `stopAnchor` uit de kernel-echo.
  const stopAnchor = stopAnchorFromKernel(sim.stopAnker).kind
  const anchorFixed = stopAnchor !== 'solved'
  const reiktTot = anchorFixed
    ? ankerReachesAge(
        ankerReachFromSim({
          startAge: currentAge,
          kernelDepletionMonth: sim.kernelDepletionMonth,
          endAge: sim.displayEndAge,
        }),
      )
    : null
  const vrijMogelijkVanaf = anchorFixed ? solveFireAgeWithoutAnchor(rawContext) : null

  const vermogenspad: ProjectieVermogenspadPunt[] = result.rows.map((r) => ({
    year: r.year,
    age: r.age,
    nettoVermogen: Math.round(r.netWorth),
  }))
  const eindwaardeNettoVermogen = vermogenspad.length > 0
    ? vermogenspad[vermogenspad.length - 1].nettoVermogen
    : 0

  const fireAge = sim.fireAge
  const fireCalendarYear =
    fireAge != null && currentAge != null ? nowYear + (fireAge - currentAge) : null

  return {
    ok: true,
    reason: null,
    fireReachable: sim.fireReachable,
    fireAge,
    fireAgeFractional: sim.fireAgeFractional,
    currentAge,
    fireCalendarYear,
    // requiredFireNetWorth = TOTAAL netto vermogen bij FIRE (incl. woning),
    // zelfde grondslag als het vermogenspad. Optioneel in het contract → null-fallback.
    doelbedragNettoVermogen: result.requiredFireNetWorth ?? null,
    // requiredFirePortfolio = LIQUIDE pot bij FIRE (excl. woning) — losse duiding.
    fireLiquidePot: Math.round(sim.requiredFirePortfolio),
    displayEndAge: sim.displayEndAge,
    strategy: sim.strategy,
    stopAnchor,
    gekozenStopmoment: anchorFixed ? (sim.vastStopLeeftijd ?? null) : null,
    vrijMogelijkVanaf,
    reiktTot,
    vermogenspad,
    eindwaardeNettoVermogen,
  }
}

/** Bereken de plan-brede slagingskans via de MC-wrapper (single source). */
function buildSlagingskans(
  rawContext: ConvergentieRawContext,
  strategy: FireEndStrategy | null,
): SlagingskansData {
  const input = buildTotaalplanKernelInput(rawContext)
  if (!input) {
    return { ok: false, successProbability: null, runs: 0, strategy }
  }
  const mc = runMonteCarlo(input)
  return {
    ok: true,
    successProbability: Number.isNaN(mc.successProbability) ? null : mc.successProbability,
    runs: mc.runs,
    strategy,
  }
}

/** Map de aandachtspunten naar rapport-inzichten (top-N, deterministisch). */
function buildInzichten(aandachtspunten: Aandachtspunt[]): InzichtItem[] {
  return aandachtspunten.slice(0, MAX_INZICHTEN).map((a) => ({
    id: a.id,
    title: a.title,
    detail: a.description ?? null,
    freedomDays: a.freedomDays,
    savingsPerYear: a.savings,
  }))
}

/**
 * Bouw de volledige totaalplan-bundel. Pure functie: alle cijfers zijn afgeleid
 * uit de meegegeven rauwe rijen + de kernel-motoren. Deterministisch en testbaar.
 */
export function assembleTotaalplan(raw: TotaalplanRawInputs): TotaalplanData {
  const sections = buildPersoonlijkPlanSections(raw.persoonlijkPlan)
  const currentAge = sections.hero.currentAge
  const nowYear = new Date(raw.generatedAt).getFullYear()

  const projectie = buildProjectie(raw.kernelContext, currentAge, nowYear)
  const slagingskans = buildSlagingskans(
    raw.kernelContext,
    projectie.ok ? projectie.strategy : null,
  )
  const inzichten = buildInzichten(raw.aandachtspunten)

  return {
    generatedAt: raw.generatedAt,
    dailyExpenseRate: raw.dailyExpenseRate,
    ...sections,
    projectie,
    slagingskans,
    inzichten,
  }
}
