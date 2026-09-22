// lib/horizon/plan-status.ts
//
// Het stoplicht van "Je plan" op /overzicht — één regel voor de plankaart, het
// statuspunt en de vrijheidsbanner (eigenaarsbesluit 15 sep 2026). Pure mapping,
// consume-only: rekent niets, leest de dekking uit de bundel en de haalbaarheid
// uit de hoofdrun.
//
//  - Vast stopmoment (aow/now/age): de dekking van het plan, met de drempels van
//    de dekkingsstrook op /toekomst (`coverageStatus`) — ≥100 groen, 90–99
//    oranje, <90 rood.
//  - Zo vroeg mogelijk (solved): de solver zoekt per definitie een gedekt
//    stopmoment, dus groen — behalve als hij er binnen de horizon geen vindt.
//    `freedomPct` is daar een kapitaalratio en telt bewust niet mee.
//    Heeft de gebruiker een DOEL vastgelegd met een stopleeftijd en reikt dat doel
//    niet, dan oranje: het plan is haalbaar, het doel nog niet (ADR 0175, 22 sep 2026).
//
// LET OP de bron van `solvedReachable`: dat is `sim.fireReachable` van de HOOFDRUN
// (`computeHorizonFireSim`), niet het `solverStatus` van `computeHorizonRunway` —
// die runway is onder solved de "stop vandaag"-run en zou iedereen die niet vandaag
// kan stoppen rood kleuren.

import type { LeverageStatus } from '@/lib/leverage-status'
import type { Oordeelzin } from '@/lib/hefboom-oordeelzin'
import { coverageStatus } from '@/lib/horizon/coverage-strip'

export interface PlanStatusInput {
  /** Het stopmoment ligt vast (aow/now/age). */
  anchorFixed: boolean
  /** Plan-dekking in % onder een vast anker (canoniek `freedomPct`). */
  coveragePct: number | null | undefined
  /** `sim.fireReachable` van de hoofdrun — alleen gelezen onder solved; `null` = geen run. */
  solvedReachable: boolean | null | undefined
  /**
   * Reikt het vastgelegde doel (`vastgelegdDoelGedekt`, ADR 0175)? Alleen gelezen onder
   * solved én bij een haalbaar plan. Afwezig/`null` = geen doel met stopleeftijd, of niet te
   * beoordelen — dan telt alleen de haalbaarheid, precies het gedrag van vóór ADR 0175.
   */
  doelGedekt?: boolean | null
}

/** Onder solved: het plan is haalbaar, maar het vastgelegde doel reikt niet (ADR 0175). */
function doelReiktNiet(input: PlanStatusInput): boolean {
  return input.solvedReachable === true && input.doelGedekt === false
}

const FROM_COVERAGE: Record<ReturnType<typeof coverageStatus>, LeverageStatus> = {
  green: 'good',
  amber: 'warn',
  red: 'bad',
}

export function resolvePlanStatus(input: PlanStatusInput): LeverageStatus {
  if (input.anchorFixed) {
    const pct = input.coveragePct
    if (pct == null || !Number.isFinite(pct)) return 'neutral'
    // Afronden zoals de kaart het toont ("dekt 90% van je plan" is oranje, niet rood).
    return FROM_COVERAGE[coverageStatus(Math.round(pct))]
  }
  if (input.solvedReachable == null) return 'neutral'
  if (doelReiktNiet(input)) return 'warn'
  return input.solvedReachable ? 'good' : 'bad'
}

/** Het plan-oordeel als één zin + zijn stoplichtstand. */
export interface PlanVerdict {
  /** Uitspraak voor de paginatitel, bv. "Plan dekt 96%". `null` = geen oordeel. */
  label: string | null
  status: LeverageStatus
}

/**
 * Dezelfde regel als `resolvePlanStatus`, nu óók in woorden — voor de
 * paginatitel van /toekomst (`PageVerdictOpening`). Consume-only: geen tweede
 * drempel, geen eigen som; de status komt letterlijk uit `resolvePlanStatus`
 * en het percentage is het canonieke `freedomPct` dat hier alleen wordt
 * afgerond zoals de plankaart het al toont.
 *
 * Twee modi, exact de twee takken hierboven:
 *  - vast stopmoment → de DEKKING van het plan ("Plan dekt 96%");
 *  - zo vroeg mogelijk → geen dekking maar de haalbaarheid van de hoofdrun, en bij
 *    een vastgelegd doel dat niet reikt "Plan haalbaar, doel nog niet" (ADR 0175).
 *
 * Beschrijvend, nooit aansporend (Wft-grens).
 */
export function resolvePlanVerdict(input: PlanStatusInput): PlanVerdict {
  const status = resolvePlanStatus(input)
  if (input.anchorFixed) {
    const pct = input.coveragePct
    if (pct == null || !Number.isFinite(pct)) return { label: null, status }
    return { label: `Plan dekt ${Math.round(pct)}%`, status }
  }
  if (input.solvedReachable == null) return { label: null, status }
  if (doelReiktNiet(input)) return { label: 'Plan haalbaar, doel nog niet', status }
  return {
    label: input.solvedReachable ? 'Plan is haalbaar' : 'Plan nog niet haalbaar',
    status,
  }
}

/** Het plan-oordeel als kop-ZIN + zijn stoplichtstand. */
export interface PlanVerdictSentence {
  /** "Je toekomstplan is *voor 96% gedekt*." `null` = geen oordeel, kale paginanaam. */
  sentence: Oordeelzin | null
  status: LeverageStatus
}

/** Vast onderwerp van de /toekomst-kop — draagt het paginawoord. */
export const PLAN_ONDERWERP = 'Je toekomstplan'

/**
 * De kop van /toekomst als zin (ADR 0174 D6). Staat náást `resolvePlanVerdict`
 * en volgt exact dezelfde twee takken: dezelfde status (letterlijk uit
 * `resolvePlanStatus`) en hetzelfde afgeronde percentage. Er is geen tweede
 * drempel en geen eigen som.
 *
 *  - vast stopmoment → "Je toekomstplan is *voor 96% gedekt*.", in de kleur van
 *    de dekking (≥100 groen, 90–99 oranje, <90 rood);
 *  - zo vroeg mogelijk → "is *haalbaar*" of "is *nog niet haalbaar*"; reikt een
 *    vastgelegd doel niet, dan "is *haalbaar, je doel nog niet*" in oranje (ADR 0175).
 *
 * Beschrijvend, nooit aansporend (Wft-grens).
 */
export function resolvePlanVerdictSentence(input: PlanStatusInput): PlanVerdictSentence {
  const status = resolvePlanStatus(input)
  const voor = `${PLAN_ONDERWERP} is`
  if (input.anchorFixed) {
    const pct = input.coveragePct
    if (pct == null || !Number.isFinite(pct)) return { sentence: null, status }
    return { sentence: { voor, oordeel: `voor ${Math.round(pct)}% gedekt` }, status }
  }
  if (input.solvedReachable == null) return { sentence: null, status }
  if (doelReiktNiet(input)) return { sentence: { voor, oordeel: 'haalbaar, je doel nog niet' }, status }
  return {
    sentence: { voor, oordeel: input.solvedReachable ? 'haalbaar' : 'nog niet haalbaar' },
    status,
  }
}
