/**
 * Unit-tests voor de check-in-reeks.
 *
 * De reeks is de enige afleiding boven `completedMonths` uit
 * `app/api/monthly-checkin/route.ts` — deze suite pint het gedrag dat de UI
 * (afsluitmoment + historie-regel) erop bouwt: gat-reset, jaargrens,
 * duplicaten, lege lijst en de drie mijlpalen.
 */
import { describe, it, expect } from 'vitest'
import {
  berekenReeks,
  isReeksMijlpaal,
  reeksTelwoord,
  reeksZin,
  REEKS_MIJLPALEN,
} from './reeks'

/** 15 maart 2026 — willekeurige dag midden in de maand. */
const NU = new Date(2026, 2, 15)

describe('berekenReeks', () => {
  it('geeft 0 bij een lege lijst', () => {
    expect(berekenReeks([], NU)).toBe(0)
  })

  it('geeft 0 wanneer de huidige maand ontbreekt', () => {
    // Wél ingecheckt in januari en februari, niet in maart: de reeks loopt
    // per definitie tot en met nu, dus die is 0 — geen "gebroken"-melding.
    expect(berekenReeks(['2026-01', '2026-02'], NU)).toBe(0)
  })

  it('telt één maand wanneer alleen de huidige maand is afgevinkt', () => {
    expect(berekenReeks(['2026-03'], NU)).toBe(1)
  })

  it('telt aaneengesloten maanden t/m nu', () => {
    expect(berekenReeks(['2026-01', '2026-02', '2026-03'], NU)).toBe(3)
  })

  it('telt vanaf ná een gat', () => {
    // December ontbreekt → alleen januari t/m maart tellen mee.
    expect(
      berekenReeks(['2025-10', '2025-11', '2026-01', '2026-02', '2026-03'], NU),
    ).toBe(3)
  })

  it('loopt over de jaargrens heen (2025-12 → 2026-01)', () => {
    const nu = new Date(2026, 0, 8) // 8 januari 2026
    expect(berekenReeks(['2025-11', '2025-12', '2026-01'], nu)).toBe(3)
  })

  it('verdraagt ongesorteerde invoer', () => {
    expect(berekenReeks(['2026-03', '2026-01', '2026-02'], NU)).toBe(3)
  })

  it('verdraagt duplicaten zonder dubbel te tellen', () => {
    expect(
      berekenReeks(['2026-02', '2026-03', '2026-03', '2026-02'], NU),
    ).toBe(2)
  })

  it('telt de volle 12 maanden die de bron maximaal bewaart', () => {
    const twaalf = Array.from({ length: 12 }, (_, i) =>
      // maart 2026 terug tot april 2025
      new Date(2026, 2 - i, 1),
    ).map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    expect(twaalf).toHaveLength(12)
    expect(berekenReeks(twaalf, NU)).toBe(12)
  })

  it('negeert maandsleutels die niet op de reeks aansluiten', () => {
    expect(berekenReeks(['2026-03', 'onzin', ''], NU)).toBe(1)
  })
})

describe('isReeksMijlpaal', () => {
  it('herkent precies 3, 6 en 12', () => {
    for (const n of REEKS_MIJLPALEN) expect(isReeksMijlpaal(n)).toBe(true)
  })

  it('wijst alle andere lengtes af', () => {
    for (const n of [0, 1, 2, 4, 5, 7, 11, 13]) {
      expect(isReeksMijlpaal(n)).toBe(false)
    }
  })
})

describe('reeksZin / reeksTelwoord', () => {
  it('geeft de erkenningszin bij 3, 6 en 12', () => {
    expect(reeksZin(3)).toBe('Drie maanden op rij ingecheckt.')
    expect(reeksZin(6)).toBe('Zes maanden op rij ingecheckt.')
    expect(reeksZin(12)).toBe('Twaalf maanden op rij ingecheckt.')
  })

  it('geeft null bij elke andere lengte', () => {
    for (const n of [0, 1, 2, 4, 5, 7, 11, 13]) {
      expect(reeksZin(n)).toBeNull()
      expect(reeksTelwoord(n)).toBeNull()
    }
  })

  it('gebruikt hetzelfde telwoord voor kop en zin', () => {
    for (const n of REEKS_MIJLPALEN) {
      const telwoord = reeksTelwoord(n)
      expect(telwoord).toBeTruthy()
      expect(reeksZin(n)).toContain(telwoord as string)
    }
  })

  it('bevat geen schuldtaal of advies', () => {
    for (const n of REEKS_MIJLPALEN) {
      const zin = reeksZin(n) as string
      expect(zin).not.toMatch(/moet|zou moeten|niet vergeten|helaas|jammer/i)
    }
  })
})

describe('cap-interactie — de 12-mijlpaal kan maar één keer vallen', () => {
  it('een 13-maands lijst (de broncap) telt als 13 — geen mijlpaal, geen herhaling', () => {
    // De bron bewaart 13 maanden precies zodat >12-op-rij meetbaar blijft:
    // met een cap van 12 zou maand 13+ als exact 12 lezen en zou "Twaalf op
    // rij" elke volgende maand opnieuw gevierd worden (review 1 sep).
    const nu = new Date(2026, 8, 15) // sep 2026
    const dertien = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(2026, 8 - i, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    expect(berekenReeks(dertien, nu)).toBe(13)
    expect(isReeksMijlpaal(13)).toBe(false)
    expect(isReeksMijlpaal(12)).toBe(true)
  })
})
