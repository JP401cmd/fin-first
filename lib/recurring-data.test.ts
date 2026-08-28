import { describe, it, expect } from 'vitest'
import {
  isRecurringExpired,
  getExpectedMonthlyTotal,
  withDerivedDayOfMonth,
  dayOfMonthFromISODate,
  getNextOccurrence,
  getUpcomingTransactions,
  nextOccurrenceFromSchedule,
  monthFromISODate,
  type RecurringTransaction,
} from './recurring-data'

/**
 * Borgt dat een terugkerende regel met een VERSTREKEN einddatum (is_active nog true)
 * niet meer meetelt in het verwachte maandtotaal. Regressie voor de bonus finding
 * uit UAT §2.7 A.9: getExpectedMonthlyTotal controleerde end_date niet.
 */

function makeRecurring(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    account_id: 'a1',
    budget_id: null,
    name: 'Test',
    amount: -100,
    description: null,
    counterparty_name: null,
    frequency: 'monthly',
    day_of_month: 1,
    day_of_week: null,
    start_date: '2020-01-01',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2020-01-01',
    category_override: null,
    ...overrides,
  }
}

describe('isRecurringExpired', () => {
  const ref = new Date(2026, 5, 15) // 15 jun 2026 (lokaal)

  it('is niet verlopen zonder einddatum (NULL telt altijd mee)', () => {
    expect(isRecurringExpired({ end_date: null }, ref)).toBe(false)
  })

  it('is verlopen bij einddatum in het verleden', () => {
    expect(isRecurringExpired({ end_date: '2020-01-01' }, ref)).toBe(true)
  })

  it('is niet verlopen bij einddatum in de toekomst', () => {
    expect(isRecurringExpired({ end_date: '2099-12-31' }, ref)).toBe(false)
  })

  it('einddatum later deze maand telt DEZE maand nog mee (niet verlopen)', () => {
    // vandaag = 15 jun, einddatum = 20 jun → nog niet verstreken
    expect(isRecurringExpired({ end_date: '2026-06-20' }, ref)).toBe(false)
  })
})

describe('getExpectedMonthlyTotal — verstreken einddatum', () => {
  it('sluit een actieve regel met verstreken einddatum uit', () => {
    const rows = [
      makeRecurring({ id: 'a', amount: -100, end_date: null }),
      makeRecurring({ id: 'b', amount: -50, end_date: '2020-01-01' }),
    ]
    // Alleen de lopende -100 telt; het verlopen abonnement -50 niet.
    expect(getExpectedMonthlyTotal(rows)).toBe(-100)
  })

  it('inactieve regel telt sowieso niet mee', () => {
    const rows = [makeRecurring({ amount: -100, is_active: false })]
    expect(getExpectedMonthlyTotal(rows)).toBe(0)
  })

  it('toekomstige einddatum telt gewoon mee', () => {
    const rows = [makeRecurring({ amount: -100, end_date: '2099-12-31' })]
    expect(getExpectedMonthlyTotal(rows)).toBe(-100)
  })
})

describe('dayOfMonthFromISODate — lokaal geparsed (geen UTC-shift)', () => {
  it('leest de dag rechtstreeks uit de string', () => {
    expect(dayOfMonthFromISODate('2026-07-08')).toBe(8)
    expect(dayOfMonthFromISODate('2026-01-31')).toBe(31)
    expect(dayOfMonthFromISODate('2026-06-01T00:00:00Z')).toBe(1)
  })

  it('geeft null bij lege/ongeldige invoer', () => {
    expect(dayOfMonthFromISODate(null)).toBeNull()
    expect(dayOfMonthFromISODate(undefined)).toBeNull()
    expect(dayOfMonthFromISODate('geen datum')).toBeNull()
  })
})

/**
 * Regressie voor de bug "Cashflow kalender toont vaste lasten allemaal op laatste
 * dag van de maand". De AI-abonnementen-detectie sloeg recurrings op met
 * day_of_month = null én een uniforme start_date (de detectie-datum), waardoor
 * getNextOccurrence álle regels op één vaste dag plaatste → samenklonteren op de
 * kalender. withDerivedDayOfMonth leidt de werkelijke incassodag af uit de
 * transactiegeschiedenis, zodat elke post op zíjn eigen dag landt.
 */
