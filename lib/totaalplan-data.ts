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
import { lookupAowAge } from '@/lib/aow-leeftijd'
import { formatCurrency } from '@/lib/format'
import {
  deriveHousingContext,
  isHomeExcludedFromFire,
  parseHousingStrategy,
} from '@/lib/housing-strategy'
import {
  ankerReachFromSim,
  ankerReachesAge,
  ankerStopFromSim,
  ankerZin,
} from '@/lib/horizon/anker-copy'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import { buildDeficitLoanCopy, type DeficitLoanCopy } from '@/lib/horizon/deficit-loan-copy'
import { detectDeficitLoanFromRows } from '@/lib/horizon/deficit-loan-display'
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

/**
 * Eén punt op het vermogenspad — grondslag `nettoVermogen` (incl. niet-liquide).
 *
 * Een punt beschrijft het leeftijdsJAAR `age` (zelfde conventie als `SimRow`):
 * `startNettoVermogen` is de stand ÓP `age`, `nettoVermogen` de stand aan het EIND
 * van dat jaar (= op `age + 1`). De grafiek tekent daarom seed + eindstand op
 * `age + 1` via `widgetSimRowsToChartPoints` — één huis met /toekomst en /overzicht.
 */
export interface ProjectieVermogenspadPunt {
  /** Projectiejaar-index (0 = nu). */
  year: number
  /** Leeftijd in dit projectiejaar. */
  age: number
  /** Netto vermogen (INCL. eigen woning) aan het BEGIN van het jaar — nominaal. */
  startNettoVermogen: number
  /** Netto vermogen (INCL. eigen woning / niet-liquide bezit) aan het EIND van het jaar — nominaal. */
  nettoVermogen: number
  /**
   * De canonieke weergave-deflator van deze rij (`UnifiedProjectionRow.inflationFactor`,
   * jaar 0 = exact 1.0). Puur doorgeleid — nooit hier berekend (ADR 0090/0093). Het
   * rapport-blok deelt er aan de render-grens precies één keer door wanneer
   * `profiles.euro_view = 'real'`.
   */
  inflationFactor: number
}

