// Pure statusafleiding voor de UAT-procesplaat (Deel 3 §3.2 van
// docs/uat/uat-plan.md). GEEN React, GEEN data-fetching — alleen de regels die
// resultaten omzetten naar de vier plaat-statussen en de dekkings-/succescijfers.
// De plaat (uat-plaat-svg) en toekomstige brokken (4/5) consumeren deze module.

import type { UatScenario } from './catalog'

// ── Statussen ────────────────────────────────────────────────────────────────

export type UatStatus = 'groen' | 'oranje' | 'rood' | 'grijs'

/** De ruwe statuswaarden zoals ze in uat_results staan. */
export type UatResultStatus = 'geslaagd' | 'gefaald' | 'geblokkeerd'

/** Eén registratie-rij uit /api/admin/uat/results (alleen de velden die de plaat nodig heeft). */
export interface UatResultRow {
  round_id?: string
  scenario_id: string
  sub: string
  platform: string
  status: UatResultStatus | string
  faalstap?: string | null
  severity?: string | null
  opmerking?: string | null
  frictie?: string | null
  tested_at?: string | null
}

/** De opzoeksleutel: één instantie = scenario × subscenario × platform. */
export function resultKey(scenarioId: string, sub: string, platform: string): string {
  return `${scenarioId}|${sub}|${platform}`
}

/** Bouw de snelle lookup van instantie-sleutel → laatste registratie. */
export function buildResultLookup(results: readonly UatResultRow[]): Map<string, UatResultRow> {
  const map = new Map<string, UatResultRow>()
  for (const r of results) {
    map.set(resultKey(r.scenario_id, r.sub, r.platform), r)
  }
  return map
}

// ── Afleiding per niveau ─────────────────────────────────────────────────────

/**
 * Eén subscenario × platform: 'geslaagd'→groen, 'geblokkeerd'→oranje,
 * 'gefaald'→rood, geen registratie (undefined) → grijs.
 */
export function deriveSubStatus(resultStatus?: string | null): UatStatus {
  switch (resultStatus) {
    case 'geslaagd':
      return 'groen'
    case 'geblokkeerd':
      return 'oranje'
    case 'gefaald':
      return 'rood'
    default:
      return 'grijs'
  }
}

/** Geaggregeerde status van een niveau (scenario/zone/band) met dekking. */
export interface UatAgg {
  status: UatStatus
  /** true als er iets is uitgevoerd maar niet álles (deels getest → gestippelde rand). */
  incompleet: boolean
  /** aantal sub×platform-instanties onder dit niveau. */
  total: number
  /** aantal geregistreerde (uitgevoerde) instanties. */
  done: number
}

/**
 * Worst-of-children: één rood → rood; anders één oranje → oranje; anders als er
 * iets groen is → groen; anders (alleen grijs) → grijs. Grijs sleept een niveau
 * met groene kinderen NIET naar grijs — het wordt groen mét `incompleet`
 * (§3.2: "iets GRIJS en verder groen → groen met gestippelde rand").
 */
function combineStatuses(statuses: readonly UatStatus[]): UatStatus {
  if (statuses.includes('rood')) return 'rood'
  if (statuses.includes('oranje')) return 'oranje'
  if (statuses.includes('groen')) return 'groen'
  return 'grijs'
}

/** Combineer al berekende deel-aggregaten (zone uit scenario's, band uit scenario's). */
function combineAggs(aggs: readonly UatAgg[]): UatAgg {
  let total = 0
  let done = 0
  const statuses: UatStatus[] = []
  for (const a of aggs) {
    total += a.total
    done += a.done
    statuses.push(a.status)
  }
  return { status: combineStatuses(statuses), incompleet: done > 0 && done < total, total, done }
}

/**
 * Status van één scenario over álle subscenario's × platforms.
 * `total` = #subs × #platforms; `done` = #geregistreerd.
 */
export function deriveScenarioStatus(
  scenario: UatScenario,
  resultsByKey: Map<string, UatResultRow>,
): UatAgg {
  const subStatuses: UatStatus[] = []
  let total = 0
  let done = 0
  for (const sub of scenario.subscenarios) {
    for (const platform of scenario.platforms) {
      total++
      const row = resultsByKey.get(resultKey(scenario.id, sub, platform))
      const st = deriveSubStatus(row?.status)
      subStatuses.push(st)
      if (st !== 'grijs') done++
    }
  }
  return { status: combineStatuses(subStatuses), incompleet: done > 0 && done < total, total, done }
}

