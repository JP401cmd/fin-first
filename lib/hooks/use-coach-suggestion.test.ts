import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCoachSuggestion } from './use-coach-suggestion'
import {
  PATH_SUGGESTION_COOLDOWN_MS,
  type CoachDataGaps,
  type GuideSuggestionInput,
} from '@/lib/coach-suggestions'
import { EMPTY_COACH_STATE, type CoachState } from '@/lib/coach-state'

vi.mock('next/navigation', () => ({ usePathname: () => '/overzicht' }))

/**
 * useCoachSuggestion na de verhuizing naar server-state (ADR 0130).
 *
 * Wat er veranderde t.o.v. de localStorage-versie:
 *  - de weggeklikte sleutels komen als SEED binnen en mutaties gaan via
 *    `PUT /api/coach-state` (cross-device);
 *  - `paused` legt de hook volledig stil — geen selectie én geen stempel. Dat
 *    dicht de latente fout waarbij een tip achter een open modal ongezien als
 *    "gezien" werd weggeschreven;
 *  - `dismiss` kent een reden, en een `guide_`-sleutel die vanzélf wegglijdt
 *    krijgt alleen een dagstempel i.p.v. een dismiss (fase 2).
 */

const fullGaps = (over: Partial<CoachDataGaps> = {}): CoachDataGaps => ({
  hasBank: true, hasAssets: true, hasBudgets: true, hasGoals: true, hasDebts: true,
  hasTransactions: true, hasHoldings: true, hasHoldingsWithIsin: true, hasFireParams: true,
  hasLifeEvents: true, ...over,
})

const state = (over: Partial<CoachState> = {}): CoachState => ({ ...EMPTY_COACH_STATE, ...over })

/** Alle bodies die naar /api/coach-state gingen. */
let puts: Record<string, unknown>[] = []

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/coach-state' && init?.body) {
      puts.push(JSON.parse(init.body as string) as Record<string, unknown>)
    }
    return { ok: true, json: async () => ({ ok: true }) }
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  puts = []
  stubFetch()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('useCoachSuggestion — selectie', () => {
  it('levert na delayMs de eerste open data-gap', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 1000 }),
    )
    expect(result.current.suggestion).toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('slaat een sleutel over die volgens de SERVER-seed al is weggeklikt', () => {
    // Kern van ADR 0130: weggeklikt op de telefoon = weg op de laptop.
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({ dismissed: ['gap_bank'] }),
        dataGaps: fullGaps({ hasBank: false, hasAssets: false }),
        delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_assets')
  })

  it('toont geen nieuwe suggestie na dismiss (dismissedThisMount-guard)', () => {
    const { result, rerender } = renderHook(
      ({ gaps }) => useCoachSuggestion({ coachState: state(), dataGaps: gaps, delayMs: 0 }),
      { initialProps: { gaps: fullGaps({ hasBank: false }) } },
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    act(() => { result.current.dismiss('user') })
    rerender({ gaps: fullGaps({ hasBank: false, hasAssets: false }) })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion).toBeNull()
  })
})

describe('useCoachSuggestion — dismiss schrijft naar de server', () => {
  it('kruisje: optimistisch weg + PUT dismiss met de sleutel', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss('user') })

    expect(result.current.suggestion).toBeNull()
    expect(puts).toEqual([{ action: 'dismiss', key: 'gap_bank' }])
    // Geen enkele localStorage-sleutel meer — dat was het hele punt.
    expect(localStorage.getItem('trifinity_coach_dismissed_suggestions')).toBeNull()
  })

  it('auto-dismiss van een gewone tip telt óók als gezien (bestaand gedrag)', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss('auto') })
    expect(puts).toEqual([{ action: 'dismiss', key: 'gap_bank' }])
  })

  it('een tweede dismiss zonder zichtbare melding schrijft niets', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss('user') })
    act(() => { result.current.dismiss('user') })
    expect(puts).toHaveLength(1)
  })
})

