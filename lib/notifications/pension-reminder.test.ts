import { describe, it, expect } from 'vitest'
import { isInPensionWindow, shouldSendPensionReminder } from './pension-reminder'

const inWindow = new Date('2026-01-15T12:00:00Z')
const beforeWindow = new Date('2025-12-31T23:59:59Z')
const afterWindow = new Date('2026-02-01T00:00:00Z')
const startBoundary = new Date('2026-01-01T00:00:00Z')
const lastDayWindow = new Date('2026-01-31T23:59:59Z')

describe('isInPensionWindow', () => {
  it('accepts the start boundary (1 januari 00:00 UTC)', () => {
    expect(isInPensionWindow(startBoundary)).toBe(true)
  })

  it('accepts the last day of the window (31 januari)', () => {
    expect(isInPensionWindow(lastDayWindow)).toBe(true)
  })

  it('rejects the day before the window (31 december)', () => {
    expect(isInPensionWindow(beforeWindow)).toBe(false)
  })

  it('rejects the day the window closes (1 februari is exclusive)', () => {
    expect(isInPensionWindow(afterWindow)).toBe(false)
  })
})

describe('shouldSendPensionReminder', () => {
  it('returns false when the user has no retirement assets', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 0 },
        lastSentAt: null,
        now: inWindow,
      }),
    ).toBe(false)
  })

  it('returns false outside the januari window', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 1 },
        lastSentAt: null,
        now: beforeWindow,
      }),
    ).toBe(false)
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 1 },
        lastSentAt: null,
        now: afterWindow,
      }),
    ).toBe(false)
  })

  it('returns true in-window when no reminder was ever sent', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 1 },
        lastSentAt: null,
        now: inWindow,
      }),
    ).toBe(true)
  })

  it('returns true in-window when last reminder was in a previous year', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 2 },
        lastSentAt: '2025-01-12T09:00:00Z',
        now: inWindow,
      }),
    ).toBe(true)
  })

  it('returns false when a reminder was already sent this year', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 1 },
        lastSentAt: '2026-01-02T08:00:00Z',
        now: inWindow,
      }),
    ).toBe(false)
  })

  it('treats invalid lastSentAt as "never sent"', () => {
    expect(
      shouldSendPensionReminder({
        profile: { retirementAssetCount: 1 },
        lastSentAt: 'not-a-date',
        now: inWindow,
      }),
    ).toBe(true)
  })
})
