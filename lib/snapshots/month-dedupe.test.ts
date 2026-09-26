import { describe, it, expect } from 'vitest'
import { dedupeSnapshotsByMonth, latestSnapshotPerMonth } from './month-dedupe'
import { dedupeNetWorthByMonth } from '@/app/api/snapshots/month-dedupe'

const rows = [
  { snapshot_date: '2026-08-29', net_worth: 850, resilience_score: 63 },
  { snapshot_date: '2026-07-10', net_worth: 700, resilience_score: 60 },
  { snapshot_date: '2026-08-03', net_worth: 800, resilience_score: 61 },
  { snapshot_date: '2026-08-14', net_worth: 820, resilience_score: 62 },
]

describe('lib/snapshots/month-dedupe — één stand per kalendermaand', () => {
  it('Given meerdere rijen in een maand in willekeurige volgorde, When gededupliceerd, Then wint per maand de rij met de laatste snapshot_date — als hele rij', () => {
    const byMonth = dedupeSnapshotsByMonth(rows)
    expect(byMonth.get('2026-08')).toBe(rows[0])
    expect(byMonth.get('2026-07')).toBe(rows[1])
    expect(byMonth.size).toBe(2)
  })

  it('Given een ongesorteerde invoer, When latestSnapshotPerMonth, Then oplopend op datum', () => {
    expect(latestSnapshotPerMonth(rows).map((r) => r.snapshot_date)).toEqual(['2026-07-10', '2026-08-29'])
  })

  it('Given een lege invoer, When gededupliceerd, Then leeg', () => {
    expect(latestSnapshotPerMonth([])).toEqual([])
  })

  it('Given dezelfde rijen, When de netto-lijn-projectie van de snapshot-routes dedupliceert, Then dezelfde winnaars als de gedeelde regel', () => {
    const projected = dedupeNetWorthByMonth(rows)
    expect([...projected.entries()]).toEqual([
      ['2026-08', { netWorth: 850, snapshotDate: '2026-08-29' }],
      ['2026-07', { netWorth: 700, snapshotDate: '2026-07-10' }],
    ])
  })
})