describe('useCoachSuggestion — paused', () => {
  it('kiest niets zolang paused (geen melding achter een open overlay)', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, paused: true,
      }),
    )
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.suggestion).toBeNull()
  })

  it('stempelt niets zolang paused — óók niet bij een auto-dismiss (M15)', () => {
    // Dit is de latente fout uit de localStorage-versie: de auto-dismiss-timer
    // liep gewoon door achter een open modal en schreef de tip weg als gezien,
    // terwijl niemand hem ooit had zien staan.
    const { result, rerender } = renderHook(
      ({ paused }) =>
        useCoachSuggestion({
          coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, paused,
        }),
      { initialProps: { paused: false } },
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')

    rerender({ paused: true })
    act(() => { result.current.dismiss('auto') })
    expect(puts).toHaveLength(0)
    // En de melding blijft staan, dus na het sluiten van de overlay is hij nog
    // te lezen i.p.v. ongezien verdwenen.
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('kiest alsnog zodra de pauze voorbij is', () => {
    const { result, rerender } = renderHook(
      ({ paused }) =>
        useCoachSuggestion({
          coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, paused,
        }),
      { initialProps: { paused: true } },
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion).toBeNull()
    rerender({ paused: false })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })
})

describe('useCoachSuggestion — rustpauze op route-tips (H17)', () => {
  it('houdt een route-tip tegen binnen de rustpauze na een dismissal', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({ lastDismissedAt: new Date(Date.now() - 60_000).toISOString() }),
        dataGaps: fullGaps(), delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion).toBeNull()
  })

  it('toont de route-tip weer zodra de rustpauze voorbij is', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({
          lastDismissedAt: new Date(Date.now() - PATH_SUGGESTION_COOLDOWN_MS - 1).toISOString(),
        }),
        dataGaps: fullGaps(), delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('path_core')
  })

  it('laat een data-gap-tip ongemoeid binnen de rustpauze', () => {
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({ lastDismissedAt: new Date(Date.now() - 60_000).toISOString() }),
        dataGaps: fullGaps({ hasBank: false }), delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
  })

  it('negeert een corrupte lastDismissedAt i.p.v. de tip permanent te blokkeren', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: { ...EMPTY_COACH_STATE, lastDismissedAt: 'ooit' },
        dataGaps: fullGaps(), delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('path_core')
  })
})

