import { describe, it, expect } from 'vitest'
import {
  COACH_DISMISSED_CAP,
  COACH_STATE_KEY,
  EMPTY_COACH_STATE,
  GUIDE_SUGGESTION_KEY_PREFIX,
  appendDismissed,
  isSameLocalDay,
  parseCoachState,
} from './coach-state'

/**
 * lib/coach-state — de gedeelde, pure laag onder `/api/coach-state` en
 * `useCoachSuggestion` (ADR 0130).
 *
 * De twee eigenschappen die ertoe doen:
 *  1. `parseCoachState` mag NOOIT gooien. Hij leest een jsonb-kolom die door
 *     oudere versies, een halve schrijf of een handmatige ingreep vervuild kan
 *     zijn; een uitzondering daar sloopt de hele shell-render.
 *  2. `isSameLocalDay` rekent in de LOKALE dag van de gebruiker, niet in UTC —
 *     anders klapt de dagregel van de gids-bubbel in Nederland een of twee uur
 *     te vroeg om, precies in het avondvenster waarin mensen de app openen.
 */

describe('parseCoachState — defaults en corrupte invoer', () => {
  it('geeft de lege staat bij undefined/null (sleutel bestaat nog niet)', () => {
    expect(parseCoachState(undefined)).toEqual(EMPTY_COACH_STATE)
    expect(parseCoachState(null)).toEqual(EMPTY_COACH_STATE)
  })

  it('geeft de lege staat bij een niet-object (string, getal, array)', () => {
    expect(parseCoachState('kapot')).toEqual(EMPTY_COACH_STATE)
    expect(parseCoachState(42)).toEqual(EMPTY_COACH_STATE)
    expect(parseCoachState(['gap_bank'])).toEqual(EMPTY_COACH_STATE)
  })

  it('leest een geldige staat volledig', () => {
    expect(
      parseCoachState({
        dismissed: ['gap_bank', 'path_core'],
        lastDismissedAt: '2026-09-05T10:00:00.000Z',
        guideLastShownAt: '2026-09-04T21:30:00.000Z',
      }),
    ).toEqual({
      dismissed: ['gap_bank', 'path_core'],
      lastDismissedAt: '2026-09-05T10:00:00.000Z',
      guideLastShownAt: '2026-09-04T21:30:00.000Z',
    })
  })

  it('filtert niet-strings en lege sleutels uit dismissed en ontdubbelt', () => {
    expect(
      parseCoachState({ dismissed: ['gap_bank', 42, null, '', 'gap_bank', 'path_core'] }).dismissed,
    ).toEqual(['gap_bank', 'path_core'])
  })

  it('degradeert een onleesbare datum naar null i.p.v. te gooien', () => {
    const state = parseCoachState({
      dismissed: [],
      lastDismissedAt: 'gisteren',
      guideLastShownAt: 12345,
    })
    expect(state.lastDismissedAt).toBeNull()
    expect(state.guideLastShownAt).toBeNull()
  })

  it('kapt een te lange dismissed-lijst af op de cap en houdt de NIEUWSTE', () => {
    const many = Array.from({ length: COACH_DISMISSED_CAP + 5 }, (_, i) => `k${i}`)
    const parsed = parseCoachState({ dismissed: many })
    expect(parsed.dismissed).toHaveLength(COACH_DISMISSED_CAP)
    expect(parsed.dismissed[0]).toBe('k5')
    expect(parsed.dismissed.at(-1)).toBe(`k${COACH_DISMISSED_CAP + 4}`)
  })

  it('houdt de sleutelnamen vast (contract met de jsonb-kolom)', () => {
    expect(COACH_STATE_KEY).toBe('coach:state')
    expect(GUIDE_SUGGESTION_KEY_PREFIX).toBe('guide_')
  })
})

describe('appendDismissed', () => {
  it('voegt toe, ontdubbelt en bewaart de volgorde (oudste eerst)', () => {
    expect(appendDismissed(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('negeert lege en niet-string sleutels', () => {
    expect(appendDismissed(['a'], ['', 'b'])).toEqual(['a', 'b'])
  })

  it('kapt af op de cap en laat de oudste vallen', () => {
    const current = Array.from({ length: COACH_DISMISSED_CAP }, (_, i) => `k${i}`)
    const next = appendDismissed(current, ['nieuw'])
    expect(next).toHaveLength(COACH_DISMISSED_CAP)
    expect(next).not.toContain('k0')
    expect(next.at(-1)).toBe('nieuw')
  })
})

describe('isSameLocalDay — rond middernacht in lokale tijd', () => {
  it('is false bij null of een onleesbare datum', () => {
    expect(isSameLocalDay(null, new Date())).toBe(false)
    expect(isSameLocalDay('ooit', new Date())).toBe(false)
  })

  it('is true voor twee momenten op dezelfde lokale dag', () => {
    // Lokale tijden: de test mag niet afhangen van de tijdzone van de machine,
    // dus we bouwen beide momenten lokaal op.
    const ochtend = new Date(2026, 8, 5, 8, 30)
    const avond = new Date(2026, 8, 5, 23, 59, 59)
    expect(isSameLocalDay(ochtend.toISOString(), avond)).toBe(true)
  })

  it('is false zodra de lokale middernacht gepasseerd is', () => {
    const netVoor = new Date(2026, 8, 5, 23, 59, 59)
    const netNa = new Date(2026, 8, 6, 0, 0, 1)
    expect(isSameLocalDay(netVoor.toISOString(), netNa)).toBe(false)
  })

  it('kijkt naar de kalenderdag, niet naar 24 uur verschil', () => {
    // Twee uur uit elkaar, maar over de lokale dagrand heen → andere dag.
    const laat = new Date(2026, 8, 5, 23, 0)
    const vroeg = new Date(2026, 8, 6, 1, 0)
    expect(isSameLocalDay(laat.toISOString(), vroeg)).toBe(false)
    // En omgekeerd: 20 uur uit elkaar maar binnen dezelfde dag kan niet, dus
    // de tegenhanger is dezelfde dag met een groot gat.
    const vroegeOchtend = new Date(2026, 8, 6, 0, 5)
    const lateAvond = new Date(2026, 8, 6, 23, 55)
    expect(isSameLocalDay(vroegeOchtend.toISOString(), lateAvond)).toBe(true)
  })

  it('vergelijkt óók het jaar en de maand (niet alleen de dagnummer)', () => {
    const vorigJaar = new Date(2025, 8, 5, 12, 0)
    const nu = new Date(2026, 8, 5, 12, 0)
    expect(isSameLocalDay(vorigJaar.toISOString(), nu)).toBe(false)
  })
})
