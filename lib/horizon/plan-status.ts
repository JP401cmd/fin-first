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
//
// LET OP de bron van `solvedReachable`: dat is `sim.fireReachable` van de HOOFDRUN
// (`computeHorizonFireSim`), niet het `solverStatus` van `computeHorizonRunway` —
// die runway is onder solved de "stop vandaag"-run en zou iedereen die niet vandaag
// kan stoppen rood kleuren.

import type { LeverageStatus } from '@/lib/leverage-status'
import { coverageStatus } from '@/lib/horizon/coverage-strip'

export interface PlanStatusInput {
  /** Het stopmoment ligt vast (aow/now/age). */
  anchorFixed: boolean
  /** Plan-dekking in % onder een vast anker (canoniek `freedomPct`). */
  coveragePct: number | null | undefined
  /** `sim.fireReachable` van de hoofdrun — alleen gelezen onder solved; `null` = geen run. */
  solvedReachable: boolean | null | undefined
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
  return input.solvedReachable ? 'good' : 'bad'
}
