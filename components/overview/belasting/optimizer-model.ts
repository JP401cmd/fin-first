// components/overview/belasting/optimizer-model.ts
//
// Presentatie-model voor de fiscale optimizer: één vlakke lijst "kansen" die de
// vergelijking (katern II) én de uitwerking (katern III) voedt.
//
// HARDE REGEL: hier wordt NIETS gerekend. Elk getal komt één-op-één uit de
// geleverde `GoalSection`s (server-side gegenereerd door lib/tax-optimizer op
// basis van de canonieke Box 3-/Box 1-motoren). Dit bestand mapt en sorteert
// alleen — geen forfaits, geen dag-conversie, geen netto-effect-som.

import type { GoalSection, OptimizerStrategy, OptimizerTopChoice } from '@/lib/tax-optimizer/types'
import { JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT } from '@/lib/tax-optimizer/rank'

/** Redactionele driepunts-score (● ● ○) — kwalitatief, geen rekenwaarde. */
export type Dots = 1 | 2 | 3

// Eén bron voor de jaarruimte-teksten (lib/tax-optimizer/rank.ts) — het
// top-blok en de kansen-rij kunnen zo nooit uit elkaar drijven.
export { JAARRUIMTE_TITLE, JAARRUIMTE_CAVEAT }

/**
 * Eén doorgerekende kans in de vergelijking. `savings`, `returnCostEur`,
 * `netEffect` en `netFreedomDays` zijn GELEVERDE velden — nooit hier afgeleid.
 */
export interface Opportunity {
  id: string
  kind: 'box3' | 'jaarruimte'
  /** Fiscale as als kolom-tag. */
  boxLabel: 'Box 3' | 'Box 1'
  title: string
  description: string
  /** Bruto belastingbesparing per jaar (€). */
  savings: number
  /** Verwacht misgelopen rendement per jaar (€, ≥ 0). 0 = geen rendementseffect. */
  returnCostEur: number
  /** savings − returnCostEur (kan negatief zijn). */
  netEffect: number
  /** `netEffect` in vrijheidsdagen (0 wanneer ≤ 0). */
  netFreedomDays: number
  hasReturnCost: boolean
  /** Heffing ná dit scenario (€/jr). null = deze kans verlaagt de Box 3-heffing niet. */
  optimizedTax: number | null
  detail: string[]
  caveat: string | null
  /** "Vermogen blijft vrij" — 3 = volledig vrij beschikbaar. */
  freedomDots: Dots
  freedomNote: string | null
  /** "Moeite" — 1 = een vinkje bij de aangifte, 3 = flink wat werk. */
  effortDots: Dots
  effortNote: string | null
  /** De onderliggende Box 3-strategie (voor de kassabon in katern III). */
  strategy: OptimizerStrategy | null
}

/** Kwalitatieve voorwaarden per scenario-soort — vast, niet uit cijfers afgeleid. */
function box3Conditions(strategy: OptimizerStrategy): Pick<
  Opportunity,
  'freedomDots' | 'freedomNote' | 'effortDots' | 'effortNote'
> {
  if (strategy.kind === 'partnerverdeling') {
    return {
      freedomDots: 3,
      freedomNote: null,
      effortDots: 1,
      effortNote: 'keuze bij de aangifte',
    }
  }
  return {
    freedomDots: 3,
    freedomNote: null,
    effortDots: 2,
    effortNote: 'vermogen daadwerkelijk herschikken',
  }
}

function toOpportunity(strategy: OptimizerStrategy): Opportunity {
  return {
    id: strategy.id,
    kind: 'box3',
    boxLabel: 'Box 3',
    title: strategy.title,
    description: strategy.description,
    savings: strategy.savings,
    returnCostEur: strategy.returnCostEur,
    netEffect: strategy.netEffect,
    netFreedomDays: strategy.netFreedomDays,
    hasReturnCost: strategy.hasReturnCost,
    optimizedTax: strategy.optimizedTax,
    detail: strategy.detail,
    caveat: strategy.caveat,
    strategy,
    ...box3Conditions(strategy),
  }
}

