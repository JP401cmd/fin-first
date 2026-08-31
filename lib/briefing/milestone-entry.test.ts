import { describe, it, expect } from 'vitest'
import {
  FRESH_MILESTONE_ID_PREFIX,
  buildFreshMilestoneEntry,
  withFreshMilestone,
} from './milestone-entry'
import { OVERVIEW_BRIEFING_MAX } from './overview-briefing'
import { MILESTONE_FRESH_WINDOW_MS, type AchievedMilestoneRow } from '@/lib/milestones/types'
import type { BriefingEntry } from '@/lib/types/briefing'

const NOW = new Date('2026-08-31T12:00:00.000Z')

function milestone(over: Partial<AchievedMilestoneRow> = {}): AchievedMilestoneRow {
  return {
    id: 'm1',
    user_id: 'u1',
    milestone_key: 'vermogen-100k',
    kind: 'vermogen',
    threshold_value: 100_000,
    observed_value: 104_000,
    achieved_at: '2026-08-31T09:00:00.000Z',
    acknowledged_at: null,
    source: 'detect',
    ...over,
  }
}

function entries(n: number): BriefingEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `observation:${i}`,
    category: 'observation' as const,
    text: `Briefje ${i}`,
  }))
}

/** `achieved_at` op exact `hours` uur vóór NOW. */
function agedHours(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
}

describe('buildFreshMilestoneEntry', () => {
  it('bouwt een milestone-entry met de verse id-prefix en /overzicht als doel', () => {
    const entry = buildFreshMilestoneEntry(milestone(), 100)
    expect(entry.id).toBe(`${FRESH_MILESTONE_ID_PREFIX}vermogen-100k`)
    expect(entry.category).toBe('milestone')
    expect(entry.href).toBe('/overzicht')
    expect(entry.text).toContain('100.000')
    // De vrijheidstijd-vertaling komt uit copy.ts (calculateFreedomTime).
    expect(entry.text).toContain('2 jaar en 9 maanden')
  })

  it('werkt zonder dagtarief — dan zonder vrijheidstijd, nooit met een verzonnen getal', () => {
    const entry = buildFreshMilestoneEntry(milestone(), null)
    expect(entry.text).toContain('100.000')
    expect(entry.text).not.toContain('jaar')
  })
})

describe('withFreshMilestone — het venster', () => {
  it('injecteert een mijlpaal van 3 uur oud vooraan', () => {
    const result = withFreshMilestone(entries(4), milestone({ achieved_at: agedHours(3) }), 100, NOW)
    expect(result[0].id).toBe(`${FRESH_MILESTONE_ID_PREFIX}vermogen-100k`)
    expect(result).toHaveLength(5)
  })

  it('injecteert nog net binnen 48 uur', () => {
    const result = withFreshMilestone(entries(3), milestone({ achieved_at: agedHours(47.9) }), 100, NOW)
    expect(result[0].id.startsWith(FRESH_MILESTONE_ID_PREFIX)).toBe(true)
  })

  it('injecteert NIET meer bij 49 uur oud', () => {
    const input = entries(3)
    const result = withFreshMilestone(input, milestone({ achieved_at: agedHours(49) }), 100, NOW)
    expect(result).toBe(input)
    expect(result.some((e) => e.id.startsWith(FRESH_MILESTONE_ID_PREFIX))).toBe(false)
  })

  it('gebruikt exact MILESTONE_FRESH_WINDOW_MS als grens', () => {
    const opDeGrens = new Date(NOW.getTime() - MILESTONE_FRESH_WINDOW_MS).toISOString()
    const netErover = new Date(NOW.getTime() - MILESTONE_FRESH_WINDOW_MS - 1).toISOString()
    expect(
      withFreshMilestone(entries(2), milestone({ achieved_at: opDeGrens }), 100, NOW)[0].id,
    ).toContain(FRESH_MILESTONE_ID_PREFIX)
    expect(
      withFreshMilestone(entries(2), milestone({ achieved_at: netErover }), 100, NOW),
    ).toHaveLength(2)
  })

  it('een tijdstip in de toekomst telt als zojuist, niet als verlopen', () => {
    const result = withFreshMilestone(entries(2), milestone({ achieved_at: agedHours(-2) }), 100, NOW)
    expect(result[0].id.startsWith(FRESH_MILESTONE_ID_PREFIX)).toBe(true)
  })
})

describe('withFreshMilestone — lijstlengte en randgevallen', () => {
  it('laat de lijst niet groeien boven OVERVIEW_BRIEFING_MAX', () => {
    const input = entries(OVERVIEW_BRIEFING_MAX)
    const result = withFreshMilestone(input, milestone({ achieved_at: agedHours(1) }), 100, NOW)
    expect(result).toHaveLength(OVERVIEW_BRIEFING_MAX)
    expect(result[0].id.startsWith(FRESH_MILESTONE_ID_PREFIX)).toBe(true)
    // De laatste is verdrongen, niet de eerste.
    expect(result.some((e) => e.id === `observation:${OVERVIEW_BRIEFING_MAX - 1}`)).toBe(false)
    expect(result.some((e) => e.id === 'observation:0')).toBe(true)
  })

  it('kapt ook een reeds te lange lijst terug op het maximum', () => {
    const result = withFreshMilestone(
      entries(OVERVIEW_BRIEFING_MAX + 4),
      milestone({ achieved_at: agedHours(1) }),
      100,
      NOW,
    )
    expect(result).toHaveLength(OVERVIEW_BRIEFING_MAX)
  })

  it('row === null laat de lijst ongemoeid', () => {
    const input = entries(3)
    expect(withFreshMilestone(input, null, 100, NOW)).toBe(input)
  })

  it('een onleesbare achieved_at laat de lijst ongemoeid', () => {
    const input = entries(3)
    expect(withFreshMilestone(input, milestone({ achieved_at: 'geen-datum' }), 100, NOW)).toBe(input)
  })

  it('tweemaal toepassen levert geen duplicaat', () => {
    const row = milestone({ achieved_at: agedHours(1) })
    const once = withFreshMilestone(entries(3), row, 100, NOW)
    const twice = withFreshMilestone(once, row, 100, NOW)
    const freshCount = twice.filter((e) => e.id.startsWith(FRESH_MILESTONE_ID_PREFIX)).length
    expect(freshCount).toBe(1)
    expect(twice).toHaveLength(once.length)
  })

  it('injecteert in een lege lijst', () => {
    const result = withFreshMilestone([], milestone({ achieved_at: agedHours(1) }), 100, NOW)
    expect(result).toHaveLength(1)
  })
})

describe('context.goalName reist mee naar de entry-tekst (plan 3c)', () => {
  it('checkpoint-entry draagt de doelnaam', () => {
    const row = {
      id: 'm1',
      user_id: 'u1',
      milestone_key: 'doel-checkpoint:g1:50',
      kind: 'doel',
      threshold_value: 50,
      observed_value: 53,
      achieved_at: new Date().toISOString(),
      acknowledged_at: null,
      source: 'detect',
    } as AchievedMilestoneRow
    const entries = withFreshMilestone([], row, null, new Date(), { goalName: 'Wereldreis' })
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toContain('Wereldreis')
    expect(entries[0].id).toBe('milestone:fresh:doel-checkpoint:g1:50')
  })
})