describe('withDerivedDayOfMonth — incassodag uit transactiegeschiedenis', () => {
  it('leidt de meest voorkomende dag-van-de-maand af per counterparty', () => {
    const rows = [
      makeRecurring({ id: 'hbo', name: 'HBO', counterparty_name: 'HBO Nordic AB', amount: -8, day_of_month: null }),
    ]
    const tx = [
      { counterparty_name: 'HBO Nordic AB', date: '2026-05-08', amount: -8 },
      { counterparty_name: 'HBO Nordic AB', date: '2026-06-08', amount: -8 },
      { counterparty_name: 'HBO Nordic AB', date: '2026-07-08', amount: -8 },
    ]
    const [out] = withDerivedDayOfMonth(rows, tx)
    expect(out.day_of_month).toBe(8)
  })

  it('plaatst twee regels op verschillende dagen (geen samenklontering)', () => {
    const rows = [
      makeRecurring({ id: 'a', name: 'HBO', counterparty_name: 'HBO', amount: -8, day_of_month: null, start_date: '2026-07-08' }),
      makeRecurring({ id: 'b', name: 'NLziet', counterparty_name: 'NLziet', amount: -6, day_of_month: null, start_date: '2026-07-08' }),
    ]
    const tx = [
      { counterparty_name: 'HBO', date: '2026-06-08', amount: -8 },
      { counterparty_name: 'HBO', date: '2026-07-08', amount: -8 },
      { counterparty_name: 'NLziet', date: '2026-06-20', amount: -6 },
      { counterparty_name: 'NLziet', date: '2026-07-20', amount: -6 },
    ]
    const out = withDerivedDayOfMonth(rows, tx)
    expect(out.find((r) => r.id === 'a')?.day_of_month).toBe(8)
    expect(out.find((r) => r.id === 'b')?.day_of_month).toBe(20)
    // Kern van de bug: ze landen NIET allemaal op dezelfde dag.
    expect(out[0].day_of_month).not.toBe(out[1].day_of_month)
  })

  it('scheidt uitgaven en inkomsten met dezelfde tegenpartij op teken', () => {
    const rows = [
      makeRecurring({ id: 'exp', counterparty_name: 'Werkgever', amount: -100, day_of_month: null }),
      makeRecurring({ id: 'inc', counterparty_name: 'Werkgever', amount: 2500, day_of_month: null }),
    ]
    const tx = [
      { counterparty_name: 'Werkgever', date: '2026-06-05', amount: -100 },
      { counterparty_name: 'Werkgever', date: '2026-06-25', amount: 2500 },
    ]
    const out = withDerivedDayOfMonth(rows, tx)
    expect(out.find((r) => r.id === 'exp')?.day_of_month).toBe(5)
    expect(out.find((r) => r.id === 'inc')?.day_of_month).toBe(25)
  })

  it('valt terug op de dag van start_date zonder matchende transacties', () => {
    const rows = [
      makeRecurring({ counterparty_name: 'Onbekend', amount: -10, day_of_month: null, start_date: '2026-07-14' }),
    ]
    const [out] = withDerivedDayOfMonth(rows, [])
    expect(out.day_of_month).toBe(14)
  })

  it('laat bestaande day_of_month ongemoeid (consume, don\'t recompute)', () => {
    const rows = [makeRecurring({ counterparty_name: 'HBO', day_of_month: 3 })]
    const tx = [{ counterparty_name: 'HBO', date: '2026-06-20', amount: -100 }]
    const [out] = withDerivedDayOfMonth(rows, tx)
    expect(out.day_of_month).toBe(3)
  })
})

/**
 * M21 — de datumheuristiek achter de kalender. `nextOccurrenceFromSchedule` is
 * de ENIGE motor: zowel een bevestigde `recurring_transactions`-rij als een nog
 * niet bevestigde detectie gaat er doorheen. Met injecteerbare `now`, zodat de
 * maandeinde- en kwartaalgevallen deterministisch te pinnen zijn.
 */
