import { describe, it, expect } from 'vitest'
import {
  amsterdamDateString,
  amsterdamWeekKey,
  canRefreshToday,
  readBriefingSnapshot,
  getOrCreateWeeklySnapshot,
  applyManualRefresh,
  type BriefingSnapshot,
} from './snapshot'
import type { BriefingEntry } from '@/components/overview/briefing-panel'

/**
 * Tests voor de wekelijkse briefing-snapshot. De supabase-calls worden gemockt
 * met een minimale chainable fake — we testen de freeze-/ververs-logica, niet
 * de DB. ISO-week-keying en de "1× per dag"-poort zijn pure functies.
 */

const entry = (id: string): BriefingEntry => ({
  id,
  category: 'observation',
  text: id,
})

interface FakeOpts {
  snapshot?: unknown
  readError?: { code?: string; message?: string } | null
  writeError?: { code?: string; message?: string } | null
}

/** Bouwt een fake supabase-client + houdt bij wat er geschreven werd. */
function makeSupabase(opts: FakeOpts = {}) {
  const writes: unknown[] = []
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  opts.readError
                    ? { data: null, error: opts.readError }
                    : {
                        data: { briefing_snapshot: opts.snapshot ?? null },
                        error: null,
                      },
              }
            },
          }
        },
        update(value: unknown) {
          writes.push(value)
          return {
            eq: async () => ({ error: opts.writeError ?? null }),
          }
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: client as any, writes }
}