function jaarruimteOpportunity(
  section: Extract<GoalSection, { kind: 'jaarruimte' }>,
): Opportunity {
  return {
    // Zelfde id als `pickTopChoice` in zijn `opportunityId` zet (het doel-id) —
    // daarop koppelt `findWinner` de badge aan deze rij.
    id: section.goalId,
    kind: 'jaarruimte',
    boxLabel: 'Box 1',
    title: JAARRUIMTE_TITLE,
    description:
      'Een lijfrente-inleg verlaagt je belastbaar inkomen in Box 1 tegen je marginale tarief.',
    savings: section.besparing,
    // De jaarruimte-kans kost geen verwacht rendement: het bedrag blijft belegd
    // binnen de lijfrente. Netto = de geleverde besparing.
    returnCostEur: 0,
    netEffect: section.besparing,
    netFreedomDays: section.freedomDays,
    hasReturnCost: false,
    optimizedTax: null,
    detail: [],
    caveat: JAARRUIMTE_CAVEAT,
    freedomDots: 1,
    freedomNote: 'vast tot pensioen, uitkering later belast',
    effortDots: 2,
    effortNote: 'rekening openen + storten',
    strategy: null,
  }
}

/**
 * Vlakke kansen-lijst uit de geleverde secties. De twee Box 3-doelen leveren
 * dezelfde scenario's (anders gerankt) — we ontdubbelen op `id`. De
 * jaarruimte-kans doet mee zodra er data én een besparing is.
 */
export function buildOpportunities(sections: GoalSection[]): {
  baseline: OptimizerStrategy | null
  opportunities: Opportunity[]
} {
  const box3Sections = sections.filter(
    (s): s is Extract<GoalSection, { kind: 'box3' }> => s.kind === 'box3',
  )
  const baseline = box3Sections[0]?.baseline ?? null

  const seen = new Map<string, OptimizerStrategy>()
  for (const section of box3Sections) {
    for (const strategy of section.ranked) {
      if (!seen.has(strategy.id)) seen.set(strategy.id, strategy)
    }
  }
  const opportunities = [...seen.values()].map(toOpportunity)

  const jaarruimte = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  if (jaarruimte && jaarruimte.hasData && jaarruimte.besparing > 0) {
    opportunities.push(jaarruimteOpportunity(jaarruimte))
  }

  return { baseline, opportunities }
}

// ── Sorteerstanden ───────────────────────────────────────────────

export type SortMode = 'netto' | 'besparing' | 'geen-verlies'

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'netto', label: 'Netto effect' },
  { id: 'besparing', label: 'Grootste besparing' },
  { id: 'geen-verlies', label: 'Zonder rendementsverlies' },
]

/** Sorteert/filtert op GELEVERDE velden — geen herberekening. */
export function sortOpportunities(list: Opportunity[], mode: SortMode): Opportunity[] {
  const arr = mode === 'geen-verlies' ? list.filter((o) => !o.hasReturnCost) : [...list]
  if (mode === 'besparing') {
    arr.sort((a, b) => b.savings - a.savings || b.netEffect - a.netEffect)
  } else {
    arr.sort((a, b) => b.netEffect - a.netEffect || b.savings - a.savings)
  }
  return arr
}

/** Koppelt de server-gekozen topkans op id aan de bijbehorende rij in de lijst. */
export function findWinner(
  opportunities: Opportunity[],
  topChoice: OptimizerTopChoice | null,
): Opportunity | null {
  if (!topChoice) return null
  return opportunities.find((o) => o.id === topChoice.opportunityId) ?? null
}

/**
 * Eerste zin van een kanttekening, geschikt als staartje achter "let op:".
 * Zet de beginletter klein tenzij het woord duidelijk een eigennaam/afkorting
 * is (tweede teken is dan geen kleine letter, bv. "Box 3").
 */
export function shortCaveat(caveat: string): string {
  const first = caveat.split(/[.;]/)[0]?.trim() ?? ''
  if (first.length < 2) return first
  const second = first[1]
  if (second !== second.toLowerCase()) return first
  return first[0].toLowerCase() + first.slice(1)
}
