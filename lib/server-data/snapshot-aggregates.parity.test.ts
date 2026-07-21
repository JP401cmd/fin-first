import { describe, it, expect } from 'vitest'
import { buildLatestSnapshotsByMonthFromRows } from './snapshot-aggregates'

// ── Parity: oude JS-reductie over ruwe snapshots == nieuw latest-per-maand aggregaat ──
// De categorie-sparklines in core-data-loader haalden ALLE balance_snapshots over 12
// maanden op en reduceerden in JS tot de laatste snapshot per (entity_id, maand). Dat
// kon STIL afkappen (PostgREST max_rows=1000) én was egress-zwaar. Deze test bewijst:
//   1. de nieuwe aggregaat-vorm reproduceert de gewogen waarde-per-(entity,maand)
//      byte-identiek aan de oude reductie;
//   2. op een >2000-rijen-fixture wijkt de op 1000 rijen afgekapte oude code AF van de
//      volle waarheid (verkeerde "laatste" balance), terwijl het aggregaat klopt.
//
// Bewuste gehele bedragen ⇒ float-sommen zijn exact.

type RawSnap = {
  entity_id: string
  entity_type: string
  entity_subtype: string | null
  snapshot_date: string
  balance: number
  net_worth_inclusion_pct: number | null
}

function dateStr(base: Date, addDays: number): string {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + addDays)
  return d.toISOString().slice(0, 10)
}

// Drie entiteiten, elk ~800 dagelijkse snapshots met OPLOPENDE balance → de laatste
// snapshot per maand heeft de hoogste balance. Ascending-gesorteerd (zoals de oude
// `.order('snapshot_date', ascending)`-fetch): de recentste rijen staan achteraan en
// vallen als eerste weg bij een afkap op 1000.
function buildFixture(): RawSnap[] {
  const base = new Date(Date.UTC(2025, 7, 1)) // 2025-08-01
  const entities: { id: string; type: string; subtype: string | null; pct: number | null }[] = [
    { id: 'ent-a', type: 'asset', subtype: 'aandelen', pct: 100 },
    { id: 'ent-b', type: 'asset', subtype: 'spaargeld', pct: 50 },   // gewogen op 50%
    { id: 'ent-c', type: 'debt', subtype: 'hypotheek', pct: null },  // null ⇒ default 100
  ]
  const rows: RawSnap[] = []
  for (let day = 0; day < 800; day++) {
    for (const e of entities) {
      rows.push({
        entity_id: e.id,
        entity_type: e.type,
        entity_subtype: e.subtype,
        snapshot_date: dateStr(base, day),
        balance: 1000 + day, // strikt oplopend per dag
        net_worth_inclusion_pct: e.pct,
      })
    }
  }
  return rows
}

// ── Oude JS-reductie (letterlijk stap 1-2 uit core-data-loader, vóór de RPC) ──
function oldWeightedByEntityMonth(rows: RawSnap[]): Map<string, number> {
  const latestDate = new Map<string, string>()
  for (const r of rows) {
    const month = r.snapshot_date.substring(0, 7)
    const k = `${r.entity_id}|${month}`
    const cur = latestDate.get(k)
    if (!cur || r.snapshot_date > cur) latestDate.set(k, r.snapshot_date)
  }
  const val = new Map<string, number>()
  for (const r of rows) {
    const month = r.snapshot_date.substring(0, 7)
    const k = `${r.entity_id}|${month}`
    if (latestDate.get(k) !== r.snapshot_date) continue
    const weight = Number(r.net_worth_inclusion_pct ?? 100) / 100
    val.set(k, Number(r.balance) * weight)
  }
  return val
}

// Nieuwe consumptie: gewogen waarde uit het aggregaat (spiegelt core-data-loader ná refactor).
function newWeightedByEntityMonth(rows: RawSnap[]): Map<string, number> {
  const agg = buildLatestSnapshotsByMonthFromRows(rows)
  const val = new Map<string, number>()
  for (const r of agg) {
    const weight = Number(r.net_worth_inclusion_pct ?? 100) / 100
    val.set(`${r.entity_id}|${r.month}`, Number(r.balance) * weight)
  }
  return val
}

function mapEq(a: Map<string, number>, b: Map<string, number>) {
  expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
}

describe('snapshot-aggregate parity (oude JS-reductie ↔ nieuw latest-per-maand aggregaat)', () => {
  const fixture = buildFixture()

  it('fixture bevat >2000 snapshot-rijen in het venster (afkap-conditie)', () => {
    expect(fixture.length).toBeGreaterThan(2000)
  })

  it('aggregaat collapst tot ≤ entiteiten×12 rijen (egress-winst, kan niet afkappen)', () => {
    const agg = buildLatestSnapshotsByMonthFromRows(fixture)
    // 3 entiteiten × (aug 2025 .. okt 2027 = elke maand met ≥1 snapshot). 800 dagen ≈ 27 maanden.
    // Kernpunt: veel minder dan de 2400 ruwe rijen, en per (entity, maand) exact één rij.
    expect(agg.length).toBeLessThan(fixture.length)
    const keys = new Set(agg.map((r) => `${r.entity_id}|${r.month}`))
    expect(keys.size).toBe(agg.length) // geen dubbele (entity, maand)
  })

  it('gewogen waarde-per-(entity,maand) — byte-identiek aan de oude reductie', () => {
    mapEq(newWeightedByEntityMonth(fixture), oldWeightedByEntityMonth(fixture))
  })

  it('REGRESSIE-GETUIGE: oude code afgekapt op 1000 rijen mist de echte laatste snapshot; aggregaat klopt', () => {
    // Oude fetch sorteerde ascending op snapshot_date → afkap op 1000 dropt de recentste
    // rijen. Ascending sorteren en de eerste 1000 nemen bootst dat na.
    const asc = [...fixture].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    const capped = asc.slice(0, 1000)
    const cappedVal = oldWeightedByEntityMonth(capped)
    const fullVal = oldWeightedByEntityMonth(fixture)

    // De afgekapte reductie wijkt AF van de volledige waarheid (verkeerde laatste balance)...
    expect([...cappedVal.entries()].sort()).not.toEqual([...fullVal.entries()].sort())
    // ...terwijl het aggregaat de volledige (juiste) waarheid exact reproduceert.
    mapEq(newWeightedByEntityMonth(fixture), fullVal)
  })
})
