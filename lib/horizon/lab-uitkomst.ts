/**
 * Lab-uitkomst — ÉÉN pure uitkomst-switch voor het lab onder de grafiek op /toekomst
 * (ADR 0145: "het doelscenario volgt het anker: dekking als uitkomst").
 *
 * Pure, isomorfe module: GEEN `'use client'`, geen Supabase, geen kernel-run.
 *
 * ## Waarom
 * Hetzelfde lab, één andere uitkomstmaat. Onder `solved` bewegen de knoppen de
 * VRIJHEIDSLEEFTIJD ("X mnd eerder vrij"). Onder een vast stopmoment (`aow`/`age`/`now`)
 * is de kernel-`fireAge` per constructie het anker en zegt een leeftijd-delta niets;
 * daar bewegen de knoppen de DEKKING — reikt het plan tot de eindleeftijd, en voor
 * hoeveel procent. Vóór dit besluit las elk oppervlak (badges, banner, sheet, radar-
 * subtitel) zijn eigen combinatie van `hasScenario`/`hasStopKeuze`/`fireAgeFractional`;
 * deze module is de ene plek waar de anker-afhankelijke uitkomst én de promotie-gate
 * ("mag hier een doel uit het lab komen?") worden bepaald.
 *
 * ## CONSUME, DON'T RECOMPUTE
 *  - Dekking per run = `computeRunwayCoveragePct({ kernelDepletionMonth, eindMaand:
 *    eindMaandVan(displayEndAge, currentAge), ankerMaand })` — LETTERLIJK de formule van
 *    `lib/horizon-data-loader.ts` (regel ~166–175), dus `basisPct` ≡ het vrijheids-% van
 *    de bundel onder een vast anker (ADR 0129 D5/B3). Eén home in lib/core-metrics.ts.
 *  - Bereik ("reikt tot je 82e") via `ankerReachFromSim` (lib/horizon/anker-copy.ts).
 *  - Het stopmoment via `ankerStopFromSim` (kernel-echo), met het plan-anker als terugval
 *    vóór de eerste run — dezelfde volgorde als `ankerStop` in horizon-client.
 *  - Geen extra kernel-run: de scenario-run draait al op het plan-anker
 *    (`lib/hooks/use-horizon-fire-sim.ts`, sync- én worker-tak allebei via `toSimResult`,
 *    dus `kernelDepletionMonth`/`ankerMaand`/`displayEndAge` staan op `scenario.result`),
 *    en het stop-pad (`ForcedStopPathResult`) draagt `result` + `maandHint`. De bridge
 *    zet `ankerMaand` uit `solve.vastStopLeeftijd` van DIE run (contract-ronde K3), dus
 *    op het stop-pad meet de dekking vanaf het verkende stopmoment — precies wat bedoeld is.
 *
 * ## Welke horizon-client-waarden voeden welke input
 *  - `planAnchor`      ← `planAnchor` (kernel-echo `stopAnchorFromKernel(simResult.stopAnker)`,
 *                        vóór de run `initialData.firePlan.anchor`)
 *  - `currentAge`      ← `currentAge` (`ageAtDate(effectiveInput.dateOfBirth)`)
 *  - `basis`           ← `simResult` (de hoofd-run)
 *  - `scenario`        ← `hasScenario && scenario != null ? scenario.result : null`
 *  - `stopPad`         ← `stopPad` (de hook-`stopPad`, `HorizonStopPadResult`), of `null`
 *  - `kernelMaandHint` ← `kernelMaandHint` (hook-veld; P!B96 van de hoofd-run)
 *  - `hasScenario`     ← `hasScenario` · `hasStopKeuze` ← `hasStopKeuze`
 *
 * ## maandHint — prioriteit (open punt 1, getoetst 14 sep 2026)
 * De solver rekent P!B96 (`maandHint = −gap ÷ maanden tot eind`) voor ÉLKE doorgerekende
 * stand, ongeacht de status — dus óók onder `anchor_shortfall` (lib/horizon-kernel/
 * solver.ts `computeStatusBlok`; de bridge geeft 'm door als `kernelMaandHint`,
 * bridge.ts ~:1031). Prioriteit hier: `stopPad.maandHint > 0` (de verkende stop wint,
 * dat is de run die de radar/strook al voeden) ▸ anders `kernelMaandHint > 0` (plan-
 * variant zónder slider-beweging) ▸ anders `null`. `> 0 ⟺ tekort` per constructie
 * (teken van −gap). NOOIT een lokale formule.
 *
 * ## Gate (`promotie`) — eigenaarsbesluiten E4/E5/E6 (13 sep 2026)
 *  - geen run (alleen aow/age/now) → `geen/geen-run`; onder solved geen run-eis (gedrag van vóór ADR 0145)
 *  - `solved`                     → `vrijheidsleeftijd` bij `hasScenario || hasStopKeuze` (als vandaag), anders `geen/geen-verkenning`
 *  - `now`                        → nooit (`geen/nu-anker`) — verkennen mag, geen doel uit het lab
 *  - `aow`/`age`, gedekt          → nooit (`geen/gedekt`) — de losse doelen volstaan
 *  - `aow`/`age`, tekort          → `dekking` alleen bij `hasScenario` (een stopkeuze alleen
 *                                   is onder een vast anker geen doelstand, D4), anders `geen/geen-verkenning`
 * "Doel loslaten" blijft in élke toestand beschikbaar — dat is UI, geen gate.
 */

