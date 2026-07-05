// Pure filterlogica voor de UAT-procesplaat (Deel 3 §3.3, brok 5). Bepaalt
// welke scenario-knopen (gewone zone-knopen ÉN KRUIS-verbindingen — beide
// leven in dezelfde UAT_SCENARIOS-lijst) een filterselectie halen.
//
// GEEN React. De client onthoudt alleen welke chips aan staan (UatFilterState)
// en roept computeVisibleScenarioIds aan om te weten welke knopen vol
// zichtbaar blijven — de rest dimt, verdwijnt niet (§3.3: "de plaat blijft één
// samenhangend geheel"). De kopband-cijfers (succesrate/dekking/go-no-go)
// blijven ALTIJD op de hele ronde berekend — dit bestand raakt daar bewust
// niet aan; de client voedt UAT_SCENARIOS (niet een gefilterde deellijst) aan
// computeCoverage/computeGoNoGo.

import type { UatScenario } from './catalog'
import { deriveScenarioStatus, type UatResultRow, type UatStatus } from './status'

export type UatPlatformFilter = 'webapp' | 'mobiel' | null

export interface UatFilterState {
  /** 'rood_oranje' = alleen scenario's met status rood of oranje. null = uit. */
  statusFilter: 'rood_oranje' | null
  rooktestOnly: boolean
  grijsOnly: boolean
  platform: UatPlatformFilter
}

/** De "Alles"-chip: geen enkel filter actief. */
export const UAT_FILTERS_NONE: UatFilterState = {
  statusFilter: null,
  rooktestOnly: false,
  grijsOnly: false,
  platform: null,
}

/** true zodra minstens één chip anders staat dan "Alles". */
export function hasActiveFilter(filters: UatFilterState): boolean {
  return filters.statusFilter !== null || filters.rooktestOnly || filters.grijsOnly || filters.platform !== null
}

/**
 * AND-semantiek: een scenario moet aan ÁLLE actieve criteria voldoen om vol
 * zichtbaar te blijven. Chips zijn dus combineerbaar (bv. "rooktest" +
 * "webapp" = alleen rooktest-scenario's met een webapp-doel).
 */
export function matchesFilters(scenario: UatScenario, status: UatStatus, filters: UatFilterState): boolean {
  if (filters.statusFilter === 'rood_oranje' && status !== 'rood' && status !== 'oranje') return false
  if (filters.rooktestOnly && !scenario.rooktest) return false
  if (filters.grijsOnly && status !== 'grijs') return false
  if (filters.platform && !scenario.platforms.includes(filters.platform)) return false
  return true
}

/**
 * Zet de filters om in de set scenario-ID's die vol zichtbaar blijven.
 * `null` betekent "geen filter actief" — de plaat dimt dan niets.
 */
export function computeVisibleScenarioIds(
  scenarios: readonly UatScenario[],
  resultsByKey: Map<string, UatResultRow>,
  filters: UatFilterState,
): Set<string> | null {
  if (!hasActiveFilter(filters)) return null
  const visible = new Set<string>()
  for (const scenario of scenarios) {
    const status = deriveScenarioStatus(scenario, resultsByKey).status
    if (matchesFilters(scenario, status, filters)) visible.add(scenario.id)
  }
  return visible
}