/** Status van een zone: worst-of over haar scenario's. */
export function deriveZoneStatus(
  zoneScenarios: readonly UatScenario[],
  resultsByKey: Map<string, UatResultRow>,
): UatAgg {
  return combineAggs(zoneScenarios.map((s) => deriveScenarioStatus(s, resultsByKey)))
}

/** Status van een band: worst-of over álle scenario's in de band. */
export function deriveBandStatus(
  bandScenarios: readonly UatScenario[],
  resultsByKey: Map<string, UatResultRow>,
): UatAgg {
  return combineAggs(bandScenarios.map((s) => deriveScenarioStatus(s, resultsByKey)))
}

// ── Dekking & succesrate ─────────────────────────────────────────────────────

export interface CoverageStats {
  /** totaal aantal sub×platform-instanties. */
  total: number
  /** aantal uitgevoerde instanties (een registratie bestaat). */
  executed: number
  /** aantal geslaagde instanties. */
  geslaagd: number
  /** niet-uitgevoerd = total − executed (het GRIJS-aandeel). */
  grijs: number
  /** geslaagd ÷ executed (0 als niets is uitgevoerd). */
  successRate: number
}

/**
 * Dekking + succesrate over een set scenario's. Roep met de hele catalogus voor
 * de totale kopband, of met de scenario's van één zone voor de zone-tegel.
 */
export function computeCoverage(
  scenarios: readonly UatScenario[],
  results: readonly UatResultRow[],
): CoverageStats {
  const lookup = buildResultLookup(results)
  let total = 0
  let executed = 0
  let geslaagd = 0
  for (const s of scenarios) {
    for (const sub of s.subscenarios) {
      for (const platform of s.platforms) {
        total++
        const st = deriveSubStatus(lookup.get(resultKey(s.id, sub, platform))?.status)
        if (st !== 'grijs') {
          executed++
          if (st === 'groen') geslaagd++
        }
      }
    }
  }
  return {
    total,
    executed,
    geslaagd,
    grijs: total - executed,
    successRate: executed > 0 ? geslaagd / executed : 0,
  }
}

// ── Kleur- & vormcodering (stoplicht-semantiek, GEEN module-accenten) ─────────
//
// Kleur ÉN vorm — nooit kleur alleen (kleurenblindheid + uitgezoomde
// leesbaarheid). Verzadigde hexes die in light én dark op --paper leesbaar zijn,
// met witte glyphs op de gevulde vormen. Brok 4/5 hergebruiken deze constanten.

export type UatShape = 'circle' | 'triangle' | 'diamond' | 'circle-open'

export interface StatusVisual {
  /** vulkleur van de vorm (grijs = geen vulling → 'none'). */
  fill: string
  /** randkleur van de vorm. */
  stroke: string
  /** glyph in het midden ('' voor grijs). */
  glyph: string
  /** kleur van de glyph. */
  glyphFill: string
  /** de vorm zelf. */
  shape: UatShape
  /** menselijke status voor aria-labels. */
  label: string
}

export const UAT_STATUS_VISUAL: Record<UatStatus, StatusVisual> = {
  groen: {
    fill: '#16a34a',
    stroke: '#15803d',
    glyph: '✓',
    glyphFill: '#ffffff',
    shape: 'circle',
    label: 'geslaagd',
  },
  oranje: {
    fill: '#d97706',
    stroke: '#b45309',
    glyph: '!',
    glyphFill: '#ffffff',
    shape: 'triangle',
    label: 'geblokkeerd',
  },
  rood: {
    fill: '#dc2626',
    stroke: '#b91c1c',
    glyph: '✕',
    glyphFill: '#ffffff',
    shape: 'diamond',
    label: 'gefaald',
  },
  grijs: {
    fill: 'none',
    stroke: '#a8a29e',
    glyph: '',
    glyphFill: '#a8a29e',
    shape: 'circle-open',
    label: 'niet uitgevoerd',
  },
}