import { computeRunwayCoveragePct } from '@/lib/core-metrics'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import type { StopAnchor } from '@/lib/fire-strategy'
// `SimResult` is het consumer-typecontract dat `toSimResult` (lib/unified-projection.ts)
// produceert; het type zelf woont in lib/fire-simulation.ts.
import type { SimResult } from '@/lib/fire-simulation'
import type { ForcedStopPathResult } from '@/lib/horizon/scenario-presets'
import { ankerReachFromSim, ankerStopFromSim, type AnkerReach, type AnkerStop } from './anker-copy'

/** Mag er uit de huidige lab-stand een doel worden vastgelegd, en van welke soort? */
export type LabPromotie =
  | { readonly kind: 'vrijheidsleeftijd' }
  | { readonly kind: 'dekking' }
  | { readonly kind: 'geen'; readonly reden: 'nu-anker' | 'gedekt' | 'geen-verkenning' | 'geen-run' }

/** De minimale vorm van het stop-pad die deze switch leest (`HorizonStopPadResult`). */
export type LabStopPad = Pick<ForcedStopPathResult, 'result' | 'maandHint' | 'stopAge'>

export interface LabUitkomstInput {
  /** Het plan-anker (kernel-echo, met de bundel als terugval vóór de run). */
  planAnchor: StopAnchor
  /** Huidige leeftijd = de kernel-tijdas (maand 0). `null` zonder geboortedatum. */
  currentAge: number | null
  /** De hoofd-run (`simResult`); `null` = nog geen run. */
  basis: SimResult | null
  /** De scenario-run (`scenario.result`) — alleen wanneer `hasScenario`, anders `null`. */
  scenario: SimResult | null
  /** Het gekozen-stop-pad (`stopPad`), of `null` zonder stopkeuze. */
  stopPad: LabStopPad | null
  /** P!B96 van de hoofd-run (`kernelMaandHint` uit de hook). */
  kernelMaandHint: number | null
  /** Er staat minstens één knop/marktbias anders dan de basis. */
  hasScenario: boolean
  /** Er staat een stopkeuze (slider) — telt alleen onder `solved` als doelstand. */
  hasStopKeuze: boolean
}

/** `solved`: passthrough van de bestaande vrijheidsleeftijd-delta. */
export interface LabUitkomstVrijheidsleeftijd {
  readonly kind: 'vrijheidsleeftijd'
  /** `simResult.fireAgeFractional`. */
  readonly basisFireAge: number | null
  /** De scenario-leeftijd; zonder scenario de basis (zelfde terugval als `scenarioVerwachtFireAge`). */
  readonly scenarioFireAge: number | null
  /** `round((scenario − basis) × 12)`; negatief = eerder vrij. `null` zonder een van beide. */
  readonly deltaMaanden: number | null
  readonly promotie: LabPromotie
}

/** `aow`/`age`/`now`: dekking als uitkomstmaat. */
export interface LabUitkomstDekking {
  readonly kind: 'dekking'
  /** Het stopmoment als zin-onderwerp; `null` wanneer de leeftijd (nog) niet bekend is. */
  readonly stop: AnkerStop | null
  /** Eindleeftijd van het plan (`displayEndAge`). */
  readonly eind: number | null
  /** Dekking van de hoofd-run — ≡ het vrijheids-% van de bundel. `null` = niet bepaalbaar. */
  readonly basisPct: number | null
  readonly basisReach: AnkerReach
  /** Dekking/bereik van de scenario-run; `null` zonder scenario. */
  readonly scenarioPct: number | null
  readonly scenarioReach: AnkerReach | null
  /** Dekking/bereik van het stop-pad (verkend stopmoment); `null` zonder stopkeuze. */
  readonly verkendPct: number | null
  readonly verkendReach: AnkerReach | null
  readonly verkendStopAge: number | null
  /** `basisPct < 100`: het plan reikt niet tot de eindleeftijd. */
  readonly tekort: boolean
  /** €/mnd-extra-sparen-hint (P!B96), zie module-doc; `null` = geen tekort of onbekend. */
  readonly maandHint: number | null
  readonly promotie: LabPromotie
}

export type LabUitkomst = LabUitkomstVrijheidsleeftijd | LabUitkomstDekking

function finiteOrNull(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null
}

/**
 * Dekking van één REEDS GEDRAAIDE run — letterlijk de loader-formule. `null` wanneer
 * de run geen kernel-antwoord draagt (`kernelDepletionMonth === undefined`: stub/mock/
 * scalar — dezelfde lezing als `ankerReachFromSim` → 'onbekend') of er geen tijdas is.
 * Op een echte kernel-run is dit byte-identiek aan `horizon-data-loader.ts#freedomPct`.
 */
