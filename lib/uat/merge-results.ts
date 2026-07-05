// Pure merge van een nieuwe/gewijzigde registratie in de resultaten-lijst:
// laatste registratie per (scenario, sub, platform) wint. Losgetrokken uit de
// client zodat de kern-acceptatie "invoer → plaat verkleurt direct" (Deel 3
// §3.3) op logica-niveau getest kan worden: na de merge zien computeCoverage en
// deriveZoneStatus de nieuwe status meteen.

import { resultKey, type UatResultRow } from './status'

export function mergeResult(prev: readonly UatResultRow[], row: UatResultRow): UatResultRow[] {
  const key = resultKey(row.scenario_id, row.sub, row.platform)
  const idx = prev.findIndex((r) => resultKey(r.scenario_id, r.sub, r.platform) === key)
  if (idx === -1) return [...prev, row]
  const next = prev.slice()
  next[idx] = row
  return next
}
