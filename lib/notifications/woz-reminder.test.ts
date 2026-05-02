import { describe, it, expect } from 'vitest'
import { isInWozWindow, shouldSendWozReminder } from './woz-reminder'

const inWindow = new Date('2026-05-15T12:00:00Z')
const beforeWindow = new Date('2026-04-30T23:59:59Z')
const afterWindow = new Date('2026-07-01T00:00:00Z')
const startBoundary = new Date('2026-05-01T00:00:00Z')
const lastDayWindow = new Date('2026-06-30T23:59:59Z')

describe('isInWozWindow', () => {
  it('accepts the start boundary (1 mei 00:00 UTC)', () => {
    expect(isInWozWindow(startBoundary)).toBe(true)
  })

  it('accepts the last day of the window (30 juni)', () => {
    expect(isInWozWindow(lastDayWindow)).toBe(true)
  })

  it('rejects the day before the window (30 april)', () => {
    expect(isInWozWindow(beforeWindow)).toBe(false)
  })

  it('rejects the day the window closes (1 juli is exclusive)', () => {
    expect(isInWozWindow(afterWindow)).toBe(false)
  })
})

describe('shouldSendWozReminder', () => {
  it('returns false when the user has no eigen_huis assets', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 0 },
        lastSentAt: null,
        now: inWindow,
      }),
    ).toBe(false)
  })

  it('returns false outside the mei-juni window', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 1 },
        lastSentAt: null,
        now: beforeWindow,
      }),
    ).toBe(false)
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 1 },
        lastSentAt: null,
        now: afterWindow,
      }),
    ).toBe(false)
  })

  it('returns true in-window when no reminder was ever sent', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 1 },
        lastSentAt: null,
        now: inWindow,
      }),
    ).toBe(true)
  })

  it('returns true in-window when last reminder was in a previous year', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 2 },
        lastSentAt: '2025-06-12T09:00:00Z',
        now: inWindow,
      }),
    ).toBe(true)
  })

  it('returns false when a reminder was already sent this year', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 1 },
        lastSentAt: '2026-05-02T08:00:00Z',
        now: inWindow,
      }),
    ).toBe(false)
  })

  it('treats invalid lastSentAt as "never sent"', () => {
    expect(
      shouldSendWozReminder({
        profile: { eigenHuisAssetCount: 1 },
        lastSentAt: 'not-a-date',
        now: inWindow,
      }),
    ).toBe(true)
  })
})