export function dekkingVanRun(
  run: Partial<Pick<SimResult, 'kernelDepletionMonth' | 'ankerMaand'>> & Pick<SimResult, 'displayEndAge'> | null,
  currentAge: number | null,
): number | null {
  if (run == null) return null
  if (currentAge == null || !Number.isFinite(currentAge)) return null
  if (run.kernelDepletionMonth === undefined) return null
  if (!Number.isFinite(run.displayEndAge)) return null
  return computeRunwayCoveragePct({
    kernelDepletionMonth: run.kernelDepletionMonth,
    eindMaand: eindMaandVan(run.displayEndAge, currentAge),
    ankerMaand: run.ankerMaand ?? null,
  })
}

function reachVanRun(run: SimResult, currentAge: number | null): AnkerReach {
  return ankerReachFromSim({
    startAge: currentAge,
    kernelDepletionMonth: run.kernelDepletionMonth,
    endAge: run.displayEndAge,
  })
}

/** Het stopmoment: kernel-echo eerst, dan het plan-anker (zelfde volgorde als horizon-client). */
function stopVan(basis: SimResult | null, planAnchor: StopAnchor): AnkerStop | null {
  if (basis != null) {
    const echo = ankerStopFromSim({ stopAnker: basis.stopAnker, vastStopLeeftijd: basis.vastStopLeeftijd })
    if (echo != null) return echo
  }
  if (planAnchor.kind === 'now') return { kind: 'now' }
  if (planAnchor.kind === 'age') return { kind: 'age', stopAge: planAnchor.age }
  return null
}

/** De maandhint volgens de prioriteit uit de module-doc; nooit een eigen som. */
function maandHintVan(stopPad: LabStopPad | null, kernelMaandHint: number | null): number | null {
  const verkend = finiteOrNull(stopPad?.maandHint)
  if (verkend != null && verkend > 0) return verkend
  const plan = finiteOrNull(kernelMaandHint)
  if (plan != null && plan > 0) return plan
  return null
}

/**
 * DE uitkomst-switch. Zie de module-doc voor de grondslag en de gate.
 */
export function resolveLabUitkomst(input: LabUitkomstInput): LabUitkomst {
  const { planAnchor, currentAge, basis, hasScenario, hasStopKeuze } = input
  const scenario = hasScenario ? input.scenario : null

  // ── solved: passthrough van vandaag ──────────────────────────────────────
  if (planAnchor.kind === 'solved') {
    const basisFireAge = finiteOrNull(basis?.fireAgeFractional)
    const scenarioFireAge = scenario != null ? finiteOrNull(scenario.fireAgeFractional) ?? basisFireAge : basisFireAge
    const deltaMaanden =
      basisFireAge != null && scenarioFireAge != null ? Math.round((scenarioFireAge - basisFireAge) * 12) : null
    // Bewust GEEN run-eis onder solved: de knop "Maak dit mijn doel" stond vóór
    // ADR 0145 al klaar zodra je verkende, ook terwijl de eerste run nog liep.
    const promotie: LabPromotie =
      hasScenario || hasStopKeuze
        ? { kind: 'vrijheidsleeftijd' }
        : { kind: 'geen', reden: 'geen-verkenning' }
    return { kind: 'vrijheidsleeftijd', basisFireAge, scenarioFireAge, deltaMaanden, promotie }
  }

  // ── aow / age / now: dekking ─────────────────────────────────────────────
  const stop = stopVan(basis, planAnchor)
  const eind = finiteOrNull(basis?.displayEndAge)
  const basisPct = dekkingVanRun(basis, currentAge)
  const basisReach: AnkerReach = basis != null ? reachVanRun(basis, currentAge) : { kind: 'onbekend' }
  const scenarioPct = scenario != null ? dekkingVanRun(scenario, currentAge) : null
  const scenarioReach = scenario != null ? reachVanRun(scenario, currentAge) : null
  const stopPad = input.stopPad
  const verkendPct = stopPad != null ? dekkingVanRun(stopPad.result, currentAge) : null
  const verkendReach = stopPad != null ? reachVanRun(stopPad.result, currentAge) : null
  const verkendStopAge = stopPad != null ? (finiteOrNull(stopPad.result.fireAgeFractional) ?? finiteOrNull(stopPad.stopAge)) : null
  const tekort = basisPct != null && basisPct < 100
  const maandHint = maandHintVan(stopPad, input.kernelMaandHint)

  const promotie: LabPromotie =
    basis == null || basisPct == null
      ? { kind: 'geen', reden: 'geen-run' }
      : planAnchor.kind === 'now'
        ? { kind: 'geen', reden: 'nu-anker' }
        : !tekort
          ? { kind: 'geen', reden: 'gedekt' }
          : hasScenario
            ? { kind: 'dekking' }
            : { kind: 'geen', reden: 'geen-verkenning' }

  return {
    kind: 'dekking',
    stop,
    eind,
    basisPct,
    basisReach,
    scenarioPct,
    scenarioReach,
    verkendPct,
    verkendReach,
    verkendStopAge,
    tekort,
    maandHint,
    promotie,
  }
}
