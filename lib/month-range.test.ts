import { describe, it, expect } from 'vitest'
import { localDateString, localMonthBounds, localMonthEnd, localMonthStart, localMonthStartMonthsAgo } from './month-range'

describe('localMonthBounds — tijdzone-veilige maandgrenzen', () => {
  it('augustus 2025 → [2025-08-01, 2025-09-01)', () => {
    // monthDate zoals de cash-views het opbouwen: lokale middernacht op de 1e.
    const { start, end } = localMonthBounds(new Date(2025, 7, 1))
    expect(start).toBe('2025-08-01')
    expect(end).toBe('2025-09-01')
  })

  it('REGRESSIE: schuift NIET naar 31 juli (de toISOString-bug)', () => {
    // De oude `monthDate.toISOString().split('T')[0]` gaf in UTC+ tijdzones
    // "2025-07-31", waardoor een 31-juli-salaris in het augustus-overzicht lekte.
    const { start } = localMonthBounds(new Date(2025, 7, 1))
    expect(start).not.toBe('2025-07-31')
  })

  it('jaarwissel: december 2025 → [2025-12-01, 2026-01-01)', () => {
    const { start, end } = localMonthBounds(new Date(2025, 11, 1))
    expect(start).toBe('2025-12-01')
    expect(end).toBe('2026-01-01')
  })

  it('januari → eind is 1 februari', () => {
    const { start, end } = localMonthBounds(new Date(2026, 0, 1))
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-02-01')
  })

  it('localMonthStart formatteert enkel-cijfer maanden met voorloopnul', () => {
    expect(localMonthStart(new Date(2025, 2, 1))).toBe('2025-03-01')
    expect(localMonthStart(new Date(2025, 8, 15))).toBe('2025-09-01')
  })
})

describe('localMonthStartMonthsAgo — N maanden terug, eerste dag (tijdzone-veilig)', () => {
  it('12-maands-venster: 11 maanden terug vanaf juni 2026 → juli 2025', () => {
    // Het gebruikelijke 12-maands rolling window (rapporten): de ondergrens
    // is de 1e van de maand 11 maanden geleden.
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 15), 11)).toBe('2025-07-01')
  })

  it('jaarwissel: 11 maanden terug vanaf januari 2026 → februari 2025', () => {
    expect(localMonthStartMonthsAgo(new Date(2026, 0, 20), 11)).toBe('2025-02-01')
  })

  it('REGRESSIE: schuift NIET een dag terug zoals new Date(y,m,1).toISOString()', () => {
    // In NL (UTC+) gaf new Date(2026, 5-11, 1).toISOString() "2025-06-30"
    // i.p.v. de bedoelde 2025-07-01. De helper bouwt uit lokale componenten.
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 1), 11)).not.toBe('2025-06-30')
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 1), 11)).toBe('2025-07-01')
  })

  it('0 maanden terug = huidige maandstart', () => {
    expect(localMonthStartMonthsAgo(new Date(2025, 8, 17), 0)).toBe('2025-09-01')
  })

  describe('6-kalendermaands-venster (savingsRate6m) — 5 maanden terug, incl. huidige maand', () => {
    it('juni 2026: 5 maanden terug → 2026-01-01 (Jan..Jun = 6 maanden, NIET 7)', () => {
      // Historische helper-assertie (pre-C6): 5 maanden terug vanaf 15 juni 2026
      // = 1 januari 2026. NB het savingsRate6m-venster zelf loopt sinds C6 over
      // zes AFGESLOTEN maanden (Dec..Mei voor now=juni, `savingsRateWindow`), en
      // sinds ADR 0138 toont de kassabon precies die maanden
      // (monthlyIncomeExpenseSeries = 12 afgesloten maanden, `.slice(-6)`).
      expect(localMonthStartMonthsAgo(new Date(2026, 5, 15), 5)).toBe('2026-01-01')
    })

    it('jaarwissel: februari 2026, 5 maanden terug → 2025-09-01', () => {
      // Sep, Okt, Nov, Dec, Jan, Feb = 6 maanden.
      expect(localMonthStartMonthsAgo(new Date(2026, 1, 15), 5)).toBe('2025-09-01')
    })

    it('REGRESSIE off-by-one: helper(−5) wijkt af van het oude inline −6-patroon én is correct', () => {
      // Het oude loader-patroon `new Date(Date.UTC(y, m - 6, 1)).toISOString()`
      // gaf voor now=juni 2026 de ondergrens 2025-12-01 → Dec..Jun = 7 maanden
      // (vandaar ~54% in de kassabon vs ~50% canoniek). Dit is DE bewijs-assertie:
      // de oude expressie levert de 7-maands-start, de helper de 6-maands-start.
      const oudeInlineWaarde = new Date(Date.UTC(2026, 5 - 6, 1)).toISOString().split('T')[0]
      expect(oudeInlineWaarde).toBe('2025-12-01') // 7-maands venster (de bug)

      const nieuweHelperWaarde = localMonthStartMonthsAgo(new Date(2026, 5, 15), 5)
      expect(nieuweHelperWaarde).not.toBe(oudeInlineWaarde) // off-by-one bewezen
      expect(nieuweHelperWaarde).toBe('2026-01-01') // 6-maands venster (correct)
    })
  })
})

