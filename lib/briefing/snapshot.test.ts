import { describe, it, expect } from 'vitest'
import {
  amsterdamDateString,
  amsterdamWeekKey,
  canRefreshToday,
  readBriefingSnapshot,
  getOrCreateWeeklySnapshot,
  applyManualRefresh,
  touchLastSeen,
  refreshStateToday,
  type BriefingSnapshot,
} from './snapshot'
import type { BriefingEntry } from '@/lib/types/briefing'

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
        kind: 'months',
        months: 300,
        reachesAge: 70,
        capturedAt: '2026-05-24T08:00:00.000Z',
      },
    }
    const { supabase } = makeSupabase({ snapshot: lastWeek })
    const { snapshot, priorFreedom } = await getOrCreateWeeklySnapshot(
      supabase,
      'u',
      [entry('observation:new')],
      { now, freedom: { kind: 'months', months: 310, reachesAge: 70.8, capturedAt: now.toISOString() } },
    )
    expect(priorFreedom?.months).toBe(300)
    // De verse snapshot bewaart de vorige week als diff-basis en het nieuwe meetpunt.
    expect(snapshot.previousFreedomSnapshot?.months).toBe(300)
    expect(snapshot.freedomSnapshot?.months).toBe(310)
  })

  it('behoudt previousFreedomSnapshot als diff-basis bij herhaalbezoek dezelfde week', async () => {
    // Cruciaal: binnen dezelfde week blijft de delta-basis de vórige week
    // (300 maanden), NIET het eigen meetpunt van deze week (310) — anders zou
    // de delta midden in de week naar 0 verlopen.
    const existing: BriefingSnapshot = {
      week,
      lastManualRefresh: '',
      refreshedAt: '2026-05-25T08:00:00.000Z',
      entries: [entry('observation:x')],
      freedomSnapshot: {
        kind: 'months',
        months: 310,
        reachesAge: 70.8,
        capturedAt: '2026-05-25T08:00:00.000Z',
      },
      previousFreedomSnapshot: { kind: 'months', months: 300, capturedAt: '2026-05-18T08:00:00.000Z' },
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const { snapshot, priorFreedom } = await getOrCreateWeeklySnapshot(
      supabase,
      'u',
      [entry('observation:new')],
      { now, freedom: { kind: 'months', months: 320, reachesAge: 71.7, capturedAt: now.toISOString() } },
    )
    expect(writes).toHaveLength(0)
    expect(priorFreedom?.months).toBe(300)
    expect(snapshot.previousFreedomSnapshot?.months).toBe(300)
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

describe('week-historie — afgesloten weken in de snapshot', () => {
  // Dinsdag 9 juni 2026 = week 2026-W24.
  const now = new Date('2026-06-09T10:00:00.000Z')

  it('week-overgang schuift de aflopende week in history', async () => {
    const existing: BriefingSnapshot = {
      week: '2026-W23',
      lastManualRefresh: '',
      refreshedAt: '2026-06-01T08:00:00.000Z',
      entries: [entry('observation:vorige-week')],
      headline: 'Vorige-week-kop',
      freedomSnapshot: {
        kind: 'months',
        months: 120,
        reachesAge: 55,
        capturedAt: '2026-06-01T08:00:00.000Z',
      },
    }
    const { supabase } = makeSupabase({ snapshot: existing })
    const { snapshot } = await getOrCreateWeeklySnapshot(
      supabase, 'u', [entry('observation:nieuw')], { now },
    )
    expect(snapshot.week).toBe('2026-W24')
    expect(snapshot.history).toHaveLength(1)
    expect(snapshot.history?.[0]).toMatchObject({
      week: '2026-W23',
      headline: 'Vorige-week-kop',
      freedomMonths: 120,
    })
    expect(snapshot.history?.[0].entries[0].id).toBe('observation:vorige-week')
  })

  it('binnen dezelfde week blijft de historie ongewijzigd', async () => {
    const existing: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: '',
      refreshedAt: now.toISOString(),
      entries: [entry('observation:huidig')],
      history: [{ week: '2026-W23', entries: [entry('observation:oud')] }],
    }
    const { supabase, writes } = makeSupabase({ snapshot: existing })
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', [], { now })
    expect(writes).toHaveLength(0)
    expect(snapshot.history).toHaveLength(1)
    expect(snapshot.history?.[0].week).toBe('2026-W23')
  })

  it('historie wordt gecapt op MAX_WEEK_HISTORY (oudste valt af)', async () => {
    const fullHistory = Array.from({ length: 8 }, (_, i) => ({
      week: `2026-W${String(15 + i).padStart(2, '0')}`,
      entries: [entry(`observation:w${15 + i}`)],
    }))
    const existing: BriefingSnapshot = {
      week: '2026-W23',
      lastManualRefresh: '',
      refreshedAt: '2026-06-01T08:00:00.000Z',
      entries: [entry('observation:af')],
      history: fullHistory,
    }
    const { supabase } = makeSupabase({ snapshot: existing })
    const { snapshot } = await getOrCreateWeeklySnapshot(supabase, 'u', [], { now })
    expect(snapshot.history).toHaveLength(8)
    expect(snapshot.history?.[0].week).toBe('2026-W16') // W15 is afgevallen
    expect(snapshot.history?.[7].week).toBe('2026-W23') // aflopende week achteraan
  })

  it('handmatige ververs behoudt de bestaande historie', async () => {
    const existing: BriefingSnapshot = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: '2026-06-08',
      refreshedAt: '2026-06-08T08:00:00.000Z',
      entries: [entry('observation:oud')],
      history: [{ week: '2026-W23', entries: [entry('observation:hist')] }],
    }
    const { supabase } = makeSupabase({ snapshot: existing })
    const res = await applyManualRefresh(supabase, 'u', [entry('observation:vers')], { now })
    expect(res.allowed).toBe(true)
    expect(res.snapshot.history).toHaveLength(1)
    expect(res.snapshot.history?.[0].week).toBe('2026-W23')
  })

  it('parser saneert history-items defensief (onbekende categorie vervalt)', async () => {
    const raw = {
      week: amsterdamWeekKey(now),
      lastManualRefresh: '',
      refreshedAt: now.toISOString(),
      entries: [],
      history: [
        {
          week: '2026-W23',
          entries: [
            { id: 'ok', category: 'tip', text: 'goed' },
            { id: 'kapot', category: 'streak', text: 'onbekend type' },
          ],
        },
        { geen: 'week' },
      ],
    }
    const { supabase } = makeSupabase({ snapshot: raw })
    const snap = await readBriefingSnapshot(supabase, 'u')
    expect(snap?.history).toHaveLength(1)
    expect(snap?.history?.[0].entries).toHaveLength(1)
    expect(snap?.history?.[0].entries[0].id).toBe('ok')
  })
})

// ── Bezoekmarker "sinds je vorige bezoek" (H11) ─────────────────────

describe('touchLastSeen — bezoekmarker op dagcadans', () => {
  const base = (over: Partial<BriefingSnapshot> = {}): BriefingSnapshot => ({
    week: '2026-W34',
    lastManualRefresh: '',
    refreshedAt: '2026-08-18T08:00:00.000Z',
    entries: [entry('observation:a')],
    ...over,
  })

  it('schrijft niets zonder bestaande snapshot (nooit een halve rij achterlaten)', async () => {
    const { supabase, writes } = makeSupabase({ snapshot: null })
    const res = await touchLastSeen(supabase, 'u', { netWorth: 100_000 })
    expect(res.previous).toBeNull()
    expect(writes).toHaveLength(0)
  })

  it('eerste bezoek ooit: zet de marker, maar heeft nog geen basis', async () => {
    const now = new Date('2026-08-24T09:00:00Z')
    const { supabase, writes } = makeSupabase({ snapshot: base() })
    const res = await touchLastSeen(supabase, 'u', { netWorth: 100_000 }, { now })
    expect(res.previous).toBeNull()
    expect(writes).toHaveLength(1)
    const w = writes[0] as { briefing_snapshot: BriefingSnapshot }
    expect(w.briefing_snapshot.lastSeen?.netWorth).toBe(100_000)
    expect(w.briefing_snapshot.previousLastSeen).toBeUndefined()
  })

  it('nieuwe kalenderdag: de vorige marker schuift door naar de basis', async () => {
    const now = new Date('2026-08-24T09:00:00Z')
    const snapshot = base({
      lastSeen: { at: '2026-08-23T20:00:00.000Z', netWorth: 90_000 },
    })
    const { supabase, writes } = makeSupabase({ snapshot })
    const res = await touchLastSeen(supabase, 'u', { netWorth: 100_000 }, { now })
    expect(res.previous?.netWorth).toBe(90_000)
    const w = writes[0] as { briefing_snapshot: BriefingSnapshot }
    expect(w.briefing_snapshot.previousLastSeen?.netWorth).toBe(90_000)
    expect(w.briefing_snapshot.lastSeen?.netWorth).toBe(100_000)
    // De briefing zelf blijft ongemoeid — dit raakt alleen de bezoekmarkers.
    expect(w.briefing_snapshot.week).toBe('2026-W34')
    expect(w.briefing_snapshot.entries).toHaveLength(1)
  })

  it('tweede bezoek dezelfde dag: geen write, dezelfde basis (regel flikkert niet weg)', async () => {
    const now = new Date('2026-08-24T21:00:00Z')
    const snapshot = base({
      lastSeen: { at: '2026-08-24T09:00:00.000Z', netWorth: 100_000 },
      previousLastSeen: { at: '2026-08-23T20:00:00.000Z', netWorth: 90_000 },
    })
    const { supabase, writes } = makeSupabase({ snapshot })
    const res = await touchLastSeen(supabase, 'u', { netWorth: 104_000 }, { now })
    expect(writes).toHaveLength(0)
    expect(res.previous?.netWorth).toBe(90_000)
  })

  it('een week-overgang wist de bezoekmarkers niet (andere cadans)', async () => {
    const now = new Date('2026-08-24T09:00:00Z') // maandag, W35
    const snapshot = base({
      lastSeen: { at: '2026-08-23T20:00:00.000Z', netWorth: 90_000 },
      previousLastSeen: { at: '2026-08-22T20:00:00.000Z', netWorth: 80_000 },
    })
    const { supabase, writes } = makeSupabase({ snapshot })
    await getOrCreateWeeklySnapshot(supabase, 'u', [entry('observation:vers')], { now })
    const w = writes[0] as { briefing_snapshot: BriefingSnapshot }
    expect(w.briefing_snapshot.week).toBe(amsterdamWeekKey(now))
    expect(w.briefing_snapshot.lastSeen?.netWorth).toBe(90_000)
    expect(w.briefing_snapshot.previousLastSeen?.netWorth).toBe(80_000)
  })

  it('parser verdraagt oude snapshots zonder markers', async () => {
    const { supabase } = makeSupabase({
      snapshot: {
        week: '2026-W34',
        lastManualRefresh: '',
        refreshedAt: '2026-08-18T08:00:00.000Z',
        entries: [],
      },
    })
    const snap = await readBriefingSnapshot(supabase, 'u')
    expect(snap?.lastSeen).toBeUndefined()
    expect(snap?.previousLastSeen).toBeUndefined()
  })

  it('parser weigert een onvolledige marker (geen getal → geen basis)', async () => {
    const { supabase } = makeSupabase({
      snapshot: {
        week: '2026-W34',
        lastManualRefresh: '',
        refreshedAt: '2026-08-18T08:00:00.000Z',
        entries: [],
        lastSeen: { at: '2026-08-23T20:00:00.000Z', netWorth: 'veel' },
      },
    })
    const snap = await readBriefingSnapshot(supabase, 'u')
    expect(snap?.lastSeen).toBeUndefined()
  })

  // ── BACK-COMPAT op de vormwissel van ADR 0126 PR C ─────────────────────
  //
  // In productie staan markers en meetpunten in de OUDE vorm. Ze mogen niet
  // crashen én niet stilzwijgend als het nieuwe getal gelezen worden: een
  // `totalFreedomDays` uit de platte deling is een andere grootheid dan de
  // runway-maanden. De parser laat ze daarom vallen; de eerstvolgende
  // schrijfbeurt zet de nieuwe vorm.
  it('een bezoekmarker in de oude vorm (totalFreedomDays) wordt genegeerd, niet omgerekend', async () => {
    const { supabase } = makeSupabase({
      snapshot: {
        week: '2026-W34',
        lastManualRefresh: '',
        refreshedAt: '2026-08-18T08:00:00.000Z',
        entries: [],
        lastSeen: { at: '2026-08-23T20:00:00.000Z', totalFreedomDays: 41365 },
      },
    })
    const snap = await readBriefingSnapshot(supabase, 'u')
    expect(snap?.lastSeen).toBeUndefined()
  })

  it('een oude marker blokkeert de nieuwe niet: het eerstvolgende bezoek schrijft de nieuwe vorm', async () => {
    const now = new Date('2026-08-24T09:00:00Z')
    const { supabase, writes } = makeSupabase({
      snapshot: base({
        lastSeen: { at: '2026-08-23T20:00:00.000Z', totalFreedomDays: 41365 } as never,
      }),
    })
    const res = await touchLastSeen(supabase, 'u', { netWorth: 100_000 }, { now })
    // Geen basis dit bezoek (de oude marker is niet vergelijkbaar) …
    expect(res.previous).toBeNull()
    // … maar wel meteen een marker in de nieuwe vorm, dus morgen werkt de regel.
    const w = writes[0] as { briefing_snapshot: BriefingSnapshot }
    expect(w.briefing_snapshot.lastSeen?.netWorth).toBe(100_000)
  })

  it('een weekmeetpunt in de oude vorm wordt genegeerd (geen deling als runway lezen)', async () => {
    const { supabase } = makeSupabase({
      snapshot: {
        week: '2026-W34',
        lastManualRefresh: '',
        refreshedAt: '2026-08-18T08:00:00.000Z',
        entries: [],
        freedomSnapshot: {
          totalFreedomDays: 41365,
          netWorth: 1361,
          monthlyExpenses: 1,
          capturedAt: '2026-08-18T08:00:00.000Z',
        },
        previousFreedomSnapshot: { totalFreedomDays: 41000, capturedAt: '2026-08-11T08:00:00.000Z' },
      },
    })
    const snap = await readBriefingSnapshot(supabase, 'u')
    expect(snap).not.toBeNull()
    expect(snap?.freedomSnapshot).toBeUndefined()
    expect(snap?.previousFreedomSnapshot).toBeUndefined()
  })
})

// ── L9: de reden achter "ververs niet beschikbaar" ──────────────────

describe('refreshStateToday — reden i.p.v. kale boolean', () => {
  const now = new Date('2026-08-24T09:00:00Z')
  const snap = (lastManualRefresh: string): BriefingSnapshot => ({
    week: '2026-W35',
    lastManualRefresh,
    refreshedAt: '2026-08-24T08:00:00.000Z',
    entries: [entry('observation:a')],
  })

  it('zonder snapshot is de ververs gewoon beschikbaar', () => {
    expect(refreshStateToday(null, now)).toBe('available')
  })

  it('nog niet ververst vandaag → available', () => {
    expect(refreshStateToday(snap('2026-08-23'), now)).toBe('available')
  })

  it('vandaag al ververst → used_today (de knop blijft staan, uitgeschakeld)', () => {
    expect(refreshStateToday(snap(amsterdamDateString(now)), now)).toBe('used_today')
  })

  it('blijft in lijn met canRefreshToday — nooit twee waarheden op één scherm', () => {
    for (const last of ['', '2026-08-01', '2026-08-23', amsterdamDateString(now)]) {
      const s = snap(last)
      expect(refreshStateToday(s, now) === 'available').toBe(canRefreshToday(s, now))
    }
  })
})
