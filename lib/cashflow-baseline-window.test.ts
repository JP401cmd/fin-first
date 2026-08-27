/**
 * Regressietests op de twee 6-maands-vensters die uit de pas liepen met hun
 * deler (Notion-kaart "Twee bewuste follow-ups", optie A).
 *
 *  · A1 — de check-in-routes lazen M-6 t/m M = ZEVEN kalendermaanden en deelden
 *    door 6, dus de 6-maands gemiddelden liepen structureel ~14-17 % te hoog.
 *  · A2 — het forecast-baseline-venster was dag-rollend via `setMonth(-6)` +
 *    `toISOString()`, met overflow op een 31e, tijdzone-drift en geen bovengrens.
 *
 * De tests hieronder leggen de gecorrigeerde grenzen vast tegen een GEFIXEERDE
 * `now`, zodat een terugval naar de oude patronen meteen rood wordt.
 */
import { describe, expect, it } from 'vitest'
import { baselineWindow } from '@/lib/cashflow-data-loader'
import { savingsRateDataMonths, savingsRateWindow } from '@/lib/savings-source'

/** Aantal kalendermaanden in [since, until], beide inclusief. */
function monthSpan(since: string, until: string): number {
  const [sy, sm] = since.split('-').map(Number)
  const [uy, um] = until.split('-').map(Number)
  return (uy - sy) * 12 + (um - sm) + 1
}

describe('A2 — forecast-baseline-venster (lib/cashflow-data-loader)', () => {
  it('beslaat exact zes VOLLEDIGE kalendermaanden en sluit de lopende maand uit', () => {
    const { since, until } = baselineWindow(new Date(2026, 7, 26, 12, 0)) // 26 aug 2026
    expect(since).toBe('2026-02-01')
    expect(until).toBe('2026-07-31')
    expect(monthSpan(since, until)).toBe(6)
  })

  it('overleeft een 31e — de oude setMonth-overflow rolde 31-08 door naar 3 maart', () => {
    const { since, until } = baselineWindow(new Date(2026, 7, 31, 12, 0)) // 31 aug 2026
    expect(since).toBe('2026-02-01')
    expect(until).toBe('2026-07-31')
    expect(monthSpan(since, until)).toBe(6)

    // Het patroon dat hier stond, ter documentatie van wát er misging.
    const oud = new Date(2026, 7, 31, 12, 0)
    oud.setMonth(oud.getMonth() - 6)
    expect(oud.getMonth()).toBe(2) // maart i.p.v. februari
    expect(oud.getDate()).toBe(3) // 3 maart — het venster kromp bijna een week
  })

  it('overleeft 31 oktober (de tweede overflow-maand)', () => {
    const { since, until } = baselineWindow(new Date(2026, 9, 31, 12, 0)) // 31 okt 2026
    expect(since).toBe('2026-04-01')
    expect(until).toBe('2026-09-30')
    expect(monthSpan(since, until)).toBe(6)
  })

  it('is tijdzone-veilig om 00:30 lokale tijd — geen toISOString-drift', () => {
    const middernacht = baselineWindow(new Date(2026, 7, 26, 0, 30))
    const middag = baselineWindow(new Date(2026, 7, 26, 12, 0))
    expect(middernacht).toEqual(middag)
    expect(middernacht.since).toBe('2026-02-01')
  })

  it('kruist de jaargrens correct', () => {
    const { since, until } = baselineWindow(new Date(2026, 0, 15, 12, 0)) // 15 jan 2026
    expect(since).toBe('2025-07-01')
    expect(until).toBe('2025-12-31')
    expect(monthSpan(since, until)).toBe(6)
  })

  it('heeft een bovengrens — een toekomstige transactie valt buiten het venster', () => {
    const { until } = baselineWindow(new Date(2026, 7, 26, 12, 0))
    // windowPerspectiveItems filtert op `date > until`.
    expect('2026-12-01' > until).toBe(true)
    expect('2026-08-26' > until).toBe(true) // ook de lopende maand valt eruit
    expect('2026-07-31' > until).toBe(false)
  })
})

describe('A1 — check-in-venster (canonieke savingsRateWindow)', () => {
  it('beslaat ZES kalendermaanden, niet zeven', () => {
    const now = new Date(2026, 7, 26, 12, 0) // 26 aug 2026
    const { fromDate, toDate } = savingsRateWindow(now)
    expect(fromDate).toBe('2026-02-01')
    expect(toDate).toBe('2026-08-01') // exclusieve bovengrens = 1e lopende maand

    // De check-in queryt .gte(fromDate).lt(toDate) → feb t/m juli = 6 maanden.
    expect(monthSpan(fromDate, '2026-07-31')).toBe(6)

    // Het oude venster (currentMonth - 6 t/m einde lopende maand) telde er zeven.
    const oudeOndergrens = '2026-02-01'
    const oudeBovengrens = '2026-08-31'
    expect(monthSpan(oudeOndergrens, oudeBovengrens)).toBe(7)
  })

  it('deler en venster tellen dezelfde maanden — geen 7/6-opblazing meer', () => {
    const now = new Date(2026, 7, 26, 12, 0)
    const { fromDate } = savingsRateWindow(now)
    // Vroegste transactie op de eerste dag IN het venster → volle 6 maanden data.
    expect(savingsRateDataMonths(now, fromDate)).toBe(6)
  })

  it('middelt bij korte historie over de werkelijk verstreken VOLLEDIGE maanden', () => {
    const now = new Date(2026, 7, 26, 12, 0) // augustus
    expect(savingsRateDataMonths(now, '2026-06-10')).toBe(2) // juni + juli
    expect(savingsRateDataMonths(now, '2026-07-02')).toBe(1) // alleen juli
  })

  it('een 7-maands dataset levert het gemiddelde over 6 maanden, niet x7/6', () => {
    const now = new Date(2026, 7, 26, 12, 0)
    const { fromDate, toDate } = savingsRateWindow(now)

    // Eén boeking van 1000 per maand, van M-6 t/m de lopende maand = 7 rijen.
    const rijen = [
      '2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10',
      '2026-06-10', '2026-07-10', '2026-08-10',
    ].map((date) => ({ date, amount: 1000 }))

    const inVenster = rijen.filter((r) => r.date >= fromDate && r.date < toDate)
    expect(inVenster).toHaveLength(6) // de lopende maand valt eruit

    const som = inVenster.reduce((s, r) => s + r.amount, 0)
    const gemiddelde = som / savingsRateDataMonths(now, inVenster[0].date)
    expect(gemiddelde).toBe(1000) // was 7000/6 = 1166,67 — ~17 % te hoog
  })
})
