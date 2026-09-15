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
 * ## Gate (`promotie`) — eigenaarsbesluiten E4/E5/E6 (13 sep 2026), D12 (15 sep 2026)
 *  - geen run (alleen aow/age/now) → `geen/geen-run`; onder solved geen run-eis (gedrag van vóór ADR 0145)
 *  - `solved`                     → `vrijheidsleeftijd` bij `hasScenario || hasStopKeuze` (als vandaag), anders `geen/geen-verkenning`
 *  - `now`                        → nooit (`geen/nu-anker`) — verkennen mag, geen doel uit het lab
 *  - `aow`/`age`, zonder `hasScenario` → `geen/geen-verkenning` (een stopkeuze alleen is onder
 *                                   een vast anker geen doelstand, D4)
 *  - `aow`/`age`, met `hasScenario` → beslist door de stand die je VASTLEGT, dus de SCENARIO-run
 *                                   (eindreview I1, 15 sep 2026):
 *        scenario gedekt (bereik `gedekt`, eindvermogen geen negatief bedrag) → `eindvermogen`
 *        scenario met tekort                                               → `dekking`
 *        scenario-run nog onbekend (worker loopt)                          → terugval op de basis
 *                                   (tekort ? `dekking` : `eindvermogen`); de knop wacht dan op een
 *                                   bekend scenario-bedrag (`doelVastleggenMogelijk`, M10)
 *   Zo biedt de sheet nooit een negatief of opgeraakt eindvermogen als doel aan: een gedekte basis
 *   met een verkenning die het plan krap maakt (salaris −30 %, spaarquote −15 pp) wordt `dekking`.
 * "Doel loslaten" blijft in élke toestand beschikbaar — dat is UI, geen gate.
 *
 * ## D12 (eigenaarsbesluit 15 sep 2026) — eindvermogen als derde verandercomponent
 * Onder een vast anker was "gedekt" een doodlopend eind: 100 % blijft 100 %, dus de knoppen
 * lieten niets meer bewegen en er viel niets vast te leggen (`geen/gedekt`). Wat wél beweegt
 * is wat er op de eindleeftijd ÓVER is. Dat eindvermogen staat daarom naast dekking (%) en
 * bereik (leeftijd) als derde component, en bij een gedekt plan is het het doel dat het lab
 * schrijft (`end_balance`) — dit OVERSCHRIJFT eigenaarsbesluit E5 ("gedekt → geen doel uit
 * het lab"). De reden `geen/gedekt` bestaat daarmee niet meer.
 *
 * GRONDSLAG van het eindvermogen: `pickEndBalanceAtEndAge` (lib/goals/vrijheidsgetal-goal.ts)
 * op de reeds gedraaide run — het NETTO VERMOGEN (Prognose!I via `SimRow.endPortfolio =
 * netWorth`; bij een woonstrategie anders dan meerekenen telt de eigen woning mee) op
 * `displayEndAge`, NOMINAAL (kernel-native). Dus NIET het liquide vermogen (Prognose!J,
 * `nettoLiquide`) waarop de dekking staat — open besluit I vs J bij de eigenaar (ADR 0145 D12).
 * Bewust hergebruikt en geen tweede selectie: dit is exact de bron die het `end_balance`-doel al
 * meet. Wil een oppervlak "geld van vandaag" tonen, dan deflateert het via `factorAtAge`/`deflate`
 * (ADR 0090/0093) — nooit hier.
 *
 * WEERGAVEREGEL (eindreview I1): een eindvermogen BESTAAT alleen als de run de eindleeftijd haalt
 * (bereik `gedekt`). Raakt de run eerder op, dan financiert de kernel het tekort met de
 * synthetische tekort-lening en is Prognose!I op de eindleeftijd die lening (negatief, of positief
 * door een woning min die lening) — geen vermogen. `LabEindvermogen` is daarom een tagged union:
 * `bedrag` bij een gedekte run, `op` anders. Niet klemmen op € 0: dat verzwijgt dat het model leent.
 */

import { computeRunwayCoveragePct } from '@/lib/core-metrics'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import type { StopAnchor } from '@/lib/fire-strategy'
// `SimResult` is het consumer-typecontract dat `toSimResult` (lib/unified-projection.ts)
// produceert; het type zelf woont in lib/fire-simulation.ts.
import type { SimResult } from '@/lib/fire-simulation'
import type { ForcedStopPathResult } from '@/lib/horizon/scenario-presets'
// De ENE eindsaldo-selectie (grondslag: netto vermogen, Prognose!I, op displayEndAge, nominaal) —
// dezelfde die het `end_balance`-doel voedt. Geen tweede selectie (D12).
import { pickEndBalanceAtEndAge } from '@/lib/goals/vrijheidsgetal-goal'
import { ankerReachFromSim, ankerStopFromSim, type AnkerReach, type AnkerStop } from './anker-copy'

/** Mag er uit de huidige lab-stand een doel worden vastgelegd, en van welke soort? */
export type LabPromotie =
  | { readonly kind: 'vrijheidsleeftijd' }
  | { readonly kind: 'dekking' }
  /** ADR 0145 D12 — een GEDEKT plan onder een vast anker: het eindvermogen is wat nog beweegt. */
  | { readonly kind: 'eindvermogen' }
  | { readonly kind: 'geen'; readonly reden: 'nu-anker' | 'geen-verkenning' | 'geen-run' }

/**
 * Het eindvermogen van één run (ADR 0145 D12 + eindreview I1):
 *  - `bedrag` — de run haalt de eindleeftijd; `nominaal` is `pickEndBalanceAtEndAge(run)`;
 *  - `op`     — de run raakt vóór de eindleeftijd op: er is geen eindvermogen om te tonen.
 * `null` (op het veld) = niet bepaalbaar: geen run, geen rijen, of geen kernel-antwoord.
 */
export type LabEindvermogen =
  | { readonly kind: 'bedrag'; readonly nominaal: number }
  | { readonly kind: 'op' }

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
  /**
   * EINDVERMOGEN op de eindleeftijd van het plan (ADR 0145 D12) — de derde component
   * naast dekking (%) en bereik (leeftijd). NOMINAAL en op het NETTO VERMOGEN (Prognose!I,
   * `pickEndBalanceAtEndAge`, zie module-doc); een oppervlak dat "geld van nu" toont
   * deflateert zelf. `op` wanneer de run vóór de eindleeftijd opraakt (I1); `null` wanneer
   * de run geen rijen of geen kernel-antwoord draagt (stub/mock/geen run).
   */
  readonly basisEindvermogen: LabEindvermogen | null
  /** Idem voor de scenario-run; `null` zonder scenario. */
  readonly scenarioEindvermogen: LabEindvermogen | null
  /** Idem voor het stop-pad (verkend stopmoment); `null` zonder stopkeuze. */
  readonly verkendEindvermogen: LabEindvermogen | null
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

/**
 * Eindvermogen van één REEDS GEDRAAIDE run (ADR 0145 D12) — puur een rij-selectie via
 * `pickEndBalanceAtEndAge`: de laatste rij met `age <= displayEndAge`, veld `endPortfolio`.
 * Alleen een run die de eindleeftijd haalt (`reach.kind === 'gedekt'`) heeft een bedrag
 * (eindreview I1); een run die eerder opraakt is `op`. `null` zonder bruikbaar bereik
 * (stub/mock zonder kernel-antwoord) of — bij een gedekte run — zonder rijen.
 */
function eindvermogenVanRun(run: SimResult | null, reach: AnkerReach | null): LabEindvermogen | null {
  if (run == null || reach == null) return null
  if (reach.kind === 'onbekend') return null
  if (reach.kind !== 'gedekt') return { kind: 'op' }
  const nominaal = pickEndBalanceAtEndAge(run)
  return nominaal == null ? null : { kind: 'bedrag', nominaal }
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
  const basisEindvermogen = basis != null ? eindvermogenVanRun(basis, basisReach) : null
  const scenarioEindvermogen = eindvermogenVanRun(scenario, scenarioReach)
  const verkendEindvermogen = eindvermogenVanRun(stopPad?.result ?? null, verkendReach)
  const tekort = basisPct != null && basisPct < 100
  const maandHint = maandHintVan(stopPad, input.kernelMaandHint)

  // D12 + eindreview I1: de promotie volgt de stand die je VASTLEGT — de scenario-run. Is die
  // gedekt (met een eindvermogen dat geen negatief bedrag is), dan legt het lab het
  // eindvermogen (`end_balance`) vast; heeft die een tekort, dan de dekking. Zolang de
  // scenario-run nog niet bekend is (worker), valt de keuze terug op de basis — de knop wacht
  // dan in horizon-client op een bekend scenario-bedrag (M10). Beide eisen een verkenning
  // (`hasScenario`): zonder knopbeweging is er geen lab-stand om vast te leggen (D4).
  const scenarioBekend = scenarioReach != null && scenarioReach.kind !== 'onbekend'
  const scenarioGedekt =
    scenarioReach?.kind === 'gedekt' && !(scenarioEindvermogen?.kind === 'bedrag' && scenarioEindvermogen.nominaal < 0)
  const vastTeLeggen: LabPromotie = scenarioBekend
    ? scenarioGedekt ? { kind: 'eindvermogen' } : { kind: 'dekking' }
    : tekort ? { kind: 'dekking' } : { kind: 'eindvermogen' }
  const promotie: LabPromotie =
    basis == null || basisPct == null
      ? { kind: 'geen', reden: 'geen-run' }
      : planAnchor.kind === 'now'
        ? { kind: 'geen', reden: 'nu-anker' }
        : !hasScenario
          ? { kind: 'geen', reden: 'geen-verkenning' }
          : vastTeLeggen

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
    basisEindvermogen,
    scenarioEindvermogen,
    verkendEindvermogen,
    tekort,
    maandHint,
    promotie,
  }
}