describe('nextOccurrenceFromSchedule — maandelijks', () => {
  const monthly = (dayOfMonth: number | null, startDate: string | null = null) => ({
    frequency: 'monthly' as const,
    dayOfMonth,
    dayOfWeek: null,
    startDate,
  })

  it('kiest de incassodag verderop in deze maand', () => {
    const next = nextOccurrenceFromSchedule(monthly(20), new Date(2026, 4, 5))
    expect(next?.toDateString()).toBe(new Date(2026, 4, 20).toDateString())
  })

  it('schuift naar volgende maand zodra de dag geweest is', () => {
    const next = nextOccurrenceFromSchedule(monthly(3), new Date(2026, 4, 5))
    expect(next?.toDateString()).toBe(new Date(2026, 5, 3).toDateString())
  })

  it('behandelt "vandaag" als geweest (de afschrijving van vandaag is geen vooruitblik)', () => {
    const next = nextOccurrenceFromSchedule(monthly(5), new Date(2026, 4, 5))
    expect(next?.toDateString()).toBe(new Date(2026, 5, 5).toDateString())
  })

  it('KLEMT dag 31 op het maandeinde in plaats van door te rollen', () => {
    // Zonder klemming maakte JS van 31 februari 3 maart — een marker in de
    // verkeerde week, en in de verkeerde maand.
    const next = nextOccurrenceFromSchedule(monthly(31), new Date(2026, 1, 10))
    expect(next?.getMonth()).toBe(1)
    expect(next?.getDate()).toBe(28)
  })

  it('klemt op 29 februari in een schrikkeljaar', () => {
    const next = nextOccurrenceFromSchedule(monthly(31), new Date(2028, 1, 10))
    expect(next?.getMonth()).toBe(1)
    expect(next?.getDate()).toBe(29)
  })

  it('valt terug op de dag uit startDate wanneer de incassodag ontbreekt', () => {
    const next = nextOccurrenceFromSchedule(monthly(null, '2025-08-17'), new Date(2026, 4, 5))
    expect(next?.getDate()).toBe(17)
  })

  it('valt terug op dag 1 wanneer er geen enkele historie is', () => {
    const next = nextOccurrenceFromSchedule(monthly(null, null), new Date(2026, 4, 5))
    expect(next?.toDateString()).toBe(new Date(2026, 5, 1).toDateString())
  })
})

describe('nextOccurrenceFromSchedule — kwartaal (fase uit startDate)', () => {
  const quarterly = (dayOfMonth: number, startDate: string | null) => ({
    frequency: 'quarterly' as const,
    dayOfMonth,
    dayOfWeek: null,
    startDate,
  })

  it('houdt de kwartaalfase van het anker aan (jan/apr/jul/okt)', () => {
    // Anker januari, "nu" 20 februari → april, NIET mei. Vóór M21 stapte de
    // motor vanaf de HUIDIGE maand en landde hij een maand mis.
    const next = nextOccurrenceFromSchedule(quarterly(15, '2025-01-15'), new Date(2026, 1, 20))
    expect(next?.getFullYear()).toBe(2026)
    expect(next?.getMonth()).toBe(3)
    expect(next?.getDate()).toBe(15)
  })

  it('pakt de ankermaand zelf zolang de dag nog moet komen', () => {
    const next = nextOccurrenceFromSchedule(quarterly(15, '2025-01-15'), new Date(2026, 0, 5))
    expect(next?.getMonth()).toBe(0)
  })

  it('stapt over de jaargrens heen', () => {
    // Anker oktober-fase, "nu" 20 november → januari volgend jaar.
    const next = nextOccurrenceFromSchedule(quarterly(10, '2024-10-10'), new Date(2026, 10, 20))
    expect(next?.getFullYear()).toBe(2027)
    expect(next?.getMonth()).toBe(0)
  })

  it('werkt met een anker dat in de toekomst ligt', () => {
    const next = nextOccurrenceFromSchedule(quarterly(9, '2026-09-09'), new Date(2026, 4, 5))
    expect(next?.getFullYear()).toBe(2026)
    expect(next?.getMonth()).toBe(8)
  })
})

