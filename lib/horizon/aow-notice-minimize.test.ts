import { describe, it, expect } from 'vitest'
import {
  AOW_MINIMIZED_FLAG,
  AOW_NOTICE_MINIMIZE_KEY,
  AOW_ONTBREEKT_COPY,
  asAowMinimizedFlag,
  resolveAowNoticeDisplay,
} from './aow-notice-minimize'

describe('TPR-04 — aow-notice-minimize (puur)', () => {
  it('asAowMinimizedFlag: alleen het getal 1 is een vlag; strings/NaN/0/negatief niet', () => {
    expect(asAowMinimizedFlag(1)).toBe(AOW_MINIMIZED_FLAG)
    expect(asAowMinimizedFlag('warn')).toBeNull()
    expect(asAowMinimizedFlag('info')).toBeNull()
    expect(asAowMinimizedFlag(Number.NaN)).toBeNull()
    expect(asAowMinimizedFlag(0)).toBeNull()
    expect(asAowMinimizedFlag(-1)).toBeNull()
    expect(asAowMinimizedFlag(2)).toBeNull()
    expect(asAowMinimizedFlag(null)).toBeNull()
  })

  it("resolveAowNoticeDisplay: geen notice → 'none'; notice zonder vlag → 'expanded'; met vlag → 'minimized'", () => {
    expect(resolveAowNoticeDisplay(false, null)).toBe('none')
    expect(resolveAowNoticeDisplay(false, 1)).toBe('none')
    expect(resolveAowNoticeDisplay(true, null)).toBe('expanded')
    expect(resolveAowNoticeDisplay(true, 1)).toBe('minimized')
  })

  it('sleutel leeft in de /toekomst-naamruimte en de deeplink opent de AOW-editor', () => {
    expect(AOW_NOTICE_MINIMIZE_KEY).toBe('/toekomst/aow-ontbreekt')
    expect(AOW_ONTBREEKT_COPY.actieHref).toBe('/toekomst/voorkeuren?strategie=aow')
  })

  it('kopij volgt de norm keuze · effect · waarom en is beschrijvend (geen aansporing)', () => {
    expect(AOW_ONTBREEKT_COPY.keuze).toMatch(/€0 AOW/)
    expect(AOW_ONTBREEKT_COPY.effect).toMatch(/vrijheidsmoment/)
    expect(AOW_ONTBREEKT_COPY.waarom).toMatch(/grootste vaste post/)
    for (const tekst of [AOW_ONTBREEKT_COPY.keuze, AOW_ONTBREEKT_COPY.effect, AOW_ONTBREEKT_COPY.waarom]) {
      expect(tekst).not.toMatch(/aanbevolen|past bij jou|moet je/i)
    }
  })
})
