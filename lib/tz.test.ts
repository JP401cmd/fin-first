import { describe, expect, it } from 'vitest'
import {
  amsterdamHour,
  amsterdamParts,
  formatAmsterdamDayMonth,
  formatAmsterdamDayMonthYear,
  formatAmsterdamLongDateTime,
  formatAmsterdamShortDate,
  formatAmsterdamTime,
  isSameAmsterdamDay,
  isSameAmsterdamYear,
} from './tz'

/**
 * De invariant die deze suite bewaakt: elke helper in `lib/tz.ts` hangt
 * UITSLUITEND van het moment af, nooit van de tijdzone waarin de runtime
 * draait. Server-render (Vercel = UTC) en eerste client-render (browser =
 * Europe/Amsterdam) leveren daardoor per definitie dezelfde tekst — dat is wat
 * de React #418 tekst-mismatch afvangt.
 *
 * Zelfde `withTZ`-patroon als `lib/format.test.ts`.
 */

/** Draait `fn` alsof de runtime in tijdzone `tz` staat (Node herleest TZ per Date-operatie). */
function withTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    process.env.TZ = prev
  }
}

/**
 * De kern-assertie van de hele sweep: dezelfde aanroep in UTC en in
 * Europe/Amsterdam moet byte-identieke tekst geven.
 */
function expectTzParity<T>(fn: () => T): T {
  const onUtcServer = withTZ('UTC', fn)
  const inDutchBrowser = withTZ('Europe/Amsterdam', fn)
  // En voor de zekerheid een tijdzone aan de andere kant van de daggrens.
  const inTokyoBrowser = withTZ('Asia/Tokyo', fn)
  expect(inDutchBrowser).toEqual(onUtcServer)
  expect(inTokyoBrowser).toEqual(onUtcServer)
  return onUtcServer
}

describe('amsterdamParts', () => {
  it('geeft de Amsterdamse wandklokdelen, ongeacht de runtime-tijdzone', () => {
    const d = new Date('2026-08-04T08:00:00.000Z') // 10:00 CEST
    const parts = expectTzParity(() => amsterdamParts(d))
    expect(parts).toEqual({ year: 2026, month: 8, day: 4, hour: 10, minute: 0, weekday: 2 })
  })

  it('telt in de winter met CET (+1)', () => {
    const parts = expectTzParity(() => amsterdamParts(new Date('2026-01-15T08:00:00.000Z')))
    expect(parts.hour).toBe(9)
    expect(parts.day).toBe(15)
  })

  it('rolt door naar de volgende Amsterdamse kalenderdag na 22:00Z (zomertijd)', () => {
    // 22:30Z op 4 aug = 00:30 Amsterdam op 5 aug. Precies het venster waarin de
    // lokale getters server- en client-side uit elkaar liepen.
    const parts = expectTzParity(() => amsterdamParts(new Date('2026-08-04T22:30:00.000Z')))
    expect(parts).toMatchObject({ year: 2026, month: 8, day: 5, hour: 0, minute: 30 })
  })

  it('geeft uur 0 (niet 24) op Amsterdamse middernacht', () => {
    // De `hour12: false`-valkuil: sommige runtimes geven hier '24' terug.
    const parts = expectTzParity(() => amsterdamParts(new Date('2026-08-04T22:00:00.000Z')))
    expect(parts.hour).toBe(0)
    expect(parts.day).toBe(5)
  })

  it('bepaalt de weekdag uit de Amsterdamse kalenderdatum', () => {
    // 00:30 Amsterdam op woensdag 5 aug 2026 — in UTC nog dinsdag.
    const parts = expectTzParity(() => amsterdamParts(new Date('2026-08-04T22:30:00.000Z')))
    expect(parts.weekday).toBe(3) // woensdag
  })

  describe('DST-randen', () => {
    it('zomertijd in — 02:00 wordt 03:00 (laatste zondag maart 2026 = 29 mrt)', () => {
      const before = expectTzParity(() => amsterdamParts(new Date('2026-03-29T00:59:00.000Z')))
      const after = expectTzParity(() => amsterdamParts(new Date('2026-03-29T01:01:00.000Z')))
      expect(before.hour).toBe(1) // CET
      expect(after.hour).toBe(3) // CEST — 02:00 bestaat niet
    })

    it('wintertijd in — 03:00 wordt 02:00 (laatste zondag oktober 2026 = 25 okt)', () => {
      const before = expectTzParity(() => amsterdamParts(new Date('2026-10-25T00:30:00.000Z')))
      const after = expectTzParity(() => amsterdamParts(new Date('2026-10-25T01:30:00.000Z')))
      expect(before.hour).toBe(2) // CEST
      expect(after.hour).toBe(2) // CET — het uur herhaalt zich
    })
  })
})