describe('nextOccurrenceFromSchedule — jaarlijks', () => {
  const yearly = (dayOfMonth: number | null, startDate: string | null) => ({
    frequency: 'yearly' as const,
    dayOfMonth,
    dayOfWeek: null,
    startDate,
  })

  it('gebruikt de ankermaand uit startDate, dit jaar', () => {
    const next = nextOccurrenceFromSchedule(yearly(1, '2020-09-01'), new Date(2026, 4, 5))
    expect(next?.getFullYear()).toBe(2026)
    expect(next?.getMonth()).toBe(8)
  })

  it('schuift een jaar op zodra de datum geweest is', () => {
    const next = nextOccurrenceFromSchedule(yearly(1, '2020-03-01'), new Date(2026, 4, 5))
    expect(next?.getFullYear()).toBe(2027)
    expect(next?.getMonth()).toBe(2)
  })

  it('leest de ankermaand lokaal, niet via UTC-middernacht', () => {
    // `new Date('2020-03-01').getMonth()` kan in een negatieve offset februari
    // teruggeven; stringparsing is maand-stabiel.
    expect(monthFromISODate('2020-03-01')).toBe(2)
    expect(monthFromISODate('2020-01-01')).toBe(0)
    expect(monthFromISODate(null)).toBeNull()
  })
})

describe('nextOccurrenceFromSchedule — wekelijks', () => {
  it('pakt de eerstvolgende weekdag', () => {
    // 5 mei 2026 is een dinsdag (2); volgende vrijdag (5) = 8 mei.
    const next = nextOccurrenceFromSchedule(
      { frequency: 'weekly', dayOfMonth: null, dayOfWeek: 5, startDate: null },
      new Date(2026, 4, 5),
    )
    expect(next?.getDay()).toBe(5)
    expect(next?.toDateString()).toBe(new Date(2026, 4, 8).toDateString())
  })

  it('geeft null zonder weekdag in plaats van een dag te verzinnen', () => {
    const next = nextOccurrenceFromSchedule(
      { frequency: 'weekly', dayOfMonth: null, dayOfWeek: null, startDate: '2026-01-12' },
      new Date(2026, 4, 5),
    )
    expect(next).toBeNull()
  })
})

describe('getNextOccurrence — poorten rondom de motor', () => {
  it('geeft null voor een inactieve regel', () => {
    const r = makeRecurring({ is_active: false })
    expect(getNextOccurrence(r, new Date(2026, 4, 5))).toBeNull()
  })

  it('geeft null voor een verlopen regel', () => {
    const r = makeRecurring({ end_date: '2026-01-01' })
    expect(getNextOccurrence(r, new Date(2026, 4, 5))).toBeNull()
  })

  it('deelt de maandeinde-klemming met de rooster-motor', () => {
    const r = makeRecurring({ day_of_month: 31, frequency: 'monthly' })
    const next = getNextOccurrence(r, new Date(2026, 1, 10))
    expect(next?.getMonth()).toBe(1)
    expect(next?.getDate()).toBe(28)
  })
})

describe('getNextOccurrence — per-regel val-terug op start_date-dag', () => {
  it('gebruikt de dag van start_date wanneer day_of_month ontbreekt (niet dag 1)', () => {
    const r = makeRecurring({ day_of_month: null, start_date: '2020-03-17', frequency: 'monthly' })
    const next = getNextOccurrence(r)
    expect(next?.getDate()).toBe(17)
  })

  it('plaatst regels zonder day_of_month op hun eigen dag i.p.v. samen te klonteren', () => {
    const rows = [
      makeRecurring({ id: 'a', day_of_month: null, start_date: '2020-01-06' }),
      makeRecurring({ id: 'b', day_of_month: null, start_date: '2020-01-21' }),
    ]
    const upcoming = getUpcomingTransactions(rows, 40)
    const days = upcoming.map((u) => u.nextDate.getDate())
    expect(new Set(days).size).toBe(2)
  })
})
