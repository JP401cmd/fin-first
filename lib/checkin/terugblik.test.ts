// lib/checkin/terugblik.test.ts
//
// Unit-tests voor terugblikCijfers() — welke maand de terugblik-stap van de
// check-in toont, en waartegen hij vergelijkt.
//
// Laag: Vitest — pure module, geen IO/React.

import { describe, it, expect } from 'vitest'
import { terugblikCijfers, type TerugblikBron } from './terugblik'

/** September loopt net; augustus is de maand waar de terugblik over gaat. */
const bron: TerugblikBron = {
  prevMonthLabel: 'augustus',
  monthBeforePrevLabel: 'juli',
  prevMonthIncome: 4200,
  prevMonthExpenses: 3100,
  prevMonthSavings: 1100,
  monthBeforePrevExpenses: 2800,
}

describe('terugblikCijfers — de terugblik gaat over de AFGELOPEN maand (B-016)', () => {
  // Given: het is 4 september; van september staan er nog maar een paar dagen
  //   aan boekingen (€ 0 inkomen, € 97 uitgaven), augustus is compleet.
  // When: de gebruiker de check-in opent en de stap "Terugblik augustus" ziet.
  // Then: de kaarten tonen de cijfers van AUGUSTUS. Vóór de fix vulde de stap
  //   zich met de lopende maand, waardoor de kop augustus zei en de bedragen
  //   september waren.
  it('neemt inkomen, uitgaven en gespaard van de afgelopen maand', () => {
    const cijfers = terugblikCijfers(bron)
    expect(cijfers.income).toBe(4200)
    expect(cijfers.expenses).toBe(3100)
    expect(cijfers.savings).toBe(1100)
  })

  it('draagt het label van de maand waar de terugblik over gaat', () => {
    expect(terugblikCijfers(bron).label).toBe('augustus')
  })

  it('valt terug op een neutrale aanduiding als het maandlabel ontbreekt', () => {
    expect(terugblikCijfers({ ...bron, prevMonthLabel: '' }).label).toBe('afgelopen maand')
  })
})

describe('terugblikCijfers — de vergelijking loopt één maand verder terug', () => {
  // De kop zegt augustus, dus "t.o.v. vorige maand" betekent hier juli — niet
  // september. Anders vergelijkt het percentage twee maanden die allebei niet
  // de maand van de kop zijn.
  it('zet de uitgaven van augustus af tegen juli', () => {
    // 3100 t.o.v. 2800 = +10,714…%
    const cijfers = terugblikCijfers(bron)
    expect(cijfers.expenseChangePct).toBeCloseTo(10.714, 3)
    expect(cijfers.changeLabel).toBe('t.o.v. juli')
  })

  it('daling geeft een negatief percentage', () => {
    const cijfers = terugblikCijfers({ ...bron, prevMonthExpenses: 2100 })
    expect(cijfers.expenseChangePct).toBeCloseTo(-25, 6)
  })

  it('geen vergelijkingsmaand (0 uitgaven in juli) → geen percentage, geen label', () => {
    const cijfers = terugblikCijfers({ ...bron, monthBeforePrevExpenses: 0 })
    expect(cijfers.expenseChangePct).toBeNull()
    expect(cijfers.changeLabel).toBeNull()
  })

  it('negatieve of onzinnige vergelijkingsbasis → geen percentage', () => {
    expect(terugblikCijfers({ ...bron, monthBeforePrevExpenses: -50 }).expenseChangePct).toBeNull()
    expect(
      terugblikCijfers({ ...bron, monthBeforePrevExpenses: Number.NaN }).expenseChangePct,
    ).toBeNull()
  })

  it('zonder label van de vergelijkingsmaand blijft het percentage weg', () => {
    // Een percentage zonder te zeggen waartegen, is precies de verwarring die
    // deze bug veroorzaakte. Liever niets tonen.
    const cijfers = terugblikCijfers({ ...bron, monthBeforePrevLabel: '' })
    expect(cijfers.changeLabel).toBeNull()
    expect(cijfers.expenseChangePct).toBeNull()
  })
})

describe('terugblikCijfers — nul-waarden zijn echte waarden', () => {
  it('een maand zonder inkomen levert 0, niet null', () => {
    const cijfers = terugblikCijfers({ ...bron, prevMonthIncome: 0, prevMonthSavings: -3100 })
    expect(cijfers.income).toBe(0)
    expect(cijfers.savings).toBe(-3100)
  })

  it('ontbrekende bedragen tellen als 0', () => {
    const cijfers = terugblikCijfers({
      ...bron,
      prevMonthIncome: undefined as unknown as number,
      prevMonthExpenses: undefined as unknown as number,
      prevMonthSavings: undefined as unknown as number,
    })
    expect(cijfers.income).toBe(0)
    expect(cijfers.expenses).toBe(0)
    expect(cijfers.savings).toBe(0)
  })
})
