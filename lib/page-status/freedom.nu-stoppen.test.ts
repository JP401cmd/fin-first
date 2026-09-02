import { describe, it, expect } from 'vitest'
import { resolveFreedomBanner } from './freedom'
import { FREEDOM_BANNER_COPY } from './copy'

/**
 * ADR 0127 D6 — de vrijheidsbanner koos zijn copy met
 * `framing === 'pensioen' ? pensioen : free`. Dat is een BINAIRE keuze op een
 * union die er inmiddels vier heeft, dus 'nu-stoppen' viel op de free-kopij:
 * "Je bent financieel vrij — je hoeft niet meer te werken voor geld." Onder dit
 * anker is dat een uitspraak over de gebruiker in plaats van over zijn geld.
 *
 * De compiler zwijgt hier (beide takken typen als FreedomBannerCopy), vandaar
 * deze test.
 */

describe('resolveFreedomBanner — eindstrategie nu-stoppen', () => {
  const vrij = { freedomPct: 100, currentAge: 47, fireAge: 47 }

  it("kiest de eigen kopij, niet de 'free'-kopij", () => {
    const info = resolveFreedomBanner({ ...vrij, strategy: 'nu-stoppen' })
    expect(info).not.toBeNull()
    expect(info!.title).toBe(FREEDOM_BANNER_COPY['nu-stoppen'].title)
    expect(info!.title).not.toBe(FREEDOM_BANNER_COPY.free.title)
    expect(info!.reason).not.toMatch(/Je bent financieel vrij/i)
  })

  it('blijft beschrijvend: geen aansporing, geen eeuwigheidsclaim', () => {
    const copy = FREEDOM_BANNER_COPY['nu-stoppen']
    for (const zin of [copy.title, copy.reason, copy.remedy]) {
      expect(zin).not.toMatch(/je kunt (nu )?stoppen/i)
      expect(zin).not.toMatch(/oneindig|eeuwig|voorgoed/i)
    }
  })

  it('verschijnt niet zolang de tijdsdekking onder de 100% ligt (D5)', () => {
    // `isFinanciallyFree` blokkeert de leeftijd-trigger onder deze strategie, dus
    // een tekort levert géén banner — die substaat draagt de Vrijheid-strip.
    expect(resolveFreedomBanner({ freedomPct: 38, currentAge: 47, fireAge: 47, strategy: 'nu-stoppen' })).toBeNull()
  })

  it('de andere strategieën houden hun bestaande kopij', () => {
    expect(resolveFreedomBanner({ ...vrij, strategy: 'pensioen' })!.title).toBe(
      FREEDOM_BANNER_COPY.pensioen.title,
    )
    expect(resolveFreedomBanner({ freedomPct: 100, currentAge: 50, fireAge: 48, strategy: 'deplete' })!.title).toBe(
      FREEDOM_BANNER_COPY.free.title,
    )
  })
})