/** Tekort-lening binnen het planvenster (V7-detector) + de gedeelde /toekomst-copy. */
export interface ProjectieTekortLening {
  /** Eerste leeftijd waarop de tekort-lening wordt aangesproken. */
  firstAge: number
  /** Hoogste tekort-lening-saldo binnen het planvenster (afgerond, nominaal). */
  peak: number
  /** Situatie-specifieke uitleg — dezelfde zinnen als de /toekomst-melding. */
  copy: DeficitLoanCopy
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
  /**
   * Vermogenspad (nettoVermogen-grondslag), WEERGAVE-GECLIPT op het planeinde:
   * rijen t/m `displayEndAge − 1` via `clipRowsToPlanEnd` — exact de clip van
   * /toekomst en /overzicht (besluit 4 juli 2026: het laatste levensjaar is
   * terminale modelmarge; de staart tot leeftijd 100 is bij opeten/nalatenschap
   * de tekort-lening-staart en hoort niet in beeld — B-043).
   */
  vermogenspad: ProjectieVermogenspadPunt[]
  /**
   * Netto vermogen op het PLANEINDE = de eindstand van de laatste geclipte rij
   * (leeftijd `displayEndAge − 1`, dus de stand op `displayEndAge`). Vóór B-043
   * was dit de ongeclipte laatste kernelrij (~leeftijd 100): bij opeten met
   * eindleeftijd 90 een diep negatieve, nominale tekort-lening-staart.
   */
  eindwaardeNettoVermogen: number
  /**
   * Netto LIQUIDE vermogen (Prognose!J, excl. eigen woning) op datzelfde planeinde.
   * De J-grondslag voor de vrijheidstijd-regel: een huis leef je niet op
   * (lib/horizon/vrijheidsdagen.ts). Andere grootheid dan `eindwaardeNettoVermogen`
   * — nooit op dezelfde as/marker.
   */
  eindwaardeNettoLiquide: number
  /**
   * Anker-tekort (ADR 0129 D3): onder een vast stopmoment reikt het liquide
   * vermogen niet tot het planeinde (`kernelStatus` anchor_/pension_/stop_now_
   * shortfall). Dezelfde zin als het tekort-blok op /toekomst (`ankerZin`);
   * `null` = geen anker-tekort.
   */
  ankerTekortZin: string | null
  /**
   * Tekort-lening aangesproken vóór het planeinde (V7-detector, t/m
   * `displayEndAge − 1`). De grafiek vloert de lijn op 0 (zoals /toekomst), dus dit
   * is het expliciete signaal dat de vloer anders zou verbergen. `null` = geen.
   */
  tekortLening: ProjectieTekortLening | null
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
      eindwaardeNettoLiquide: 0,
      ankerTekortZin: null,
      tekortLening: null,
    }
  }

  const result = outcome.result
  const sim = toSimResult(result)

  // ADR 0129 F3a — onder een vast anker: stopmoment uit de run (nooit `fireAge`, die is
  // `ceil`), "vrij mogelijk vanaf" uit de tweede run (één bisectie, alleen hier), en
  // het bereik uit dezelfde run als de rijen. `stopAnchor` uit de kernel-echo.
  const stopAnchor = stopAnchorFromKernel(sim.stopAnker).kind
  const anchorFixed = stopAnchor !== 'solved'
  const ankerReach = ankerReachFromSim({
    startAge: currentAge,
    kernelDepletionMonth: sim.kernelDepletionMonth,
    endAge: sim.displayEndAge,
  })
  const reiktTot = anchorFixed ? ankerReachesAge(ankerReach) : null
  const vrijMogelijkVanaf = anchorFixed ? solveFireAgeWithoutAnchor(rawContext) : null

  // ── Anker-tekort (ADR 0129 D3) — hetzelfde blok als /toekomst ──
  // /toekomst toont onder een vast anker met een tekort ÉÉN blok voor
  // `anchor_shortfall` (pension_/stop_now_shortfall zijn tot F4 aliassen) met de
  // beschrijvende `ankerZin`. Het rapport draagt exact die zin — geen eigen kopij.
  const isAnkerTekort =
    outcome.kernelStatus === 'anchor_shortfall' ||
    outcome.kernelStatus === 'pension_shortfall' ||
    outcome.kernelStatus === 'stop_now_shortfall'
  const ankerStop = ankerStopFromSim({
    stopAnker: sim.stopAnker,
    vastStopLeeftijd: sim.vastStopLeeftijd,
  })
  const ankerTekortZin = isAnkerTekort ? ankerZin(ankerReach, ankerStop ?? { kind: 'now' }) : null

  // ── Tekort-lening vóór het planeinde (V7) — zelfde detector + copy als /toekomst ──
  // De grafiek vloert de lijn op 0 (y-schaal-invariant, zoals /toekomst); een
  // aangesproken tekort-lening is daardoor in het pad onzichtbaar. De detector telt
  // alleen t/m `displayEndAge − 1` (de staart erna is modelmarge, besluit 4 juli 2026).
  const tekortNotice = detectDeficitLoanFromRows(result.rows, { endAge: sim.displayEndAge })
  const tekortLening: ProjectieTekortLening | null = tekortNotice
    ? {
        firstAge: tekortNotice.firstAge,
        peak: tekortNotice.peak,
        copy: buildDeficitLoanCopy({
          firstAge: tekortNotice.firstAge,
          aowAge: lookupAowAge([...(rawContext.aowRows ?? [])], rawContext.profile.date_of_birth ?? null).fractional,
          displayEndAge: sim.displayEndAge,
          isPensioenMode: sim.strategy === 'pensioen',
          // Zelfde afleiding als dashboard-/core-loader: eigen woning aanwezig ∧ buiten de FIRE-pot.
          homeExcludedFromFire:
            deriveHousingContext([...rawContext.assets], [...rawContext.debts]).hasEigenHuis &&
            isHomeExcludedFromFire(parseHousingStrategy(rawContext.profile.housing_strategy_config)),
          peakText: formatCurrency(tekortNotice.peak),
          // Bewust géén vrijheidstijd bij de piek: de detector levert geen leeftijd bij
          // het piekmoment, dus er is geen canonieke deflator voor die teller (ADR 0093 §11).
          freedomText: null,
        }),
      }
    : null

  // ── Weergave-clip op het planeinde (B-043) ──
  // Exact de clip van /toekomst (`displaySimRows`) en /overzicht (`simRows`): rijen t/m
  // `displayEndAge − 1`, op de KERNEL-eindleeftijd (perpetual/pensioen = horizon-cap 100,
  // opeten/nalatenschap = fire_end_age). Puur en idempotent.
  const displayRows = clipRowsToPlanEnd(result.rows, sim.displayEndAge)
  const vermogenspad: ProjectieVermogenspadPunt[] = displayRows.map((r) => ({
    year: r.year,
    age: r.age,
    startNettoVermogen: Math.round(r.startNetWorth),
    nettoVermogen: Math.round(r.netWorth),
    inflationFactor: r.inflationFactor,
  }))
  const lastDisplayRow = displayRows.length > 0 ? displayRows[displayRows.length - 1] : null
  const eindwaardeNettoVermogen = lastDisplayRow ? Math.round(lastDisplayRow.netWorth) : 0
  const eindwaardeNettoLiquide = lastDisplayRow ? Math.round(lastDisplayRow.nettoLiquide) : 0

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
    eindwaardeNettoLiquide,
    ankerTekortZin,
    tekortLening,
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
