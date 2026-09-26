/**
 * Eindlabels rechtsboven in de vermogensgrafiek botsen niet (ADR 0179 fase 4, meting
 * 27 sep op 390 px: "koopkracht €3,8M", "€940k nu" en het doelbedrag liepen door elkaar).
 */
import { describe, it, expect } from 'vitest'
import { ontwarKoopkrachtLabel } from './chart-static-layers'

const basis = { rechtsX: 340, isDesktop: false, onderGrens: 240 }

describe('ontwarKoopkrachtLabel', () => {
  it('geen botsing: positie en "nu"-regel ongewijzigd', () => {
    expect(ontwarKoopkrachtLabel({ ...basis, koopY: 120, koopX: 338, doelLabelYs: [40] })).toEqual({ koopY: 120, toonNu: true })
  })

  it('links van de doellabels: nooit een botsing, ook op dezelfde hoogte', () => {
    expect(ontwarKoopkrachtLabel({ ...basis, koopY: 40, koopX: 200, doelLabelYs: [40] })).toEqual({ koopY: 40, toonNu: true })
  })

  it('smal scherm, botsing: onder het doellabel (woord + bedrag) en zonder "nu"-regel', () => {
    const uit = ontwarKoopkrachtLabel({ ...basis, koopY: 30, koopX: 338, doelLabelYs: [26] })
    expect(uit.toonNu).toBe(false)
    // doellabel: woord op 26, bedrag op 39 → het koopkrachtlabel komt daaronder, op 50.
    expect(uit.koopY).toBe(26 + 13 + 11)
    // en botst dan niet meer met de doelband [15, 42]
    expect(uit.koopY - 8).toBeGreaterThan(26 + 13)
  })

  it('desktop, botsing: verschuift, maar de "nu"-regel blijft', () => {
    const uit = ontwarKoopkrachtLabel({ ...basis, isDesktop: true, koopY: 30, koopX: 338, doelLabelYs: [26] })
    expect(uit).toEqual({ koopY: 50, toonNu: true })
  })

  it('twee doellabels (met en zonder je huis): onder het laagste botsende', () => {
    const uit = ontwarKoopkrachtLabel({ ...basis, koopY: 50, koopX: 338, doelLabelYs: [30, 52] })
    expect(uit.koopY).toBe(52 + 24)
  })

  it('nooit onder de plot', () => {
    const uit = ontwarKoopkrachtLabel({ ...basis, koopY: 230, koopX: 338, doelLabelYs: [228] })
    expect(uit.koopY).toBe(240)
  })
})