describe('amsterdamWeekKey — ISO-week', () => {
  it('formatteert als YYYY-Www', () => {
    expect(amsterdamWeekKey(new Date('2026-05-31T12:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('1 januari 2026 (donderdag) valt in week 1', () => {
    expect(amsterdamWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01')
  })

  it('5 januari 2026 (maandag) valt in week 2 — zero-padding', () => {
    expect(amsterdamWeekKey(new Date('2026-01-05T12:00:00Z'))).toBe('2026-W02')
  })

  it('29 december 2025 hoort ISO bij week 1 van 2026 (jaargrens vooruit)', () => {
    expect(amsterdamWeekKey(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01')
  })

  it('1 januari 2027 (vrijdag) hoort ISO bij week 53 van 2026 (53-weken-jaar)', () => {
    expect(amsterdamWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
  })

  it('dagen binnen dezelfde ma-zo-week geven dezelfde sleutel', () => {
    // Ma 25 mei t/m zo 31 mei 2026
    const monday = amsterdamWeekKey(new Date('2026-05-25T12:00:00Z'))
    const sunday = amsterdamWeekKey(new Date('2026-05-31T12:00:00Z'))
    expect(monday).toBe(sunday)
  })

  it('de maandag erna geeft een nieuwe sleutel (week-grens)', () => {
    const sunday = amsterdamWeekKey(new Date('2026-05-31T12:00:00Z'))
    const nextMonday = amsterdamWeekKey(new Date('2026-06-01T12:00:00Z'))
    expect(nextMonday).not.toBe(sunday)
  })
})

describe('amsterdamDateString — Amsterdam dag-grens', () => {
  it('telt een laat-avond UTC-instant als de volgende Amsterdamse dag (winter, UTC+1)', () => {
    expect(amsterdamDateString(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02')
  })

  it('telt een laat-avond UTC-instant als de volgende dag (zomer, UTC+2)', () => {
    expect(amsterdamDateString(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02')
  })

  it('houdt een midden-op-de-dag-instant op dezelfde dag', () => {
    expect(amsterdamDateString(new Date('2026-05-31T10:00:00Z'))).toBe('2026-05-31')
  })
})

describe('canRefreshToday — 1× per dag', () => {
  const now = new Date('2026-05-31T12:00:00Z')
  const today = amsterdamDateString(now)

  it('true zonder snapshot', () => {
    expect(canRefreshToday(null, now)).toBe(true)
  })

  it('false wanneer vandaag al handmatig ververst', () => {
    const snap: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: today,
      refreshedAt: now.toISOString(),
      entries: [],
    }
    expect(canRefreshToday(snap, now)).toBe(false)
  })

  it('true wanneer de laatste ververs op een andere dag was', () => {
    const snap: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: '2026-05-30',
      refreshedAt: now.toISOString(),
      entries: [],
    }
    expect(canRefreshToday(snap, now)).toBe(true)
  })
})

describe('readBriefingSnapshot — parsing', () => {
  it('parst een geldige snapshot', async () => {
    const valid: BriefingSnapshot = {
      week: '2026-W22',
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [entry('observation:a')],
    }
    const { supabase } = makeSupabase({ snapshot: valid })
    const result = await readBriefingSnapshot(supabase, 'user-1')
    expect(result?.week).toBe('2026-W22')
    expect(result?.entries).toHaveLength(1)
  })

  it('returnt null bij ontbrekende kolom (read-error)', async () => {
    const { supabase } = makeSupabase({
      readError: { code: '42703', message: 'column does not exist' },
    })
    expect(await readBriefingSnapshot(supabase, 'user-1')).toBeNull()
  })

  it('returnt null bij misvormde snapshot (geen week / entries)', async () => {
    const { supabase } = makeSupabase({ snapshot: { foo: 'bar' } })
    expect(await readBriefingSnapshot(supabase, 'user-1')).toBeNull()
  })

  it('returnt null wanneer kolom leeg is', async () => {
    const { supabase } = makeSupabase({ snapshot: null })
    expect(await readBriefingSnapshot(supabase, 'user-1')).toBeNull()
  })

  it('saneert entries: dropt onbekende categorie en ontbrekende tekst', async () => {
    const snapshot = {
      week: '2026-W22',
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [
        { id: 'observation:ok', category: 'observation', text: 'Geldig' },
        { id: 'bogus:x', category: 'verzonnen', text: 'Onbekende categorie' },
        { id: 'tip:notext', category: 'tip' }, // geen text → drop
      ],
    }
    const { supabase } = makeSupabase({ snapshot })
    const result = await readBriefingSnapshot(supabase, 'user-1')
    expect(result?.entries).toHaveLength(1)
    expect(result?.entries[0].id).toBe('observation:ok')
  })

  it('saneert href: niet-interne paden worden gedropt', async () => {
    const snapshot = {
      week: '2026-W22',
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [
        { id: 'tip:ext', category: 'tip', text: 'Met externe link', href: 'https://evil.example' },
      ],
    }
    const { supabase } = makeSupabase({ snapshot })
    const result = await readBriefingSnapshot(supabase, 'user-1')
    expect(result?.entries[0].href).toBeUndefined()
  })
})

describe('getOrCreateWeeklySnapshot — wekelijkse freeze', () => {
  const now = new Date('2026-05-31T12:00:00Z')
  const week = amsterdamWeekKey(now)

  it('hergebruikt de bestaande snapshot van deze week (geen write)', async () => {
    const existing: BriefingSnapshot = {
      week,
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [entry('observation:old')],
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', [entry('observation:new')], { now })
    expect(snapshot.refreshedAt).toBe('2026-05-25T08:00:00.000Z')
    expect(snapshot.entries[0].id).toBe('observation:old')
    expect(writes).toHaveLength(0)
  })

  it('genereert een nieuwe snapshot bij een nieuwe week (write, manual reset)', async () => {
    const lastWeek: BriefingSnapshot = {
      week: '2026-W21',
      lastManualRefresh: '2026-05-24',
      refreshedAt: '2026-05-24T08:00:00.000Z',
      entries: [entry('observation:old')],
    }
    const { supabase, writes } = makeSupabase({ snapshot: lastWeek })
    const composed = [entry('observation:new')]
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', composed, { now })
    expect(snapshot.week).toBe(week)
    expect(snapshot.lastManualRefresh).toBe('')
    expect(snapshot.entries).toBe(composed)
    expect(writes).toHaveLength(1)
  })

  it('genereert een snapshot wanneer er nog geen is', async () => {
    const { supabase, writes } = makeSupabase({ snapshot: null })
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', [entry('observation:x')], { now })
    expect(snapshot.week).toBe(week)
    expect(writes).toHaveLength(1)
  })

  it('returnt toch de verse snapshot wanneer de write faalt (kolom ontbreekt)', async () => {
    const { supabase } = makeSupabase({
      snapshot: null,
      writeError: { code: '42703', message: 'column does not exist' },
    })
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', [entry('observation:x')], { now })
    expect(snapshot.week).toBe(week)
    expect(snapshot.entries[0].id).toBe('observation:x')
  })

  it('geeft de vorige week als priorFreedom-basis terug bij een nieuwe week', async () => {
    const lastWeek: BriefingSnapshot = {
      week: '2026-W21',
      lastManualRefresh: '',
      refreshedAt: '2026-05-24T08:00:00.000Z',
      entries: [entry('observation:old')],
      freedomSnapshot: {
        totalFreedomDays: 3000,
        netWorth: 300000,
        monthlyExpenses: 3000,
        capturedAt: '2026-05-24T08:00:00.000Z',
      },
    }
    const { supabase } = makeSupabase({ snapshot: lastWeek })
    const { snapshot, priorFreedom } = await getOrCreateWeeklySnapshot(
      supabase,
      'u',
      [entry('observation:new')],
      { now, freedom: { totalFreedomDays: 3100, netWorth: 310000, monthlyExpenses: 3000, capturedAt: now.toISOString() } },
    )
    expect(priorFreedom?.totalFreedomDays).toBe(3000)
    // De verse snapshot bewaart de vorige week als diff-basis en het nieuwe meetpunt.
    expect(snapshot.previousFreedomSnapshot?.totalFreedomDays).toBe(3000)
    expect(snapshot.freedomSnapshot?.totalFreedomDays).toBe(3100)
  })

  it('behoudt previousFreedomSnapshot als diff-basis bij herhaalbezoek dezelfde week', async () => {
    // Cruciaal: binnen dezelfde week blijft de delta-basis de vórige week
    // (3000), NIET het eigen meetpunt van deze week (3100) — anders zou de
    // delta midden in de week naar 0 verlopen.
    const existing: BriefingSnapshot = {
      week,
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [entry('observation:x')],
      freedomSnapshot: {
        totalFreedomDays: 3100,
        netWorth: 310000,
        monthlyExpenses: 3000,
        capturedAt: '2026-05-25T08:00:00.000Z',
      },
      previousFreedomSnapshot: { totalFreedomDays: 3000, capturedAt: '2026-05-18T08:00:00.000Z' },
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const { snapshot, priorFreedom } = await getOrCreateWeeklySnapshot(
      supabase,
      'u',
      [entry('observation:new')],
      { now, freedom: { totalFreedomDays: 3200, netWorth: 320000, monthlyExpenses: 3000, capturedAt: now.toISOString() } },
    )
    expect(writes).toHaveLength(0)
    expect(priorFreedom?.totalFreedomDays).toBe(3000)
    expect(snapshot.previousFreedomSnapshot?.totalFreedomDays).toBe(3000)
  })
})

describe('applyManualRefresh — 1× per dag-poort', () => {
  const now = new Date('2026-05-31T12:00:00Z')
  const today = amsterdamDateString(now)

  it('weigert wanneer vandaag al ververst (geen write)', async () => {
    const existing: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: today,
      refreshedAt: now.toISOString(),
      entries: [entry('observation:frozen')],
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const res = await applyManualRefresh(supabase, 'u', [entry('observation:new')], { now })
    expect(res.allowed).toBe(false)
    expect(res.snapshot.entries[0].id).toBe('observation:frozen')
    expect(writes).toHaveLength(0)
  })

  it('staat een ververs toe wanneer de laatste op een andere dag was', async () => {
    const existing: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: '2026-05-30',
      refreshedAt: '2026-05-30T09:00:00.000Z',
      entries: [entry('observation:old')],
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const composed = [entry('observation:fresh')]
    const res = await applyManualRefresh(supabase, 'u', composed, { now })
    expect(res.allowed).toBe(true)
    expect(res.snapshot.lastManualRefresh).toBe(today)
    expect(res.snapshot.entries).toBe(composed)
    expect(writes).toHaveLength(1)
  })

  it('staat de eerste ververs van de dag toe zonder bestaande snapshot', async () => {
    const { supabase, writes } = makeSupabase({ snapshot: null })
    const res = await applyManualRefresh(supabase, 'u', [entry('observation:x')], { now })
    expect(res.allowed).toBe(true)
    expect(res.snapshot.lastManualRefresh).toBe(today)
    expect(writes).toHaveLength(1)
  })
})
