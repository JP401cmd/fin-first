// lib/tax-optimizer/rank.ts
//
// Ranking van de scenario's per fiscaal doel. Puur + deterministisch, en licht
// genoeg om client-side per doel-wissel te draaien (de scenario-generatie —
// calculateBox3 — gebeurt één keer server-side).

import type {
  GoalSection,
  OptimizerStrategy,
  OptimizerTopChoice,
  TaxOptimizerGoalId,
} from './types'

/**
 * Rangschik de niet-baseline scenario's volgens het doel.
 *
 * - box3-minimaal: puur op grootste besparing (aflopend).
 * - box3-geen-rendementsverlies: scenario's zónder rendementskosten eerst,
 *   dáárbinnen op besparing. Zo staat partnerverdeling (geen kosten) boven een
 *   samenstelling-shift (kost rendement).
 *
 * Stabiel: gelijke sleutels behouden hun invoervolgorde (generator-volgorde).
 */
export function rankStrategies(
  strategies: OptimizerStrategy[],
  goalId: TaxOptimizerGoalId,
): OptimizerStrategy[] {
  const withIndex = strategies.map((s, i) => ({ s, i }))
  withIndex.sort((a, b) => {
    if (goalId === 'box3-geen-rendementsverlies' && a.s.hasReturnCost !== b.s.hasReturnCost) {
      return a.s.hasReturnCost ? 1 : -1
    }
    if (b.s.savings !== a.s.savings) return b.s.savings - a.s.savings
    return a.i - b.i
  })
  return withIndex.map((x) => x.s)
}

/**
 * Kies het best passende scenario met een positieve besparing, of null.
 *
 * Bij 'box3-geen-rendementsverlies' telt alleen een scenario zónder
 * rendementskosten als "beste" — een besparing die rendement kost past niet bij
 * dat doel (de UI legt dan uit dat de kosteloze hefboom een fiscaal partner
 * vereist).
 *
 * BEWUST BRUTO. Het doel 'box3-minimaal' heet "zo min mogelijk Box 3-belasting":
 * daar is de grootste BRUTO besparing per definitie het beste scenario, ook als
 * die per saldo rendement kost. Zou pickBest hier op netto gaan ranken, dan zou
 * de sectie iets anders tonen dan haar eigen doel belooft. De NETTO-afweging
 * hoort thuis bij de leidende kans bovenaan — zie `pickTopChoice`.
 */
export function pickBest(
  ranked: OptimizerStrategy[],
  goalId: TaxOptimizerGoalId,
): OptimizerStrategy | null {
  const positive = ranked.filter((s) => !s.isBaseline && s.savings > 0)
  if (goalId === 'box3-geen-rendementsverlies') {
    return positive.find((s) => !s.hasReturnCost) ?? null
  }
  return positive[0] ?? null
}

// ── Leidende kans ("Je grootste kans nu") ────────────────────────

/**
 * Titel en kanttekening van de jaarruimte-kans — ÉÉN bron voor zowel het
 * top-blok (pickTopChoice) als de kansen-rij in de client
 * (components/overview/belasting/optimizer-model.ts importeert ze hier).
 */
export const JAARRUIMTE_TITLE = 'Benut je jaarruimte (lijfrente)'
export const JAARRUIMTE_CAVEAT =
  'Je zet dit bedrag vast tot je pensioen; de latere uitkering wordt belast, meestal tegen een lager tarief.'

/**
 * De leidende kans over ALLE doelen heen, of null wanneer er geen kans is die
 * per saldo iets oplevert.
 *
 * Puur: leest uitsluitend de al-gebouwde secties (dezelfde data die de secties
 * eronder renderen) — geen herberekening, geen tweede houder van een getal.
 *
 * KEUZECRITERIUM = NETTO. Kandidaten met `netEffect ≤ 0` vallen af; daarna wint
 * de meeste NETTO teruggekochte vrijheidsdagen (`netEffect` als tiebreak).
 * Voorheen werd op BRUTO besparing gekozen — daardoor kon een shift van "€ 47
 * minder heffing" bovenaan komen terwijl diezelfde shift honderden euro's
 * verwacht rendement kost.
 *
 * De Box 3-kandidaten komen bewust uit de VOLLEDIGE `ranked`-lijst van het
 * grootste-besparing-doel, niet uit `best`: `pickBest` rankt (terecht) op bruto
 * besparing, dus zijn winnaar kan een netto-negatieve shift zijn terwijl er in
 * dezelfde lijst nog een netto-positieve hefboom (partnerverdeling) staat. Die
 * zou anders stil uit de leidende kans vallen.
 *
 * De jaarruimte-kandidaat heeft geen rendementsverlies — de inleg blijft
 * renderen in de lijfrente — dus netEffect = besparing.
 */
export function pickTopChoice(sections: GoalSection[]): OptimizerTopChoice | null {
  const candidates: { choice: OptimizerTopChoice; netFreedomDays: number }[] = []

  const box3Section =
    sections.find(
      (s): s is Extract<GoalSection, { kind: 'box3' }> =>
        s.kind === 'box3' && s.goalId === 'box3-minimaal',
    ) ??
    sections.find((s): s is Extract<GoalSection, { kind: 'box3' }> => s.kind === 'box3')

  if (box3Section) {
    for (const s of box3Section.ranked) {
      if (s.isBaseline || s.netEffect <= 0) continue
      candidates.push({
        choice: {
          goalId: box3Section.goalId,
          title: s.title,
          savings: s.savings,
          freedomDays: s.freedomDays,
          netEffect: s.netEffect,
          caveat: s.caveat,
          kind: 'box3',
          opportunityId: s.id,
        },
        netFreedomDays: s.netFreedomDays,
      })
    }
  }

  const jaarruimte = sections.find(
    (s): s is Extract<GoalSection, { kind: 'jaarruimte' }> => s.kind === 'jaarruimte',
  )
  if (jaarruimte && jaarruimte.hasData && jaarruimte.besparing > 0) {
    candidates.push({
      choice: {
        goalId: jaarruimte.goalId,
        title: JAARRUIMTE_TITLE,
        savings: jaarruimte.besparing,
        freedomDays: jaarruimte.freedomDays,
        // Geen rendementsverlies: de inleg blijft renderen in de lijfrente.
        netEffect: jaarruimte.besparing,
        caveat: JAARRUIMTE_CAVEAT,
        kind: 'jaarruimte',
        opportunityId: jaarruimte.goalId,
      },
      // Zonder rendementsverlies vallen netto en bruto vrijheidsdagen samen —
      // we consumeren het sectie-veld i.p.v. het opnieuw te delen.
      netFreedomDays: jaarruimte.freedomDays,
    })
  }

  // Stabiel: bij gelijke netto uitkomst wint de eerst-toegevoegde kandidaat
  // (Box 3 vóór jaarruimte, binnen Box 3 de doel-ranking).
  candidates.sort(
    (a, b) => b.netFreedomDays - a.netFreedomDays || b.choice.netEffect - a.choice.netEffect,
  )
  return candidates[0]?.choice ?? null
}