describe('localMonthEnd — laatste dag van de maand als string (tijdzone-veilig)', () => {
  it('augustus 2025 → 2025-08-31', () => {
    expect(localMonthEnd(new Date(2025, 7, 15))).toBe('2025-08-31')
  })

  it('februari 2024 (schrikkeljaar) → 2024-02-29', () => {
    expect(localMonthEnd(new Date(2024, 1, 1))).toBe('2024-02-29')
  })

  it('februari 2025 (geen schrikkeljaar) → 2025-02-28', () => {
    expect(localMonthEnd(new Date(2025, 1, 10))).toBe('2025-02-28')
  })

  it('december (jaarwissel) → 2025-12-31', () => {
    expect(localMonthEnd(new Date(2025, 11, 1))).toBe('2025-12-31')
  })

  it('30-daagse maand (april) → 2025-04-30', () => {
    expect(localMonthEnd(new Date(2025, 3, 1))).toBe('2025-04-30')
  })

  it('REGRESSIE: schuift NIET een dag terug zoals new Date(y,m+1,0).toISOString()', () => {
    // In NL (UTC+) gaf new Date(2025, 8, 0).toISOString() "2025-08-30T22:00Z"
    // → "2025-08-30" i.p.v. de bedoelde 2025-08-31. De helper bouwt uit lokale
    // componenten, dus geen dag-verschuiving.
    expect(localMonthEnd(new Date(2025, 7, 1))).toBe('2025-08-31')
  })
})

describe('localDateString — volledige kalenderdatum, tijdzone-veilig', () => {
  it('formatteert uit lokale componenten, met padding', () => {
    expect(localDateString(new Date(2026, 8, 7))).toBe('2026-09-07')
    expect(localDateString(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('REGRESSIE (UR3-25): 1 januari blijft 1 januari, niet 31 december', () => {
    // `new Date(1991, 0, 1).toISOString()` gaf in NL "1990-12-31" — daardoor
    // werd een persona met een gepinde geboortedatum een jaar ouder dan bedoeld
    // (lib/regression-tests/horizon-strategie/persona-fixture.ts).
    expect(localDateString(new Date(1991, 0, 1))).toBe('1991-01-01')
  })

  it('REGRESSIE: zomertijd (CEST) schuift de dag evenmin terug', () => {
    expect(localDateString(new Date(2026, 6, 1))).toBe('2026-07-01')
  })

  it('houdt het uur buiten beschouwing (kalenderdag, geen moment)', () => {
    expect(localDateString(new Date(2026, 8, 7, 0, 5))).toBe('2026-09-07')
    expect(localDateString(new Date(2026, 8, 7, 23, 55))).toBe('2026-09-07')
  })

  it('schrikkeldag', () => {
    expect(localDateString(new Date(2028, 1, 29))).toBe('2028-02-29')
  })
})

describe('maandgrenzen in CET en CEST — beide kanten van de zomertijdgrens', () => {
  it('wintermaand (CET): januari 2026', () => {
    expect(localMonthBounds(new Date(2026, 0, 1))).toEqual({ start: '2026-01-01', end: '2026-02-01' })
    expect(localMonthEnd(new Date(2026, 0, 1))).toBe('2026-01-31')
  })

  it('zomermaand (CEST): juli 2026', () => {
    expect(localMonthBounds(new Date(2026, 6, 1))).toEqual({ start: '2026-07-01', end: '2026-08-01' })
    expect(localMonthEnd(new Date(2026, 6, 1))).toBe('2026-07-31')
  })

  it('de maand waarin de klok vooruit gaat (maart 2026)', () => {
    expect(localMonthBounds(new Date(2026, 2, 1))).toEqual({ start: '2026-03-01', end: '2026-04-01' })
  })

  it('de maand waarin de klok terug gaat (oktober 2026)', () => {
    expect(localMonthBounds(new Date(2026, 9, 1))).toEqual({ start: '2026-10-01', end: '2026-11-01' })
  })

  it('jaargrens december 2026 → januari 2027', () => {
    expect(localMonthBounds(new Date(2026, 11, 1))).toEqual({ start: '2026-12-01', end: '2027-01-01' })
    expect(localMonthStartMonthsAgo(new Date(2027, 0, 15), 1)).toBe('2026-12-01')
  })
})
