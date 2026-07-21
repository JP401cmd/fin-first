import { describe, it, expect } from 'vitest'
import {
  utcDayStamp,
  shouldSkipAutoSnapshot,
  AUTO_SNAPSHOT_DAY_KEY,
} from './snapshot-daystamp'

describe('snapshot-daystamp', () => {
  it('utcDayStamp geeft de UTC-dag YYYY-MM-DD', () => {
    expect(utcDayStamp(new Date('2026-07-21T23:59:00.000Z'))).toBe('2026-07-21')
    // Vlak na middernacht UTC → nieuwe dag.
    expect(utcDayStamp(new Date('2026-07-22T00:00:01.000Z'))).toBe('2026-07-22')
  })

  it('sleutel is stabiel', () => {
    expect(AUTO_SNAPSHOT_DAY_KEY).toBe('trifinity:auto-snapshot-day')
  })

  describe('shouldSkipAutoSnapshot', () => {
    const today = '2026-07-21'

    it('slaat over als de module-guard vandaag is (deze JS-context deed het al)', () => {
      expect(shouldSkipAutoSnapshot('2026-07-21', null, today)).toBe(true)
    })

    it('slaat over als de localStorage-stempel vandaag is (harde reload na geslaagde call)', () => {
      expect(shouldSkipAutoSnapshot(null, '2026-07-21', today)).toBe(true)
    })

    it('draait als geen van beide vandaag is (verse JS-context, nog geen call)', () => {
      expect(shouldSkipAutoSnapshot(null, null, today)).toBe(false)
    })

    it('draait bij dag-rollover — gisteren telt niet als vandaag (dagelijkse garantie)', () => {
      expect(shouldSkipAutoSnapshot('2026-07-20', '2026-07-20', today)).toBe(false)
    })
  })
})
