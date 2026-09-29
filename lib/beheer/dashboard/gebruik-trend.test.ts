import { describe, expect, it } from 'vitest'
import type { Cel } from '@/lib/beheer/gebruik-analyse/onderdrukking'
import { bouwGebruikTrend } from './gebruik-trend'

// Maandag 28 sep t/m zondag 4 okt 2026 is week 40; vandaag is dinsdag 29 sep.
const NU = new Date('2026-09-29T10:00:00Z')
// Band van 30 dagen: 31 aug t/m 29 sep. 31 aug 2026 is een maandag, dus de
// eerste week van de band (week 36) is hier een volle week.
const OPTIES = { nu: NU, bandDagen: 30 }

const w = (n: number): Cel => ({ soort: 'waarde', n })
const KLEIN: Cel = { soort: 'klein' }
const VERBORGEN: Cel = { soort: 'verborgen' }
const week = (sleutel: string, actief: Cel, nieuw: Cel = w(0)) => ({ week: sleutel, actief, nieuw })

describe('bouwGebruikTrend', () => {
  it('vergelijkt de laatste volle week met de week daarvoor; de lopende week telt niet mee', () => {
    const t = bouwGebruikTrend(
      [week('2026-W37', w(8)), week('2026-W38', w(9)), week('2026-W39', w(12)), week('2026-W40', w(3))],
      OPTIES,
    )
    expect(t.laatsteVolle?.week).toBe('2026-W39')
    expect(t.daarvoor?.week).toBe('2026-W38')
    expect(t.verschil).toBe(3)
    expect(t.weken.filter((x) => x.lopend).map((x) => x.week)).toEqual(['2026-W40'])
  })

  it('sorteert de weken, ook als de bron ze anders aanlevert', () => {
    const t = bouwGebruikTrend([week('2026-W39', w(12)), week('2026-W37', w(8)), week('2026-W38', w(9))], OPTIES)
    expect(t.weken.map((x) => x.week)).toEqual(['2026-W37', '2026-W38', '2026-W39'])
    expect(t.laatsteVolle?.week).toBe('2026-W39')
  })

  it('een onderdrukte week heeft geen getal, dus ook geen verschil', () => {
    expect(bouwGebruikTrend([week('2026-W38', KLEIN), week('2026-W39', w(12))], OPTIES).verschil).toBeNull()
    expect(bouwGebruikTrend([week('2026-W38', w(9)), week('2026-W39', KLEIN)], OPTIES).verschil).toBeNull()
    expect(bouwGebruikTrend([week('2026-W38', w(9)), week('2026-W39', VERBORGEN)], OPTIES).verschil).toBeNull()
  })

  it('een echte nul is een getal', () => {
    expect(bouwGebruikTrend([week('2026-W38', w(6)), week('2026-W39', w(0))], OPTIES).verschil).toBe(-6)
  })

  it('met alleen de lopende week is er niets om te vergelijken', () => {
    const t = bouwGebruikTrend([week('2026-W40', w(3))], OPTIES)
    expect(t.laatsteVolle).toBeNull()
    expect(t.daarvoor).toBeNull()
    expect(t.verschil).toBeNull()
  })

  it('met één volle week is er een laatste week maar geen verschil', () => {
    const t = bouwGebruikTrend([week('2026-W39', w(12)), week('2026-W40', w(3))], OPTIES)
    expect(t.laatsteVolle?.week).toBe('2026-W39')
    expect(t.daarvoor).toBeNull()
    expect(t.verschil).toBeNull()
  })

  it('geen weken: alles leeg', () => {
    expect(bouwGebruikTrend([], OPTIES)).toEqual({ weken: [], laatsteVolle: null, daarvoor: null, verschil: null })
  })

  it('werkt over de jaargrens: week 53 komt vóór week 1 van het jaar erna', () => {
    const t = bouwGebruikTrend(
      [week('2027-W01', w(7)), week('2026-W53', w(5)), week('2026-W52', w(6))],
      { nu: new Date('2027-01-13T10:00:00Z'), bandDagen: 30 },
    )
    expect(t.weken.map((x) => x.week)).toEqual(['2026-W52', '2026-W53', '2027-W01'])
    expect(t.laatsteVolle?.week).toBe('2027-W01')
    expect(t.verschil).toBe(2)
  })
})
