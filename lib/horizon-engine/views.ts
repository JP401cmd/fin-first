/**
 * Horizon grootboek-engine — views.
 *
 * Pure selectors die `HorizonLedgerResult` omzetten naar grafiek-/tabel-vriendelijke
 * structuren. De beheer-inspector consumeert deze; LedgerRow (per asset) blijft de bron.
 */

import type { AssetType } from '@/lib/asset-data'
import type { HorizonLedgerResult, LedgerRow, TypeRollup } from './types'

export interface ChartSeries {
  ages: number[]
  /** V_op: liquide (besteedbaar) vermogen — de stijgende lijn. */
  vOp: number[]
  /** Netto vermogen incl. eigen huis. */
  netto: number[]
  /** V_nodig — de dalende benodigd-lijn. */
  vNodig: number[]
  fireAge: number | null
  fireAgeFractional: number | null
}

export function buildChartSeries(r: HorizonLedgerResult): ChartSeries {
  return {
    ages: r.rows.map((row) => row.leeftijd),
    vOp: r.rows.map((row) => Math.round(row.liquideVermogen)),
    netto: r.rows.map((row) => Math.round(row.nettoVermogen)),
    vNodig: r.vNodig.map((v) => Math.round(v)),
    fireAge: r.fireAge,
    fireAgeFractional: r.fireAgeFractional,
  }
}

/** Rol de per-asset bewegingen van een rij op naar asset-type (voor composition-bar). */
export function rollupByType(row: LedgerRow): TypeRollup[] {
  const m = new Map<AssetType, TypeRollup>()
  for (const a of row.assets) {
    const t = m.get(a.type) ?? { type: a.type, begin: 0, rendement: 0, instroom: 0, uitstroom: 0, box3: 0, eind: 0 }
    t.begin += a.begin
    t.rendement += a.rendement
    t.instroom += a.instroom
    t.uitstroom += a.uitstroom
    t.box3 += a.box3
    t.eind += a.eind
    m.set(a.type, t)
  }
  return [...m.values()]
}

/**
 * Mijlpaal-leeftijden voor compacte tabelweergave: start, eind, AOW, FIRE,
 * event-jaren en elke `every` jaar. Geef `allYears=true` voor alle rijen.
 */
export function keyAges(r: HorizonLedgerResult, opts?: { allYears?: boolean; aowAge?: number; every?: number }): Set<number> {
  const ages = r.rows.map((row) => row.leeftijd)
  if (opts?.allYears) return new Set(ages)
  const every = opts?.every ?? 5
  const set = new Set<number>()
  if (ages.length) {
    set.add(ages[0])
    set.add(ages[ages.length - 1])
  }
  if (r.fireAge != null) set.add(r.fireAge)
  if (opts?.aowAge != null) set.add(opts.aowAge)
  for (const row of r.rows) if (row.events.length > 0) set.add(row.leeftijd)
  for (let a = ages[0]; a <= ages[ages.length - 1]; a += every) set.add(a)
  return set
}
