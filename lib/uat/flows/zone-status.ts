// Pure helper: verklaart de laag-1-zonestatus vanuit de flow-knopen (laag 2).
//
// De zone-tegel op laag 1 kleurt naar zijn slechtste onderliggende scenario
// (worst-of, via deriveZoneStatus). Deze helper berekent diezelfde zonestatus
// EN welke flow-knopen die status "veroorzaken": de statusdragende knopen wier
// scenario-status exact gelijk is aan de zonestatus. Zo kan de render tonen
// "Bezit is oranje omdát WF-11 en WF-10 oranje zijn".
//
// GEEN React, GEEN eigen statuslogica — de kleur/vorm en de aggregatie komen
// uit lib/uat/status.ts (single source). Bij een lege ronde (zonestatus grijs)
// zijn er bewust geen veroorzakers.

import { UAT_SCENARIOS, type UatScenario } from '../catalog'
import {
  buildResultLookup,
  deriveScenarioStatus,
  deriveZoneStatus,
  type UatResultRow,
  type UatStatus,
} from '../status'
import type { UatFlow } from './types'

const SCENARIO_BY_ID = new Map<string, UatScenario>(UAT_SCENARIOS.map((s) => [s.id, s]))

export interface ZoneStatusExplanation {
  /** De geaggregeerde zonestatus (worst-of over de zone-scenario's, actieve ronde). */
  zoneStatus: UatStatus
  /** true als er iets is uitgevoerd maar niet álles (deels getest). */
  incompleet: boolean
  /** Flow-knoop-ids wier scenario-status gelijk is aan de zonestatus (leeg bij grijs). */
  causeNodeIds: Set<string>
  /** Statusdragende flow-knoop-id → scenario-status (voor de vormkeuze in de render). */
  statusByNodeId: Map<string, UatStatus>
  /** Aantal veroorzakers (= causeNodeIds.size), voor de tekstuele telling. */
  causeCount: number
}

/**
 * Verklaart de zonestatus van één flow: de status zelf + welke flow-knopen
 * 'm bepalen. Puur & deterministisch voor dezelfde flow + resultaten.
 */
export function explainZoneStatus(flow: UatFlow, results: readonly UatResultRow[]): ZoneStatusExplanation {
  const lookup = buildResultLookup(results)
  const zoneScenarios = UAT_SCENARIOS.filter((s) => s.zone === flow.zone)
  const zoneAgg = deriveZoneStatus(zoneScenarios, lookup)

  const statusByNodeId = new Map<string, UatStatus>()
  for (const node of flow.nodes) {
    if (!node.scenarioId) continue
    const scenario = SCENARIO_BY_ID.get(node.scenarioId)
    if (!scenario) continue
    statusByNodeId.set(node.id, deriveScenarioStatus(scenario, lookup).status)
  }

  // Veroorzakers = statusdragende knopen wier status exact de zonestatus is.
  // Bij een grijze zone (niets uitgevoerd) zijn er geen veroorzakers.
  const causeNodeIds = new Set<string>()
  if (zoneAgg.status !== 'grijs') {
    for (const [nodeId, status] of statusByNodeId) {
      if (status === zoneAgg.status) causeNodeIds.add(nodeId)
    }
  }

  return {
    zoneStatus: zoneAgg.status,
    incompleet: zoneAgg.incompleet,
    causeNodeIds,
    statusByNodeId,
    causeCount: causeNodeIds.size,
  }
}
