import { describe, it, expect } from 'vitest'
import { buildDebtSaldoHistory } from './load-debt-balance-history'
import type { SnapshotMonthlyLatestRow } from './server-data/snapshot-aggregates'

/**
 * Widgetreview Schuldtrend (trend_schulden), Optie B: de widget toont het
 * openstaand schuldSALDO per maand (dalend = goed), niet de aflossingen.
 * buildDebtSaldoHistory bouwt die serie uit het latest-per-maand balance_snapshots-
 * aggregaat.
 */

// Vast referentiepunt: 2026-07-15 → venster aug-2025 t/m jul-2026.
const NOW = new Date('2026-07-15T12:00:00Z')

function row(entity_id: string, month: string, balance: number, pct: number | null = 100): SnapshotMonthlyLatestRow {
  return { entity_id, entity_type: 'debt', entity_subtype: null, month, balance, net_worth_inclusion_pct: pct }
}

describe('buildDebtSaldoHistory', () => {
  it('geeft een lege reeks zonder schuld-snapshots', () => {
    expect(buildDebtSaldoHistory([], NOW)).toEqual([])
  })

  it('negeert niet-debt entiteiten', () => {
    const rows: SnapshotMonthlyLatestRow[] = [
      { entity_id: 'a1', entity_type: 'asset', entity_subtype: null, month: '2026-06', balance: 1000, net_worth_inclusion_pct: 100 },
    ]
    expect(buildDebtSaldoHistory(rows, NOW)).toEqual([])
  })

  it('toont het openstaand saldo per maand (dalend = schuld afgelost)', () => {
    const rows = [
      row('d1', '2026-05', 12000),
      row('d1', '2026-06', 11500),
      row('d1', '2026-07', 11000),
    ]
    const out = buildDebtSaldoHistory(rows, NOW)
    expect(out).toEqual([
      { month: '2026-05', value: 12000 },
      { month: '2026-06', value: 11500 },
      { month: '2026-07', value: 11000 },
    ])
    // Dalend saldo: laatste < eerste.
    expect(out[out.length - 1].value).toBeLessThan(out[0].value)
  })

  it('sommeert meerdere schulden per maand en forward-fillt tot de huidige maand', () => {
    const rows = [
      row('d1', '2026-05', 10000),
      row('d2', '2026-05', 5000),
      // d1 mist daarna → telt mee met laatst bekende 10000; d2 daalt naar 4000 en
      // wordt daarna ook forward-gevuld tot de huidige maand (jul-2026).
      row('d2', '2026-06', 4000),
    ]
    const out = buildDebtSaldoHistory(rows, NOW)
    expect(out).toEqual([
      { month: '2026-05', value: 15000 },
      { month: '2026-06', value: 14000 },
      { month: '2026-07', value: 14000 },
    ])
  })

  it('draagt een schuld pas mee vanaf de eerste meting (geen valse €0-historie ervoor)', () => {
    const rows = [
      // d1 verschijnt pas in juni.
      row('d1', '2026-06', 8000),
      row('d1', '2026-07', 7500),
    ]
    const out = buildDebtSaldoHistory(rows, NOW)
    // Venster wordt links afgekapt op de eerste maand met schuld.
    expect(out).toEqual([
      { month: '2026-06', value: 8000 },
      { month: '2026-07', value: 7500 },
    ])
  })

  it('weegt met net_worth_inclusion_pct', () => {
    const rows = [row('d1', '2026-07', 10000, 50)]
    expect(buildDebtSaldoHistory(rows, NOW)).toEqual([{ month: '2026-07', value: 5000 }])
  })
})
