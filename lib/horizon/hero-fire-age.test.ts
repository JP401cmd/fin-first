/**
 * Bevinding C1 — "het kernantwoord van de app verschilt per laadbeurt".
 *
 * Deze suite pint de enige plek vast waar nog besloten wordt WELK getal de
 * hero-KPI van /toekomst toont. De bevinding was niet dat één getal fout was:
 * alle drie de getallen waren op zichzelf verdedigbaar. De fout was dat drie
 * bronnen op dezelfde plek mochten antwoorden en de gebruiker niet kon zien
 * welke hij las. De tests hieronder bewaken daarom twee dingen tegelijk: welk
 * getal wint, én dat een niet-definitief getal ook als zodanig herkenbaar is.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveHeroFireAge,
  formatHeroFireAge,
  heroFireAgeCaption,
  isHeroAnswerPending,
} from './hero-fire-age'

describe('resolveHeroFireAge — welk getal wint', () => {
  it('de kernel wint van een eerder snapshot-antwoord', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 52.9,
      snapshotFireAge: 67,
    })
    expect(state).toEqual({ status: 'definitief', age: 52.9, bron: 'kernel' })
  })

  it('valt binnen de kernel terug op de hele-jaren-leeftijd als de fractionele ontbreekt', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: null,
      kernelFireAge: 53,
    })
    expect(state).toEqual({ status: 'definitief', age: 53, bron: 'kernel' })
  })

  it('kernel klaar zonder leeftijd = "niet haalbaar" → onbekend, GEEN tweede getal', () => {
    // Dit is de kern van de bevinding: hier stond eerder `fire.fireAge` uit
    // computeFireProjection — een tweede motor die wél een getal gaf terwijl de
    // canonieke motor "niet haalbaar" zei.
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: null,
      kernelFireAge: null,
      snapshotFireAge: 61.6,
    })
    expect(state).toEqual({ status: 'onbekend', age: null, bron: null })
  })

  it('zonder kernel-resultaat toont het snapshot-antwoord, maar als VOORLOPIG', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: false,
      snapshotFireAge: 61.6,
      isRefining: true,
    })
    expect(state).toEqual({ status: 'voorlopig', age: 61.6, bron: 'snapshot' })
    expect(isHeroAnswerPending(state)).toBe(true)
  })

  it('zonder kernel-resultaat en zonder snapshot: berekenen zolang de worker draait', () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, isRefining: true })).toEqual({
      status: 'berekenen',
      age: null,
      bron: null,
    })
  })

  it('zonder kernel-resultaat en zonder lopende run: onbekend', () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, isRefining: false })).toEqual({
      status: 'onbekend',
      age: null,
      bron: null,
    })
  })

  it('negeert een niet-eindig getal uit welke bron dan ook', () => {
    expect(resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: NaN }).status).toBe('onbekend')
    expect(
      resolveHeroFireAge({ hasKernelResult: false, snapshotFireAge: Infinity, isRefining: false }).status,
    ).toBe('onbekend')
  })
})

describe('resolveHeroFireAge — pensioen-modus (de "exact 67"-tak)', () => {
  it('markeert de AOW-leeftijd als voorlopig zolang de wettelijke tabel niet geladen is', () => {
    // `lookupAowAge` valt zonder tabel terug op NL_AOW_AGE = 67. Dat is precies
    // het getal dat in de bevinding op één laadbeurt verscheen. Het mag getoond
    // worden, maar niet als eindantwoord.
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      isPensioenMode: true,
      aowAgeFractional: 67,
      aowTableLoaded: false,
    })
    expect(state).toEqual({ status: 'voorlopig', age: 67, bron: 'aow-tabel' })
  })

  it('is definitief zodra de wettelijke tabel geladen is', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      isPensioenMode: true,
      aowAgeFractional: 67.25,
      aowTableLoaded: true,
    })
    expect(state).toEqual({ status: 'definitief', age: 67.25, bron: 'aow-tabel' })
  })

  it('pensioen-modus zonder AOW-leeftijd = berekenen (nooit een FIRE-getal in de plaats)', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      isPensioenMode: true,
      aowAgeFractional: null,
      kernelFireAgeFractional: 52.9,
    })
    expect(state.status).toBe('berekenen')
    expect(state.age).toBeNull()
  })
})

describe('resolveHeroFireAge — determinisme (de eigenlijke klacht)', () => {
  it('dezelfde invoer geeft altijd hetzelfde antwoord', () => {
    const input = {
      hasKernelResult: true as const,
      kernelFireAgeFractional: 52.9,
      snapshotFireAge: 67,
      isRefining: false,
    }
    expect(resolveHeroFireAge(input)).toEqual(resolveHeroFireAge(input))
  })

  it('het antwoord ná settle is onafhankelijk van wat er tijdens het laden stond', () => {
    // Twee laadbeurten met identieke gegevens, maar een verschillend
    // tussenstadium (snel: meteen kernel; traag: eerst snapshot). Na settle moet
    // het getal identiek zijn — dat is precies wat de tester bij 3-5x herladen
    // NIET zag.
    const snel = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: 52.9 })
    const traagTussenstand = resolveHeroFireAge({
      hasKernelResult: false,
      snapshotFireAge: 67,
      isRefining: true,
    })
    const traagNaSettle = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 52.9,
      snapshotFireAge: 67,
    })

    expect(traagNaSettle).toEqual(snel)
    // ...en de tussenstand was herkenbaar als tussenstand.
    expect(isHeroAnswerPending(traagTussenstand)).toBe(true)
    expect(isHeroAnswerPending(traagNaSettle)).toBe(false)
  })
})

describe('formatHeroFireAge / heroFireAgeCaption', () => {
  it('toont een FIRE-leeftijd met één decimaal', () => {
    expect(formatHeroFireAge({ status: 'definitief', age: 52.94, bron: 'kernel' })).toBe('52.9')
  })

  it('toont de voorgeformatteerde AOW-tekst bij bron aow-tabel', () => {
    expect(
      formatHeroFireAge({ status: 'definitief', age: 67.25, bron: 'aow-tabel' }, { aowText: '67j + 3m' }),
    ).toBe('67j + 3m')
  })

  it('gebruikt het per-oppervlak meegegeven streepje bij geen antwoord', () => {
    expect(formatHeroFireAge({ status: 'onbekend', age: null, bron: null }, { dash: '-' })).toBe('-')
    expect(formatHeroFireAge({ status: 'onbekend', age: null, bron: null })).toBe('–')
  })

  it('toont een reken-tekst i.p.v. een getal zolang er geen antwoord is', () => {
    expect(formatHeroFireAge({ status: 'berekenen', age: null, bron: null })).toBe('berekenen…')
    expect(
      formatHeroFireAge({ status: 'berekenen', age: null, bron: null }, { pendingText: '···' }),
    ).toBe('···')
  })

  it('markeert een voorlopig antwoord in het onderschrift', () => {
    expect(heroFireAgeCaption({ status: 'voorlopig', age: 61.6, bron: 'snapshot' }, 'jaar')).toBe('jaar · voorlopig')
    expect(heroFireAgeCaption({ status: 'berekenen', age: null, bron: null }, 'jaar')).toBe('wordt berekend…')
    expect(heroFireAgeCaption({ status: 'definitief', age: 52.9, bron: 'kernel' }, 'jaar')).toBe('jaar')
  })
})
