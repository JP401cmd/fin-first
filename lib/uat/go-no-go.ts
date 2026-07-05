// Pure go/no-go-berekening voor de UAT-procesplaat (Deel 2 §2.2 exitcriteria +
// Deel 3 §3.5 van docs/uat/uat-plan.md). GEEN React, GEEN data-fetching —
// alleen de vier exitcriteria toegepast op catalogus + resultaten van één
// (actieve) testronde. De client (uat-plaat-client.tsx) roept dit aan met de
// volledige catalogus en de resultaten van de geselecteerde ronde.

import { UAT_SCENARIOS, type UatPlatform, type UatScenario } from './catalog'
import { buildResultLookup, computeCoverage, deriveSubStatus, resultKey, type UatResultRow } from './status'

export interface GoNoGoCriterion {
  id: 'rooktest' | 'kern' | 's0s1' | 'dekking'
  label: string
  gehaald: boolean
  detail: string
}

export interface GoNoGoResult {
  criteria: GoNoGoCriterion[]
  go: boolean
}

/**
 * Telt hoeveel sub×platform-instanties van de gegeven scenario's 'groen'
 * (geslaagd) zijn, en het totaal aantal instanties. Met `platformFilter` telt
 * alleen dat platform mee (bv. enkel 'webapp' voor het KERN-exitcriterium).
 */
function countGreen(
  scenarios: readonly UatScenario[],
  lookup: Map<string, UatResultRow>,
  platformFilter?: UatPlatform,
): { total: number; groen: number } {
  let total = 0
  let groen = 0
  for (const s of scenarios) {
    for (const sub of s.subscenarios) {
      for (const platform of s.platforms) {
        if (platformFilter && platform !== platformFilter) continue
        total++
        const row = lookup.get(resultKey(s.id, sub, platform))
        if (deriveSubStatus(row?.status) === 'groen') groen++
      }
    }
  }
  return { total, groen }
}

/**
 * Berekent de vier exitcriteria (Deel 2 §2.2) voor de gegeven scenario-set en
 * de resultaten van één testronde. `scenarios` is normaal gesproken de hele
 * catalogus (`UAT_SCENARIOS`); apart parametriseerbaar voor tests.
 */
export function computeGoNoGo(
  scenarios: readonly UatScenario[] = UAT_SCENARIOS,
  results: readonly UatResultRow[] = [],
): GoNoGoResult {
  const lookup = buildResultLookup(results)

  // a. Rooktest 100% groen.
  const rooktestScenarios = scenarios.filter((s) => s.rooktest)
  const rooktestCount = countGreen(rooktestScenarios, lookup)
  const rooktest: GoNoGoCriterion = {
    id: 'rooktest',
    label: 'Rooktest 100% groen',
    gehaald: rooktestCount.total > 0 && rooktestCount.groen === rooktestCount.total,
    detail: `${rooktestCount.groen}/${rooktestCount.total} rooktest-subscenario's geslaagd`,
  }

  // b. Alle KERN-subscenario's uitgevoerd én geslaagd (webapp; mobiel-doelen apart
  // getoond, niet blokkerend — Deel 2 §2.2).
  const kernScenarios = scenarios.filter((s) => s.kriticiteit === 'KERN')
  const kernWebapp = countGreen(kernScenarios, lookup, 'webapp')
  const kernMobielScenarios = kernScenarios.filter((s) => s.platforms.includes('mobiel'))
  const kernMobiel = countGreen(kernMobielScenarios, lookup, 'mobiel')
  const kern: GoNoGoCriterion = {
    id: 'kern',
    label: 'Alle KERN-subscenario\'s uitgevoerd én geslaagd (webapp)',
    gehaald: kernWebapp.total > 0 && kernWebapp.groen === kernWebapp.total,
    detail:
      kernMobiel.total > 0
        ? `${kernWebapp.groen}/${kernWebapp.total} KERN webapp geslaagd · mobiel ${kernMobiel.groen}/${kernMobiel.total}`
        : `${kernWebapp.groen}/${kernWebapp.total} KERN-subscenario's geslaagd`,
  }

  // c. Geen open S0/S1-bevindingen.
  const openS0S1 = results.filter(
    (r) => r.status === 'gefaald' && (r.severity === 'S0' || r.severity === 'S1'),
  ).length
  const s0s1: GoNoGoCriterion = {
    id: 's0s1',
    label: 'Geen open S0/S1-bevindingen',
    gehaald: openS0S1 === 0,
    detail: openS0S1 === 0 ? 'geen open S0/S1-bevindingen' : `${openS0S1} open S0/S1-bevinding(en)`,
  }

  // d. Dekking ≥ 95%.
  const coverage = computeCoverage(scenarios, results)
  const coveragePct = coverage.total > 0 ? coverage.executed / coverage.total : 0
  const dekking: GoNoGoCriterion = {
    id: 'dekking',
    label: 'Dekking ≥ 95%',
    gehaald: coveragePct >= 0.95,
    detail: `${coverage.executed}/${coverage.total} uitgevoerd (${Math.round(coveragePct * 100)}%)`,
  }

  const criteria = [rooktest, kern, s0s1, dekking]
  return { criteria, go: criteria.every((c) => c.gehaald) }
}