describe('amsterdamHour', () => {
  it('is tijdzone-onafhankelijk', () => {
    expect(expectTzParity(() => amsterdamHour(new Date('2026-08-04T08:00:00.000Z')))).toBe(10)
  })
})

describe('formatAmsterdamTime', () => {
  it('geeft de Amsterdamse wandkloktijd, niet de UTC-tijd', () => {
    expect(expectTzParity(() => formatAmsterdamTime(new Date('2026-08-04T08:00:00.000Z')))).toBe('10:00')
  })

  it('padt uur en minuut tot twee cijfers', () => {
    expect(expectTzParity(() => formatAmsterdamTime(new Date('2026-01-15T06:05:00.000Z')))).toBe('07:05')
  })
})

describe('formatAmsterdamDayMonth / -DayMonthYear', () => {
  it('gebruikt de NL-afkorting zonder punt (ICU-onafhankelijk)', () => {
    const d = new Date('2026-03-05T12:00:00.000Z')
    expect(expectTzParity(() => formatAmsterdamDayMonth(d))).toBe('5 mrt')
    expect(expectTzParity(() => formatAmsterdamDayMonthYear(d))).toBe('5 mrt 2026')
  })

  it('gebruikt de Amsterdamse kalenderdag rond middernacht', () => {
    // 22:30Z op 31 dec = 00:30 Amsterdam op 1 jan van het VOLGENDE jaar.
    const d = new Date('2026-12-31T23:30:00.000Z')
    expect(expectTzParity(() => formatAmsterdamDayMonthYear(d))).toBe('1 jan 2027')
  })
})

describe('formatAmsterdamShortDate', () => {
  const now = new Date('2026-08-04T12:00:00.000Z') // 14:00 Amsterdam, di 4 aug

  it('vandaag → HH:mm', () => {
    expect(expectTzParity(() => formatAmsterdamShortDate(new Date('2026-08-04T08:00:00.000Z'), now))).toBe('10:00')
  })

  it('dit jaar → d MMM', () => {
    expect(expectTzParity(() => formatAmsterdamShortDate(new Date('2026-03-05T08:00:00.000Z'), now))).toBe('5 mrt')
  })

  it('ander jaar → d MMM yyyy', () => {
    expect(expectTzParity(() => formatAmsterdamShortDate(new Date('2025-03-05T08:00:00.000Z'), now))).toBe('5 mrt 2025')
  })

  it('kiest dezelfde dag-tak rond de Amsterdamse middernacht', () => {
    // 22:30Z op 4 aug = 00:30 Amsterdam op 5 aug; referentie 5 aug 08:00 Amsterdam.
    // In UTC valt de waarde op een ANDERE kalenderdag dan de referentie, in
    // Amsterdam op dezelfde → de buggy versie koos server-side "5 aug" en
    // client-side "00:30".
    const ref = new Date('2026-08-05T06:00:00.000Z')
    expect(expectTzParity(() => formatAmsterdamShortDate(new Date('2026-08-04T22:30:00.000Z'), ref))).toBe('00:30')
  })

  it('laat een date-only ISO-string niet verspringen', () => {
    // `new Date('2026-08-10')` = UTC-middernacht → 02:00 Amsterdam op dezelfde
    // dag. +1/+2 uur kruist geen daggrens terug, dus de dag blijft 10.
    const ref = new Date('2026-09-01T12:00:00.000Z')
    expect(expectTzParity(() => formatAmsterdamShortDate(new Date('2026-08-10'), ref))).toBe('10 aug')
  })
})

describe('formatAmsterdamLongDateTime', () => {
  it('geeft voluit-maand met Amsterdamse klok', () => {
    expect(expectTzParity(() => formatAmsterdamLongDateTime(new Date('2026-03-05T08:00:00.000Z')))).toBe(
      '5 maart 2026, 09:00',
    )
  })
})

describe('isSameAmsterdamDay / isSameAmsterdamYear', () => {
  it('vergelijkt op de Amsterdamse kalender, niet de UTC-kalender', () => {
    const a = new Date('2026-08-04T22:30:00.000Z') // 5 aug 00:30 Amsterdam
    const b = new Date('2026-08-05T06:00:00.000Z') // 5 aug 08:00 Amsterdam
    expect(expectTzParity(() => isSameAmsterdamDay(a, b))).toBe(true)
    // Terwijl ze in UTC op verschillende dagen vallen:
    expect(a.getUTCDate()).not.toBe(b.getUTCDate())
  })

  it('rekent de jaargrens in Amsterdamse tijd', () => {
    const oud = new Date('2026-12-31T23:00:00.000Z') // 1 jan 2027 00:00 Amsterdam
    const nieuw = new Date('2027-01-02T12:00:00.000Z')
    expect(expectTzParity(() => isSameAmsterdamYear(oud, nieuw))).toBe(true)
  })
})