// ── ADR 0130 fase 2: de gids-bubbel en zijn dagregel ───────────────────────
//
// De hook mockt `/overzicht` als pathname; de gidsstappen hieronder wijzen dus
// naar die route. Getoetst worden: de dagregel (max één per dag), het moment
// van stempelen (bij verschijnen, nooit achter een pauze) en het verschil
// tussen wegklikken (die stap stil) en vanzelf wegglijden (alleen de dag om).
describe('useCoachSuggestion — gids-bubbel (ADR 0130)', () => {
  const GUIDE_KEY = 'guide_s1-bezittingen'
  const guide = (): GuideSuggestionInput => ({
    status: 'active',
    steps: [
      { id: 's1-bezittingen', title: 'Zijn al je bezittingen geregistreerd?', href: '/overzicht' },
      { id: 's1-schulden', title: 'Zijn al je schulden geregistreerd?', href: '/overzicht' },
    ],
  })

  it('toont de gidsstap en stempelt de dag zodra hij verschijnt', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide() }),
    )
    // Vóór de vertraging staat er niets — en is er dus ook niets gestempeld.
    expect(puts).toHaveLength(0)
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe(GUIDE_KEY)
    expect(puts).toEqual([{ action: 'guideShown' }])
  })

  it('stempelt niet zolang paused — de bubbel is dan immers niet te zien', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, paused: true, guide: guide(),
      }),
    )
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.suggestion).toBeNull()
    expect(puts).toHaveLength(0)
  })

  it('dagregel: op dezelfde dag geen tweede gids-bubbel, maar wél de pad-tip', () => {
    vi.setSystemTime(new Date('2026-09-05T14:00:00'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({ guideLastShownAt: new Date('2026-09-05T09:00:00').toISOString() }),
        dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide(),
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    // Géén gids-bubbel — en ook géén data-gap: de gids-laag blijft de data-gaten
    // vervangen zolang de gids loopt. De pad-tip voor /overzicht wint.
    expect(result.current.suggestion?.key).toBe('path_core')
    expect(puts).toHaveLength(0)
  })

  it('een stempel van gisteren blokkeert niets meer', () => {
    vi.setSystemTime(new Date('2026-09-05T08:00:00'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({ guideLastShownAt: new Date('2026-09-04T23:30:00').toISOString() }),
        dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide(),
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe(GUIDE_KEY)
  })

  it('kruisje: dagstempel én een dismiss van díe stap', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide() }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss('user') })
    expect(puts).toEqual([{ action: 'guideShown' }, { action: 'dismiss', key: GUIDE_KEY }])
  })

  it('vanzelf wegglijden: alleen de dagstempel, de stap blijft open', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide() }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    act(() => { result.current.dismiss('auto') })
    // Eén stempel, geen dismiss: de stap staat morgen weer op de lijst.
    expect(puts).toEqual([{ action: 'guideShown' }])
  })

  it('morgen de volgende stap, nadat de eerste is weggeklikt', () => {
    vi.setSystemTime(new Date('2026-09-06T09:00:00'))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state({
          dismissed: [GUIDE_KEY],
          guideLastShownAt: new Date('2026-09-05T09:00:00').toISOString(),
        }),
        dataGaps: fullGaps({ hasBank: false }), delayMs: 0, guide: guide(),
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('guide_s1-schulden')
  })

  it('afgesloten gids: de data-gap-laag doet weer gewoon zijn werk', () => {
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0,
        guide: { status: 'dismissed', steps: guide().steps },
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    expect(puts).toHaveLength(0)
  })
})

describe('useCoachSuggestion — eenmalige legacy-migratie', () => {
  it('neemt de oude localStorage-lijst over, wist de drie sleutels en PUT één keer', () => {
    localStorage.setItem('trifinity_coach_dismissed_suggestions', JSON.stringify(['gap_bank', 'path_core']))
    localStorage.setItem('trifinity_coach_bubble_dismissed', '1')
    localStorage.setItem('trifinity_coach_last_dismissed_at', String(Date.now()))

    const { rerender } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })

    expect(puts).toEqual([{ action: 'importLegacy', keys: ['gap_bank', 'path_core', 'default'] }])
    expect(localStorage.getItem('trifinity_coach_dismissed_suggestions')).toBeNull()
    expect(localStorage.getItem('trifinity_coach_bubble_dismissed')).toBeNull()
    expect(localStorage.getItem('trifinity_coach_last_dismissed_at')).toBeNull()

    // Niet nog eens bij een volgende render.
    rerender()
    act(() => { vi.advanceTimersByTime(0) })
    expect(puts).toHaveLength(1)
  })

  it('past de overgenomen sleutels meteen toe op de selectie', () => {
    localStorage.setItem('trifinity_coach_dismissed_suggestions', JSON.stringify(['gap_bank']))
    const { result } = renderHook(() =>
      useCoachSuggestion({
        coachState: state(), dataGaps: fullGaps({ hasBank: false, hasAssets: false }), delayMs: 0,
      }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_assets')
  })

  it('doet niets (en schrijft niets) zonder oude sleutels', () => {
    renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(puts).toHaveLength(0)
  })

  it('overleeft een corrupte oude lijst', () => {
    localStorage.setItem('trifinity_coach_dismissed_suggestions', '{niet-json')
    const { result } = renderHook(() =>
      useCoachSuggestion({ coachState: state(), dataGaps: fullGaps({ hasBank: false }), delayMs: 0 }),
    )
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.suggestion?.key).toBe('gap_bank')
    expect(localStorage.getItem('trifinity_coach_dismissed_suggestions')).toBeNull()
  })
})
